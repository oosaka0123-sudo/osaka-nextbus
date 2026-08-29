"""
collector/checkpoint.py
---------------------------------------------------------
SQLiteによる取得済みURLのチェックポイント管理。

- 同一URLの再取得を防止する(重複回避)。
- 収集が途中で中断しても、次回同じDBファイルを指定して起動すれば
  未取得分だけ再開できる(途中再開)。
- 取得URL・取得日時・成否を記録する(取得URL/取得日時記録)。

ネットワークアクセスは一切行わない、純粋なローカルSQLite操作のみ。
"""
import sqlite3

_SCHEMA = """
CREATE TABLE IF NOT EXISTS fetched_urls (
    url TEXT PRIMARY KEY,
    status TEXT NOT NULL,      -- 'ok' | 'error'
    fetched_at TEXT NOT NULL,  -- ISO8601
    detail TEXT
);
"""


class Checkpoint:
    def __init__(self, db_path: str):
        self._conn = sqlite3.connect(db_path)
        self._conn.execute(_SCHEMA)
        self._conn.commit()

    def is_fetched(self, url: str) -> bool:
        """'ok' で記録されているURLのみ取得済みとみなす。
        'error' で終わったURLは次回また再試行の対象になる。"""
        cur = self._conn.execute(
            "SELECT 1 FROM fetched_urls WHERE url = ? AND status = 'ok'", (url,)
        )
        return cur.fetchone() is not None

    def mark(self, url: str, status: str, fetched_at: str, detail: str = "") -> None:
        if status not in ("ok", "error"):
            raise ValueError(f'status は "ok" か "error" のみ指定できます: {status!r}')
        self._conn.execute(
            """
            INSERT INTO fetched_urls (url, status, fetched_at, detail)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
                status = excluded.status,
                fetched_at = excluded.fetched_at,
                detail = excluded.detail
            """,
            (url, status, fetched_at, detail),
        )
        self._conn.commit()

    def pending(self, urls) -> list:
        """未取得(または前回エラー)のURLだけを、渡した順序を保って返す。"""
        return [u for u in urls if not self.is_fetched(u)]

    def close(self) -> None:
        self._conn.close()
