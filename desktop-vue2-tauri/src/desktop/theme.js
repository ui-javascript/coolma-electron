import DefaultDark from './assets/Default-Dark.dark.js'
import DefaultLight from './assets/Default-Light.light.js'
import {
  dataDir,
  joinPath,
  pathExists,
  listFiles,
  readText,
  writeText,
  makeDir,
  openFolder
} from './nativeFs'

/**
 * 与原版 Electron 主进程的 ThemeManager 行为保持一致：
 * 主题目录位于应用数据目录的 themes/，缺失的内置主题在首次使用时补齐。
 */
const BUILTIN_THEMES = [
  ['Default-Dark.dark.css', DefaultDark],
  ['Default-Light.light.css', DefaultLight]
]

let themeDirectory = null

async function themeDir () {
  if (!themeDirectory) themeDirectory = joinPath(await dataDir(), 'themes')
  return themeDirectory
}

async function ensureBuiltinThemes () {
  const dir = await themeDir()
  await makeDir(dir)
  for (const [fileName, css] of BUILTIN_THEMES) {
    const path = joinPath(dir, fileName)
    if (!(await pathExists(path))) await writeText(path, css)
  }
  return dir
}

function describeTheme (fileName) {
  if (typeof fileName !== 'string') return null
  if (fileName.endsWith('.light.css')) {
    return { name: fileName.slice(0, -'.light.css'.length), dark: false, fileName }
  }
  if (fileName.endsWith('.dark.css')) {
    return { name: fileName.slice(0, -'.dark.css'.length), dark: true, fileName }
  }
  return null
}

async function scanThemes () {
  const dir = await ensureBuiltinThemes()
  const files = await listFiles(dir, '.css')
  return files
    .map(file => describeTheme(file.name))
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name) || Number(left.dark) - Number(right.dark))
}

export async function loadTheme ({ name } = {}) {
  const themes = await scanThemes()
  const theme = themes.find(item => item.name === name) ||
    themes.find(item => item.name === 'Default-Light') ||
    themes[0]
  if (!theme) throw new Error('主题目录为空')
  return readText(joinPath(await themeDir(), theme.fileName))
}

export async function openThemeFolder () {
  await ensureBuiltinThemes()
  await openFolder(await themeDir())
}

export async function refreshThemeFolder () {
  return scanThemes()
}
