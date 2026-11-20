<script setup lang="ts">
import { ref, computed } from 'vue';
import type { SkillCategory, Skill } from './skillsData';

interface Props {
  categories: SkillCategory[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'select', skill: Skill): void;
}>();

const activeCategory = ref<string>(props.categories[0]?.id || '');
const searchQuery = ref('');

const activeCategoryData = computed(() => {
  return props.categories.find(c => c.id === activeCategory.value);
});

const filteredSkills = computed(() => {
  const category = activeCategoryData.value;
  if (!category) return [];
  
  if (!searchQuery.value.trim()) {
    return category.skills;
  }
  
  const query = searchQuery.value.toLowerCase();
  return category.skills.filter(skill => 
    skill.label.toLowerCase().includes(query) ||
    skill.description.toLowerCase().includes(query)
  );
});

function selectSkill(skill: Skill) {
  emit('select', skill);
}
</script>

<template>
  <div class="skills-panel">
    <!-- Search -->
    <div class="search-box">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <input 
        v-model="searchQuery" 
        type="text" 
        class="search-input" 
        placeholder="搜索技能..."
      />
    </div>

    <!-- Categories Tabs -->
    <div class="category-tabs">
      <button
        v-for="category in categories"
        :key="category.id"
        class="category-tab"
        :class="{ active: activeCategory === category.id }"
        @click="activeCategory = category.id"
      >
        <div :class="category.icon" class="tab-icon"></div>
        <span class="tab-label">{{ category.label }}</span>
      </button>
    </div>

    <!-- Skills Grid -->
    <div class="skills-grid">
      <div
        v-for="skill in filteredSkills"
        :key="skill.id"
        class="skill-card"
        @click="selectSkill(skill)"
      >
        <div class="skill-header">
          <div v-if="skill.icon" :class="skill.icon" class="skill-icon"></div>
          <div class="skill-icon-default">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
            </svg>
          </div>
          <span class="skill-label">{{ skill.label }}</span>
        </div>
        <div class="skill-description">{{ skill.description }}</div>
      </div>

      <!-- Empty state -->
      <div v-if="filteredSkills.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <p>没有找到匹配的技能</p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.skills-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--s-color-bg-primary, #fff);
}

.search-box {
  position: relative;
  padding: 12px 16px;
  
  .search-icon {
    position: absolute;
    left: 28px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    color: var(--s-color-text-tertiary, rgba(0,0,0,0.4));
    pointer-events: none;
  }
  
  .search-input {
    width: 100%;
    height: 40px;
    padding: 0 16px 0 44px;
    border: 1px solid var(--s-color-border-tertiary, rgba(0,0,0,0.08));
    border-radius: 10px;
    background: var(--s-color-bg-secondary, #f9fafb);
    font-size: 14px;
    color: var(--s-color-text-primary, #000);
    outline: none;
    transition: all 0.2s ease;
    
    &::placeholder {
      color: var(--s-color-text-tertiary, rgba(0,0,0,0.4));
    }
    
    &:focus {
      border-color: var(--s-color-brand-primary-default, #0057ff);
      background: var(--s-color-bg-primary, #fff);
      box-shadow: 0 0 0 3px rgba(0, 87, 255, 0.1);
    }
  }
}

.category-tabs {
  display: flex;
  gap: 4px;
  padding: 0 16px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  
  &::-webkit-scrollbar {
    display: none;
  }
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 20px;
  background: transparent;
  color: var(--s-color-text-secondary, rgba(0,0,0,0.85));
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  
  .tab-icon {
    font-size: 16px;
    opacity: 0.7;
  }
  
  &:hover {
    background: var(--s-color-bg-secondary, #f3f4f6);
  }
  
  &.active {
    background: var(--s-color-brand-primary-default, #0057ff);
    color: white;
    
    .tab-icon {
      opacity: 1;
    }
  }
}

.skills-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  padding: 0 16px 16px;
  overflow-y: auto;
  scrollbar-width: thin;
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--s-color-border-secondary, rgba(0,0,0,0.15));
    border-radius: 2px;
  }
}

.skill-card {
  padding: 14px;
  border: 1px solid var(--s-color-border-tertiary, rgba(0,0,0,0.08));
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: var(--s-color-brand-primary-default, #0057ff);
    box-shadow: 0 4px 12px rgba(0, 87, 255, 0.1);
    transform: translateY(-2px);
  }
}

.skill-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.skill-icon {
  font-size: 18px;
  color: var(--s-color-brand-primary-default, #0057ff);
}

.skill-icon-default {
  width: 18px;
  height: 18px;
  color: var(--s-color-brand-primary-default, #0057ff);
  
  svg {
    width: 100%;
    height: 100%;
  }
}

.skill-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--s-color-text-primary, #000);
}

.skill-description {
  font-size: 12px;
  color: var(--s-color-text-tertiary, rgba(0,0,0,0.5));
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--s-color-text-tertiary, rgba(0,0,0,0.4));
  
  svg {
    width: 48px;
    height: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }
  
  p {
    font-size: 14px;
  }
}
</style>
