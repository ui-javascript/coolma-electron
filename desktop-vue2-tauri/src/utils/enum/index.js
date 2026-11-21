/**
 * enum-plus 业务枚举统一入口
 *
 * 业务 enum 一行 import：
 *   import { NoteOrderTypeEnum } from 'src/utils/enum'
 *
 * 目录结构（每个文件承担一件事）：
 *   - enumSetup.js                   注册 Enum.extends 全局方法（i18nKey / tagType / iconOf）
 *   - noteOrderTypeEnum.js           笔记排序
 *   - calendarDateBasisEnum.js       日历日期基准
 *   - aiAssistantProviderEnum.js     AI 助手入口
 *   - cloudSyncProviderEnum.js       云同步方式
 *   - settingsTabEnum.js             设置面板一级 tab + 嵌套 sub-tab
 *   - runeEchoCategoriesEnum.js      符文/回响分类（33 行业 + builtin/showy/marker/typography）
 *
 * import 顺序很重要：`enumSetup` 必须在所有业务 enum 实例 import 之前被
 * 加载，否则扩展方法只会挂在更早创建的实例上。这是 enum-plus v3 的
 * prototype 查找行为，详见 enumSetup.js 的注释。
 */

// 1) 先注册全局扩展方法
import './enumSetup.js'

// 2) 再加载所有业务 enum（顺序无关，但保持字母序便于阅读）
export {
  NoteOrderTypeEnum,
  DEFAULT_NOTE_ORDER_TYPE
} from './noteOrderTypeEnum.js'

export {
  CalendarDateBasisEnum,
  DEFAULT_CALENDAR_DATE_BASIS
} from './calendarDateBasisEnum.js'

export {
  AiAssistantProviderEnum,
  DEFAULT_AI_ASSISTANT_PROVIDER
} from './aiAssistantProviderEnum.js'

export {
  CloudSyncProviderEnum,
  DEFAULT_CLOUD_SYNC_PROVIDER
} from './cloudSyncProviderEnum.js'

export {
  SettingsTabEnum,
  GeneralSubEnum,
  EditorSubEnum,
  AiSubEnum,
  ServerSubEnum,
  CloudFnSubEnum
} from './settingsTabEnum.js'

export {
  RuneCategoryEnum,
  EchoCategoryEnum,
  DEFAULT_RUNE_CATEGORY,
  DEFAULT_ECHO_CATEGORY
} from './runeEchoCategoriesEnum.js'

// 3) 把 enum-plus 的 Enum 函数也透出，方便极少数需要 extend 的场景
export { Enum } from 'enum-plus'