/**
 * 窗口状态纯规则（移植 vue2 `electron-window-state` 的恢复意图）：
 * - 记住 x/y/width/height/maximized；
 * - 尺寸不小于 minWidth/minHeight，也不超过所在屏幕 workArea；
 * - 保存的位置完全跑到屏幕外时，退回主屏居中，避免窗口“消失”。
 *
 * 这里不碰 fs / electron，L3 可直接测。
 */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState extends WindowBounds {
  maximized: boolean;
}

export interface WorkArea extends WindowBounds {}

export interface WindowDefaults {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseWindowState(raw: unknown): WindowState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Record<string, unknown>;
  if (!isFiniteNumber(item.x) || !isFiniteNumber(item.y)) {
    return null;
  }
  if (!isFiniteNumber(item.width) || item.width <= 0 || !isFiniteNumber(item.height) || item.height <= 0) {
    return null;
  }
  return {
    x: Math.round(item.x),
    y: Math.round(item.y),
    width: Math.round(item.width),
    height: Math.round(item.height),
    maximized: item.maximized === true,
  };
}

function intersectionArea(a: WindowBounds, b: WorkArea): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) {
    return 0;
  }
  return (right - left) * (bottom - top);
}

function centeredBounds(workArea: WorkArea, defaults: WindowDefaults): WindowBounds {
  const width = Math.min(Math.max(defaults.width, defaults.minWidth), workArea.width);
  const height = Math.min(Math.max(defaults.height, defaults.minHeight), workArea.height);
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

/**
 * 按屏幕 workArea 修正保存的窗口位置/尺寸。
 * `workAreas[0]` 约定为主屏，完全离屏时回主屏居中。
 */
export function fitWindowBounds(
  state: WindowState | null,
  workAreas: WorkArea[],
  defaults: WindowDefaults,
): WindowState {
  const primary = workAreas[0] ?? { x: 0, y: 0, width: defaults.width, height: defaults.height };
  if (!state) {
    return { ...centeredBounds(primary, defaults), maximized: false };
  }

  let target = primary;
  let bestArea = 0;
  for (const area of workAreas) {
    const overlap = intersectionArea(state, area);
    if (overlap > bestArea) {
      bestArea = overlap;
      target = area;
    }
  }

  if (bestArea <= 0) {
    return { ...centeredBounds(primary, defaults), maximized: state.maximized };
  }

  const width = Math.min(Math.max(state.width, defaults.minWidth), target.width);
  const height = Math.min(Math.max(state.height, defaults.minHeight), target.height);
  const maxX = target.x + target.width - width;
  const maxY = target.y + target.height - height;
  return {
    x: Math.round(Math.min(Math.max(state.x, target.x), maxX)),
    y: Math.round(Math.min(Math.max(state.y, target.y), maxY)),
    width,
    height,
    maximized: state.maximized,
  };
}
