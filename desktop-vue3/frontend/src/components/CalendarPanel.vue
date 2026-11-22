<template>
  <div class="calendar-panel">
    <div class="calendar-header">
      <div class="basis-group">
        <span class="basis-label">{{ t('calendar.filterLabel') }}</span>
        <el-select v-model="basisProxy" size="small" class="basis-select">
          <el-option
            v-for="item in basisOptions"
            :key="item.value"
            :label="t(item.label)"
            :value="item.value"
          />
        </el-select>
      </div>
      <el-date-picker
        :model-value="monthPicker"
        type="month"
        size="small"
        format="YYYY年M月"
        value-format="YYYY-MM"
        :clearable="false"
        class="month-picker"
        style="width: 112px; flex: 0 0 112px"
        @update:model-value="onMonthPickerChange"
      />
    </div>

    <div class="calendar-week-head">
      <span v-for="name in weekNames" :key="name" class="week-name">{{ name }}</span>
    </div>

    <div class="calendar-grid">
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        class="calendar-cell"
        :class="{
          dim: !cell.inMonth,
          today: cell.date === todayKey,
          selected: cell.date === modelValue,
          hasnote: cell.hasNote,
        }"
        @click="select(cell.date)"
      >
        <span class="day-num">{{ cell.day }}</span>
        <span v-if="cell.hasNote" class="note-dot" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarDateBasisEnum, type CalendarDateBasis } from '@shared/enums/app';
import type { NoteSummary } from '@shared/types/domain';
import { dateKeyOf, noteDateKey } from '@/utils/note';

/**
 * 日历视图（复刻 vue2 CalendarPanel 的核心交互）：
 * - 月历上标注有笔记的日期（蓝点）；
 * - 日期基准 created/modified 可切换；
 * - 点击日期 → 过滤右侧笔记列表。
 * vue3 与 vue2 的差异：vue2 每次都发 fetchCalendarNoteDates 查库，
 * 这里直接用已加载的全量笔记在本地聚合（与 timeGroup 同架构）。
 */
const props = defineProps<{
  modelValue: string;
  basis: CalendarDateBasis;
  notes: NoteSummary[];
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'update:basis', value: CalendarDateBasis): void;
}>();

const { t, locale } = useI18n();

const basisOptions = CalendarDateBasisEnum.items as Array<{ value: CalendarDateBasis; label: string }>;

const basisProxy = computed({
  get: () => props.basis,
  set: (value: CalendarDateBasis) => emit('update:basis', value),
});

const cursor = ref(new Date());

const todayKey = dateKeyOf(Date.now());

/** 月份选择器值（YYYY-MM），对照 vue2 的 a-month-picker。 */
const monthPicker = computed(() => {
  const y = cursor.value.getFullYear();
  const m = String(cursor.value.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
});

const weekNames = computed(() => {
  const zh = ['一', '二', '三', '四', '五', '六', '日'];
  const en = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return locale.value === 'zh-CN' ? zh : en;
});

/** 有笔记的日期集合（按当前基准聚合）。 */
const noteDates = computed(() => {
  const set = new Set<string>();
  for (const note of props.notes) {
    const key = noteDateKey(note, props.basis);
    if (key) {
      set.add(key);
    }
  }
  return set;
});

const cells = computed(() => {
  const y = cursor.value.getFullYear();
  const m = cursor.value.getMonth();
  const first = new Date(y, m, 1);
  // 周一开头（a-calendar 默认也是周一起始）
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(y, m, 1 - offset);
  const result: Array<{ key: string; date: string; day: number; inMonth: boolean; hasNote: boolean }> = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dateKeyOf(d.getTime());
    result.push({
      key: key,
      date: key,
      day: d.getDate(),
      inMonth: d.getMonth() === m,
      hasNote: noteDates.value.has(key),
    });
  }
  return result;
});

function parseDateKey(value: string): Date | null {
  const parts = String(value ?? '').split('-').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function select(date: string): void {
  emit('update:modelValue', date);
}

/**
 * 对齐 vue2 onMonthPickerChange：切月份时同时选中新月份的同一天（月末自动收窄）。
 * 只换月份、不更新选中日期的话，右侧列表会继续停留在旧日期。
 */
function onMonthPickerChange(value: string | number | Date | null): void {
  if (!value) {
    return;
  }
  const text = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
    : String(value);
  const [year, month] = text.split('-').map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return;
  }
  const anchor = parseDateKey(props.modelValue) ?? cursor.value;
  const target = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const next = new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(anchor.getDate(), lastDay),
  );
  cursor.value = next;
  emit('update:modelValue', dateKeyOf(next.getTime()));
}

// 外部（持久化日期/顶栏切模式）改了选中日期时，月历跳到对应月份。
watch(
  () => props.modelValue,
  (value) => {
    const date = parseDateKey(value);
    if (date) {
      cursor.value = new Date(date.getFullYear(), date.getMonth(), 1);
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.calendar-panel {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  padding: 8px 10px 6px;
  overflow: hidden;
}

.calendar-header {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px 10px;
  margin-bottom: 2px;
  padding: 0 4px 6px 0;
}

.basis-group {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.basis-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.basis-select {
  width: 108px;
}

.month-picker {
  width: 112px;
  flex: 0 0 112px;
}

.month-picker :deep(.el-input__wrapper) {
  min-height: 24px;
  padding: 0 8px;
  border-radius: 4px;
}

.month-picker :deep(.el-input__inner) {
  font-size: 12px;
}

.calendar-week-head,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.calendar-week-head {
  flex: 0 0 auto;
}

.week-name {
  padding: 2px 0 4px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  text-align: center;
}

.calendar-grid {
  flex: 1;
  min-height: 0;
  grid-auto-rows: minmax(0, 1fr);
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.calendar-cell {
  position: relative;
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--el-text-color-primary);
  cursor: pointer;
  font-size: 12px;
}

.day-num {
  line-height: 1.2;
}

.calendar-cell:hover {
  background: var(--el-fill-color-light);
}

.calendar-cell.dim {
  color: var(--el-text-color-placeholder);
}

.calendar-cell.today:not(.selected) .day-num {
  color: var(--el-color-primary);
  font-weight: 700;
}

.calendar-cell.selected {
  background: transparent;
}

.calendar-cell.selected .day-num {
  display: flex;
  width: 24px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  background: var(--el-color-primary);
  color: #fff;
  font-weight: 600;
}

.note-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--el-color-primary);
}
</style>
