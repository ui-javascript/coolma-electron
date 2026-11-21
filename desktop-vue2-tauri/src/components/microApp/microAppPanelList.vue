<template>
  <div class="micro-app-panel-list">
    <q-list dense class="micro-app-list">
      <q-item
        v-for="app in apps"
        :key="app.id"
        clickable
        v-ripple
        active-class="micro-app-list__item--active"
        :active="app.id === activeId"
        class="micro-app-list__item"
        @click="$emit('select', app)"
      >
        <q-item-section avatar class="micro-app-list__avatar">
          <i v-if="isElementIcon(app.icon)" :class="[app.icon, 'micro-app-list__icon']" />
          <q-icon v-else :name="app.icon || 'apps'" class="micro-app-list__icon" size="22px" />
        </q-item-section>
        <q-tooltip
          anchor="center right"
          self="center left"
          :offset="[6, 0]"
          content-class="micro-app-list__tooltip"
        >
          <div class="micro-app-list__tooltip-name">{{ app.name }}</div>
          <div v-if="app.isDefault" class="micro-app-list__tooltip-tag">{{ $t('microAppsDefault') }}</div>
        </q-tooltip>
      </q-item>
    </q-list>
  </div>
</template>

<script>
export default {
  name: 'microAppPanelList',
  props: {
    apps: {
      type: Array,
      required: true,
      default: () => []
    },
    activeId: {
      type: String,
      default: ''
    }
  },
  methods: {
    isElementIcon (icon) {
      return typeof icon === 'string' && icon.startsWith('el-icon-')
    }
  }
}
</script>

<style scoped>
.micro-app-panel-list {
  width: 56px;
  min-width: 56px;
  max-width: 56px;
  background-color: var(--floatBgColor, rgba(255, 255, 255, 0.4));
  border-right: 1px solid var(--floatBorderColor, #e8e8e8);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.micro-app-list {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.4) transparent;
}

.micro-app-list::-webkit-scrollbar {
  width: 4px;
}

.micro-app-list::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.micro-app-list::-webkit-scrollbar-track {
  background: transparent;
}

.micro-app-list__item {
  margin: 2px 4px;
  border-radius: 8px;
  min-height: 40px;
  min-width: 40px;
  padding: 0;
  justify-content: center;
  transition: all 0.18s ease;
}

.micro-app-list__item:hover {
  background-color: var(--themeColor10, rgba(64, 158, 255, 0.08));
}

.micro-app-list__item--active {
  background: linear-gradient(135deg, rgba(67, 160, 71, 0.18) 0%, rgba(67, 160, 71, 0.08) 100%);
  box-shadow: inset 3px 0 0 #43a047;
  color: #2e7d32;
}

.micro-app-list__avatar {
  justify-content: center;
  padding: 0;
  min-width: 0;
}

.micro-app-list__icon {
  font-size: 22px;
  color: var(--iconColor, #6b7280);
}

.micro-app-list__item--active .micro-app-list__icon {
  color: #2e7d32;
}

.micro-app-list__tooltip {
  font-size: 12px;
  padding: 6px 10px;
}

.micro-app-list__tooltip-name {
  font-weight: 500;
}

.micro-app-list__tooltip-tag {
  font-size: 11px;
  color: #43a047;
  margin-top: 2px;
}

.body--dark .micro-app-panel-list {
  background-color: rgba(40, 40, 40, 0.4);
}

.body--dark .micro-app-list__item--active {
  background: linear-gradient(135deg, rgba(102, 187, 106, 0.3) 0%, rgba(102, 187, 106, 0.12) 100%);
  color: #c8e6c9;
}
</style>
