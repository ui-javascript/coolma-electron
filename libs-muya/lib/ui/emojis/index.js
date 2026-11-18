/**
 * [Fuzzaldrin was used here for fuzzy search, replaced with native includes-based filter]
 * Original fuzzaldrin usages:
 *   import { filter } from 'fuzzaldrin'
 *   filter(arr, text, { key: 'search' }) → customFilterByKey(arr, text, 'search')
 * Dependencies removed: fuzzaldrin
 */
import emojis from './emojisJson'
import { CLASS_OR_ID } from '../../config'

const emojisForSearch = {}

for (const emoji of emojis) {
  const newEmoji = Object.assign({}, emoji, { search: [...emoji.aliases, ...emoji.tags].join(' ') })
  if (emojisForSearch[newEmoji.category]) {
    emojisForSearch[newEmoji.category].push(newEmoji)
  } else {
    emojisForSearch[newEmoji.category] = [newEmoji]
  }
}

/**
 * check if one emoji code is in emojis, return undefined or found emoji
 */
export const validEmoji = text => {
  return emojis.find(emoji => {
    return emoji.aliases.includes(text)
  })
}

/**
 * check edit emoji
 */

export const checkEditEmoji = node => {
  if (node && node.classList.contains(CLASS_OR_ID.AG_EMOJI_MARKED_TEXT)) {
    return node
  }
  return false
}

/**
 * Simple substring-includes filter, replacing fuzzaldrin's fuzzy match.
 * @param {Array} candidates - Array of objects to filter
 * @param {string} text - Search text
 * @param {string} key - Object key to match against
 * @returns {Array} Filtered array (sorted by match position)
 */
const customFilterByKey = (candidates, text, key) => {
  if (!candidates || !text) return candidates || []
  const lower = text.toLowerCase()
  return candidates
    .filter(c => String(c[key]).toLowerCase().includes(lower))
    .sort((a, b) => String(a[key]).toLowerCase().indexOf(lower) - String(b[key]).toLowerCase().indexOf(lower))
}

class Emoji {
  constructor () {
    this.cache = new Map()
  }

  search (text) {
    const { cache } = this
    if (cache.has(text)) return cache.get(text)
    const result = {}

    Object.keys(emojisForSearch).forEach(category => {
      // [Fuzzaldrin] filter(arr, text, { key: 'search' }) → customFilterByKey(arr, text, 'search')
      const list = customFilterByKey(emojisForSearch[category], text, 'search')
      if (list.length) {
        result[category] = list
      }
    })
    cache.set(text, result)
    return result
  }

  destroy () {
    return this.cache.clear()
  }
}

export default Emoji
