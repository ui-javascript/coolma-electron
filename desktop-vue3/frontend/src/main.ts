import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import * as QuasarAll from 'quasar';
import quasarZhCN from 'quasar/lang/zh-CN';
import 'quasar/dist/quasar.css';
import '@quasar/extras/material-icons/material-icons.css';
import { createApp } from 'vue';
import App from './App.vue';
import i18n from './i18n';
import router from './router';
import { pinia } from './stores';
import './styles/index.css';
// 必须早于任何 echo/rune 渲染，mount 前把 jQuery 放进 window。
import './boot/jquery';

const app = createApp(App);

// Quasar 的裸 Vue 安装不会自动注册组件，这里把导出的 Q* 组件全量挂上，复刻时直接用 <q-btn>、<q-date>。
const quasarComponents = Object.fromEntries(
  Object.entries(QuasarAll)
    .filter(([key, value]) => /^Q[A-Z]/.test(key) && value && typeof value === 'object' && 'name' in value)
    .map(([, value]) => [(value as { name: string }).name, value]),
);
const quasarDirectives = {
  Ripple: QuasarAll.Ripple,
  ClosePopup: QuasarAll.ClosePopup,
  Intersection: QuasarAll.Intersection,
  Mutation: QuasarAll.Mutation,
  Resize: QuasarAll.Resize,
  Scroll: QuasarAll.Scroll,
  ScrollFire: QuasarAll.ScrollFire,
  TouchHold: QuasarAll.TouchHold,
  TouchPan: QuasarAll.TouchPan,
  TouchRepeat: QuasarAll.TouchRepeat,
  TouchSwipe: QuasarAll.TouchSwipe,
};
const quasarPlugins = {
  Notify: QuasarAll.Notify,
  Dialog: QuasarAll.Dialog,
  Loading: QuasarAll.Loading,
  LoadingBar: QuasarAll.LoadingBar,
  LocalStorage: QuasarAll.LocalStorage,
  SessionStorage: QuasarAll.SessionStorage,
  AppFullscreen: QuasarAll.AppFullscreen,
  AppVisibility: QuasarAll.AppVisibility,
  AppNetwork: QuasarAll.AppNetwork,
  AppWakeLock: QuasarAll.AppWakeLock,
  BottomSheet: QuasarAll.BottomSheet,
  Cookies: QuasarAll.Cookies,
  Dark: QuasarAll.Dark,
  Meta: QuasarAll.Meta,
};

// Quasar 2.35 的语言包类型比运行时多要求 expand/collapse，运行时结构是兼容的。
type QuasarOptions = NonNullable<Parameters<typeof QuasarAll.Quasar.install>[1]>;
const quasarOptions = {
  components: quasarComponents,
  directives: quasarDirectives,
  plugins: quasarPlugins,
  lang: quasarZhCN,
} as unknown as QuasarOptions;

app.use(pinia);
app.use(router);
app.use(i18n);
app.use(ElementPlus, { locale: zhCn });
// 三个组件库混用：Element Plus 承载主界面，Ant Design Vue / Quasar 供复刻件按需直接使用。
app.use(Antd);
app.use(QuasarAll.Quasar, quasarOptions);

app.mount('#app');
