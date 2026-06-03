use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create captures table",
            sql: "CREATE TABLE IF NOT EXISTS captures (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            content TEXT NOT NULL,
            content_type TEXT NOT NULL
                CHECK(content_type IN ('table','code','list','prose','mixed')),
            char_count INTEGER NOT NULL,
            app_context TEXT
        );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "index captures by created_at for history ordering",
            sql: "CREATE INDEX IF NOT EXISTS idx_captures_created_at
                  ON captures (created_at DESC);",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_table_and_index_migrations() {
        let m = migrations();
        assert_eq!(m.len(), 2);
        assert_eq!(m[0].version, 1);
        assert_eq!(m[1].version, 2);
    }

    #[test]
    fn second_migration_indexes_created_at() {
        let sql = migrations()[1].sql;
        assert!(sql.contains("CREATE INDEX IF NOT EXISTS idx_captures_created_at"));
        assert!(sql.contains("created_at"));
    }

    #[test]
    fn migration_creates_captures_table() {
        let sql = migrations()[0].sql;
        assert!(sql.contains("CREATE TABLE IF NOT EXISTS captures"));
        assert!(sql.contains("id TEXT PRIMARY KEY"));
        assert!(sql.contains("content TEXT NOT NULL"));
        assert!(sql.contains("content_type TEXT NOT NULL"));
        assert!(sql.contains("char_count INTEGER NOT NULL"));
    }

    #[test]
    fn migration_has_content_type_check_constraint() {
        let sql = migrations()[0].sql;
        assert!(sql.contains("CHECK(content_type IN ('table','code','list','prose','mixed'))"));
    }
}
