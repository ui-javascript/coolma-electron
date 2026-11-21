import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { themeLoadSchema } from '../shared/ipc/schemas';
import {
  loadTheme,
  openThemeDirectory,
  refreshThemes,
  scanThemes,
  type LoadedTheme,
  type ThemeMeta,
} from '../service/theme/theme-manager';
import { failFromError } from './controller-utils';

class ThemeController {
  /** 当前主题目录里的可用主题（首次调用会建目录并写两个基线文件）。 */
  async list(): Promise<IpcResult<ThemeMeta[]>> {
    try {
      return ok(scanThemes());
    } catch (error) {
      return failFromError(error, 'THEME_LIST_ERROR');
    }
  }

  /** 用户在目录里新建/改名 CSS 后点「刷新」。 */
  async refresh(): Promise<IpcResult<ThemeMeta[]>> {
    try {
      return ok(refreshThemes());
    } catch (error) {
      return failFromError(error, 'THEME_REFRESH_ERROR');
    }
  }

  /** 在系统文件管理器里定位主题目录。 */
  async openFolder(): Promise<IpcResult<{ opened: true; path: string }>> {
    try {
      return ok({ opened: true as const, path: openThemeDirectory() });
    } catch (error) {
      return failFromError(error, 'THEME_OPEN_FOLDER_ERROR');
    }
  }

  /** 读取主题 CSS；`.dark.css` 同时返回 dark=true，由渲染层切明暗基线。 */
  async load(args?: unknown): Promise<IpcResult<LoadedTheme>> {
    try {
      const { name } = themeLoadSchema.parse(args);
      return ok(loadTheme(name));
    } catch (error) {
      return failFromError(error, 'THEME_LOAD_ERROR');
    }
  }
}

ThemeController.toString = () => '[class ThemeController]';

export default ThemeController;
