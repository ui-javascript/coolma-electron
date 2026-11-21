/**
 * 编辑器右键菜单（复刻 vue2 contextMenu/muya）。
 *
 * 顺序：前插段 / 后插段 / 分隔 / 剪切 / 复制 / 粘贴 / 分隔 / 复制为 Markdown / 复制为 HTML
 * / 分隔 / 粘贴为纯文本 / 盘古格式化 / 分隔 / 生成思维导图。
 *
 * 启用条件按 vue2：选区为空（start===end）时 CUT / COPY / COPY_AS_HTML / COPY_AS_MARKDOWN 全置灰。
 * 盘古格式化由 panguReady 控制；编辑器就绪后启用，未就绪时置灰。
 */
export interface MuyaMenuInput {
  selectionEmpty: boolean;
  mindmapReady?: boolean;
  panguReady?: boolean;
  locked?: boolean;
}

export function buildMuyaMenu(input: MuyaMenuInput) {
  const hasSelection = !input.selectionEmpty;
  const canEdit = !input.locked;
  return [
    { id: 'insertBefore', label: '在此之前插入段落', enabled: canEdit },
    { id: 'insertAfter', label: '在此之后插入段落', enabled: canEdit },
    { type: 'separator' as const, label: '' },
    { id: 'cut', label: '剪切', enabled: canEdit && hasSelection },
    { id: 'copy', label: '复制', enabled: hasSelection },
    { id: 'paste', label: '粘贴', enabled: canEdit },
    { type: 'separator' as const, label: '' },
    { id: 'copyAsMarkdown', label: '复制 Markdown 文本', enabled: hasSelection },
    { id: 'copyAsHtml', label: '复制 HTML 文本', enabled: hasSelection },
    { type: 'separator' as const, label: '' },
    { id: 'pasteAsPlainText', label: '以纯文本形式粘贴', enabled: canEdit },
    { id: 'formatDocument', label: '格式化文档', enabled: canEdit && input.panguReady === true },
    { type: 'separator' as const, label: '' },
    { id: 'mindmap', label: '生成思维导图', enabled: input.mindmapReady !== false },
  ];
}
