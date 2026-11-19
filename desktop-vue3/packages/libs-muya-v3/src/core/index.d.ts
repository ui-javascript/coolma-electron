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

/**
 * 一次注册整套 UI 插件（@ 面板、代码块/表情/图片选择器、格式面板等）。
 * 幂等：重复调用不会重复注册。返回已注册的插件数量。
 */
export function installDefaultUiPlugins(linkToolsOptions?: Record<string, unknown>): number;

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
