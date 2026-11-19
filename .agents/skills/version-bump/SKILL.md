---
name: version-bump
description: >
  按从 hel-components 移植的日期规则递增 Coolma 版本。用于用户要求版本号 +1、升版、叠加版本或为发版准备版本号；普通开发提交不自动升版。
---

# Coolma 版本号 +1

沿用 hel-components 的日期版本 `年.月.日` / `年.月.日-N`。以用户当前日期为准，按 `Asia/Shanghai` 时区取日历日。没有用户侧日期时才读取当前时间。

| 当前日期段与今天的关系 | 新版本 | 示例（今天 = 2026.11.19） |
| --- | --- | --- |
| 早于今天 | 用今天的日期，丢掉旧后缀 | `2026.11.18-3` → `2026.11.19` |
| 等于或晚于今天，没有后缀 | 保留已有日期，加 `-1` | `2026.11.19` → `2026.11.19-1` |
| 等于或晚于今天，已有 `-N` | 保留已有日期，后缀加一 | `2026.11.20-1` → `2026.11.20-2` |

按数字逐位比较 `(年, 月, 日)`，不要按字符串比较。确认目标已采用日期版本后，可用原技能的计算方式：

```js
function bump(version, today) {
  const [datePart, suffix] = version.split('-')
  const [y, m, d] = datePart.split('.').map(Number)
  const [year, month, day] = today
  const cmp = y - year || m - month || d - day
  if (cmp < 0) return today.join('.')
  return suffix === undefined ? `${datePart}-1` : `${datePart}-${Number(suffix) + 1}`
}
```

## 在本仓库操作

1. **确定目标。** `desktop-vue2/package.json` 和 `desktop-vue3/package.json` 分别决定两端的应用版本，按用户指定或当前工作明确指向的应用操作，不自动同步。根 `package.json` 是私有 workspace 入口；Vue 3 的 `frontend`、内部包、模板和 demo 各有独立清单，不随应用升版。若用户按提交范围指定目标，用 `git diff --name-only <base> <head>` 核对范围，再映射到对应项目的清单。
2. **计算并修改。** 读取目标清单的实际版本。若明确要求把仍为开发版本（如 Vue 3 的 `0.1.0`）的桌面应用纳入这套规则，首次升版直接取当天日期作为基线；其他未采用日期版本的包不自动切换。只改目标的 `version` 字段；应用升版通常不需要重装依赖或重写锁文件。若单独升的是内部包，另外核对是否存在绑定旧版本的显式依赖或发布元数据。
3. **核对变更。** 重新解析修改后的 `package.json`，检查 diff，报告目标和 `旧 → 新`；有未来日期、首次切换到日期版本或待发布版本碰撞时单独说明。用户要求提交时，遵循[中文提交规则](../../rules/commit-message.mdc)，例如 `chore(版本): 将 Vue 3 桌面端升至 2026.11.19`。
4. **发布单独处理。** 本仓库不沿用 hel-components 的 `publish:stage`。仅升版不打 tag、不推送、不触发发布。需要发布时先核对目标端的打包配置和工作流；现有 [`Memocast.yml`](../../../.github/workflows/Memocast.yml) 构建的是 Vue 2。`-N` 在 SemVer 中属于预发布，`年.月.日-1` 的排序低于同日无后缀版；沿用本地叠加规则，实际发布到自动更新渠道前要核对已发布版本和客户端能否升级，发现冲突先报告。
