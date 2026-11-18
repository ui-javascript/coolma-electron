/**
 * microapp-builtins boot file —— 注册主项目内置的微应用条目。
 *
 * 设计目的：
 *   - 把"内置微应用"的元数据（id / name / displayMode / url / devUrl ...）从主项目
 *   microAppService.js 抽离到本文件 + components/microApp/builtins/ 下
 *   - 主项目 src/ 内不再有"怪兽特效"等业务条目的字符串硬编码
 *   - 下架任意内置微应用：注释对应 install 行 + 删 builtins/<name>.js + 删 _plugins/<name>/
 *     子项目目录；其它主项目代码完全不动
 *
 * 调用链路：
 *   quasar boot 列表 → boot/microapp-builtins.js → import builtins/<name>.js
 *   → 调 installXxxBuiltin() → registerBuiltinApps(...) → 主项目 microAppService 的 _builtinAppsRegistry
 *   → buildDefaultMicroApps / mergeBuiltInApps / normalizeMicroApp 全部看到这个条目
 */
import { installDeleteEffectBuiltin } from 'components/microApp/builtins/deleteEffect'

export default ({ app, router, store, Vue }) => {
  // 注册业务内置条目（当前：删除特效）
  // 下架流程：注释掉这一行 + 删 src/components/microApp/builtins/deleteEffect.js +
  //           rm -rf _plugins/echo-monster-deleter/
  installDeleteEffectBuiltin()
}