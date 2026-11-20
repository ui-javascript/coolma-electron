/**
 * 把 jQuery 挂到 window.jQuery / window.$，对齐 vue2 的 boot/rune-deps.js。
 * echo / rune 的 anno_source handler 里统一写 `const $ = window.jQuery`，
 * 没有这一步，内置回响的 afterRender 全部会拿到 null。
 */
import jQuery from 'jquery';

type JQueryWindow = Window & { jQuery?: typeof jQuery; $?: typeof jQuery };

const host = window as JQueryWindow;
host.jQuery = jQuery;
host.$ = jQuery;
