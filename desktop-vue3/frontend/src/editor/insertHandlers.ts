import { createEchoInsertHandler } from 'libs-echo-core';
import { createRuneInsertHandler } from 'libs-rune-core';

/**
 * @ 快捷面板的类型处理器（应用侧实现）。
 *
 * 引擎只提供 `options.quickInsertTypes` 这个注册表 + 几个插入原语；
 * 这里放的是 desktop-vue3 自己的领域语义，vue2 可以按需实现一套完全不同的。
 * 符文、回响的插入语义已经放在 `libs-rune-core` / `libs-echo-core`，桌面端与
 * vuepress/vitepress 复用同一份，不再依赖引擎内置实现。
 */
export interface QuickInsertHandlerContext {
  /** 把当前 @query 替换成纯文本，光标落在末尾。 */
  replaceAtTrigger: (text: string) => boolean;
  /** 把当前 @query 替换成 html 富内容，光标落在末尾。 */
  insertHtmlAtTrigger?: (html: string) => boolean;
  getBlockText?: () => string;
  isInlineTrigger?: () => boolean;
  getPreviousLine?: () => { text?: string; isPlainText?: boolean; removeTarget?: unknown } | null;
  removeLine?: (target: unknown) => boolean;
}

export interface QuickInsertHandlerItem {
  meta?: {
    type?: string;
    noteTitle?: string;
    noteId?: number;
    runeName?: string;
    insertContent?: string;
    echoName?: string;
    [key: string]: unknown;
  };
}

/** 笔记引用：插入 `[[标题]]` 纯文本引用。 */
function insertNoteReference(item: QuickInsertHandlerItem, context: QuickInsertHandlerContext): boolean {
  const title = String(item?.meta?.noteTitle ?? '').trim();
  if (!title) {
    return false;
  }
  return context.replaceAtTrigger(`[[${title}]]`);
}

export const quickInsertTypes: Record<
  string,
  (item: QuickInsertHandlerItem, context: QuickInsertHandlerContext) => boolean
> = {
  note: insertNoteReference,
  rune: createRuneInsertHandler() as unknown as (
    item: QuickInsertHandlerItem,
    context: QuickInsertHandlerContext,
  ) => boolean,
  echo: createEchoInsertHandler() as unknown as (
    item: QuickInsertHandlerItem,
    context: QuickInsertHandlerContext,
  ) => boolean,
};
