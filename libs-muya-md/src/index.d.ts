import type MarkdownIt from 'markdown-it'

export interface MuyaMarkdownOptions {
  /** 回响宿主组件名，默认 EchoHost */
  echoComponent?: string
  /** 符文宿主组件名，默认 RuneHost */
  runeComponent?: string
}

export declare function createMuyaMarkdown(options?: MuyaMarkdownOptions): (md: MarkdownIt) => void
export declare function normalizeProps(raw: string): string

declare const muyaMarkdown: (md: MarkdownIt) => void
export default muyaMarkdown
