/**
 * 符文 / 回响分类枚举
 *
 * 数据源；业务方直接 import RuneCategoryEnum / EchoCategoryEnum 使用。
 *
 *   - label 字段 = i18n key
 *   - RuneCategoryEnum.label(value) 会经过 Enum.localize（= i18n.t）自动翻译，
 *     直接返回当前 locale 文案，调用方不要再套一层 $t()
 *   - DEFAULT_RUNE_CATEGORY = RuneCategoryEnum.General
 *   - DEFAULT_ECHO_CATEGORY  = EchoCategoryEnum.Marker
 *
 * 列表顺序即垂直 tab 展示顺序。
 */

import { Enum } from 'enum-plus'

export const RuneCategoryEnum = Enum({
  General:        { value: 'general',        label: 'runeCategoryGeneral' },
  Education:      { value: 'education',      label: 'runeCategoryEducation' },
  Outfit:         { value: 'outfit',         label: 'runeCategoryOutfit' },
  Fitness:        { value: 'fitness',        label: 'runeCategoryFitness' },
  Music:          { value: 'music',          label: 'runeCategoryMusic' },
  Novel:          { value: 'novel',          label: 'runeCategoryNovel' },
  Movie:          { value: 'movie',          label: 'runeCategoryMovie' },
  Food:           { value: 'food',           label: 'runeCategoryFood' },
  Travel:         { value: 'travel',         label: 'runeCategoryTravel' },
  Research:       { value: 'research',       label: 'runeCategoryResearch' },
  Legal:          { value: 'legal',          label: 'runeCategoryLegal' },
  Government:     { value: 'government',     label: 'runeCategoryGovernment' },
  Entertainment:  { value: 'entertainment',  label: 'runeCategoryEntertainment' },
  Gaming:         { value: 'gaming',         label: 'runeCategoryGaming' },
  Consulting:     { value: 'consulting',     label: 'runeCategoryConsulting' },
  Community:      { value: 'community',      label: 'runeCategoryCommunity' },
  Social:         { value: 'social',         label: 'runeCategorySocial' },
  Medical:        { value: 'medical',        label: 'runeCategoryMedical' },
  Finance:        { value: 'finance',        label: 'runeCategoryFinance' },
  Insurance:      { value: 'insurance',      label: 'runeCategoryInsurance' },
  Manufacturing:  { value: 'manufacturing',  label: 'runeCategoryManufacturing' },
  Construction:   { value: 'construction',   label: 'runeCategoryConstruction' },
  RealEstate:     { value: 'realEstate',     label: 'runeCategoryRealEstate' },
  Lodging:        { value: 'lodging',        label: 'runeCategoryLodging' },
  Catering:       { value: 'catering',       label: 'runeCategoryCatering' },
  Business:       { value: 'business',       label: 'runeCategoryBusiness' },
  Transportation: { value: 'transportation', label: 'runeCategoryTransportation' },
  Warehousing:    { value: 'warehousing',    label: 'runeCategoryWarehousing' },
  Sales:          { value: 'sales',          label: 'runeCategorySales' },
  Trading:        { value: 'trading',        label: 'runeCategoryTrading' },
  Agriculture:    { value: 'agriculture',    label: 'runeCategoryAgriculture' },
  Energy:         { value: 'energy',         label: 'runeCategoryEnergy' },
  Environment:    { value: 'environment',    label: 'runeCategoryEnvironment' },
  Resume:         { value: 'resume',         label: 'runeCategoryResume' }
})

export const EchoCategoryEnum = Enum({
  Builtin:    { value: 'builtin',    label: 'echoCategoryBuiltin' },
  Showy:      { value: 'showy',      label: 'echoCategoryShowy' },
  Marker:     { value: 'marker',     label: 'echoCategoryMarker' },
  Typography: { value: 'typography', label: 'echoCategoryTypography' }
})

export const DEFAULT_RUNE_CATEGORY = RuneCategoryEnum.General
export const DEFAULT_ECHO_CATEGORY = EchoCategoryEnum.Marker
