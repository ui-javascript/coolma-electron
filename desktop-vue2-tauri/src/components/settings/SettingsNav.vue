<template>
  <div class='settings-nav'>
    <q-tabs v-model='tab' vertical dense class='text-teal no-border settings-dialog-tabs'>
      <q-tab
        v-for='item in topTabs'
        :key='item.value'
        :name='item.value'
        :icon='item.icon'
        :label='item.label'
        :class='item.tabClass'
      />
    </q-tabs>
  </div>
</template>

<script>
import { SettingsTabEnum } from 'src/utils/enum'

export default {
  name: 'SettingsNav',
  props: {
    value: {
      type: String,
      required: true
    }
  },
  computed: {
    tab: {
      get () {
        return this.value
      },
      set (val) {
        this.$emit('input', val)
      }
    },
    topTabs () {
      return SettingsTabEnum.items.map((item) => ({
        value: item.value,
        label: item.label,
        icon: item.icon,
        tabClass: item.tabClass
      }))
    }
  }
}
</script>

<style scoped>
.settings-nav {
  flex: 0 0 auto;
  width: 4.75rem;
  min-width: 4.75rem;
  max-width: 4.75rem;
  padding: 2px 0 4px;
}

.settings-dialog-tabs {
  width: 100%;
}

.settings-dialog-tabs ::v-deep(.q-tabs__content) {
  padding: 0;
}

.settings-dialog-tabs ::v-deep(.q-tab) {
  min-height: 32px;
  padding: 2px 4px;
}

.settings-dialog-tabs ::v-deep(.q-tab__icon) {
  font-size: 1.15rem;
}

.settings-dialog-tabs ::v-deep(.q-tab__label) {
  font-size: 0.7rem;
  line-height: 1.1;
  margin-top: 1px;
}

/* 一级导航高亮样式 */
.settings-dialog-tabs ::v-deep(.q-tab) {
  border-radius: 6px;
  margin: 2px 4px;
  transition: all 0.2s ease;
}

/* 通用 - 红色 */
.settings-dialog-tabs ::v-deep(.q-tab--active.text-red-7) {
  background: linear-gradient(135deg, rgba(229, 57, 53, 0.15) 0%, rgba(229, 57, 53, 0.05) 100%);
  box-shadow: 0 2px 8px rgba(229, 57, 53, 0.2);
}

.settings-dialog-tabs ::v-deep(.q-tab--active.text-red-7)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 50%;
  background: linear-gradient(180deg, #e53935 0%, #c62828 100%);
  border-radius: 0 3px 3px 0;
}

/* 编辑器 - 橙色 */
.settings-dialog-tabs ::v-deep(.q-tab--active.text-orange-8) {
  background: linear-gradient(135deg, rgba(239, 108, 0, 0.15) 0%, rgba(239, 108, 0, 0.05) 100%);
  box-shadow: 0 2px 8px rgba(239, 108, 0, 0.2);
}

.settings-dialog-tabs ::v-deep(.q-tab--active.text-orange-8)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 50%;
  background: linear-gradient(180deg, #ef6c00 0%, #e65100 100%);
  border-radius: 0 3px 3px 0;
}

/* AI - 黄色 */
.settings-dialog-tabs ::v-deep(.q-tab--active.text-yellow-9) {
  background: linear-gradient(135deg, rgba(249, 168, 37, 0.15) 0%, rgba(249, 168, 37, 0.05) 100%);
  box-shadow: 0 2px 8px rgba(249, 168, 37, 0.2);
}

.settings-dialog-tabs ::v-deep(.q-tab--active.text-yellow-9)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 50%;
  background: linear-gradient(180deg, #f9a825 0%, #f57f17 100%);
  border-radius: 0 3px 3px 0;
}

/* 云服务 - 绿色 */
.settings-dialog-tabs ::v-deep(.q-tab--active.text-green-7) {
  background: linear-gradient(135deg, rgba(67, 160, 71, 0.15) 0%, rgba(67, 160, 71, 0.05) 100%);
  box-shadow: 0 2px 8px rgba(67, 160, 71, 0.2);
}

.settings-dialog-tabs ::v-deep(.q-tab--active.text-green-7)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 50%;
  background: linear-gradient(180deg, #43a047 0%, #2e7d32 100%);
  border-radius: 0 3px 3px 0;
}

/* 云函数 - 青色（原 cyan-7 回响色调位置已与云函数互换） */
.settings-dialog-tabs ::v-deep(.q-tab--active.text-cyan-7) {
  background: linear-gradient(135deg, rgba(0, 172, 193, 0.15) 0%, rgba(0, 172, 193, 0.05) 100%);
  box-shadow: 0 2px 8px rgba(0, 172, 193, 0.2);
}

.settings-dialog-tabs ::v-deep(.q-tab--active.text-cyan-7)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 50%;
  background: linear-gradient(180deg, #00acc1 0%, #00838f 100%);
  border-radius: 0 3px 3px 0;
}

/* 回响 - 蓝色（原 blue-7 云函数色调位置已与回响互换） */
.settings-dialog-tabs ::v-deep(.q-tab--active.text-blue-7) {
  background: linear-gradient(135deg, rgba(2, 136, 209, 0.15) 0%, rgba(2, 136, 209, 0.05) 100%);
  box-shadow: 0 2px 8px rgba(2, 136, 209, 0.2);
}

.settings-dialog-tabs ::v-deep(.q-tab--active.text-blue-7)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 50%;
  background: linear-gradient(180deg, #0288d1 0%, #0277bd 100%);
  border-radius: 0 3px 3px 0;
}

/* 符文 - 紫色 */
.settings-dialog-tabs ::v-deep(.q-tab--active.text-purple-7) {
  background: linear-gradient(135deg, rgba(156, 39, 176, 0.15) 0%, rgba(156, 39, 176, 0.05) 100%);
  box-shadow: 0 2px 8px rgba(156, 39, 176, 0.2);
}

.settings-dialog-tabs ::v-deep(.q-tab--active.text-purple-7)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 50%;
  background: linear-gradient(180deg, #9c27b0 0%, #7b1fa2 100%);
  border-radius: 0 3px 3px 0;
}

/* 一级导航悬停效果 */
.settings-dialog-tabs ::v-deep(.q-tab:hover:not(.q-tab--active)) {
  background: rgba(120, 120, 120, 0.08);
}

/* 暗色模式适配 */
.body--dark .settings-dialog-tabs ::v-deep(.q-tab--active.text-red-7) {
  background: linear-gradient(135deg, rgba(239, 83, 80, 0.25) 0%, rgba(239, 83, 80, 0.1) 100%);
  box-shadow: 0 2px 8px rgba(239, 83, 80, 0.3);
}

.body--dark .settings-dialog-tabs ::v-deep(.q-tab--active.text-orange-8) {
  background: linear-gradient(135deg, rgba(255, 138, 80, 0.25) 0%, rgba(255, 138, 80, 0.1) 100%);
  box-shadow: 0 2px 8px rgba(255, 138, 80, 0.3);
}

.body--dark .settings-dialog-tabs ::v-deep(.q-tab--active.text-yellow-9) {
  background: linear-gradient(135deg, rgba(253, 216, 53, 0.25) 0%, rgba(253, 216, 53, 0.1) 100%);
  box-shadow: 0 2px 8px rgba(253, 216, 53, 0.3);
}

.body--dark .settings-dialog-tabs ::v-deep(.q-tab--active.text-green-7) {
  background: linear-gradient(135deg, rgba(102, 187, 106, 0.25) 0%, rgba(102, 187, 106, 0.1) 100%);
  box-shadow: 0 2px 8px rgba(102, 187, 106, 0.3);
}

.body--dark .settings-dialog-tabs ::v-deep(.q-tab--active.text-cyan-7) {
  background: linear-gradient(135deg, rgba(38, 166, 154, 0.25) 0%, rgba(38, 166, 154, 0.1) 100%);
  box-shadow: 0 2px 8px rgba(38, 166, 154, 0.3);
}

.body--dark .settings-dialog-tabs ::v-deep(.q-tab--active.text-blue-7) {
  background: linear-gradient(135deg, rgba(41, 182, 246, 0.25) 0%, rgba(41, 182, 246, 0.1) 100%);
  box-shadow: 0 2px 8px rgba(41, 182, 246, 0.3);
}

.body--dark .settings-dialog-tabs ::v-deep(.q-tab--active.text-purple-7) {
  background: linear-gradient(135deg, rgba(171, 71, 188, 0.25) 0%, rgba(171, 71, 188, 0.1) 100%);
  box-shadow: 0 2px 8px rgba(171, 71, 188, 0.3);
}
</style>
