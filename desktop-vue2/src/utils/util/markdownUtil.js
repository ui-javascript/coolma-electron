/**
 * Markdown 文本处理工具
 *
 * 从 src/utils/helper.js 抽出 markdown 相关清理 / 抽取方法。
 * 任何 .vue / .js 中都可以通过 `this.$utils.markdownUtil.xxx()` 调用。
 */

import lodash from 'lodash'

/**
 * 渲染笔记列表时移除 markdown 标签
 * @param {string} markdown
 */
export function removeMarkdownTag (markdown) {
  markdown = markdown || ''
  const patterns = [/#/g, /!?\[.*]\(.*\)/g, />/g, /\\+/g, /\\-/g]
  patterns.forEach(pattern => (markdown = markdown.replace(pattern, '')))
  return markdown
}

/**
 * 从 markdown 中抽出纯文本（用于目录树 / 链接卡片预览）
 * @param {string} markdown
 * @returns {string}
 */
export function extractMarkdownContent (markdown) {
  const linkPattern = /!?\[(.*)\]\(.*\)/
  const emphasizePattern = /\*?(.*)\*?/
  if (linkPattern.test(markdown)) {
    const matches = markdown.match(linkPattern)
    markdown = matches[1]
  }
  if (emphasizePattern.test(markdown)) {
    const matches = markdown.match(emphasizePattern)
    markdown = matches[1]
  }
  return lodash.trim(markdown || '')
}

/**
 * 从数组里随机取一个元素
 * @template T
 * @param {T[]} targetArray
 * @returns {T}
 */
export function generateRandomResult (targetArray) {
  if (!targetArray || !targetArray.length) return undefined
  const rnd = Math.floor(Math.random() * targetArray.length)
  return targetArray[rnd]
}