/**
 * 光标换算：Muya 引擎（CodeMirror 口径）↔ Monaco（Position 口径）。
 *
 * 两套口径差 1：
 * - 引擎 `getCursor()` / `setCursor()` 收发的 `{ line, ch }` 是 **0-based**（原版 Muya 约定）；
 * - Monaco 的 `Position` 是 **1-based** `{ lineNumber, column }`；
 * 直接互传会整体错一行，所以必须集中在这里换算，别在组件里各写一份。
 */

export interface MuyaCursorPoint {
  line: number;
  ch: number;
}

export interface MuyaCursor {
  anchor?: MuyaCursorPoint | null;
  focus?: MuyaCursorPoint | null;
}

export interface MonacoPosition {
  lineNumber: number;
  column: number;
}

const toSafeInt = (value: unknown, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : fallback;
};

/** 引擎光标 → Monaco 位置。取 focus 端（有选区时即光标所在端），缺值兜底到头。 */
export function muyaCursorToPosition(cursor: MuyaCursor | null | undefined): MonacoPosition {
  const point = cursor?.focus ?? cursor?.anchor ?? null;
  return {
    lineNumber: Math.max(1, toSafeInt(point?.line, 0) + 1),
    column: Math.max(1, toSafeInt(point?.ch, 0) + 1),
  };
}

/** Monaco 位置 → 引擎光标（单点，anchor=focus）。 */
export function positionToMuyaCursor(position: MonacoPosition | null | undefined): {
  anchor: MuyaCursorPoint;
  focus: MuyaCursorPoint;
} {
  const line = Math.max(0, toSafeInt(position?.lineNumber, 1) - 1);
  const ch = Math.max(0, toSafeInt(position?.column, 1) - 1);
  return { anchor: { line, ch }, focus: { line, ch } };
}
