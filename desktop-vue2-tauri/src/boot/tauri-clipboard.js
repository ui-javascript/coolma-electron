import { installClipboardBridge } from 'src/desktop/clipboard'

/**
 * 对齐原版 src/boot/electron-clipboard.js：注入同形的 window.__electronClipboard。
 */
export default () => {
  installClipboardBridge()
}
