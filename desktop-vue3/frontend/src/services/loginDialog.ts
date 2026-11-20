import { reactive } from 'vue';

/**
 * 全局登录弹窗状态：App 持有弹窗，顶栏 / 设置页只负责打开。
 * successTick 用作登录成功后的刷新信号，避免各页面互相 import 组件。
 */
export const loginDialogState = reactive({
  visible: false,
  successTick: 0,
  logoutTick: 0,
});

export function openLoginDialog(): void {
  loginDialogState.visible = true;
}

export function closeLoginDialog(): void {
  loginDialogState.visible = false;
}

export function notifyLoginSuccess(): void {
  loginDialogState.successTick += 1;
}

/** 对齐 vue2 Header watch isLogin：登出后立即弹登录框。 */
export function notifyLogout(): void {
  loginDialogState.logoutTick += 1;
  loginDialogState.visible = true;
}
