/** vue2 HeaderRightGroup 的三个自动上传常量，原样保留。 */
export const AUTO_UPLOAD_POLL_INTERVAL = 30 * 1000;
export const AUTO_UPLOAD_KICKOFF_DELAY = 3 * 1000;
export const AUTO_UPLOAD_RETRY_COOLDOWN = 5 * 60 * 1000;

export interface AutoUploadGate {
  loggedIn: boolean;
  isSyncing: boolean;
  pendingTotal: number;
  cooldownUntil: number;
  now: number;
  online: boolean;
}

/**
 * 自动上传的唯一决策点：角标刷新后再判断，冷却期/断网/无 pending 一律不推。
 * 抽成纯函数是为了能在无 Electron 的运行时测试里逐条验证。
 */
export function shouldAutoUpload(gate: AutoUploadGate): boolean {
  if (!gate.loggedIn || gate.isSyncing) {
    return false;
  }
  if (gate.pendingTotal <= 0) {
    return false;
  }
  if (gate.cooldownUntil > gate.now) {
    return false;
  }
  if (!gate.online) {
    return false;
  }
  return true;
}
