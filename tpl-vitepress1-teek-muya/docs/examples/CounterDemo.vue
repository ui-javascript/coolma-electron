<script setup>
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <button class="sample-counter" type="button" @click="count += 1">计数：{{ count }}</button>
</template>

<style scoped>
.sample-counter {
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 0.5rem;
  color: var(--vp-c-brand-1);
}
</style>
