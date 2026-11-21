import { invoke, isTauri } from '@tauri-apps/api/core'

/**
 * Tauri 原生文件能力的薄封装。路径统一使用 `/` 分隔，Windows 的 std::fs 同样接受。
 */
export { isTauri }

export function dataDir () {
  return invoke('app_data_path')
}

export function documentDir () {
  return invoke('document_dir')
}

export function pictureDir () {
  return invoke('picture_dir')
}

export function joinPath (...parts) {
  return parts
    .filter(part => typeof part === 'string' && part.trim() !== '')
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '')
}

export function pathExists (path) {
  return invoke('path_exists', { path })
}

export function readBytes (path) {
  return invoke('read_file_bytes', { path })
}

export function readText (path) {
  return invoke('read_file_text', { path })
}

export function writeText (path, contents) {
  return invoke('write_file_text', { path, contents })
}

export async function writeBytes (path, bytes) {
  const payload = bytes instanceof Uint8Array
    ? (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    : bytes
  return invoke('write_file_bytes', payload, {
    headers: { 'x-coolma-file': encodeURIComponent(path) }
  })
}

export function makeDir (path) {
  return invoke('create_dir', { path })
}

export function listFiles (dir, extension) {
  return invoke('list_files', { dir, extension: extension || null })
}

export function openFolder (path) {
  return invoke('open_folder', { path })
}

export function revealPath (path) {
  return invoke('reveal_path', { path })
}

export function openExternal (url) {
  return invoke('open_external', { url })
}

/**
 * 把 data URL 或纯 base64 解码成字节。
 */
export function decodeBase64 (value) {
  const base64 = String(value || '').replace(/^data:[^;]+;base64,/, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif'
}

export function mimeFromName (name) {
  const extension = String(name || '').split('.').pop().toLowerCase()
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream'
}

/**
 * 读取本地图片并转成 data URL，避免 WebView 无法直接访问绝对路径。
 */
export async function fileToDataUrl (path) {
  const bytes = new Uint8Array(await readBytes(path))
  const blob = new Blob([bytes], { type: mimeFromName(path) })
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('无法读取本地图片'))
    reader.readAsDataURL(blob)
  })
}

export function dataUrlExtension (value) {
  const match = /^data:image\/([a-z0-9.+-]+);/i.exec(String(value || ''))
  const extension = match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png'
  return '.' + extension
}
