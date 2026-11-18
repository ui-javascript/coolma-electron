# Tests / Fixtures

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
