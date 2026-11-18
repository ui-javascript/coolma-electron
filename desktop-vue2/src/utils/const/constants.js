/**
 * WizNote 同步相关常量
 * 所有使用 OFFLINE_ROOT_CATEGORY 的地方必须从本模块导入，禁止重复定义。
 * 原因：根目录字符串必须全局唯一，否则会导致 pull/push 去重 key 不对称。
 */

export const OFFLINE_ROOT_CATEGORY = '/My Notes/'

export const OFFLINE_ROOT_CATEGORY_KEY = 'offline_my_notes'

export function normalizeNbsp (value) {
  return typeof value === 'string' ? value.replace(/\u00a0/g, ' ') : value
}

export function normalizeTitleForMatch (title) {
  const normalized = typeof title === 'string' ? normalizeNbsp(title).trim() : ''
  return normalized || 'Untitled'
}

export function buildNoteUniqueKey (category, title) {
  const normalizedCategory = normalizeCategoryForMatch(category)
  const normalizedTitle = normalizeTitleForMatch(title)
  return `${normalizedCategory}::${normalizedTitle}`.toLowerCase()
}

/**
 * 规范化 category 用于去重/search 匹配
 * - 将空值、/、/My Notes/、/我的笔记/ 统一为 OFFLINE_ROOT_CATEGORY
 * - 用于 dedupe key 构建和 search 匹配，不用于 API 上传
 */
export function normalizeCategoryForMatch (cat) {
  if (!cat ||
      cat === '/' ||
      cat === OFFLINE_ROOT_CATEGORY ||
      cat === '/我的笔记/' ||
      cat === 'OFFLINE_ROOT_CATEGORY') {
    return OFFLINE_ROOT_CATEGORY
  }
  return cat
}
