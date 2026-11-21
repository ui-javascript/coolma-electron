/**
 * 笔记正文里的图片地址有两种形态，必须明确区分：
 *
 * - **规范形态**：`coolma://coolma.app/<kbGuid>/<docGuid>/<资源名>`。
 *   Electron 原版落库、上传为知都认这个；跨端、跨版本都还能解释。
 * - **运行形态**：Tauri 用 `convertFileSrc` 得到的 `http://coolma-resource.localhost/...`。
 *   WebView2 只认这个，但它是构建期产物（macOS 是 `coolma-resource://localhost/`），
 *   写进正文就绑死到当前平台与当前 identifier。
 *
 * 约定：**落库写规范形态，读出来再换成运行形态**。这样 Tauri 与 Electron 的库可互通，
 * 迁移过来的老笔记（正文是 coolma://）在 Tauri 里也能正常渲染。
 */

export const CANONICAL_PREFIX = 'coolma://coolma.app/'

const RUNTIME_PATTERNS = [
  /https?:\/\/coolma-resource\.localhost\//g,
  /coolma-resource:\/\/localhost\//g
]

/** 运行形态 → 规范形态（写库前调用）。 */
export function toCanonicalResources (text) {
  if (typeof text !== 'string' || !text) return text
  return RUNTIME_PATTERNS.reduce((value, pattern) => value.replace(pattern, CANONICAL_PREFIX), text)
}

/** 规范形态 → 运行形态（读库后、喂编辑器前调用）。`base` 传 `wizResourceUrl` 用的那个前缀。 */
export function toRenderableResources (text, base) {
  if (typeof text !== 'string' || !text) return text
  if (typeof base !== 'string' || !base) return text
  const normalized = base.endsWith('/') ? base : base + '/'
  const replaced = RUNTIME_PATTERNS.reduce((value, pattern) => value.replace(pattern, normalized), text)
  return replaced.split(CANONICAL_PREFIX).join(normalized)
}
