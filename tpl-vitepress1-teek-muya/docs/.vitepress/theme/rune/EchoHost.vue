<template>
  <span
    class="ag-echo-live"
    :data-echo-name="name"
    :data-echo-attrs="attrs"
    :data-echo-action="hydrated ? 'echo-click' : undefined"
    :style="{ '--echo-color': color }"
  >
    <span class="ag-echo-live__at">@</span>
    <span class="ag-echo-live__name">{{ name }}</span>
    <code v-if="attrs" class="ag-echo-live__attrs">{{ attrs }}</code>
    <span class="ag-echo-live__hint">JS 回响</span>
  </span>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

withDefaults(
  defineProps<{ name: string; attrs?: string; prompt?: string; color?: string }>(),
  { attrs: '', prompt: '', color: '#26A69A' },
)

const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})
</script>

<style>
.ag-echo-live {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px dotted var(--echo-color, #26A69A);
  background: color-mix(in srgb, var(--echo-color, #26A69A) 10%, transparent);
  font-size: 12px;
  line-height: 1.6;
  vertical-align: baseline;
}
.ag-echo-live__at {
  color: var(--echo-color, #26A69A);
  font-weight: 600;
}
.ag-echo-live__name {
  color: var(--echo-color, #26A69A);
}
.ag-echo-live__attrs {
  font-family: Consolas, Monaco, monospace;
  font-size: 11px;
  opacity: 0.75;
}
.ag-echo-live__hint {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 10px;
  opacity: 0.6;
}
</style>
