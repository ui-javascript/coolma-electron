/**
 * 笔记列表右键菜单（复刻 vue2 contextMenu/noteList）。
 *
 * 项与顺序按 vue2 原样：重命名 / 复制笔记 / 复制 Markdown 内容 / 分隔 / 移动 / 导出(二级：Markdown、PNG)
 * / 分隔 / 榜单 / 分隔 / 删除。
 *
 * 与 vue2 的差异（报备）：
 *  - 榜单分层（OPEN_TIER_RANKING_FOR_NOTE）在 vue3 还没复刻，项保留但置灰，避免菜单形状与 vue2 不一致。
 *  - vue2 的「导出」整项 enabled=isCurrentNote，这里落到二级项上（父项只做容器，不可单独点击）。
 */
export interface NoteListMenuInput {
  isCurrentNote: boolean;
  tierRankingReady?: boolean;
}

export function buildNoteListMenu(input: NoteListMenuInput) {
  return [
    { id: 'rename', label: '重命名' },
    { id: 'duplicate', label: '复制笔记' },
    { id: 'copyMarkdown', label: '复制完整内容' },
    { type: 'separator' as const, label: '' },
    { id: 'move', label: '移动' },
    {
      id: 'export',
      label: '导出',
      enabled: input.isCurrentNote,
      children: [
        { id: 'exportMarkdown', label: 'Markdown', enabled: input.isCurrentNote },
        { id: 'exportPng', label: 'PNG', enabled: input.isCurrentNote },
      ],
    },
    { type: 'separator' as const, label: '' },
    { id: 'tierRanking', label: '从夯到拉', enabled: input.tierRankingReady === true },
    { type: 'separator' as const, label: '' },
    { id: 'delete', label: '删除', danger: true },
  ];
}
