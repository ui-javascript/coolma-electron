#!/usr/bin/env node
/**
 * 根据 Tauri 打出的安装包与 .sig 生成 updater 的 latest.json。
 * 协议（Tauri updater 标准）：
 *   { version, notes, pub_date, platforms: { "windows-x86_64": { signature, url } } }
 * url 直接指向 GitHub Release 资产，客户端按 tauri.conf.json 的 pubkey 验签。
 */
const fs = require('fs')
const path = require('path')

function readVersion (rootDir, fallback = '0.0.0') {
  try {
    const conf = JSON.parse(fs.readFileSync(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf8'))
    return conf.version || fallback
  } catch (error) {
    return fallback
  }
}

function selectInstaller (files) {
  // 只签 NSIS 安装包：MSI 走 msiexec，本应用用 passive 模式，更新统一用 setup.exe。
  const installer = files.find(name => /_x64-setup\.exe$/i.test(name) && !name.endsWith('.sig'))
  if (!installer) {
    throw new Error('未找到 NSIS 安装包（*_x64-setup.exe），请先执行带 createUpdaterArtifacts 的构建')
  }
  const signatureFile = `${installer}.sig`
  if (!files.includes(signatureFile)) {
    throw new Error(`缺少签名文件 ${signatureFile}，构建时是否设置了 TAURI_SIGNING_PRIVATE_KEY？`)
  }
  return { installer, signatureFile }
}

function encodeAssetUrl (repo, tag, fileName) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(fileName)}`
}

function readSignature (bundleDir, signatureFile) {
  return fs.readFileSync(path.join(bundleDir, signatureFile), 'utf8').trim()
}

function buildManifest ({ version, notes = '', pubDate, repo, tag, bundleDir }) {
  const files = fs.readdirSync(bundleDir)
  const { installer, signatureFile } = selectInstaller(files)
  return {
    version,
    notes,
    pub_date: pubDate || new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature: readSignature(bundleDir, signatureFile),
        url: encodeAssetUrl(repo, tag, installer)
      }
    }
  }
}

function collectAssets (bundleDir) {
  const files = fs.readdirSync(bundleDir)
  const { installer, signatureFile } = selectInstaller(files)
  return [installer, signatureFile]
}

function parseArgs (argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) continue
    const key = current.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      options[key] = next
      index += 1
    } else {
      options[key] = true
    }
  }
  return options
}

function main () {
  const options = parseArgs(process.argv.slice(2))
  const rootDir = options.root || path.resolve(__dirname, '..')
  const repo = options.repo || 'ui-javascript/coolma-electron'
  const tag = options.tag || 'tauri-latest'
  const bundleDir = options['bundle-dir'] || path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
  const version = options.version || readVersion(rootDir)
  const notes = options['notes-file'] ? fs.readFileSync(options['notes-file'], 'utf8').trim() : (options.notes || '')
  const out = options.out || path.join(rootDir, 'latest.json')

  const manifest = buildManifest({ version, notes, pubDate: options['pub-date'], repo, tag, bundleDir })
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)
  const assets = collectAssets(bundleDir)
  console.log(`[updater] latest.json -> ${out}`)
  console.log(`[updater] version=${manifest.version} assets=${assets.join(', ')}`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(`[updater] ${error.message}`)
    process.exit(1)
  }
}

module.exports = { buildManifest, collectAssets, encodeAssetUrl, readVersion, selectInstaller }
