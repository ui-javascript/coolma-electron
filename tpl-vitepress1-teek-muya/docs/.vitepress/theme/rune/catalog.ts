// 符文目录（VitePress / Vue3 宿主 POC）
//
// 真实博客的 catalog 由导出器从 SQLite 读出；模板里只放演示所需的几条：
// 两条本地 SFC + 一条 melt-js 远程 Vue3 组件。
import pack from './catalog.json'

export interface RuneCard {
  id?: string
  name: string
  desc?: string
  color?: string
  template: string
  [key: string]: unknown
}

const runes = ((pack as { runes?: RuneCard[] }).runes || []).slice()

export function findRune(name: string): RuneCard | null {
  const key = String(name || '').trim()
  return runes.find(item => String(item.name || '').trim() === key) || null
}

export function listRunes(): RuneCard[] {
  return runes
}
