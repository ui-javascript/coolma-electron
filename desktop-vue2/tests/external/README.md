# 外部项目契约测试

主仓库的 `pnpm verify` 会运行自身的单测和冒烟测试，包括桌面端的微应用 IPC 桥。外部项目的契约测试在有相应源码时单独运行。

Vue 2 SFC Playground 已从主仓库移出。把独立项目放在仓库根目录的 `_plugins/vue2-sfc-playground/`，确认其中存在 `src/parseClient.core.cjs` 后，在根目录运行：

```sh
pnpm --filter desktop-vue2 run verify:playground
```

这组测试检查 Playground 客户端的请求配对、超时清理和错误透传。缺少外部源码时，该命令会报出所需文件路径。
