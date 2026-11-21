/**
 * Tauri/WebView2 下的图片拖拽落地。
 *
 * 为什么不能直接用 Muya 自带的 dragDropCtrl：
 * 它的 `dropHandler` 依赖 `File.path`（Electron 给 `File` 加的私有属性）来拿到本地绝对路径，
 * 再把这个路径交给 `imageAction` 上传。WebView2 是标准 Chromium，`file.path` 恒为 undefined，
 * 于是 block 里写下 `![loading-xxx](undefined)`、`imageAction(undefined)` 直接抛错，
 * 拖进来毫无反应——这就是"拖拽不行、只能点插入图片选文件"的原因。
 *
 * 这里的做法是接管 drop 事件：拿到 `dataTransfer.files` 里的 `File` 对象本身，
 * 走与「插入图片」对话框完全相同的上传链路（`uploadImage(file)` 内部会按
 * wiz 官方 / picgo / none 三种服务分派），拿到最终 src 后用 Muya 的 `insertImage()` 插到光标处。
 */
export function hasImageFiles (event) {
  const files = event && event.dataTransfer && event.dataTransfer.files
  if (!files || !files.length) return false
  for (const file of files) {
    if (file && typeof file.type === 'string' && file.type.indexOf('image/') === 0) return true
  }
  return false
}

/**
 * 生成 drop 处理器。依赖全部注入，方便单测。
 * @param {{ uploadImage: (file: File) => Promise<string>, insertImage: (info: {alt: string, src: string}) => void, onError?: (error: any, file: File) => void }} deps
 */
export function createImageDropHandler ({ uploadImage, insertImage, onError }) {
  return async function handleImageDrop (event) {
    const files = event && event.dataTransfer && event.dataTransfer.files
    if (!files || !files.length) return false
    const images = []
    for (const file of files) {
      if (file && typeof file.type === 'string' && file.type.indexOf('image/') === 0) images.push(file)
    }
    if (images.length === 0) return false

    // 拦在最前面，别让 Muya 的 Electron 专用 handler 再跑一遍
    event.preventDefault()
    event.stopPropagation()

    for (const file of images) {
      try {
        const src = await uploadImage(file)
        if (src) insertImage({ alt: file.name || '', src })
      } catch (error) {
        if (typeof onError === 'function') onError(error, file)
        else console.error('[Muya] 拖拽图片上传失败', error)
      }
    }
    return true
  }
}

/**
 * 把处理器挂到编辑器容器上（capture 阶段，抢在 Muya 自己的监听前面）。
 * 返回解绑函数。
 */
export function attachImageDrop (container, handler) {
  if (!container || typeof container.addEventListener !== 'function') return () => {}

  const onDragOver = event => {
    if (hasImageFiles(event)) event.preventDefault()
  }

  container.addEventListener('dragover', onDragOver, true)
  container.addEventListener('drop', handler, true)

  return () => {
    container.removeEventListener('dragover', onDragOver, true)
    container.removeEventListener('drop', handler, true)
  }
}
