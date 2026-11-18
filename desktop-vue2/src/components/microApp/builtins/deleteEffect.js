/**
 * 「删除特效」业务内置微应用插件
 *
 * 设计目的：
 *   - 把「怪兽特效删除 overlay」当作一个**可选、可下架**的内置微应用
 *   - 主项目 src/ 内不再有怪兽 id / 子项目路径等硬编码
 *   - 下架流程：删除这个文件 + 删除 _plugins/echo-monster-deleter/ 子项目目录
 *     + 删除 main-process 里的迁移 hook —— 改完即可，主项目其它代码完全不动
 *
 * 提供两个东西：
 *   1) builtinApps：内置条目定义（id / name / displayMode / isBuiltIn / url / devUrl）
 *      注册到 microAppService.registerBuiltinApps(...)。
 *      **内置条目 id 必须固定**（用户重启后 id 还要对得上号才能迁移 / 找得到），
 *      子项目目录名可以跟着 id 走。
 *
 *   2) installDeleteConfirmHook(overlayRef)：把 NoteList 「目录删除」流程里
 *      「是否走怪兽特效 overlay」的判断逻辑装到 NoteList 里。
 *      注：这里不直接操作 NoteList 的 state，而是返回一对
 *      { isEnabled, runSummon(target) }，让 NoteList 调用即可。
 *
 * 下架清单（删除这个文件 + 子项目目录后的兜底）：
 *   - delete src/components/microApp/builtins/deleteEffect.js
 *   - rm -rf _plugins/echo-monster-deleter
 *   - delete main-process 里的 runDeleteEffectMigration
 *   - delete NoteList.vue 里的 _ensureMicroAppsLoaded / _onMicroAppsChanged / _isDeleteEffectEnabled 方法 + echoMonsterEntry data + import
 *
 * 如果上面这些步骤你都懒得做，光删子项目目录 + 这个文件，主项目会自动 fallback
 * 到 $q.dialog 二次确认（内置条目不在列表里 = "未启用"，NoteList 走 fallback）。
 */

import {
  registerBuiltinApps,
  MICRO_APP_DISPLAY_MODES
} from 'components/microApp/microAppService'

/**
 * 内置条目 id 固定为 'echo-monster-deleter'：
 *   - 子项目目录 _plugins/echo-monster-deleter/ 沿用这个 id
 *   - 用户的 SQLite 升级后能通过这个 id 找到条目（microAppsChanged bus 透传）
 *   - WujieVue 的 name 属性也用这个 id（保持子项目销毁逻辑一致）
 */
export const DELETE_EFFECT_APP_ID = 'echo-monster-deleter'

/**
 * 内置条目定义
 *
 * devUrl 指向 echo-monster-deleter 子项目的 Vite dev server（端口 5175，与
 * _plugins/echo-monster-deleter/vite.config.js 中 server.port 一致）；url 指向线上部署地址。
 *
 * enabled=false：默认关闭 → 用户删除目录时仍走 $q.dialog 二次确认；用户在「设置 →
 * 微应用」里手动开启后才走怪兽特效 overlay。
 */
export const deleteEffectBuiltinApp = Object.freeze({
  id: DELETE_EFFECT_APP_ID,
  name: '小怪兽删除特效',
  icon: 'el-icon-magic-stick',
  url: 'https://luo0412.github.io/echo-monster-deleter/',
  devUrl: 'http://localhost:5175/',
  isDefault: false,
  enabled: false,
  isMobile: false,
  displayMode: MICRO_APP_DISPLAY_MODES.FULLSCREEN,
  isBuiltIn: true
})

/**
 * 安装「删除特效」内置微应用条目到 microAppService 的全局注册表。
 * 在 App boot 时调用一次（例如 boot/delete-effect-builtin.js 里 import + 调用）。
 *
 * 副作用：后续 BUILTIN_APPS.forEach / normalizeMicroApp / mergeBuiltInApps 都会看到这个条目。
 *
 * 注意：重复注册是幂等的（registerBuiltinApps 内部去重）。
 */
export function installDeleteEffectBuiltin () {
  registerBuiltinApps([deleteEffectBuiltinApp])
}

/**
 * 【可选】安装「删除确认」流程 hook 到 NoteList。
 * 返回一对函数：
 *   - isEnabled() → async → boolean，true 表示走 overlay，false 表示走原生 $q.dialog
 *   - runSummon(overlayRef, target) → async → Promise<{ outcome }>，outcome='destroyed' 表示用户确认
 *   - _findBuiltinEntry() → async → 微应用条目 | null（暴露给 NoteList 拿最新 appEntry 给 fullscreenOverlay）
 *
 * NoteList.vue 调用：
 *   import { installDeleteEffectConfirmHook } from 'components/microApp/builtins/deleteEffect'
 *   ...
 *   created() { this.deleteConfirmHook = installDeleteEffectConfirmHook() }  // 实例属性
 *
 *   deleteCategoryHandler(...) {
 *     if (await this.deleteConfirmHook.isEnabled()) {
 *       const result = await deleteConfirmHook.runSummon(this.$refs.fullscreenOverlay, { ... })
 *       ...
 *     } else {
 *       // 走 $q.dialog 二次确认
 *     }
 *   }
 *
 * 实现细节：
 *   - isEnabled 通过 _findBuiltinEntry() 查 SQLite `setting/microApps`，找到 id=DELETE_EFFECT_APP_ID
 *     的条目，看 enabled 字段
 *   - runSummon 通过 vue ref 拿到 overlay 组件，调用其 summon({ target })
 *   - **没有怪兽细节外泄**：target 是通用的 { guid, name, icon, ... }，overlay 内部负责通信
 */
export function installDeleteEffectConfirmHook () {
  /**
   * 内部：从 microApps 列表里找内置条目
   *
   * 兜底链路（v2026-08-08）：
   *   1. SQLite 里有这个 id → 直接返回（保留用户已修改的 url / devUrl / enabled ...）
   *   2. SQLite 里没有（clean install / 用户开设置之前从未打开过 drawer）→
   *      从 boot 阶段注册表里取默认值返回（不写 SQLite —— 写表是
   *      microAppDrawer / SettingsMicroAppsPanel 的活）
   *   3. 两条都失败 → 返回 null（NoteList 就走 native $q.dialog fallback）
   */
  async function _findBuiltinEntry () {
    try {
      const [{ default: DatabaseClient }, { getBuiltinApps }] = await Promise.all([
        import('src/utils/DatabaseClient'),
        import('components/microApp/microAppService')
      ])
      const stored = await DatabaseClient.microApps.getAll()
      const list = Array.isArray(stored) ? stored : []
      const found = list.find(a => a && a.id === DELETE_EFFECT_APP_ID)
      if (found) return found
      return getBuiltinApps().find(a => a && a.id === DELETE_EFFECT_APP_ID) || null
    } catch (err) {
      console.warn('[deleteEffectConfirmHook] load microApps failed:', err)
      return null
    }
  }

  return {
    /**
     * 是否启用怪兽特效 overlay？
     * - 列表里有内置条目且 enabled=true → true
     * - 其它情况 → false（fallback 到 $q.dialog 二次确认）
     */
    async isEnabled () {
      const entry = await _findBuiltinEntry()
      return Boolean(entry && entry.enabled)
    },

    /**
     * 召唤怪兽特效 overlay，返回 outcome。
     * overlayRef：NoteList 内的 ref (this.$refs.fullscreenOverlay)
     * target: { guid, name, icon, ... }
     *
     * 调用方负责处理 outcome：
     *   - 'destroyed' → 真删
     *   - 'cancelled' / 'timeout' → 啥也不做
     */
    async runSummon (overlayRef, target) {
      if (!overlayRef || typeof overlayRef.summon !== 'function') {
        throw new Error('overlayRef.summon not available')
      }
      return await overlayRef.summon({ target })
    },

    /**
     * 暴露给 NoteList：拿当前 SQLite 里的内置条目（用于 props 推送给 fullscreenOverlay）。
     * 返回 null 表示「列表里没条目」或「加载失败」。
     * NoteList 在 mounted() 首次调用，并在 bus 'microAppsChanged' 触发时调用。
     */
    _findBuiltinEntry
  }
}