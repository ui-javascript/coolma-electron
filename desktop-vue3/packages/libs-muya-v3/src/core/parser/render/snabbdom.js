import * as snabbdomNs from 'snabbdom';
import classModule from 'snabbdom/modules/class';
import attributesModule from 'snabbdom/modules/attributes';
import styleModule from 'snabbdom/modules/style';
import propsModule from 'snabbdom/modules/props';
import datasetModule from 'snabbdom/modules/dataset';
import eventListenersModule from 'snabbdom/modules/eventlisteners';
import { h } from 'snabbdom/h';
import * as toHTMLNs from 'snabbdom-to-html';
import * as toVNodeNs from 'snabbdom/tovnode';

/**
 * snabbdom 0.7 有两种入口形态：浏览器打包器走 es/（纯 ESM，只有命名导出），
 * Node/CJS 走包根（exports 对象）。这里统一成"命名空间 + 取成员"，
 * 两边都能拿到函数，不再依赖 default 导入。
 */
const init = snabbdomNs.init ?? snabbdomNs.default?.init;
const toHTML = typeof toHTMLNs === 'function' ? toHTMLNs : (toHTMLNs.toHTML ?? toHTMLNs.default ?? toHTMLNs);
const toVNode =
  toVNodeNs.toVNode ?? (typeof toVNodeNs.default === 'function' ? toVNodeNs.default : toVNodeNs.default?.toVNode);

if (typeof init !== 'function' || typeof toHTML !== 'function' || typeof toVNode !== 'function') {
  throw new TypeError('[libs-muya-v3] snabbdom 依赖解析失败（init/toHTML/toVNode），检查打包器 CJS 互操作');
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
