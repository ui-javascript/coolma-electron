<template>
  <div class='settings-section-content'>
    <!-- 标题栏 -->
    <div class='row items-center no-wrap q-mb-xs section-title'>
      <div :class='["section-title-bar", `bg-${accentColor}`]' />
      <span class='text-subtitle2 text-weight-medium'>
        {{ title }}
      </span>
      <q-space />
      <slot name='actions' />
    </div>

    <q-separator class='q-my-xs' />

    <!-- 主内容区 -->
    <div class='section-body'>
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: 'SettingsSectionContent',
  props: {
    title: {
      type: String,
      required: true
    },
    accentColor: {
      type: String,
      default: 'primary'
    }
  }
}
</script>

<style scoped>
.settings-section-content {
  padding: 0 6px 8px 6px;
}

.section-title {
  padding-left: 2px;
}

.section-title-bar {
  width: 3px;
  min-height: 1rem;
  margin-right: 8px;
  border-radius: 1px;
  flex-shrink: 0;
}

.section-body {
  padding-top: 4px;
}

/* 滚动条样式 */
.settings-section-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.settings-section-content::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-section-content::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.25);
  border-radius: 999px;
}
</style>
