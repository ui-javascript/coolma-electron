/** Vue 2 的内置 ID 前缀，以及 Vue 3 migration v3 已落库的两张示例卡。 */
export function isBuiltinLibraryCard(id: string): boolean {
  return id.startsWith('__builtin_') || id === 'builtin-rune-counter' || id === 'builtin-echo-demo';
}
