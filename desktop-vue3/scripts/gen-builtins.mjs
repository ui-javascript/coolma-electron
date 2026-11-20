// 读取通用 JSON 目录，生成主进程/前端共用的 TS 数据模块。
// 用法：在 desktop-vue3 下执行 pnpm run gen:builtins
import fs from 'node:fs';

const source = new URL('../electron/shared/builtins/catalog.json', import.meta.url);
const target = new URL('../electron/shared/builtins/data.ts', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(source, 'utf8'));

if (!Array.isArray(catalog.items) || catalog.items.length === 0) {
  throw new Error('catalog.json: items 不能为空');
}
if (!Number.isInteger(catalog.version) || catalog.version < 1) {
  throw new Error('catalog.json: version 必须是正整数');
}

const ids = new Set();
for (const item of catalog.items) {
  if (!['rune-template', 'echo'].includes(item.kind)) {
    throw new Error(`catalog.json: 未知 kind ${item.kind}`);
  }
  if (!item.id || !item.name || !Number.isFinite(item.sortOrder)) {
    throw new Error(`catalog.json: ${item.kind} 缺 id/name/sortOrder`);
  }
  if (ids.has(item.id)) {
    throw new Error(`catalog.json: id 重复 ${item.id}`);
  }
  ids.add(item.id);
  if (item.kind === 'rune-template' && !String(item.payload?.template || '').includes('<template>')) {
    throw new Error(`catalog.json: 符文模板 ${item.id} 缺 <template>`);
  }
  if (item.kind === 'echo' && !String(item.payload?.annoSource || '').trim()) {
    throw new Error(`catalog.json: 回响 ${item.id} 缺 annoSource`);
  }
}

const body = `// 由 electron/shared/builtins/catalog.json 生成，不要手改。\n// 增删内置项请改 catalog.json 后执行 pnpm run gen:builtins。\nimport type { BuiltinCatalog } from './types';\n\nexport const BUILTIN_CATALOG: BuiltinCatalog = ${JSON.stringify(catalog, null, 2)};\n`;
fs.writeFileSync(target, body);
console.log(`generated ${catalog.items.length} builtin items -> ${target.pathname}`);
