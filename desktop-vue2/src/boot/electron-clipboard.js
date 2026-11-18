/**
 * Clipboard boot file — bridges Electron's clipboard module into the renderer
 * process via the window object, since Monaco's built-in clipboard API may not
 * work reliably inside Electron's sandboxed renderer.
 */
import { clipboard } from 'electron'

window.__electronClipboard = {
  readText: () => clipboard.readText(),
  writeText: (text) => clipboard.writeText(text),
  readHTML: () => clipboard.readHTML(),
  writeHTML: (html) => clipboard.writeHTML(html),
  clear: () => clipboard.clear()
}
