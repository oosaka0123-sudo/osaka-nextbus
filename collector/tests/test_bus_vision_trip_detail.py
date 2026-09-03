"""実Bus-Visionの意味だけを再現した、完全合成HTMLによるオフラインテスト。

第三者HTMLは保存しない。class名はテスト専用でありproduction selectorではない。
公開検索で確認できた `diagramDetail.html` が「1便 + 複数停留所時刻」である
という意味だけをfixtureへ反映する。
"""
import unittest

from collector.bus_vision.identifiers import extract_diagram_detail_identifiers
from collector.bus_vision.parser import ParseError, parse_trip_detail
from collector.bus_vision.selectors import TripDetailSelectorConfig


WEEKDAY_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "corpCd=1&dateDivCd=11&diaCd=4188&lang=0&lineCd=71&"
    "opeYmd=20251217&revYmd=20251201&routeCd=7100&"
    "timetableDateDivCd=-1&updownCd=1"
)
SATURDAY_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "corpCd=1&dateDivCd=13&diaCd=17274&lang=0&lineCd=71&"
    "opeYmd=20250607&revYmd=20250601&routeCd=7100&"
    "timetableDateDivCd=-1&updownCd=1"
)

TRIP_HTML = """
<html><body>
  <div class="route-meta">
    <span class="line-no">71</span>
    <span class="destination">なんば行き</span>
  </div>
  <div class="trip-stop"><span class="time">15:22</span><span class="stop">鶴町四丁目</span></div>
  <div class="trip-stop"><span class="time">15:23</span><span class="stop">鶴町三丁目</span></div>
  <div class="trip-stop"><span class="time">15:24</span><span class="stop">鶴町二丁目</span></div>
  <div class="trip-stop"><span class="time">15:25</span><span class="stop">鶴町一丁目</span></div>
  <div class="trip-stop"><span class="time">15:27</span><span class="stop">昌運橋</span></div>
  <div class="trip-stop"><span class="time">15:59</span><span class="stop">なんば</span></div>
</body></html>
"""

TRIP_SELECTORS = TripDetailSelectorConfig(
    stop_row=("div", "trip-stop"),
    stop_name=("span", "stop"),
    time_cell=("span", "time"),
    line_no=("span", "line-no"),
    destination=("span", "destination"),
)

HINT_ONLY_SELECTORS = TripDetailSelectorConfig(
    stop_row=("div", "trip-stop"),
    stop_name=("span", "stop"),
    time_cell=("span", "time"),
)


class TripDetailParserTest(unittest.TestCase):
    def test_one_trip_becomes_records_for_each_stop(self):
        records = parse_trip_detail(
            TRIP_HTML,
            selector_config=TRIP_SELECTORS,
            source_url=WEEKDAY_URL,
            fetched_at="2026-09-03T11:00:00+09:00",
            calendar_hint="11",
            direction_hint="なんば方面",
        )

        self.assertEqual(len(records), 6)
        tsurumachi = [r for r in records if r.stop_name == "鶴町一丁目"]
        self.assertEqual(len(tsurumachi), 1)
        self.assertEqual(tsurumachi[0].departure_time, "15:25")
        self.assertEqual(tsurumachi[0].line_no, "71")
        self.assertEqual(tsurumachi[0].headsign, "なんば行き")
        self.assertEqual(tsurumachi[0].direction, "なんば方面")
        self.assertEqual(tsurumachi[0].service, "11")

    def test_hints_can_supply_page_level_values_without_guessing_dom(self):
        records = parse_trip_detail(
            TRIP_HTML,
            selector_config=HINT_ONLY_SELECTORS,
            source_url=WEEKDAY_URL,
            fetched_at="2026-09-03T11:00:00+09:00",
            calendar_hint="11",
            line_no_hint="71",
            destination_hint="なんば行き",
        )
        self.assertEqual(records[0].line_no, "71")
        self.assertEqual(records[0].headsign, "なんば行き")

    def test_missing_required_page_value_raises(self):
        with self.assertRaises(ParseError):
            parse_trip_detail(
                TRIP_HTML,
                selector_config=HINT_ONLY_SELECTORS,
                source_url=WEEKDAY_URL,
                fetched_at="2026-09-03T11:00:00+09:00",
                calendar_hint="11",
                # line_no_hint / destination_hint を意図的に省略
            )

    def test_configured_selector_missing_does_not_silently_fallback_to_hint(self):
        bad_selectors = TripDetailSelectorConfig(
            stop_row=("div", "trip-stop"),
            stop_name=("span", "stop"),
            time_cell=("span", "time"),
            line_no=("span", "missing-line"),
            destination=("span", "destination"),
        )
        with self.assertRaises(ParseError):
            parse_trip_detail(
                TRIP_HTML,
                selector_config=bad_selectors,
                source_url=WEEKDAY_URL,
                fetched_at="2026-09-03T11:00:00+09:00",
                calendar_hint="11",
                line_no_hint="71",
            )

    def test_unparsable_stop_time_aborts_entire_page(self):
        broken = TRIP_HTML.replace(">15:25<", ">未定<")
        with self.assertRaises(ParseError):
            parse_trip_detail(
                broken,
                selector_config=TRIP_SELECTORS,
                source_url=WEEKDAY_URL,
                fetched_at="2026-09-03T11:00:00+09:00",
                calendar_hint="11",
            )

    def test_no_stop_rows_raises_instead_of_returning_empty(self):
        html = '<html><body><span class="line-no">71</span><span class="destination">なんば行き</span></body></html>'
        with self.assertRaises(ParseError):
            parse_trip_detail(
                html,
                selector_config=TRIP_SELECTORS,
                source_url=WEEKDAY_URL,
                fetched_at="2026-09-03T11:00:00+09:00",
                calendar_hint="11",
            )


class DiagramDetailIdentifierTest(unittest.TestCase):
    def test_observed_weekday_url_keys_are_extracted(self):
        ids = extract_diagram_detail_identifiers(WEEKDAY_URL)
        self.assertTrue(ids.has_trip_identity())
        self.assertEqual(ids.corp_cd, "1")
        self.assertEqual(ids.date_div_cd, "11")
        self.assertEqual(ids.dia_cd, "4188")
        self.assertEqual(ids.line_cd, "71")
        self.assertEqual(ids.route_cd, "7100")
        self.assertEqual(ids.updown_cd, "1")
        self.assertEqual(ids.timetable_date_div_cd, "-1")

    def test_observed_saturday_url_keeps_raw_date_div_code(self):
        ids = extract_diagram_detail_identifiers(SATURDAY_URL)
        self.assertEqual(ids.date_div_cd, "13")
        self.assertEqual(ids.line_cd, "71")
        self.assertEqual(ids.route_cd, "7100")
        self.assertEqual(ids.updown_cd, "1")

    def test_missing_values_remain_none(self):
        ids = extract_diagram_detail_identifiers(
            "https://example.invalid/diagramDetail.html?lineCd=71"
        )
        self.assertFalse(ids.has_trip_identity())
        self.assertEqual(ids.line_cd, "71")
        self.assertIsNone(ids.dia_cd)
        self.assertIsNone(ids.date_div_cd)


if __name__ == "__main__":
    unittest.main()
