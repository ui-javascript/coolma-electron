/// <reference types="vite/client" />

import type { CoolmaApi } from '@shared/ipc/contract';

declare global {
  interface Window {
    coolma?: CoolmaApi;
  }
}

export {};
