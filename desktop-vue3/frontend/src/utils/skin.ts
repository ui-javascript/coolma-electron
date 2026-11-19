/**
 * 皮肤系统（复刻 vue2 mixins/skinMixin.js）。
 *
 * 三套皮：baiyang（默认，不带主题色）/ nezha（赭红）/ infp（青绿）。
 * 换肤做两件事：把主题色写进 CSS 变量（同时喂给 Element Plus 的 primary 系列），
 * 再触发一次画布粒子特效。
 */

export type Skin = 'baiyang' | 'nezha' | 'infp';

export const SKIN_LIST: Skin[] = ['baiyang', 'nezha', 'infp'];
export const DEFAULT_SKIN: Skin = 'baiyang';

/** null = 恢复默认（Element Plus 自己的蓝），有值 = 覆盖主色。 */
export const SKIN_COLORS: Record<Skin, { main: string; rgb: string } | null> = {
  baiyang: null,
  nezha: { main: '#b5817d', rgb: '181, 129, 125' },
  infp: { main: '#21b56f', rgb: '33, 181, 111' },
};

/** 切换提示的配色（对齐 vue2 SKIN_NOTIFY_COLORS）。 */
export const SKIN_NOTIFY_COLORS: Record<Skin, { bg: string; text: string }> = {
  baiyang: { bg: 'rgba(64, 158, 255, 0.9)', text: '#fff' },
  nezha: { bg: 'rgba(181, 129, 125, 0.95)', text: '#fff' },
  infp: { bg: 'rgba(33, 181, 111, 0.9)', text: '#fff' },
};

const THEME_ALPHA_STEPS = [90, 80, 70, 60, 50, 40, 30, 20, 10] as const;

/** Element Plus 需要 light-3/5/7/8/9 与 dark-2 才会整体变色（按钮/边框/背景一起）。 */
const EL_LIGHT_STEPS = [3, 5, 7, 8, 9] as const;

function mixWithWhite(hex: string, weight: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * weight);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function mixWithBlack(hex: string, weight: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (channel: number) => Math.round(channel * (1 - weight));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** 应用皮肤主题色（含 vue2 的 --themeColor* 与 Element Plus 主色变量）。 */
export function applySkinThemeColor(skin: Skin): void {
  const root = document.documentElement;
  const colors = SKIN_COLORS[skin] ?? null;

  if (!colors) {
    root.style.removeProperty('--themeColor');
    for (const step of THEME_ALPHA_STEPS) {
      root.style.removeProperty(`--themeColor${step}`);
    }
    // 只清掉我们写过的那几个，避免把 Element Plus 自带的 light-1/2/6 也抹了
    for (const step of EL_LIGHT_STEPS) {
      root.style.removeProperty(`--el-color-primary-light-${step}`);
    }
    root.style.removeProperty('--el-color-primary-dark-2');
    root.style.removeProperty('--el-color-primary');
    return;
  }

  root.style.setProperty('--themeColor', `rgba(${colors.rgb}, 1)`);
  for (const step of THEME_ALPHA_STEPS) {
    root.style.setProperty(`--themeColor${step}`, `rgba(${colors.rgb}, ${step / 100})`);
  }

  root.style.setProperty('--el-color-primary', colors.main);
  for (const step of EL_LIGHT_STEPS) {
    root.style.setProperty(`--el-color-primary-light-${step}`, mixWithWhite(colors.main, step / 10));
  }
  root.style.setProperty('--el-color-primary-dark-2', mixWithBlack(colors.main, 0.2));
}

/** 皮肤名 → i18n key（settings.skin.<name>）。 */
export function skinLabelKey(skin: Skin): string {
  return `settings.skin.${skin}`;
}
