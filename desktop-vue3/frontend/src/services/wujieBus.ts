/**
 * wujie bus 的集中出处。
 *
 * 为什么不在 service 里直接 `import WujieVue`：wujie 在模块顶层就摸 window/self，
 * 任何在非浏览器环境（SSR 构建、单测）里 import 它的文件都会炸。
 * 所以由真正渲染 wujie 的宿主组件在 mount 时把 bus 注册进来，service 只拿引用。
 */
type Bus = { $on: Function; $off: Function; $emit: Function };

let currentBus: Bus | null = null;

export function setWujieBus(bus: unknown): void {
  currentBus = (bus as Bus) ?? null;
}

export function getWujieBus(): Bus | null {
  return currentBus;
}
