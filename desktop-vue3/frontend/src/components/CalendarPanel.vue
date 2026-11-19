<template>
  <div class="calendar-panel">
    <div class="calendar-header">
      <el-select v-model="basisProxy" size="small" class="basis-select">
        <el-option
          v-for="item in basisOptions"
          :key="item.value"
          :label="t(item.label)"
          :value="item.value"
        />
      </el-select>
      <div class="month-nav">
        <el-button text size="small" @click="shiftMonth(-1)">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="month-label">{{ monthLabel }}</span>
        <el-button text size="small" @click="shiftMonth(1)">
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
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
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue';
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

const monthLabel = computed(() => {
  const y = cursor.value.getFullYear();
  const m = cursor.value.getMonth() + 1;
  return locale.value === 'zh-CN' ? `${y}年${m}月` : `${y}/${m}`;
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

function select(date: string): void {
  emit('update:modelValue', date);
}

function shiftMonth(delta: number): void {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1);
}
</script>

<style scoped>
.calendar-panel {
  padding: 8px 10px;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 8px;
}

.basis-select {
  width: 96px;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.month-label {
  font-size: 13px;
  font-weight: 600;
  min-width: 68px;
  text-align: center;
}

.calendar-week-head,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.week-name {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 2px 0;
}

.calendar-cell {
  position: relative;
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 5px 0;
  font-size: 12px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.calendar-cell:hover {
  background: var(--el-fill-color-light);
}

.calendar-cell.dim {
  color: var(--el-text-color-placeholder);
}

.calendar-cell.today .day-num {
  color: var(--el-color-primary);
  font-weight: 700;
}

.calendar-cell.selected {
  background: var(--el-color-primary-light-8);
}

.note-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--el-color-primary);
}
</style>
