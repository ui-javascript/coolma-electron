function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
function glyphIcon(name, color, fallback = "\u7B26") {
  const glyph = Array.from(String(name || "").trim())[0] ?? fallback;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color || "#7E57C2"}"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" font-weight="700" fill="#fff">${glyph}</text></svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}
function readInheritFromTemplate(template) {
  if (typeof template !== "string" || !template) {
    return void 0;
  }
  const scriptMatch = template.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    return void 0;
  }
  const body = scriptMatch[1];
  const propsIdx = body.indexOf("props");
  if (propsIdx < 0) {
    return void 0;
  }
  const start = body.indexOf("{", propsIdx);
  if (start < 0) {
    return void 0;
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) {
    return void 0;
  }
  const propsBody = body.slice(start + 1, end);
  const match = propsBody.match(/inheritFromPrevious\s*:\s*\{[^}]*?default\s*:\s*(true|false)/);
  if (!match) {
    return void 0;
  }
  return match[1] === "true";
}
function escapeHtmlAttribute(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function randomId() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function buildRunePlaceholderHtml(input) {
  const name = String(input.name || "").trim() || "Rune";
  const text = String(input.text ?? "").trim() || name;
  const value = String(input.value ?? "").trim();
  const id = input.id || randomId();
  const nodeId = input.nodeId || `rune-${randomId()}`;
  return `<div data-rune-name="${escapeHtmlAttribute(name)}" data-rune-id="${escapeHtmlAttribute(id)}" data-rune-node-id="${escapeHtmlAttribute(nodeId)}" data-rune-value="${escapeHtmlAttribute(value)}">${escapeHtmlAttribute(text)}</div>`;
}
function createRuneInsertHandler() {
  return (item, context) => {
    const name = String(item?.meta?.runeName ?? "").trim();
    if (!name) {
      return false;
    }
    const template = String(item?.meta?.insertContent ?? "");
    const inherit = readInheritFromTemplate(template) === true;
    const inline = context.isInlineTrigger ? context.isInlineTrigger() : false;
    const blockText = context.getBlockText ? String(context.getBlockText() ?? "") : "";
    const insertedFromTrigger = blockText.trimStart().startsWith("@");
    let previous = null;
    let value = "";
    if (inherit && (inline || insertedFromTrigger)) {
      previous = context.getPreviousLine ? context.getPreviousLine() : null;
      if (previous?.isPlainText) {
        value = String(previous.text ?? "");
      }
    }
    const ok = context.insertHtmlAtTrigger(buildRunePlaceholderHtml({ name, value }));
    if (!ok) {
      return false;
    }
    if (!inline && previous && previous.removeTarget && context.removeLine) {
      context.removeLine(previous.removeTarget);
    }
    return true;
  };
}
function buildRuneItems(cards, fallbackName = "\u7B26\u6587") {
  return cards.filter((card) => Boolean(card && (card.name || card.id))).map((card) => {
    const name = String(card.name || card.id || "").trim() || fallbackName;
    const template = typeof card.template === "string" ? card.template : "";
    const color = card.color || "#7E57C2";
    return {
      title: () => name,
      subTitle: () => String(card.desc || "") || template.slice(0, 80),
      label: `rune:${card.id || name}`,
      shortCut: "",
      icon: glyphIcon(name, color),
      color,
      searchText: [name, card.desc, template].filter(Boolean).join(" "),
      meta: {
        type: "rune",
        runeTemplateId: card.id || "",
        runeName: name,
        color,
        insertContent: template
      }
    };
  });
}
export {
  buildRuneItems,
  buildRunePlaceholderHtml,
  createRuneInsertHandler,
  escapeHtmlAttribute,
  glyphIcon,
  readInheritFromTemplate
};
