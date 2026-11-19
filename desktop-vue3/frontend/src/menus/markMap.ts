/**
 * 思维导图右键菜单（复刻 vue2 contextMenu/markMap）。
 * vue2 里 PNG / SVG 两项被注释掉，只留「另存为 HTML」——这里保持一致。
 */
export function buildMarkMapMenu(input: { htmlReady?: boolean } = {}) {
  return [{ id: 'saveAsHtml', label: '另存为 HTML', enabled: input.htmlReady !== false }];
}
