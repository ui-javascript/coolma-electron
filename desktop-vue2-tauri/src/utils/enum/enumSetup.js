/**
 * enum-plus 全局扩展
 *
 * 给所有 enum 实例挂三个常用元数据快捷访问器。**必须在业务 enum 实例
 * 创建之前调用**，否则那些早期创建的实例拿不到这些方法（enum-plus v3 的
 * prototype 查找行为）。
 *
 *   - i18nKey(value)   -> 等价于 enum.label(value)；因为 boot/i18n.js 设置了
 *                          `Enum.localize = i18n.t`，此方法会**自动翻译**，
 *                          直接返回当前 locale 文案。注意名字虽然叫 i18nKey，
 *                          但返回的并不是 i18n key 而是翻译后的字符串。
 *   - tagType(value)   -> 拿 enum 项里写的 tagType，没写返回 null
 *   - iconOf(value)    -> 拿 enum 项里写的 icon
 *
 * 注：真实使用时由 index.js 在所有业务 enum 实例之前 import 触发。
 * 通过给 Enum 函数本身挂一个标记属性来确保这行 import 不被 webpack
 * tree-shaking 优化掉（纯副作用 import 在某些优化级别下会被消除）。
 */

import { Enum } from 'enum-plus'

Enum.extends({
  i18nKey (value) {
    return this.label(value)
  },
  tagType (value) {
    const item = this.findBy('value', value)
    return item && item.raw && item.raw.tagType ? item.raw.tagType : null
  },
  iconOf (value) {
    const item = this.findBy('value', value)
    return item && item.raw && item.raw.icon ? item.raw.icon : null
  }
})

// 副作用守卫：引用 Enum 函数本身，确保这整个文件不被 tree-shaking 消除。
// Enum 本身已经在这个文件顶部被 import 并使用，所以这里只是显式引用。
// @__PURE__ 注释故意不写，让 bundler 知道这里有真实的模块引用关系。
void Enum