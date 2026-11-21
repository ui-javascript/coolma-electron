/**
 * 通用判空工具
 *
 * 从 src/utils/helper.js 抽出 `isNullOrEmpty`，是项目里最高频的 util。
 * 任何 .vue / .js 中都可以通过 `this.$utils.emptyUtil.isNullOrEmpty(...)` 调用。
 */

import lodash from 'lodash'

/**
 * 判断值是否为 null / undefined / 空字符串 / 空数组 / 空对象
 * @param {*} obj
 * @returns {boolean}
 */
export function isNullOrEmpty (obj) {
  obj = lodash.toString(obj)
  return lodash.isNull(obj) || lodash.isEmpty(obj)
}