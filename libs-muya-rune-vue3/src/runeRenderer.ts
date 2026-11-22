import * as Vue from 'vue';
import { compile } from '@vue/compiler-dom';

type AnyRecord = Record<string, any>;

const STYLE_BLOCK_RE = /<style\b([^>]*)>([\s\S]*?)<\/style>/i;

function section(source: string, tag: string): string {
  const open = source.indexOf('<' + tag);
  if (open < 0) return '';
  const start = source.indexOf('>', open);
  const end = source.indexOf('</' + tag + '>', start);
  return start < 0 || end < 0 ? '' : source.slice(start + 1, end).trim();
}

/** 稳定 scopeId：同一 rune 每次编译得到同一个 data-v-*。 */
function runeScopeId(rune: AnyRecord): string {
  const key = String(rune.id || rune.name || 'default');
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `data-v-${(hash >>> 0).toString(36)}`;
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === separator && depth === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

/** 找到 :deep()/::v-deep() 调用的括号范围，返回 head 与内部选择器位置。 */
function findDeepCall(source: string): { head: string; inner: string } | null {
  for (const marker of [':deep(', '::v-deep(']) {
    const start = source.indexOf(marker);
    if (start < 0) continue;
    let depth = 0;
    let quote = '';
    for (let i = start + marker.length - 1; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          return { head: source.slice(0, start).trim(), inner: source.slice(start + marker.length, i).trim() };
        }
      }
    }
  }
  return null;
}

/** 给单个选择器的最后一个 compound 加 [data-v-*]，伪类/伪元素前插入。 */
export function scopeSelector(selector: string, scopeId: string): string {
  const source = selector.trim();
  if (!source) return source;
  const globalMatch = source.match(/^:global\(([\s\S]*)\)$/);
  if (globalMatch) return globalMatch[1];
  const attr = `[${scopeId}]`;
  // :deep()/::v-deep() 表示作用域到此为止：头部照常加 data-v，内部选择器保持全局命中。
  const deep = findDeepCall(source);
  if (deep) {
    const head = deep.head ? scopeSelector(deep.head, scopeId) : attr;
    return deep.inner ? `${head} ${deep.inner}` : head;
  }

  let depth = 0;
  let lastCombinator = -1;
  let quote = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === ' ' || ch === '\t' || ch === '\n' || ch === '>' || ch === '+' || ch === '~')) {
      lastCombinator = i;
    }
  }
  const prefix = source.slice(0, lastCombinator + 1);
  const compound = source.slice(lastCombinator + 1);
  if (!compound) return source;

  let insertion = compound.length;
  depth = 0;
  quote = '';
  for (let i = 0; i < compound.length; i++) {
    const ch = compound[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && ch === ':') { insertion = i; break; }
  }
  return `${prefix}${compound.slice(0, insertion)}${attr}${compound.slice(insertion)}`;
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 1;
  let quote = '';
  for (let i = openIndex + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

function scopeBlock(source: string, scopeId: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { out += source[i++]; continue; }
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    if (source[i] === '@') {
      let j = i;
      let depth = 0;
      while (j < source.length) {
        const ch = source[j];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0 && (ch === ';' || ch === '{')) break;
        j++;
      }
      const prelude = source.slice(i, j);
      if (source[j] === ';') {
        out += `${prelude};`;
        i = j + 1;
        continue;
      }
      if (j >= source.length) { out += prelude; break; }
      const close = findMatchingBrace(source, j);
      const body = source.slice(j + 1, close);
      if (/^@(?:-[a-z]+-)?keyframes\b/i.test(prelude)) {
        out += `${prelude}{${body}}`;
      } else if (/^@(?:media|supports|layer|container|document)\b/i.test(prelude)) {
        out += `${prelude}{${scopeBlock(body, scopeId)}}`;
      } else {
        out += `${prelude}{${body}}`;
      }
      i = close + 1;
      continue;
    }

    let j = i;
    let depth = 0;
    let quote = '';
    while (j < source.length) {
      const ch = source[j];
      if (quote) {
        if (ch === '\\') j++;
        else if (ch === quote) quote = '';
        j++;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; j++; continue; }
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (depth === 0 && ch === '{') break;
      j++;
    }
    if (j >= source.length) { out += source.slice(i); break; }
    const selectors = splitTopLevel(source.slice(i, j), ',')
      .map((item) => scopeSelector(item, scopeId))
      .join(',');
    const close = findMatchingBrace(source, j);
    out += `${selectors}{${source.slice(j + 1, close)}}`;
    i = close + 1;
  }
  return out;
}

/** 复刻 Vue `<style scoped>`：只保留命中 `[data-v-*]` 的节点。 */
export function scopeCss(css: string, scopeId: string): string {
  if (!css || !scopeId) return css;
  return scopeBlock(css, scopeId);
}

/**
 * 把 SFC 的 `<style>` 注入 document.head。
 * v2 的 runeSfcRendererFactory 也是这么做的；v3 之前只编译 template/script，
 * 内置符文里的 padding、边框、字号等 scoped 样式全部丢失。
 */
function ensureRuneStyle(rune: AnyRecord, css: string): void {
  if (!css || typeof document === 'undefined') return;
  const rawId = String(rune.id || rune.name || 'default').replace(/[^a-zA-Z0-9_-]/g, '-');
  const styleId = `rune-style-${rawId}`;
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  if (styleEl.textContent !== css) {
    styleEl.textContent = css;
  }
}

function evaluateScript(source: string): AnyRecord {
  const body = String(source || '').replace('export default', 'return');
  try {
    const result = new Function(body)();
    return result && typeof result === 'object' ? result : {};
  } catch (error) {
    console.warn('[muya-rune] script evaluation failed', error);
    return {};
  }
}

function compileTemplate(source: string): ((this: AnyRecord) => any) | null {
  if (!source) return null;
  try {
    const result = compile(source, { mode: 'function' });
    return new Function('Vue', result.code)(Vue) as (this: AnyRecord) => any;
  } catch (error) {
    console.warn('[muya-rune] template compilation failed', error);
    return null;
  }
}

function declaredProps(component: AnyRecord): AnyRecord {
  if (Array.isArray(component.props)) return component.props.reduce((out: AnyRecord, name: string) => { out[name] = null; return out; }, {});
  return component.props && typeof component.props === 'object' ? { ...component.props } : {};
}

export function createRuneRendererCtor(rune: AnyRecord = {}): any {
  if (rune && rune.propsData) {
    const ctor = createRuneRendererCtor(rune.propsData.rune || {});
    return ctor ? ctor(rune) : null;
  }
  const source = String(rune.template || '');
  const template = section(source, 'template');
  const script = evaluateScript(section(source, 'script'));
  const styleMatch = source.match(STYLE_BLOCK_RE);
  const styleAttrs = styleMatch ? styleMatch[1] : '';
  const style = styleMatch ? styleMatch[2].trim() : '';
  const scoped = /\bscoped\b/i.test(styleAttrs);
  const scopeId = scoped ? runeScopeId(rune) : '';
  // `<style lang="less|scss">` 目前没有预处理器，内置模板的 less 块本身是扁平 CSS，
  // 直接按 CSS 使用；真正的嵌套语法仍属于单独缺口，不能在这里假装编译了。
  ensureRuneStyle(rune, scoped ? scopeCss(style, scopeId) : style);
  const render = compileTemplate(template);
  if (!render) return null;
  const props = declaredProps(script);
  const allProps = { runeId: null, nodeId: null, rune: null, value: null, onValueChange: null, onInput: null, ...props };
  const component = Vue.defineComponent({ ...script, props: allProps, render });
  if (scopeId) (component as AnyRecord).__scopeId = scopeId;
  return function RuneRenderer(options: AnyRecord = {}) {
    const state = Vue.reactive({ ...(options.propsData || {}) });
    // v2 模板只写 `this.$emit('input', next)`，挂载层也只注入 onValueChange。
    // Vue 3 会把 emit('input') 找成 onInput，这里补一层桥，否则输入永远写不回 Markdown。
    state.onInput = (next: unknown) => {
      const handler = (state as AnyRecord).onValueChange;
      if (typeof handler === 'function') {
        handler({
          runeId: (state as AnyRecord).runeId || '',
          nodeId: (state as AnyRecord).nodeId || '',
          value: next,
        });
      }
    };
    const root = document.createElement('div');
    root.className = 'muya-rune-vue-host';
    const app = Vue.createApp({ render: () => Vue.h(component, state) });
    app.mount(root);
    const vm: AnyRecord = { $el: root, $options: { props }, __runeRenderKey: '', $mount: () => vm, $destroy: () => { app.unmount(); root.remove(); } };
    Object.keys(allProps).forEach((key) => { Object.defineProperty(vm, key, { configurable: true, enumerable: true, get: () => state[key], set: (value) => { state[key] = value; } }); });
    return vm;
  };
}

export default createRuneRendererCtor;
