/**
 * 外链判定：复刻原版主进程 `new-window` 的处理范围。
 *
 * 原版对 http(s) 外链一律 preventDefault，先弹「使用浏览器打开链接！」确认框，
 * 用户点确认才 shell.openExternal；localhost / file 协议直接放行不处理。
 * 这里把同样的判定抽成纯函数，方便单测，也方便 boot 与其它入口复用。
 */
const EXTERNAL_PROTOCOLS = ['http:', 'https:', 'mailto:']

// 应用自身与本地开发服务都算「内部地址」，不弹确认框。
const LOCAL_HOSTS = [
  'localhost',
  '127.0.0.1',
  '[::1]',
  '::1',
  'tauri.localhost',
  'tauri.localhost.'
]

function isLocalHost (hostname) {
  if (!hostname) return false
  return LOCAL_HOSTS.includes(hostname.toLowerCase()) || hostname.toLowerCase().endsWith('.localhost')
}

/**
 * 把待打开的地址解析成「需要走系统浏览器」的绝对 URL；不需要处理时返回 null。
 *
 * @param {string} raw 原始 href / window.open 参数
 * @param {string} [base] 解析相对地址用的基址，通常是 window.location.href
 * @returns {string|null}
 */
export function resolveExternalUrl (raw, base) {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null

  let url
  try {
    url = new URL(value, base || undefined)
  } catch (error) {
    return null
  }

  if (!EXTERNAL_PROTOCOLS.includes(url.protocol)) return null
  // mailto: 没有 host，直接交给系统
  if (url.protocol === 'mailto:') return url.href
  if (isLocalHost(url.hostname)) return null

  // 相对地址已经按 base 解析成绝对地址，若仍与应用同源则属于内部跳转
  if (base) {
    try {
      const current = new URL(base)
      if (current.protocol === url.protocol && current.host === url.host) return null
    } catch (error) { /* base 非法就按外链处理 */ }
  }

  return url.href
}

export default resolveExternalUrl
