<template>
  <header class="topbar" :class="[`header--skin-${skin}`]" :data-header-skin="skin">
    <div class="header-left-icons">
      <el-dropdown trigger="click" popper-class="workspace-mode-popper" @command="pickMode">
        <span
          class="header-icon-btn workspace-mode-btn"
          :title="`${currentMode.label} · ${t(currentMode.descriptionKey)}`"
        >
          <q-icon class="icon-custom mode-icon" :name="currentMode.icon" />
          <span class="workspace-mode-label">{{ currentMode.label }}</span>
          <q-icon class="workspace-mode-caret" name="keyboard_arrow_down" />
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
              <q-icon class="mode-option-icon" :name="option.icon" />
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
        <q-icon class="icon-custom" name="search" />
      </span>
    </div>

    <div class="header-spacer" />

    <div
      v-if="title && tags.length > 0"
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
      v-else-if="title"
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
          <q-icon
            class="icon-custom sync-icon"
            :name="busyKind === 'push' ? 'autorenew' : 'arrow_upward'"
          />
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
          <q-icon
            class="icon-custom sync-icon"
            :name="busyKind === 'pull' ? 'autorenew' : 'arrow_downward'"
          />
        </div>
      </div>

      <el-dropdown trigger="click" @command="onAccountCommand">
        <div class="header-avatar" :class="{ 'has-photo': false }">
          <q-icon name="person" />
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="!loggedIn" command="login">
              <q-icon name="person" />
              {{ t('login.title') }}
            </el-dropdown-item>
            <el-dropdown-item v-else command="logout">
              <q-icon name="logout" />
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
        <q-icon class="icon-custom layout-mirror" name="dashboard" />
      </span>

      <SkinDropdown compact />

      <span
        class="header-icon-btn ai-entry-btn"
        :class="{ 'is-doubao': aiProvider === AiAssistantProviderEnum.Doubao }"
        :title="t('aiHelper.title')"
        @click="emit('ai')"
      >
        <q-icon
          class="icon-custom"
          :name="aiProvider === AiAssistantProviderEnum.Doubao ? 'mic' : 'smart_toy'"
        />
        <span v-if="aiProvider === AiAssistantProviderEnum.Doubao" class="ai-entry-badge">{{ t('aiAssistantProviderDoubao') }}</span>
      </span>

      <span
        class="header-icon-btn"
        :title="t('microApps.open')"
        @click="emit('chat')"
      >
        <q-icon class="icon-custom" name="chat_bubble" />
      </span>

      <span
        class="header-icon-btn"
        :title="t('action.settings')"
        @click="emit('settings')"
      >
        <q-icon class="icon-custom" name="settings" />
      </span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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
  icon: string;
  descriptionKey: string;
}> = [
  { value: IndexModeEnum.Folder, label: 'Idx神引', icon: 'folder', descriptionKey: 'index.folderMode' },
  { value: IndexModeEnum.Tag, label: 'Core超脱', icon: 'local_offer', descriptionKey: 'index.tagMode' },
  { value: IndexModeEnum.Calendar, label: 'Arch终极', icon: 'date_range', descriptionKey: 'index.calendarMode' },
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
  padding: 0 12px;
  border-bottom: 1px solid var(--coolma-border, rgb(0 0 0 / 10%));
  background: var(--coolma-panel, #fff);
  color: var(--coolma-text, rgb(0 0 0 / 70%));
  -webkit-app-region: drag;
  user-select: none;
}

.header--skin-nezha {
  /* 皮肤下的图标前景色：SkinDropdown 里的 palette 图标是独立子组件，
     拿不到本组件 scoped 的 skin 选择器，只能靠这个变量继承下去 */
  --coolma-header-icon: #2c2c2c;
  background: #b5817d !important;
  border-bottom-color: rgb(0 0 0 / 10%);
  color: #2c2c2c;
}

.header--skin-infp {
  --coolma-header-icon: #2c2c2c;
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
.header--skin-nezha .header-avatar .q-icon,
.header--skin-infp .header-avatar .q-icon {
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

.header-avatar .q-icon {
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
