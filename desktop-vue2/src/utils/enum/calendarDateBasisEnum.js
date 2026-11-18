/**
 * 日历日期基准枚举
 *
 * 原实现：
 *   - CALENDAR_DATE_BASIS_TYPES = ['created', 'modified']
 *   - DEFAULT_CALENDAR_DATE_BASIS = 'modified'
 *   - CALENDAR_DATE_BASIS_LABELS = { created: 'calendarBasisCreated', modified: 'calendarBasisModified' }
 *
 * 现改为 enum-plus：
 *   - CalendarDateBasisEnum.values 替代旧的 TYPES
 *   - CalendarDateBasisEnum.label(value) 替代 LABELS[value]
 *   - CalendarDateBasisEnum.Modified 直接拿到默认值字符串
 *
 * 保留旧符号 export，旧消费方（CalendarPanel.vue / store/client/state.js /
 * store/server/actions.js / store/server/noteTree.js）零改动。
 */

import { Enum } from 'enum-plus'

export const CalendarDateBasisEnum = Enum({
  Created: {
    value: 'created',
    label: 'calendarBasisCreated'
  },
  Modified: {
    value: 'modified',
    label: 'calendarBasisModified'
  }
})

// 旧符号兼容：新代码请直接用 CalendarDateBasisEnum.Modified / .label(value)。
export const CALENDAR_DATE_BASIS_TYPES = Object.freeze(CalendarDateBasisEnum.values.slice())
export const DEFAULT_CALENDAR_DATE_BASIS = CalendarDateBasisEnum.Modified
export const CALENDAR_DATE_BASIS_LABELS = Object.freeze(
  CalendarDateBasisEnum.toMap({ keySelector: 'value', valueSelector: 'label' })
)
