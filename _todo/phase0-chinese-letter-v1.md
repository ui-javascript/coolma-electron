# 为什么 Markdown 应该可编程：从 echo / rune 看富文本的下一个十年

> 一行 `@xxx{props}()` 就能劫持附近元素——我把这件事在桌面笔记里做出来了。

---

## 写在前面

这是一篇酝酿了很久的文章。

我做了三年的桌面笔记应用 coolma（前身 Memocast），最近半年我把最大的精力花在一件"看起来很轴"的事情上：让 Markdown 里的一行字能够**劫持**它附近其他元素的样式、动画、甚至交互逻辑。

听起来很玄。让我先抛一个具体场景：

```
今天天气真好 @生生不息{scope: "siblings"}()
```

保存后打开笔记，你会看到这一段**自动生长出春天万物复苏的动画**——但只有这一段，其它段落不受影响。

再换一个：

```
这段话不重要 @ignore{opacity: 0.3}()
```

保存后，整段变成淡灰色，透明度 30%，像打了马赛克一样。

或者更狠的：

```
@破万法{target: "block"}()
```

保存后，整个 block 里其他 echo 都被屏蔽，**包括之前那些乱七八糟的装饰**。

这不是 HTML 内嵌，不是 Notion 的块类型，不是 Obsidian 的 Dataview 插件。这是一个**全新的设计层**——我把它叫做 **echo（回响）**。

这篇文章，我想把这件事讲清楚：**为什么我认为 Markdown 应该可编程，以及我已经做到哪一步了**。

---

## 一、Markdown 的红利期过了

Markdown 在 2004 年被 Gruber 设计出来时，只是一个"HTML 的简化书写方式"。但 20 年后，它已经成了：

- 程序员写文档的标准格式（README、博客、API 文档）
- 重度笔记用户的首选（Obsidian、Typora、Logseq、Memos）
- 出版与学术圈的事实标准（Jupyter、Quarto）
- AI 时代的 prompt 友好格式

它能赢，是因为它足够简单：**标题是 `#`，列表是 `-`，引用是 `>`**——任何人 5 分钟就能学会。

但这个"简单"也成了天花板。

### 1.1 Markdown 是声明式，但不可编程

你可以声明"这是标题、这是列表、这是代码块"——但你没办法说"**当用户点击这个标题时，让下面这一节折叠**"。

你可以嵌入 `<details>` 这种 HTML 标签——但这就**破坏了可移植性**。在不支持 HTML 的环境（GitHub Issue 评论、纯文本终端、某些笔记应用）里，直接报错。

你可以用 Obsidian 插件写自己的块——但插件是**外部进程**，学习曲线是另一个世界（要懂 Vue / Svelte，要会打包，要会配置 manifest），普通作者根本够不到。

**这就是当前生态的核心矛盾**：Markdown 想要的"内容与样式分离"和"内容可交互化"是不可调和的。

### 1.2 现有三条路线都不优雅

我盘了一下市面上对"让 Markdown 更丰富"的尝试，发现只有三条路：

| 路线 | 代表 | 局限 |
| --- | --- | --- |
| **HTML 内嵌** | GitHub README、Typora | 不可移植；在不支持 HTML 的环境直接挂 |
| **块类型扩展** | Notion、子页、Database | 作者被锁死在应用内；导出 Markdown 就丢语义 |
| **插件系统** | Obsidian Dataview、Quarto | 学习曲线是另一个工程；普通作者写不出 |

**有没有第四条路**？

我想了很久，觉得应该是：**行内注解 DSL**。

---

## 二、我的尝试：行内注解 DSL

### 2.1 形态：一行字就能劫持

我设计的 DSL 形态是：

```
@xxx{props}()
```

> 形态规则：`{}` 可选（装 props），`()` 必有（装 prompt 或留空）。两者都不能少。

是不是看着眼熟？没错——它就是 Markdown 里"@user"的自然延伸。但这里 `@xxx` 不是社交标签，而是一个**对附近 DOM 元素的行为声明**。

比如：

```
这是一段普通文字 @nice()
```

`@nice` 是系统内置的 echo 卡片，它做的事情是：在 Markdown 解析时定位到 `@nice` 这个 token 节点，然后**往前**找到它前一个兄弟 DOM 节点（也就是"被作用文本"），把它包进 `<mark>` 里。结果就是：

> 这是一段普通文字 **==被高亮的文字==**

只有一句话，不需要写 HTML、不需要装插件、不需要切到 Notion。

### 2.2 16 张内置卡片图解

我把这一年半摸出来的 16 张卡片分了三档：

**简单型（行为很朴素）**：

| 卡片 | 作用 | 示例 |
| --- | --- | --- |
| `nice` | 把所在行其他文字高亮 | `xxx @nice()` |
| `todo` | 给段落加待办样式 | `@todo{checked: false}()` |
| `diff` | 标记差异（add/remove/change） | `@diff{mode: "add"}()` |
| `ad` | 标注广告位 | `@ad{type: "inline"}()` |
| `ref` | 标记参考资料，可点跳转 | `@ref{url: "..."}()` |
| `ignore` | 把段落透明度降下来 | `@ignore{opacity: 0.3}()` |
| `peek` | 折叠高亮 | `@peek{collapsed: true}()` |

**装饰型（视觉变化）**：

| 卡片 | 作用 |
| --- | --- |
| `growth`（生生不息）| 给附近元素加"生长"动画 |
| `twinbloom`（双生花）| 克隆前/后一行作为占位 |
| `calamity`（招灾）| 在作用域内随机给文字染哥特渐变 |
| `disperse`（离析）| 让附近元素用更宽松排版 |
| `skywalk`（天行健）| 切换主题（light/dark/sepia/auto） |

**互动型（能影响别的 echo）**：

| 卡片 | 作用 |
| --- | --- |
| `shatter`（破万法）| 屏蔽附近的 echo 作用 |
| `mindsteal`（夺心魄）| 篡改附近符合条件的 echo 效果 |
| `scapegoat`（替罪）| 在作用域内接住后续 echo / DOM 抛出的错 |
| `lucky`（强运）| 点击触发 AI 校对 |

——是的，命名很中二。生生不息、破万法、夺心魄——这是我从修仙小说借的术语。我后面解释为什么这么做。

### 2.3 一个反直觉的设计：echo 能劫持 echo

`shatter`（破万法）这张卡片，是我认为整个体系最反直觉、也最有价值的设计。

它做的事情是：**让附近的 echo 失效**。

```
这段话要被各种装饰 @生生不息{trigger: "manual"}()
@破万法{target: "block"}()
```

第一行想触发的生长动画**不会启动**——因为破万法在同一 block 内把它屏蔽了。

再比如 `mindsteal`（夺心魄）：

```
@生生不息{trigger: "manual"}()
@夺心魄{mode: "override", targets: "growth"}()
```

保存后，**生长动画的形态被夺心魄篡改**了——比如原本的"植物"动画变成了"火焰"动画。

这就是**作者对 DOM 的编程权**——不是简单的样式，是行为与行为之间的相互劫持。

### 2.4 配套：rune（符文）

echo 是**行为层**，那"结构层"呢？我引入了第二套体系：**rune**。

rune = Vue 单文件组件（SFC）的字符串模板，可以被动态编译并渲染成可交互卡片。

rune 也是同一个 DSL 家族：
```
简历标题 @rune{type: "ResumeTitle", title: "高级前端工程师"}()
```

保存后，笔记里出现一个完整的 Vue 组件实例——可以做表单、可以点按钮、可以接 API。

和 echo 的区别是：rune 嵌进的是**结构**（一段完整的 Vue 组件），而 echo 嵌进的是**行为**（对 DOM 的劫持）。

---

## 三、架构真相（写给想动手的人）

> 这一节技术细节多，可以直接跳到第五节。

### 3.1 anno_source：自描述的卡片定义

每张 echo 卡片是一个字符串：

```javascript
export default {
  type: 'echo-chant',         // 分类：echo / echo-chant / echo-tbd
  field: 'nice',              // id 别名
  title: 'nice',              // 名字
  version: 1,
  props: {},                  // 实例可配置参数
  
  render (props = {}) {
    return '<span class="ag-rune ag-rune--nice" data-echo-chant-id="nice">nice</span>'
  },
  
  afterRender (node, props) {
    const $rune = $(node)  // 注意：用 jQuery
    if (!$rune.length) return
    const $prev = $rune.prev()
    if (!$prev.length) return
    $prev.wrap('<mark class="ag-rune-nice-highlight"></mark>')
  }
}
```

`render` 返回 HTML 字符串，`afterRender` 在 DOM 挂载后执行——可以拿到 jQuery 包装的 node 进行任意劫持。

### 3.2 工厂模式 + 生命周期

每个 echo 卡片都遵循同一套模板：

1. **解析**：Markdown 文本里的 `@xxx{props}()` → token + 解析后的 props + prompt
2. **编译**：`new Function(prelude + source)` 把 anno_source 编译成 definition 对象
3. **渲染**：`definition.render(props)` → HTML 字符串注入到 Markdown 解析结果里
4. **挂载**：`definition.afterRender(node, props)` → 拿到真实 DOM 节点做劫持
5. **清理**：返回 cleanup 函数，编辑器销毁/重渲染时还原 DOM

整套流水线在 `src/components/echo/echoRuntime.js` 里，纯 JS 实现。

### 3.3 测试护城河

我没敢让这块裸奔。我用 Jest 29 写了 11 个套件、约 557 个用例，锁住了所有契约：

- `runtime-props.test.js` —— props 合并顺序、fallback 路径、graceful skip
- `jquery-echo-compile.test.js` —— 16 张卡片的顶层结构
- `jquery-afterrender.test.js` —— 16 张 handler 用 jQuery 直调，无原生兜底
- `main-builtin-echoes.test.js` —— IPC payload 契约

任何改动要让这 557 个用例全绿。

---

## 四、诚实地讲局限

我不想让你以为这是个完美方案。以下是当前已知的问题：

### 4.1 命名很中二，是有意的

是的，`生生不息 / 破万法 / 夺心魄 / 替罪`——这些是修仙小说的术语。我故意没用 `highlight / block / override / fallback` 这种工程命名。

理由是：**创作工具的术语应该有性格**。你不希望在一个写作环境里看到 `ag-rune-target-block-override-mode-disabled` 这种枯燥字符串——它让你感觉自己在写代码，而不是在写作。

但这是个**有争议**的选择。如果你想贡献，可以提 Issue 一起讨论。

### 4.2 桌面绑定，目前只能在 coolma 里用

是的，整个体系嵌在 coolma 这个 Electron + Vue 2 桌面应用里。你**没法直接**拿到 VSCode / Typora / Obsidian 里用。

但这是**阶段 1 的工作**：把 echo / rune 抽成独立 npm 包 `@coolma/echo-runtime` 和 `@coolma/rune-sdk`，让任何前端应用都能接入。

### 4.3 没有社区，是 1 人项目

整个仓库只有我一个维护者，过去 6 个月日均 commit 约 3 个。**这意味着：**

- 没有 review 流程，没有规范文档，没有 issue 模板
- PR 不会被秒回，可能要等 1 周
- 没有 discord / slack 群，所有讨论都在 GitHub issue / discussion

如果你要尝试贡献，请把这当作一个**早期开源项目**——别期望有 Notion / Figma 那种企业级体验。

### 4.4 已知 bug / 已知粗糙点

- Muya 编辑器有时会把 `@xxx{props}()` 解析成普通文本——尤其是 props 或 prompt 含特殊字符时
- 一些复杂的 echo 卡片（双生花、破万法）在快速编辑时会闪烁
- 移动端没适配——整个 coolma 是桌面 only

### 4.5 和同类工具的区别（FAQ 预案）

> 这一节是**写给评论区用的**——读者大概率会问"和 MDX 有什么区别"。

如果被问到 echo 与 MDX / 块扩展 / 富文本编辑器的关系，**统一用以下口径回答**：

> 一句话：**MDX 是"把 React 嵌入 Markdown"的工程化方案，echo 是"给 Markdown 加行内行为注解"的轻量方案，目标场景不同。**
>
> MDX 强在复杂组件（图表、表单、3D），但必须搭 React + 构建链；echo 强在行内行为（高亮、折叠、动效），零运行时、纯文本、复制粘贴即用。
>
> 我们**不在同一个赛道**——MDX 啃不动个人笔记 + 便携性的细分；echo 也啃不动严肃文档站 + 复杂组件的细分。详细的对比分析见 `_todo/MD-echo-vs-mdx-分析-202607.md`。

口径要点：

- **不站队**——只讲场景差异，不讲优劣
- **承认 MDX**——但不主动提 MDX 名字（除非读者问）
- **指向更长文档**——把战线拉长，不在评论区打持久战
- **不预测 MDX 未来**——避免引战

---

## 五、邀请

如果你读到这里，并且觉得"这思路对"，我想邀请你做三件事中的任意一件：

### 1. 留一句话

在评论区写一句"**我也想写一个 echo**"或者"**我觉得这思路对**"——不用真的去写代码，只是让我知道有人关心这件事。

### 2. 提个 echo 模板想法

去 GitHub 提个 Issue，标题写 `[echo idea] xxx`，描述你想要什么卡片。我会回你"我能不能用 30 行 JS 把它做出来"。

### 3. 直接提 PR

仓库：`github.com/luo0412/coolma`
路径：`src/components/echo/echoBuiltins/`
参考实现：`echoBuiltinsNice.js`（30 行 JS）

写一张新卡片，加 1 个测试用例，提 PR。我会 1 周内 review。

---

## 写在最后

Markdown 走过 20 年了。它赢了 HTML 简化的战争，但失去了"可编程"的延展空间。

我相信，**下一个十年的富文本，不会是 Notion 那种"块即数据库"的路线，也不会是 Obsidian 那种"插件即应用"的路线**——它会是某种介于两者之间的东西：行内注解 + 可交互语义。

echo / rune 是我**对这个方向的尝试**。它不完美、它有局限、它是 1 人项目。

但它是**真实的**——你下载 coolma，输入 `@生生不息{scope: "siblings"}()`，你能看到春天在你眼前长出来。

这条路值得走下去。我希望我不是一个人走。

如果你愿意一起，仓库见。

— luo0412

---

## 附录：参考资料

- GitHub: <https://github.com/luo0412/coolma>
- 架构文档: `.agents/skills/rune-echo-design/`
- 16 张内置 echo: `src/components/echo/echoBuiltins/`
- 14 个 rune 模板: `src/components/rune/runeTemplates/`
- 测试护城河: 11 个 Jest 套件，约 557 个用例