type Messages = Record<string, unknown>;

export type { Messages };

/** library 节点里真正属于「卡片管理」的键（其余都是历次迭代误塞进来的扁平键）。 */
const LIBRARY_OWN_KEYS = new Set([
  'management', 'runesTab', 'echoesTab', 'runesTitle', 'echoesTitle', 'add', 'empty', 'dragHint',
  'name', 'namePlaceholder', 'desc', 'descPlaceholder', 'color', 'category', 'source',
  'aiGenerateRune', 'aiGenerateEcho', 'githubImport', 'remoteRuneTitle', 'remoteRuneUrlLabel',
  'remoteRuneUrlPlaceholder', 'remoteRuneHint', 'remoteRuneCategoryLabel', 'remoteRuneAuto',
  'remoteRuneImport', 'remoteRuneDone', 'remoteRuneFailed', 'remoteRuneTooLarge', 'remoteRuneDuplicate',
  'icon', 'echoAnnoSource', 'echoSyntax', 'echoSyntaxName', 'echoSyntaxHint',
  'runeTemplateContent', 'templatePreset', 'templatePresetPlaceholder', 'templateHint', 'resetTemplate',
  'templatePlaceholder', 'annoPlaceholder', 'inherit', 'inheritHint', 'newRune', 'editRune',
  'newEcho', 'editEcho', 'nameRequired', 'saveFailed', 'saveSuccess', 'deleteFailed',
  'deleteSuccess', 'sortFailed', 'deleteConfirm',
  'builtinBadge', 'builtinHint', 'noBuiltins', 'editCard', 'viewCard', 'selectionHint',
  'batchDelete', 'deleteSelected', 'batchDeleteConfirm', 'batchDeleteSuccess', 'batchDeletePartial',
  'exportCategory', 'exportRunes', 'exportEchoes', 'exportCount', 'exportMore',
]);

/**
 * 历史遗留修正：前几批把 `'search.title'`、`groupGeneral`、`aiEntry`、`'pack.import'`
 * 这类根级键误写进了 `library` 对象里（缩进错位），`t('search.title')` 根本查不到，
 * 界面会直接显示 key。这里在初始化时把它们提升回根级：带点的按路径建树，
 * 不带点的直接挂根；`library` 只保留卡片管理自己的键。
 */
function nestDottedKeys(messages: Messages): void {
  Object.keys(messages).forEach((key) => {
    if (!key.includes('.')) {
      return;
    }
    const value = messages[key];
    delete messages[key];
    const parts = key.split('.');
    let node = messages;
    parts.slice(0, -1).forEach((part) => {
      const next = node[part];
      if (!next || typeof next !== 'object') {
        node[part] = {};
      }
      node = node[part] as Messages;
    });
    const leaf = parts[parts.length - 1];
    if (node[leaf] === undefined) {
      node[leaf] = value;
    }
  });
}

export function hoistMisplacedKeys(messages: Messages): Messages {
  const library = messages.library as Messages | undefined;
  if (!library) {
    return messages;
  }
  const moved: Array<[string, unknown]> = [];
  Object.keys(library).forEach((key) => {
    if (!LIBRARY_OWN_KEYS.has(key)) {
      moved.push([key, library[key]]);
      delete library[key];
    }
  });
  moved.forEach(([key, value]) => {
    if (!key.includes('.')) {
      messages[key] = value;
      return;
    }
    const parts = key.split('.');
    let node = messages;
    parts.slice(0, -1).forEach((part) => {
      const next = node[part];
      if (!next || typeof next !== 'object') {
        node[part] = {};
      }
      node = node[part] as Messages;
    });
    const leaf = parts[parts.length - 1];
    if (node[leaf] === undefined) {
      node[leaf] = value;
    }
  });
  nestDottedKeys(messages);
  return messages;
}
