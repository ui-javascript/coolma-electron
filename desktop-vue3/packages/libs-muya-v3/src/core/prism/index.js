/**
 * [Fuzzaldrin was used here for fuzzy search, replaced with native includes-based filter]
 * Original fuzzaldrin usages:
 *   import { filter } from 'fuzzaldrin'
 *   filter(langs, text, { key: 'name' }) → customFilterByKey(langs, text, 'name')
 * Dependencies removed: fuzzaldrin
 */
import Prism from 'prismjs'
import initLoadLanguage, { loadedCache, transfromAliasToOrigin } from './loadLanguage'
import languages from './languages'

const prism = Prism
window.Prism = Prism
/* eslint-disable */
import('prismjs/plugins/keep-markup/prism-keep-markup')
/* eslint-enable */
const langs = []

for (const name of Object.keys(languages)) {
  const lang = languages[name]
  langs.push({
    name,
    ...lang
  })
  if (lang.alias) {
    if (typeof lang.alias === 'string') {
      langs.push({
        name: lang.alias,
        ...lang
      })
    } else if (Array.isArray(lang.alias)) {
      langs.push(...lang.alias.map(a => ({
        name: a,
        ...lang
      })))
    }
  }
}

const loadLanguage = initLoadLanguage(Prism)

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

const search = text => {
  // [Fuzzaldrin] filter(langs, text, { key: 'name' }) → customFilterByKey(langs, text, 'name')
  return customFilterByKey(langs, text, 'name')
}

// pre load latex and yaml and html for `math block` \ `front matter` and `html block`
loadLanguage('latex')
loadLanguage('yaml')

export {
  search,
  loadLanguage,
  loadedCache,
  transfromAliasToOrigin,
  languages
}

export default prism
