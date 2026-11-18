# Rule / Skill

本目录保存项目的长期规则与可复用工作流。

## 当前文档

- [Coolma → Coolma Vue3 整体迁移方案](./coolma-vue3-overall-migration.md)
  - 版本与下载基线
  - 技术栈决策（electron-egg TS / Vue3 / Element Plus / Pinia / enum-plus）
  - 模块映射、IPC 契约、SQLite 数据迁移
  - P0–P7 分阶段实施、验收矩阵、风险预案
- [P1 工程骨架](../docs/P1.md)
- [P2 数据层与旧库导入](../docs/P2.md)
- [P3 真实数据与 CRUD](../docs/P3.md)
- [Muya 独立包](../docs/MUYA.md)
- [无边框窗口](../docs/WINDOW.md)

## 使用约定

- 开始任何迁移/复刻任务前，先读整体方案，确认当前阶段。
- `.tmp/` 是只读上游参照，不在其中开发。
- 阶段完成后更新整体方案的“状态”和退出标准。
- UI 组件库固定为 **Element Plus**，不再引入 Quasar。
- 业务枚举/字典统一用 **enum-plus**，共享字典放在 `electron/shared/enums/`。
