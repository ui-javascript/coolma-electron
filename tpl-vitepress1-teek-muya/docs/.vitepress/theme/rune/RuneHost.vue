<template>
  <div
    class="ag-rune-live"
    :data-rune-name="name"
    :data-rune-id="runeId"
    :data-rune-node-id="nodeId"
    :data-rune-state="phase"
    :style="runeDef ? { '--rune-color': runeDef.color || '#26A69A' } : null"
  >
    <div ref="hostEl" class="ag-rune-live__host" />

    <div v-if="phase !== 'ready'" class="ag-rune-live__card">
      <span class="ag-rune-live__label">{{ displayName }}</span>
      <span v-if="innerValue" class="ag-rune-live__value">{{ innerValue }}</span>
      <span class="ag-rune-live__badge">
        {{ phase === 'error' ? '已降级为静态卡片' : '静态渲染' }}
      </span>
    </div>

    <p v-if="error" class="ag-rune-live__error">
      <span>{{ error }}</span>
      <button type="button" class="ag-rune-live__retry" @click="resolveRune">重试</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { findRune, type RuneCard } from './catalog'

type RuneVm = {
  $el: HTMLElement
  $destroy: () => void
  value?: unknown
  [key: string]: unknown
}

const props = withDefaults(
  defineProps<{
    name: string
    value?: string | number
    runeId?: string
    nodeId?: string
  }>(),
  { value: '', runeId: '', nodeId: '' },
)

const emit = defineEmits<{
  (e: 'input', value: string): void
  (e: 'change', payload: { runeId: string; nodeId: string; value: string }): void
}>()

const phase = ref<'static' | 'ready' | 'error'>('static')
const runeDef = ref<RuneCard | null>(null)
const innerValue = ref(props.value == null ? '' : String(props.value))
const error = ref('')
const hostEl = ref<HTMLElement | null>(null)

let vm: RuneVm | null = null
let disposed = false

const displayName = computed(() => (runeDef.value ? runeDef.value.name : props.name))

function pushValue(next: string) {
  innerValue.value = next
  emit('input', next)
  emit('change', { runeId: props.runeId || '', nodeId: props.nodeId || '', value: next })
}

function handleValueChange(payload: { value?: unknown } | undefined) {
  const next = payload && payload.value != null ? String(payload.value) : ''
  if (next !== innerValue.value) pushValue(next)
}

function destroyVm() {
  if (!vm) return
  try {
    vm.$destroy()
  } catch (error) {
    // 卸载失败不影响页面
    console.warn('[rune-host] destroy failed', error)
  }
  if (vm.$el && vm.$el.parentNode) vm.$el.parentNode.removeChild(vm.$el)
  vm = null
}

async function resolveRune() {
  error.value = ''
  phase.value = 'static'
  runeDef.value = null
  destroyVm()

  const rune = findRune(props.name)
  if (!rune) {
    error.value = `目录里没有名为「${props.name}」的符文`
    phase.value = 'error'
    return
  }
  runeDef.value = rune

  try {
    // 动态导入：编译器与 hel 加载器只在浏览器 mounted 之后进入执行链路
    const mod = await import('libs-muya-rune-vue3/runeRenderer')
    const factory = mod.createRuneRendererCtor(rune) as
      | ((options: { propsData: Record<string, unknown> }) => RuneVm)
      | null
    if (typeof factory !== 'function') throw new Error('SFC 编译失败（模板或脚本不合法）')

    vm = factory({
      propsData: {
        value: innerValue.value,
        runeId: props.runeId || '',
        nodeId: props.nodeId || '',
        rune,
        onValueChange: handleValueChange,
      },
    })
    if (!vm || !vm.$el) throw new Error('渲染器没有返回可用实例')
    if (disposed) {
      destroyVm()
      return
    }
    hostEl.value?.appendChild(vm.$el)
    phase.value = 'ready'
  } catch (e) {
    console.warn('[rune-host] resolve failed:', e)
    error.value = `符文「${props.name}」挂载失败：${e instanceof Error ? e.message : String(e)}`
    phase.value = 'error'
  }
}

watch(
  () => props.value,
  next => {
    const normalized = next == null ? '' : String(next)
    if (normalized === innerValue.value) return
    innerValue.value = normalized
    if (vm) vm.value = normalized
  },
)

watch(() => props.name, () => resolveRune())

onMounted(() => {
  disposed = false
  resolveRune()
})

onBeforeUnmount(() => {
  disposed = true
  destroyVm()
})
</script>

<style>
.ag-rune-live {
  margin: 12px 0;
}
.ag-rune-live__host {
  display: contents;
}
.ag-rune-live__card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px dashed var(--rune-color, #26A69A);
  background: color-mix(in srgb, var(--rune-color, #26A69A) 8%, transparent);
  font-size: 13px;
  line-height: 1.5;
}
.ag-rune-live__label {
  font-weight: 600;
  color: var(--rune-color, #26A69A);
}
.ag-rune-live__value {
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}
.ag-rune-live__badge {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.55;
}
.ag-rune-live__error {
  margin: 6px 0 0;
  color: #c62828;
  font-size: 12px;
}
.ag-rune-live__retry {
  margin-left: 8px;
  border: none;
  background: transparent;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
}
</style>
