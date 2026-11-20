// 从 desktop-vue2 抽取 17 张内置回响 + 14 个内置符文模板，写成通用 JSON 目录。
// 只在迁移数据时跑；日常增删内置项直接改 catalog.json，再执行 pnpm run gen:builtins。
import fs from 'node:fs';

const root = new URL('../../desktop-vue2/src/components/', import.meta.url);
const echoMod = await import(new URL('echo/echoBuiltins/echoBuiltins.js', root).href);
const runeMod = await import(new URL('rune/runeTemplates/runeTemplates.js', root).href);

const runeItems = runeMod.BUILTIN_RUNE_TEMPLATE_META.map((meta, index) => ({
  kind: 'rune-template',
  builtin: true,
  id: meta.id,
  name: meta.name,
  desc: meta.desc,
  category: meta.category_key || 'general',
  color: meta.color || '#7E57C2',
  icon: meta.icon || 'description',
  sortOrder: index,
  payload: { template: runeMod[meta.factoryName]() },
}));

const echoItems = echoMod.BUILTIN_ECHO_CARDS.map((card, index) => ({
  kind: 'echo',
  builtin: true,
  id: card.id,
  name: card.name,
  desc: card.desc || '',
  category: card.category || 'marker',
  color: card.color || '#26A69A',
  icon: card.icon || 'graphic_eq',
  sortOrder: index,
  payload: { annoSource: card.anno_source, renderType: 'anno' },
}));

const catalog = {
  version: 1,
  source: 'desktop-vue2/src/components/{rune/runeTemplates,echo/echoBuiltins}',
  items: [...runeItems, ...echoItems],
};

const target = new URL('../electron/shared/builtins/catalog.json', import.meta.url);
fs.writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`synced ${runeItems.length} rune templates + ${echoItems.length} echoes -> ${target.pathname}`);
