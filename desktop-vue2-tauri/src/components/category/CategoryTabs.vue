<template>
  <div class='category-tabs-wrapper'>
    <q-tabs
      v-model='currentTab'
      vertical
      dense
      :class='["category-tabs", `category-tabs--${colorTheme}`]'
      @input='onTabChange'
    >
      <q-tab
        v-for='tab in tabs'
        :key='tab.value'
        :name='tab.value'
        no-caps
        class='category-tab'
        :disable='tab.disable'
      >
        <q-icon
          v-if='tab.icon'
          :name='tab.icon'
          size='1rem'
          class='category-tab-icon'
        />
        <span class='category-tab-label'>{{ tab.label }}</span>
        <q-badge
          v-if='tab.count !== undefined && tab.count > 0'
          :color='badgeColor'
          align='middle'
          class='category-tab-badge'
        >
          {{ tab.count }}
        </q-badge>
      </q-tab>
    </q-tabs>
  </div>
</template>

<script>
export default {
  name: 'CategoryTabs',
  props: {
    value: {
      type: String,
      required: true
    },
    tabs: {
      type: Array,
      required: true,
      default: () => []
    },
    colorTheme: {
      type: String,
      default: 'purple',
      validator: v => ['purple', 'cyan', 'blue', 'primary', 'secondary', 'accent', 'positive', 'negative', 'info', 'warning', 'red', 'orange'].includes(v)
    }
  },
  data () {
    return {
      currentTab: this.value
    }
  },
  computed: {
    badgeColor () {
      const map = {
        purple: 'purple-7',
        cyan: 'cyan-7',
        blue: 'blue-7',
        primary: 'primary',
        secondary: 'secondary',
        accent: 'accent',
        positive: 'positive',
        negative: 'negative',
        info: 'info',
        warning: 'warning',
        red: 'red-7',
        orange: 'orange-8'
      }
      return map[this.colorTheme] || 'primary'
    }
  },
  watch: {
    value (val) {
      if (val !== this.currentTab) {
        this.currentTab = val
      }
    }
  },
  methods: {
    onTabChange (val) {
      this.$emit('input', val)
      this.$emit('change', val)
    }
  }
}
</script>

<style scoped>
.category-tabs-wrapper {
  flex: 0 0 auto;
  width: 6.25rem;
  min-width: 6.25rem;
  max-width: 6.25rem;
  padding: 2px 0 4px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.category-tabs-wrapper::-webkit-scrollbar {
  width: 4px;
}

.category-tabs-wrapper::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.3);
  border-radius: 2px;
}

.category-tabs {
  width: 100%;
}

.category-tabs ::v-deep(.q-tabs__content) {
  padding: 0;
  justify-content: flex-start !important;
}

.category-tabs ::v-deep(.q-tabs__content .q-tab__content) {
  min-height: 30px;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  text-align: left !important;
  padding-left: 2px;
}

.category-tab {
  width: 100%;
  justify-content: flex-start !important;
  border-radius: 8px;
  margin: 2px 4px;
  padding: 4px 6px;
  min-height: 30px;
  transition: all 0.2s ease;
  position: relative;
  text-align: left !important;
}

.category-tab ::v-deep(.q-tab__content) {
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  text-align: left !important;
}

.category-tab ::v-deep(.q-tab__icon) {
  margin-right: 4px;
  min-width: 16px;
  text-align: left;
}

.category-tab ::v-deep(.q-tab__label) {
  text-align: left !important;
}

.category-tab-label {
  text-align: left;
  white-space: nowrap;
}

.category-tab-badge {
  font-size: 0.6rem;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

/* ====================== 紫色主题 (符文) ====================== */
.category-tabs--purple ::v-deep(.q-tab) {
  background: transparent;
  color: #9e27b0;
}

.category-tabs--purple ::v-deep(.q-tab:hover:not(.q-tab--active):not(.q-tab--disable)) {
  background: rgba(156, 39, 176, 0.08);
}

.category-tabs--purple ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(156, 39, 176, 0.18) 0%, rgba(156, 39, 176, 0.08) 100%);
  color: #7b1fa2;
  box-shadow: 0 2px 8px rgba(156, 39, 176, 0.25);
}

.category-tabs--purple ::v-deep(.q-tab--active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #9c27b0 0%, #7b1fa2 100%);
  border-radius: 0 3px 3px 0;
}

/* ====================== 青色主题 (回响) ====================== */
.category-tabs--cyan ::v-deep(.q-tab) {
  background: transparent;
  color: #00acc1;
}

.category-tabs--cyan ::v-deep(.q-tab:hover:not(.q-tab--active):not(.q-tab--disable)) {
  background: rgba(0, 172, 193, 0.08);
}

.category-tabs--cyan ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(0, 172, 193, 0.18) 0%, rgba(0, 172, 193, 0.08) 100%);
  color: #00838f;
  box-shadow: 0 2px 8px rgba(0, 172, 193, 0.25);
}

.category-tabs--cyan ::v-deep(.q-tab--active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #00acc1 0%, #00838f 100%);
  border-radius: 0 3px 3px 0;
}

/* ====================== 蓝色主题 (回响) ====================== */
.category-tabs--blue ::v-deep(.q-tab) {
  background: transparent;
  color: #0288d1;
}

.category-tabs--blue ::v-deep(.q-tab:hover:not(.q-tab--active):not(.q-tab--disable)) {
  background: rgba(2, 136, 209, 0.08);
}

.category-tabs--blue ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(2, 136, 209, 0.18) 0%, rgba(2, 136, 209, 0.08) 100%);
  color: #0277bd;
  box-shadow: 0 2px 8px rgba(2, 136, 209, 0.25);
}

.category-tabs--blue ::v-deep(.q-tab--active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #0288d1 0%, #0277bd 100%);
  border-radius: 0 3px 3px 0;
}

/* ====================== 通用主色主题 ====================== */
.category-tabs--primary ::v-deep(.q-tab) {
  background: transparent;
  color: var(--q-color-primary, #1976d2);
}

.category-tabs--primary ::v-deep(.q-tab:hover:not(.q-tab--active):not(.q-tab--disable)) {
  background: rgba(25, 118, 210, 0.08);
}

.category-tabs--primary ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(25, 118, 210, 0.18) 0%, rgba(25, 118, 210, 0.08) 100%);
  color: #1565c0;
  box-shadow: 0 2px 8px rgba(25, 118, 210, 0.25);
}

.category-tabs--primary ::v-deep(.q-tab--active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #1976d2 0%, #1565c0 100%);
  border-radius: 0 3px 3px 0;
}

/* ====================== 绿色主题 (服务器/云服务) ====================== */
.category-tabs--positive ::v-deep(.q-tab) {
  background: transparent;
  color: #43a047;
}

.category-tabs--positive ::v-deep(.q-tab:hover:not(.q-tab--active):not(.q-tab--disable)) {
  background: rgba(67, 160, 71, 0.08);
}

.category-tabs--positive ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(67, 160, 71, 0.18) 0%, rgba(67, 160, 71, 0.08) 100%);
  color: #2e7d32;
  box-shadow: 0 2px 8px rgba(67, 160, 71, 0.25);
}

.category-tabs--positive ::v-deep(.q-tab--active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #43a047 0%, #2e7d32 100%);
  border-radius: 0 3px 3px 0;
}

/* ====================== 蓝色主题 (云函数) ====================== */
.category-tabs--info ::v-deep(.q-tab) {
  background: transparent;
  color: #0288d1;
}

.category-tabs--info ::v-deep(.q-tab:hover:not(.q-tab--active):not(.q-tab--disable)) {
  background: rgba(2, 136, 209, 0.08);
}

.category-tabs--info ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(2, 136, 209, 0.18) 0%, rgba(2, 136, 209, 0.08) 100%);
  color: #0277bd;
  box-shadow: 0 2px 8px rgba(2, 136, 209, 0.25);
}

.category-tabs--info ::v-deep(.q-tab--active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #0288d1 0%, #0277bd 100%);
  border-radius: 0 3px 3px 0;
}

/* ====================== 黄色主题 (AI) ====================== */
.category-tabs--warning ::v-deep(.q-tab) {
  background: transparent;
  color: #f9a825;
}

.category-tabs--warning ::v-deep(.q-tab:hover:not(.q-tab--active):not(.q-tab--disable)) {
  background: rgba(249, 168, 37, 0.08);
}

.category-tabs--warning ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(249, 168, 37, 0.18) 0%, rgba(249, 168, 37, 0.08) 100%);
  color: #f57f17;
  box-shadow: 0 2px 8px rgba(249, 168, 37, 0.25);
}

.category-tabs--warning ::v-deep(.q-tab--active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #f9a825 0%, #f57f17 100%);
  border-radius: 0 3px 3px 0;
}

/* ====================== 红色主题 (通用) ====================== */
.category-tabs--red ::v-deep(.q-tab) {
  background: transparent;
  color: #e53935;
}

.category-tabs--red ::v-deep(.q-tab:hover:not(.q-tab--active):not(.q-tab--disable)) {
  background: rgba(229, 57, 53, 0.08);
}

.category-tabs--red ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(229, 57, 53, 0.18) 0%, rgba(229, 57, 53, 0.08) 100%);
  color: #c62828;
  box-shadow: 0 2px 8px rgba(229, 57, 53, 0.25);
}

.category-tabs--red ::v-deep(.q-tab--active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #e53935 0%, #c62828 100%);
  border-radius: 0 3px 3px 0;
}

/* ====================== 橙色主题 (编辑器) ====================== */
.category-tabs--orange ::v-deep(.q-tab) {
  background: transparent;
  color: #ef6c00;
}

.category-tabs--orange ::v-deep(.q-tab:hover:not(.q-tab--active):not(.q-tab--disable)) {
  background: rgba(239, 108, 0, 0.08);
}

.category-tabs--orange ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(239, 108, 0, 0.18) 0%, rgba(239, 108, 0, 0.08) 100%);
  color: #e65100;
  box-shadow: 0 2px 8px rgba(239, 108, 0, 0.25);
}

.category-tabs--orange ::v-deep(.q-tab--active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #ef6c00 0%, #e65100 100%);
  border-radius: 0 3px 3px 0;
}

/* ====================== 暗色模式适配 ====================== */
.body--dark .category-tabs--purple ::v-deep(.q-tab) {
  color: #ce93d8;
}

.body--dark .category-tabs--purple ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(171, 71, 188, 0.3) 0%, rgba(171, 71, 188, 0.15) 100%);
  color: #e1bee7;
  box-shadow: 0 2px 8px rgba(171, 71, 188, 0.35);
}

.body--dark .category-tabs--purple ::v-deep(.q-tab--active) .category-tab-label {
  color: #e1bee7;
}

.body--dark .category-tabs--cyan ::v-deep(.q-tab) {
  color: #4dd0e1;
}

.body--dark .category-tabs--cyan ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(38, 166, 154, 0.3) 0%, rgba(38, 166, 154, 0.15) 100%);
  color: #80cbc4;
  box-shadow: 0 2px 8px rgba(38, 166, 154, 0.35);
}

.body--dark .category-tabs--cyan ::v-deep(.q-tab--active) .category-tab-label {
  color: #80cbc4;
}

.body--dark .category-tabs--blue ::v-deep(.q-tab) {
  color: #81d4fa;
}

.body--dark .category-tabs--blue ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(41, 182, 246, 0.3) 0%, rgba(41, 182, 246, 0.15) 100%);
  color: #b3e5fc;
  box-shadow: 0 2px 8px rgba(41, 182, 246, 0.35);
}

.body--dark .category-tabs--blue ::v-deep(.q-tab--active) .category-tab-label {
  color: #b3e5fc;
}

.body--dark .category-tabs--primary ::v-deep(.q-tab) {
  color: #90caf9;
}

.body--dark .category-tabs--primary ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(41, 121, 255, 0.3) 0%, rgba(41, 121, 255, 0.15) 100%);
  color: #bbdefb;
  box-shadow: 0 2px 8px rgba(41, 121, 255, 0.35);
}

.body--dark .category-tabs--primary ::v-deep(.q-tab--active) .category-tab-label {
  color: #bbdefb;
}

.body--dark .category-tabs--positive ::v-deep(.q-tab) {
  color: #a5d6a7;
}

.body--dark .category-tabs--positive ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(102, 187, 106, 0.3) 0%, rgba(102, 187, 106, 0.15) 100%);
  color: #c8e6c9;
  box-shadow: 0 2px 8px rgba(102, 187, 106, 0.35);
}

.body--dark .category-tabs--positive ::v-deep(.q-tab--active) .category-tab-label {
  color: #c8e6c9;
}

.body--dark .category-tabs--info ::v-deep(.q-tab) {
  color: #81d4fa;
}

.body--dark .category-tabs--info ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(41, 182, 246, 0.3) 0%, rgba(41, 182, 246, 0.15) 100%);
  color: #b3e5fc;
  box-shadow: 0 2px 8px rgba(41, 182, 246, 0.35);
}

.body--dark .category-tabs--info ::v-deep(.q-tab--active) .category-tab-label {
  color: #b3e5fc;
}

.body--dark .category-tabs--warning ::v-deep(.q-tab) {
  color: #ffee58;
}

.body--dark .category-tabs--warning ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(253, 216, 53, 0.3) 0%, rgba(253, 216, 53, 0.15) 100%);
  color: #fff9c4;
  box-shadow: 0 2px 8px rgba(253, 216, 53, 0.35);
}

.body--dark .category-tabs--warning ::v-deep(.q-tab--active) .category-tab-label {
  color: #fff9c4;
}

/* 暗色模式 - 红色主题 (通用) */
.body--dark .category-tabs--red ::v-deep(.q-tab) {
  color: #ef9a9a;
}

.body--dark .category-tabs--red ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(239, 83, 80, 0.3) 0%, rgba(239, 83, 80, 0.15) 100%);
  color: #ffcdd2;
  box-shadow: 0 2px 8px rgba(239, 83, 80, 0.35);
}

.body--dark .category-tabs--red ::v-deep(.q-tab--active) .category-tab-label {
  color: #ffcdd2;
}

/* 暗色模式 - 橙色主题 (编辑器) */
.body--dark .category-tabs--orange ::v-deep(.q-tab) {
  color: #ffab91;
}

.body--dark .category-tabs--orange ::v-deep(.q-tab--active) {
  background: linear-gradient(135deg, rgba(255, 138, 80, 0.3) 0%, rgba(255, 138, 80, 0.15) 100%);
  color: #ffe0b2;
  box-shadow: 0 2px 8px rgba(255, 138, 80, 0.35);
}

.body--dark .category-tabs--orange ::v-deep(.q-tab--active) .category-tab-label {
  color: #ffe0b2;
}

/* ====================== 响应式布局 ====================== */
@media (max-width: 760px) {
  .category-tabs-wrapper {
    width: 100%;
    min-width: 0;
    max-width: none;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .category-tabs ::v-deep(.q-tabs__content) {
    flex-direction: row;
  }

  .category-tab {
    width: auto;
    min-width: 60px;
    margin: 2px;
  }

  .category-tab::before {
    display: none;
  }
}
</style>
