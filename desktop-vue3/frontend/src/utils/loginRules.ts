/**
 * 登录弹窗纯规则（对齐 vue2 LoginDialog）：
 * - 自建服务器地址去掉尾部斜杠，空值回官方地址；
 * - 只接受 http/https；
 * - 注册地址：自建启用且地址非空时用自建地址，否则用 wiz.cn（vue2 signUpHandler 行为）。
 */
export const DEFAULT_LOGIN_BASE = 'https://as.wiz.cn';
export const WIZ_SIGNUP_BASE = 'https://wiz.cn';

export function normalizeServerUrl(raw: unknown): string {
  const value = String(raw ?? '').trim().replace(/\/+$/, '');
  return value || DEFAULT_LOGIN_BASE;
}

export function isValidServerUrl(raw: unknown): boolean {
  return /^https?:\/\//i.test(String(raw ?? '').trim());
}

export function resolveSignupUrl(raw: unknown, selfHostEnabled: boolean): string {
  const value = String(raw ?? '').trim().replace(/\/+$/, '');
  const base = selfHostEnabled && value ? value : WIZ_SIGNUP_BASE;
  return `${base}/signup`;
}
