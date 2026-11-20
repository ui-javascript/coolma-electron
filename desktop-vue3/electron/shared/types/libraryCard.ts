/** Vue 2 的内置 ID 前缀，加上 v3 自己的示例符文 id。 */
export function isBuiltinLibraryCard(id: string): boolean {
  return id.startsWith('__builtin_') || id === 'builtin-rune-counter';
}
