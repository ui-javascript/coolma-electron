import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import sanitize from 'sanitize-filename'
import md5 from 'md5'
import {
  isTauri,
  dataDir,
  joinPath,
  pathExists,
  readBytes,
  writeBytes,
  writeText,
  makeDir,
  openFolder,
  openExternal,
  decodeBase64,
  dataUrlExtension
} from './nativeFs'

export { fileToDataUrl } from './nativeFs'

export const UNHANDLED = Symbol('tauri-unhandled')

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']

function safeName (name, fallback) {
  const sanitized = sanitize(String(name || '')).trim()
  return sanitized || fallback
}

function dialogTitle (title, fallback) {
  return typeof title === 'string' && title.trim() ? title : fallback
}

async function tempRoot () {
  return joinPath(await dataDir(), 'MemocastTempDir')
}

async function noteTempDir (kbGuid, docGuid) {
  return joinPath(await tempRoot(), safeName(kbGuid, 'offline'), safeName(docGuid, 'note'))
}

async function selectDirectory ({ title } = {}) {
  const selected = await openDialog({
    title: dialogTitle(title, 'Select Directory'),
    directory: true,
    multiple: false,
    createDirectory: true
  })
  return selected ? { canceled: false, filePath: selected } : { canceled: true }
}

async function importImage () {
  const selected = await openDialog({
    title: '导入图片',
    multiple: true,
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }]
  })
  if (!selected) return undefined
  return Array.isArray(selected) ? selected : [selected]
}

async function exportMarkdownFiles ({ contents = [], category } = {}, emit) {
  const directory = await openDialog({
    title: '导出',
    directory: true,
    multiple: false,
    createDirectory: true
  })
  if (!directory) return undefined
  const folder = joinPath(directory, safeName(category, 'Export'))
  await makeDir(folder)
  await Promise.all(contents.map(item => writeText(
    joinPath(folder, safeName(item?.title, 'Untitled') + '.md'),
    String(item?.content || '')
  )))
  emit('show-notification', {
    msg: 'ExportSuccessfully',
    type: 'positive',
    icon: 'check',
    filePath: folder
  })
  return undefined
}

async function getLocalFileData (filePath) {
  if (typeof filePath !== 'string' || !filePath) return null
  if (!(await pathExists(filePath))) return null
  return readBytes(filePath)
}

async function saveUploadedImage ({ buffer, kbGuid, docGuid, name } = {}) {
  const folder = await noteTempDir(kbGuid, docGuid)
  const path = joinPath(folder, safeName(name, 'image.png'))
  const bytes = typeof buffer === 'string' ? decodeBase64(buffer) : new Uint8Array(buffer || [])
  await writeBytes(path, bytes)
  return path
}

async function saveTempImage ({ file, kbGuid, docGuid } = {}) {
  if (typeof file !== 'string' || !file) throw new Error('图片数据无效')
  const folder = await noteTempDir(kbGuid, docGuid)
  const path = joinPath(folder, md5(file) + '.png')
  await writeBytes(path, decodeBase64(file))
  return path
}

async function getCacheImage ({ imageUrl, kbGuid, docGuid } = {}) {
  if (typeof imageUrl !== 'string' || !imageUrl) throw new Error('图片地址无效')
  const folder = await noteTempDir(kbGuid, docGuid)
  const path = joinPath(folder, 'image.png')
  await makeDir(folder)
  await invoke('download_file', { url: imageUrl, path })
  return path
}

async function uploadImages ({ imagePaths = [], type } = {}, emit) {
  if (type !== 'picgoServer') return undefined
  const paths = []
  for (const image of imagePaths) {
    const inline = typeof image === 'string' && image.startsWith('data:')
      ? image
      : (image && typeof image.file === 'string' ? image.file : null)
    if (inline) {
      const path = joinPath(await tempRoot(), md5(inline) + dataUrlExtension(inline))
      await writeBytes(path, decodeBase64(inline))
      paths.push(path)
    } else if (typeof image === 'string') {
      paths.push(image)
    } else if (image && typeof image.file === 'string') {
      paths.push(image.file)
    }
  }
  try {
    return await invoke('picgo_upload', { paths })
  } catch (error) {
    if (String(error).includes('PICGO_UNREACHABLE')) {
      emit('show-notification', {
        msg: 'picgoServerNoteFound',
        type: 'negative',
        icon: 'delete'
      })
      return undefined
    }
    throw error
  }
}

async function openLogFiles () {
  const folder = joinPath(await dataDir(), 'logs')
  await makeDir(folder)
  await openFolder(folder)
}

async function handleOpenExternal ({ url }) {
  if (typeof url !== 'string' || !url) throw new Error('链接无效')
  await openExternal(url)
}

/**
 * 处理从 Electron 主进程迁移过来的文件类通道。
 * 未命中的通道返回 UNHANDLED，由 bridge 继续走默认分支。
 */
export async function handleDesktopChannel (channel, payload, emit) {
  if (!isTauri()) return UNHANDLED
  switch (channel) {
    case 'select-directory': return selectDirectory(payload)
    case 'import-image': return importImage()
    case 'export-markdown-files': return exportMarkdownFiles(payload, emit)
    case 'get-local-file-data': return getLocalFileData(payload)
    case 'save-uploaded-image': return saveUploadedImage(payload)
    case 'save-temp-image': return saveTempImage(payload)
    case 'get-cache-image': return getCacheImage(payload)
    case 'upload-images': return uploadImages(payload, emit)
    case 'open-log-files': return openLogFiles()
    case 'open-external': return handleOpenExternal(payload)
    default: return UNHANDLED
  }
}
