/**
 * 符文 SFC 里 `<style lang="scss|less">` 的预处理入口。
 *
 * 两条路径：
 * - **普通样式**（只有变量/嵌套）：本文件做变量替换 + `//` 行注释剥离，嵌套交给
 *   Chromium 原生 CSS Nesting（Electron 39 已支持），保持轻量。
 * - **高级语法**（出现 `@mixin`/`@include`/`@extend`/`#{}`，仅 scss/sass）：交给
 *   `runeScss.ts` 真正编译成扁平的普通 CSS。
 *
 * 未声明的变量原样保留，让作者能看出自己漏了声明，而不是被静默清空。
 * 纯函数、不碰 DOM，单测直接覆盖。
 */

import { compileRuneScss, hasAdvancedScss } from './runeScss';

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

  // 高级语法走真正的编译器：混入展开、@extend 合并、插值/颜色函数求值、嵌套拍平。
  // 只对 scss 生效；缩进式 sass 语法没有花括号，编译器会解析错，仍按原样保留并告警。
  if (language === 'scss' && hasAdvancedScss(cleaned)) {
    const compiled = compileRuneScss(cleaned, sigil);
    compiled.warnings.forEach((message) => console.warn(message));
    return compiled.css;
  }
  if (language === 'sass' && hasAdvancedScss(cleaned)) {
    console.warn('[muya-rune] 缩进式 sass 语法暂不编译高级指令，已按原样注入');
  }
  // Less 的高级语法（.mixin()/@extend 语义不同）暂不编译，保留原样并告警。
  if (sigil === '@' && /@(mixin|include|extend)\b/.test(cleaned)) {
    console.warn('[muya-rune] less 的 mixin/@extend 暂不编译，已按原样注入');
  }

  const variableRe = new RegExp(`(^|[;{}\\n])\\s*\\${sigil}([A-Za-z0-9_-]+)\\s*:\\s*([^;{}]+);`, 'g');
  const variables = new Map<string, string>();
  cleaned = cleaned.replace(variableRe, (_match: string, lead: string, name: string, value: string) => {
    variables.set(name, value.replace(/!\s*(default|global)\b/gi, '').trim());
    return lead;
  });

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
