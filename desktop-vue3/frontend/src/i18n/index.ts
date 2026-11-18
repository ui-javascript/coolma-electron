import { createI18n } from 'vue-i18n';
import { AppLocaleEnum, type AppLocale } from '@shared/enums/app';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

export type { AppLocale } from '@shared/enums/app';

const saved = localStorage.getItem('coolma.locale');
const locale: AppLocale = saved === AppLocaleEnum.EnUS ? AppLocaleEnum.EnUS : AppLocaleEnum.ZhCN;

export const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: AppLocaleEnum.ZhCN,
  messages: {
    [AppLocaleEnum.ZhCN]: zhCN,
    [AppLocaleEnum.EnUS]: enUS,
  },
});

export default i18n;
