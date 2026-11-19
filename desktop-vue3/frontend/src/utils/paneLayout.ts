/**
 * 主界面三态布局（复刻 vue2 `client.cyclePaneLayout`）：
 *   0 = 三栏：侧栏 + 笔记列表 + 编辑器
 *   1 = 两栏：笔记列表 + 编辑器（侧栏收起）
 *   2 = 单栏：只留编辑器
 * 纯函数，L3 直接测。
 */
export type PaneLayoutMode = 0 | 1 | 2;

export const PANE_LAYOUT_STORAGE = 'coolma.paneLayoutMode';
export const PANE_SIZES_STORAGE = 'coolma.paneSizes';

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

/**
 * 拖拽后的百分比合法性校验：长度必须对得上当前模式，全部 > 0，总和允许
 * ±5% 误差，否则视为损坏数据回退默认值。
 */
export function normalizePaneSizeList(mode: PaneLayoutMode, values: unknown): number[] | null {
  if (mode === 2 || !Array.isArray(values)) {
    return null;
  }
  const expected = mode === 0 ? 3 : 2;
  if (values.length !== expected) {
    return null;
  }
  const numbers = values.map((value) => Number(value));
  if (numbers.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }
  const total = numbers.reduce((sum, value) => sum + value, 0);
  if (total < 95 || total > 105) {
    return null;
  }
  return numbers;
}

/** 把拖拽后的百分比数组转成 PaneSizes；非法返回 null（调用方回退默认）。 */
export function paneSizesFromList(mode: PaneLayoutMode, values: unknown): PaneSizes | null {
  const list = normalizePaneSizeList(mode, values);
  if (!list) {
    return null;
  }
  if (mode === 0) {
    return { sidebar: list[0], list: list[1], editor: list[2] };
  }
  return { sidebar: 0, list: list[0], editor: list[1] };
}
