# 引擎实机演示

这一页是 **真正跑起来的 Muya 编辑器**，不是截图。

- 引擎：`libs-muya-vue3`（Vue 3 包装层）
- 符文/回响数据构造：`libs-rune-core` / `libs-echo-core` 的 pure 层
- 插入语义：同上，`createRuneInsertHandler` / `createEchoInsertHandler`

也就是说：本文档站与 desktop-vue3 复用同一份「面板数据构造 + 插入语义」实现，
引擎里没有任何符文/回响的领域代码——这正是拆包的目标。

<ClientOnly>
  <MuyaLive />
</ClientOnly>

## 这页怎么工作的

```ts
import { MuyaEditor } from 'libs-muya-vue3';
import { buildEchoItems, createEchoInsertHandler } from 'libs-echo-core';
import { buildRuneItems, createRuneInsertHandler } from 'libs-rune-core';

const editorOptions = {
  // 面板数据源：谁调 buildXxxItems 谁就是数据的主人（桌面端=SQLite，文档站=样例卡片）
  quickInsertProvider: () => ({
    items: {
      符文: buildRuneItems(demoRunes),
      回响: buildEchoItems(demoEchoes),
    },
    echoSectionName: '回响',
  }),
  // 插入语义注册表：引擎只管定位 @ 并调用
  quickInsertTypes: {
    rune: createRuneInsertHandler(),
    echo: createEchoInsertHandler(),
  },
};
```

> 换成 vuepress（Vue 2 + webpack4）时，`libs-muya-vue2`（vue2 引擎）走预编译的 CJS lib，
> `libs-echo-core` / `libs-rune-core` 走 `lib/index.cjs`——同一套接口层。
