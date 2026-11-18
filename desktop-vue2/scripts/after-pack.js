// scripts/after-pack.js
// electron-builder afterPack 钩子：裁剪 Electron 多余文件
const path = require('path')
const fs = require('fs')

module.exports = function afterPack(context) {
  const { appOutDir, packager } = context
  const platform = packager.platform.name // 'mac', 'windows', or 'linux'

  console.log('\n' + '='.repeat(60))
  console.log('[afterPack] 开始裁剪...')
  console.log('[afterPack] 平台:', platform)
  console.log('='.repeat(60) + '\n')

  let totalRemovedFiles = 0
  let totalRemovedSize = 0

  // ─── 确定关键路径 ───
  let resourcesPath
  let localesPath
  let unpackedPath

  if (platform === 'mac') {
    const appBundlePath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)
    resourcesPath = path.join(appBundlePath, 'Contents', 'Resources')
    localesPath = path.join(appBundlePath, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Resources', 'locales')
    unpackedPath = path.join(resourcesPath, 'app.asar.unpacked')
  } else if (platform === 'windows') {
    resourcesPath = path.join(appOutDir, 'resources')
    localesPath = path.join(appOutDir, 'locales')
    unpackedPath = path.join(resourcesPath, 'app.asar.unpacked')
  } else {
    resourcesPath = path.join(appOutDir, 'resources')
    localesPath = path.join(resourcesPath, 'locales')
    unpackedPath = path.join(resourcesPath, 'app.asar.unpacked')
  }

  // ════════════════════════════════════════
  // 第一部分：裁剪 locales
  // ════════════════════════════════════════
  const localeResult = trimLocales(localesPath)
  totalRemovedFiles += localeResult.count
  totalRemovedSize += localeResult.size

  // ════════════════════════════════════════
  // 第二部分：删除调试文件和 crashpad
  // ════════════════════════════════════════
  const debugResult = cleanDebugFiles(resourcesPath, appOutDir, platform)
  totalRemovedFiles += debugResult.count
  totalRemovedSize += debugResult.size

  // ════════════════════════════════════════
  // 第三部分：深度清理 app.asar.unpacked 目录
  // ════════════════════════════════════════
  if (fs.existsSync(unpackedPath)) {
    console.log(`\n[afterPack] 📁 清理 app.asar.unpacked: ${unpackedPath}`)
    console.log('-'.repeat(60))

    const unpackedResult = deepCleanDirectory(unpackedPath)
    totalRemovedFiles += unpackedResult.count
    totalRemovedSize += unpackedResult.size
  }

  // ════════════════════════════════════════
  // 输出统计报告
  // ════════════════════════════════════════
  console.log('\n' + '='.repeat(60))
  console.log('[afterPack] ✅ 裁剪完成！')
  console.log(`[afterPack] 📊 总计删除: ${totalRemovedFiles} 个文件`)
  console.log(`[afterPack] 💾 节省空间: ${formatSize(totalRemovedSize)}`)
  console.log('='.repeat(60) + '\n')
}

// ──────────────────────────────────────────────
// 功能函数
// ──────────────────────────────────────────────

function trimLocales(localesPath) {
  let count = 0
  let size = 0

  if (!fs.existsSync(localesPath)) {
    return { count, size }
  }

  const whitelist = ['en-US.pak', 'en.pak', 'zh-CN.pak']
  const files = fs.readdirSync(localesPath)

  files.forEach((f) => {
    if (!whitelist.includes(f)) {
      const fullPath = path.join(localesPath, f)
      try {
        const stat = fs.statSync(fullPath)
        fs.unlinkSync(fullPath)
        count++
        size += stat.size
      } catch (e) {}
    }
  })

  console.log(`[afterPack] ✂️  locales: 删除 ${count} 个 (${formatSize(size)}), 保留 en-US/en/zh-CN`)
  return { count, size }
}

function cleanDebugFiles(resourcesPath, appOutDir, platform) {
  let count = 0
  let size = 0

  // debug.log
  const debugLog = path.join(resourcesPath, 'debug.log')
  if (safeDelete(debugLog)) count++

  // crashpad (macOS)
  if (platform === 'mac') {
    if (safeDeleteDir(path.join(resourcesPath, 'crashpad'))) count++
  }

  // crashpad & fmod (Windows)
  if (platform === 'windows') {
    if (safeDelete(path.join(resourcesPath, 'crashpad_handler.exe'))) count++
    if (safeDeleteDir(path.join(resourcesPath, 'Crashpad'))) count++
    if (safeDelete(path.join(appOutDir, 'fmod.dll'))) count++

    // Squirrel 更新器
    ['Update.exe', 'Update.com'].forEach(exe => {
      if (safeDelete(path.join(resourcesPath, exe))) count++
    })
  }

  console.log(`[afterPack] 🧹 调试文件: 删除 ${count} 个`)
  return { count, size: 0 }
}

function deepCleanDirectory(rootDir) {
  let totalCount = 0
  let totalSize = 0

  // 要删除的文件模式
  const deletePatterns = [
    /^readme$/i,
    /^license$/i,
    /^changelog$/i,
    /^contributing$/i,
    /^authors$/i,
    /^history$/i,
    /^todo$/i,
    /\.test\.js$/i,
    /\.spec\.js$/i,
    /\.test\.ts$/i,
    /\.spec\.ts$/i,
  ]

  // 要删除的扩展名
  const deleteExts = ['.md', '.txt', '.d.ts', '.map', '.yml', '.yaml']

  // 要删除的目录
  const deleteDirs = [
    'test', 'tests', '__test__', '__tests__',
    'docs', 'doc',
    'example', 'examples', 'demo', 'demos',
    '.github', '.vscode', '.idea',
    'coverage', 'nyc_output',
    '.cache', 'tmp'
  ]

  function walk(dir) {
    if (!fs.existsSync(dir)) return

    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // 检查是否应该删除此目录
        const shouldDelete = deleteDirs.some(d =>
          entry.name.toLowerCase() === d.toLowerCase()
        )

        if (shouldDelete && entry.name !== 'node_modules') {
          try {
            const result = getDirSize(fullPath)
            rmrf(fullPath)
            totalCount++
            totalSize += result.size
            
            if (totalCount % 50 === 0) {
              console.log(`    🗑️  已删除 ${totalCount} 个项目...`)
            }
          } catch (e) {}
        } else {
          walk(fullPath)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name)
        const name = path.basename(entry.name, ext)

        // 检查是否应该删除此文件
        const shouldDelete =
          deletePatterns.some(p => p.test(entry.name)) ||
          deleteExts.some(e => ext.toLowerCase() === e.toLowerCase()) ||
          (entry.name.startsWith('.') && !entry.name.startsWith('.bin'))

        if (shouldDelete) {
          try {
            const stat = fs.statSync(fullPath)
            fs.unlinkSync(fullPath)
            totalCount++
            totalSize += stat.size
          } catch (e) {}
        }
      }
    }
  }

  walk(rootDir)

  console.log(`  [afterPack] ✅ 完成: ${totalCount} 个文件 (${formatSize(totalSize)})`)
  return { count: totalCount, size: totalSize }
}

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

function safeDelete(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
  } catch (e) {}
  return false
}

function safeDeleteDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      rmrf(dirPath)
      return true
    }
  } catch (e) {}
  return false
}

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file) => {
      const cur = path.join(dir, file)
      if (fs.lstatSync(cur).isDirectory()) {
        rmrf(cur)
      } else {
        fs.unlinkSync(cur)
      }
    })
    fs.rmdirSync(dir)
  }
}

function getDirSize(dir) {
  let size = 0
  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (entry.isFile()) {
          try {
            size += fs.statSync(fullPath).size
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
  walk(dir)
  return { size }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
