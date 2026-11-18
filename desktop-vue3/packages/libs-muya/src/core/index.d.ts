export interface MuyaChangePayload {
  markdown: string;
  wordCount?: number;
  cursor?: unknown;
  history?: unknown;
  toc?: unknown;
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

export default class Muya {
  constructor(container: string | HTMLElement, options?: MuyaOptions);
  on(event: string, listener: (payload: any) => void): void;
  off(event: string, listener: (payload: any) => void): void;
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  getWordCount(markdown?: string): number;
  focus(): void;
  blur(isRemoveAllRange?: boolean, unSelect?: boolean): void;
  destroy(): void;
}
