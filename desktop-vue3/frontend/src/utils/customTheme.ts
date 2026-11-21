/**
 * 自定义主题 CSS 注入层。
 *
 * 主题目录里的 CSS 是用户自己写的整份样式表，选择后注入到 `<head>` 最后一个
 * `<style>`；切回默认时整块移除，保证不会留下半套样式。
 */
export const CUSTOM_THEME_STYLE_ID = 'coolma-custom-theme';

export function applyCustomThemeCss(css: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  let style = document.getElementById(CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = CUSTOM_THEME_STYLE_ID;
    style.dataset.source = 'custom-theme';
    document.head.appendChild(style);
  }
  if (style.textContent !== css) {
    style.textContent = css;
  }
}

export function removeCustomThemeCss(): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.getElementById(CUSTOM_THEME_STYLE_ID)?.remove();
}
