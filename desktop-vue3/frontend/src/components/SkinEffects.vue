<template>
  <div class="skin-effects">
    <FireEffect ref="fireRef" />
    <HeartEffect ref="heartRef" />
    <ButterflyEffect ref="butterflyRef" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import FireEffect from '@/components/effects/FireEffect.vue';
import HeartEffect from '@/components/effects/HeartEffect.vue';
import ButterflyEffect from '@/components/effects/ButterflyEffect.vue';
import type { Skin } from '@/utils/skin';

/**
 * 换肤特效层（复刻 vue2 App.vue 里的 FireEffect / HeartEffect / ButterflyEffect 三件套）。
 * 三层全屏 canvas 常驻挂载、平时 visible=false，只在换肤瞬间 start() 一次。
 */
const fireRef = ref<any>(null);
const heartRef = ref<any>(null);
const butterflyRef = ref<any>(null);

function play(skin: Skin): void {
  if (skin === 'nezha') {
    fireRef.value?.start?.();
  } else if (skin === 'infp') {
    butterflyRef.value?.start?.();
  } else {
    heartRef.value?.start?.();
  }
}

defineExpose({ play });
</script>

<style scoped>
.skin-effects {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9000;
}
</style>
