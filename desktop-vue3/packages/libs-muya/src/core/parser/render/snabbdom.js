import { init } from 'snabbdom';
import classModule from 'snabbdom/modules/class';
import attributesModule from 'snabbdom/modules/attributes';
import styleModule from 'snabbdom/modules/style';
import propsModule from 'snabbdom/modules/props';
import datasetModule from 'snabbdom/modules/dataset';
import eventListenersModule from 'snabbdom/modules/eventlisteners';
import h from 'snabbdom/h';
import toHTML from 'snabbdom-to-html';
import toVNode from 'snabbdom/tovnode';

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
