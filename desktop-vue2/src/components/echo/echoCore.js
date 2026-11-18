// ============================================================================
// echoCore —— 回响内核 barrel（所有 echo 系统相关 API 入口）
//
// 模块划分（每文件单一职责）：
//   - echoPropsParser.js     parseEchoProps
//   - echoPayloadCodec.js    encodeEchoPayload / decodeEchoPayload / createEchoPlaceholderPayload / ECHO_PLACEHOLDER_RE
//   - echoInherit.js         isInheritFromPreviousEnabled / echoInheritFromPrevious / extractPrevEchoTokenValue
//   - echoAnnoSource.js      createDefaultEchoAnnoSource / safeEvalAnnoSource / HANDLER_PRELUDE
//   - echoRuntime.js         EchoRuntime 类
//   - echoRegistry.js        EchoRegistry 类
//   - echoPropsSchema.js     BUILTIN_ECHO_PROPS_SCHEMA / resolvePropsSchema / buildFormCreateRule
//   - echoBuiltins/echoBuiltins.js   BUILTIN_ECHO_CARDS / isBuiltinEchoChantId / BUILTIN_ECHO_CHANT_IDS（拆分后聚合在子目录）
//
// 16 个内置 echo 的 anno_source 字符串模板仍由 echoBuiltinsShared.js 的
// handlerDoc / banner 工厂拼装（保留 jQuery handler 的初始化模板）。
// ============================================================================

export { parseEchoProps } from './echoPropsParser.js'
export {
  encodeEchoPayload,
  decodeEchoPayload,
  createEchoPlaceholderPayload,
  ECHO_PLACEHOLDER_RE
} from './echoPayloadCodec.js'
export {
  isInheritFromPreviousEnabled,
  echoInheritFromPrevious,
  extractPrevEchoTokenValue
} from './echoInherit.js'
export {
  createDefaultEchoAnnoSource,
  safeEvalAnnoSource,
  HANDLER_PRELUDE
} from './echoAnnoSource.js'
export {
  BUILTIN_ECHO_PROPS_SCHEMA,
  resolvePropsSchema,
  buildFormCreateRule
} from './echoPropsSchema.js'
export {
  BUILTIN_ECHO_CARDS,
  BUILTIN_ECHO_CHANT_IDS,
  isBuiltinEchoChantId
} from './echoBuiltins/echoBuiltins.js'

export { default as EchoRuntime } from './echoRuntime.js'
export { default as EchoRegistry } from './echoRegistry.js'

// 共享常量（DEFAULT_ECHO_COLOR / DEFAULT_ECHO_ICON / DEFAULT_ECHO_PROPS_RESERVED）
// 仍然从 echoBuiltinsShared 导出，因为跨文件（dialog / builtins）共用。
export {
  DEFAULT_ECHO_COLOR,
  DEFAULT_ECHO_ICON,
  DEFAULT_ECHO_PROPS_RESERVED,
  CURRENT_ECHO_PLACEHOLDER_RE
} from './echoBuiltinsShared.js'
