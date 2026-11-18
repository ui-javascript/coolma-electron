# 云函数模块挂载约定

本目录下的 `*CloudFn.js` 文件会被 `src/boot/globalGlobals.js` 通过
`require.context` 自动扫描，挂到 `Vue.prototype.$cloudfns`。

## 命名

- 文件名必须以 `CloudFn.js` 结尾（如 `VkFilesCloudFn.js` / `BspAppDemoCloudFn.js`）
- 首字母大写驼峰，仅表示"这是一个云函数模块"，不参与拼接到 `$cloudfns` 的 key 名
- 挂到 `$cloudfns` 时 key 取文件 base 名的首字母小写形式：
  - `VkFilesCloudFn.js` → `this.$cloudfns.vkFiles`
  - `BspAppDemoCloudFn.js` → `this.$cloudfns.bspAppDemo`

## 导出约定

每个文件**只用具名 export**，整个模块的所有具名 export 合并挂到对应 namespace：

```js
// src/cloudfns/VkFilesCloudFn.js
export async function listFiles (kbGuid) { ... }
export async function uploadFile (kbGuid, file) { ... }
export const CONFIG_KEY = 'vkfiles.config'
```

调用：

```js
this.$cloudfns.vkFiles.listFiles(kbGuid)
this.$cloudfns.vkFiles.uploadFile(kbGuid, file)
```

## 与现有 service 的关系

`src/services/cloud/*Service.js`（CloudFunctionProvider / VkFilesService /
BspAppDemoService 等）是当前在跑的底层 service，本目录是上层"业务云函数模块"
的归宿——后续稳定后可按领域整体迁过来，迁移期间 service 仍继续使用，不破坏
现有调用链路。

## 当前状态

试验阶段（参照 `.cursor/rules/rune-echo-cloudfn-experimental.mdc`）。本目录
当前为空，仅作为命名约定占位。等云函数模块整体成熟后，按上面命名规范往里
新增 `*CloudFn.js` 文件即可，无需修改 boot。