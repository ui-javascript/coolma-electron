/**
 * 主界面三态布局（复刻 vue2 `client.cyclePaneLayout`）：
 *   0 = 目录/日历 + 笔记列表 + 编辑器（左栏内部上下分割）
 *   1 = 笔记列表 + 编辑器（目录收起，列表占满左栏）
 *   2 = 仅编辑器
 *
 * 几何按 vue2 的 px 语义：外层左栏固定宽度，左栏内部上块固定高度。
 * 纯函数，runtime-test 直接测。
 */
export type PaneLayoutMode = 0 | 1 | 2;

export const PANE_LAYOUT_STORAGE = 'coolma.paneLayoutMode';

/** 外层左栏宽度（px），对齐 vue2 `splitterWidth`。 */
export const SPLITTER_WIDTH_STORAGE = 'coolma.splitterWidth';

/** 左栏内部上块高度（px），对齐 vue2 `leftInnerSplitterRatio`。 */
export const LEFT_INNER_HEIGHT_STORAGE = 'coolma.leftInnerSplitterHeight';

export const DEFAULT_SPLITTER_WIDTH = 580;
export const MIN_SPLITTER_WIDTH = 300;
export const DEFAULT_LEFT_INNER_HEIGHT = 240;
export const MIN_LEFT_INNER_HEIGHT = 120;

/** 窗口过窄时优先保编辑器，给右侧留的最小宽度。 */
export const MIN_EDITOR_WIDTH = 320;

export interface PaneVisibility {
  sidebar: boolean;
  list: boolean;
  editor: boolean;
}

export interface PaneGeometry {
  splitterWidth: number;
  leftInnerHeight: number;
}

export function normalizePaneLayout(value: unknown): PaneLayoutMode {
  const n = Number(value);
  return n === 1 || n === 2 ? n : 0;
}

export function nextPaneLayout(mode: PaneLayoutMode): PaneLayoutMode {
  return ((mode + 1) % 3) as PaneLayoutMode;
}

/** 与 vue2 的 noteListVisible / categoryTreeVisible 一致。 */
export function paneVisibility(mode: PaneLayoutMode): PaneVisibility {
  return {
    sidebar: mode === 0,
    list: mode !== 2,
    editor: true,
  };
}

/**
 * 外层左栏宽度归一化：
 * - 非数/非正数回退 580；
 * - 不小于 300；
 * - 窗口过窄时允许缩到可用宽度，避免把编辑器挤没。
 */
export function normalizeSplitterWidth(
  value: unknown,
  maxWidth = Number.POSITIVE_INFINITY,
): number {
  const n = Number(value);
  const ceiling = Number.isFinite(maxWidth) ? Math.max(0, maxWidth) : Number.POSITIVE_INFINITY;
  const min = Math.min(MIN_SPLITTER_WIDTH, ceiling);
  const desired = Number.isFinite(n) && n > 0 ? n : DEFAULT_SPLITTER_WIDTH;
  return Math.round(Math.max(min, Math.min(desired, ceiling)));
}

/**
 * 左栏内部上块高度归一化：
 * - 非数/非正数回退 240；
 * - 不小于 120；
 * - 左栏本身过矮时允许缩到可用高度。
 */
export function normalizeLeftInnerHeight(
  value: unknown,
  maxHeight = Number.POSITIVE_INFINITY,
): number {
  const n = Number(value);
  const ceiling = Number.isFinite(maxHeight) ? Math.max(0, maxHeight) : Number.POSITIVE_INFINITY;
  const min = Math.min(MIN_LEFT_INNER_HEIGHT, ceiling);
  const desired = Number.isFinite(n) && n > 0 ? n : DEFAULT_LEFT_INNER_HEIGHT;
  return Math.round(Math.max(min, Math.min(desired, ceiling)));
}

/** 把三态和原始几何合成实际渲染值；模式 1/2 不保留上块空槽。 */
export function paneGeometry(
  mode: PaneLayoutMode,
  splitterWidth: unknown,
  leftInnerHeight: unknown,
  availableWidth = Number.POSITIVE_INFINITY,
): PaneGeometry {
  if (mode === 2) {
    return { splitterWidth: 0, leftInnerHeight: 0 };
  }
  const width = normalizeSplitterWidth(splitterWidth, Math.max(0, availableWidth - MIN_EDITOR_WIDTH));
  return {
    splitterWidth: width,
    leftInnerHeight: mode === 0 ? normalizeLeftInnerHeight(leftInnerHeight) : 0,
  };
}
