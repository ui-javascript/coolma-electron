const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
// Demo stubs are fixtures, not independently installed packages.
const manifests = tracked.filter(file => /(^|\/)package\.json$/.test(file) && !file.startsWith('demo-vue2-vite-muya/stubs/'))
const pnpm = process.env.npm_execpath
assert.ok(pnpm, 'Run this check with pnpm run verify:workspace')
const command = /\.[cm]?js$/.test(pnpm) ? process.execPath : pnpm
const args = [...(command === pnpm ? [] : [pnpm]), 'list', '-r', '--depth', '-1', '--json']
const projects = JSON.parse(execFileSync(command, args, { cwd: root, encoding: 'utf8' }))
const members = new Set(projects.map(project => path.resolve(project.path)))
const lock = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8').replace(/\r\n/g, '\n').split('\nimporters:\n').at(-1).split('\npackages:\n')[0]
const importers = new Set([...lock.matchAll(/^  ([^ ].*?):(?:\s|$)/gm)].map(match => match[1].replace(/^['"]|['"]$/g, '')))

for (const manifest of manifests) {
  const directory = path.dirname(manifest)
  const json = JSON.parse(readFileSync(path.join(root, manifest), 'utf8'))
  assert.ok(members.has(path.resolve(root, directory)), manifest + ' is missing from the root workspace')
  assert.ok(importers.has(directory.replaceAll('\\', '/')), manifest + ' is missing from the root lockfile')
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(json[group] || {})) {
      if (projects.some(project => project.name === name)) {
        assert.ok(version.startsWith('workspace:'), manifest + ': ' + name + ' must use workspace:')
      }
    }
  }
  if (directory !== '.') {
    for (const file of ['pnpm-workspace.yaml', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json']) {
      assert.ok(!existsSync(path.join(root, directory, file)), directory + '/' + file + ' must be managed at the root')
    }
    assert.ok(!json.packageManager, manifest + ' must inherit the root packageManager')
  }
}
assert.equal(members.size, manifests.length, 'Unexpected or untracked workspace members')

for (const [directory, packages, major] of [
  ['desktop-vue2', ['quasar', 'vue-template-compiler', '@vue/vue2-jest'], 2],
  ['tpl-vuepress1-voding-muya', ['vue', 'vue-template-compiler'], 2],
  ['desktop-vue3/frontend', ['vue', 'quasar'], 3]
]) {
  const appRequire = createRequire(path.join(root, directory, 'package.json'))
  for (const name of packages) {
    const dependencyRequire = createRequire(appRequire.resolve(name + '/package.json'))
    const vueFile = dependencyRequire.resolve('vue/package.json')
    const vue = dependencyRequire(vueFile)
    assert.ok(vueFile.startsWith(root + path.sep), name + ' resolves outside the workspace')
    assert.equal(Number(vue.version.split('.')[0]), major, directory + ': ' + name + ' resolved the wrong Vue')
  }
}
console.log('Verified ' + manifests.length + ' workspace projects, shared lockfile, local links, and Vue 2/3 resolution.')
