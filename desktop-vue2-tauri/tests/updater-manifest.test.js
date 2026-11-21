/* eslint-env jest */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { buildManifest, encodeAssetUrl, selectInstaller } = require('../scripts/make-updater-json')

test('selectInstaller 只认 NSIS 安装包与配套 .sig', () => {
  const files = ['Coolma Tauri_2026.11.5_x64-setup.exe', 'Coolma Tauri_2026.11.5_x64-setup.exe.sig', 'Coolma Tauri_2026.11.5_x64.msi']
  expect(selectInstaller(files)).toEqual({
    installer: 'Coolma Tauri_2026.11.5_x64-setup.exe',
    signatureFile: 'Coolma Tauri_2026.11.5_x64-setup.exe.sig'
  })
  expect(() => selectInstaller(['Coolma Tauri_2026.11.5_x64.msi'])).toThrow('NSIS')
  expect(() => selectInstaller(['Coolma Tauri_2026.11.5_x64-setup.exe'])).toThrow('签名文件')
})

test('encodeAssetUrl 处理带空格的中文文件名', () => {
  expect(encodeAssetUrl('ui-javascript/coolma-electron', 'tauri-latest', 'Coolma Tauri_1.0_x64-setup.exe'))
    .toBe('https://github.com/ui-javascript/coolma-electron/releases/download/tauri-latest/Coolma%20Tauri_1.0_x64-setup.exe')
})

test('buildManifest 生成 Tauri updater 的标准结构', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coolma-updater-'))
  fs.writeFileSync(path.join(dir, 'Coolma Tauri_2026.11.5_x64-setup.exe'), 'binary')
  fs.writeFileSync(path.join(dir, 'Coolma Tauri_2026.11.5_x64-setup.exe.sig'), 'SIGNATURE-CONTENT\n')
  const manifest = buildManifest({
    version: '2026.11.5',
    notes: '本次更新',
    pubDate: '2026-11-21T00:00:00Z',
    repo: 'ui-javascript/coolma-electron',
    tag: 'tauri-latest',
    bundleDir: dir
  })
  expect(manifest.version).toBe('2026.11.5')
  expect(manifest.notes).toBe('本次更新')
  expect(manifest.pub_date).toBe('2026-11-21T00:00:00Z')
  expect(manifest.platforms['windows-x86_64'].signature).toBe('SIGNATURE-CONTENT')
  expect(manifest.platforms['windows-x86_64'].url).toContain('releases/download/tauri-latest/')
  fs.rmSync(dir, { recursive: true, force: true })
})
