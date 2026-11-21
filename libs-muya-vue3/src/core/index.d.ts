export interface MuyaWordCount {
  word: number;
  paragraph: number;
  character: number;
  all: number;
  line: number;
}

export interface MuyaChangePayload {
  markdown: string;
  wordCount?: MuyaWordCount;
  cursor?: unknown;
  history?: unknown;
  toc?: unknown;
}

export interface MuyaSelectionSnapshot {
  markdown: string;
  start: number;
  end: number;
  text: string;
}

export interface MuyaOptions {
  markdown?: string;
  mode?: 'normal' | 'preview';
  theme?: string;
  focusMode?: boolean;
  fontSize?: number;
  lineHeight?: number;
  [key: string]: unknown;
}

/**
 * 一次注册整套 UI 插件（@ 面板、代码块/表情/图片选择器、格式面板等）。
 * 幂等：重复调用不会重复注册。返回已注册的插件数量。
 */
export function installDefaultUiPlugins(linkToolsOptions?: Record<string, unknown>): number;

export default class Muya {
  constructor(container: string | HTMLElement, options?: MuyaOptions);
  readonly container: HTMLElement;
  on(event: string, listener: (payload: any) => void): void;
  off(event: string, listener: (payload: any) => void): void;
  getMarkdown(): string;
  setMarkdown(markdown: string, cursor?: unknown, isRenderCursor?: boolean): void;
  getCursor(): { anchor?: { line: number; ch: number }; focus?: { line: number; ch: number } } | null;
  getSelectionInfo(): MuyaSelectionSnapshot | null;
  replaceSelectionSnapshot(snapshot: MuyaSelectionSnapshot, replacement: string): boolean;
  setCursor(cursor: unknown): void;
  getWordCount(markdown: string): MuyaWordCount;
  hideAllFloatTools(): void;
  copyAsMarkdown(): void;
  copyAsHtml(): void;
  pasteAsPlainText(): void;
  insertParagraph(location: 'before' | 'after', text?: string, outMost?: boolean): void;
  updateParagraph(type: string): void;
  duplicate(): void;
  deleteParagraph(): void;
  format(type: string): void;
  undo(): void;
  redo(): void;
  selectAll(): void;
  focus(): void;
  blur(isRemoveAllRange?: boolean, unSelect?: boolean): void;
  destroy(): void;
}
