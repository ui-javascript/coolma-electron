<template>
  <span
    ref="hostEl"
    class="ag-echo-live"
    :data-echo-name="name"
    :data-echo-attrs="attrs"
    :data-echo-field="echoDef ? echoDef.field : ''"
    :data-echo-action="hydrated ? 'echo-click' : undefined"
    :data-echo-runtime="runtimeState"
    :style="{ '--echo-color': echoDef ? echoDef.color || '#26A69A' : '#26A69A' }"
    :title="echoDef ? echoDef.desc : ''"
  >
    <span class="ag-echo-live__at">@</span>
    <span class="ag-echo-live__name">{{ echoDef ? echoDef.name : name }}</span>
    <code v-if="attrs" class="ag-echo-live__attrs">{{ attrs }}</code>
    <span v-if="echoDef && echoDef.field" class="ag-echo-live__hint">{{ echoDef.field }}</span>
    <span v-if="runtimeError" class="ag-echo-live__error">未生效</span>
  </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { findEcho, type EchoCard } from './echoCatalog'
import { applyEchoEffect } from 'libs-echo-runtime'

const props = withDefaults(
  defineProps<{ name: string; attrs?: string; prompt?: string }>(),
  { attrs: '', prompt: '' },
)

const hostEl = ref<HTMLElement | null>(null)
const echoDef = ref<EchoCard | null>(null)
const hydrated = ref(false)
const runtimeState = ref<'idle' | 'running' | 'anchor-only' | 'missing' | 'error'>('idle')
const runtimeError = ref('')

let cleanup: (() => void) | null = null

onMounted(() => {
  hydrated.value = true
  echoDef.value = findEcho(props.name)
  if (!echoDef.value) {
    runtimeState.value = 'missing'
    return
  }
  if (!echoDef.value.field) {
    runtimeState.value = 'anchor-only'
    return
  }
  try {
    cleanup = applyEchoEffect(hostEl.value as HTMLElement, echoDef.value, props.attrs)
    runtimeState.value = 'running'
  } catch (error) {
    console.warn('[echo-host] apply failed:', error)
    runtimeError.value = error instanceof Error ? error.message : String(error)
    runtimeState.value = 'error'
  }
})

onBeforeUnmount(() => {
  if (cleanup) cleanup()
  cleanup = null
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
.ag-echo-live__error {
  margin-left: 4px;
  color: #c62828;
  font-size: 10px;
}
</style>
