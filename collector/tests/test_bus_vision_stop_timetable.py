"""`diagram.html` の意味だけを再現する完全合成HTMLのオフラインテスト。

第三者HTML本文は保存しない。class名・発車時刻・detail queryはテスト専用。
公開検索で確認済みなのは `diagram.html` が stopCd/poleCd/strLineList を持つ
停留所/のりば時刻表で、各発車時刻から便詳細へ進めるというページの役割だけ。
"""
import unittest

from collector.bus_vision.identifiers import extract_stop_timetable_identifiers
from collector.bus_vision.parser import ParseError
from collector.bus_vision.selectors import StopTimetableSelectorConfig
from collector.bus_vision.stop_timetable import parse_stop_timetable


OBSERVED_URL_1 = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=20&stopCd=3&strLineList=43-2-1"
)
OBSERVED_URL_2 = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=90&stopCd=804&strLineList=55-1-1"
)

# DOM/class名・時刻・detail queryはテスト専用の合成値。
STOP_TIMETABLE_HTML = """
<html><body>
  <div class="departure">
    <span class="time">06:10</span>
    <a class="detail" href="diagramDetail.html?corpCd=1&amp;diaCd=synthetic-1">便詳細</a>
  </div>
  <div class="departure">
    <span class="time">07:25</span>
    <a class="detail" href="/osakacitybus/view/diagramDetail.html?corpCd=1&amp;diaCd=synthetic-2">便詳細</a>
  </div>
</body></html>
"""

SELECTORS = StopTimetableSelectorConfig(
    departure_item=("div", "departure"),
    time_cell=("span", "time"),
    detail_link=("a", "detail"),
)


class StopTimetableIdentifierTest(unittest.TestCase):
    def test_observed_diagram_url_identifiers_are_extracted(self):
        ids = extract_stop_timetable_identifiers(OBSERVED_URL_1)
        self.assertTrue(ids.has_stop_identity())
        self.assertEqual(ids.stop_cd, "3")
        self.assertEqual(ids.pole_cd, "20")
        self.assertEqual(ids.str_line_list, "43-2-1")
        self.assertEqual(ids.lang, "0")

    def test_second_observed_url_keeps_values_raw(self):
        ids = extract_stop_timetable_identifiers(OBSERVED_URL_2)
        self.assertTrue(ids.has_stop_identity())
        self.assertEqual(ids.stop_cd, "804")
        self.assertEqual(ids.pole_cd, "90")
        self.assertEqual(ids.str_line_list, "55-1-1")

    def test_missing_stop_identity_remains_none(self):
        ids = extract_stop_timetable_identifiers(
            "https://example.invalid/diagram.html?stopCd=3"
        )
        self.assertFalse(ids.has_stop_identity())
        self.assertEqual(ids.stop_cd, "3")
        self.assertIsNone(ids.pole_cd)
        self.assertIsNone(ids.str_line_list)


class StopTimetableParserTest(unittest.TestCase):
    def test_departures_and_relative_detail_links_are_enumerated(self):
        departures = parse_stop_timetable(
            STOP_TIMETABLE_HTML,
            selector_config=SELECTORS,
            source_url=OBSERVED_URL_1,
        )

        self.assertEqual([d.departure_time for d in departures], ["06:10", "07:25"])
        self.assertEqual(
            departures[0].detail_url,
            "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?corpCd=1&diaCd=synthetic-1",
        )
        self.assertEqual(
            departures[1].detail_url,
            "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?corpCd=1&diaCd=synthetic-2",
        )
        self.assertTrue(all(d.source_url == OBSERVED_URL_1 for d in departures))

    def test_missing_time_aborts_entire_page(self):
        broken = STOP_TIMETABLE_HTML.replace(">06:10<", ">未定<")
        with self.assertRaises(ParseError):
            parse_stop_timetable(
                broken,
                selector_config=SELECTORS,
                source_url=OBSERVED_URL_1,
            )

    def test_missing_href_aborts_entire_page(self):
        broken = STOP_TIMETABLE_HTML.replace(
            'href="diagramDetail.html?corpCd=1&amp;diaCd=synthetic-1"',
            "",
        )
        with self.assertRaises(ParseError):
            parse_stop_timetable(
                broken,
                selector_config=SELECTORS,
                source_url=OBSERVED_URL_1,
            )

    def test_cross_origin_detail_link_is_rejected(self):
        broken = STOP_TIMETABLE_HTML.replace(
            "diagramDetail.html?corpCd=1&amp;diaCd=synthetic-1",
            "https://example.invalid/diagramDetail.html?diaCd=synthetic-1",
        )
        with self.assertRaises(ParseError):
            parse_stop_timetable(
                broken,
                selector_config=SELECTORS,
                source_url=OBSERVED_URL_1,
            )

    def test_no_departure_rows_raises_instead_of_returning_empty(self):
        with self.assertRaises(ParseError):
            parse_stop_timetable(
                "<html><body><p>no rows</p></body></html>",
                selector_config=SELECTORS,
                source_url=OBSERVED_URL_1,
            )

    def test_invalid_source_url_is_rejected_before_returning_candidate(self):
        with self.assertRaises(ParseError):
            parse_stop_timetable(
                STOP_TIMETABLE_HTML,
                selector_config=SELECTORS,
                source_url="not-an-http-url",
            )


if __name__ == "__main__":
    unittest.main()
