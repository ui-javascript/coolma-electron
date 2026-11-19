/**
 * 编辑器右键菜单（复刻 vue2 contextMenu/muya）。
 *
 * 顺序：前插段 / 后插段 / 分隔 / 剪切 / 复制 / 粘贴 / 分隔 / 复制为 Markdown / 复制为 HTML
 * / 分隔 / 粘贴为纯文本 / 盘古格式化 / 分隔 / 生成思维导图。
 *
 * 启用条件按 vue2：选区为空（start===end）时 CUT / COPY / COPY_AS_HTML / COPY_AS_MARKDOWN 全置灰。
 * 盘古格式化在 vue3 未实现（vue2 走主进程），项保留但置灰。
 */
export interface MuyaMenuInput {
  selectionEmpty: boolean;
  mindmapReady?: boolean;
  panguReady?: boolean;
}

export function buildMuyaMenu(input: MuyaMenuInput) {
  const hasSelection = !input.selectionEmpty;
  return [
    { id: 'insertBefore', label: '在前面插入段落' },
    { id: 'insertAfter', label: '在后面插入段落' },
    { type: 'separator' as const, label: '' },
    { id: 'cut', label: '剪切', enabled: hasSelection },
    { id: 'copy', label: '复制', enabled: hasSelection },
    { id: 'paste', label: '粘贴' },
    { type: 'separator' as const, label: '' },
    { id: 'copyAsMarkdown', label: '复制为 Markdown', enabled: hasSelection },
    { id: 'copyAsHtml', label: '复制为 HTML', enabled: hasSelection },
    { type: 'separator' as const, label: '' },
    { id: 'pasteAsPlainText', label: '粘贴为纯文本' },
    { id: 'formatDocument', label: '盘古格式化', enabled: input.panguReady === true },
    { type: 'separator' as const, label: '' },
    { id: 'mindmap', label: '生成思维导图', enabled: input.mindmapReady !== false },
  ];
}
