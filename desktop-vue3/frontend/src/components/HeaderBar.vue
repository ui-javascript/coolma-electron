<template>
  <header class="topbar" :class="[`header--skin-${skin}`]" :data-header-skin="skin">
    <div class="header-left-icons">
      <el-dropdown trigger="click" popper-class="workspace-mode-popper" @command="pickMode">
        <span
          class="header-icon-btn workspace-mode-btn"
          :title="`${currentMode.label} · ${t(currentMode.descriptionKey)}`"
        >
          <el-icon class="icon-custom mode-icon"><component :is="currentMode.icon" /></el-icon>
          <span class="workspace-mode-label">{{ currentMode.label }}</span>
          <el-icon class="workspace-mode-caret"><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="option in modeOptions"
              :key="option.value"
              :command="option.value"
              :disabled="!loggedIn && option.value !== 'folder'"
              :class="{ 'is-current-mode': option.value === mode }"
              :title="t(option.descriptionKey)"
            >
              <el-icon class="mode-option-icon"><component :is="option.icon" /></el-icon>
              <span class="mode-option-label">{{ option.label }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <span
        v-if="loggedIn"
        class="header-icon-btn"
        :title="t('search.title')"
        @click="emit('search')"
      >
        <el-icon class="icon-custom"><Search /></el-icon>
      </span>
    </div>

    <div class="header-spacer" />

    <div
      v-if="tags.length > 0"
      class="header-note-title"
      @click="emit('tags')"
    >
      <span class="save-dot" :class="{ show: dirty }" />
      <el-tooltip placement="bottom" effect="light" popper-class="header-tags-popper">
        <template #content>
          <div class="header-tags">
            <el-tag v-for="tag in tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
          </div>
        </template>
        <span class="header-note-title-text">{{ title }}</span>
      </el-tooltip>
    </div>
    <div
      v-else
      class="header-note-title"
      @click="emit('tags')"
    >
      <span class="save-dot" :class="{ show: dirty }" />
      <span class="header-note-title-text">{{ title }}</span>
    </div>

    <div class="header-spacer" />

    <div class="header-right-icons">
      <div v-if="loggedIn" class="header-sync-group">
        <div
          class="header-icon-btn sync-btn sync-btn--push"
          :class="{ 'has-pending': pendingTotal > 0, 'is-syncing': busyKind === 'push' }"
          :title="syncPushTooltip"
          @click="emit('push')"
        >
          <el-icon class="icon-custom sync-icon">
            <Loading v-if="busyKind === 'push'" />
            <Upload v-else />
          </el-icon>
          <span v-if="pendingTotal > 0" class="sync-badge">
            {{ pendingTotal > 99 ? '99+' : pendingTotal }}
          </span>
        </div>
        <div
          class="header-icon-btn sync-btn sync-btn--pull"
          :class="{ 'is-syncing': busyKind === 'pull' }"
          :title="syncPullTooltip"
          @click="emit('pull')"
        >
          <el-icon class="icon-custom sync-icon">
            <Loading v-if="busyKind === 'pull'" />
            <Download v-else />
          </el-icon>
        </div>
      </div>

      <el-dropdown trigger="click" @command="onAccountCommand">
        <div class="header-avatar" :class="{ 'has-photo': false }">
          <el-icon><UserFilled /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="!loggedIn" command="login">
              <el-icon><User /></el-icon>
              {{ t('login.title') }}
            </el-dropdown-item>
            <el-dropdown-item v-else command="logout">
              <el-icon><SwitchButton /></el-icon>
              {{ t('login.logout') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <span
        class="header-icon-btn"
        :class="{ 'is-active': paneLayoutMode !== 0 }"
        :title="paneLayoutTitle"
        @click="emit('layout')"
      >
        <el-icon class="icon-custom layout-mirror"><Operation /></el-icon>
      </span>

      <SkinDropdown compact />

      <span
        class="header-icon-btn ai-entry-btn"
        :class="{ 'is-doubao': aiProvider === AiAssistantProviderEnum.Doubao }"
        :title="t('aiHelper.title')"
        @click="emit('ai')"
      >
        <el-icon class="icon-custom">
          <Mic v-if="aiProvider === AiAssistantProviderEnum.Doubao" />
          <MagicStick v-else />
        </el-icon>
        <span v-if="aiProvider === AiAssistantProviderEnum.Doubao" class="ai-entry-badge">{{ t('aiAssistantProviderDoubao') }}</span>
      </span>

      <span
        class="header-icon-btn"
        :title="t('microApps.open')"
        @click="emit('chat')"
      >
        <el-icon class="icon-custom"><ChatDotRound /></el-icon>
      </span>

      <span
        class="header-icon-btn"
        :title="t('action.settings')"
        @click="emit('settings')"
      >
        <el-icon class="icon-custom"><Setting /></el-icon>
      </span>
    </div>
  </header>
</template>

<script setup lang="ts">
import {
  ArrowDown,
  Calendar,
  ChatDotRound,
  CollectionTag,
  Download,
  Folder,
  Loading,
  MagicStick,
  Mic,
  Operation,
  Search,
  Setting,
  SwitchButton,
  Upload,
  User,
  UserFilled,
} from '@element-plus/icons-vue';
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { AiAssistantProviderEnum, IndexModeEnum, type AiAssistantProvider, type IndexMode } from '@shared/enums/app';
import SkinDropdown from '@/components/SkinDropdown.vue';
import type { Skin } from '@/utils/skin';

/**
 * 顶栏（复刻 vue2 components/layout/Header.vue）：
 * 左：工作区模式下拉 + 搜索；中：当前笔记标题 + 保存点；
 * 右：同步、头像、视图、换肤、AI、聊天、设置。
 */
const props = defineProps<{
  mode: IndexMode;
  loggedIn: boolean;
  pendingTotal: number;
  busyKind: string;
  title: string;
  dirty: boolean;
  paneLayoutMode: number;
  paneLayoutTitle: string;
  skin: Skin;
  aiProvider: AiAssistantProvider;
  syncPushTooltip: string;
  syncPullTooltip: string;
  tags: string[];
}>();

const emit = defineEmits<{
  (event: 'mode', value: IndexMode): void;
  (event: 'search'): void;
  (event: 'tags'): void;
  (event: 'push'): void;
  (event: 'pull'): void;
  (event: 'account', value: 'login' | 'logout'): void;
  (event: 'layout'): void;
  (event: 'ai'): void;
  (event: 'chat'): void;
  (event: 'settings'): void;
}>();

const { t } = useI18n();

const modeOptions: Array<{
  value: IndexMode;
  label: string;
  icon: Component;
  descriptionKey: string;
}> = [
  { value: IndexModeEnum.Folder, label: 'Idx神引', icon: Folder, descriptionKey: 'index.folderMode' },
  { value: IndexModeEnum.Tag, label: 'Core超脱', icon: CollectionTag, descriptionKey: 'index.tagMode' },
  { value: IndexModeEnum.Calendar, label: 'Arch终极', icon: Calendar, descriptionKey: 'index.calendarMode' },
];

const currentMode = computed(() => {
  return modeOptions.find((option) => option.value === props.mode) ?? modeOptions[0];
});

function pickMode(value: IndexMode): void {
  if (!value) {
    return;
  }
  if (!props.loggedIn && value !== IndexModeEnum.Folder) {
    return;
  }
  emit('mode', value);
}

function onAccountCommand(command: string): void {
  if (command === 'login' || command === 'logout') {
    emit('account', command);
  }
}
</script>

<style scoped>
.topbar {
  display: flex;
  height: 6.5vh;
  min-height: 44px;
  flex: 0 0 6.5vh;
  align-items: center;
  padding: 0 6px;
  border-bottom: 1px solid var(--coolma-border, rgb(0 0 0 / 10%));
  background: var(--coolma-panel, #fff);
  color: var(--coolma-text, rgb(0 0 0 / 70%));
  -webkit-app-region: drag;
  user-select: none;
}

.header--skin-nezha {
  background: #b5817d !important;
  border-bottom-color: rgb(0 0 0 / 10%);
  color: #2c2c2c;
}

.header--skin-infp {
  background: #a3b5a6 !important;
  border-bottom-color: rgb(0 0 0 / 10%);
  color: #2c2c2c;
}

.header-left-icons,
.header-right-icons {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.header-spacer {
  min-width: 0;
  flex: 1 1 auto;
}

.header-note-title {
  display: flex;
  max-width: 46vw;
  align-items: center;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.header-note-title-text {
  overflow: hidden;
  margin-left: 7px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: var(--themeColor, #409eff);
  opacity: 0.7;
  visibility: hidden;
}

.save-dot.show {
  visibility: visible;
}

.header-icon-btn {
  position: relative;
  display: flex;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-app-region: no-drag;
}

.header-icon-btn:hover {
  background-color: var(--coolma-hover, rgb(0 0 0 / 4%));
}

.header-icon-btn .icon-custom {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  color: var(--coolma-muted, #6b737b);
  font-size: 18px;
  line-height: 1;
  transition: all 0.2s ease;
}

.header-icon-btn:hover .icon-custom {
  color: var(--themeColor, #409eff);
}

.header-icon-btn.is-active .icon-custom {
  color: var(--themeColor, #409eff);
}

.header-icon-btn.is-active::after {
  position: absolute;
  bottom: 1px;
  left: 50%;
  width: 18px;
  height: 2px;
  border-radius: 1px;
  background: var(--themeColor, #409eff);
  content: "";
  transform: translateX(-50%);
}

.header--skin-nezha .header-icon-btn .icon-custom,
.header--skin-nezha .header-note-title-text,
.header--skin-infp .header-icon-btn .icon-custom,
.header--skin-infp .header-note-title-text,
.header--skin-nezha .workspace-mode-label,
.header--skin-nezha .workspace-mode-caret,
.header--skin-nezha .workspace-mode-btn .mode-icon,
.header--skin-infp .workspace-mode-label,
.header--skin-infp .workspace-mode-caret,
.header--skin-infp .workspace-mode-btn .mode-icon,
.header--skin-nezha .header-avatar .el-icon,
.header--skin-infp .header-avatar .el-icon {
  color: #2c2c2c;
}

.workspace-mode-btn {
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--themeColor30, rgb(64 158 255 / 30%));
  background: var(--themeColor10, rgb(64 158 255 / 10%));
  box-shadow: 0 2px 8px var(--themeColor20, rgb(64 158 255 / 20%));
  color: var(--themeColor, #409eff);
  flex-shrink: 0;
  font-size: 13px;
  white-space: nowrap;
}

.workspace-mode-btn:hover {
  background-color: var(--coolma-hover, rgb(0 0 0 / 4%));
}

.workspace-mode-btn .mode-icon {
  width: 17px;
  height: 17px;
  margin: 0;
  color: var(--themeColor, #409eff);
  font-size: 17px;
  line-height: 1;
}

.workspace-mode-label {
  color: var(--themeColor, #409eff);
  font-weight: 500;
}

.workspace-mode-caret {
  color: var(--themeColor, #409eff);
  font-size: 12px;
  opacity: 0.65;
}

.header-sync-group {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.sync-btn.has-pending .sync-icon {
  color: var(--themeColor, #409eff);
}

.sync-btn.is-syncing .sync-icon {
  animation: header-spin 1s linear infinite;
}

@keyframes header-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.sync-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--themeColor, #409eff);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
}

.header-avatar {
  display: flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  margin: 0 4px;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(145deg, rgb(64 158 255 / 35%), var(--themeColor, #409eff));
  color: #fff;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: box-shadow 0.2s ease;
}

.header-avatar:hover {
  box-shadow: 0 0 0 1px rgb(64 158 255 / 40%);
  background: linear-gradient(145deg, rgb(64 158 255 / 35%), var(--themeColor, #409eff));
}

.header-avatar .el-icon {
  font-size: 11px;
  line-height: 1;
}

.ai-entry-btn {
  position: relative;
}

.ai-entry-badge {
  position: absolute;
  right: 1px;
  bottom: 1px;
  padding: 0 3px;
  border-radius: 3px;
  background: var(--themeColor, #409eff);
  color: #fff;
  font-size: 9px;
  line-height: 12px;
  transform: scale(0.85);
  transform-origin: right bottom;
}

.layout-mirror {
  transform: scaleX(-1);
}
</style>

<style>
.workspace-mode-popper .el-dropdown-menu__item {
  display: flex;
  min-width: 150px;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  font-size: 13px;
  line-height: 36px;
}

.workspace-mode-popper .mode-option-icon {
  margin: 0;
  color: var(--coolma-muted, #6b7280);
  font-size: 15px;
}

.workspace-mode-popper .mode-option-label {
  color: var(--coolma-text, #303133);
  font-size: 13px;
}

.workspace-mode-popper .el-dropdown-menu__item.is-current-mode .mode-option-icon,
.workspace-mode-popper .el-dropdown-menu__item.is-current-mode .mode-option-label {
  color: var(--themeColor, #409eff);
}

.workspace-mode-popper .el-dropdown-menu__item:not(.is-disabled):hover .mode-option-icon,
.workspace-mode-popper .el-dropdown-menu__item:not(.is-disabled):hover .mode-option-label {
  color: var(--themeColor, #409eff);
}
</style>
