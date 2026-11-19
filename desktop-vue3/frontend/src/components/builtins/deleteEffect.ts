/**
 * 「删除特效」内置微应用（移植 vue2 builtins/deleteEffect.js）。
 *
 * 设计原则不变：主项目不硬编码业务条目，内置条目在这里注册；用户可启用/停用，
 * enabled=false 时删除流程走原生确认框。
 */
import {
  MICRO_APP_DISPLAY_MODES,
  getBuiltinApps,
  loadMicroApps,
  registerBuiltinApps,
  type MicroApp,
} from '@/services/microApps';

export const DELETE_EFFECT_APP_ID = 'echo-monster-deleter';

export const deleteEffectBuiltinApp: MicroApp = {
  id: DELETE_EFFECT_APP_ID,
  name: '小怪兽删除特效',
  icon: 'magic-stick',
  url: 'https://luo0412.github.io/echo-monster-deleter/',
  devUrl: 'http://localhost:5175/',
  libName: '',
  exportName: '',
  version: '',
  loadMode: 'iframe',
  isDefault: false,
  // 默认关闭：删除流程走原生确认框，用户主动开启才走特效
  enabled: false,
  isMobile: false,
  displayMode: MICRO_APP_DISPLAY_MODES.FULLSCREEN,
  isBuiltIn: true,
};

export function installDeleteEffectBuiltin(): void {
  registerBuiltinApps([deleteEffectBuiltinApp]);
}

/** 从库里的列表找内置条目；没有就退回注册表默认值（不写库）。 */
export async function findDeleteEffectEntry(): Promise<MicroApp | null> {
  const stored = await loadMicroApps();
  const found = stored.find((app) => app.id === DELETE_EFFECT_APP_ID);
  if (found) {
    return found;
  }
  return getBuiltinApps().find((app) => app.id === DELETE_EFFECT_APP_ID) ?? null;
}

/** 是否启用特效删除（父级据此决定 summon overlay 还是走原生确认）。 */
export async function isDeleteEffectEnabled(): Promise<boolean> {
  const entry = await findDeleteEffectEntry();
  return Boolean(entry && entry.enabled);
}

/** 注册全部内置条目（应用启动调用一次，幂等）。 */
export function installMicroAppsBuiltins(): void {
  installDeleteEffectBuiltin();
}
