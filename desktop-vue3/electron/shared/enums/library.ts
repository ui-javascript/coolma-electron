import { Enum } from 'enum-plus';

/**
 * 符文/回响分类字典（对齐 vue2 RuneCategoryEnum / EchoCategoryEnum）。
 *
 * label = i18n key（模板里 t(item.label)，与 app.ts 同款用法）；
 * 顺序即分类 Tab 展示顺序（General / Marker 恒第一，其余在面板里按计数降序）。
 */
export const RuneCategoryEnum = Enum({
  General: { value: 'general', label: 'runeCategoryGeneral' },
  Education: { value: 'education', label: 'runeCategoryEducation' },
  Outfit: { value: 'outfit', label: 'runeCategoryOutfit' },
  Fitness: { value: 'fitness', label: 'runeCategoryFitness' },
  Music: { value: 'music', label: 'runeCategoryMusic' },
  Novel: { value: 'novel', label: 'runeCategoryNovel' },
  Movie: { value: 'movie', label: 'runeCategoryMovie' },
  Food: { value: 'food', label: 'runeCategoryFood' },
  Travel: { value: 'travel', label: 'runeCategoryTravel' },
  Research: { value: 'research', label: 'runeCategoryResearch' },
  Legal: { value: 'legal', label: 'runeCategoryLegal' },
  Government: { value: 'government', label: 'runeCategoryGovernment' },
  Entertainment: { value: 'entertainment', label: 'runeCategoryEntertainment' },
  Gaming: { value: 'gaming', label: 'runeCategoryGaming' },
  Consulting: { value: 'consulting', label: 'runeCategoryConsulting' },
  Community: { value: 'community', label: 'runeCategoryCommunity' },
  Social: { value: 'social', label: 'runeCategorySocial' },
  Medical: { value: 'medical', label: 'runeCategoryMedical' },
  Finance: { value: 'finance', label: 'runeCategoryFinance' },
  Insurance: { value: 'insurance', label: 'runeCategoryInsurance' },
  Manufacturing: { value: 'manufacturing', label: 'runeCategoryManufacturing' },
  Construction: { value: 'construction', label: 'runeCategoryConstruction' },
  RealEstate: { value: 'realEstate', label: 'runeCategoryRealEstate' },
  Lodging: { value: 'lodging', label: 'runeCategoryLodging' },
  Catering: { value: 'catering', label: 'runeCategoryCatering' },
  Business: { value: 'business', label: 'runeCategoryBusiness' },
  Transportation: { value: 'transportation', label: 'runeCategoryTransportation' },
  Warehousing: { value: 'warehousing', label: 'runeCategoryWarehousing' },
  Sales: { value: 'sales', label: 'runeCategorySales' },
  Trading: { value: 'trading', label: 'runeCategoryTrading' },
  Agriculture: { value: 'agriculture', label: 'runeCategoryAgriculture' },
  Energy: { value: 'energy', label: 'runeCategoryEnergy' },
  Environment: { value: 'environment', label: 'runeCategoryEnvironment' },
  Resume: { value: 'resume', label: 'runeCategoryResume' },
});

export const EchoCategoryEnum = Enum({
  Builtin: { value: 'builtin', label: 'echoCategoryBuiltin' },
  Showy: { value: 'showy', label: 'echoCategoryShowy' },
  Marker: { value: 'marker', label: 'echoCategoryMarker' },
  Typography: { value: 'typography', label: 'echoCategoryTypography' },
});

export type RuneCategory = (typeof RuneCategoryEnum)['values'][number];
export type EchoCategory = (typeof EchoCategoryEnum)['values'][number];

/** 非法/未知分类回退到默认值（对齐 vue2 resolveRuneCategory）。 */
export function resolveLibraryCategory(kind: 'rune' | 'echo', raw: unknown): string {
  const value = String(raw ?? '').trim();
  const known = kind === 'rune' ? RuneCategoryEnum.has(value) : EchoCategoryEnum.has(value);
  return known ? value : kind === 'rune' ? 'general' : 'marker';
}
