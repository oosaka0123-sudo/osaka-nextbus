"""
collector.parser のテスト。

diagramDetail.html の実HTML構造は未確認のため、parse_diagram_detail() は
現時点ではプレースホルダ(NotImplementedError送出)である。
このテストは「未実装であること」「呼び出しても何も収集されないこと」
だけを保証する回帰テストであり、実HTMLの解析結果は検証しない
(実装は許可後、実際のページを確認してから行う)。
"""
import unittest

from collector.parser import parse_diagram_detail


class ParserPlaceholderTest(unittest.TestCase):
    def test_parse_diagram_detail_is_not_yet_implemented(self):
        with self.assertRaises(NotImplementedError):
            parse_diagram_detail(
                "<html></html>",
                stop_name="テスト停留所1",
                source_url="https://example.invalid/x",
                fetched_at="2026-08-29T09:00:00+09:00",
            )


if __name__ == "__main__":
    unittest.main()
