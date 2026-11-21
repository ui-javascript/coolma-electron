// ============================================================================
// parsingRules —— Settings 弹框「语法解析」开关对应的纯函数校验
//
// 锁定两个口径（v2026-07-31 起固定）：
//   - echoRequireParens
//       回响占位符 @xxx{...}(prompt) 的 () 是否必须成对出现。
//       入口：echoFormDialog.submit() 在 echoRequireParens=true 时调用
//       hasEchoParens(annoSource, echoName) 校验：
//         扫描 annoSource，要求至少出现一处 @<name>(...) 或 @<name>{...}(...)。
//       与 src/components/echo/echoBuiltinsShared.js 的 CURRENT_ECHO_PLACEHOLDER_RE
//       完全等价（包含可选 {} + 必填 ()）。这里内嵌一份同步实现是为了：
//         (a) settings 校验在 dialog submit 同步路径跑，不需要打开 regex 缓存；
//         (b) jest 可在 Node 环境直接 import 这份纯函数测试。
//
//   - runeRequireTemplateDiv
//       符文 SFC <template>...</template> 块内是否必须包含至少一个 <div 节点。
//       入口：runeFormDialog.submit() 在 runeRequireTemplateDiv=true 时调用
//       hasRuneTemplateDiv(source) 校验：
//         (a) 必须先抽出 <template>...</template> 块（不区分大小写）；
//         (b) 去除 HTML 注释与字符串内容（避免 <!-- <div> --> 之类假阳性）；
//         (c) 至少出现一次 <div 后跟空白 / '>' / '/'。
//
// 这两个函数对外只暴露以上两个；任何扩展（比如新增第三项语法开关）请直接
// 在本文件追加新函数 + 在 settingsTabEnum.js 加 EditorSubEnum 项。
// ============================================================================

/**
 * 检测 annoSource 中是否包含至少一处 echo 的 () 占位符（@name(...) 或 @name{...}(...)）。
 * name 中的 regex 元字符会做转义，避免用户给 echo 起名 "wiz.(test)" 时炸掉。
 *
 * @param {string} annoSource echo 的 anno_source 字符串
 * @param {string} echoName    echo 名片 name / field
 * @returns {boolean}
 */
export const hasEchoParens = (annoSource = '', echoName = '') => {
  const name = String(echoName || '').trim()
  if (!name) return false
  const text = String(annoSource || '')
  if (!text) return false
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`@${escaped}(?:\\{[\\s\\S]*?\\})?\\([^)]*\\)`, 'g')
  return re.test(text)
}

/**
 * 检测符文 SFC source 中 <template>...</template> 块内是否包含至少一个 <div 节点。
 *
 * 防御性细节：
 *   - <template> 标签不区分大小写；
 *   - 块内的 HTML 注释会被剥离，避免注释里写 <div> 导致假阳性；
 *   - 块内的字符串（'...' / "..." / `...`）会被剥离，避免 `<img alt="<div>" />` 误判；
 *   - 最终只识别 <div 后紧跟空白 / '>' / '/' 的合法标签起始。
 *
 * @param {string} source 符文 SFC 完整源
 * @returns {boolean}
 */
export const hasRuneTemplateDiv = (source = '') => {
  const text = String(source || '')
  if (!text) return false
  // 多 template 块时：任一块有 div 即视为合规。
  // 用 sticky global regex（/g）+ matchAll 顺序扫描所有块。
  const templateRe = /<template[^>]*>([\s\S]*?)<\/template>/gi
  for (const m of text.matchAll(templateRe)) {
    const body = m[1]
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')
    if (/<div[\s>/]/.test(body)) return true
  }
  return false
}