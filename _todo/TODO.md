# TODO（唯一待办清单）

> 只记**未完成**。做完就删，历史在 git log 里查。
> 设计稿/调研/竞品笔记都在 `参考/`——那里不是待办，别当任务读。
> 整理于 2026-11-22，按源码与提交实况复核过；旧文档里已实现的条目已删。
>
> 标记：`[ ]` 未开始 / `[~]` 在做

## A. Vue3 复刻收口（主线，171 提交/30 天）

### A1 功能缺口

- [ ] C7 云函数 Supabase 分支 / 平台选择 / 示例执行——C 批仅剩这一项（C8–C12 已落地：主题目录、日志+SQLite+重置库、关闭二次确认、默认排序、博客自定义构建命令）
- [x] melt-js 远程符文（已落地复核：`libs-muya-rune-vue3/src/meltRune.ts` 提供宿主与来源注册，`SettingsMeltSourcesCard` 为设置面板，插件初始化后 `setTimeout` 调 `preloadMeltRunes` 预热）
- [x] 设置项收尾（已核对：远程组件源面板 `SettingsMeltSourcesCard`、解析严格性 `ParsingSettingsCard`、主题目录刷新/打开 `CustomThemeCard`、微应用 `MicroAppsCard`、模板 `NoteTemplateCard` 均在 `SettingsView` 内挂载）

### A2 编辑器细节（R）

- [x] R-02 四角缩放实拖验证（四角运行时断言已加、全过；拖完 width/height/offset 写回 Markdown 的 `data-rune-*` 属性，刷新可复原）
- [x] R-03 运行动画逐项对照（成长 / 碎裂 / 天空步道 / 双生花等）；破万法禁用同块回响见 `desktop-vue3/docs/echo-shatter-20261122.md`
- [x] R-04 残余：scss 高级语法已真正编译（`@mixin`/`@include`、`@extend`、`#{}` 插值、darken/lighten/rgba/mix 等颜色函数、嵌套拍平），变量路径保持轻量；缩进式 sass 与 less 的高级指令仍原样注入并告警
- [x] R-05 渲染路径收口（`mountRuneVueHosts` 实测已只剩 1 处定义，无重复；摘掉 7 条 `console.log` 调试输出，保留 4 条错误级 `console.warn`，并加回归断言）
- [x] R-07 残余：失败态补“重试”按钮（内联图片直接按原地址清缓存重载；引用式图片保持点标记重试），no-referrer 二次解码仍在

### A3 验收与测试

- [ ] E-01 弹窗 / 快捷键 / 右键 / 主题下拉真机端到端
- [ ] E-02 次级弹窗 2px 级视觉对照
- [ ] E-03 最大化 / 最小尺寸 / 窗口安全区
- [~] 单测基座：`pnpm test:unit` 现为 3 套件 29 例（分类树/标签树、CDN 规则、SCSS 预处理）；还缺 `stores/sync` 调度、`services/ipc` 契约、Rune/Echo 渲染插件

### A4 同步边界（S）

- [ ] S-01 为知真实账号端到端（分页 / 空正文 / 目录删除 / 改名影响）
- [x] S-02 冲突合并：基线 hash + `sync_conflicts` 队列 + 批量弹框二选一（本地/云端/跳过），单边变更静默处理；不做 base 快照
- [ ] S-02 残余：增量游标（`lastSyncAt` 仍是展示用）；真机双端改同一篇的回归验证

## B. Tauri 收口（功能已近 1:1，缺验证与债务清理）

- [ ] Windows 真机全流程 + macOS/Linux 构建验证（仓库只有 NSIS 记录）
- [ ] 真实账号同步端到端（README 自述缺口）
- [ ] 批量导入 + 同步并发压测（rusqlite 单连接 + Mutex 串行）
- [ ] db shim 收敛：3,732 行 JS 重放 91 个 `db:*`，加字段要动两处

## C. 产品 backlog（非复刻）

### C1 笔记与编辑器

- [ ] 新建文档模板 prompt + 挖空模板
- [ ] 待办面板：聚合所有笔记里未完成的 `- [ ]`
- [ ] 排版强化：md-to-wechat 的图片布局

### C2 外观

- [ ] 皮肤扩展：12 星座 + MBTI（现有哪吒/白羊/INFP），带动画与背景

### C3 博客部署

- [ ] `base` 合法性校验（`#`、`?` 非法字符未拦）
- [ ] 菜单项 i18n 英文 key 补全
- [ ] 博客端符文/回响渲染——设计见 `参考/vuepress符文回响-设计.md`
- [ ] 部署历史入库（时间 / 状态 / 目标）
- [ ] 打包后自动 `vuepress dev` 预览
- [ ] Gitee / GitLab 支持

### C4 生态与其他

- [ ] 文件夹重命名（为知无直连接口，需曲线方案）
- [ ] 微应用子应用隔离（wujie 扩展）
- [ ] Skill 占位符机制——设计见 `参考/Skill占位机制-设计.md`
- [ ] AI 取消语义：现在只 abort 本地 fetch，服务端可能继续生成计费；补超时 / 重试 / 取消原因
- [ ] deepagents-js 接入——触发条件见 `参考/deepagents-js评估.md`
- [ ] 存储双轨制（SQLite ↔ MD）——未拍板，决策点见 `参考/同步冲突策略-设计.md` 附录
- [ ] 阶段0 内容验证（公开信 + 挑战）——是否继续待定，材料见 `参考/阶段0-内容验证存档.md`

## D. 暂停 / 不做

- 云函数 customFn 自建——用户已拍板暂停（`参考/云函数调研-存档.md`）
- 实时协同 Phase 3 / TipTap 替换 Muya / 自建 CRDT Gateway——已弃用

---

**关于删掉的旧文档**：`TODO-vue3-P0缺口`、`TODO-模块联邦组件加载改造`、`TODO-vuepress博客打包部署优化`、`TODO-Vue3升级迁移成本调研`、`TODO-是否升级技术栈`、`TODO-数据存储与同步`、`MUYA-LINK-SETUP`、`MUYA-SDK-MIGRATION`、`TODO-阶段0内容验证` + `phase0-*` 全部完成或已过期，内容仍在 git 历史。其中未实现的方案型内容（melt、vuepress 符文渲染、Skill 占位、冲突策略、云函数）没有删，移到了 `参考/`。
