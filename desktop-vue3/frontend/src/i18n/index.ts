import { createI18n } from 'vue-i18n';
import { AppLocaleEnum, type AppLocale } from '@shared/enums/app';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';
import { hoistMisplacedKeys, type Messages } from './hoist';

export type { AppLocale } from '@shared/enums/app';

const zhMessages = hoistMisplacedKeys(zhCN as Messages) as typeof zhCN;
const enMessages = hoistMisplacedKeys(enUS as Messages) as typeof enUS;


const saved = localStorage.getItem('coolma.locale');
const locale: AppLocale = saved === AppLocaleEnum.EnUS ? AppLocaleEnum.EnUS : AppLocaleEnum.ZhCN;

export const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: AppLocaleEnum.ZhCN,
  messages: {
    [AppLocaleEnum.ZhCN]: zhMessages,
    [AppLocaleEnum.EnUS]: enMessages,
  },
});

export default i18n;
