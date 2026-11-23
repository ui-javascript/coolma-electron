// src/runeDefinition.ts
var RUNE_TYPE_VUE_SFC = "vue-sfc";
var RUNE_TYPE_MELT_JS = "melt-js";
var MELT_CONFIG_MARKER = "$type";
var MELT_DEP_TYPES = ["unpkg", "github", "custom"];
var MELT_PROP_TYPES = ["string", "number", "boolean", "json"];
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function parseRuneConfigJson(template) {
  if (typeof template !== "string") return null;
  const source = template.trim();
  if (!source || source.charAt(0) !== "{") return null;
  try {
    const parsed = JSON.parse(source);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function isMeltRuneConfig(config) {
  return isRecord(config) && String(config[MELT_CONFIG_MARKER] ?? "") === RUNE_TYPE_MELT_JS;
}
function detectRuneType(template) {
  return isMeltRuneConfig(parseRuneConfigJson(template)) ? RUNE_TYPE_MELT_JS : RUNE_TYPE_VUE_SFC;
}
function normalizeMeltRuneConfig(config = {}) {
  const source = isRecord(config) ? config : {};
  const dep = isRecord(source.dep) ? source.dep : {};
  const depTypeRaw = String(dep.type ?? "unpkg").trim().toLowerCase();
  const depType = MELT_DEP_TYPES.includes(depTypeRaw) ? depTypeRaw : "unpkg";
  const props = isRecord(source.props) ? source.props : {};
  return {
    type: RUNE_TYPE_MELT_JS,
    version: Number(source.version) || 1,
    dep: {
      name: String(dep.name ?? "").trim(),
      type: depType,
      version: String(dep.version ?? "").trim(),
      platform: String(dep.platform ?? "").trim(),
      host: String(dep.host ?? "").trim(),
      requiredExports: Array.isArray(dep.requiredExports) ? dep.requiredExports.map((item) => String(item)) : []
    },
    exportName: String(source.exportName ?? "").trim(),
    valueProp: String(source.valueProp ?? "value").trim() || "value",
    valueEvent: String(source.valueEvent ?? "input").trim() || "input",
    style: isRecord(source.style) ? { ...source.style } : null,
    props
  };
}
function parseMeltRuneConfig(templateOrRune) {
  const template = isRecord(templateOrRune) ? templateOrRune.template : templateOrRune;
  const config = parseRuneConfigJson(template);
  return isMeltRuneConfig(config) ? normalizeMeltRuneConfig(config) : null;
}
function validateMeltRuneConfig(config = {}) {
  const normalized = normalizeMeltRuneConfig(config);
  const errors = [];
  if (!normalized.dep.name) errors.push({ field: "dep.name", message: "\u7F3A\u5C11\u4F9D\u8D56\u5305\u540D" });
  if (normalized.dep.type === "custom" && !normalized.dep.host) {
    errors.push({ field: "dep.host", message: "custom \u6765\u6E90\u9700\u8981\u586B host" });
  }
  if (!normalized.exportName) errors.push({ field: "exportName", message: "\u7F3A\u5C11\u5BFC\u51FA\u7EC4\u4EF6\u540D" });
  Object.entries(normalized.props).forEach(([name, def]) => {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
      errors.push({ field: `props.${name}`, message: "prop \u540D\u4E0D\u662F\u5408\u6CD5\u6807\u8BC6\u7B26" });
    }
    const propType = String(def?.type ?? "string").toLowerCase();
    if (!MELT_PROP_TYPES.includes(propType)) {
      errors.push({
        field: `props.${name}.type`,
        message: `prop \u7C7B\u578B\u53EA\u652F\u6301 ${MELT_PROP_TYPES.join(" / ")}`
      });
    }
  });
  return errors;
}
function listMeltPropDefs(config = {}) {
  const normalized = normalizeMeltRuneConfig(config);
  return Object.entries(normalized.props).map(([name, def]) => {
    const value = isRecord(def) ? def : {};
    return {
      name,
      type: MELT_PROP_TYPES.includes(String(value.type ?? "").toLowerCase()) ? String(value.type).toLowerCase() : "string",
      default: value.default,
      label: value.label ? String(value.label) : name
    };
  });
}
function resolveRuneDefinition(rune = {}) {
  const template = isRecord(rune) ? rune.template : void 0;
  const type = detectRuneType(template);
  if (type !== RUNE_TYPE_MELT_JS) return { type: RUNE_TYPE_VUE_SFC, config: null, errors: [] };
  const config = parseMeltRuneConfig(rune);
  if (!config) {
    return {
      type: RUNE_TYPE_MELT_JS,
      config: null,
      errors: [{ field: "template", message: "melt-js \u5B9A\u4E49\u4E0D\u662F\u5408\u6CD5 JSON" }]
    };
  }
  return { type: RUNE_TYPE_MELT_JS, config, errors: validateMeltRuneConfig(config) };
}

// src/runeSources.ts
var MELT_SOURCE_TYPES = {
  SFTP: "sftp",
  UNPKG: "unpkg",
  GITHUB: "github",
  DIRECT: "direct"
};
var MELT_SOURCE_TYPE_OPTIONS = [
  { value: MELT_SOURCE_TYPES.SFTP, label: "SFTP / \u81EA\u5EFA\u9759\u6001\u6258\u7BA1" },
  { value: MELT_SOURCE_TYPES.UNPKG, label: "unpkg" },
  { value: MELT_SOURCE_TYPES.GITHUB, label: "GitHub Pages" },
  { value: MELT_SOURCE_TYPES.DIRECT, label: "\u76F4\u8FDE\u4EA7\u7269\u5730\u5740" }
];
var MELT_SOURCES_STORAGE_KEY = "melt.rune.sources";
var DIRECT_ENTRY_RE = /\/(?:hel-meta\.json|index\.html)$/i;
function trimSlashes(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}
function stripScope(name) {
  const raw = String(name ?? "").trim();
  const idx = raw.lastIndexOf("/");
  return idx >= 0 ? raw.slice(idx + 1) : raw;
}
function isDirectEntryUrl(url) {
  return DIRECT_ENTRY_RE.test(String(url ?? "").trim());
}
function defaultDistDirFor(name) {
  const bare = stripScope(name);
  return /^(?:comps|tpl|demo)-/.test(bare) ? "hel_dist" : "dist";
}
function normalizeRuneSource(source = {}) {
  const warnings = [];
  const name = String(source.name ?? "").trim();
  let type = String(source.type ?? "").trim();
  if (!Object.values(MELT_SOURCE_TYPES).includes(type)) {
    type = MELT_SOURCE_TYPES.SFTP;
    warnings.push(`\u672A\u77E5\u6765\u6E90\u7C7B\u578B\u300C${source.type ?? ""}\u300D\uFF0C\u5DF2\u6309 sftp \u5904\u7406`);
  }
  const base = trimSlashes(source.base);
  if (type !== MELT_SOURCE_TYPES.UNPKG && !base) {
    warnings.push("\u8BE5\u6765\u6E90\u9700\u8981\u586B\u5199\u7AD9\u70B9\u6839\u5730\u5740");
  }
  if (base && isDirectEntryUrl(base)) {
    type = MELT_SOURCE_TYPES.DIRECT;
  }
  const rawVersion = String(source.version ?? "").trim();
  if (rawVersion && type !== MELT_SOURCE_TYPES.UNPKG) {
    warnings.push("\u8BE5\u6765\u6E90\u4E0D\u652F\u6301\u7248\u672C\u76EE\u5F55\uFF0Cversion \u5DF2\u5FFD\u7565\uFF08\u7248\u672C\u7531\u5BF9\u65B9\u90E8\u7F72\u8DEF\u5F84\u51B3\u5B9A\uFF09");
  }
  const version = type === MELT_SOURCE_TYPES.UNPKG ? rawVersion : "";
  const distDir = String(source.distDir ?? "").trim() || defaultDistDirFor(name);
  return {
    id: String(source.id ?? "").trim() || `${name || "source"}:${type}`,
    name,
    type,
    base,
    version,
    distDir,
    enabled: source.enabled !== false,
    note: String(source.note ?? "").trim(),
    warnings
  };
}
function buildSourceEntryUrl(source) {
  const src = normalizeRuneSource(source);
  const warnings = src.warnings.slice();
  if (src.type === MELT_SOURCE_TYPES.UNPKG) {
    if (!src.name) {
      warnings.push("unpkg \u6765\u6E90\u9700\u8981\u586B\u5199\u7EC4\u4EF6\u540D");
      return { url: "", warnings };
    }
    const ref = src.version ? `${src.name}@${src.version}` : `${src.name}@latest`;
    return { url: `https://unpkg.com/${ref}/${src.distDir}/hel-meta.json`, warnings };
  }
  if (!src.base) return { url: "", warnings };
  if (isDirectEntryUrl(src.base)) return { url: src.base, warnings };
  const pkgPath = src.type === MELT_SOURCE_TYPES.GITHUB ? stripScope(src.name) : src.name;
  if (!pkgPath) {
    warnings.push("\u8BE5\u6765\u6E90\u9700\u8981\u586B\u5199\u7EC4\u4EF6\u540D");
    return { url: "", warnings };
  }
  if (src.type === MELT_SOURCE_TYPES.GITHUB) {
    const lastSegment = src.base.slice(src.base.lastIndexOf("/") + 1);
    if (lastSegment === pkgPath) {
      return { url: `${src.base}/${src.distDir}/hel-meta.json`, warnings };
    }
    return { url: `${src.base}/${pkgPath}/${src.distDir}/hel-meta.json`, warnings };
  }
  return { url: `${src.base}/${pkgPath}/${src.distDir}/hel-meta.json`, warnings };
}
function resolveSourceForDep(sources, depName) {
  const target = String(depName ?? "").trim().toLowerCase();
  if (!target || !Array.isArray(sources)) return null;
  for (let i = sources.length - 1; i >= 0; i -= 1) {
    const raw = sources[i] ?? {};
    if (raw.enabled === false) continue;
    const name = String(raw.name ?? "").trim().toLowerCase();
    if (name === target || stripScope(name) === stripScope(target)) {
      return normalizeRuneSource(raw);
    }
  }
  return null;
}
function resolveDepFromSources(sources, dep = {}) {
  const original = { ...dep ?? {} };
  if (original.host) {
    return { dep: original, source: null, warnings: [] };
  }
  const source = resolveSourceForDep(sources, original.name);
  if (!source) return { dep: original, source: null, warnings: [] };
  const { url, warnings } = buildSourceEntryUrl(source);
  if (!url) {
    return { dep: original, source, warnings: warnings.concat("\u6765\u6E90\u5730\u5740\u4E3A\u7A7A\uFF0C\u56DE\u843D\u5230\u9ED8\u8BA4\u52A0\u8F7D") };
  }
  return {
    dep: {
      ...original,
      type: original.type || source.type,
      host: url,
      // 非 unpkg 来源不写版本：版本由对方部署路径决定
      version: source.type === MELT_SOURCE_TYPES.UNPKG ? original.version || source.version : ""
    },
    source,
    warnings
  };
}
function loadRuneSources() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(MELT_SOURCES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => normalizeRuneSource(item ?? {})) : [];
  } catch {
    return [];
  }
}
function saveRuneSources(sources) {
  const list = Array.isArray(sources) ? sources.map((item) => normalizeRuneSource(item ?? {})) : [];
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MELT_SOURCES_STORAGE_KEY, JSON.stringify(list));
    }
  } catch {
  }
  return list;
}
function createEmptyRuneSource(overrides = {}) {
  return normalizeRuneSource({
    name: "",
    type: MELT_SOURCE_TYPES.SFTP,
    base: "",
    version: "",
    distDir: "",
    enabled: true,
    ...overrides
  });
}

// src/index.ts
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
  MELT_CONFIG_MARKER,
  MELT_DEP_TYPES,
  MELT_PROP_TYPES,
  MELT_SOURCES_STORAGE_KEY,
  MELT_SOURCE_TYPES,
  MELT_SOURCE_TYPE_OPTIONS,
  RUNE_TYPE_MELT_JS,
  RUNE_TYPE_VUE_SFC,
  buildRuneItems,
  buildRunePlaceholderHtml,
  buildSourceEntryUrl,
  createEmptyRuneSource,
  createRuneInsertHandler,
  defaultDistDirFor,
  detectRuneType,
  escapeHtmlAttribute,
  glyphIcon,
  isDirectEntryUrl,
  isMeltRuneConfig,
  listMeltPropDefs,
  loadRuneSources,
  normalizeMeltRuneConfig,
  normalizeRuneSource,
  parseMeltRuneConfig,
  parseRuneConfigJson,
  readInheritFromTemplate,
  resolveDepFromSources,
  resolveRuneDefinition,
  resolveSourceForDep,
  saveRuneSources,
  validateMeltRuneConfig
};
