"""
collector.bus_vision.html_dom のテスト。
ネットワークアクセスなし。合成HTML文字列のみを使用する。
"""
import unittest

from collector.bus_vision.html_dom import parse_html


class HtmlDomTest(unittest.TestCase):
    def test_find_by_tag_and_class(self):
        root = parse_html('<div class="a"><span class="b">x</span></div>')
        el = root.find(tag="span", class_="b")
        self.assertIsNotNone(el)
        self.assertEqual(el.get_text(), "x")

    def test_find_all_returns_all_matches_in_order(self):
        root = parse_html('<ul><li class="t">1</li><li class="t">2</li><li class="t">3</li></ul>')
        cells = root.find_all(tag="li", class_="t")
        self.assertEqual([c.get_text() for c in cells], ["1", "2", "3"])

    def test_get_text_concatenates_nested_text(self):
        root = parse_html("<div>a<span>b</span>c</div>")
        div = root.find(tag="div")
        self.assertEqual(div.get_text(), "abc")

    def test_get_text_strip_removes_surrounding_whitespace(self):
        root = parse_html("<div>  hello  </div>")
        div = root.find(tag="div")
        self.assertEqual(div.get_text(strip=True), "hello")

    def test_find_returns_none_when_not_found(self):
        root = parse_html("<div></div>")
        self.assertIsNone(root.find(tag="span"))

    def test_mismatched_closing_tag_does_not_crash(self):
        # 壊れたHTML(閉じタグの対応が取れない)でも例外にならないことを確認する
        root = parse_html("<div><span>x</div>")
        self.assertIsNotNone(root.find(tag="span"))


if __name__ == "__main__":
    unittest.main()
