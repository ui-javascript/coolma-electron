/**
 * 符文 SFC 里 `<style lang="scss|less">` 的最小预处理：变量替换 + `//` 行注释剥离。
 *
 * 刻意不做的部分：
 * - **嵌套**：Chromium 140+（Electron 39）已支持原生 CSS Nesting，`.a { .b {} }` 与 `&`
 *   直接交给浏览器，不再自己拍平，避免和原生规则打架。
 * - **mixin / @extend / 函数**（`darken()` 之类）：要在运行时跑整套预处理器，包体代价过大；
 *   原样注入（浏览器会忽略未知 at-rule），并打一条告警。
 * - 只替换能解析出的变量声明（支持链式引用，最多 5 轮）；未声明的变量原样保留，
 *   让作者能看出自己漏了声明，而不是被静默清空。
 *
 * 纯函数、不碰 DOM，单测直接覆盖。
 */

export function preprocessRuneStyle(css: string, lang = ''): string {
  const source = String(css || '');
  const language = String(lang || '').toLowerCase();
  if (!source.trim()) return '';
  if (language !== 'scss' && language !== 'sass' && language !== 'less') return source;

  const sigil = language === 'less' ? '@' : '$';

  // `//` 注释剥离：前面是 `:` 的是 http(s) 协议，不剥；引号内的内容保持不动。
  let cleaned = '';
  let quote = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      cleaned += ch;
      if (ch === '\\') { cleaned += source[++i] || ''; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cleaned += ch; continue; }
    if (ch === '/' && source[i + 1] === '/' && source[i - 1] !== ':') {
      while (i < source.length && source[i] !== '\n') i++;
      cleaned += '\n';
      continue;
    }
    cleaned += ch;
  }

  const variableRe = new RegExp(`(^|[;{}\\n])\\s*\\${sigil}([A-Za-z0-9_-]+)\\s*:\\s*([^;{}]+);`, 'g');
  const variables = new Map<string, string>();
  cleaned = cleaned.replace(variableRe, (_match: string, lead: string, name: string, value: string) => {
    variables.set(name, value.replace(/!\s*(default|global)\b/gi, '').trim());
    return lead;
  });

  if (/@(mixin|include|extend|function)\b/.test(cleaned)) {
    console.warn('[muya-rune] style 里出现 mixin/@extend/函数，运行时不做预处理，已按原样注入');
  }

  // 链式变量最多展开 5 轮，避免 A→B→A 的循环引用把字符串撑爆。
  for (let round = 0; round < 5 && variables.size; round++) {
    let changed = false;
    cleaned = cleaned.replace(new RegExp(`\\${sigil}([A-Za-z0-9_-]+)`, 'g'), (match: string, name: string) => {
      if (!variables.has(name)) return match;
      changed = true;
      return variables.get(name) as string;
    });
    if (!changed) break;
  }
  return cleaned.trim();
}

/** 从 `<style ...>` 的属性串里取 lang。 */
export function readStyleLang(styleAttrs: string): string {
  const match = String(styleAttrs || '').match(/\blang\s*=\s*["']?([A-Za-z0-9_-]+)/i);
  return match ? match[1].toLowerCase() : '';
}
