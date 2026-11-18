/**
 * 笔记排序方式枚举
 *
 * 原实现是一个冻结字符串数组 + i18n label 字典：
 *   - NOTE_ORDER_TYPES (frozen string[])
 *   - DEFAULT_NOTE_ORDER_TYPE = NOTE_ORDER_TYPES[0]
 * 此外 i18n key 直接复用 value（src/i18n/{zh-cn,en-us}/components.js 里有同名 6 个 key）。
 *
 * 现改为 enum-plus：
 *   - NoteOrderTypeEnum.TitleAsc 直接拿到 value，等价于 NOTE_ORDER_TYPES[0]
 *   - NoteOrderTypeEnum.label(value) 经过 Enum.localize 自动翻译，直接返回当前 locale 文案
 *   - NoteOrderTypeEnum.values / .items / .has() / .key() 替代手工遍历/查找
 *
 * 为了不破坏已有消费方（`SettingsEditorPanel.vue` / `CalendarPanel.vue` /
 * `store/server/getters.js` / `store/client/state.js` 等都按 value 字符串使用），
 * 这里继续 export 旧符号 `NOTE_ORDER_TYPES` / `DEFAULT_NOTE_ORDER_TYPE`，
 * 但其内部已经从 enum 实例生成（避免两份真理）。
 */

import { Enum } from 'enum-plus'

export const NoteOrderTypeEnum = Enum({
  TitleAsc: {
    value: 'orderByNoteTitleAsc',
    label: 'orderByNoteTitleAsc'
  },
  TitleDesc: {
    value: 'orderByNoteTitleDesc',
    label: 'orderByNoteTitleDesc'
  },
  ModifiedTimeAsc: {
    value: 'orderByModifiedTimeAsc',
    label: 'orderByModifiedTimeAsc'
  },
  ModifiedTimeDesc: {
    value: 'orderByModifiedTimeDesc',
    label: 'orderByModifiedTimeDesc'
  },
  CreatedTimeAsc: {
    value: 'orderByCreatedTimeAsc',
    label: 'orderByCreatedTimeAsc'
  },
  CreatedTimeDesc: {
    value: 'orderByCreatedTimeDesc',
    label: 'orderByCreatedTimeDesc'
  }
})

// 旧符号兼容：冻结字符串数组 + 默认值。新代码请直接用 NoteOrderTypeEnum.TitleAsc。
export const NOTE_ORDER_TYPES = Object.freeze(NoteOrderTypeEnum.values.slice())
export const DEFAULT_NOTE_ORDER_TYPE = NoteOrderTypeEnum.TitleAsc
