/**
 * cdnDepsUtil —— CDN 依赖注入核心逻辑
 *
 * 从原来的 `src/boot/cdn-deps.js` 提取出来（boot 文件只保留「触发 + 广播」职责），
 * 目的是让业务组件也能复用同一份逻辑，而不必各自轮询 DOM。
 *
 * 设计要点：
 *  - 全异步：加载过程不阻塞应用启动（boot 只是触发一次）。
 *  - script 之间严格串行（保持 deps 数组顺序）；stylesheet / font 与 script 并行。
 *    串行的原因：city-picker.data.js 必须先于 city-picker.js 到达，
 *    否则 IIFE 抛 "The file city-picker.data.js must be included first!"，
 *    `$.fn.citypicker` 永远不注册。
 *  - 幂等：同一 URL 只会注入一次；重复调用 loadCdnDeps() 复用同一个 Promise。
 *
 * jQuery 说明：
 *  npm 依赖里的 `jquery` 已在 `src/boot/rune-deps.js` 同步挂到 window，
 *  因此这里默认**跳过** CDN 版 jQuery 核心脚本的注入，
 *  避免 window 上同时存在两份 jQuery 实例（插件挂到 A 实例、业务用 B 实例的经典坑）。
 *  jQuery Migrate 仍然注入（它是给现有 jQuery 补旧 API 的补丁脚本）。
 *  用户在设置里把 jQuery 的 URL 改掉时，本模块不做特殊处理（按普通脚本注入）。
 */

import bus from 'src/components/common/bus'
import DatabaseClient from 'src/utils/DatabaseClient'

const CDN_DEPS_STORAGE_KEY = 'v__2_client_cdnDeps'

/**
 * 内置 CDN 依赖（首次启动时使用）。
 * jQuery / jQuery Migrate 保留在列表里（用户在设置面板里可见、可禁用、可改 URL），
 * 但注入阶段会因为 npm 已提供 jQuery 而跳过。
 */
export const BUILT_IN_CDN_DEPS = [
  { name: 'jQuery', url: 'https://luo0412.github.io/cdn/jquery/jquery.min.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'jQuery Migrate', url: 'https://luo0412.github.io/cdn/jquery/jquery-migrate.min.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'layui CSS', url: 'https://luo0412.github.io/cdn/layui/css/layui.css', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'layui JS', url: 'https://luo0412.github.io/cdn/layui/layui.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  // v2026-08-01：city-picker 默认域名统一从 tshi0912.github.io 改为 luo0412.github.io/cdn
  { name: 'city-picker data', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.data.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'city-picker JS', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'city-picker CSS', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.css', enabled: true, applyToBlog: false, isBuiltIn: true }
]

const builtInNames = BUILT_IN_CDN_DEPS.map(d => d.name)

function newId () {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}

/**
 * 根据 URL 判断资源类型
 */
function getResourceType (url) {
  const lower = url.toLowerCase()
  if (lower.endsWith('.js')) return 'script'
  if (lower.endsWith('.css')) return 'stylesheet'
  if (/\.(woff2?|ttf|otf|eot|svg)(\?|$)/.test(lower)) return 'font'
  // 默认作为样式表尝试
  return 'stylesheet'
}

/**
 * 设置通用属性
 */
function setCommonAttrs (el, dep) {
  const safeId = 'cdn-dep-' + (dep.id || dep.name || '').replace(/[^a-zA-Z0-9]/g, '_')
  el.id = safeId
  el.setAttribute('data-cdn-name', dep.name || '')
}

/**
 * 是否是 jQuery 核心脚本（不含 jQuery Migrate）
 */
function isJQueryCoreDep (dep) {
  if (!dep) return false
  const name = String(dep.name || '').toLowerCase()
  if (name === 'jquery' || name === 'jquery core') return true
  const url = String(dep.url || '').toLowerCase()
  return /jquery(\.min)?\.js(\?|$)/.test(url) && !url.includes('migrate')
}

/**
 * 移除已注入的 CDN 资源
 */
export function removeInjectedResources () {
  document.querySelectorAll('head script[data-cdn-name]').forEach(el => el.remove())
  document.querySelectorAll('head link[data-cdn-name]').forEach(el => el.remove())
  document.querySelectorAll('style[data-cdn-font-face]').forEach(el => el.remove())
}

/**
 * 注入脚本（不设 async，按 onload 链式调用保持顺序）
 */
function injectScript (dep) {
  return new Promise((resolve) => {
    const url = dep.url
    const existing = document.querySelector(`head script[src="${url}"]`)
    if (existing) {
      console.log('[CdnDeps] Already injected script:', url)
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = url
    setCommonAttrs(script, dep)

    const done = (ok) => {
      if (ok) {
        console.log('[CdnDeps] Script loaded:', url)
      } else {
        console.error('[CdnDeps] Script failed:', url)
      }
      resolve()
    }

    script.onload = () => done(true)
    script.onerror = () => done(false)

    document.head.appendChild(script)
    console.log('[CdnDeps] Injected script:', dep.name, '->', url)
  })
}

/**
 * 注入样式表
 */
function injectStylesheet (dep) {
  const url = dep.url
  const existing = document.querySelector(`head link[href="${url}"]`)
  if (existing) {
    console.log('[CdnDeps] Already injected stylesheet:', url)
    return
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  setCommonAttrs(link, dep)

  link.onload = () => console.log('[CdnDeps] Stylesheet loaded:', url)
  link.onerror = () => console.error('[CdnDeps] Stylesheet failed:', url)

  document.head.appendChild(link)
  console.log('[CdnDeps] Injected stylesheet:', dep.name, '->', url)
}

/**
 * 注入字体（预连接 + @font-face 内联样式）
 */
function injectFont (dep) {
  const url = dep.url
  const fontFamily = dep.name || 'CDNFont'
  const fontId = 'cdn-font-' + (dep.id || fontFamily).replace(/[^a-zA-Z0-9]/g, '_')

  if (document.getElementById(fontId)) {
    console.log('[CdnDeps] Already injected font:', fontFamily)
    return
  }

  try {
    const preconn = document.createElement('link')
    preconn.rel = 'preconnect'
    preconn.href = new URL(url).origin
    preconn.crossOrigin = 'anonymous'
    document.head.appendChild(preconn)
  } catch (e) {
    /* URL 非法时忽略预连接 */
  }

  const fileName = url.split('/').pop().split('?')[0]
  const ext = fileName.split('.').pop().toLowerCase()
  const formatMap = {
    woff2: 'woff2',
    woff: 'woff',
    ttf: 'truetype',
    otf: 'opentype',
    eot: 'embedded-opentype',
    svg: 'svg'
  }
  const format = formatMap[ext] || ext

  const style = document.createElement('style')
  style.id = fontId
  style.setAttribute('data-cdn-font-face', fontFamily)
  style.textContent = `
    @font-face {
      font-family: '${fontFamily}';
      src: url('${url}') format('${format}');
      font-display: swap;
    }
  `
  document.head.appendChild(style)
  console.log('[CdnDeps] Injected font:', fontFamily, '->', url)
}

/**
 * 按依赖顺序串行注入
 */
async function injectResourceInOrder (deps, index) {
  if (index >= deps.length) return
  const dep = deps[index]
  const type = getResourceType(dep.url)

  switch (type) {
    case 'script':
      await injectScript(dep)
      break
    case 'stylesheet':
      injectStylesheet(dep)
      break
    case 'font':
      injectFont(dep)
      break
    default:
      injectStylesheet(dep)
  }

  return injectResourceInOrder(deps, index + 1)
}

/**
 * 确保 window.jQuery 和 window.$ 挂载
 */
function ensureJQueryGlobals () {
  if (typeof window.jQuery === 'undefined' && typeof window.$ !== 'undefined') {
    window.jQuery = window.$
    console.log('[CdnDeps] Ensured window.jQuery = window.$')
  } else if (typeof window.jQuery !== 'undefined' && typeof window.$ === 'undefined') {
    window.$ = window.jQuery
    console.log('[CdnDeps] Ensured window.$ = window.jQuery')
  }
  if (typeof window.jQuery !== 'undefined') {
    console.log('[CdnDeps] jQuery version:', window.jQuery.fn.jquery)
  }
}

/**
 * 读取已启用的 CDN 依赖
 * 优先级：SQLite > localStorage > 内置依赖
 */
async function resolveAllDeps () {
  let deps = []

  // 1. 优先从 SQLite 读取
  try {
    const savedDeps = await DatabaseClient.cdnDeps.getAll()
    if (Array.isArray(savedDeps) && savedDeps.length > 0) {
      const customDeps = savedDeps.filter(d => !builtInNames.includes(d.name))
      const mergedBuiltIn = BUILT_IN_CDN_DEPS.map(bi => {
        const existing = savedDeps.find(d => d.name === bi.name)
        if (existing) return { ...existing, isBuiltIn: true, id: existing.id || newId() }
        return { ...bi, id: newId() }
      })
      deps = [...mergedBuiltIn, ...customDeps]
      console.log('[CdnDeps] Loaded from SQLite:', deps.length, 'deps')
    }
  } catch (dbErr) {
    console.warn('[CdnDeps] Failed to load from SQLite, trying localStorage:', dbErr)
  }

  // 2. 如果 SQLite 为空，尝试 localStorage（向后兼容）
  if (deps.length === 0) {
    const raw = localStorage.getItem(CDN_DEPS_STORAGE_KEY)
    if (raw) {
      try {
        deps = JSON.parse(raw)
        console.log('[CdnDeps] Loaded from localStorage:', deps.length, 'deps')
      } catch (parseErr) {
        console.warn('[CdnDeps] Failed to parse localStorage, using built-in:', parseErr)
      }
    }
  }

  // 3. 如果都为空，使用内置依赖
  if (deps.length === 0) {
    deps = BUILT_IN_CDN_DEPS.map(bi => ({ ...bi, id: newId() }))
    console.log('[CdnDeps] Using built-in deps:', deps.length)
  }

  return Array.isArray(deps) ? deps : []
}

/**
 * 读取全部 CDN 依赖（含未启用项），供设置面板展示 / vuex 缓存。
 * @returns {Promise<Array>}
 */
export function resolveCdnDeps () {
  return resolveAllDeps()
}

/**
 * 真正执行注入
 */
async function injectAll () {
  const allDeps = await resolveAllDeps()
  const enabledDeps = allDeps.filter(dep => dep && dep.enabled && dep.url)
  if (!enabledDeps.length) {
    console.log('[CdnDeps] No enabled CDN deps')
    return
  }

  // npm 已提供 jQuery（boot/rune-deps.js），跳过 CDN 版 jQuery 核心脚本，
  // 避免 window 上出现两份 jQuery 实例（插件挂到 A 实例、业务用 B 实例的经典坑）。
  // jQuery Migrate 仍然注入：它是给 npm 那份 jQuery 补旧 API 的补丁脚本。
  const jqueryDeps = []
  const skippedJquery = []
  const otherDeps = []
  enabledDeps.forEach(dep => {
    if (isJQueryCoreDep(dep)) {
      if (typeof window !== 'undefined' && window.jQuery) {
        skippedJquery.push(dep)
      } else {
        jqueryDeps.push(dep)
      }
    } else {
      otherDeps.push(dep)
    }
  })
  if (skippedJquery.length) {
    console.log('[CdnDeps] Skipped CDN jQuery (already provided by npm bundle):',
      skippedJquery.map(d => d.name).join(', '))
  }

  console.log('[CdnDeps] Injecting', enabledDeps.length - skippedJquery.length, 'CDN deps...')

  // 1. jQuery 系列（串行）；2. 其他依赖（串行但与 jQuery 分开批次）
  if (jqueryDeps.length > 0) {
    await injectResourceInOrder(jqueryDeps, 0)
    ensureJQueryGlobals()
  }

  if (otherDeps.length > 0) {
    try {
      await injectResourceInOrder(otherDeps, 0)
    } catch (err) {
      console.error('[CdnDeps] Error injecting CDN deps:', err)
    }
  }

  ensureJQueryGlobals()
  bus.$emit('cdnDepsReady')
}

// 幂等：同一时刻只跑一个加载流程
let loadingPromise = null
// 已完成的加载流程（供 whenCdnDepsReady 立即 resolve，避免重复加载）
let readyPromise = null

/**
 * 加载并注入已启用的 CDN 依赖（异步、可重复调用）
 * @returns {Promise<void>}
 */
export function loadCdnDeps () {
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    try {
      await injectAll()
    } catch (err) {
      console.error('[CdnDeps] Error loading CDN deps:', err)
    } finally {
      loadingPromise = null
      readyPromise = Promise.resolve()
    }
  })()
  return loadingPromise
}

/**
 * 重新加载（设置里保存了新的 CDN 配置后调用）
 */
export function reloadCdnDeps () {
  removeInjectedResources()
  readyPromise = null
  return loadCdnDeps()
}

/**
 * 等待 CDN 依赖就绪（业务组件可直接 await，无需轮询）
 * 已加载完成时立即 resolve；未开始时触发一次加载。
 * @returns {Promise<void>}
 */
export function whenCdnDepsReady () {
  if (readyPromise) return readyPromise
  return loadCdnDeps()
}
