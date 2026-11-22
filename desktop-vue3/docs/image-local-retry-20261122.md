# R-07b 本地图片失败态与重试（2026-11-22）

## 1. 入口与用例

- 真实页面：`http://127.0.0.1:5173/`，1123×748。
- 测试笔记 `id=997`，标题 `R-07b 本地图片失败重试`。
- 本地测试图：`/tmp/r07b-local.png`，240×120。
- 用例：

```md
本地路径上传成功（选择器输入 /tmp/r07b-local.png 后按 Enter）。

![bad](https://example.com/not-an-image)

引用式图片同地址重试成功。

![refbad][flaky7]

[flaky7]: http://127.0.0.1:5199/flaky-image?run=7
```

- 失败图服务：本机 `5199`，首次 500、之后 200，用于制造可重试的引用式图片。

## 2. 引擎侧修复

`libs-muya-vue3/src/core/`：

- `utils/index.js` 新增 `markImageActionFailed(wrapper)`：统一摘掉 `ag-image-loading` / `ag-image-success` / `ag-image-uploading`，加 `ag-image-fail`，并删掉残留 `<img>`。失败态不再停在无限 loading。
- `ui/imageSelector/index.js`：图片确认动作包 `try/catch`；空返回或抛错都落失败态，并把原路径留在选择器里，允许同路径再次确认。
- `contentState/pasteCtrl.js`：剪贴板 URL 路径与 `File` 分支的异步失败都落失败态。
- `contentState/dragDropCtrl.js`：拖入图片的异步失败落失败态。
- `parser/render/renderInlines/referenceImage.js`：失败的引用图 span 带上 `data-ref-src` / `data-ref-class` / `data-ref-alt` / `data-ref-title`，为原地重试保留完整图片信息。
- `eventHandler/clickEvent.js`：点击失败块时优先找 `.ag-image-marked-text`，没有则取前一个兄弟节点；若失败且带 `dataset.refSrc`，直接构造 `imageInfo` 调 `stateRender.retryImage`，带 `className` 与 `imageClass: AG_COPY_REMOVE`。引用式图片不再必须绕回选择器。
- `parser/render/index.js`：`retryImage(imageInfo, options)` 接受 `className` / `imageClass`，重试后仍是原来的引用式图片。
- `parser/render/renderInlines/loadImageAsync.js`：非 inline marked text 的成功分支补摘 `ag-image-loading` / `ag-image-fail`，避免“图片出来了、loading 还在”。

## 3. 应用侧本地路径

- `electron/service/attachments.ts` 新增 `saveImageAttachmentFromPath`：只接受 `.png/.jpg/.jpeg/.gif/.webp/.bmp`，单文件 ≤50MB，按 md5 落盘，返回 `coolma://` 地址。
- `electron/controller/attachments.ts` 新增 `saveImageFromPath`，参数 `{ filePath, kbGuid?, docGuid?, noteId? }`。
- `shared/ipc/channels.ts` 新增 `controller/attachments/saveImageFromPath`，并进 preload 白名单。
- `frontend/src/services/ipc.ts` 新增 `SaveImageFromPathInput` 与 `saveAttachmentImageFromPath`。
- `frontend/src/components/EditorPane.vue` 新增 `saveLocalImage(filePath)`：`imageAction` 收到字符串走本地路径落盘，收到 `File` 仍走原 `savePastedImage`；失败提示用 `editor.imagePathFailed`。
- i18n 新增 `editor.imagePathFailed`（中“本地图片读取失败：{message}” / 英“Local image could not be read: {message}”），并修正 `editor.imageUploadFailed` 误嵌套导致解析成 `editor.editor.imageUploadFailed` 的问题。

## 4. 真实页面结果

| 用例 | 结果 |
|---|---|
| 外链坏图点击失败块 | 打开图片选择器，输入 `/tmp/r07b-local.png` 后 Enter |
| 浏览器预览上传本地路径 | 无 `window.coolma`，落 `span.ag-inline-image.ag-image-fail`；`fail=1/loading=0/uploading=0`；toast“本地图片读取失败：Electron preload bridge is not available (browser preview)” |
| 同一路径再次 Enter | `imageAction` 返回 data URL 覆盖后 `fail=0/success=1`，蓝色本地图正常显示 |
| 引用图首次 500 | 失败标记 `ag-image-marked-text.ag-image-fail`，后无 `<img>` |
| 点击失败标记 | 同地址重载 200，成功 span 为 `ag-image-marked-text ag-output-remove ag-hide`，无 `ag-image-fail`、无 `ag-image-loading`，后跟 `<img>` |

对照图：`image-local-retry-20261122.png`（左失败态 + 读取失败 toast，右同路径重试成功 + 引用图重试成功，均 1123×748）。

## 5. 验证

- `pnpm typecheck`：通过。
- `pnpm test:runtime`：全部通过，新增：
  - `本地图片：路径落盘并返回 coolma 地址`（临时写 `local.png`，断言 `coolma://...` 与 md5 文件名）；
  - `本地图片：非图片扩展名拒绝`（`.txt` 抛 `INVALID_IMAGE_EXT`）；
  - `本地图片：上传失败摘掉 loading/uploading 并落 fail`。
- `pnpm build-frontend`：成功，产物已更新到 `desktop-vue3/public/dist`。

## 6. 已知边界

- **落盘成功链路只在 runtime service 测试覆盖。** 浏览器预览没有 `window.coolma`，无法走真实附件 IPC；页面上的“成功”用 `imageAction` 返回 data URL 覆盖模拟，不代表真实 `coolma://` 回写已验证。
- 剪贴板 `File` 上传失败没有保存原始 `File` 重试上下文，用户需要重新粘贴；本次只保证失败态可观察，不保证“点一下原文件重试”。
- 拖入图片失败同样只落失败态，原始拖入文件不保留。
- 非图片扩展名的本地路径由主进程拒绝，不落盘；页面侧只会看到失败 toast。

## 7. 结论

本地路径图片不再静默失败或卡在 loading；空返回与抛错都会落 `ag-image-fail`，并保留可再次确认的上下文。引用式图片失败后可直接点失败标记同地址重载，成功后 `ag-image-loading` 与 `ag-image-fail` 都已清除。真正的本地落盘 `coolma://` 链路由 runtime service 测试担保，页面侧仍待 Electron 真机端到端复核。
