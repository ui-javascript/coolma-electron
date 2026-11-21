// ----- 1. 基本信息（BasicInfo） -----
export const runeTemplatesResumeBasicInfo = () => {
  return `<template>
  <div class="rune-rb">
    <div class="rune-rb__avatar">
      <img v-if="value && value.avatar" :src="value.avatar" alt="avatar" />
      <span v-else class="rune-rb__avatar-fallback">{{ initials }}</span>
    </div>
    <div class="rune-rb__main">
      <div class="rune-rb__name">{{ (value && value.name) || '未命名' }}</div>
      <div class="rune-rb__title">{{ (value && value.title) || '' }}</div>
      <div class="rune-rb__meta">
        <span v-if="value && value.phone"><q-icon name="phone" size="0.95em" class="q-mr-xs" />{{ value.phone }}</span>
        <span v-if="value && value.email"><q-icon name="email" size="0.95em" class="q-mr-xs" />{{ value.email }}</span>
        <span v-if="value && value.location"><q-icon name="place" size="0.95em" class="q-mr-xs" />{{ value.location }}</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'RuneResumeBasicInfo',
  props: {
    value: { type: Object, default: () => ({}) }
  },
  computed: {
    initials () {
      const n = (this.value && this.value.name || '').trim()
      if (!n) return '?'
      return n.slice(0, 1).toUpperCase()
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-rb { display: flex; align-items: center; gap: 16px; }
.rune-rb__avatar { flex: 0 0 auto; width: 64px; height: 64px; border-radius: 50%; overflow: hidden; background: rgba(126, 87, 194, 0.12); display: flex; align-items: center; justify-content: center; }
.rune-rb__avatar img { width: 100%; height: 100%; object-fit: cover; }
.rune-rb__avatar-fallback { color: #6A1B9A; font-size: 24px; font-weight: 700; }
.rune-rb__main { flex: 1 1 auto; min-width: 0; }
.rune-rb__name { font-size: 20px; font-weight: 700; color: #222; }
.rune-rb__title { font-size: 13px; color: #6A1B9A; margin-top: 2px; font-weight: 500; }
.rune-rb__meta { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px; font-size: 12px; color: rgba(0, 0, 0, 0.65); }
</style>`
}

export default runeTemplatesResumeBasicInfo