// ============================================================================
// libs-muya-vue2/lib/rune/runePropDefs.js
//
// 「符文定义 → props 白名单（propDefs）」的解析层，纯函数、不碰 DOM / Vue：
//   - vue-sfc：从 SFC 的 <script> export default { props } 里抠出 { name, default }
//     （历史机制，正则实现，够用且不引入 vue-template-compiler）
//   - melt-js：直接取配置里的 props schema（melt-js 组件的 props 契约由远端导出，
//     符文这边只能靠作者在定义里声明）
//
// 为什么要单独抽：render/index.js 会 import katex.min.css / boot/i18n，Jest 下不可解析；
// 抽出来之后 props 解析可以纯函数单测，渲染层只做「读属性 → 丢给 Vue」。
// 输出形态对齐：{ name, type?, default? }，type 仅 melt 侧有（老 SFC 解析不推断类型）。
// ============================================================================

import {
  RUNE_TYPE_MELT_JS,
  detectRuneType,
  listMeltPropDefs,
  parseMeltRuneConfig
} from './runeDefinition'

// 解析 SFC 字符串里的 props 块，返回 [{ name, default }] 数组。
// 这里只关心 prop 名和 default：default 是 SFC 开发者写的"无 prop 传入时的兜底值"。
// 解析方式：从 <script> 块里用正则匹配 props: { ... } 的键值对（够用、避免引入 vue-template-compiler）。
export const parseSfcPropsDef = (template = '') => {
  if (typeof template !== 'string' || !template) return []
  // 取 <script> ... </script> 块（包含属性，如 lang="ts"）
  const scriptMatch = template.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
  if (!scriptMatch) return []
  const body = scriptMatch[1]
  // 匹配 export default { ... } 整体
  const exportMatch = body.match(/export\s+default\s+([\s\S]*?)\n\}\s*(?:;|$)/m)
  if (!exportMatch) return []
  const exportBody = exportMatch[1]
  // 找到 props: { ... } 块。允许嵌套最外层 { } 对齐。
  const propsIdx = exportBody.indexOf('props')
  if (propsIdx < 0) return []
  const start = exportBody.indexOf('{', propsIdx)
  if (start < 0) return []
  // 从 start 开始按括号深度匹配
  let depth = 0
  let end = -1
  for (let i = start; i < exportBody.length; i++) {
    const ch = exportBody[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end <= start) return []
  const propsBody = exportBody.slice(start + 1, end)

  const result = []
  // 把 propsBody 按顶层逗号切分（顶层 = 括号/方括号深度为 0）
  let seg = ''
  let d = 0
  const segs = []
  for (let i = 0; i < propsBody.length; i++) {
    const ch = propsBody[i]
    if (ch === '{' || ch === '[' || ch === '(') d++
    else if (ch === '}' || ch === ']' || ch === ')') d--
    if (ch === ',' && d === 0) { segs.push(seg); seg = ''; continue }
    seg += ch
  }
  if (seg.trim()) segs.push(seg)

  for (const raw of segs) {
    const m = raw.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(\{[\s\S]*\}|null)\s*$/)
    if (!m) continue
    const name = m[1]
    const defBlock = m[2]
    // 在 defBlock 里找 default: ... 字段
    const defMatch = defBlock.match(/\bdefault\s*:\s*([\s\S]*?)(?=,\s*(?:type|required|validator|default)\s*:|$)/)
    if (!defMatch) continue
    let defRaw = defMatch[1].trim()
    // 去掉尾部逗号
    if (defRaw.endsWith(',')) defRaw = defRaw.slice(0, -1).trim()
    // 解析 default 的字面值
    let parsed
    try {
      // 用 Function 跑一下字符串字面量表达式
      // eslint-disable-next-line no-new-func
      parsed = new Function(`return (${defRaw});`)()
    } catch (_e) {
      parsed = undefined
    }
    result.push({ name, default: parsed })
  }
  return result
}

// 判断一个 rune 定义该用哪套 props 白名单：
//   - melt-js → 配置里的 props schema（等远端组件接上后由它消费）
//   - vue-sfc  → 从 SFC 的 <script> 里解析 props 声明（历史机制）
// 注意：类型优先取 rune.type（宿主归一化后带上的派生字段），没有就按 template 内容判定，
// 保证没有经过归一化的老数据也能工作。
export const resolveRunePropDefs = (rune) => {
  if (!rune) return []
  const type = rune.type || detectRuneType(rune.template)
  if (type === RUNE_TYPE_MELT_JS) {
    const config = parseMeltRuneConfig(rune)
    return config ? listMeltPropDefs(config) : []
  }
  return parseSfcPropsDef(rune.template || '')
}

export default {
  parseSfcPropsDef,
  resolveRunePropDefs
}
