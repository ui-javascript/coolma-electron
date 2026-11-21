/**
 * 时间格式化工具
 *
 * 从 src/utils/helper.js 抽出 `displayDateElegantly`，作为"友好时间表达"通用工具。
 * 任何 .vue / .js 中都可以通过 `this.$utils.dateUtil.displayDateElegantly(...)` 调用。
 *
 * 文案走 i18n：键 `justNow` / `minutesAgo` / `hoursAgo` / `daysAgo` 定义在
 * src/i18n/zh-cn/utils.js 与 src/i18n/en-us/utils.js，切换语言时同步刷新。
 */

import { i18n } from 'boot/i18n'

/**
 * 友好时间表达
 * @param {number} date 毫秒数
 * @returns {string} Just Now / 10 minutes ago / 2 hours ago / 3 days ago / 2024/1/1
 */
export function displayDateElegantly (date) {
  let currentTime = new Date().getTime()
  currentTime = (currentTime - date) / 1000

  if (currentTime < 60 * 10) {
    // 十分钟内
    return i18n.t('justNow')
  }
  if (currentTime < 60 * 60 && currentTime >= 60 * 10) {
    // 超过十分钟少于1小时
    const num = Math.floor(currentTime / 60)
    return i18n.t('minutesAgo', { num, plural: num > 1 ? 's' : '' })
  }
  if (currentTime < 60 * 60 * 24 && currentTime >= 60 * 60) {
    // 超过1小时少于24小时
    const num = Math.floor(currentTime / 60 / 60)
    return i18n.t('hoursAgo', { num, plural: num > 1 ? 's' : '' })
  }
  if (currentTime < 60 * 60 * 24 * 7 && currentTime >= 60 * 60 * 24) {
    // 超过1天少于7天内
    const num = Math.floor(currentTime / 60 / 60 / 24)
    return i18n.t('daysAgo', { num, plural: num > 1 ? 's' : '' })
  }
  // 超过7天
  const d = new Date(date)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}