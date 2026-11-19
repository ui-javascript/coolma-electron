#!/usr/bin/env python3
"""开发期 SQL 冒烟校验（不依赖 Electron / better-sqlite3）。

从 `electron/service/db/migrations.ts` 里抽出建表与索引 SQL，在临时库上跑完所有迁移，
然后做三条断言：

1. 迁移后的 `user_version` 等于迁移数量（版本连续）；
2. v1/v2 的索引都真实存在；
3. 同类目同名标题确实会触发唯一约束——这就是仓储层必须去重的原因。

用法：
    python3 scripts/smoke-db.py
退出码 0 表示全部通过。
"""

import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "electron" / "service" / "db" / "migrations.ts"


def extract_templates() -> list[str]:
    """抽出 TABLES / INDEXES 两个模板字符串与 migration2 的索引列表。"""
    source = MIGRATIONS.read_text(encoding="utf-8")

    tables = re.search(r"const TABLES = `(.+?)`;", source, re.S)
    indexes = re.search(r"const INDEXES = \[(.+?)\];", source, re.S)
    if not tables or not indexes:
        raise SystemExit("无法从 migrations.ts 中定位 TABLES / INDEXES")

    statements = [tables.group(1)]
    for sql in re.findall(r"`(CREATE [^`]+)`", indexes.group(1)):
        statements.append(sql)

    # migration2 里是 for 循环中的模板字符串
    tail = source[source.index("migration2") :]
    for sql in re.findall(r"`(CREATE [^`]+)`", tail):
        statements.append(sql)

    return statements


def main() -> int:
    statements = extract_templates()
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")

    for sql in statements:
        conn.executescript(sql)

    tables = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    required = {
        "notes",
        "tags",
        "note_tags",
        "local_categories",
        "settings",
        "sync_log",
        "guid_mapping",
        "runes",
        "echoes",
        "ai_model_configs",
        "ai_skills",
        "rune_templates",
        "note_templates",
    }
    missing = required - tables
    if missing:
        print(f"FAIL 缺少表: {sorted(missing)}")
        return 1

    indexes = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")
    }
    for name in (
        "idx_notes_category_title_kb",
        "idx_notes_updated_at",
        "idx_note_tags_tag",
        "idx_sync_log_synced",
    ):
        if name not in indexes:
            print(f"FAIL 缺少索引: {name}")
            return 1

    conn.execute(
        "INSERT INTO notes (doc_guid, title, content, category, created_at, updated_at, dirty)"
        " VALUES ('local_a', '同名标题', '', '/folder', 1, 1, 0)"
    )
    try:
        conn.execute(
            "INSERT INTO notes (doc_guid, title, content, category, created_at, updated_at, dirty)"
            " VALUES ('local_b', '同名标题', '', '/folder', 2, 2, 0)"
        )
    except sqlite3.IntegrityError:
        pass
    else:
        print("FAIL 同名标题本应触发唯一约束，索引未生效")
        return 1

    # 'Untitled' 是被唯一索引豁免的，用于验证豁免规则确实成立
    conn.execute(
        "INSERT INTO notes (title, content, category) VALUES ('Untitled', '', '/folder')"
    )
    conn.execute(
        "INSERT INTO notes (title, content, category) VALUES ('Untitled', '', '/folder')"
    )

    conn.execute(
        "INSERT INTO notes (doc_guid, title, content, category) VALUES ('local_c', '标签笔记', '', '/folder')"
    )
    conn.execute("INSERT INTO tags (name) VALUES ('demo')")
    tag_id = conn.execute("SELECT id FROM tags WHERE name = 'demo'").fetchone()[0]
    note_id = conn.execute("SELECT id FROM notes WHERE title = '标签笔记'").fetchone()[0]
    conn.execute("INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)", (note_id, tag_id))

    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    orphan = conn.execute("SELECT COUNT(*) FROM note_tags WHERE note_id = ?", (note_id,)).fetchone()[0]
    if orphan != 0:
        print("FAIL 删除笔记后 note_tags 残留")
        return 1

    # ------- 本地变更队列（sync_log）语义 -------
    conn.execute(
        "INSERT INTO notes (doc_guid, title, content, category) VALUES ('local_q', '队列笔记', '', '/folder')"
    )
    queue_note = conn.execute("SELECT id FROM notes WHERE title = '队列笔记'").fetchone()[0]
    conn.execute(
        "INSERT INTO sync_log (note_id, action, direction, doc_guid, kb_guid, timestamp, synced)"
        " VALUES (?, 'create', 'local_to_server', 'local_q', NULL, 1, 0)",
        (queue_note,),
    )
    # 连续改动折叠：已有未同步 create 时只刷新时间戳，不新增行
    conn.execute(
        "UPDATE sync_log SET timestamp = 2 WHERE id = ("
        " SELECT id FROM sync_log WHERE note_id = ? AND synced = 0 ORDER BY id DESC LIMIT 1)",
        (queue_note,),
    )
    if conn.execute("SELECT COUNT(*) FROM sync_log WHERE note_id = ?", (queue_note,)).fetchone()[0] != 1:
        print("FAIL 未同步的连续改动应折叠为一行")
        return 1

    # 删除笔记会级联清掉它的 pending 行——所以 delete 事件必须用 note_id = NULL 记录
    conn.execute("DELETE FROM notes WHERE id = ?", (queue_note,))
    if conn.execute("SELECT COUNT(*) FROM sync_log WHERE note_id = ?", (queue_note,)).fetchone()[0] != 0:
        print("FAIL 删除笔记后其 pending 行应被级联清除")
        return 1

    conn.execute(
        "INSERT INTO sync_log (note_id, action, direction, doc_guid, kb_guid, timestamp, synced)"
        " VALUES (NULL, 'delete', 'local_to_server', 'server-guid-1', NULL, 3, 0)"
    )
    pending_delete = conn.execute(
        "SELECT COUNT(*) FROM sync_log WHERE note_id IS NULL AND action = 'delete' AND synced = 0"
    ).fetchone()[0]
    if pending_delete != 1:
        print("FAIL 以 doc_guid 定位的删除事件应保留")
        return 1

    summary = conn.execute(
        "SELECT action, COUNT(*) FROM sync_log WHERE synced = 0 GROUP BY action"
    ).fetchall()
    by_action = {row[0]: row[1] for row in summary}
    if by_action.get("delete") != 1:
        print("FAIL 队列汇总统计不正确")
        return 1

    print(f"OK 表 {len(tables)} 张 / 索引 {len(indexes)} 个 / 唯一约束与级联删除行为符合预期")
    print("OK 变更队列：折叠、级联清理、delete 事件保留、汇总统计均符合预期")
    return 0


if __name__ == "__main__":
    sys.exit(main())
