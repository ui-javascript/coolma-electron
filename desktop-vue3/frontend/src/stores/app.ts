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
import { DEFAULT_SKIN, SKIN_LIST, applySkinThemeColor, type Skin } from '@/utils/skin';
import { applyCustomThemeCss, removeCustomThemeCss } from '@/utils/customTheme';
import { i18n } from '@/i18n';

export type { AppLocale, AppTheme, BootStatus } from '@shared/enums/app';

function readTheme(): AppTheme {
  return localStorage.getItem('coolma.theme') === AppThemeEnum.Dark
    ? AppThemeEnum.Dark
    : AppThemeEnum.Light;
}

function readSkin(): Skin {
  const stored = localStorage.getItem('coolma.skin') as Skin | null;
  return stored && SKIN_LIST.includes(stored) ? stored : DEFAULT_SKIN;
}

function readLocale(): AppLocale {
  return localStorage.getItem('coolma.locale') === AppLocaleEnum.EnUS
    ? AppLocaleEnum.EnUS
    : AppLocaleEnum.ZhCN;
}

/** 自定义主题存在 localStorage：名字负责回显，CSS 文本负责离线启动时立即生效。 */
function readCustomTheme(): string {
  return localStorage.getItem('coolma.customTheme') || '';
}

function readCustomThemeCss(): string {
  return localStorage.getItem('coolma.customThemeCss') || '';
}

export const useAppStore = defineStore('app', {
  state: () => ({
    theme: readTheme(),
    skin: readSkin(),
    locale: readLocale(),
    customTheme: readCustomTheme(),
    customThemeCss: readCustomThemeCss(),
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
      // 自定义主题的 CSS 是整份样式表，优先级高于皮肤写的行内变量；
      // 所以选中自定义主题时先把皮肤主色清掉（白羊 = 无覆盖），再注入主题 CSS。
      const customActive = Boolean(this.customTheme && this.customThemeCss);
      applySkinThemeColor(customActive ? DEFAULT_SKIN : this.skin);
      if (customActive) {
        applyCustomThemeCss(this.customThemeCss);
      } else {
        removeCustomThemeCss();
      }
    },

    /** 换肤：落 localStorage + 立刻刷 CSS 变量（特效由调用方决定是否播放）。 */
    setSkin(skin: Skin): void {
      // 皮肤与自定义主题都改主色，选皮肤即退出自定义主题，避免两套规则打架。
      if (this.customTheme) {
        this.clearCustomTheme();
      }
      this.skin = skin;
      localStorage.setItem('coolma.skin', skin);
      applySkinThemeColor(skin);
    },

    /** 选中主题目录里的某个 CSS；dark 主题同时把应用基线切到深色。 */
    setCustomTheme(name: string, css: string, dark: boolean): void {
      this.customTheme = name;
      this.customThemeCss = css;
      this.theme = dark ? AppThemeEnum.Dark : AppThemeEnum.Light;
      localStorage.setItem('coolma.customTheme', name);
      localStorage.setItem('coolma.customThemeCss', css);
      localStorage.setItem('coolma.theme', this.theme);
      this.applyTheme();
    },

    /** 回到内置皮肤：移除注入样式、清缓存。 */
    clearCustomTheme(): void {
      this.customTheme = '';
      this.customThemeCss = '';
      localStorage.removeItem('coolma.customTheme');
      localStorage.removeItem('coolma.customThemeCss');
      removeCustomThemeCss();
      this.applyTheme();
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