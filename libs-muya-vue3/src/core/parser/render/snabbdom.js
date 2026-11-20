import * as snabbdomNs from 'snabbdom';
import classModule from 'snabbdom/modules/class';
import attributesModule from 'snabbdom/modules/attributes';
import styleModule from 'snabbdom/modules/style';
import propsModule from 'snabbdom/modules/props';
import eventListenersModule from 'snabbdom/modules/eventlisteners';
import { h } from 'snabbdom/h';
import * as toHTMLNs from 'snabbdom-to-html';
import * as toVNodeNs from 'snabbdom/tovnode';

/**
 * snabbdom 0.7 有两种入口形态：浏览器打包器走 es/（纯 ESM，只有命名导出），
 * Node/CJS 走包根（exports 对象）。这里统一成"命名空间 + 取成员"，
 * 两边都能拿到函数，不再依赖 default 导入。
 */
/**
 * 自己实现 dataset 模块：snabbdom 自带的版本把驼峰键直接拼成属性，
 * `{ echoNodeId }` 会写成 `data-echonodeid`，而引擎侧一律按 `data-echo-node-id` 读，
 * 结果就是"属性明明写了却永远查不到"。这里统一转 kebab-case。
 */
const toAttrName = (key) => ('data-' + key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()));

const removeDataset = (vnode) => {
  const data = vnode?.data?.dataset;
  const elm = vnode?.elm;
  if (!data || !elm) return;
  for (const key of Object.keys(data)) {
    elm.removeAttribute(toAttrName(key));
  }
};

const applyDataset = (vnode) => {
  const data = vnode?.data?.dataset;
  const elm = vnode?.elm;
  if (!data || !elm) return;
  for (const key of Object.keys(data)) {
    const value = data[key];
    const attr = toAttrName(key);
    if (value === undefined || value === null) {
      elm.removeAttribute(attr);
    } else {
      elm.setAttribute(attr, String(value));
    }
  }
};

const datasetModule = {
  create: (emptyVnode, vnode) => applyDataset(vnode),
  update: (oldVnode, vnode) => {
    if (oldVnode?.data?.dataset) removeDataset(oldVnode);
    applyDataset(vnode);
  },
  destroy: (vnode) => removeDataset(vnode)
};

const init = snabbdomNs.init ?? snabbdomNs.default?.init;
const toHTML = typeof toHTMLNs === 'function' ? toHTMLNs : (toHTMLNs.toHTML ?? toHTMLNs.default ?? toHTMLNs);
const toVNode =
  toVNodeNs.toVNode ?? (typeof toVNodeNs.default === 'function' ? toVNodeNs.default : toVNodeNs.default?.toVNode);

if (typeof init !== 'function' || typeof toHTML !== 'function' || typeof toVNode !== 'function') {
  throw new TypeError('[libs-muya-vue3] snabbdom 依赖解析失败（init/toHTML/toVNode），检查打包器 CJS 互操作');
}

export const patch = init([
  classModule,
  attributesModule,
  styleModule,
  propsModule,
  datasetModule,
  eventListenersModule,
]);

export { h, toHTML, toVNode };

export const htmlToVNode = (html) => {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  return toVNode(wrapper).children;
};
