"""
collector.checkpoint.Checkpoint のテスト。
一時SQLiteファイルのみを使い、ネットワークアクセスは一切行わない。
"""
import os
import tempfile
import unittest

from collector.checkpoint import Checkpoint


class CheckpointTest(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".sqlite3")
        os.close(fd)
        self.cp = Checkpoint(self.path)

    def tearDown(self):
        self.cp.close()
        os.remove(self.path)

    def test_unfetched_url_is_pending(self):
        self.assertFalse(self.cp.is_fetched("https://example.invalid/a"))
        self.assertEqual(
            self.cp.pending(["https://example.invalid/a"]), ["https://example.invalid/a"]
        )

    def test_marking_ok_prevents_refetch(self):
        self.cp.mark("https://example.invalid/a", "ok", "2026-08-29T09:00:00+09:00")
        self.assertTrue(self.cp.is_fetched("https://example.invalid/a"))
        self.assertEqual(
            self.cp.pending(["https://example.invalid/a", "https://example.invalid/b"]),
            ["https://example.invalid/b"],
        )

    def test_marking_error_still_allows_retry_on_resume(self):
        # エラーで終わったURLは「取得成功」扱いにしないため、再開時に再試行対象として残る
        self.cp.mark("https://example.invalid/a", "error", "2026-08-29T09:00:00+09:00", detail="500")
        self.assertFalse(self.cp.is_fetched("https://example.invalid/a"))
        self.assertEqual(self.cp.pending(["https://example.invalid/a"]), ["https://example.invalid/a"])

    def test_reopening_same_db_path_preserves_state_for_resume(self):
        self.cp.mark("https://example.invalid/a", "ok", "2026-08-29T09:00:00+09:00")
        self.cp.close()
        self.cp = Checkpoint(self.path)  # 別プロセス・別実行での再開を模す
        self.assertTrue(self.cp.is_fetched("https://example.invalid/a"))

    def test_invalid_status_is_rejected(self):
        with self.assertRaises(ValueError):
            self.cp.mark("https://example.invalid/a", "maybe", "2026-08-29T09:00:00+09:00")


if __name__ == "__main__":
    unittest.main()
