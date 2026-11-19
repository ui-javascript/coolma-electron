import { escapeCharacters } from './escapeCharacter'

/* eslint-disable no-useless-escape */
export const beginRules = {
  hr: /^(\*{3,}$|^\-{3,}$|^\_{3,}$)/,
  code_fense: /^(`{3,})([^`]*)$/,
  header: /(^ {0,3}#{1,6}(\s{1,}|$))/,
  reference_definition: /^( {0,3}\[)([^\]]+?)(\\*)(\]: *)(<?)([^\s>]+)(>?)(?:( +)(["'(]?)([^\n"'\(\)]+)\9)?( *)$/,

  // extra syntax (not belogs to GFM)
  multiple_math: /^(\$\$)$/
}

export const inlineRules = {
  strong: /^(\*\*|__)(?=\S)([\s\S]*?[^\s\\])(\\*)\1(?!(\*|_))/, // can nest
  em: /^(\*|_)(?=\S)([\s\S]*?[^\s\*\\])(\\*)\1(?!\1)/, // can nest
  inline_code: /^(`{1,3})([^`]+?|.{2,})\1/,
  image: /^(\!\[)(.*?)(\\*)\]\((.*)(\\*)\)/,
  link: /^(\[)((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*?)(\\*)\]\((.*)(\\*)\)/, // can nest
  emoji: /^(:)([a-z_\d+-]+?)\1/,
  del: /^(~{2})(?=\S)([\s\S]*?\S)(\\*)\1/, // can nest
  auto_link: /^<(?:([a-zA-Z]{1}[a-zA-Z\d\+\.\-]{1,31}:[^ <>]*)|([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*))>/,
  // (extended www autolink|extended url autolink|extended email autolink) the email regexp is the same as auto_link.
  auto_link_extension: /^(?:(www\.[a-z_-]+\.[a-z]{2,}(?::[0-9]{1,5})?(?:\/[\S]+)?)|(http(?:s)?:\/\/(?:[a-z0-9\-._~]+\.[a-z]{2,}|[0-9.]+|localhost|\[[a-f0-9.:]+\])(?::[0-9]{1,5})?(?:\/[\S]+)?)|([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*))(?=\s|$)/,
  reference_link: /^\[([^\]]+?)(\\*)\](?:\[([^\]]*?)(\\*)\])?/,
  reference_image: /^\!\[([^\]]+?)(\\*)\](?:\[([^\]]*?)(\\*)\])?/,
  tail_header: /^(\s{1,}#{1,})(\s*)$/,
  html_tag: /^(<!--[\s\S]*?-->|(<([a-zA-Z]{1}[a-zA-Z\d-]*) *[^\n<>]* *(?:\/)?>)(?:([\s\S]*?)(<\/\3 *>))?)/, // raw html
  html_escape: new RegExp(`^(${escapeCharacters.join('|')})`, 'i'),
  soft_line_break: /^(\n)(?!\n)/,
  hard_line_break: /^( {2,})(\n)(?!\n)/,

  // patched math marker `$`
  backlash: /^(\\)([\\`*{}\[\]()#+\-.!_>~:\|\<\>$]{1})/,

  // Markdown extensions (not belongs to GFM and Commonmark)
  inline_math: /^(\$)([^\$]*?[^\$\\])(\\*)\1(?!\1)/,
  // 捕获组：[name, propsRaw, promptRaw]；默认 () 必填（与 v2026-07-31 之前的 ABI 完全一致）。
  // v2026-07-31 起为了响应 Memocast Settings → 编辑器 → 「语法解析 / 回响」开关
  // （持久化在 SQLite app_state 的 setting/parsing/echoRequireParens），
  // 这里把 inlineRules.echo_anno 改为**可运行时替换**：
  //   - echoRequireParens=true（默认） → () 必填，@name{} / @name 不命中 echo_anno
  //   - echoRequireParens=false         → () 可选，@name{} / @name 也会命中（兼容历史笔记）
  // 工厂 createEchoAnnoRule 在本文件下方；运行时入口 setEchoAnnoRule 在
  // ../parser/index.js，由主项目 Muya.vue 直接 import 后调：
  //   import { setEchoAnnoRule } from 'coolma-muya/lib'
  //   setEchoAnnoRule({ requireParens })  // 直接 mutate 本文件导出的 inlineRules.echo_anno
  // 不要再回到 options.echoAnnoRule 那条老路，**唯一**主路径就是 mutate 共享引用。
  // 捕获组顺序与原 echo_anno 完全一致：[name, propsRaw, promptRaw]，下游
  // parser/index.js 依赖 to[1]/to[2]/to[3] 取值，**不能改顺序**。
  echo_anno: /^@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)$/
}

// v2026-07-31 新增：根据 echoRequireParens 构造 echo_anno 正则。
//   - requireParens=true（默认） → () 必填，匹配 @name(prompt) 或 @name{...}(prompt)
//   - requireParens=false         → () 可选，匹配 @name / @name() / @name{} / @name{...}(...)
// 捕获组顺序与原 echo_anno 完全一致：[name, propsRaw, promptRaw]，
// 下游 parser/index.js 依赖 to[1]/to[2]/to[3] 取值，**不能改顺序**。
// 单行 prompt ([^)]*) 以避免误吞下游 markdown；name 必须 1+ 字符。
export const createEchoAnnoRule = ({ requireParens = true } = {}) => {
  if (requireParens) {
    // () 必填（与 v2026-07-31 之前的 ABI 完全一致）：
    //   - 形态 A：@name(prompt)               → to[1]=name to[2]=undefined to[3]=prompt
    //   - 形态 D：@name{...}(prompt)          → to[1]=name to[2]=propsRaw to[3]=prompt
    return /^@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)$/
  }
  // () 可选（仅在 echoRequireParens=false 切换时启用，给历史笔记保留空间）：
  //   - 形态 B：@name                       → to[1]=name to[2]=undefined to[3]=undefined
  //   - 形态 C：@name{}                     → to[1]=name to[2]=''       to[3]=undefined
  // 为了不破坏 downstream 已经存在的 to[1]/to[2]/to[3] 取值，prompt 段
  // 完全可选（非捕获组），不存在时 to[3] 为 undefined。
  return /^@([^\s{}()@]+)(?:\{([\s\S]*?)\})?(?:\(([^)]*)\))?$/
}

// Markdown extensions (not belongs to GFM and Commonmark)
export const inlineExtensionRules = {
  // This is not the best regexp, because it not support `2^2\\^`.
  superscript: /^(\^)((?:[^\^\s]|(?<=\\)\1|(?<=\\) )+?)(?<!\\)\1(?!\1)/,
  subscript: /^(~)((?:[^~\s]|(?<=\\)\1|(?<=\\) )+?)(?<!\\)\1(?!\1)/,
  footnote_identifier: /^(\[\^)([^\^\[\]\s]+?)(?<!\\)\]/
}
/* eslint-enable no-useless-escape */
