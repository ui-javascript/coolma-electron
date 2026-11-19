import { Enum } from 'enum-plus';

/**
 * Shared business dictionaries.
 *
 * Use enum-plus instead of native enums / string unions for values that need
 * labels, tag colors, Element Plus options or other metadata. The `label`
 * fields are i18n keys so the same dictionary works in both locales.
 */
export const AppThemeEnum = Enum({
  Light: { value: 'light', label: 'settings.light', icon: 'Sunny' },
  Dark: { value: 'dark', label: 'settings.dark', icon: 'Moon' },
});

export type AppTheme = (typeof AppThemeEnum)['values'][number];
export type AppThemeItem = (typeof AppThemeEnum)['items'][number];

export const AppLocaleEnum = Enum({
  ZhCN: { value: 'zh-CN', label: 'locale.zhCN' },
  EnUS: { value: 'en-US', label: 'locale.enUS' },
});

export type AppLocale = (typeof AppLocaleEnum)['values'][number];
export type AppLocaleItem = (typeof AppLocaleEnum)['items'][number];

export const BootStatusEnum = Enum({
  Idle: { value: 'idle', label: 'status.idle', tagType: 'info' },
  Loading: { value: 'loading', label: 'status.connecting', tagType: 'warning' },
  Ready: { value: 'ready', label: 'status.connected', tagType: 'success' },
  Error: { value: 'error', label: 'status.error', tagType: 'danger' },
});

export type BootStatus = (typeof BootStatusEnum)['values'][number];
export type BootStatusItem = (typeof BootStatusEnum)['items'][number];

/**
 * Sidebar index modes. Coolma supports browsing notes by folder, tag and time;
 * all three modes must stay available when the real P3 data source is wired.
 */
export const IndexModeEnum = Enum({
  Folder: { value: 'folder', label: 'index.folder', icon: 'Folder' },
  Tag: { value: 'tag', label: 'index.tag', icon: 'CollectionTag' },
  Calendar: { value: 'calendar', label: 'index.calendar', icon: 'Calendar' },
  Time: { value: 'time', label: 'index.time', icon: 'Clock' },
});

export type IndexMode = (typeof IndexModeEnum)['values'][number];
export type IndexModeItem = (typeof IndexModeEnum)['items'][number];

/** 日历日期基准（对齐 vue2 CalendarDateBasisEnum：默认 modified）。 */
export const CalendarDateBasisEnum = Enum({
  Created: { value: 'created', label: 'calendarBasisCreated' },
  Modified: { value: 'modified', label: 'calendarBasisModified' },
});

export type CalendarDateBasis = (typeof CalendarDateBasisEnum)['values'][number];

/** 笔记列表排序（复刻 vue2 NoteOrderTypeEnum，label 即 i18n key）。 */
export const NoteOrderTypeEnum = Enum({
  TitleAsc: { value: 'orderByNoteTitleAsc', label: 'orderByNoteTitleAsc' },
  TitleDesc: { value: 'orderByNoteTitleDesc', label: 'orderByNoteTitleDesc' },
  ModifiedTimeAsc: { value: 'orderByModifiedTimeAsc', label: 'orderByModifiedTimeAsc' },
  ModifiedTimeDesc: { value: 'orderByModifiedTimeDesc', label: 'orderByModifiedTimeDesc' },
  CreatedTimeAsc: { value: 'orderByCreatedTimeAsc', label: 'orderByCreatedTimeAsc' },
  CreatedTimeDesc: { value: 'orderByCreatedTimeDesc', label: 'orderByCreatedTimeDesc' },
});

export type NoteOrderType = (typeof NoteOrderTypeEnum)['values'][number];
