// The legacy BlogDeployService is included with the copied renderer. Its Node
// filesystem tools require a separate, scoped native migration.
function unsupported () {
  throw new Error('Tauri 版暂未支持博客目录读写和部署，请使用 Electron 版。')
}

export default {
  existsSync: unsupported,
  writeFile: unsupported,
  writeJson: unsupported,
  ensureDir: unsupported,
  pathExists: unsupported,
  readFile: unsupported
}
