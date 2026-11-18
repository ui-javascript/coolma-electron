/**
 * 符文 / 回响 分类的业务规则 helper
 *
 * enum-plus 提供 `has(value)` 做存在性判断，但不携带业务侧归类规则；
 * 真正的"内置 echo 必须落到 builtin/showy，非内置未指定则归 marker"
 * 这种**业务归一化逻辑**放在这里，文件不依赖具体 enum 的字段值。
 */

import { EchoCategoryEnum, DEFAULT_ECHO_CATEGORY } from 'src/utils/enum'

/**
 * 把任意 raw 字符串归一成 echo category value。
 *
 *   - 已合法 → 原样回（字符串）
 *   - 非法 + 是内置 echo 且 echoCategory 合法 → 用 echoCategory（builtin / showy）
 *   - 非法 + 是内置 echo → fallback 'builtin'
 *   - 非法 + 非内置 → fallback DEFAULT_ECHO_CATEGORY（marker）
 *
 * 业务方应当只把 helper 用于「从用户/外部读入、可能不合法」的 raw 串；
 * 内部已校验过的数据不要套，会浪费判断。
 */
export function normalizeEchoCategory (raw, isBuiltin = false, echoCategory = null) {
  const value = String(raw || '').trim()
  if (EchoCategoryEnum.has(value)) return value
  if (isBuiltin) {
    if (echoCategory && EchoCategoryEnum.has(echoCategory)) return echoCategory
    return EchoCategoryEnum.Builtin
  }
  return DEFAULT_ECHO_CATEGORY
}