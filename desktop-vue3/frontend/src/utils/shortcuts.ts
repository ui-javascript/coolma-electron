/**
 * 键盘 accelerator 表（逐条复刻 vue2 `src-electron/main-process/keyboard/shortcut.js`）。
 *
 * vue2 把表挂到应用菜单，格式类快捷键另外用 electronLocalshortcut 注册到
 * BrowserWindow；vue3 是无边框窗口且 `Menu.setApplicationMenu(null)`，所以由
 * 渲染层统一匹配、分发到应用动作或编辑器命令。动作语义保持不变：
 *
 *   edit / paragraph / format → Muya（源码模式只保留撤销、重做、全选、复制/纯文本粘贴）
 *   view / note              → 布局切换、源码模式、锁定、DevTools、保存、全库搜索
 *   cut / copy / paste       → 浏览器默认行为，不拦截
 *   mc.*                     → macOS 应用菜单角色，不拦截
 *
 * 匹配用 `event.code`（物理键）而不是 `event.key`：美式键盘上
 * `CmdOrCtrl+Shift+,` 的 key 是 `<`，`CmdOrCtrl+Shift+.` 的 key 是 `>`，
 * 用 key 会匹配不到表里的逗号/句点。
 */

export type ShortcutGroup = 'mc' | 'edit' | 'paragraph' | 'format' | 'view' | 'note';
export type ShortcutSource = 'vue2' | 'vue3';
export type AcceleratorModifier = 'cmd-or-ctrl' | 'command';

export type NativeShortcutCommand = 'cut' | 'copy' | 'paste' | 'hide' | 'hideOthers' | 'quit';
export type AppShortcutCommand =
  | 'save'
  | 'searchNote'
  | 'switchView'
  | 'toggleSourceMode'
  | 'toggleLock'
  | 'openDevTools'
  // 以下两条是 vue3 已有的本地别名，不在 vue2 表内。
  | 'createNote'
  | 'focusListSearch';
export type EditorShortcutCommand =
  | 'undo'
  | 'redo'
  | 'copyAsMarkdown'
  | 'pasteAsPlainText'
  | 'selectAll'
  | 'duplicate'
  | 'createParagraph'
  | 'deleteParagraph'
  | 'paragraph'
  | 'format'
  | 'formatDocument';

export type ShortcutAction =
  | { scope: 'native'; command: NativeShortcutCommand }
  | { scope: 'app'; command: AppShortcutCommand }
  | { scope: 'editor'; command: EditorShortcutCommand; value?: string };

export interface ShortcutBinding {
  id: string;
  group: ShortcutGroup;
  source: ShortcutSource;
  /** 与 vue2 KeyBindings 完全一致的 accelerator 文本，便于核对和展示。 */
  accelerator: string;
  /** `event.code`，由 accelerator 解析得到。 */
  code: string;
  shift: boolean;
  alt: boolean;
  modifier: AcceleratorModifier;
  action: ShortcutAction;
}

export interface ShortcutKeyEvent {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/** 菜单类 shortcut 不参与渲染层拦截（macOS 由系统应用菜单处理，剪贴板由浏览器处理）。 */
const native = (command: NativeShortcutCommand): ShortcutAction => ({ scope: 'native', command });
const app = (command: AppShortcutCommand): ShortcutAction => ({ scope: 'app', command });
const editor = (command: EditorShortcutCommand, value?: string): ShortcutAction => ({
  scope: 'editor',
  command,
  ...(value === undefined ? {} : { value }),
});

interface ShortcutDefinition {
  id: string;
  group: ShortcutGroup;
  accelerator: string;
  action: ShortcutAction;
  source?: ShortcutSource;
}

const KEY_CODES: Record<string, string> = {
  '=': 'Equal',
  '-': 'Minus',
  '`': 'Backquote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
};

function keyTokenToCode(token: string): string {
  if (/^[A-Z]$/.test(token)) {
    return `Key${token}`;
  }
  if (/^[0-9]$/.test(token)) {
    return `Digit${token}`;
  }
  const mapped = KEY_CODES[token];
  if (!mapped) {
    throw new Error(`[shortcuts] unsupported accelerator key "${token}"`);
  }
  return mapped;
}

/**
 * 解析 Electron accelerator 中本表用到的语法：
 * `CmdOrCtrl` / `Command` + 可选 `Shift` / `Alt` + 单个字符键。
 */
export function parseAccelerator(accelerator: string): Pick<ShortcutBinding, 'code' | 'shift' | 'alt' | 'modifier'> {
  const tokens = accelerator.split('+');
  if (tokens.length < 2) {
    throw new Error(`[shortcuts] invalid accelerator "${accelerator}"`);
  }

  const key = tokens[tokens.length - 1];
  const modifiers = tokens.slice(0, -1);
  let shift = false;
  let alt = false;
  let modifier: AcceleratorModifier | null = null;

  for (const token of modifiers) {
    if (token === 'Shift') {
      shift = true;
    } else if (token === 'Alt') {
      alt = true;
    } else if (token === 'CmdOrCtrl') {
      modifier = 'cmd-or-ctrl';
    } else if (token === 'Command' || token === 'Cmd') {
      modifier = 'command';
    } else {
      throw new Error(`[shortcuts] unsupported accelerator modifier "${token}"`);
    }
  }

  if (!modifier) {
    throw new Error(`[shortcuts] accelerator "${accelerator}" is missing CmdOrCtrl/Command`);
  }

  return {
    code: keyTokenToCode(key),
    shift,
    alt,
    modifier,
  };
}

/** vue2 的完整表；macOS 独有的 `mc.*` 只在 darwin 下加入。 */
function buildVue2Definitions(isMac: boolean): ShortcutDefinition[] {
  const list: ShortcutDefinition[] = [];

  if (isMac) {
    list.push(
      { id: 'mc.hide', group: 'mc', accelerator: 'Command+H', action: native('hide') },
      { id: 'mc.hide-others', group: 'mc', accelerator: 'Command+Alt+H', action: native('hideOthers') },
      { id: 'mc.quit', group: 'mc', accelerator: 'Command+Q', action: native('quit') },
    );
  }

  list.push(
    // Edit menu
    { id: 'edit.undo', group: 'edit', accelerator: 'CmdOrCtrl+Z', action: editor('undo') },
    { id: 'edit.redo', group: 'edit', accelerator: 'CmdOrCtrl+Shift+Z', action: editor('redo') },
    { id: 'edit.cut', group: 'edit', accelerator: 'CmdOrCtrl+X', action: native('cut') },
    { id: 'edit.copy', group: 'edit', accelerator: 'CmdOrCtrl+C', action: native('copy') },
    { id: 'edit.paste', group: 'edit', accelerator: 'CmdOrCtrl+V', action: native('paste') },
    {
      id: 'edit.copy-as-markdown',
      group: 'edit',
      accelerator: 'CmdOrCtrl+Shift+C',
      action: editor('copyAsMarkdown'),
    },
    {
      id: 'edit.paste-as-plaintext',
      group: 'edit',
      accelerator: 'CmdOrCtrl+Shift+V',
      action: editor('pasteAsPlainText'),
    },
    { id: 'edit.select-all', group: 'edit', accelerator: 'CmdOrCtrl+A', action: editor('selectAll') },
    { id: 'edit.duplicate', group: 'edit', accelerator: 'CmdOrCtrl+Alt+D', action: editor('duplicate') },
    {
      id: 'edit.create-paragraph',
      group: 'edit',
      accelerator: 'Shift+CmdOrCtrl+N',
      action: editor('createParagraph'),
    },
    {
      id: 'edit.delete-paragraph',
      group: 'edit',
      accelerator: 'Shift+CmdOrCtrl+D',
      action: editor('deleteParagraph'),
    },

    // Paragraph menu
    { id: 'paragraph.heading-1', group: 'paragraph', accelerator: 'CmdOrCtrl+1', action: editor('paragraph', 'heading 1') },
    { id: 'paragraph.heading-2', group: 'paragraph', accelerator: 'CmdOrCtrl+2', action: editor('paragraph', 'heading 2') },
    { id: 'paragraph.heading-3', group: 'paragraph', accelerator: 'CmdOrCtrl+3', action: editor('paragraph', 'heading 3') },
    { id: 'paragraph.heading-4', group: 'paragraph', accelerator: 'CmdOrCtrl+4', action: editor('paragraph', 'heading 4') },
    { id: 'paragraph.heading-5', group: 'paragraph', accelerator: 'CmdOrCtrl+5', action: editor('paragraph', 'heading 5') },
    { id: 'paragraph.heading-6', group: 'paragraph', accelerator: 'CmdOrCtrl+6', action: editor('paragraph', 'heading 6') },
    {
      id: 'paragraph.upgrade-heading',
      group: 'paragraph',
      accelerator: 'CmdOrCtrl+=',
      action: editor('paragraph', 'upgrade heading'),
    },
    {
      id: 'paragraph.degrade-heading',
      group: 'paragraph',
      accelerator: 'CmdOrCtrl+-',
      action: editor('paragraph', 'degrade heading'),
    },
    { id: 'paragraph.table', group: 'paragraph', accelerator: 'CmdOrCtrl+Shift+T', action: editor('paragraph', 'table') },
    { id: 'paragraph.code-fence', group: 'paragraph', accelerator: 'CmdOrCtrl+Alt+C', action: editor('paragraph', 'pre') },
    {
      id: 'paragraph.quote-block',
      group: 'paragraph',
      accelerator: 'CmdOrCtrl+Alt+Q',
      action: editor('paragraph', 'blockquote'),
    },
    {
      id: 'paragraph.math-formula',
      group: 'paragraph',
      accelerator: 'CmdOrCtrl+Alt+M',
      action: editor('paragraph', 'mathblock'),
    },
    {
      id: 'paragraph.html-block',
      group: 'paragraph',
      // vue2 macOS 用 J，Windows/Linux 用 H（macOS 的 Cmd+Alt+H 留给隐藏其他应用）
      accelerator: isMac ? 'CmdOrCtrl+Alt+J' : 'CmdOrCtrl+Alt+H',
      action: editor('paragraph', 'html'),
    },
    {
      id: 'paragraph.order-list',
      group: 'paragraph',
      accelerator: 'CmdOrCtrl+Alt+O',
      action: editor('paragraph', 'ol-order'),
    },
    {
      id: 'paragraph.bullet-list',
      group: 'paragraph',
      accelerator: 'CmdOrCtrl+Alt+U',
      action: editor('paragraph', 'ul-bullet'),
    },
    { id: 'paragraph.task-list', group: 'paragraph', accelerator: 'CmdOrCtrl+Alt+X', action: editor('paragraph', 'ul-task') },
    {
      id: 'paragraph.loose-list-item',
      group: 'paragraph',
      accelerator: 'CmdOrCtrl+Alt+L',
      action: editor('paragraph', 'loose-list-item'),
    },
    { id: 'paragraph.paragraph', group: 'paragraph', accelerator: 'CmdOrCtrl+0', action: editor('paragraph', 'paragraph') },
    {
      id: 'paragraph.horizontal-line',
      group: 'paragraph',
      accelerator: 'CmdOrCtrl+Alt+-',
      action: editor('paragraph', 'hr'),
    },
    {
      id: 'paragraph.front-matter',
      group: 'paragraph',
      accelerator: 'CmdOrCtrl+Alt+Y',
      action: editor('paragraph', 'front-matter'),
    },

    // Format menu
    { id: 'format.strong', group: 'format', accelerator: 'CmdOrCtrl+B', action: editor('format', 'strong') },
    { id: 'format.italic', group: 'format', accelerator: 'CmdOrCtrl+I', action: editor('format', 'em') },
    { id: 'format.underline', group: 'format', accelerator: 'CmdOrCtrl+U', action: editor('format', 'u') },
    { id: 'format.highlight', group: 'format', accelerator: 'Shift+CmdOrCtrl+H', action: editor('format', 'mark') },
    { id: 'format.inline-code', group: 'format', accelerator: 'CmdOrCtrl+`', action: editor('format', 'inline_code') },
    {
      id: 'format.inline-math',
      group: 'format',
      accelerator: 'Shift+CmdOrCtrl+M',
      action: editor('format', 'inline_math'),
    },
    { id: 'format.strike', group: 'format', accelerator: 'CmdOrCtrl+D', action: editor('format', 'del') },
    { id: 'format.hyperlink', group: 'format', accelerator: 'CmdOrCtrl+L', action: editor('format', 'link') },
    { id: 'format.image', group: 'format', accelerator: 'CmdOrCtrl+Shift+I', action: editor('format', 'image') },
    {
      id: 'format.format-document',
      group: 'format',
      accelerator: 'Shift+CmdOrCtrl+K',
      action: editor('formatDocument'),
    },
    { id: 'format.clear-format', group: 'format', accelerator: 'Shift+CmdOrCtrl+R', action: editor('format', 'clear') },

    // View menu
    { id: 'view.switch-view', group: 'view', accelerator: 'CmdOrCtrl+Shift+,', action: app('switchView') },
    { id: 'view.source-mode', group: 'view', accelerator: 'CmdOrCtrl+Shift+.', action: app('toggleSourceMode') },
    { id: 'view.lock-mode', group: 'view', accelerator: 'CmdOrCtrl+Shift+L', action: app('toggleLock') },
    { id: 'view.devtool', group: 'view', accelerator: 'CmdOrCtrl+Shift+P', action: app('openDevTools') },

    // Note menu
    { id: 'note.save', group: 'note', accelerator: 'CmdOrCtrl+S', action: app('save') },
    { id: 'note.search-note', group: 'note', accelerator: 'CmdOrCtrl+Shift+F', action: app('searchNote') },
  );

  return list;
}

/** vue3 原有的本地易用别名（不在 vue2 表内，保持现有用户手感）。 */
const VUE3_ALIASES: ShortcutDefinition[] = [
  { id: 'v3.note-new', group: 'note', accelerator: 'CmdOrCtrl+N', action: app('createNote'), source: 'vue3' },
  { id: 'v3.note-filter', group: 'note', accelerator: 'CmdOrCtrl+F', action: app('focusListSearch'), source: 'vue3' },
];

export function isMacPlatform(platform: string): boolean {
  return platform === 'darwin';
}

const cache = new Map<string, ShortcutBinding[]>();

/** 取当前平台的完整表；默认合并 vue3 已有的 Ctrl+N / Ctrl+F 别名。 */
export function getShortcutBindings(platform: string, includeVue3Aliases = true): ShortcutBinding[] {
  const key = `${platform}:${includeVue3Aliases ? 'with-alias' : 'vue2-only'}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const definitions = buildVue2Definitions(isMacPlatform(platform));
  const bindings = [...definitions, ...(includeVue3Aliases ? VUE3_ALIASES : [])].map((definition) => ({
    ...definition,
    source: definition.source ?? 'vue2',
    ...parseAccelerator(definition.accelerator),
  }));
  cache.set(key, bindings);
  return bindings;
}

/**
 * 找到当前按键对应的第一条 binding。
 * 修饰键按精确匹配：`Ctrl+S` 不会误触 `Ctrl+Shift+S`，`Ctrl+Alt+D` 也不会吃掉 `Ctrl+D`。
 */
export function matchShortcut(
  event: ShortcutKeyEvent,
  platform: string,
  includeVue3Aliases = true,
): ShortcutBinding | null {
  // 中文/日文输入法组合态不能触发编辑命令，否则会打断正在上屏的候选词。
  if (event.isComposing || event.keyCode === 229) {
    return null;
  }

  const isMac = isMacPlatform(platform);
  for (const binding of getShortcutBindings(platform, includeVue3Aliases)) {
    const primary = binding.modifier === 'command' ? event.metaKey : isMac ? event.metaKey : event.ctrlKey;
    const secondary = binding.modifier === 'command' ? event.ctrlKey : isMac ? event.ctrlKey : event.metaKey;
    if (
      primary &&
      !secondary &&
      event.shiftKey === binding.shift &&
      event.altKey === binding.alt &&
      event.code === binding.code
    ) {
      return binding;
    }
  }
  return null;
}
