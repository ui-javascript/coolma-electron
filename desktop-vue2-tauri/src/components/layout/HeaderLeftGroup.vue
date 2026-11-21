<template>
  <div class="header-left-icons">
    <!-- 工作区模式下拉框：文件夹 / Tag / 日历 -->
    <el-dropdown
      trigger="click"
      @command="handleModeChange"
      popper-class="workspace-mode-popper"
    >
      <span
        class="header-icon-btn q-electron-drag--exception workspace-mode-btn"
        :title="currentModeTitle"
      >
        <i :class="currentMode.icon" class="icon-custom mode-icon" />
        <span class="workspace-mode-label">{{ currentMode.label }}</span>
        <i class="el-icon-arrow-down workspace-mode-caret" />
      </span>
      <el-dropdown-menu slot="dropdown">
        <el-dropdown-item
          v-for="opt in modeOptions"
          :key="opt.value"
          :command="opt.value"
          :disabled="!isLogin && opt.value !== 'category'"
          :class="{ 'is-current-mode': opt.value === sidebarTreeType }"
          :title="$t(opt.descriptionKey)"
        >
          <i :class="opt.icon" class="mode-option-icon" />
          <span class="mode-option-label">{{ opt.label }}</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </el-dropdown>

    <!-- 搜索图标 -->
    <div
      v-if="isLogin"
      class="header-icon-btn q-electron-drag--exception"
      :class="{ 'is-highlight': searchHighlight }"
      :title="$t('search')"
      @click="handleSearchClick"
    >
      <i class="el-icon-search icon-custom" />
    </div>
  </div>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'

const {
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

const {
  mapState: mapClientState,
  mapActions: mapClientActions
} = createNamespacedHelpers('client')

export default {
  name: 'HeaderLeftGroup',
  props: {
    noteListVisible: Boolean,
    paneLayoutMode: Number,
    searchHighlight: Boolean
  },
  data () {
    return {
      // 三种工作区模式：文件夹（默认）/ Tag / 日历
      modeOptions: [
        { label: 'Idx神引', value: 'category', icon: 'el-icon-folder', descriptionKey: 'noteModeFolderDesc' },
        { label: 'Core超脱', value: 'tag', icon: 'el-icon-price-tag', descriptionKey: 'noteModeTagDesc' },
        { label: 'Arch终极', value: 'calendar', icon: 'el-icon-date', descriptionKey: 'noteModeCalendarDesc' }
      ]
    }
  },
  computed: {
    ...mapServerState(['isLogin']),
    ...mapClientState(['sidebarTreeType']),
    currentMode () {
      return this.modeOptions.find(opt => opt.value === this.sidebarTreeType) || this.modeOptions[0]
    },
    currentModeTitle () {
      return `${this.currentMode.label} · ${this.$t(this.currentMode.descriptionKey)}`
    }
  },
  methods: {
    ...mapServerActions(['getCategoryNotes', 'refreshTagNotesCount']),
    ...mapClientActions(['toggleChanged', 'expandFullPaneLayout']),
    handleModeChange (value) {
      if (!value) return
      // 未登录时仅支持本地文件夹模式
      if (!this.isLogin && value !== 'category') return

      if (value === 'calendar') {
        const now = new Date()
        const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        this.toggleChanged({ key: 'calendarSelectedDate', value: ymd })
      }

      this.toggleChanged({ key: 'sidebarTreeType', value })

      if (!this.noteListVisible || this.paneLayoutMode !== 0) {
        this.expandFullPaneLayout()
      }

      this.getCategoryNotes()

      if (value === 'tag') {
        this.refreshTagNotesCount()
      }
    },
    handleSearchClick () {
      this.$emit('search-click')
    }
  }
}
</script>

<style scoped>
.header-left-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 基础按钮样式 - 与 HeaderRightGroup 保持一致 */
.header-icon-btn {
  height: 36px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.header-icon-btn:hover {
  background-color: var(--floatHoverColor);
}

.header-icon-btn .icon-custom {
  font-size: 18px;
  color: var(--iconColor, #6b7280);
  transition: all 0.2s ease;
}

.header-icon-btn:hover .icon-custom {
  color: var(--themeColor);
}

.header-icon-btn.is-highlight {
  background-color: var(--themeColor10);
  animation: highlight-pulse 5s ease-out forwards;
}

.header-icon-btn.is-highlight::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 2px;
  background-color: var(--themeColor);
  border-radius: 1px;
  animation: highlight-pulse 5s ease-out forwards;
}

@keyframes highlight-pulse {
  0% { opacity: 1; }
  90% { opacity: 1; }
  100% { opacity: 0; }
}

/* 模式切换下拉框（触发按钮） */
.workspace-mode-btn {
  gap: 6px;
  padding: 0 10px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--themeColor);
  background-color: var(--themeColor10);
  border: 1px solid var(--themeColor30);
  box-shadow: 0 2px 8px var(--themeColor20);
  flex-shrink: 0;
}

.workspace-mode-btn:hover {
  background-color: var(--floatHoverColor);
}

.workspace-mode-btn .icon-custom {
  margin: 0;
  font-size: 17px;
  color: var(--themeColor);
}

.workspace-mode-label {
  font-weight: 500;
  color: var(--themeColor);
}

.workspace-mode-caret {
  font-size: 12px;
  color: var(--themeColor);
  opacity: 0.65;
}
</style>

<!-- 下拉菜单挂载在 body 上，需要非 scoped 样式 -->
<style>
.workspace-mode-popper .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 150px;
  padding: 0 14px;
  line-height: 36px;
}

.workspace-mode-popper .mode-option-icon {
  margin-right: 0;
  font-size: 15px;
  color: var(--iconColor, #6b7280);
}

.workspace-mode-popper .mode-option-label {
  font-size: 13px;
  color: var(--editorColor, #303133);
}

.workspace-mode-popper .el-dropdown-menu__item.is-current-mode .mode-option-icon,
.workspace-mode-popper .el-dropdown-menu__item.is-current-mode .mode-option-label {
  color: var(--themeColor);
}

.workspace-mode-popper .el-dropdown-menu__item:not(.is-disabled):focus .mode-option-icon,
.workspace-mode-popper .el-dropdown-menu__item:not(.is-disabled):hover .mode-option-icon,
.workspace-mode-popper .el-dropdown-menu__item:not(.is-disabled):focus .mode-option-label,
.workspace-mode-popper .el-dropdown-menu__item:not(.is-disabled):hover .mode-option-label {
  color: var(--themeColor);
}

.workspace-mode-popper .el-dropdown-menu__item.is-disabled .mode-option-icon,
.workspace-mode-popper .el-dropdown-menu__item.is-disabled .mode-option-label {
  color: var(--textSecondaryColor, #c0c4cc);
}
</style>
