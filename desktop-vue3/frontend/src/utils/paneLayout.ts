/**
 * 主界面三态布局（复刻 vue2 `client.cyclePaneLayout`）：
 *   0 = 三栏：侧栏 + 笔记列表 + 编辑器
 *   1 = 两栏：笔记列表 + 编辑器（侧栏收起）
 *   2 = 单栏：只留编辑器
 * 纯函数，L3 直接测。
 */
export type PaneLayoutMode = 0 | 1 | 2;

export const PANE_LAYOUT_STORAGE = 'coolma.paneLayoutMode';

export interface PaneVisibility {
  sidebar: boolean;
  list: boolean;
  editor: boolean;
}

export interface PaneSizes {
  sidebar: number;
  list: number;
  editor: number;
}

export function normalizePaneLayout(value: unknown): PaneLayoutMode {
  const n = Number(value);
  return n === 1 || n === 2 ? n : 0;
}

export function nextPaneLayout(mode: PaneLayoutMode): PaneLayoutMode {
  return ((mode + 1) % 3) as PaneLayoutMode;
}

/** 与 vue2 的 noteListVisible / categoryTreeVisible 完全一致。 */
export function paneVisibility(mode: PaneLayoutMode): PaneVisibility {
  return {
    sidebar: mode === 0,
    list: mode !== 2,
    editor: true,
  };
}

export function paneSizes(mode: PaneLayoutMode): PaneSizes {
  if (mode === 2) {
    return { sidebar: 0, list: 0, editor: 100 };
  }
  if (mode === 1) {
    return { sidebar: 0, list: 30, editor: 70 };
  }
  return { sidebar: 18, list: 27, editor: 55 };
}
