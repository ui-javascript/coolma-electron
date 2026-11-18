# 无边框窗口与自绘标题栏

> 状态：Windows / Linux / macOS 统一使用 frameless window，原生标题栏、菜单栏与窗口按钮全部移除，由 Vue 顶栏自绘。

## 1. 主进程配置

`electron/config/config.default.ts`：

```ts
windowsOption: {
  frame: false,
  titleBarStyle: 'hidden',
  autoHideMenuBar: true,
  // ...
}
```

`electron/preload/lifecycle.ts`：

```ts
Menu.setApplicationMenu(null);   // 删除 File/Edit/View/... 原生菜单
win.setMenuBarVisibility(false); // 双保险，避免 Alt 唤出菜单
```

## 2. 窗口控制 IPC

通道：

```text
controller/window/state            -> { maximized, fullScreen }
controller/window/minimize
controller/window/toggleMaximize
controller/window/close
```

- 主进程 `WindowController` 操作 `getMainWindow()`；
- preload 白名单同步新增 `controller/window/state`；
- renderer 封装在 `frontend/src/services/ipc.ts`。

`state` 用于首次加载和 resize 时同步最大化图标；点击最大化也直接用返回值更新。

## 3. Vue 控件

`frontend/src/components/WindowControls.vue`：

- 三个按钮：最小化 / 最大化-还原 / 关闭；
- 关闭 hover 变红，其它按钮使用主题 hover；
- 图标是内联 SVG，不依赖图标字体；
- 只有 `window.coolma` 存在时显示，浏览器预览自动隐藏；
- `resize` 事件 80ms 防抖后重新读取 maximized。

`App.vue` 全局挂载，Home / Settings 共用：

```vue
<div class="app-frame" :class="{ 'has-window-controls': hasControls }">
  <router-view />
  <WindowControls />
</div>
```

## 4. 拖拽区域

- `.topbar`、`.settings-header`：`-webkit-app-region: drag`
- 搜索框、顶栏按钮、设置返回按钮、窗口控件：`no-drag`
- 为窗口控件预留 `padding-right: 150px`，避免盖住状态/设置按钮
- 文字区域 `user-select: none`，搜索框恢复 `text`

## 5. 验证

- 窗口截图无原生标题栏、无 File/Edit 菜单；
- 顶栏右侧 3 个自绘按钮；
- 最大化 → `state.maximized=true`，图标切为“还原”；
- 再次点击 → 恢复 `false`；
- 关闭按钮退出应用，日志出现 `window-all-closed quit`；
- `.topbar` computed `-webkit-app-region: drag`，搜索/控件为 `no-drag`；
- 设置页同样有控件与拖拽区。

## 6. 已知限制

- 自绘最大化按钮不提供 Windows 11 Snap Layouts 悬浮菜单；
- 未做窗口位置/尺寸持久化；
- 未加托盘、关闭到托盘；
- macOS 上自定义按钮替代原生 traffic lights，未做平台差异化位置。
