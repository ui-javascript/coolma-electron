/**
 * AI 助手入口枚举
 *
 * 仅有两个 value、但散落在多个组件里（Header.vue / HeaderRightGroup.vue /
 * SettingsAiPanel.vue / SettingsDialog.vue）。新增「第三种入口」只改本文件。
 */

import { Enum } from 'enum-plus'

export const AiAssistantProviderEnum = Enum({
  Builtin: {
    value: 'builtin',
    label: 'aiAssistantProviderBuiltin',
    icon: 'auto_awesome',
    tooltip: 'aiAssistant',
    tagType: 'primary'
  },
  Doubao: {
    value: 'doubao',
    label: 'aiAssistantProviderDoubao',
    icon: 'mic',
    tooltip: 'aiAssistantEntryDoubaoTooltip',
    tagType: 'positive'
  }
})

export const DEFAULT_AI_ASSISTANT_PROVIDER = AiAssistantProviderEnum.Builtin