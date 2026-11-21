/** 双编辑器统一的 Markdown 选区快照。Muya / Monaco 各自捕获，AI 改写共用。 */
export interface EditorSelectionSnapshot {
  /** 捕获时的整篇 Markdown；替换前用它判断正文是否已变化。 */
  markdown: string;
  /** 选区起止字符偏移（按 Markdown 文本计）。 */
  start: number;
  end: number;
  /** 选中的原文。 */
  text: string;
}

/** 选区变化时用于摆悬浮条：空选区不显示，坐标是视口坐标。 */
export interface EditorSelectionHint {
  empty: boolean;
  x: number;
  y: number;
}
