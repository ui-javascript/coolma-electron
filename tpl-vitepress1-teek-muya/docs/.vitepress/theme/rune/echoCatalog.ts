import pack from './echo-catalog.json'

export interface EchoCard {
  name: string
  desc?: string
  color?: string
  category?: string
  field?: string
}

const echoes = ((pack as { echoes?: EchoCard[] }).echoes || []).slice()

export function findEcho(name: string): EchoCard | null {
  const key = String(name || '').trim()
  return echoes.find(item => String(item.name || '').trim() === key) || null
}

export function listEchoes(): EchoCard[] {
  return echoes
}
