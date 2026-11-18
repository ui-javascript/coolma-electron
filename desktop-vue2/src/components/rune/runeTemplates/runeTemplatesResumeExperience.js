// ----- 3. 时间段经历（ExperienceTime） -----
export const runeTemplatesResumeExperience = () => {
  return `<template>
  <div class="rune-re">
    <div class="rune-re__head">
      <div class="rune-re__title">{{ (value && value.title) || '职位' }}</div>
      <div class="rune-re__time">
        <q-icon name="schedule" size="0.9em" class="q-mr-xs" />
        {{ (value && value.startDate) || '开始' }} ~ {{ value && value.current ? '至今' : ((value && value.endDate) || '结束') }}
      </div>
    </div>
    <div class="rune-re__org">
      <q-icon name="business" size="0.9em" class="q-mr-xs" />
      {{ (value && value.org) || '机构' }}
    </div>
    <div class="rune-re__desc" v-if="value && value.desc">{{ value.desc }}</div>
  </div>
</template>

<script>
export default {
  name: 'RuneResumeExperienceTime',
  props: {
    value: { type: Object, default: () => ({}) }
  }
}
<\/script>

<style lang="less" scoped>
.rune-re { display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
.rune-re__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rune-re__title { font-size: 14px; font-weight: 600; color: #222; }
.rune-re__time { font-size: 12px; color: #6A1B9A; white-space: nowrap; }
.rune-re__org { font-size: 12px; color: rgba(0, 0, 0, 0.65); }
.rune-re__desc { font-size: 12px; color: rgba(0, 0, 0, 0.75); line-height: 1.6; white-space: pre-wrap; }
</style>`
}

export default runeTemplatesResumeExperience