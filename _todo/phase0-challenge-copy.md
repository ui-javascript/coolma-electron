# Echo 公开挑战：30 天写 5 张新卡片

> 这是阶段 0 的"拉创作者"文案，配套公开信投放。
> 走"全程开源"路线——不开现金奖励，只给 GitHub Contributors 名单 + README 推荐位。

---

## 1. 中文长版（V2EX / 即刻 / 少数派 用）

```markdown
# 🎴 Echo 公开挑战：30 天 5 张新卡片

我做了一个东西：在 Markdown 里写 `@生生不息{...}()` 就能让
周围文本长出春天万物复苏的动画；写 `@破万法{...}()` 就能
屏蔽其他 echo；写 `@夺心魄{...}()` 就能篡改别的 echo 效果。

现在系统自带 16 张卡片（nice / todo / growth / shatter 等），
但我想看看——如果你是前端开发者，你想加什么卡片？

## 挑战规则

1. 写一个 echo 卡片定义（30–100 行 JS）
2. 提交一个 PR 到 [luo0412/coolma](https://github.com/luo0412/coolma)
3. 我们一起把它合并进仓库

## 奖励（不开现金，保持开源调性）

- 🏅 GitHub Contributors 名单永久留名
- 📌 README 推荐位：你的卡片 + 你的 GitHub 主页链接
- 🎁 后续 `@coolma/echo-runtime` SDK 化时，邀请你进 core contributors

## 参考实现（30 行 JS）

`src/components/echo/echoBuiltins/echoBuiltinsNice.js`：

\`\`\`javascript
export const META = {
  id: 'nice',
  name: 'nice',
  icon: 'thumb_up',
  color: '#4CAF50',
  category: 'builtin',
  type: 'echo-chant',
  desc: '把所在行除 @nice 之外的文本用 <mark> 包裹',
  handlerBody: \`
    const $rune = $(node)
    if (!$rune.length) return
    const $prev = $rune.prev()
    if (!$prev.length) return
    const $mark = $('<mark class="ag-rune-nice-highlight"></mark>')
      .append($prev.clone())
    $prev.replaceWith($mark)
  \`
}
\`\`\`

## 完整 DSL 文档

- 中文长文：见 `<repo>/_todo/phase0-chinese-letter-v1.md`
- 英文长文：见 `<repo>/_todo/phase0-english-letter-v1.md`
- 架构速查：`<repo>/.agents/skills/rune-echo-design/SKILL.md`

## 我等你 30 天

如果 30 天内收到 ≥ 1 个 PR，我会立刻把 echo 抽成独立 npm 包
`@coolma/echo-runtime`，并补完整开发者文档。

如果 0 PR 但有 ≥ 5 个 "我也想写" 评论，我会重写叙事再测 30 天。

否则宣告这条路线失败——保留所有代码，但不再投入精力。
```

---

## 2. 英文短版（Show HN comment / Reddit / Lobsters 用）

```
I'm running an open challenge: write a new "echo card" for my
Markdown annotation DSL in 30 days.

`@echo-name{props}()` lets you write a JS function that
hijacks nearby DOM elements. 16 built-ins included, PRs welcome.

Reference impl: echoBuiltinsNice.js (30 lines)
DSL docs: github.com/luo0412/coolma

No cash prize — just GitHub Contributors + README spot.
But if I get 1+ PRs in 30 days, I'll extract @coolma/echo-runtime
as a standalone npm package and write proper developer docs.
```

---

## 3. Twitter 280 字版

```
I built a programmatic annotation DSL for Markdown notes.

`@nice()` → highlight the previous text
`@growth{scope: "siblings"}()` → bloom nearby paragraphs
`@shatter{target: "block"}()` → mute all echoes in the block

16 built-ins. 30 lines per new card. PRs welcome.

github.com/luo0412/coolma
```

---

## 4. Issue 评论一句话版（仓库内互动用）

```
I'd love to write an echo card for [YOUR IDEA]. Where do I start?

→ 参考 `src/components/echo/echoBuiltins/echoBuiltinsNice.js`
→ 写完提 PR 到 `feature/echo-new-card-<name>` 分支
→ 我们一起 review + 合并
```

---

## 5. 投放节奏

| 时间 | 动作 |
| --- | --- |
| 中文首发当天 | 在中文长文末尾附"挑战规则"链接 |
| 中文首发第 3 天 | 在 V2EX 单独发"挑战"帖（独立于长文） |
| 英文 Show HN 当天 | 在 Show HN description 末尾附短版 |
| 英文首发第 3 天 | 在 Reddit / Lobsters 单独发"挑战"帖 |
| 每周日 | 在 GitHub Discussions 发"本周新 PR 进度" |

---

## 6. 不在挑战范围内

- ❌ rune 模板（不在本挑战范围；下一阶段单独开）
- ❌ 翻译 i18n（基础工程，欢迎但不算挑战贡献）
- ❌ bug fix（重要，但不算"新卡片"）
- ❌ 文档（重要，但不强制"30 行"规则）

---

## 7. 自检清单

- [ ] 挑战文案是否在中文长文末尾有锚链接？
- [ ] 英文短版是否在 Show HN description 中？
- [ ] GitHub 仓库是否启用了 Discussions 板块？
- [ ] 是否有现成的 Issue 模板（`[echo idea]`）？
- [ ] 是否有 PR 模板（要求带 1 个测试用例）？