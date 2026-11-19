// 三套换肤特效是从 vue2 原样搬来的 Options API 组件（纯 canvas 绘制、无类型），
// 这里补最小声明，让 vue-tsc 不为它们报 TS7016。
declare module '@/components/effects/FireEffect.vue' {
  const FireEffect: import('vue').DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default FireEffect;
}

declare module '@/components/effects/HeartEffect.vue' {
  const HeartEffect: import('vue').DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default HeartEffect;
}

declare module '@/components/effects/ButterflyEffect.vue' {
  const ButterflyEffect: import('vue').DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default ButterflyEffect;
}
