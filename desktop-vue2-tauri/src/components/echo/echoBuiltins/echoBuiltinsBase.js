// ============================================================================
// echoBuiltinsBase —— 16 个内置回响的 anno_source 工厂（被各张回响卡片复用）
//
// 形态：
//   - baseRender(meta)             // 产出 `render (props = {}) { ... }` 字符串
//   - baseAfterRender(handlerBody, meta)  // 产出 `afterRender (node, props) { ... }` 字符串
//   - createAnnoSource({meta, renderBody, handlerBody})  // 拼成完整 anno_source
//   - buildEchoCard(meta)          // meta + anno_source 拼成一张内置 echo 卡
//
// 各张卡片的 meta 单独存到 echoBuiltinsNice.js / echoBuiltinsGrowth.js 等文件里。
// 入口在 ./echoBuiltins.js，外部 API 保持 echoBuiltins.js 原样。
// ============================================================================

import { banner, handlerDoc } from '../echoBuiltinsShared.js'

// ---------------------------------------------------------------------------
// render(props) 工厂：直接产出 echo host HTML 字符串
//   - 元数据（type / field / title / version）由 createAnnoSource 顶层写死
//   - render() 只返回 HTML，不再打包 type/icon/color/... 那些运行时再补
//   - 内置符文保持简洁：兜底完全交给 muya 渲染层（renderEchoPlaceholders 保留 echoAnno 的 @xxx 胶囊）。
//     需要兜底时直接 render 返回 null，不要在这里写 fallback 逻辑。
//
//   v2026-07-29 起：render 输出与 echoAnno 的 marker vnode 结构**逐节点对齐**，
//   唯一的差别是 name 节点上加 `ag-rune ag-rune--${meta.id} data-echo-chant-id="${meta.id}"`，
//   这样 snabbdom patch 时 marker 这个 outer span 与 echoAnno 输出的 vnode 同 tag/class，
//   patch 不会破坏 marker 结构 —— 避免"聚焦/失焦切换时 marker 胶囊时有时无"的突变。
//   个性化视觉效果交由 afterRender 给 marker 自身 addClass（CSS 实现）。
// ---------------------------------------------------------------------------
const baseRender = (meta = {}) => `render (props = {}) {
    return '<span class="ag-echo-placeholder-marker"><span class="ag-echo-anno-at" contenteditable="false">@</span><span class="ag-echo-anno-name ag-rune ag-rune--${meta.id}" contenteditable="false" data-echo-chant-id="${meta.id}">${meta.name}</span></span>'
  }`

// ---------------------------------------------------------------------------
// 通用 afterRender 工厂（签名 (node, props) → cleanup|undefined，与旧版一致）
// ---------------------------------------------------------------------------
const baseAfterRender = (handlerBody = '', meta = {}) => `${handlerDoc([`【handler】${meta.handlerDesc || ''}`])}
    ${handlerBody}
  }`

// ---------------------------------------------------------------------------
// 把 meta + render + afterRender 拼装成 anno_source 字符串
//
// === 新结构（v2026-07-28 起固定）===
//   export default {
//     type: 'echo' | 'echo-chant' | 'echo-tbd',  // 顶层 type 直接承担分类语义
//     field: '<id>',                            // 顶层 field，原 id 的别名
//     title: '<name>',                          // 顶层 title，原 name 的别名
//     version: 1,
//     props: {                                   // ★ 实例可配置参数提到顶层
//       ...meta.propsDefaults,
//     },
//     render (props = {}) { ... },              // 只返回 HTML 字符串
//     afterRender (node, props = {}) { ... }    // 签名不变
//   }
// ---------------------------------------------------------------------------
const createAnnoSource = ({ meta, renderBody, handlerBody }) => `export default {
  ${banner(meta.banner || [])},
  type: '${meta.type}',
  field: '${meta.id}',
  title: '${meta.name}',
  version: 1,

  props: ${JSON.stringify(meta.propsDefaults || {})},

  ${renderBody},

  ${baseAfterRender(handlerBody, meta)}
}`

// ---------------------------------------------------------------------------
// 把单张 meta + 工厂 → 一张完整 echo 卡片
// ---------------------------------------------------------------------------
const buildEchoCard = (meta) => {
  const renderBody = baseRender(meta)
  const anno_source = createAnnoSource({ meta, renderBody, handlerBody: meta.handlerBody || '' })
  return Object.freeze({
    id: `__builtin_${meta.id}__`,
    metaId: meta.id,
    name: meta.name,
    desc: meta.desc,
    icon: meta.icon,
    color: meta.color,
    category: meta.category,
    anno_source,
    isBuiltin: true
  })
}

export { baseRender, baseAfterRender, createAnnoSource, buildEchoCard }
