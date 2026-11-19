import './core/assets/styles/index.css';
import './themes/default.css';
import Muya from './core/index.js';
import MuyaEditor from './MuyaEditor.vue';

export { Muya, MuyaEditor };
// @ts-expect-error core/parser is a plain JS module
export { setEchoAnnoRule } from './core/parser';
export { defineMuyaPlugin, extendQuickInsertProvider } from './plugin';
export type { MuyaChangePayload, MuyaOptions } from './core/index.js';
export type { MuyaPlugin, MuyaPluginContext } from './plugin';
export default Muya;
