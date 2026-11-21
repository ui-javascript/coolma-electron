/**
 * cdn-deps boot file —— 触发 CDN 依赖（jQuery 插件 / layui / city-picker 等）的异步注入
 *
 * 真正的注入逻辑已提取到 `src/utils/cdnDepsUtil.js`：
 *  - 该 util 导出的 `loadCdnDeps()` / `reloadCdnDeps()` / `whenCdnDepsReady()` 可被业务组件直接 await，
 *    不再需要各自轮询 DOM（例如 cityPickerField）。
 *  - 本 boot 文件只负责「什么时候触发一次」+「配置变更时重载」。
 *
 * 时序：DOMContentLoaded 之后才开始加载（不阻塞首屏渲染），
 * 全部走异步注入，不会 await 阻塞 Quasar 的 boot 链。
 */
import bus from 'src/components/common/bus'
import { loadCdnDeps, reloadCdnDeps } from 'src/utils/cdnDepsUtil'

export default async () => {
  const trigger = () => {
    loadCdnDeps().catch(err => {
      console.error('[CdnDepsBoot] Error loading CDN deps:', err)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trigger)
  } else {
    trigger()
  }

  // 监听配置变更事件，刷新 CDN 资源
  bus.$on('cdnDepsChanged', () => {
    console.log('[CdnDepsBoot] CDN deps changed, reloading...')
    reloadCdnDeps().catch(err => {
      console.error('[CdnDepsBoot] Error reloading CDN deps:', err)
    })
  })
}
