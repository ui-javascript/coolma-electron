// ============================================================================
// src/components/rune/meltRuneHost.js
//
// melt-js 远端组件卡片的「壳」：把 `$type: "melt-js"` 的符文定义变成一个
// 同步可用的 Vue 组件构造器（加载是异步的，但构造是同步的，符合
// mountRuneVueHosts / RunePreviewRenderer 对 ctor 的同步要求）。
//
// 职责边界：
//   - 只做「加载 / 状态 / 类型强转 / 事件回写 / 引用计数释放」，不碰 Muya；
//   - 取值（宿主 DOM 上的 data-rune-prop-* 与自然属性）由 libs 的
//     collectRunePropsFromHost 完成，这里只消费已经归一的 props；
//   - 远端组件必须由 props 驱动（renderKey 含 innerText，value 变会重建 vm，
//     组件内部状态保不住，见 .agents/plans/符文melt-js接入方案.plan.md 3.5）。
//
// 为什么不直接 defineHelComponent：
//   - 它没有类型强转、没有资源池引用计数；
//   - 它的 loading / error 视觉与符文卡片不一致。
//   所以我们用 @melt-js/libs-core-vue2 更底层的 createHelComponentResource，
//   自己实现壳。加载/地址解析/导出校验这些坑最多的地方仍交给上游。
// ============================================================================

import Vue from 'vue'
import {
  parseMeltRuneConfig,
  validateMeltRuneConfig,
  RUNE_TYPE_MELT_JS
} from 'libs-muya-vue2/lib/rune/runeDefinition'

const LOG_PREFIX = '[melt-rune]'

// 懒加载依赖：@melt-js/libs-core-vue2 是 ESM 包，测试环境里如果没 mock 会解析失败，
// 放到函数里 require 可以让「不碰 melt 路径」的测试完全不受影响。
let meltLibs = null
function loadMeltLibs () {
  if (!meltLibs) {
    // eslint-disable-next-line global-require
    meltLibs = require('@melt-js/libs-core-vue2')
  }
  return meltLibs
}

// 资源池：同一依赖 + 同一导出名，N 个符文实例共享一次加载。
// key 里的 origin 区分「同包名不同地址」（unpkg 与自建站点是两个来源）。
const resourcePool = new Map()
// 壳组件缓存：定义（含 schema）变了才重建，避免每次 render 都 Vue.extend。
const ctorCache = new Map()

const stableStringify = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

// 配置 → 资源池 key（platform 也参与，因为 hel 的 platform 决定拉哪份产物）
export function getMeltResourceKey (config) {
  if (!config) return ''
  const dep = config.dep || {}
  const origin = dep.host || dep.type || ''
  return [dep.platform || '', dep.name || '', dep.version || '', origin, config.exportName || ''].join('|')
}

// 配置 → hel 的加载描述（先解析地址，再补 platform / requiredExports）
export function buildMeltLoadSpec (config) {
  const { resolveHelDep } = loadMeltLibs()
  const dep = config.dep || {}
  const ref = dep.version ? `${dep.name}@${dep.version}` : dep.name
  const options = { type: dep.type || 'unpkg' }
  if (dep.host) options.base = dep.host
  const spec = resolveHelDep(ref, options)
  if (dep.platform) spec.platform = dep.platform
  if (dep.requiredExports && dep.requiredExports.length) spec.requiredExports = dep.requiredExports.slice()
  return spec
}

function acquireResource (config, onChange) {
  const key = getMeltResourceKey(config)
  let entry = resourcePool.get(key)
  if (entry) {
    entry.refs++
  } else {
    const { createHelComponentResource } = loadMeltLibs()
    const resource = createHelComponentResource({
      dep: buildMeltLoadSpec(config),
      exportName: config.exportName
    }, state => {
      const current = resourcePool.get(key)
      if (current) current.state = state
      if (current) current.listeners.forEach(fn => fn(state))
    })
    entry = { resource, refs: 1, state: resource.getState(), listeners: new Set() }
    resourcePool.set(key, entry)
  }
  const listener = state => onChange(state)
  entry.listeners.add(listener)
  return { entry, key, listener }
}

function releaseResource (key, listener) {
  const entry = resourcePool.get(key)
  if (!entry) return
  entry.listeners.delete(listener)
  entry.refs--
  if (entry.refs <= 0) {
    try {
      entry.resource.dispose()
    } catch (error) {
      console.warn(`${LOG_PREFIX} dispose failed`, error)
    }
    resourcePool.delete(key)
  }
}

// 测试钩子：清空池与缓存（不对外承诺稳定 API）
export function clearMeltRuneCaches () {
  resourcePool.forEach(entry => {
    try {
      entry.resource.dispose()
    } catch (_error) { /* noop */ }
  })
  resourcePool.clear()
  ctorCache.clear()
}

// 把宿主传来的字符串/布尔值按 schema 类型强转；空值走 undefined，交给远端组件 default。
export function coerceMeltProp (raw, def = {}) {
  const type = String(def.type || 'string').toLowerCase()
  if (raw === undefined || raw === null || raw === '') {
    return undefined
  }
  if (type === 'number') {
    const num = Number(raw)
    return Number.isFinite(num) ? num : undefined
  }
  if (type === 'boolean') {
    if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true
    if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false
    return undefined
  }
  if (type === 'json') {
    if (typeof raw === 'object') return raw
    try {
      return JSON.parse(String(raw))
    } catch (_error) {
      return undefined
    }
  }
  return String(raw)
}

// 远端组件 emit 出来的值可能是「值」也可能是「事件对象」，统一成字符串
export function normalizeMeltEmitValue (raw) {
  if (raw && typeof raw === 'object' && 'target' in raw && raw.target) {
    return raw.target.value == null ? '' : String(raw.target.value)
  }
  return raw == null ? '' : String(raw)
}

// 判断导出是不是 Vue 2 组件；顺带拦掉 Vue 3 组件包，给出可读的错因
function describeFrameworkMismatch (component) {
  if (!component || (typeof component !== 'object' && typeof component !== 'function')) {
    return '远端导出不是组件'
  }
  if (component.__vccOpts || component.setup) {
    return '该包是 Vue 3 组件（请换 comps-vue2-* 系列）'
  }
  return ''
}

const SKELETON_STYLE = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:rgba(38,166,154,0.08);color:rgba(0,0,0,0.45);font-size:12px;'
const ERROR_STYLE = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:rgba(255,82,82,0.08);color:#c62828;font-size:12px;'

function renderMessage (h, { style, text, retry, state = 'loading' }) {
  const children = [
    h('span', {}, text)
  ]
  if (typeof retry === 'function') {
    children.push(h('button', {
      attrs: { type: 'button', contenteditable: 'false' },
      style: 'border:none;background:transparent;color:inherit;text-decoration:underline;cursor:pointer;font-size:12px;padding:0;',
      on: { click: retry }
    }, '重试'))
  }
  return h('div', {
    attrs: { contenteditable: 'false', 'data-melt-rune-state': state },
    style
  }, children)
}

// 主工厂：melt 定义 → Vue 组件构造器；不是 melt 定义返回 null
export function createMeltRuneRendererCtor (rune = {}) {
  const config = parseMeltRuneConfig(rune)
  if (!config) return null
  const cacheKey = `${rune.id || rune.name || 'default'}:${stableStringify(config)}`
  if (ctorCache.has(cacheKey)) return ctorCache.get(cacheKey)

  const schema = config.props || {}
  const propNames = Object.keys(schema)
  const valueProp = config.valueProp || 'value'
  const valueEvent = config.valueEvent || 'input'
  const errors = validateMeltRuneConfig(config)
  const loadErrors = errors.map(item => `${item.field}: ${item.message}`)
  // 配置坏掉也给出壳：用户能看到「哪条定义有问题」，比退回空白占位卡片好排查
  const invalidReason = loadErrors.length ? `melt-js 定义不合法（${loadErrors.join('；')}）` : ''

  const propsDefinition = {
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune: { type: Object, default: null },
    value: { type: [String, Number], default: '' },
    onValueChange: { type: Function, default: null }
  }
  propNames.forEach(name => {
    if (name === valueProp) return
    propsDefinition[name] = { default: undefined }
  })

  const ctor = Vue.extend({
    // Vue 会校验组件名（不允许括号等符号），统一成 MeltRune + PascalCase
    name: `MeltRune${String(config.exportName || 'Unknown').replace(/[^A-Za-z0-9]/g, '') || 'Unknown'}`,
    props: propsDefinition,
    data () {
      return {
        state: { status: 'loading', component: null, error: null },
        failureReason: invalidReason
      }
    },
    created () {
      if (invalidReason) {
        this.failureReason = invalidReason
        return
      }
      try {
        const acquired = acquireResource(config, state => { this.state = state })
        this.__meltResourceKey = acquired.key
        this.__meltResourceListener = acquired.listener
        acquired.entry.resource.load()
      } catch (error) {
        console.warn(`${LOG_PREFIX} acquire failed`, error)
        this.failureReason = `melt-js 运行时不可用：${error && error.message ? error.message : error}`
      }
    },
    beforeDestroy () {
      if (this.__meltResourceKey && this.__meltResourceListener) {
        releaseResource(this.__meltResourceKey, this.__meltResourceListener)
        this.__meltResourceKey = ''
        this.__meltResourceListener = null
      }
    },
    methods: {
      buildProps () {
        const out = {}
        propNames.forEach(name => {
          const coerced = coerceMeltProp(this[name], schema[name] || {})
          if (coerced !== undefined) out[name] = coerced
        })
        if (valueProp) {
          const current = this.value == null ? '' : String(this.value)
          out[valueProp] = current
        }
        return out
      },
      handleValueEmit (raw) {
        const nextValue = normalizeMeltEmitValue(raw)
        if (typeof this.onValueChange === 'function') {
          this.onValueChange({
            runeId: this.runeId,
            nodeId: this.nodeId,
            value: nextValue
          })
        }
        this.$emit('input', nextValue)
      },
      retryLoad () {
        const entry = resourcePool.get(getMeltResourceKey(config))
        if (entry && typeof entry.resource.retry === 'function') {
          this.state = { status: 'loading', component: null, error: null }
          entry.resource.retry()
        }
      }
    },
    render (h) {
      const state = this.state || {}
      const failure = this.failureReason || ''
      if (failure) {
        return renderMessage(h, { style: ERROR_STYLE, text: failure, state: 'error' })
      }
      if (state.status === 'loading') {
        return renderMessage(h, { style: SKELETON_STYLE, text: `正在加载远端组件 ${config.exportName}…` })
      }
      if (state.status === 'error') {
        const errorText = state.error && state.error.message ? state.error.message : String(state.error || '加载失败')
        return renderMessage(h, { style: ERROR_STYLE, text: `${config.exportName} 加载失败：${errorText}`, retry: this.retryLoad, state: 'error' })
      }

      const mismatch = describeFrameworkMismatch(state.component)
      if (mismatch) {
        return renderMessage(h, { style: ERROR_STYLE, text: `${config.exportName}：${mismatch}`, state: 'error' })
      }

      const on = {}
      if (valueEvent) on[valueEvent] = this.handleValueEmit
      return h(state.component, {
        class: 'melt-rune-host',
        style: config.style || undefined,
        props: this.buildProps(),
        on
      })
    }
  })

  ctorCache.set(cacheKey, ctor)
  return ctor
}

export const MELT_RUNE_TYPE = RUNE_TYPE_MELT_JS

export default {
  createMeltRuneRendererCtor,
  getMeltResourceKey,
  buildMeltLoadSpec,
  coerceMeltProp,
  normalizeMeltEmitValue,
  clearMeltRuneCaches
}
