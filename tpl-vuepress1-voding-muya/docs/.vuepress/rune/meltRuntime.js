// ============================================================================
// melt-js（hel-micro）远程 Vue2 组件运行时
//
// 复用桌面端 meltRuneHost 的加载协议，但只保留博客端需要的部分：
//   dep(host=hel-meta.json) → resolveHelDep → createHelLoader →
//   createHelComponentResource → 拿到远端 Vue2 组件。
//
// 关键点：
//   1. 必须先 bindVueRuntime({ Vue })，否则远端包会自己 new 一个 Vue，
//      响应式、组件注册、事件都会串味；
//   2. 加载只发生在 mounted 之后，SSR 构建期不发起任何网络请求；
//   3. 远端导出若是 Vue3 组件（setup/__vccOpts），直接报可读错误，
//      避免渲染出空壳。
// ============================================================================

import Vue from 'vue'
import { parseMeltRuneConfig } from 'libs-muya-vue2/lib/rune/runeDefinition'

let libsPromise = null
let vueRuntimeBound = false

async function loadMeltLibs () {
  if (!libsPromise) {
    libsPromise = import(/* webpackChunkName: "rune-melt" */ '@melt-js/libs-core-vue2').then(mod => {
      const libs = mod && mod.createHelComponentResource ? mod : (mod && mod.default)
      if (!libs || typeof libs.createHelComponentResource !== 'function') {
        throw new Error('@melt-js/libs-core-vue2 未导出 createHelComponentResource')
      }
      if (!vueRuntimeBound && typeof libs.bindVueRuntime === 'function') {
        libs.bindVueRuntime({ Vue })
        vueRuntimeBound = true
      }
      return libs
    })
  }
  return libsPromise
}

function describeFrameworkMismatch (component) {
  if (!component || (typeof component !== 'object' && typeof component !== 'function')) {
    return '远端导出不是组件'
  }
  if (component.__vccOpts || component.setup) {
    return '该包是 Vue3 组件（请换 comps-vue2-* 系列）'
  }
  return ''
}

function normalizeEmitValue (raw) {
  if (raw && typeof raw === 'object' && 'target' in raw && raw.target) {
    return raw.target.value == null ? '' : String(raw.target.value)
  }
  return raw == null ? '' : String(raw)
}

/**
 * melt-js 定义 → 自带 loading / error 状态的 Vue2 壳构造器。
 * 返回构造器是同步的（加载异步），符合宿主 `:is` 直接使用的要求。
 */
export async function createMeltCtor (rune = {}) {
  const config = parseMeltRuneConfig(rune)
  if (!config) throw new Error('不是合法的 melt-js 定义（template 不是带 $type 的 JSON）')
  if (!config.dep.name) throw new Error('melt-js 定义缺少 dep.name')
  if (config.dep.type === 'custom' && !config.dep.host) throw new Error('custom 来源缺少 dep.host')

  const libs = await loadMeltLibs()
  const { resolveHelDep, createHelLoader, createHelComponentResource } = libs
  const dep = config.dep

  const ref = dep.version ? `${dep.name}@${dep.version}` : dep.name
  const spec = dep.host
    ? resolveHelDep({ name: dep.name, host: dep.host })
    : resolveHelDep(ref, { type: dep.type || 'unpkg' })
  if (dep.platform) spec.platform = dep.platform
  if (dep.requiredExports && dep.requiredExports.length) spec.requiredExports = dep.requiredExports.slice()

  const loader = createHelLoader()
  const valueEvent = config.valueEvent || 'input'

  const ctor = Vue.extend({
    name: `MeltRune${String(config.exportName || 'Remote').replace(/[^A-Za-z0-9]/g, '')}`,
    props: {
      value: { type: [String, Number], default: '' },
      runeId: { type: String, default: '' },
      nodeId: { type: String, default: '' },
      rune: { type: Object, default: null }
    },
    data () {
      return {
        status: 'loading',
        component: null,
        error: null,
        mismatch: ''
      }
    },
    created () {
      this.resource = createHelComponentResource({
        exportName: config.exportName,
        // 每次 load 都走同一个 loader，hel 自己负责请求合并与内存缓存
        loader: () => loader.loadHelLib(spec)
      }, state => {
        this.status = state.status
        this.component = state.component
        this.error = state.error
        if (state.status === 'ready') {
          this.mismatch = describeFrameworkMismatch(state.component)
        }
      })
      this.resource.load()
    },
    beforeDestroy () {
      if (this.resource && typeof this.resource.dispose === 'function') this.resource.dispose()
    },
    errorCaptured (error) {
      this.status = 'error'
      this.error = error
      return false
    },
    methods: {
      retry () {
        this.status = 'loading'
        this.error = null
        this.mismatch = ''
        if (this.resource && typeof this.resource.load === 'function') this.resource.load()
      },
      handleValueEmit (raw) {
        this.$emit('input', normalizeEmitValue(raw))
      }
    },
    render (h) {
      if (this.mismatch) {
        return h('div', { class: 'ag-rune-live__message ag-rune-live__message--error' }, [
          `${config.exportName}：${this.mismatch}`
        ])
      }
      if (this.status === 'error') {
        const text = this.error && this.error.message ? this.error.message : String(this.error || '加载失败')
        return h('div', { class: 'ag-rune-live__message ag-rune-live__message--error' }, [
          h('span', {}, `${config.exportName} 加载失败：${text}`),
          h('button', {
            attrs: { type: 'button' },
            class: 'ag-rune-live__retry',
            on: { click: this.retry }
          }, '重试')
        ])
      }
      if (this.status !== 'ready' || !this.component) {
        return h('div', { class: 'ag-rune-live__message' }, [`正在从远端加载 ${config.exportName}…`])
      }
      const props = { [config.valueProp || 'value']: this.value == null ? '' : String(this.value) }
      Object.entries(config.props || {}).forEach(([name, def]) => {
        if (def && Object.prototype.hasOwnProperty.call(def, 'default')) props[name] = def.default
      })
      return h(this.component, {
        class: 'ag-rune-live__remote',
        props,
        on: { [valueEvent]: this.handleValueEmit }
      })
    }
  })

  return ctor
}


// 启动期预热：把目录里的 melt-js 定义按依赖合并，各拉一次 hel 资源。
// 不挂载组件、不影响 SSR；失败只 warn，真正渲染时仍走 createMeltCtor 的重试链路。
const preloadLoaders = new Map()

export async function preloadMeltRunes (runes = []) {
  const configs = []
  ;(Array.isArray(runes) ? runes : []).forEach(rune => {
    try {
      const config = parseMeltRuneConfig(rune)
      if (config && config.dep && config.dep.name) configs.push(config)
    } catch (error) {
      // 非 melt-js 定义（普通 SFC 符文）直接跳过
    }
  })
  if (!configs.length) return []
  const libs = await loadMeltLibs()
  const { resolveHelDep, createHelLoader } = libs
  const tasks = configs.map(config => {
    const dep = config.dep
    const ref = dep.version ? dep.name + '@' + dep.version : dep.name
    const spec = dep.host
      ? resolveHelDep({ name: dep.name, host: dep.host })
      : resolveHelDep(ref, { type: dep.type || 'unpkg' })
    if (dep.platform) spec.platform = dep.platform
    if (dep.requiredExports && dep.requiredExports.length) spec.requiredExports = dep.requiredExports.slice()
    const key = [dep.platform || '', dep.name || '', dep.version || '', dep.host || dep.type || ''].join('|')
    let loader = preloadLoaders.get(key)
    if (!loader) {
      loader = createHelLoader()
      preloadLoaders.set(key, loader)
    }
    return loader.loadHelLib(spec).catch(error => {
      console.warn('[melt-preload] failed', config.exportName, error)
    })
  })
  return Promise.all(tasks)
}

export default { createMeltCtor, preloadMeltRunes }
