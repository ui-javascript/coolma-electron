/**
 * 窗口关闭放行标记。
 *
 * 主进程拦截 `BrowserWindow.close` 给系统关闭（Alt+F4 / 系统菜单 X）补二次确认；
 * 只有渲染进程确认、或应用主动 quit 时才置位放行，避免再次弹窗形成死循环。
 */
let allowed = false;
let armed = false;

/** 渲染进程确认/应用主动退出时置位，放行本次 close。 */
export function allowWindowClose(): void {
  allowed = true;
}

export function isWindowCloseAllowed(): boolean {
  return allowed;
}

/** 渲染进程装好关闭确认监听后才武装拦截，避免启动期把窗口锁死。 */
export function armWindowCloseGuard(): void {
  armed = true;
}

export function isWindowCloseArmed(): boolean {
  return armed;
}
