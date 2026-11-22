import * as Vue from 'vue';
import { compile } from '@vue/compiler-dom';

type AnyRecord = Record<string, any>;

function section(source: string, tag: string): string {
  const open = source.indexOf('<' + tag);
  if (open < 0) return '';
  const start = source.indexOf('>', open);
  const end = source.indexOf('</' + tag + '>', start);
  return start < 0 || end < 0 ? '' : source.slice(start + 1, end).trim();
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
  const style = section(source, 'style');
  ensureRuneStyle(rune, style);
  const render = compileTemplate(template);
  if (!render) return null;
  const props = declaredProps(script);
  const allProps = { runeId: null, nodeId: null, rune: null, value: null, onValueChange: null, ...props };
  const component = Vue.defineComponent({ ...script, props: allProps, render });
  return function RuneRenderer(options: AnyRecord = {}) {
    const state = Vue.reactive({ ...(options.propsData || {}) });
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
