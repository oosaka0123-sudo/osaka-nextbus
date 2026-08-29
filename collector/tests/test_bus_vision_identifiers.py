"""
collector.bus_vision.identifiers のテスト。
ネットワークアクセスなし。合成URL文字列のみを使用する
(実際のBus-VisionのURLではない)。
"""
import unittest

from collector.bus_vision.identifiers import extract_query_identifiers


class IdentifiersTest(unittest.TestCase):
    def test_extracts_all_four_known_params(self):
        url = "https://example.invalid/diagramDetail.html?stopCd=12345&poleCd=01&strLineList=27,37&dateDivCd=1"
        ids = extract_query_identifiers(url)
        self.assertEqual(ids.stop_cd, "12345")
        self.assertEqual(ids.pole_cd, "01")
        self.assertEqual(ids.str_line_list, "27,37")
        self.assertEqual(ids.date_div_cd, "1")
        self.assertTrue(ids.is_complete())

    def test_missing_params_are_none_not_guessed(self):
        url = "https://example.invalid/diagramDetail.html?stopCd=12345"
        ids = extract_query_identifiers(url)
        self.assertEqual(ids.stop_cd, "12345")
        self.assertIsNone(ids.pole_cd)
        self.assertIsNone(ids.str_line_list)
        self.assertIsNone(ids.date_div_cd)
        self.assertFalse(ids.is_complete())

    def test_url_with_no_query_string(self):
        ids = extract_query_identifiers("https://example.invalid/diagramDetail.html")
        self.assertEqual(ids, extract_query_identifiers("https://example.invalid/diagramDetail.html?"))
        self.assertIsNone(ids.stop_cd)
        self.assertFalse(ids.is_complete())


if __name__ == "__main__":
    unittest.main()
