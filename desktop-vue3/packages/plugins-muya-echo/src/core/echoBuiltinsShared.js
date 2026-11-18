// ============================================================================
// 内置回响共享样板（renderer 端）
//
// 提供 16 个内置 echo 共用的辅助函数 + 共享代码片段。
// 消除 builtinEchoes.js 里 16 份重复的 banner 注释与 afterRender 写法。
//
// === 主要导出 ===
//   banner(lines)                把多行教学注释格式化进 anno_source 顶部
//   DEFAULT_ECHO_COLOR / ICON    echo 默认颜色 / 图标
//   CURRENT_ECHO_PLACEHOLDER_RE  @name{props}(prompt) 当前形态的正则；
//                                props 段可选，因此旧式 @name{}() 也匹配得上。
//                                与 parser/rules.js 中 echo_anno 的结构同源。
//
// === anno_source 约定 ===
//   这些函数**字符串化**后塞进 anno_source 用！所以 "banner()" 之类的
//   内部调用都用普通 JS 字符串拼接，不能用 ES module 语法。
//
// === jQuery 集成 ===
//   afterRender 闭包内由 EchoRuntime 的 HANDLER_PRELUDE_SOURCE 先注入
//   `const $ = window.jQuery`，下面 helper 全部以 jQuery 选择器 API 为前提；
//   调用方拿到的是 jQuery 对象实例，可继续用
//   `.addClass` / `.removeClass` / `.css` / `.attr` / `.on` / `.off` 等。
// ============================================================================

// ---- 单行注释 banner：避免 /* */ 多行注释后直接接 , 触发 "Unexpected token ','" ----
export const banner = (lines) => lines.map(line => `//   ${line}`).join('\n  ')

// ---- 默认图标/颜色 ----
export const DEFAULT_ECHO_COLOR = '#26A69A'
export const DEFAULT_ECHO_ICON = 'graphic_eq'

// === props 命名约定（v2026-07 起固定） ===
//
//   echo 的"实例可配置"参数在 anno_source / payload / host dataset 里统一叫 `props`，
//   与 form-create 的 rule.props / rule.on / rule.options / rule.info 字段对齐，
//   方便 EchoInstanceDialog 直接透传给 form-create 控件。
//
//   === EchoRuntime 注入到 handler / render 拿到的 props（v2026-07-28 起）===
//     - props.type          'echo' | 'echo-chant' | 'echo-tbd'  （来自 definition.type）
//     - props.field         echo 名片 id（来自 definition.field）
//     - props.title         echo 名片中文名（来自 definition.title）
//     - props.version       definition.version（默认 1）
//     - props.definitionId  matchedEcho.id（echo 名片稳定 id）
//     - props.<自定义字段>   anno_source 顶层 props 声明的 defaults ∪ 实例 mergedProps
//     - props.value         resolved value（基础设施字段，handler 不要直接覆盖）
//     - props.id            resolved id（基础设施字段，handler 不要直接覆盖）
//
//   === form-create 弹框隐藏字段（不让用户编辑）===
//   EchoInstanceDialog 用 `RESERVED_PROPS_FIELDS` 把以下字段从 form-create schema 里过滤掉，
//   因为这些字段由 EchoRuntime / 弹框自动管理：
//     - id, definitionId, value, inheritFromPrevious, type
//
// 渲染层（render 返回值）的 props 字段就是实例参数对象，handler 体内访问统一 `props.xxx`。
export const DEFAULT_ECHO_PROPS_RESERVED = Object.freeze(['value', 'id', 'definitionId', 'type', 'inheritFromPrevious'])

// 捕获组：[name, propsRaw, promptRaw]；propsRaw 可缺省，因此 @name() 也匹配得上。
// 单行 prompt（[^)]*）以避免误吞下游 markdown；name 必须 1+ 字符。
export const CURRENT_ECHO_PLACEHOLDER_RE = /@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)/g

// ============================================================================
// handlerDoc(docLines) —— 生成 afterRender 方法前缀：
//   // doc...
//   afterRender (node, props = {}) {
//   ↑ caller 只要在拼接时把函数体跟在后面：
//     ${handlerDoc([...])}
//       const $rune = $(node)
//       ...
//     }
//   最终产物里 afterRender 就是个完整的对象方法，编译器会自动 export default。
//
// 注：handler 函数体内统一用 jQuery，编译器（HANDLER_PRELUDE_SOURCE）会注入
// `const $ = window.jQuery`。
// ============================================================================
export const handlerDoc = (docLines = []) => {
  const banner = (Array.isArray(docLines) ? docLines : [])
    .map(line => `//   ${line}`)
    .join('\n  ')
  return `${banner}\n  afterRender (node, props = {}) {`
}