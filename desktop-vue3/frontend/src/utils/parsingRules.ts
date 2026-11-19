/**
 * 语法解析开关的纯函数校验（复刻 vue2 utils/parsing/parsingRules.js）。
 * - echoRequireParens：回响占位符 @xxx{...}(prompt) 的 () 是否必须成对；
 * - runeRequireTemplateDiv：符文 <template> 块内是否必须含 <div>。
 */
export function hasEchoParens(annoSource = '', echoName = ''): boolean {
  const name = String(echoName ?? '').trim();
  if (!name || !String(annoSource ?? '')) {
    return false;
  }
  const text = String(annoSource);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`@${escaped}(?:\\{[\\s\\S]*?\\})?\\([^)]*\\)`, 'g');
  return re.test(text);
}

export function hasRuneTemplateDiv(source = ''): boolean {
  const text = String(source ?? '');
  if (!text) {
    return false;
  }
  const templateRe = /<template[^>]*>([\s\S]*?)<\/template>/gi;
  for (const m of text.matchAll(templateRe)) {
    const body = m[1]
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '');
    if (/<div[\s>/]/.test(body)) {
      return true;
    }
  }
  return false;
}
