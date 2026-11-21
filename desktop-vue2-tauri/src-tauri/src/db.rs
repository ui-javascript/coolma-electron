use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use rusqlite::{
    types::{Value as SqlValue, ValueRef},
    Connection,
};
use serde::Serialize;
use serde_json::{Map, Value};

/// 应用数据库：整进程只维持一条连接，所有语句在互斥锁里串行执行。
///
/// 对齐原版 Electron 的 better-sqlite3 形态：同步、单连接、任意 SQL 字符串，
/// 事务语义由调用方发 `BEGIN` / `COMMIT` 控制（同一个连接，跨命令天然连续）。
/// 连接延迟打开，打开失败会作为命令错误返回渲染层，而不是在启动阶段 panic。
pub struct Database {
    path: PathBuf,
    connection: Mutex<Option<Connection>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    changes: u64,
    last_insert_rowid: i64,
}

impl Database {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            connection: Mutex::new(None),
        }
    }

    fn with_connection<T>(
        &self,
        action: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .connection
            .lock()
            .map_err(|_| "数据库连接锁已损坏".to_string())?;
        if guard.is_none() {
            if let Some(parent) = self.path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|error| format!("无法创建数据目录：{error}"))?;
            }
            let connection = Connection::open(&self.path)
                .map_err(|error| format!("无法打开数据库 {}：{error}", self.path.display()))?;
            *guard = Some(connection);
        }
        let connection = guard.as_ref().expect("连接已在上面初始化");
        action(connection)
    }
}

fn to_sql(value: &Value) -> Result<SqlValue, String> {
    match value {
        Value::Null => Ok(SqlValue::Null),
        // sql.js 把布尔当 1/0 落库，这里保持一致，避免老库读出来类型不同。
        Value::Bool(flag) => Ok(SqlValue::Integer(i64::from(*flag))),
        Value::Number(number) => {
            if let Some(integer) = number.as_i64() {
                Ok(SqlValue::Integer(integer))
            } else if let Some(real) = number.as_f64() {
                Ok(SqlValue::Real(real))
            } else {
                Err(format!("无法绑定为数据库参数的数字：{number}"))
            }
        }
        Value::String(text) => Ok(SqlValue::Text(text.clone())),
        other => Err(format!(
            "数据库参数只支持 null / 布尔 / 数字 / 字符串，收到 {}",
            match other {
                Value::Array(_) => "数组",
                Value::Object(_) => "对象",
                _ => "未知类型",
            }
        )),
    }
}

fn to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(integer) => Value::Number(integer.into()),
        ValueRef::Real(real) => serde_json::Number::from_f64(real)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(bytes) => Value::String(String::from_utf8_lossy(bytes).into_owned()),
        // 现有表结构没有 BLOB 列；万一将来有，用无损十六进制串兜底，不做静默截断。
        ValueRef::Blob(bytes) => Value::String(
            bytes
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>(),
        ),
    }
}

fn bind(params: &[Value]) -> Result<Vec<SqlValue>, String> {
    params.iter().map(to_sql).collect()
}

/// 执行查询，按列名转成对象数组（对齐 sql.js `getAsObject()` 的返回形态）。
/// 不返回行的语句（DDL / INSERT）同样走这里，结果是空数组。
pub fn query(
    connection: &Connection,
    sql: &str,
    params: &[Value],
) -> Result<Vec<Map<String, Value>>, String> {
    let bound = bind(params)?;
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("SQL 预编译失败：{error}"))?;
    let columns: Vec<String> = statement
        .column_names()
        .map(|name| name.to_string())
        .collect();
    let mut rows = statement
        .query(rusqlite::params_from_iter(bound))
        .map_err(|error| format!("SQL 执行失败：{error}"))?;
    let mut records = Vec::new();
    while let Some(row) = rows
        .next()
        .map_err(|error| format!("读取结果行失败：{error}"))?
    {
        let mut record = Map::with_capacity(columns.len());
        for (index, column) in columns.iter().enumerate() {
            record.insert(
                column.clone(),
                to_json(
                    row.get_ref(index)
                        .map_err(|error| format!("读取列 {column} 失败：{error}"))?,
                ),
            );
        }
        records.push(record);
    }
    Ok(records)
}

/// 执行语句，返回受影响行数与最后插入 rowid（对齐 sql.js `run` + `getRowsModified`）。
/// 走 `query` 而不是 `execute`，这样 SELECT / PRAGMA 也能跑，与原版 `db.exec` 的宽容度一致。
pub fn run(connection: &Connection, sql: &str, params: &[Value]) -> Result<RunResult, String> {
    query(connection, sql, params)?;
    Ok(RunResult {
        changes: connection.changes(),
        last_insert_rowid: connection.last_insert_rowid(),
    })
}

#[tauri::command]
pub fn db_query(
    database: tauri::State<'_, Database>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    database.with_connection(|connection| query(connection, &sql, &params))
}

#[tauri::command]
pub fn db_run(
    database: tauri::State<'_, Database>,
    sql: String,
    params: Vec<Value>,
) -> Result<RunResult, String> {
    database.with_connection(|connection| run(connection, &sql, &params))
}

/// 数据目录里的库文件路径（与 `data_dir` 拼法一致，单独抽出来便于测试）。
pub fn database_path(data_dir: &Path) -> PathBuf {
    data_dir.join("memocast.db")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory() -> Connection {
        Connection::open_in_memory().expect("open in-memory sqlite")
    }

    fn number(value: &Value) -> f64 {
        value.as_f64().unwrap_or_else(|| panic!("不是数字：{value}"))
    }

    #[test]
    fn creates_schema_and_roundtrips_types() {
        let connection = memory();
        run(
            &connection,
            "CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, score REAL, memo TEXT)",
            &[],
        )
        .expect("create table");
        run(
            &connection,
            "INSERT INTO notes (title, score, memo) VALUES (?, ?, ?)",
            &[
                Value::String("标题".into()),
                Value::Number(serde_json::Number::from_f64(1.5).unwrap()),
                Value::Null,
            ],
        )
        .expect("insert");
        let rows = query(&connection, "SELECT id, title, score, memo FROM notes", &[])
            .expect("select");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["title"], Value::String("标题".into()));
        assert_eq!(number(&rows[0]["score"]), 1.5);
        assert_eq!(rows[0]["memo"], Value::Null);
        assert_eq!(number(&rows[0]["id"]), 1.0);
    }

    #[test]
    fn run_reports_changes_and_last_insert_rowid() {
        let connection = memory();
        run(&connection, "CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT)", &[])
            .expect("create table");
        let first = run(
            &connection,
            "INSERT INTO tags (name) VALUES (?)",
            &[Value::String("a".into())],
        )
        .expect("insert");
        assert_eq!(first.changes, 1);
        assert_eq!(first.last_insert_rowid, 1);
        let second = run(
            &connection,
            "INSERT INTO tags (name) VALUES (?)",
            &[Value::String("b".into())],
        )
        .expect("insert");
        assert_eq!(second.last_insert_rowid, 2);
        let updated = run(&connection, "UPDATE tags SET name = ? WHERE id <= ?", &[
            Value::String("x".into()),
            Value::Number(2.into()),
        ])
        .expect("update");
        assert_eq!(updated.changes, 2);
    }

    #[test]
    fn transaction_state_survives_between_calls() {
        let connection = memory();
        run(&connection, "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)", &[]).expect("create");
        run(&connection, "BEGIN IMMEDIATE", &[]).expect("begin");
        run(
            &connection,
            "INSERT INTO t (v) VALUES (?)",
            &[Value::String("滚".into())],
        )
        .expect("insert");
        run(&connection, "ROLLBACK", &[]).expect("rollback");
        assert_eq!(query(&connection, "SELECT * FROM t", &[]).expect("select").len(), 0);

        run(&connection, "BEGIN IMMEDIATE", &[]).expect("begin");
        run(
            &connection,
            "INSERT INTO t (v) VALUES (?)",
            &[Value::String("留".into())],
        )
        .expect("insert");
        run(&connection, "COMMIT", &[]).expect("commit");
        assert_eq!(query(&connection, "SELECT * FROM t", &[]).expect("select").len(), 1);
    }

    #[test]
    fn binds_booleans_as_one_and_zero() {
        let connection = memory();
        run(&connection, "CREATE TABLE flags (value INTEGER)", &[]).expect("create");
        run(&connection, "INSERT INTO flags (value) VALUES (?)", &[Value::Bool(true)]).expect("insert");
        run(&connection, "INSERT INTO flags (value) VALUES (?)", &[Value::Bool(false)]).expect("insert");
        let rows = query(&connection, "SELECT value FROM flags ORDER BY rowid", &[]).expect("select");
        assert_eq!(number(&rows[0]["value"]), 1.0);
        assert_eq!(number(&rows[1]["value"]), 0.0);
    }

    #[test]
    fn rejects_unknown_sql_and_unsupported_params() {
        let connection = memory();
        let error = query(&connection, "SELECT * FROM missing_table", &[]).unwrap_err();
        assert!(error.contains("SQL 预编译失败"), "unexpected error: {error}");
        let error = run(
            &connection,
            "CREATE TABLE t (v TEXT)",
            &[Value::Array(vec![Value::Null])],
        )
        .unwrap_err();
        assert!(error.contains("只支持"), "unexpected error: {error}");
    }

    #[test]
    fn query_without_params_still_returns_rows() {
        // 回归点：sql.js 无参数走 `db.exec`，有参数走 `prepare`；新实现两条路径合一，
        // PRAGMA 这类「不返回值但也不算查询」的语句也不能报错。
        let connection = memory();
        let rows = query(&connection, "SELECT 1 AS one", &[]).expect("select literal");
        assert_eq!(rows.len(), 1);
        assert_eq!(number(&rows[0]["one"]), 1.0);
        query(&connection, "PRAGMA user_version", &[]).expect("pragma");
    }

    #[test]
    fn database_opens_at_the_expected_file() {
        let dir = std::env::temp_dir().join("coolma-tauri-db-test");
        let _ = std::fs::remove_dir_all(&dir);
        let database = Database::new(database_path(&dir));
        database
            .with_connection(|connection| run(connection, "CREATE TABLE opened (id INTEGER)", &[]))
            .expect("first use opens the file");
        assert!(database_path(&dir).exists(), "库文件应当被创建");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
