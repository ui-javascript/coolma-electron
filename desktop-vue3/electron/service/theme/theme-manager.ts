import fs from 'node:fs';
import path from 'node:path';
import { app, shell } from 'electron';
import { DEFAULT_DARK_CSS, DEFAULT_LIGHT_CSS } from './defaults';

export interface ThemeMeta {
  name: string;
  dark: boolean;
  fileName: string;
}

export interface LoadedTheme extends ThemeMeta {
  css: string;
}

const DEFAULT_FILES: Array<{ fileName: string; content: string }> = [
  { fileName: 'Default-Light.light.css', content: DEFAULT_LIGHT_CSS },
  { fileName: 'Default-Dark.dark.css', content: DEFAULT_DARK_CSS },
];

/** 主题目录：`userData/themes`，与 vue2 ThemeManager 同一位置。 */
export function themeDirectory(): string {
  return path.join(app.getPath('userData'), 'themes');
}

/**
 * 首次使用时建目录并写入两个基线文件。
 * 已存在的文件一律不覆盖，用户改过就保留。
 */
export function ensureThemeDirectory(): string {
  const dir = themeDirectory();
  fs.mkdirSync(dir, { recursive: true });
  for (const item of DEFAULT_FILES) {
    const target = path.join(dir, item.fileName);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, item.content, 'utf-8');
    }
  }
  return dir;
}

/**
 * 扫描目录里的 `.light.css` / `.dark.css`。
 * 后缀规则与 vue2 一致：`.light.css` 算浅色，`.dark.css` 算深色；
 * 其余 css 不进列表，避免用户把浏览器导出样式一起塞进来。
 */
export function scanThemes(): ThemeMeta[] {
  const dir = ensureThemeDirectory();
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => entry.name);

  const themes: ThemeMeta[] = [];
  for (const fileName of files) {
    if (fileName.endsWith('.light.css')) {
      themes.push({ name: fileName.slice(0, -'.light.css'.length), dark: false, fileName });
    } else if (fileName.endsWith('.dark.css')) {
      themes.push({ name: fileName.slice(0, -'.dark.css'.length), dark: true, fileName });
    }
  }
  return themes.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

/** 重新扫目录（对应 vue2 的 refresh-theme-folder，只是不落 electron-store）。 */
export function refreshThemes(): ThemeMeta[] {
  return scanThemes();
}

/** 在文件管理器里定位主题目录（vue2：shell.showItemInFolder(themePath)）。 */
export function openThemeDirectory(): string {
  const dir = ensureThemeDirectory();
  shell.showItemInFolder(dir);
  return dir;
}

/** 按主题名加载 CSS 文本；名字来自扫描结果，不接受任意路径。 */
export function loadTheme(name: string): LoadedTheme {
  const themes = scanThemes();
  const theme = themes.find((item) => item.name === name);
  if (!theme) {
    throw new Error(`THEME_NOT_FOUND: ${name}`);
  }
  const css = fs.readFileSync(path.join(themeDirectory(), theme.fileName), 'utf-8');
  return { ...theme, css };
}
