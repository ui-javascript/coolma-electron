import { defineStore } from 'pinia';
import type { AppInfo } from '@shared/ipc/contract';
import {
  AppLocaleEnum,
  AppThemeEnum,
  BootStatusEnum,
  type AppLocale,
  type AppTheme,
  type BootStatus,
} from '@shared/enums/app';
import { allSettings, getAppInfo, setSetting } from '@/services/ipc';
import { i18n } from '@/i18n';

export type { AppLocale, AppTheme, BootStatus } from '@shared/enums/app';

function readTheme(): AppTheme {
  return localStorage.getItem('coolma.theme') === AppThemeEnum.Dark
    ? AppThemeEnum.Dark
    : AppThemeEnum.Light;
}

function readLocale(): AppLocale {
  return localStorage.getItem('coolma.locale') === AppLocaleEnum.EnUS
    ? AppLocaleEnum.EnUS
    : AppLocaleEnum.ZhCN;
}

export const useAppStore = defineStore('app', {
  state: () => ({
    theme: readTheme(),
    locale: readLocale(),
    appInfo: null as AppInfo | null,
    status: BootStatusEnum.Idle as BootStatus,
    error: '',
    prefs: {} as Record<string, unknown>,
    prefsLoaded: false,
  }),

  getters: {
    isElectron: (state) => state.status === BootStatusEnum.Ready,
    statusLabel: (state) => BootStatusEnum.item(state.status)?.label ?? 'status.idle',
    statusTagType: (state): 'success' | 'warning' | 'danger' | 'info' => {
      const tagType = BootStatusEnum.item(state.status)?.tagType;
      return (tagType as 'success' | 'warning' | 'danger' | 'info' | undefined) ?? 'info';
    },
  },

  actions: {
    /** 启动时拉一次 settings 表全量，编辑器偏好从这里读。 */
    async loadPrefs(): Promise<void> {
      try {
        const result = await allSettings();
        if (result.ok) {
          this.prefs = result.data ?? {};
          this.prefsLoaded = true;
        }
      } catch {
        // 设置拉取失败不阻塞启动
      }
    },

    /** 写偏好：本地立即生效 + settings.set 落库。 */
    async setPref(key: string, value: unknown): Promise<void> {
      this.prefs = { ...this.prefs, [key]: value };
      try {
        await setSetting(key, value);
      } catch {
        // 落库失败仅保留内存值
      }
    },

    async init(): Promise<void> {
      if (this.status === BootStatusEnum.Loading || this.status === BootStatusEnum.Ready) {
        return;
      }

      this.status = BootStatusEnum.Loading;
      this.applyTheme();

      const result = await getAppInfo();
      if (result.ok) {
        this.appInfo = result.data;
        this.status = BootStatusEnum.Ready;
        this.error = '';
      } else {
        this.status = BootStatusEnum.Error;
        this.error = result.error.message;
      }
    },

    applyTheme(): void {
      document.documentElement.classList.toggle('dark', this.theme === AppThemeEnum.Dark);
      document.documentElement.dataset.theme = this.theme;
    },

    setTheme(theme: AppTheme): void {
      this.theme = theme;
      localStorage.setItem('coolma.theme', theme);
      this.applyTheme();
    },

    setLocale(locale: AppLocale): void {
      this.locale = locale;
      localStorage.setItem('coolma.locale', locale);
      document.documentElement.lang = locale;
      i18n.global.locale.value = locale;
    },
  },
});