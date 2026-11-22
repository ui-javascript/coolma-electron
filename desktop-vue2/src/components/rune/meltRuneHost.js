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
import { loadRuneSources, resolveDepFromSources } from 'libs-muya-vue2/lib/rune/runeSourceRegistry'
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
// dep 级 loader 缓存：同一个依赖只建一个 hel loader（自带请求合并与内存缓存）。
// key = platform|name|version|host，刷新某个 dep 时只丢它自己的 loader。
const depLoaderCache = new Map()
// 刷新世代：每次点「刷新」+1，资源池 key 变新，旧实例继续用旧产物直到卸载。
const refreshEpoch = new Map()

const stableStringify = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

// 配置 → 真实依赖：定义里写了 host 就用定义（定义级覆盖），
// 否则按设置里的「远程组件源」注册表找同名条目（后面的覆盖前面的）。
// 返回带 warnings 的配置副本，错误卡可直接把来源问题显示出来。
export function resolveMeltConfig (config) {
  if (!config || !config.dep) return config
  const { dep, warnings } = resolveDepFromSources(loadRuneSources(), config.dep)
  if (!warnings.length) return { ...config, dep }
  return { ...config, dep, sourceWarnings: warnings }
}

// 配置 → 资源池 key（platform 也参与，因为 hel 的 platform 决定拉哪份产物）
export function getMeltResourceKey (rawConfig) {
  if (!rawConfig) return ''
  const config = resolveMeltConfig(rawConfig)
  const dep = config.dep || {}
  const origin = dep.host || dep.type || ''
  return [dep.platform || '', dep.name || '', dep.version || '', origin, config.exportName || ''].join('|')
}

// 直连产物入口：给到 .../hel-meta.json 或 .../index.html 时整包原样使用。
// 这条路径不能用「ref + base」拼，否则会得到 <meta 地址>/<包名>/hel_dist/hel-meta.json
// 这种重复路径（已用真包实测）。这也正是对方 demo 的写法：host 直接给 meta 地址、不带版本。
const DIRECT_ENTRY_RE = /\/(?:hel-meta\.json|index\.html)$/i

// 配置 → hel 的加载描述（先解析地址，再补 platform / requiredExports）
export function buildMeltLoadSpec (rawConfig) {
  const config = resolveMeltConfig(rawConfig)
  const { resolveHelDep } = loadMeltLibs()
  const dep = config.dep || {}
  const host = typeof dep.host === 'string' ? dep.host.trim() : ''
  const ref = dep.version ? `${dep.name}@${dep.version}` : dep.name
  let spec
  if (host && DIRECT_ENTRY_RE.test(host)) {
    // 直连：版本由对方部署路径决定，我方只维护指向
    spec = resolveHelDep({ name: dep.name, host })
  } else if (host) {
    // 站点根：name 必须带 scope（@scope/name），version 写进 ref 才会拼出版本目录
    // 有 host 时按 custom 语义走；解析层默认塞进来的 unpkg 不能带过来
    const siteType = dep.type && dep.type !== 'unpkg' ? dep.type : 'custom'
    spec = resolveHelDep(ref, { type: siteType, base: host })
  } else {
    spec = resolveHelDep(ref, { type: dep.type || 'unpkg' })
  }
  if (dep.platform) spec.platform = dep.platform
  if (dep.requiredExports && dep.requiredExports.length) spec.requiredExports = dep.requiredExports.slice()
  return spec
}

// 配置 → dep key（同一依赖不同来源算两个 dep）
export function getMeltDepKey (config) {
  const dep = (config && config.dep) || {}
  return [dep.platform || '', dep.name || '', dep.version || '', dep.host || dep.type || ''].join('|')
}

// 取（并按需创建）该 dep 的 hel loader；刷新时丢掉这一个，等价于清掉进程内缓存。
export function getMeltLoader (config, spec) {
  const key = getMeltDepKey(config)
  let entry = depLoaderCache.get(key)
  if (!entry) {
    const { createHelLoader } = loadMeltLibs()
    entry = { loader: createHelLoader(), spec }
    depLoaderCache.set(key, entry)
  }
  return entry
}

// 刷新世代 + 基础 key = 本次加载真正用的池 key
export function getMeltPoolKey (config) {
  const base = getMeltResourceKey(config)
  if (!base) return ''
  const epoch = refreshEpoch.get(base) || 0
  return epoch ? `${base}#${epoch}` : base
}

// 清掉该 dep 的 loader（连带 hel 的请求合并/内存缓存）
export function resetMeltDepLoader (config) {
  depLoaderCache.delete(getMeltDepKey(config))
}

// hel 的磁盘 meta 缓存（IndexedDB/localStorage）。拿不到 API 就静默跳过，
// 不阻断刷新（网络可达时会重新拉 meta）。
function clearHelDiskCache (config) {
  const dep = (config && config.dep) || {}
  if (!dep.name) return
  try {
    // eslint-disable-next-line global-require
    const hel = require('hel-micro')
    const srv = (hel && hel.appMetaSrv) || (hel.default && hel.default.appMetaSrv)
    if (srv && typeof srv.clearDiskCachedApp === 'function') {
      const result = srv.clearDiskCachedApp(dep.name, undefined, dep.platform || undefined)
      if (result && typeof result.catch === 'function') result.catch(() => {})
    }
  } catch (error) {
    // hel-micro 未接入（如单测环境）时忽略
  }
}

function acquireResource (config, onChange) {
  const key = getMeltPoolKey(config)
  let entry = resourcePool.get(key)
  if (entry) {
    entry.refs++
  } else {
    const { createHelComponentResource } = loadMeltLibs()
    const spec = buildMeltLoadSpec(config)
    const { loader } = getMeltLoader(config, spec)
    const resource = createHelComponentResource({
      exportName: config.exportName,
      // 用 loader 而不是 dep：产物每次都由 loader 去远端取，刷新可换 loader 换缓存
      loader: () => loader.loadHelLib(spec)
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
  depLoaderCache.clear()
  refreshEpoch.clear()
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
    }, '刷新'))
  }
  return h('div', {
    attrs: { contenteditable: 'false', 'data-melt-rune-state': state },
    style
  }, children)
}

// 主工厂：melt 定义 → Vue 组件构造器；不是 melt 定义返回 null
export function createMeltRuneRendererCtor (rune = {}) {
  const parsed = parseMeltRuneConfig(rune)
  if (!parsed) return null
  // 先把「来源」解析出来：定义写死 host 优先，否则查设置里的远程组件源
  const config = resolveMeltConfig(parsed)
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
  // 系统保留名不能当 schema prop 声明，否则会和壳自己的 props 撞车
  const RESERVED_PROP_NAMES = ['runeId', 'nodeId', 'rune', 'value', 'onValueChange']
  propNames.forEach(name => {
    if (name === valueProp || RESERVED_PROP_NAMES.includes(name)) return
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
          if (RESERVED_PROP_NAMES.includes(name)) return
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
      // 强制刷新：丢该 dep 的 loader（= 清 hel 进程内缓存）+ 世代 +1 换新池 key，
      // 再拉一次产物。旧实例继续用旧产物，卸载时再释放，避免白屏。
      forceRefresh () {
        const oldKey = this.__meltResourceKey
        const oldListener = this.__meltResourceListener
        this.failureReason = ''
        this.state = { status: 'loading', component: null, error: null }
        resetMeltDepLoader(config)
        const base = getMeltResourceKey(config)
        refreshEpoch.set(base, (refreshEpoch.get(base) || 0) + 1)
        clearHelDiskCache(config)
        try {
          const acquired = acquireResource(config, state => { this.state = state })
          this.__meltResourceKey = acquired.key
          this.__meltResourceListener = acquired.listener
          acquired.entry.resource.load()
          if (oldKey) releaseResource(oldKey, oldListener || null)
        } catch (error) {
          this.failureReason = `刷新失败：${error && error.message ? error.message : error}`
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
        const origin = (config.dep && (config.dep.host || config.dep.name)) || ''
        const sourceWarn = config.sourceWarnings && config.sourceWarnings.length ? `（${config.sourceWarnings.join('；')}）` : ''
        return renderMessage(h, {
          style: ERROR_STYLE,
          text: `${config.exportName} 加载失败（${origin}）：${errorText}${sourceWarn}`,
          retry: () => this.forceRefresh(),
          state: 'error'
        })
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
  getMeltPoolKey,
  getMeltDepKey,
  resetMeltDepLoader,
  resolveMeltConfig,
  buildMeltLoadSpec,
  coerceMeltProp,
  normalizeMeltEmitValue,
  clearMeltRuneCaches
}
