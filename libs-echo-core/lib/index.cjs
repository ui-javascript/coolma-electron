var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_exports = {};
__export(index_exports, {
  buildEchoItems: () => buildEchoItems,
  buildEchoPlaceholderMarkup: () => buildEchoPlaceholderMarkup,
  createEchoInsertHandler: () => createEchoInsertHandler,
  echoPlaceholder: () => echoPlaceholder,
  escapeXml: () => escapeXml,
  glyphIcon: () => glyphIcon
});
module.exports = __toCommonJS(index_exports);
function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function glyphIcon(name, color, fallback = "\u56DE") {
  const glyph = Array.from(String(name || "").trim())[0] ?? fallback;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${escapeXml(color)}"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,PingFang SC,Microsoft YaHei,sans-serif" font-weight="700" fill="#fff">${escapeXml(Array.from(glyph)[0]?.toUpperCase() ?? "")}</text></svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}
function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
function echoPlaceholder(name) {
  return `@${name || "\u56DE\u54CD"}{}()`;
}
function escapeEchoAttrValue(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}
function randomId() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function buildEchoPlaceholderMarkup(input) {
  const name = String(input.name || "").trim() || "\u56DE\u54CD";
  const value = String(input.value ?? "");
  const echoId = input.echoId || randomId();
  return `@${name}{echoId: '${escapeEchoAttrValue(echoId)}', value: '${escapeEchoAttrValue(value)}'}()`;
}
function createEchoInsertHandler() {
  return (item, context) => {
    const name = String(item?.meta?.echoName ?? "").trim();
    if (!name) {
      return false;
    }
    const inline = context.isInlineTrigger ? context.isInlineTrigger() : false;
    const blockText = context.getBlockText ? String(context.getBlockText() ?? "") : "";
    const insertedFromTrigger = blockText.trimStart().startsWith("@");
    let value = "";
    if (inline || insertedFromTrigger) {
      const previous = context.getPreviousLine ? context.getPreviousLine() : null;
      if (previous?.isPlainText) {
        value = String(previous.text ?? "");
      }
    }
    return context.replaceAtTrigger(buildEchoPlaceholderMarkup({ name, value }));
  };
}
function buildEchoItems(cards, fallbackName = "\u56DE\u54CD") {
  return cards.filter((card) => Boolean(card && (card.name || card.id))).map((card) => {
    const name = String(card.name || card.id || "").trim() || fallbackName;
    const color = card.color || "#26A69A";
    return {
      title: () => name,
      subTitle: () => String(card.desc || ""),
      label: `echo:${card.id || name}`,
      shortCut: "",
      icon: glyphIcon(name, color),
      color,
      searchText: [name, card.desc, card.anno_source].filter(Boolean).join(" "),
      meta: {
        type: "echo",
        echoName: name,
        echoId: card.id || "",
        color
      }
    };
  });
}
