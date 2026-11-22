/**
 * 符文样式里 SCSS 高级语法的最小编译器（不引第三方预处理器依赖）。
 *
 * 覆盖范围：
 * - `@mixin name($a, $b: default) { ... }` + `@include name(...)`（含嵌套 include、局部变量）
 * - `@extend .foo` / `@extend %placeholder`（同文件内选择器合并）
 * - `#{}` 插值、数字四则运算、`percentage()`/`round()` 等少量数值函数
 * - 常用颜色函数：darken/lighten/saturate/desaturate/rgba/opacify/transparentize/mix
 * - 嵌套规则拍平（含 `&` 与简单 `@media`/`@supports` 冒泡）
 *
 * 明确不支持（会告警并保留原样，避免静默破坏样式）：
 * - `@function` 自定义函数、`@if`/`@each`/`@for` 控制流、`@import`、`@use`
 * - `@include name { ... }`（带 @content 的块式 include）
 */

export interface CompiledStyle {
  css: string;
  warnings: string[];
}

type Node =
  | { kind: 'rule'; selector: string; children: Node[] }
  | { kind: 'at'; name: string; prelude: string; children: Node[] }
  | { kind: 'raw'; text: string };

interface MixinDef {
  params: string;
  body: string;
}

interface ExtendRequest {
  from: string[];
  target: string;
}

interface OutRule {
  selectors: string[];
  decls: string[];
  at: string[];
  placeholder: boolean;
}

/** 是否含需要真正编译的高级语法。 */
export function hasAdvancedScss(src: string): boolean {
  return /@(mixin|include|extend|function|if|each|for|while|import|use)\b|#\{|\b(darken|lighten|saturate|desaturate|mix|opacify|transparentize|fade-in|fade-out)\s*\(/.test(String(src || ''));
}

export function compileRuneScss(source: string, sigil = '$'): CompiledStyle {
  const warnings: string[] = [];
  if (/@(function|if|each|for|while|import|use)\b/.test(source)) {
    warnings.push('[muya-rune] style 里出现 @function/@if/@import 等，暂不支持，已按原样注入');
    return { css: applyVariables(source, sigil), warnings };
  }

  const mixins = new Map<string, MixinDef>();
  const stripped = extractMixins(source, mixins);
  let text = expandIncludes(stripped, mixins, warnings, 0);
  text = applyVariables(text, sigil);
  text = evaluateInterpolations(text);
  text = evaluateFunctions(text);

  const [nodes] = parseNodes(text, 0);
  const { rules, extends: extendList } = collect(nodes, null, [], warnings);
  const merged = applyExtends(rules, extendList, warnings);
  return { css: serialize(merged).trim(), warnings };
}

// ---------------------------------------------------------------- mixin / include

function extractMixins(source: string, mixins: Map<string, MixinDef>): string {
  let rest = '';
  let i = 0;
  while (i < source.length) {
    const at = source.indexOf('@mixin', i);
    if (at < 0) { rest += source.slice(i); break; }
    rest += source.slice(i, at);
    const nameMatch = source.slice(at).match(/^@mixin\s+([A-Za-z0-9_-]+)\s*(\(([^)]*)\))?[ \t]*\{/);
    if (!nameMatch) { rest += source.slice(at, at + 6); i = at + 6; continue; }
    const head = at + nameMatch[0].length;
    const end = findBlockEnd(source, head - 1);
    if (end < 0) { rest += source.slice(at); break; }
    mixins.set(nameMatch[1], { params: nameMatch[3] || '', body: source.slice(head, end) });
    i = end + 1;
  }
  if (/@mixin\b/.test(source) === false) return source;
  return rest;
}

function findBlockEnd(source: string, openIndex: number): number {
  let depth = 0;
  let quote = '';
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function expandIncludes(source: string, mixins: Map<string, MixinDef>, warnings: string[], depth: number): string {
  if (depth > 8) return source;
  const pattern = /@include\s+([A-Za-z0-9_-]+)\s*(?:\(([^;{}]*)\))?\s*;/g;
  return source.replace(pattern, (match: string, name: string, argsRaw: string) => {
    const mixin = mixins.get(name);
    if (!mixin) {
      warnings.push(`[muya-rune] @include ${name} 未找到对应 @mixin，保留原样`);
      return match;
    }
    const body = bindParams(mixin, argsRaw || '', warnings);
    const withVars = applyVariables(body, '$');
    return expandIncludes(withVars, mixins, warnings, depth + 1);
  });
}

function bindParams(mixin: MixinDef, argsRaw: string, warnings: string[]): string {
  const params = splitTopLevel(mixin.params, ',').map((p) => p.trim()).filter(Boolean);
  const args = splitTopLevel(argsRaw, ',').map((a) => a.trim()).filter(Boolean);
  const bindings = new Map<string, string>();
  const positional: string[] = [];
  args.forEach((arg) => {
    const kw = arg.match(/^\$([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (kw) bindings.set(kw[1], kw[2].trim());
    else positional.push(arg);
  });
  params.forEach((param, index) => {
    const parsed = param.match(/^\$([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    const rawName = (parsed ? parsed[1] : param).replace(/\$/g, '').trim();
    if (/\$\w+\s*:/.test(param) && /\.\.\.$/.test(param)) warnings.push('[muya-rune] 可变参数 ... 未完整支持');
    if (bindings.has(rawName)) return;
    if (index < positional.length) bindings.set(rawName, positional[index]);
    else if (parsed) bindings.set(rawName, parsed[2].trim());
  });
  return substituteVariables(mixin.body, bindings);
}

function substituteVariables(body: string, bindings: Map<string, string>): string {
  let out = body;
  bindings.forEach((value, name) => {
    out = out.replace(new RegExp(`\\$${esc(name)}\\b`, 'g'), value);
  });
  return out;
}

function applyVariables(source: string, sigil: string): string {
  if (sigil !== '$') return source;
  const variableRe = /(^|[;{}\n])\s*\$([A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/g;
  const variables = new Map<string, string>();
  let text = source.replace(variableRe, (_m: string, lead: string, name: string, value: string) => {
    variables.set(name, value.replace(/!\s*(default|global)\b/gi, '').trim());
    return lead;
  });
  for (let round = 0; round < 5 && variables.size; round++) {
    let changed = false;
    text = text.replace(/\$([A-Za-z0-9_-]+)/g, (match: string, name: string) => {
      if (!variables.has(name)) return match;
      changed = true;
      return variables.get(name) as string;
    });
    if (!changed) break;
  }
  return text;
}

// ---------------------------------------------------------------- 插值 / 函数

function evaluateInterpolations(source: string): string {
  return source.replace(/#\{([^{}]+)\}/g, (_m: string, expr: string) => {
    const value = evalExpression(expr.trim());
    return value == null ? `#{${expr}}` : value;
  });
}

function evaluateFunctions(source: string): string {
  const known = /(darken|lighten|saturate|desaturate|rgba|mix|opacify|fade-in|transparentize|fade-out|percentage|round|ceil|floor)\(([^()]*)\)/gi;
  for (let round = 0; round < 4; round++) {
    let changed = false;
    const next = source.replace(known, (match: string, name: string, args: string) => {
      const value = evalFunction(name.toLowerCase(), splitTopLevel(args, ',').map((a) => a.trim()));
      if (value == null) return match;
      changed = true;
      return value;
    });
    source = next;
    if (!changed) break;
  }
  return source;
}

function evalFunction(name: string, args: string[]): string | null {
  const rgb = (v: string) => parseColor(v);
  switch (name) {
    case 'darken': {
      const color = rgb(args[0]);
      if (!color) return null;
      const [h, s, l] = rgbToHsl([color[0], color[1], color[2]]);
      return formatColor(hslToRgb(h, s, Math.max(0, l - percent(args[1]))));
    }
    case 'lighten': {
      const color = rgb(args[0]);
      if (!color) return null;
      const [h, s, l] = rgbToHsl([color[0], color[1], color[2]]);
      return formatColor(hslToRgb(h, s, Math.min(1, l + percent(args[1]))));
    }
    case 'saturate':
    case 'desaturate': {
      const color = rgb(args[0]);
      if (!color) return null;
      const [h, s, l] = rgbToHsl([color[0], color[1], color[2]]);
      const delta = percent(args[1]) * (name === 'saturate' ? 1 : -1);
      return formatColor(hslToRgb(h, Math.min(1, Math.max(0, s + delta)), l));
    }
    case 'rgba': {
      if (args.length < 2) return null;
      const color = rgb(args[0]);
      if (!color) {
        const direct = args.slice(0, 3).map((v) => numeric(v));
        const alpha = numeric(args[3] || '1');
        if (direct.some((n) => n == null) || alpha == null) return null;
        return `rgba(${direct[0]}, ${direct[1]}, ${direct[2]}, ${trimNum(alpha)})`;
      }
      const alpha = numeric(args[1]);
      if (alpha == null) return null;
      return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${trimNum(alpha)})`;
    }
    case 'mix': {
      const a = rgb(args[0]);
      const b = rgb(args[1]);
      if (!a || !b) return null;
      const weight = args[2] ? percent(args[2]) : 0.5;
      return formatColor([
        Math.round(a[0] * weight + b[0] * (1 - weight)),
        Math.round(a[1] * weight + b[1] * (1 - weight)),
        Math.round(a[2] * weight + b[2] * (1 - weight)),
      ]);
    }
    case 'opacify':
    case 'fade-in':
    case 'transparentize':
    case 'fade-out': {
      const color = rgb(args[0]);
      if (!color) return null;
      const alpha = 1 - (color[3] ?? 1);
      const delta = percent(args[1]) * (name === 'opacify' || name === 'fade-in' ? -1 : 1);
      const next = Math.min(1, Math.max(0, alpha + delta));
      return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${trimNum(1 - next)})`;
    }
    case 'percentage': {
      const n = numeric(args[0]);
      return n == null ? null : `${trimNum(n * 100)}%`;
    }
    case 'round':
    case 'ceil':
    case 'floor': {
      const parsed = parseNumber(args[0]);
      if (!parsed) return null;
      const fn = name === 'round' ? Math.round : name === 'ceil' ? Math.ceil : Math.floor;
      return `${trimNum(fn(parsed.value))}${parsed.unit}`;
    }
    default:
      return null;
  }
}

function evalExpression(expr: string): string | null {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(expr)) return expr;
  const direct = numeric(expr);
  if (direct != null) return trimNum(direct);
  const fn = expr.match(/([A-Za-z-]+)\(([^()]*)\)/);
  if (fn) {
    const value = evalFunction(fn[1].toLowerCase(), splitTopLevel(fn[2], ',').map((a) => a.trim()));
    if (value != null) return value;
  }
  const arith = expr.match(/^([\d.]+)([A-Za-z%]*)\s*([+\-*/])\s*([\d.]+)([A-Za-z%]*)$/);
  if (arith) {
    const left = Number(arith[1]);
    const right = Number(arith[4]);
    const unit = arith[2] || arith[5];
    const result = arith[3] === '+' ? left + right
      : arith[3] === '-' ? left - right
        : arith[3] === '*' ? left * right : right === 0 ? null : left / right;
    return result == null ? null : `${trimNum(result)}${unit}`;
  }
  return null;
}

// ---------------------------------------------------------------- 解析 / 拍平

function parseNodes(src: string, start: number): [Node[], number] {
  const nodes: Node[] = [];
  let buf = '';
  let i = start;
  const flush = () => {
    const text = buf.trim();
    buf = '';
    if (!text) return;
    nodes.push({ kind: 'raw', text });
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      buf += ch; i++;
      while (i < src.length) {
        const c = src[i];
        buf += c; i++;
        if (c === '\\') { buf += src[i] || ''; i++; continue; }
        if (c === quote) break;
      }
      continue;
    }
    if (ch === '{') {
      const header = buf.trim();
      buf = '';
      const [children, next] = parseNodes(src, i + 1);
      i = next;
      const at = header.match(/^@([A-Za-z-]+)\s*(.*)$/);
      if (at) nodes.push({ kind: 'at', name: at[1].toLowerCase(), prelude: at[2].trim(), children });
      else nodes.push({ kind: 'rule', selector: header, children });
      continue;
    }
    if (ch === '}') { flush(); return [nodes, i + 1]; }
    if (ch === ';') { flush(); i++; continue; }
    buf += ch; i++;
  }
  flush();
  return [nodes, i];
}

function collect(nodes: Node[], parent: string[] | null, atStack: string[], warnings: string[]): { rules: OutRule[]; extends: ExtendRequest[] } {
  const rules: OutRule[] = [];
  const extendsList: ExtendRequest[] = [];
  const walk = (list: Node[], parents: string[] | null, at: string[], owner: OutRule | null) => {
    list.forEach((node) => {
      if (node.kind === 'raw') {
        const text = node.text.trim();
        if (/^@extend\b/.test(text)) {
          const targets = text.replace(/^@extend\b/, '').replace(/;/, '').split(',').map((s) => s.trim()).filter(Boolean);
          if (!owner) { warnings.push('[muya-rune] @extend 不在规则块内，已忽略'); return; }
          targets.forEach((target) => extendsList.push({ from: owner.selectors, target }));
          return;
        }
        if (/^@include\b/.test(text)) {
          warnings.push('[muya-rune] 块式 @include / @content 未支持，已保留原样');
        }
        if (owner) {
          owner.decls.push(text.endsWith(';') ? text : `${text};`);
          return;
        }
        if (/^@(charset|import|use)\b/.test(text)) { warnings.push(`[muya-rune] 顶层 at-rule 未处理：${text}`); return; }
        rules.push({ selectors: parents || [], decls: [text.endsWith(';') ? text : `${text};`], at, placeholder: false });
        return;
      }
      if (node.kind === 'rule') {
        const selectors = resolveSelectors(node.selector, parents);
        const placeholder = selectors.every((sel) => sel.startsWith('%'));
        const rule: OutRule = { selectors, decls: [], at, placeholder };
        rules.push(rule);
        walk(node.children, selectors, at, rule);
        return;
      }
      // at-rule 块
      if (node.name === 'keyframes' || node.name === '-webkit-keyframes') {
        const inner = serializeNodes(node.children);
        rules.push({ selectors: [], decls: [`@${node.name} ${node.prelude} {${inner}}`], at, placeholder: false });
        return;
      }
      const prelude = `@${node.name}${node.prelude ? ` ${node.prelude}` : ''}`;
      walk(node.children, parents, [...at, prelude], null);
    });
  };
  walk(nodes, parent, atStack, null);
  return { rules, extends: extendsList };
}

function resolveSelectors(selector: string, parents: string[] | null): string[] {
  const parts = splitTopLevel(selector, ',').map((s) => s.trim()).filter(Boolean);
  if (!parents || !parents.length) return parts.map((s) => s.replace(/&/g, '').trim());
  const out: string[] = [];
  parts.forEach((part) => {
    parents.forEach((p) => {
      out.push(part.includes('&') ? part.replace(/&/g, p) : `${p} ${part}`);
    });
  });
  return out;
}

function applyExtends(rules: OutRule[], requests: ExtendRequest[], warnings: string[]): OutRule[] {
  const index = new Map<string, OutRule[]>();
  rules.forEach((rule) => rule.selectors.forEach((sel) => {
    const list = index.get(sel) || [];
    list.push(rule);
    index.set(sel, list);
  }));
  requests.forEach((req) => {
    const targets = index.get(req.target) || [];
    if (!targets.length) { warnings.push(`[muya-rune] @extend ${req.target} 未找到目标选择器，已忽略`); return; }
    targets.forEach((rule) => {
      req.from.forEach((sel) => { if (!rule.selectors.includes(sel)) rule.selectors.push(sel); });
      rule.placeholder = rule.selectors.every((sel) => sel.startsWith('%'));
    });
  });
  return rules;
}

function serialize(rules: OutRule[]): string {
  return rules.map((rule) => {
    const inner = rule.decls.join(' ').trim();
    const selectors = rule.selectors.filter((sel) => !sel.startsWith('%'));
    if (!inner) return '';
    let body = selectors.length
      ? `${selectors.join(', ')} { ${inner} }`
      : selectors.length === 0 && rule.selectors.length === 0 ? inner : '';
    if (!body) return '';
    rule.at.slice().reverse().forEach((prelude) => { body = `${prelude} { ${body} }`; });
    return body;
  }).filter(Boolean).join('\n');
}

function serializeNodes(nodes: Node[]): string {
  return nodes.map((node) => {
    if (node.kind === 'raw') return node.text.trim().endsWith(';') ? node.text.trim() : `${node.text.trim()};`;
    if (node.kind === 'rule') return `${node.selector} { ${serializeNodes(node.children)} }`;
    return `@${node.name}${node.prelude ? ` ${node.prelude}` : ''} { ${serializeNodes(node.children)} }`;
  }).join(' ');
}

// ---------------------------------------------------------------- 工具

function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { buf += ch + (text[++i] || ''); continue; }
      if (ch === quote) quote = '';
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out;
}

function parseColor(value: string): [number, number, number, number?] | null {
  const text = value.trim().toLowerCase();
  const hex = text.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const rgb: [number, number, number] = [
        parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16),
      ];
      return h.length === 4 ? [...rgb, parseInt(h[3] + h[3], 16) / 255] : rgb;
    }
    if (h.length === 6 || h.length === 8) {
      const rgb: [number, number, number] = [
        parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
      ];
      return h.length === 8 ? [...rgb, parseInt(h.slice(6, 8), 16) / 255] : rgb;
    }
    return null;
  }
  if (text === 'white') return [255, 255, 255];
  if (text === 'black') return [0, 0, 0];
  if (text === 'transparent') return [0, 0, 0, 0];
  return null;
}

function formatColor(rgb: [number, number, number, number?]): string {
  const [r, g, b, a] = rgb;
  if (a != null && a < 1) return `rgba(${r}, ${g}, ${b}, ${trimNum(a)})`;
  return `#${[r, g, b].map((n) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl(rgb: [number, number, number]): [number, number, number] {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function parseNumber(value: string): { value: number; unit: string } | null {
  const match = String(value || '').trim().match(/^(-?(?:\d+\.?\d*|\.\d+))([A-Za-z%]*)$/);
  return match ? { value: Number(match[1]), unit: match[2] } : null;
}

function numeric(value: string): number | null {
  const parsed = parseNumber(value);
  return parsed ? parsed.value : null;
}

function percent(value: string): number {
  const parsed = parseNumber(value);
  if (!parsed) return 0;
  return parsed.unit === '%' ? parsed.value / 100 : parsed.value;
}

function trimNum(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function esc(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
