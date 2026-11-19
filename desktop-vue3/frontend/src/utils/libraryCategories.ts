/**
 * 符文/回响分类（对齐 vue2 RuneCategoryEnum / EchoCategoryEnum）。
 *
 * 与 vue2 的差异：vue2 的 label 是 i18n key 走 enum-plus 自动翻译；
 * vue3 这边把中英文案直接内联（键太多不值得进 i18n 文件），顺序即 Tab 展示顺序。
 * 列表里 General / Marker 恒排第一，其余按使用计数降序（在面板里排）。
 */
export interface LibraryCategory {
  value: string;
  zh: string;
  en: string;
}

export const RUNE_CATEGORIES: LibraryCategory[] = [
  { value: 'general', zh: '通用', en: 'General' },
  { value: 'education', zh: '教育', en: 'Education' },
  { value: 'outfit', zh: '穿搭', en: 'Outfit' },
  { value: 'fitness', zh: '健身', en: 'Fitness' },
  { value: 'music', zh: '音乐', en: 'Music' },
  { value: 'novel', zh: '小说', en: 'Novel' },
  { value: 'movie', zh: '电影', en: 'Movie' },
  { value: 'food', zh: '美食', en: 'Food' },
  { value: 'travel', zh: '旅游', en: 'Travel' },
  { value: 'research', zh: '科研', en: 'Research' },
  { value: 'legal', zh: '法律', en: 'Legal' },
  { value: 'government', zh: '政务', en: 'Government' },
  { value: 'entertainment', zh: '娱乐', en: 'Entertainment' },
  { value: 'gaming', zh: '游戏', en: 'Gaming' },
  { value: 'consulting', zh: '咨询', en: 'Consulting' },
  { value: 'community', zh: '社区', en: 'Community' },
  { value: 'social', zh: '社交', en: 'Social' },
  { value: 'medical', zh: '医疗', en: 'Medical' },
  { value: 'finance', zh: '金融', en: 'Finance' },
  { value: 'insurance', zh: '保险', en: 'Insurance' },
  { value: 'manufacturing', zh: '制造', en: 'Manufacturing' },
  { value: 'construction', zh: '建筑', en: 'Construction' },
  { value: 'realEstate', zh: '房地产', en: 'Real Estate' },
  { value: 'lodging', zh: '住宿', en: 'Lodging' },
  { value: 'catering', zh: '餐饮', en: 'Catering' },
  { value: 'business', zh: '商业', en: 'Business' },
  { value: 'transportation', zh: '交通', en: 'Transportation' },
  { value: 'warehousing', zh: '仓储', en: 'Warehousing' },
  { value: 'sales', zh: '销售', en: 'Sales' },
  { value: 'trading', zh: '贸易', en: 'Trading' },
  { value: 'agriculture', zh: '农林牧渔', en: 'Agriculture/Forestry/Fishery' },
  { value: 'energy', zh: '能源', en: 'Energy' },
  { value: 'environment', zh: '环保', en: 'Environment' },
  { value: 'resume', zh: '简历', en: 'Resume' },
];

export const ECHO_CATEGORIES: LibraryCategory[] = [
  { value: 'builtin', zh: '内置', en: 'Built-in' },
  { value: 'showy', zh: '特效', en: 'Showy' },
  { value: 'marker', zh: '标记', en: 'Marker' },
  { value: 'typography', zh: '排版', en: 'Typography' },
];

export function categoriesOf(kind: 'rune' | 'echo'): LibraryCategory[] {
  return kind === 'rune' ? RUNE_CATEGORIES : ECHO_CATEGORIES;
}

/** 非法/未知分类回退到默认值（对齐 vue2 resolveRuneCategory）。 */
export function resolveCategory(kind: 'rune' | 'echo', raw: unknown): string {
  const value = String(raw ?? '').trim();
  const known = categoriesOf(kind).some((item) => item.value === value);
  if (known) {
    return value;
  }
  return kind === 'rune' ? 'general' : 'marker';
}
