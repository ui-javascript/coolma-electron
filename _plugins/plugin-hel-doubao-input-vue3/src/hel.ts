/**
 * hel-micro 远程组件入口。
 *
 * 打包成 IIFE 后由宿主按 hel-meta.json 注入；`libReady` 会把导出对象注册到
 * hel 的全局共享缓存，宿主用 `preFetchLib('plugin-hel-doubao-input-vue3')` 取到。
 * Vue 走 external，吃宿主挂到 window.Vue 的那一份，避免双 Vue 运行时。
 */
import 'virtual:uno.css';
import './style.css';
import { libReady } from 'hel-lib-proxy';
import DoubaoInput from './components/ChatInput/index.vue';
import DoubaoChatApp from './App.vue';

export { DoubaoInput, DoubaoChatApp };
export default DoubaoInput;

libReady('plugin-hel-doubao-input-vue3', {
  DoubaoInput,
  DoubaoChatApp,
  default: DoubaoInput,
});
