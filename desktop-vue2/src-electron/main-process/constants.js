/**
 * WizNote 同步相关常量（主进程版本）
 * 主进程和渲染进程的 notes.category 根目录必须保持一致，否则去重 key 不对称。
 */

module.exports = {
  DEFAULT_ROOT_CATEGORY: '/My Notes/',
  OFFLINE_ROOT_CATEGORY_KEY: 'offline_my_notes',
}
