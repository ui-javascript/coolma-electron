// 从 desktop-vue2 的 echoBuiltins 导出 17 张内置回响，生成主进程 seed 数据。
// 用法：在 desktop-vue3 下执行 pnpm run gen:echo-cards
import fs from 'node:fs';

const source = new URL('../../desktop-vue2/src/components/echo/echoBuiltins/echoBuiltins.js', import.meta.url);
const target = new URL('../electron/service/db/builtin-echo-cards.ts', import.meta.url);
const mod = await import(source.href);

const rows = mod.BUILTIN_ECHO_CARDS.map((card, index) => ({
  id: card.id,
  name: card.name,
  desc: card.desc || '',
  color: card.color || '#26A69A',
  icon: card.icon || 'graphic_eq',
  category: card.category || 'marker',
  annoSource: card.anno_source,
  sortOrder: index,
}));

const body = `// 由 desktop-vue2 src/components/echo/echoBuiltins 逐张导出，字段与 anno_source 原样保留。\n// 不要手改；vue2 侧新增内置卡时执行 pnpm run gen:echo-cards 重新生成。\nexport interface BuiltinEchoSeed {\n  id: string;\n  name: string;\n  desc: string;\n  color: string;\n  icon: string;\n  category: string;\n  annoSource: string;\n  sortOrder: number;\n}\n\nexport const BUILTIN_ECHO_CARDS: BuiltinEchoSeed[] = ${JSON.stringify(rows, null, 2)};\n`;
fs.writeFileSync(target, body);
console.log(`generated ${rows.length} builtin echo cards -> ${target.pathname}`);
