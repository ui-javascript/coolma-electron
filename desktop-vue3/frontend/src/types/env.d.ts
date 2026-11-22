/// <reference types="vite/client" />

import type { CoolmaApi } from '@shared/ipc/contract';

declare global {
  interface Window {
    coolma?: CoolmaApi;
  }
}

// Quasar 语言包只有 JS，没有随包提供类型声明。
declare module 'quasar/lang/*' {
  import type { QuasarLanguage } from 'quasar';
  const lang: QuasarLanguage;
  export default lang;
}

export {};
