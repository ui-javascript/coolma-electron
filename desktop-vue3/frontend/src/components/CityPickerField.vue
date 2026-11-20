<template>
  <div class="city-picker-field" :style="{ width: widthStyle }">
    <input
      ref="inputEl"
      :id="inputId"
      readonly
      type="text"
      :placeholder="placeholder"
      :disabled="disabled"
      class="city-picker-input"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 城市三级联动（移植 vue2 `components/common/cityPickerField.vue`）。
 * 依赖 CDN 注入的 jQuery city-picker；注入未完成时每 100ms 重试，最多 8 秒。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { whenCdnDepsReady } from '@/utils/cdnDeps';

export interface CityValue {
  province: string;
  city: string;
  district: string;
}

const props = withDefaults(
  defineProps<{
    modelValue?: CityValue;
    placeholder?: string;
    width?: string | number;
    disabled?: boolean;
  }>(),
  {
    modelValue: () => ({ province: '', city: '', district: '' }),
    placeholder: '点击选择省/市/区',
    width: 260,
    disabled: false,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: CityValue): void;
  (event: 'change', value: CityValue): void;
}>();

const inputId = `city-picker-input-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const inputEl = ref<HTMLInputElement | null>(null);
const widthStyle = computed(() => (typeof props.width === 'number' ? `${props.width}px` : props.width));
let internalValue = normalize(props.modelValue);
let ready = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function normalize(value: unknown): CityValue {
  const base = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    province: typeof base.province === 'string' ? base.province : '',
    city: typeof base.city === 'string' ? base.city : '',
    district: typeof base.district === 'string' ? base.district : '',
  };
}

function same(a: CityValue, b: CityValue): boolean {
  return a.province === b.province && a.city === b.city && a.district === b.district;
}

function jquery(): any {
  const host = window as Window & { jQuery?: any; $?: any };
  return host.$ || host.jQuery;
}

function teardownPoll(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function detachPicker(el: HTMLInputElement | null, $: any): void {
  if (!el || !$ || !$.fn || !$.fn.citypicker) {
    return;
  }
  $(el).off('.cpf');
  const inst = $(el).data && $(el).data('citypicker');
  if (!inst) {
    return;
  }
  if (inst.$dropdown) {
    inst.$dropdown.off('.cpf');
  }
  try {
    $(el).citypicker('destroy');
  } catch {
    // noop
  }
}

function syncFromPicker(el: HTMLInputElement, $: any): void {
  let next: CityValue;
  try {
    const inst = $(el).data && $(el).data('citypicker');
    if (!inst || !inst.$dropdown) {
      return;
    }
    const selects = inst.$dropdown.find('.city-select').toArray();
    const items = selects.map((item: HTMLElement) => $(item).data('item') || null);
    next = {
      province: items[0] ? items[0].address || '' : '',
      city: items[1] ? items[1].address || '' : '',
      district: items[2] ? items[2].address || '' : '',
    };
  } catch {
    return;
  }
  const normalized = normalize(next);
  if (same(internalValue, normalized)) {
    return;
  }
  internalValue = normalized;
  emit('update:modelValue', { ...normalized });
  emit('change', { ...normalized });
}

function bindPickerEvents(el: HTMLInputElement, $: any): void {
  const inst = $(el).data && $(el).data('citypicker');
  $(el).on('change.cpf', () => syncFromPicker(el, $));
  if (inst && inst.$dropdown) {
    inst.$dropdown.on('click.cpf', '.city-select a', () => {
      setTimeout(() => syncFromPicker(el, $), 0);
    });
  }
}

function initPicker(el: HTMLInputElement, $: any, value: CityValue): void {
  detachPicker(el, $);
  $(el).val('');
  // destroy() 会移除 city-picker-input，重建时补回来（scoped 样式依赖它）。
  $(el).addClass('city-picker-input');
  try {
    $(el).citypicker({
      province: value.province || '',
      city: value.city || '',
      district: value.district || '',
    });
  } catch (error) {
    console.warn('[CityPickerField] citypicker init error:', error);
    ready = true;
    return;
  }
  bindPickerEvents(el, $);
  ready = true;
}

function attach(el: HTMLInputElement, $: any): void {
  if (props.disabled) {
    detachPicker(el, $);
    ready = true;
    return;
  }
  initPicker(el, $, internalValue);
}

function rebuild(value: CityValue): void {
  const el = inputEl.value;
  const $ = jquery();
  if (!el || !$ || !$.fn || !$.fn.citypicker) {
    return;
  }
  initPicker(el, $, value);
}

function tryAttachCitypicker(): void {
  teardownPoll();
  let attempt = 0;
  const maxAttempts = 80;
  const tryInit = () => {
    const el = inputEl.value;
    const $ = jquery();
    const hasCitypicker = Boolean($ && $.fn && $.fn.citypicker);
    if (el && $ && hasCitypicker) {
      pollTimer = null;
      attach(el, $);
      return;
    }
    attempt += 1;
    if (attempt >= maxAttempts) {
      console.warn('[CityPickerField] jQuery citypicker not ready, give up');
      pollTimer = null;
      return;
    }
    pollTimer = setTimeout(tryInit, 100);
  };
  pollTimer = setTimeout(tryInit, 0);
}

function scheduleInit(): void {
  teardownPoll();
  whenCdnDepsReady()
    .then(() => tryAttachCitypicker())
    .catch(() => tryAttachCitypicker());
}

function destroy(): void {
  teardownPoll();
  const el = inputEl.value;
  const $ = jquery();
  detachPicker(el, $);
  if (el) {
    el.classList.add('city-picker-input');
  }
  ready = false;
}

watch(
  () => props.modelValue,
  (value) => {
    const normalized = normalize(value);
    if (same(internalValue, normalized)) {
      return;
    }
    internalValue = normalized;
    if (ready) {
      rebuild(normalized);
    }
  },
  { deep: true },
);

watch(
  () => props.disabled,
  (disabled) => {
    const el = inputEl.value;
    const $ = jquery();
    if (!el || !$ || !$.fn || !$.fn.citypicker) {
      return;
    }
    if (disabled) {
      detachPicker(el, $);
      ready = false;
    } else if (!ready) {
      attach(el, $);
    }
  },
);

onMounted(() => {
  void nextTick(scheduleInit);
});

onBeforeUnmount(destroy);
</script>

<style scoped>
.city-picker-field {
  flex: 0 0 auto;
  position: relative;
  min-width: 240px;
}

.city-picker-input {
  width: 100%;
  height: 32px;
  font-size: 13px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color, #c0c0c0);
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-primary, rgba(0, 0, 0, 0.85));
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.city-picker-input:hover,
.city-picker-input:focus {
  border-color: var(--el-color-primary, #43a047);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7, rgba(67, 160, 71, 0.2));
}
</style>
