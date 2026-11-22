# TODO-deepagents-js 评估与接入路线

> **日期**：2026-07-17
> **评估人**：Claude (cursor-agent)
> **状态**：评估完成 → 本期（2026-07）不引入，Phase 2 待定

---

## 1. 背景

coolma 项目当前已引入：

- `portkey-ai ^3.1.0`（`package.json` line 42）
- `src/services/PortkeyService.js`：提供 `chat()` / `chatStream()` / `testConnection()`
  - `portkey` provider 路径：`chatStream` 在 line 373-378 直接抛错"Streaming is not yet supported"
  - `openai-compatible` provider 路径：已有完整 SSE 流式实现（`runOpenAiCompatibleStream`，line 137-216）
- `src/components/ui/dialog/SettingsDialog.vue`：`ai` tab（line 51-56）含 AI 模型配置

用户考虑引入 `langchain-ai/deepagentsjs`（https://github.com/langchain-ai/deepagentsjs）以支持更复杂的 AI 任务。

---

## 2. 两个库的定位对比

| 维度 | `portkey-ai`（已在用） | `deepagents-js` |
| --- | --- | --- |
| 类型 | LLM HTTP 客户端 / 网关 SDK | 基于 LangGraph 的 Agent 框架 |
| 解决的核心问题 | 多 provider 路由、virtual key、缓存、可观测 header | 让 LLM 拥有规划、子 agent、文件系统工具调用等能力 |
| 输出物 | `client.chat.completions.create(...)` | `agent.invoke(...)` |
| 当前在工程里的角色 | **底层 transport** | **未引入** |
| 真正竞品 | openai-sdk、各 provider 自有 SDK、LangChain 的 `ChatOpenAI` | LangChain "Deep Agents"、Manus、AutoGen、CrewAI |

### 结论

`portkey-ai` 与 `deepagents-js` **不是竞品，也不互斥**。前者负责"把请求打出去"，后者负责"完成一件需要好几步、有规划 + 读写动作的复杂任务"。两者是上下层关系，不是二选一。

---

## 3. 三个具体下游场景分析

### 场景 A：流式续写 / 扩写 / 改写 / 翻译 / 总结

**需求**：在编辑器选中段落 → AI 改写 → 流式回显。
**是否需要 deepagents**：❌ 否。单轮 `chat` + SSE 流式足够。

- `PortkeyService.chatStream` 的 `openai-compatible` 分支已完整实现 SSE 解析（`runOpenAiCompatibleStream`，line 137-216）。
- `portkey` 分支仅需补 SSE 透传（见本期改动 B）。
- 不需要规划、子 agent 或文件系统操作。

### 场景 B：跨多文档合并 / 整体重构

**需求**：把 A、B 两篇笔记合并重写成一篇新笔记；跨笔记的整理任务。
**是否需要 deepagents**：⭕ 是，这是 deepagents 真正发光的场景。

- 需要"读 A → 读 B → 规划结构 → 写新笔记"，多步骤 + 状态保持。
- deepagents 的 `write_todos` / `write_file` / `read_file` 天然匹配。

### 场景 C：在工具调用里插入本地操作

**需求**：AI 规划后自动写入 SQLite、调同步层 dirty 字段、直接 commit 到 WizNote 同步队列。
**是否需要 deepagents**：⭕ 是，需要自定义 tool。

- deepagents 支持自定义 tool；可接入 `DatabaseClient` / `CloudSyncService`。
- 但本期（Phase 1）不实现 AI 触发本地写入，只做 prompt preset 管理。

---

## 4. 风险与成本

### 4.1 打包体量

deepagents-js 引用 `langchain` 主包、`@langchain/core`、`@langchain/langgraph`，外加工具子包。进入 Electron renderer 会显著增加打包体积和启动内存。本项目已吃进 Monaco Editor、Shiki、Remark、Mermaid、Markmap、Vega 等大型依赖，暂不宜再加 LangChain 全家桶。

### 4.2 模型兼容性

DeepAgents 起手会让 LLM 先列 `write_todos` 再调 `write_file`，要求模型支持 `tool_use` / function calling。本地 + 开源小模型（DeepSeek、Qwen、Llama 等）对该特性的支持参差不齐。叠加当前 `portkey` provider 还不支持 stream，先上 deepagents 会将功能绑定在"强模型 + 能 stream"两个条件上。

### 4.3 流式观察层对接

LangGraph 的 `stream("updates")` 输出结构为 `{type: 'todos' | 'tool' | 'messages' ...}`，不是裸文本 delta。需要额外适配层才能喂给 `vue-element-ui-x` 的 Bubble / Typewriter 组件。当前 `PortkeyService.chatStream` 吐出的直接是 `delta.content`，一行进 Typewriter。

### 4.4 错误语义桥接

DeepAgents 内部吞错误后抛 `ToolMessage`；工程现有 `NeetoError` + `bus.$emit(events.REQUEST_ERROR)` 是面向 axios catch 设计的。需要额外 bridge 层。

---

## 5. 接入路线（仅供参考，本期不动）

### Phase 1（本期，2026-07）：补齐 portkey stream + prompt preset 管理

**已完成评估，正在落地**：

1. `PortkeyService.js`：`chatStream` 的 `portkey` 分支补 SSE，header 形态为 `Authorization: Bearer <apiKey>` + `x-portkey-virtual-key: <virtualKey>`（不发 `x-portkey-api-key`）。
2. `SettingsDialog.vue`：AI tab 新增 Prompt preset 表单，分组标题 `aiPresets`。
3. 存储复用 `DatabaseClient.aiSkills`（`db:getAiSkills / saveAiSkill / deleteAiSkill`），不新建 `ai_presets` 表。
4. 新增 i18n 键 `aiPreset*`（zh-cn + en-us）。
5. 新建 `src/components/ui/dialog/AiPresetEditorDialog.vue`（独立 dialog 组件）。

> **注意**：Phase 1 仅实现 preset 的"管理 + 选择"，实际 AI 触发点留待 Phase 1.x。

### Phase 2（触发条件：用户发起"跨多文档任务"或 AI 抽屉稳定使用 4-6 周后）

**引入 `deepagents-js`**：

1. 只装子集：`yarn add deepagents @langchain/core @langchain/openai`，不让 langchain 全家桶进入。
2. `PortkeyService` 退化：保留 provider 配置持久化，新增 `toLangChainModel()` 输出 `ChatOpenAI` 兼容对象，供 deepagents 初始化用。
3. 自定义两个 tool（不直接用 deepagents 默认的 `write_file` / `ls`）：
   - `coolma_read_notes({ kbGuid, noteId })`：走既有的 WizNote API。
   - `coolma_write_draft({ kbGuid, target, content })`：走同步层 + dirty 字段。
4. 沙箱：评估期用 `_temp/` 目录（遵守 `safe-shell.mdc`），不直接碰 `src/`。
5. 流式观察：LangGraph `stream("updates")` 解出 `todos / tool_call / message` 三类，前两类渲染为侧边思考链，最后一类给 Bubble 组件。

### Phase 3（不建议做）

- 多 agent 协作、subagent、真正的长时间后台任务——对离线笔记软件 ROI 极低。

---

## 6. 总结

| | 本期（Phase 1） |
|---|---|
| portkey stream | 补 SSE（Authorization + x-portkey-virtual-key） |
| prompt preset | 加管理表单（复用 aiSkills 存储） |
| deepagents-js | 不引入，不写入 `package.json` |
| AI 触发入口 | 本期仅管理，不实现调用 |
| 快捷键 | 本期不绑定，预留 i18n 占位 |

**状态**：评估完成，Phase 1 落地中。deepagents-js 进入路线图，Phase 2 触发条件见上。

---

*本文件由 Claude (cursor-agent) 生成于 2026-07-17，审核通过后执行 Phase 1 落地。*
