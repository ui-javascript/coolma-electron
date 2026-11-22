# Tests

## 单测（`tests/unit`）

用仓库已有的 esbuild + node 内置 `node:test`，不引入 vitest 等新依赖：

```bash
cd desktop-vue3 && pnpm test:unit
```

当前覆盖纯函数层：`utils/categoryTree`（分类树/标签树数值规则）、`utils/cdn-rules`（内置项合并/资源类型/jQuery 核心识别）。
新增测试照着写：`tests/unit/<name>.test.ts`，然后把它加进 `package.json` 的 `test:unit` entryPoints 与运行列表。

## `legacy-coolma.db`

由 `coolma-electron` 的旧 schema 生成的脱敏 fixture：

- 2 篇 notes（`legacy-doc-001/002`）；
- 2 个 tags；
- 2 个 local_categories；
- 1 个 rune；
- 1 个 echo；
- `notes` 表故意不带 `dirty` 列，用于验证 v1 migration 的补列逻辑。

用途：

```text
设置 → 数据 → 导入旧库 → 选择 tests/fixtures/legacy-coolma.db
```

预期：导入 2 篇笔记，schemaVersion 变为 1，之后可继续新建笔记。

> 该文件只包含合成数据，不含真实用户笔记。
