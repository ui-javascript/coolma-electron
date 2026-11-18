/**
 * 渲染端 rune 预设模板服务（业务封装层）。
 *
 * 职责：
 *   - 暴露 listFlat / listGroupedByCategory / save / remove / fetchFromGithub / clearCache
 *   - 内部 60s 内存缓存（任何写入操作自动 invalidate）
 *   - 通过 DatabaseClient.runeTemplates 与主进程 IPC 通信
 *
 * 注意：
 *   - 本文件位于 src/services/，由渲染端引用。
 *   - 主进程同名 service (src-electron/main-process/service/rune-template-service.js) 负责
 *     schema + CRUD，本文件只做"业务外壳"。
 */

import DatabaseClient from 'src/utils/DatabaseClient'

const CACHE_TTL_MS = 60 * 1000

// 符文分类白名单。批量导入 / 干跑都按此集合校验 category，非法值 fallback 到 'general'。
// 与 src/utils/enum/runeEchoCategoriesEnum.js → RuneCategoryEnum.items 的 value 字段保持同步。
const VALID_CATEGORY_KEYS = new Set([
  'general', 'education', 'outfit', 'fitness', 'music', 'novel',
  'movie', 'food', 'travel', 'research', 'legal', 'government',
  'entertainment', 'gaming', 'consulting', 'community', 'social',
  'medical', 'finance', 'insurance', 'manufacturing', 'construction',
  'realEstate', 'lodging', 'catering', 'business', 'transportation',
  'warehousing', 'sales', 'trading', 'agriculture', 'energy',
  'environment', 'resume'
])

function isValidCategory (raw) {
  return typeof raw === 'string' && VALID_CATEGORY_KEYS.has(String(raw).trim())
}

let cache = null
// cache: { list: [...], grouped: [...], cachedAt: number }

function isFresh () {
  return !!(cache && cache.list && (Date.now() - (cache.cachedAt || 0)) < CACHE_TTL_MS)
}

function invalidate () {
  cache = null
}

// 并发去重的 lazy seed 锁：避免多个并发调用 list* 时重复触发 seed。
let seedingPromise = null

async function ensureLoaded (force = false) {
  if (force) invalidate()
  if (isFresh()) {
    console.log(`[RUNE-TPL] ensureLoaded cache-hit list=${cache.list.length}`)
    return cache
  }
  // 注意：先把第一次读到的内容 cache 起来（即使为空数组），便于后续判断。
  let list
  try {
    list = await DatabaseClient.runeTemplates.getAll()
    console.log(`[RUNE-TPL] ensureLoaded DB returned list.length=${Array.isArray(list) ? list.length : 'non-array'}`)
  } catch (err) {
    console.error('[RUNE-TPL] ensureLoaded read error:', err)
    list = []
  }
  const safeList = Array.isArray(list) ? list : []
  console.log(`[RUNE-TPL] ensureLoaded safeList.length=${safeList.length}`)
  // 第一次（DB 为空）→ 触发一次 full-push seed（如果上一次的 push 已存在，则并发复用）。
  let needsReseed = safeList.length === 0
  if (safeList.length > 0) {
    // 即使 DB 里"看起来有内置行"，也得校验是否覆盖了 renderer 端 14 张。
    // 用户在 dev 模式下手动删空 DB 但保留其他行时，需要重建内置。
    // 简化策略：DB 为 0 张内置行时强制 reseed。
    const builtinCount = safeList.filter(r => r && (r.is_builtin === 1 || r.is_builtin === '1')).length
    if (builtinCount === 0) needsReseed = true
  }
  if (needsReseed) {
    if (!seedingPromise) {
      seedingPromise = (async () => {
        try {
          const result = await seedBuiltin()
          console.log(`[RUNE-TPL] ensureLoaded lazy-seed result=${result && result.success ? `ok count=${result.count}` : `fail code=${result && result.code}`}`)
        } catch (err) {
          console.warn('[RUNE-TPL] ensureLoaded lazy-seed error:', err)
        } finally {
          // seed 完毕后清掉锁，下一次再触发懒种（幂等，依赖 saveOne 的 upsert 语义）。
          seedingPromise = null
        }
      })()
    }
    try {
      await seedingPromise
    } catch (_) { /* noop */ }
    // seed 完了强制重读一次：saveOne 是 upsert，所以 DB 里现在至少有 renderer 端 14 行。
    try {
      list = await DatabaseClient.runeTemplates.getAll()
    } catch (err) {
      console.error('[RUNE-TPL] ensureLoaded re-read error:', err)
      list = []
    }
  }
  console.log(`[RUNE-TPL] ensureLoaded ipc-returned list=${Array.isArray(list) ? list.length : 'non-array'}`)
  cache = { list: Array.isArray(list) ? list : [], grouped: null, cachedAt: Date.now() }
  return cache
}

async function listFlat (force = false) {
  const c = await ensureLoaded(force)
  return c.list.slice()
}

function labelFromResolver (resolver, key) {
  if (typeof resolver === 'function') {
    try {
      const v = resolver(key)
      if (v) return v
    } catch (_) { /* noop */ }
  }
  return key
}

function buildGrouped (list, resolver) {
  const map = new Map()
  for (const row of list) {
    const key = (row && row.category_key) || 'general'
    if (!map.has(key)) {
      map.set(key, {
        category_key: key,
        name: labelFromResolver(resolver, key),
        items: []
      })
    }
    map.get(key).items.push(row)
  }
  const groups = Array.from(map.values())
  groups.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  for (const g of groups) {
    g.items.sort((a, b) => {
      const sa = Number(a.sort_order || 0)
      const sb = Number(b.sort_order || 0)
      if (sa !== sb) return sa - sb
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }
  return groups
}

async function listGroupedByCategory (i18nResolver, force = false) {
  const c = await ensureLoaded(force)
  if (force || !c.grouped) {
    c.grouped = buildGrouped(c.list, i18nResolver)
  } else {
    // 已有缓存但 i18n 语言可能切换了，每次重新解析标签（不重拉数据）
    c.grouped = buildGrouped(c.list, i18nResolver)
  }
  return c.grouped.map(g => ({
    category_key: g.category_key,
    name: g.name,
    items: g.items.slice()
  }))
}

async function save (item) {
  const result = await DatabaseClient.runeTemplates.save(item)
  invalidate()
  return result
}

async function remove (id) {
  const result = await DatabaseClient.runeTemplates.remove(id)
  invalidate()
  return result
}

async function fetchFromGithub ({ sourceUrl, categoryKey }) {
  const result = await DatabaseClient.runeTemplates.fetchRemote({ sourceUrl, categoryKey })
  if (result && result.success) invalidate()
  return result
}

/**
 * 内置 rune 预设模板的 seed 推送入口（v2026-07-29 full-push）。
 *
 * 真相源：renderer 端 `src/components/rune/runeTemplates/runeTemplates.js` 的
 * `BUILTIN_RUNE_TEMPLATE_META` 导出（14 个元数据 + 对应 factory 引用）。
 *
 * 调用场景：
 *   - 应用启动期 renderer 加载完，DB `rune_templates` 为空时调用一次性灌种子。
 *   - 用户「设置 → 重置符文模板」走 `clearAll({ builtins })` 后，DB 会被清空，
 *     需要紧接着再次调用本接口（或由 reset 流程自己 push）。
 *
 * 不允许从 main 端再次维护内置模板列表，避免和 renderer 端漂移。
 */
async function seedBuiltin () {
  let mod
  try {
    mod = await import(/* webpackChunkName: "rune-template-builtins" */ 'src/components/rune/runeTemplates/runeTemplates.js')
  } catch (e) {
    console.warn('[RUNE-TPL] seedBuiltin: cannot import builtin templates', e)
    return { success: false, code: 'NO_BUILTIN_TEMPLATES', message: String(e) }
  }
  const meta = (mod && (mod.BUILTIN_RUNE_TEMPLATE_META || mod.BUILTIN_RUNE_TEMPLATE_META_LIST)) || []
  if (!Array.isArray(meta) || meta.length === 0) {
    return { success: false, code: 'NO_BUILTIN_TEMPLATES' }
  }
  const now = Date.now()
  const rows = []
  for (let i = 0; i < meta.length; i++) {
    const it = meta[i]
    const factory = (typeof it.factoryName === 'string' && typeof mod[it.factoryName] === 'function') ? mod[it.factoryName] : null
    if (!factory || !it.id) continue
    let templateStr
    try {
      templateStr = factory()
    } catch (e) {
      console.warn(`[RUNE-TPL] seedBuiltin: factory for ${it.id} threw`, e)
      continue
    }
    if (typeof templateStr !== 'string') continue
    rows.push({
      id: it.id,
      category_key: it.category_key || 'general',
      name: it.name || it.id,
      desc: it.desc || '',
      color: it.color || '#9C27B0',
      icon: it.icon || 'auto_fix_high',
      template: templateStr,
      source_url: '',
      is_builtin: 1,
      sort_order: Number.isFinite(it.sort_order) ? it.sort_order : i,
      created_at: now,
      updated_at: now
    })
  }
  if (!rows.length) {
    return { success: false, code: 'NO_BUILTIN_TEMPLATES' }
  }
  const result = await DatabaseClient.runeTemplates.saveMany(rows)
  if (result && result.success) invalidate()
  return result
}

/**
 * 把 `BUILTIN_RUNE_TEMPLATE_META` 拼装为 DB row 列表（与 seedBuiltin 同源，但只返回 rows）。
 * 主要用于「设置 → 重置符文模板」场景：renderer 端算好列表直接 push 给 main。
 */
async function buildBuiltinRows () {
  let mod
  try {
    mod = await import(/* webpackChunkName: "rune-template-builtins" */ 'src/components/rune/runeTemplates/runeTemplates.js')
  } catch (e) {
    console.warn('[RUNE-TPL] buildBuiltinRows: cannot import builtin templates', e)
    return []
  }
  const meta = (mod && (mod.BUILTIN_RUNE_TEMPLATE_META || mod.BUILTIN_RUNE_TEMPLATE_META_LIST)) || []
  if (!Array.isArray(meta) || meta.length === 0) return []
  const now = Date.now()
  const rows = []
  for (let i = 0; i < meta.length; i++) {
    const it = meta[i]
    const factory = (typeof it.factoryName === 'string' && typeof mod[it.factoryName] === 'function') ? mod[it.factoryName] : null
    if (!factory || !it.id) continue
    let templateStr
    try {
      templateStr = factory()
    } catch (e) { continue }
    if (typeof templateStr !== 'string') continue
    rows.push({
      id: it.id,
      category_key: it.category_key || 'general',
      name: it.name || it.id,
      desc: it.desc || '',
      color: it.color || '#9C27B0',
      icon: it.icon || 'auto_fix_high',
      template: templateStr,
      source_url: '',
      is_builtin: 1,
      sort_order: Number.isFinite(it.sort_order) ? it.sort_order : i,
      created_at: now,
      updated_at: now
    })
  }
  return rows
}

/**
 * 重置所有符文模板（保留用户自定义）。
 * payload.builtins 是 renderer 端的最新内置模板列表——main 端不再维护镜像。
 * payload 缺省 / 为空时直接拒绝，避免使用任何已不存在的兜底数据。
 */
async function clearAll (payload) {
  const result = await DatabaseClient.runeTemplates.clearAll(payload || {})
  if (result && result.success) invalidate()
  return result
}

/**
 * 干跑 / 预演导入。
 * v2026-08-01：把"切 split（newItems / conflictItems）"从 UI 弹框搬到 service，让 split 真相源完全脱离 ui store hint、依赖主进程 DB 现读。
 *
 * 与 batchImport 的关系：
 *   - 二者都用 **用户的 runes 表**（v2026-08-01 重新校准：批量导入语义是"用户保存符文"，
 *     不是"导预设模板到内置源 rune_templates"，否则 Settings 弹框导入完成后看不到导入项）。
 *   - dryRunImport 用 `DatabaseClient.runes.getAll()` 现切；
 *   - batchImport 的 replace 模式也用 `DatabaseClient.runes.getAll()` 找真 id。
 *   - UI 不再传 existingRunes / builtinNames 的 hint 作为 split 真相源。
 *
 * v2026-08-01 "选中分类批量灌入" 语义：
 *   - entry.existingCategory / entry.category 都基于 validTargetCategory（= 弹框 localCategory）。
 *   - batchImport 的 replace 路径也走 validTargetCategory（命中项挪过去，不保留原分类）。
 *   - 在 gaming tab 下导入 → 勾上重名项 = 把该项从原分类挪到 gaming。
 *
 * @param {Array} items - 来自 JSON 文件的符文条目数组
 * @param {string} targetCategory - 用户在弹框中选的导入分类（同时决定 new/conflict 项的目标分类）
 * @param {Object} options
 * @param {Function} options.builtinNameSet - 可选：内置符文名集合，用于剔除内置项
 * @param {Array} options.builtinNames - 同上的备选（数组直接传）
 * @returns {Promise<{ newItems, conflictItems, builtinFiltered, totalInvalid }>}
 */
async function dryRunImport (items, targetCategory = '', options = {}) {
  const list = Array.isArray(items) ? items : []
  let totalInvalid = 0
  const validItems = []
  for (let i = 0; i < list.length; i++) {
    const raw = list[i]
    if (!raw || typeof raw !== 'object') {
      totalInvalid += 1
      continue
    }
    const name = String((raw && raw.name) || '').trim()
    if (!name) {
      totalInvalid += 1
      continue
    }
    validItems.push({ index: i, raw, name })
  }

  // 1) 内置剔除
  let builtinFiltered = 0
  let builtinNameSet = null
  if (typeof options.builtinNameSet === 'function') {
    try {
      const arr = options.builtinNameSet()
      if (Array.isArray(arr)) {
        builtinNameSet = new Set(
          arr.filter(Boolean).map(n => String(n).trim().toLowerCase())
        )
      }
    } catch (_) { /* noop */ }
  } else if (Array.isArray(options.builtinNames)) {
    builtinNameSet = new Set(
      options.builtinNames.filter(Boolean).map(n => String(n).trim().toLowerCase())
    )
  }

  const afterBuiltin = []
  if (builtinNameSet) {
    for (const it of validItems) {
      if (builtinNameSet.has(it.name.toLowerCase())) {
        builtinFiltered += 1
      } else {
        afterBuiltin.push(it)
      }
    }
  } else {
    afterBuiltin.push(...validItems)
  }

  // 2) 现读 DB（用户符文表 runes），按 name 比对分两栏
  // v2026-08-01（重新校准）：批量导入的用户动作语义是「写入用户的 runes 表」，与"添加符文"单条按钮对齐。
  //   之前错写到 rune_templates 表（= 内置预设源），导致 Settings 弹框导入完成后看不到导入项，
  //   也让两个表互不互通、"多重名"现象无法从源头消除。这里与 `batchImport` 的写入表保持完全一致。
  let dbRows = []
  try {
    dbRows = await DatabaseClient.runes.getAll()
    if (!Array.isArray(dbRows)) dbRows = []
  } catch (_) {
    dbRows = []
  }
  const dbNameMap = new Map()
  for (const r of dbRows) {
    if (r && r.name) {
      const key = String(r.name).trim().toLowerCase()
      if (!dbNameMap.has(key)) {
        // runes 表的字段名是 `category`，不是 `category_key`。
        dbNameMap.set(key, { id: r.id, category: r.category || 'general' })
      }
    }
  }

  const newItems = []
  const conflictItems = []
  // v2026-08-01（重新校准）：写入表是 runes，字段是 `category`。
  // "validTargetCategory" 同时作为 entry.existingCategory / entry.category 的回退值：
  //   - newItem / conflictItem 都最终落入 targetCategory（"选中分类批量灌入"语义）
  //   - existingCategory 表示"导入后落入的目标分类"，便于 UI 展示分类去向
  const validTargetCategory = isValidCategory(targetCategory)
    ? String(targetCategory).trim()
    : 'general'
  for (const it of afterBuiltin) {
    const nameKey = it.name.toLowerCase()
    const entry = {
      key: `${it.index}-${nameKey}`,
      name: it.name,
      desc: String((it.raw && it.raw.desc) || ''),
      // v2026-08-01：entry.category 是 UI 展示字段；service.batchImport 仅以 validTargetCategory 为权威
      // 落 DB（避开 entry.category 这条不确定支路），所以这里对 raw.category 做白名单校验仅做 UI 友好度。
      category: isValidCategory(it.raw && it.raw.category)
        ? String(it.raw.category).trim()
        : validTargetCategory,
      color: (it.raw && it.raw.color) || '#7E57C2',
      icon: (it.raw && it.raw.icon) || 'star',
      template: (it.raw && it.raw.template) || '',
      selected: false,
      // existingId 是 runes 表中同名活行的真实 id，供 batchImport 的 replace 路径用。
      existingId: dbNameMap.get(nameKey)?.id || null,
      // existingCategory 表示"导入后落入的分类"；new 项 targetCategory，conflict 项也用 validTargetCategory（命中后挪过去）。
      existingCategory: validTargetCategory
    }
    if (dbNameMap.has(nameKey)) {
      conflictItems.push(entry)
    } else {
      entry.selected = true
      newItems.push(entry)
    }
  }

  return {
    newItems,
    conflictItems,
    builtinFiltered,
    totalInvalid,
    hasBuiltInSource: !!builtinNameSet,
    dbReadAt: Date.now()
  }
}

/**
 * 批量导入符文（从 JSON 文件）。
 *
 * v2026-08-01（重新校准语义）：
 *   - 写入表：用户的 runes 表（与单条"添加符文"按钮一致的真相源）。不再写到 rune_templates（= 内置预设源）。
 *   - 目标分类：targetCategory 对新建/覆盖命中都生效；用户选中 gaming tab 导入时，勾上的"重名"项被挪到 gaming。
 *   - replace 模式：以 DB 现读的真实 id 为权威，绝不复活 hint 里的残留 id（避免 INSERT 与现存同名活行并存）。
 *
 * @param {Array} items - 要导入的符文数组，格式与导出格式一致：{ name, desc, category, color, icon, template }
 * @param {string} targetCategory - 目标分类。valid（白名单内）直接用，非法 fallback 'general'。新建项用此值；replace 命中项也用此值（"挪到目标分类"）。
 * @param {Object} options - 可选配置
 * @param {string} options.conflictMode - 冲突处理模式: 'normal'(默认新建) | 'replace'(覆盖) | 'skip'(跳过)
 * @param {Array} options.existingRunes - 现有符文列表（hint，与 UI split 同步；replace 模式下不作为 id 真相源）
 * @returns {Promise<{ success: boolean, count: number, skipped?: number, message?: string }>}
 */
async function batchImport (items, targetCategory = '', options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, count: 0 }
  }
  const now = Date.now()
  const rows = []
  const skipped = []
  const conflictMode = options.conflictMode || 'normal'
  const existingRunes = options.existingRunes || []
  // 验证目标分类是否有效（模块顶部 VALID_CATEGORY_KEYS 白名单）
  const validTargetCategory = isValidCategory(targetCategory)
    ? String(targetCategory).trim()
    : 'general'

  // 构建现有符文 hint（仅 skip 模式用作"已有"集合，replace 模式不用 hint.id 作为权威）。
  // runes 表字段是 `category`，不是 `category_key`。
  const existingNameMap = new Map()
  for (const rune of existingRunes) {
    if (rune && rune.name) {
      const key = String(rune.name).trim().toLowerCase()
      existingNameMap.set(key, { id: rune.id, category: rune.category || 'general' })
    }
  }

  // v2026-08-01：replace 模式以真实 runes DB 为准——
  //   选项 existingRunes 可能与 DB 漂移（hint 由 UI 弹框在 openBatchImport 时刻从 DB 现读，
  //   到 doImport 之间可能有其他写入或删除）。replace 必须用 DatabaseClient.runes.getAll() 返回的
  //   最新 id 来真正"覆盖"那条活行，否则若 hint.id 指向已删的行，会触发 INSERT 造出新行，
  //   与现存同名活行并存，造成「多条重名」。
  let dbNameMap = null
  if (conflictMode === 'replace') {
    let liveList
    try {
      liveList = await DatabaseClient.runes.getAll()
    } catch (err) {
      console.warn('[RUNE-TPL] batchImport: runes.getAll failed, fallback to hint', err)
      liveList = []
    }
    dbNameMap = new Map()
    for (const r of (Array.isArray(liveList) ? liveList : [])) {
      if (r && r.name) {
        const key = String(r.name).trim().toLowerCase()
        if (!dbNameMap.has(key)) {
          dbNameMap.set(key, { id: r.id, category: r.category || 'general' })
        }
      }
    }
  }

  // 合并 existing + import list 的名称集合（用于 skip 模式去重）
  // skip 模式：同名符文只导入第一个，后续同名（包括 import list 内部重复）都跳过
  const seenNames = new Set()
  // 先把现有符文名称加入（跳过模式对这些也要去重）
  for (const [key] of existingNameMap) {
    seenNames.add(key)
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const itemName = String(item && item.name || '').trim()
    const itemNameKey = itemName.toLowerCase()
    // 跳过模式下，如果存在同名（现有符文或之前已处理的导入项）则跳过
    if (conflictMode === 'skip') {
      if (seenNames.has(itemNameKey)) {
        skipped.push(itemName)
        continue
      }
      seenNames.add(itemNameKey)
    }
    // v2026-08-01：replace 模式语义是「挪到目标分类 + 用 DB 真 id」。
    //   - DB 命中 → 用 DB 现读的 id（保证 INSERT OR REPLACE 命中现有行），category 走 validTargetCategory
    //     （命中项从原分类挪到目标分类）。
    //   - DB 未命中（hint 残留或该行已被删）→ 走新建路径，绝不复活 hint.id，避免 INSERT 造新行造成多条重名。
    //   - normal 模式：始终新建，category 用 validTargetCategory。
    //   - skip 模式：已在上面 continue 掉同名项；剩下的当新建处理。
    let id
    let category = validTargetCategory
    if (conflictMode === 'replace' && dbNameMap && dbNameMap.has(itemNameKey)) {
      const existing = dbNameMap.get(itemNameKey)
      id = existing.id
      // category 保持 validTargetCategory（命中项挪到目标分类）
    } else {
      // 新建模式：使用目标分类 + 生成全新 id
      id = 'import-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 6)
    }
    // 写入 runes 表（schema 字段：id / name / desc / color / icon / template / category / sort_order / inherit_from_previous / created_at / updated_at）。
    // runes 表没有 source_url / is_builtin 字段（与 rune_templates 不同），所以这两列不带。
    rows.push({
      id,
      category,
      name: item.name || '未命名符文',
      desc: item.desc || '',
      color: item.color || '#7E57C2',
      icon: item.icon || 'auto_awesome',  // 与 db:saveRunes 默认 icon 一致（注意 rune_templates 旧默认是 'star'）
      template: item.template || '',
      sort_order: 9999,
      inherit_from_previous: 0,
      created_at: now,
      updated_at: now
    })
  }
  if (rows.length === 0) {
    // skip 模式全部命中、或 normal/replace 没有可写入项时，直接返回成功并保留 skipped 计数
    return { success: true, count: 0, skipped: skipped.length }
  }
  const result = await DatabaseClient.runes.saveMany(rows)
  if (result && result.success) invalidate()
  return { ...result, skipped: skipped.length }
}

function clearCache () {
  invalidate()
}

const runeTemplateService = {
  listFlat,
  listGroupedByCategory,
  save,
  remove,
  fetchFromGithub,
  seedBuiltin,
  buildBuiltinRows,
  clearAll,
  batchImport,
  dryRunImport,
  clearCache
}

export default runeTemplateService