import { beginRules, inlineRules, inlineExtensionRules, createEchoAnnoRule } from './rules'
import { isLengthEven, union } from '../utils'
import { findClosingBracket } from './marked/utils'
import { getAttributes, parseSrcAndTitle, validateEmphasize, lowerPriority } from './utils'
import { parseEchoProps } from 'src/components/echo/echoCore'

// 重新导出原本仅在 `./rules` 内 export 的符号，供 `lib/index.js` 透过
//   `export { ... } from './parser'` 暴露给上层（Memocast Muya.vue、demo-web 等）。
// 不能改为 `export { ... } from './rules'`，否则会与 parser 内自用的 import 重复。
export { beginRules, inlineRules, inlineExtensionRules, createEchoAnnoRule }

// const CAN_NEST_RULES = ['strong', 'em', 'link', 'del', 'a_link', 'reference_link', 'html_tag']
// disallowed html tags in https://github.github.com/gfm/#raw-html
const disallowedHtmlTag = /(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)/i
const validateRules = Object.assign({}, inlineRules)
delete validateRules.em
delete validateRules.strong
delete validateRules.tail_header
delete validateRules.backlash

const correctUrl = token => {
  if (token && typeof token[4] === 'string') {
    const lastParenIndex = findClosingBracket(token[4], '()')

    if (lastParenIndex > -1) {
      const len = token[0].length - (token[4].length - lastParenIndex)
      token[0] = token[0].substring(0, len)
      const originSrc = token[4].substring(0, lastParenIndex)
      const match = /(\\+)$/.exec(originSrc)
      if (match) {
        token[4] = originSrc.substring(0, originSrc.length - match[1].length)
        token[5] = match[1]
      } else {
        token[4] = originSrc
        token[5] = ''
      }
    }
  }
}

const tokenizerFac = (src, beginRules, inlineRules, pos = 0, top, labels, options) => {
  const originSrc = src
  const tokens = []
  let pending = ''
  let pendingStartPos = pos
  const { superSubScript, footnote } = options
  const pushPending = () => {
    if (pending) {
      tokens.push({
        type: 'text',
        raw: pending,
        content: pending,
        range: {
          start: pendingStartPos,
          end: pos
        }
      })
    }

    pendingStartPos = pos
    pending = ''
  }

  if (beginRules && pos === 0) {
    const beginRuleList = ['header', 'hr', 'code_fense', 'multiple_math']

    for (const ruleName of beginRuleList) {
      const to = beginRules[ruleName].exec(src)

      if (to) {
        const token = {
          type: ruleName,
          raw: to[0],
          parent: tokens,
          marker: to[1],
          content: to[2] || '',
          backlash: to[3] || '',
          range: {
            start: pos,
            end: pos + to[0].length
          }
        }
        tokens.push(token)
        src = src.substring(to[0].length)
        pos = pos + to[0].length
        break
      }
    }
    const def = beginRules.reference_definition.exec(src)
    if (def && isLengthEven(def[3])) {
      const token = {
        type: 'reference_definition',
        parent: tokens,
        leftBracket: def[1],
        label: def[2],
        backlash: def[3] || '',
        rightBracket: def[4],
        leftHrefMarker: def[5] || '',
        href: def[6],
        rightHrefMarker: def[7] || '',
        leftTitlespace: def[8],
        titleMarker: def[9] || '',
        title: def[10] || '',
        rightTitleSpace: def[11] || '',
        raw: def[0],
        range: {
          start: pos,
          end: pos + def[0].length
        }
      }
      tokens.push(token)
      src = src.substring(def[0].length)
      pos = pos + def[0].length
    }
  }

  while (src.length) {
    // backlash
    const backTo = inlineRules.backlash.exec(src)
    if (backTo) {
      pushPending()
      tokens.push({
        type: 'backlash',
        raw: backTo[1],
        marker: backTo[1],
        parent: tokens,
        content: '',
        range: {
          start: pos,
          end: pos + backTo[1].length
        }
      })
      pending += pending + backTo[2]
      pendingStartPos = pos + backTo[1].length
      src = src.substring(backTo[0].length)
      pos = pos + backTo[0].length
      continue
    }
    // strong | em
    const emRules = ['strong', 'em']
    let inChunk
    for (const rule of emRules) {
      const to = inlineRules[rule].exec(src)
      if (to && isLengthEven(to[3])) {
        const isValid = validateEmphasize(src, to[0].length, to[1], pending, validateRules)
        if (isValid) {
          inChunk = true
          pushPending()
          const range = {
            start: pos,
            end: pos + to[0].length
          }
          const marker = to[1]
          tokens.push({
            type: rule,
            raw: to[0],
            range,
            marker,
            parent: tokens,
            children: tokenizerFac(to[2], undefined, inlineRules, pos + to[1].length, false, labels, options),
            backlash: to[3]
          })
          src = src.substring(to[0].length)
          pos = pos + to[0].length
        }
        break
      }
    }
    if (inChunk) continue

    // strong | em | emoji | inline_code | del | inline_math | echo_anno
    const chunks = ['inline_code', 'del', 'emoji', 'inline_math', 'echo_anno']
    for (const rule of chunks) {
      const to = inlineRules[rule].exec(src)
      if (to && (rule === 'echo_anno' || isLengthEven(to[3]))) {
        if (rule === 'emoji' && !lowerPriority(src, to[0].length, validateRules)) break
        inChunk = true
        pushPending()
        const range = {
          start: pos,
          end: pos + to[0].length
        }
        const marker = to[1]
        if (rule === 'inline_code' || rule === 'emoji' || rule === 'inline_math') {
          tokens.push({
            type: rule,
            raw: to[0],
            range,
            marker,
            parent: tokens,
            content: to[2],
            backlash: to[3]
          })
        } else if (rule === 'echo_anno') {
          const propsParsed = parseEchoProps(to[2] || '')
          // === echoId 字段名约定（v2026-07-30 起固定） ===
          // 快捷面板插入路径用 `echoId: 'uuid'` 写到 markdown，handler 端 echoRuntime
          // 注入到 finalProps.echoId 作为「实例 id」（等价于 rune 的 data-rune-id 角色）。
          // 旧 `id` 字段名仍向后兼容（手写 markdown / 旧 IPC 落库数据）。
          // 优先级：propsParsed.echoId > propsParsed.id（向后兼容）
          const instEchoId = (typeof propsParsed.echoId === 'string' && propsParsed.echoId) ||
            (typeof propsParsed.id === 'string' && propsParsed.id) ||
            ''
          tokens.push({
            type: 'echo_anno',
            raw: to[0],
            range,
            marker,
            parent: tokens,
            echoName: to[1] || '',
            echoId: instEchoId,
            // 同步把 echoId 拷一份到 propsParsed.echoId，让 echoRuntime / echoAnno / afterRender
            // 都能从 instProps.echoId 拿到，不用每次都做 fallback 链。
            propsParsed: instEchoId && !propsParsed.echoId
              ? { ...propsParsed, echoId: instEchoId }
              : propsParsed,
            propsRaw: to[2] || '',
            prompt: to[3]
          })
        } else {
          tokens.push({
            type: rule,
            raw: to[0],
            range,
            marker,
            parent: tokens,
            children: tokenizerFac(to[2], undefined, inlineRules, pos + to[1].length, false, labels, options),
            backlash: to[3]
          })
        }
        src = src.substring(to[0].length)
        pos = pos + to[0].length
        break
      }
    }
    if (inChunk) continue
    // superscript and subscript
    if (superSubScript) {
      const superSubTo = inlineRules.superscript.exec(src) || inlineRules.subscript.exec(src)
      if (superSubTo) {
        pushPending()
        tokens.push({
          type: 'super_sub_script',
          raw: superSubTo[0],
          marker: superSubTo[1],
          range: {
            start: pos,
            end: pos + superSubTo[0].length
          },
          parent: tokens,
          content: superSubTo[2]
        })
        src = src.substring(superSubTo[0].length)
        pos = pos + superSubTo[0].length
        continue
      }
    }

    // footnote identifier
    if (pos !== 0 && footnote) {
      const footnoteTo = inlineRules.footnote_identifier.exec(src)
      if (footnoteTo) {
        pushPending()
        tokens.push({
          type: 'footnote_identifier',
          raw: footnoteTo[0],
          marker: footnoteTo[1],
          range: {
            start: pos,
            end: pos + footnoteTo[0].length
          },
          parent: tokens,
          content: footnoteTo[2]
        })
        src = src.substring(footnoteTo[0].length)
        pos = pos + footnoteTo[0].length
        continue
      }
    }
    // image
    const imageTo = inlineRules.image.exec(src)
    correctUrl(imageTo)
    if (imageTo && isLengthEven(imageTo[3]) && isLengthEven(imageTo[5])) {
      const { src: imageSrc, title } = parseSrcAndTitle(imageTo[4])
      pushPending()
      tokens.push({
        type: 'image',
        raw: imageTo[0],
        marker: imageTo[1],
        srcAndTitle: imageTo[4],
        // This `attrs` used for render image.
        attrs: {
          src: imageSrc + encodeURI(imageTo[5]),
          title,
          alt: imageTo[2] + encodeURI(imageTo[3])
        },
        src: imageSrc,
        title,
        parent: tokens,
        range: {
          start: pos,
          end: pos + imageTo[0].length
        },
        alt: imageTo[2],
        backlash: {
          first: imageTo[3],
          second: imageTo[5]
        }
      })
      src = src.substring(imageTo[0].length)
      pos = pos + imageTo[0].length
      continue
    }
    // link
    const linkTo = inlineRules.link.exec(src)
    correctUrl(linkTo)
    if (linkTo && isLengthEven(linkTo[3]) && isLengthEven(linkTo[5])) {
      const { src: href, title } = parseSrcAndTitle(linkTo[4])
      pushPending()
      tokens.push({
        type: 'link',
        raw: linkTo[0],
        marker: linkTo[1],
        hrefAndTitle: linkTo[4],
        href,
        title,
        parent: tokens,
        anchor: linkTo[2],
        range: {
          start: pos,
          end: pos + linkTo[0].length
        },
        children: tokenizerFac(linkTo[2], undefined, inlineRules, pos + linkTo[1].length, false, labels, options),
        backlash: {
          first: linkTo[3],
          second: linkTo[5]
        }
      })

      src = src.substring(linkTo[0].length)
      pos = pos + linkTo[0].length
      continue
    }

    const rLinkTo = inlineRules.reference_link.exec(src)
    if (rLinkTo && labels.has(rLinkTo[3] || rLinkTo[1]) && isLengthEven(rLinkTo[2]) && isLengthEven(rLinkTo[4])) {
      pushPending()
      tokens.push({
        type: 'reference_link',
        raw: rLinkTo[0],
        isFullLink: !!rLinkTo[3],
        parent: tokens,
        anchor: rLinkTo[1],
        backlash: {
          first: rLinkTo[2],
          second: rLinkTo[4] || ''
        },
        label: rLinkTo[3] || rLinkTo[1],
        range: {
          start: pos,
          end: pos + rLinkTo[0].length
        },
        children: tokenizerFac(rLinkTo[1], undefined, inlineRules, pos + 1, false, labels, options)
      })

      src = src.substring(rLinkTo[0].length)
      pos = pos + rLinkTo[0].length
      continue
    }

    const rImageTo = inlineRules.reference_image.exec(src)
    if (rImageTo && labels.has(rImageTo[3] || rImageTo[1]) && isLengthEven(rImageTo[2]) && isLengthEven(rImageTo[4])) {
      pushPending()

      tokens.push({
        type: 'reference_image',
        raw: rImageTo[0],
        isFullLink: !!rImageTo[3],
        parent: tokens,
        alt: rImageTo[1],
        backlash: {
          first: rImageTo[2],
          second: rImageTo[4] || ''
        },
        label: rImageTo[3] || rImageTo[1],
        range: {
          start: pos,
          end: pos + rImageTo[0].length
        }
      })

      src = src.substring(rImageTo[0].length)
      pos = pos + rImageTo[0].length
      continue
    }

    // html escape
    const htmlEscapeTo = inlineRules.html_escape.exec(src)
    if (htmlEscapeTo) {
      const len = htmlEscapeTo[0].length
      pushPending()
      tokens.push({
        type: 'html_escape',
        raw: htmlEscapeTo[0],
        escapeCharacter: htmlEscapeTo[1],
        parent: tokens,
        range: {
          start: pos,
          end: pos + len
        }
      })
      src = src.substring(len)
      pos = pos + len
      continue
    }

    // auto link extension
    const autoLinkExtTo = inlineRules.auto_link_extension.exec(src)
    if (autoLinkExtTo && top && (pos === 0 || /[* _~(]{1}/.test(originSrc[pos - 1]))) {
      pushPending()
      tokens.push({
        type: 'auto_link_extension',
        raw: autoLinkExtTo[0],
        www: autoLinkExtTo[1],
        url: autoLinkExtTo[2],
        email: autoLinkExtTo[3],
        linkType: autoLinkExtTo[1] ? 'www' : (autoLinkExtTo[2] ? 'url' : 'email'),
        parent: tokens,
        range: {
          start: pos,
          end: pos + autoLinkExtTo[0].length
        }
      })
      src = src.substring(autoLinkExtTo[0].length)
      pos = pos + autoLinkExtTo[0].length
      continue
    }

    // auto link
    const autoLTo = inlineRules.auto_link.exec(src)
    if (autoLTo) {
      pushPending()
      tokens.push({
        type: 'auto_link',
        raw: autoLTo[0],
        href: autoLTo[1],
        email: autoLTo[2],
        isLink: !!autoLTo[1], // It is a link or email.
        marker: '<',
        parent: tokens,
        range: {
          start: pos,
          end: pos + autoLTo[0].length
        }
      })
      src = src.substring(autoLTo[0].length)
      pos = pos + autoLTo[0].length
      continue
    }

    // html-tag
    const htmlTo = inlineRules.html_tag.exec(src)
    let attrs
    // handle comment
    if (htmlTo && htmlTo[1] && !htmlTo[3]) {
      const len = htmlTo[0].length
      pushPending()
      tokens.push({
        type: 'html_tag',
        raw: htmlTo[0],
        tag: '<!---->',
        openTag: htmlTo[1],
        parent: tokens,
        attrs: {},
        range: {
          start: pos,
          end: pos + len
        }
      })
      src = src.substring(len)
      pos = pos + len
      continue
    }
    if (htmlTo && !(disallowedHtmlTag.test(htmlTo[3])) && (attrs = getAttributes(htmlTo[0]))) {
      const tag = htmlTo[3]
      const html = htmlTo[0]
      const len = htmlTo[0].length

      pushPending()
      tokens.push({
        type: 'html_tag',
        raw: html,
        tag,
        openTag: htmlTo[2],
        closeTag: htmlTo[5],
        parent: tokens,
        attrs,
        content: htmlTo[4],
        children: htmlTo[4] ? tokenizerFac(htmlTo[4], undefined, inlineRules, pos + htmlTo[2].length, false, labels, options) : '',
        range: {
          start: pos,
          end: pos + len
        }
      })
      src = src.substring(len)
      pos = pos + len
      continue
    }

    // soft line break
    const softTo = inlineRules.soft_line_break.exec(src)
    if (softTo) {
      const len = softTo[0].length
      pushPending()
      tokens.push({
        type: 'soft_line_break',
        raw: softTo[0],
        lineBreak: softTo[1],
        isAtEnd: softTo.input.length === softTo[0].length,
        parent: tokens,
        range: {
          start: pos,
          end: pos + len
        }
      })
      src = src.substring(len)
      pos += len
      continue
    }
    // hard line break
    const hardTo = inlineRules.hard_line_break.exec(src)
    if (hardTo) {
      const len = hardTo[0].length
      pushPending()
      tokens.push({
        type: 'hard_line_break',
        raw: hardTo[0],
        spaces: hardTo[1], // The space in hard line break
        lineBreak: hardTo[2], // \n
        isAtEnd: hardTo.input.length === hardTo[0].length,
        parent: tokens,
        range: {
          start: pos,
          end: pos + len
        }
      })
      src = src.substring(len)
      pos += len
      continue
    }

    // tail header
    const tailTo = inlineRules.tail_header.exec(src)
    if (tailTo && top) {
      pushPending()
      tokens.push({
        type: 'tail_header',
        raw: tailTo[1],
        marker: tailTo[1],
        parent: tokens,
        range: {
          start: pos,
          end: pos + tailTo[1].length
        }
      })
      src = src.substring(tailTo[1].length)
      pos += tailTo[1].length
      continue
    }

    if (!pending) pendingStartPos = pos
    pending += src[0]
    src = src.substring(1)
    pos++
  }

  pushPending()
  return tokens
}

export const tokenizer = (src, {
  highlights = [],
  hasBeginRules = true,
  labels = new Map(),
  options = {}
} = {}) => {
  // v2026-07-31 起：echo_anno 规则由 inlineRules.echo_anno 全局共享引用决定（已被
  // setEchoAnnoRule / 初始化注入）——调用方不再传 options.echoAnnoRule，避免和
  // inlineRules 的 mutate 路径出现两套真相。tokenizerFac 闭包引用 inlineRules.echo_anno，
  // mutate 之后下一次进 tokenizer 就能拿到新 RE。
  const rules = Object.assign({}, inlineRules, inlineExtensionRules)
  const tokens = tokenizerFac(src, hasBeginRules ? beginRules : null, rules, 0, true, labels, options)

  const postTokenizer = tokens => {
    for (const token of tokens) {
      for (const light of highlights) {
        const highlight = union(token.range, light)
        if (highlight) {
          if (token.highlights && Array.isArray(token.highlights)) {
            token.highlights.push(highlight)
          } else {
            token.highlights = [highlight]
          }
        }
      }
      if (token.children && Array.isArray(token.children)) {
        postTokenizer(token.children)
      }
    }
  }
  if (highlights.length) {
    postTokenizer(tokens)
  }

  return tokens
}

// v2026-07-31 新增：运行时改写 inlineRules.echo_anno，便于 Memocast Settings 切换
// 「语法解析 / echoRequireParens」后，**不用重建 Muya** 即可让后续 parse 走新规则。
//
// 这是**唯一**推荐的运行时切换入口（与本仓库 plugin-vue-version.mdc + rune-echo-cloudfn-experimental.mdc
// 的「不动外部契约、直接改本地源码」口径一致）：
//   - 入口处 mutate 全局共享的 inlineRules.echo_anno 引用；
//   - 下一次 contentState.backspaceCtrl / deleteCtrl / inputCtrl / formatCtrl / enterCtrl 等
//     模块调 tokenizer()（以及 renderLeafBlock.js / importMarkdown.js 的 parseEchoInlineToken /
//     StateRender.hasEchoInlineToken / getLinkInfo / getImageInfo 等）都闭包引用 inlineRules.echo_anno，
//     自然拿到新 RE，**无需**在 options 上传 echoAnnoRule，也不会出现两套真相。
//   - 已解析过的 block 不会被本函数回滚；Memocast 调用方负责触发整页重渲染。
//
// 用法（Memocast Muya.vue）：
//   import { setEchoAnnoRule } from 'coolma-muya/lib'
//   import DatabaseClient from 'src/utils/DatabaseClient'
//   const raw = await DatabaseClient.appState.get('setting/parsing/echoRequireParens')
//   setEchoAnnoRule({ requireParens: raw !== false })
//   // 切换时再调一次 + contentState.render(false, true) 触发全量重 render。
//
//   requireParens=true（默认）→ () 必填；false → () 可选。
export const setEchoAnnoRule = ({ requireParens = true } = {}) => {
  inlineRules.echo_anno = createEchoAnnoRule({ requireParens })
  return inlineRules.echo_anno
}

// transform `tokens` to text ignore the range of the token
// the opposite of tokenizer
export const generator = tokens => {
  let result = ''
  for (const token of tokens) {
    result += token.raw
  }
  return result
}
