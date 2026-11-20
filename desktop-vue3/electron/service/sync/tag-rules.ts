/**
 * 为知标签协议与 v3 本地标签模型之间的纯映射规则。
 *
 * 为知：`doc.tags` 是 `*` 分隔的标签 GUID；标签表每项有 `name` 与 `tagGuid/guid`。
 * v3：`notes.tags` 是逗号分隔的标签名称，`tags` / `note_tags` 都以名称为权威。
 * 因此只在同步边界做 GUID ↔ 名称映射，不改本地表结构。
 */

/** 云端 tags 字段：`*` 分隔，照 vue2 `note.tags.split('*')`。 */
export function splitCloudTagString(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .split('*')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** 本地 tags 字段：逗号分隔的标签名称。 */
export function splitLocalTagNames(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** 把云端 GUID 串翻成本地名称串；不认识的 token 原样保留，避免丢数据。 */
export function cloudTagsToNames(raw: string | null | undefined, guidToName: Map<string, string>): string {
  const names = splitCloudTagString(raw).map((tag) => guidToName.get(tag.toLowerCase()) ?? tag);
  return Array.from(new Set(names)).join(',');
}

/**
 * 把本地名称串翻成云端 GUID 串。
 * 已是云端 GUID 的旧数据（历史拉取）直接保留；其余没有对应云端标签的记入 missing。
 */
export function localNamesToCloudTags(
  raw: string | null | undefined,
  nameToGuid: Map<string, string>,
  knownGuid?: Set<string>,
): { tags: string; missing: string[] } {
  const missing: string[] = [];
  const guids: string[] = [];
  for (const name of splitLocalTagNames(raw)) {
    const guid = nameToGuid.get(name.toLowerCase());
    if (guid) {
      guids.push(guid);
    } else if (knownGuid?.has(name.toLowerCase())) {
      // 旧库里可能已经存了云端 GUID，别再拿它去云端建一个同名标签。
      guids.push(name);
    } else {
      missing.push(name);
    }
  }
  return { tags: Array.from(new Set(guids)).join('*'), missing: Array.from(new Set(missing)) };
}
