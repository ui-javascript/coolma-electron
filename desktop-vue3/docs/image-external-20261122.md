# R-07 外链图片加载验收（2026-11-22）

## 1. 入口与用例

- 真实页面：`http://127.0.0.1:5173/`，1123×748。
- 测试笔记 `id=995`，标题 `外链图片验收`。
- 用例：

```md
外链图片

![avatar](https://avatars.githubusercontent.com/u/9919?s=200&v=4)

![ext](https://picsum.photos/id/1/200/300.jpg)

![bad](https://example.com/not-an-image)

![flaky](http://127.0.0.1:5199/flaky-image)
```

## 2. 复现：为什么只有无扩展名外链失败

- `getImageInfo()` 对没有图片扩展名的 URL 返回 `isUnknownType=true`，进入 `loadImage(url, true)` 的 HEAD 预检。
- `checkImageContentType()` 用 `XMLHttpRequest HEAD` 判断类型。`avatars.githubusercontent.com` 返回图片但**没有 `Access-Control-Allow-Origin`**，页面内 `fetch(HEAD)` 直接 `TypeError: Failed to fetch`，XHR 得到 `status=0`。
- 旧代码把 `status=0` 当成“不是图片”并抛出 `not an image`，所以即使同一 URL 在页面里 `new Image()` 能拿到 200×200，仍落 `ag-image-fail`。
- `picsum` 带 `.jpg` 扩展名，不走 HEAD，修复前就能显示。
- v2 Electron `webSecurity: false`，HEAD 不受跨域限制；v3 保持 `webSecurity: true`，因此这个问题只在 v3/浏览器预览暴露。

## 3. 修复

### 3.1 预检不再越权否决

`libs-muya-vue3/src/core/utils/index.js`：

- `checkImageContentType()` 改为三态：`true` 明确是图片、`false` 明确不是图片、`null` 状态未知。
- 仅 200 且 `Content-Type` 明确为 `text/html` 等非图片类型返回 `false`；`status=0`（CORS/网络拦截）、403/404、无 Content-Type 返回 `null`。
- `loadImage()` 只在 `isImage === false` 时拒绝；`null` 继续交给 `<img>` 解码决定。非图片 URL 仍会在 `onerror` 落失败态，不会误显示。
- 拖拽网页链接复用同一判定：只有 `isImage === false` 才拒绝，`null` 交给后续图片加载验证。

### 3.2 失败后的同地址重试

- `loadImageAsync()` 支持复用原图片节点 id，并在成功/失败时清掉残留的 `ag-image-fail` / `ag-image-success`。
- `StateRender.retryImage(imageInfo)`：删除失败缓存，移除失败态、置为 loading，用原节点 id 重新加载。
- 图片选择器确认时，如果 alt/src/title 都没改且当前是失败态，调用 `retryImage()`；此前 `replaceImage` 对完全相同的属性不会重绘，表现为确认后无反应。

## 4. 真实页面结果

| 用例 | 修复前 | 修复后 |
|---|---|---|
| GitHub 头像（无扩展名） | `ag-image-fail`，无 img | `ag-image-success`，200×200 |
| picsum `.jpg` | `ag-image-success`，200×300 | `ag-image-success`，200×300 |
| `example.com/not-an-image` | `ag-image-fail` | `ag-image-fail`，仍不误显示 |
| 本机 `/flaky-image`（先 500 后 200） | `ag-image-fail` | 点击失败态 → 选择器回车同地址 → `ag-image-success` 200×200 |

- 失败态仍是 `Load image failed` + 失败图标，没有伪造破图；点击失败块会打开图片选择器，保留“换地址”的原有路径。
- 重试成功只更新同一个 DOM 节点，Markdown 源不变。

对照图：`image-external-20261122.png`（左修复前、右修复后，均 1123×748）。

## 5. 验证

- `pnpm typecheck`：通过。
- `pnpm test:runtime`：全部通过，新增 3 条所区别于旧行为的断言：
  - CORS 拦截的 HEAD 返回 `null`，不判非图片；
  - 200 `text/html` 仍返回 `false`；
  - 预检未知时 `loadImage` 经 `<img>` 直载成功。
- `pnpm build-frontend`：成功，产物已更新到 `desktop-vue3/public/dist`。

## 6. 已知边界

- HEAD 预检仍保留，用于尽早挡掉明确的 HTML 页面；跨域/防盗链不再作为否决依据。
- 同地址重试只覆盖 URL 图片；走 `imageAction` 的本地上传失败不在此路径。
- 引用式图片（reference image）失败态仍走原有选择器恢复，不复用本次的一键重载。

## 7. 结论

外链无扩展名图片的误判已修复，真实 GitHub 头像与 picsum 均能显示；真正的非图片 URL 仍保持失败态；失败后同一地址确认可重试成功。
