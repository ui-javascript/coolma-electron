/**
 * libs-muya-vue2 引擎残留的 app 级依赖兜底：桌面端 barrel 只被用到 parseEchoProps，
 * 这里直接复用桌面端的纯 JS 实现（与引擎零依赖）。
 * 治本（引擎侧内聚 parseEchoProps）属于引擎去领域化的后续批次。
 */
export { parseEchoProps } from '../../../../desktop-vue2/src/components/echo/echoPropsParser.js'
