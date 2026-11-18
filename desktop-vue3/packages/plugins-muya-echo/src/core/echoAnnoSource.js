// ============================================================================
// echoAnnoSource —— anno_source 字符串编译 + 默认模板
//
// 形态：anno_source 是 `export default { ... }` 形式的字符串，
// 被 safeEvalFactory 编译成一个工厂函数，调用即得 definition 对象。
//
// 模板 `createDefaultEchoAnnoSource` 是「最朴素的 echo」实现，
// user-defined / builtin echo 都基于这套模板机制。
//
// handler 函数体统一用 jQuery：`const $ = window.jQuery` 由 HANDLER_PRELUDE 注入。
// 防御性 fallback：Node 端 / 测试场景没有 window.jQuery，$ 退化为 null。
// 此时 compile 仍可成功（render(props) 不依赖 $）；handler 里 `$(node).x` 调用会 NPE，
// 但这是 handler 自带的事，按 §3.5 graceful skip 路径兜住（EchoRuntime 已捕获）。
// ============================================================================

import { DEFAULT_ECHO_COLOR, DEFAULT_ECHO_ICON } from './echoBuiltinsShared.js'

export const HANDLER_PRELUDE = `const $ = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null
const __echoSetTimeout = typeof globalThis !== 'undefined' && typeof globalThis.setTimeout === 'function'
  ? globalThis.setTimeout.bind(globalThis)
  : null
const setTimeout = (callback, delay, ...args) => {
  if (!__echoSetTimeout) return null
  return __echoSetTimeout(() => {
    try {
      if (typeof callback === 'function') return callback(...args)
    } catch (error) {
      console.error('[echoAnnoSource] async handler failed:', error)
    }
  }, delay)
};
`

export const safeEvalAnnoSource = (source = '', prelude = '') => {
  const normalized = String(source || '').replace(/export\s+default/, 'return ')
  return new Function(String(prelude || '') + normalized)
}

export const createDefaultEchoAnnoSource = (echoName = '回响') => `export default {
  // === 顶层 type 直接承担分类语义（'echo' | 'echo-chant' | 'echo-tbd'）===
  // 不再保留独立 kind 字段——type 就是分类，简洁一致。
  type: 'echo',
  field: '回响',
  title: '${String(echoName || '回响').replace(/'/g, "\\'")}',
  version: 1,

  // === 实例可配置参数顶层声明（与 builtin echo 工厂对齐）===
  props: {},

  // === render 仅返回 echo host HTML 字符串 ===
  // 卡片外观（icon/color/title/desc）由 EchoRuntime 根据 echo 名片元数据 + props 兜底拼装，
  // render 不再负责卡片元数据拼装，只输出 DOM 片段。
  render (props = {}) {
    return '<span class="ag-echo-placeholder-marker ag-rune ag-rune--default" data-echo-chant-id="回响">${String(echoName || '回响').replace(/'/g, "\\'")}</span>'
  },

  // === 后渲染钩子：domElement 已插入到 DOM ===
  // 第 1 参是 echo host DOM element（jQuery 能直接 $(node) 选中），
  // 第 2 参 props = 编译期算好的实例参数（含 resolved value），由 EchoRuntime 注入。
  afterRender (node, props = {}) {
    $(node).addClass('ag-echo-default-mounted')
  }
}`
