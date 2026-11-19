<template>
  <div class="skin-picker">
    <div class="skin-list">
      <button
        v-for="item in SKIN_LIST"
        :key="item"
        class="skin-item"
        :class="{ active: appStore.skin === item }"
        type="button"
        @click="pick(item)"
      >
        <span class="skin-swatch" :style="{ background: swatch(item) }" />
        <span class="skin-name">{{ t(`settings.skin.${item}`) }}</span>
        <span class="skin-desc">{{ t(`settings.skin.${item}Desc`) }}</span>
        <el-icon v-if="appStore.skin === item" class="skin-check"><Select /></el-icon>
      </button>
    </div>
    <p class="skin-hint">{{ t('settings.skinHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Select } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';
import { SKIN_COLORS, SKIN_LIST, type Skin } from '@/utils/skin';
import { skinEffectBus } from '@/services/skinEffectBus';

/**
 * 皮肤选择卡（复刻 vue2 HeaderRightGroup 的换肤菜单 + skinMixin）。
 * 换肤 = 换主题色 CSS 变量 + 播一次特效 + 提示。
 */
const { t } = useI18n();
const appStore = useAppStore();

function swatch(skin: Skin): string {
  return SKIN_COLORS[skin]?.main ?? 'linear-gradient(135deg,#409eff,#ffffff)';
}

function pick(skin: Skin): void {
  if (appStore.skin === skin) {
    ElMessage({ message: t('settings.skinSwitched', { name: t(`settings.skin.${skin}`) }), type: 'info' });
    return;
  }
  appStore.setSkin(skin);
  skinEffectBus.emit(skin);
  // 提示配色贴 vue2 的 SKIN_NOTIFY_COLORS（Element Plus 不让内联改色，走 class）
  ElMessage({
    message: t('settings.skinSwitched', { name: t(`settings.skin.${skin}`) }),
    type: 'success',
    customClass: `skin-notify skin-notify-${skin}`,
  });
}
</script>

<style>
/* 换肤提示的配色（对齐 vue2 SKIN_NOTIFY_COLORS） */
.skin-notify.skin-notify-baiyang {
  background: rgba(64, 158, 255, 0.9) !important;
  border-color: rgba(64, 158, 255, 0.9) !important;
}
.skin-notify.skin-notify-nezha {
  background: rgba(181, 129, 125, 0.95) !important;
  border-color: rgba(181, 129, 125, 0.95) !important;
}
.skin-notify.skin-notify-infp {
  background: rgba(33, 181, 111, 0.9) !important;
  border-color: rgba(33, 181, 111, 0.9) !important;
}

<style scoped>
.skin-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.skin-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 132px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  cursor: pointer;
  position: relative;
  transition: border-color 0.15s ease;
}

.skin-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.skin-item.active {
  border-color: var(--el-color-primary);
}

.skin-swatch {
  width: 100%;
  height: 14px;
  border-radius: 4px;
}

.skin-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.skin-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.skin-check {
  position: absolute;
  right: 8px;
  top: 8px;
  color: var(--el-color-primary);
}

.skin-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
