// ============================================================================
// echoBuiltins —— 16 个内置回响（系统提供，固定不可删改）
//
// 每张卡片形态：
//   {
//     id, name, desc, icon, color, category,         // 元数据
//     propsSchema,                                    // form-create schema（来自 echoPropsSchema）
//     anno_source: '<export default {...}>'           // anno_source 字符串（render + afterRender）
//   }
//
// 拆分后目录结构：
//   - echoBuiltinsBase.js    baseRender / baseAfterRender / createAnnoSource / buildEchoCard 工厂
//   - echoBuiltinsNice.js    单张卡片的 meta + buildEchoCard(meta) 冻结结果（default export）
//   - echoBuiltinsGrowth.js  ...
//   - ...
//   - echoBuiltinsIndex.js   本文件：聚合 16 张卡片，导出原 API
//
// anno_source 字符串模板由 echoBuiltinsBase.js 工厂统一拼装：
//   - 前置 banner 注释
//   - render(node, props) 头部
//   - afterRender(node, props) 头 + handler body
//
// 外部 API 保持与原 echoBuiltins.js 完全一致：
//   - BUILTIN_ECHO_CARDS        16 张冻结卡片的数组
//   - BUILTIN_ECHO_CHANT_IDS    16 个 id 的数组
//   - isBuiltinEchoChantId(id)  工具函数
// ============================================================================

import nice from './echoBuiltinsNice.js'
import growth from './echoBuiltinsGrowth.js'
import shatter from './echoBuiltinsShatter.js'
import skywalk from './echoBuiltinsSkywalk.js'
import twinbloom from './echoBuiltinsTwinbloom.js'
import mindsteal from './echoBuiltinsMindsteal.js'
import lucky from './echoBuiltinsLucky.js'
import scapegoat from './echoBuiltinsScapegoat.js'
import calamity from './echoBuiltinsCalamity.js'
import disperse from './echoBuiltinsDisperse.js'
import peek from './echoBuiltinsPeek.js'
import ignore from './echoBuiltinsIgnore.js'
import ad from './echoBuiltinsAd.js'
import diff from './echoBuiltinsDiff.js'
import ref from './echoBuiltinsRef.js'
import todo from './echoBuiltinsTodo.js'
import fold from './echoBuiltinsFold.js'

const BUILTIN_ECHO_CARDS = Object.freeze([
  nice, growth, shatter, skywalk, twinbloom, mindsteal, lucky, scapegoat, calamity, disperse,
  peek, ignore, ad, diff, ref, todo, fold
])

const BUILTIN_ECHO_CHANT_IDS = Object.freeze(BUILTIN_ECHO_CARDS.map(card => card.metaId))

const isBuiltinEchoChantId = (id = '') => BUILTIN_ECHO_CHANT_IDS.includes(String(id || '').trim())

export { BUILTIN_ECHO_CARDS, BUILTIN_ECHO_CHANT_IDS, isBuiltinEchoChantId }
export default BUILTIN_ECHO_CARDS
