# 内置符文模板 / 内置回响目录

`catalog.json` 是唯一手改入口。`data.ts` 由 `pnpm run gen:builtins` 生成，主进程和前端都读它；不要手改 `data.ts`。

## 结构

```json
{
  "version": 1,
  "items": [
    {
      "kind": "rune-template",
      "builtin": true,
      "id": "builtin-tpl-createBlankTemplate",
      "name": "空白模板",
      "desc": "...",
      "category": "general",
      "color": "#7E57C2",
      "icon": "description",
      "sortOrder": 0,
      "payload": { "template": "<template>..." }
    },
    {
      "kind": "echo",
      "builtin": true,
      "id": "__builtin_nice__",
      "name": "nice",
      "desc": "...",
      "category": "builtin",
      "color": "#4CAF50",
      "icon": "thumb_up",
      "sortOrder": 0,
      "payload": { "annoSource": "export default {...}", "renderType": "anno" }
    }
  ]
}
```

- `kind` 只接受 `rune-template` / `echo`。
- `id` 全局唯一。回响内置项用 `__builtin_` 前缀，删除对账只认这个前缀。
- 回响的 `category` 是 `builtin` / `showy` 等；符文模板的 `category` 是 `general` / `resume`。

## 增删改

1. 改 `catalog.json`。
2. 跑 `pnpm run gen:builtins`，会校验并重写 `data.ts`。
3. 重新构建。内置回响在每次启动时由 `syncBuiltinCatalog` 对账：新增会补、改动会覆盖、从 JSON 删掉且带 `__builtin_` 前缀的行会被清除；用户自己的卡片不动。
4. 符文模板没有数据库行，选择器直接读目录，重新构建即生效。

`pnpm run sync:builtins` 只用于从 `desktop-vue2` 重新抽 14 个模板 + 17 张回响，会覆盖 `catalog.json`；日常维护不要跑它。
