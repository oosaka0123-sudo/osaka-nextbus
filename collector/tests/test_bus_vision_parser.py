"""
collector.bus_vision.parser のテスト。

collector/tests/fixtures/bus_vision_html/ 配下の合成HTML(実際の
Bus-Visionのデータは一切含まない、parser.py検証専用のフィクスチャ)
だけを使い、ネットワークアクセスは一切行わない。

ここで使う SelectorConfig もフィクスチャHTML専用のものであり、
実際のBus-Vision向けの値ではない(collector/bus_vision/selectors.py
は実サイト向けの既定値を持たない設計のため、テスト側で組み立てる)。
"""
import unittest
from pathlib import Path

from collector.bus_vision.parser import ParseError, parse_diagram_detail
from collector.bus_vision.selectors import SelectorConfig

FIXTURES = Path(__file__).parent / "fixtures" / "bus_vision_html"

# フィクスチャHTML専用のセレクタ設定(実際のBus-Vision向けではない)
FIXTURE_SELECTORS = SelectorConfig(
    stop_name=("div", "stop-name"),
    route_block=("div", "route-block"),
    line_no=("span", "line-no"),
    destination=("span", "destination"),
    time_cell=("li", "time-cell"),
)

FIXTURE_SELECTORS_WITH_CALENDAR_LABEL = SelectorConfig(
    stop_name=("div", "stop-name"),
    route_block=("div", "route-block"),
    line_no=("span", "line-no"),
    destination=("span", "destination"),
    time_cell=("li", "time-cell"),
    calendar_label=("div", "calendar-label"),
)


def _read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class ParserTest(unittest.TestCase):
    def test_extracts_stop_name_line_no_destination_and_times(self):
        records = parse_diagram_detail(
            _read("weekday.html"),
            selector_config=FIXTURE_SELECTORS,
            source_url="https://example.invalid/diagramDetail.html?stopCd=1&poleCd=1&dateDivCd=1",
            fetched_at="2026-08-29T09:00:00+09:00",
            calendar_hint="weekday",
        )
        self.assertTrue(all(r.stop_name == "テスト停留所1" for r in records))
        line_nos = {r.line_no for r in records}
        self.assertEqual(line_nos, {"27号", "37号"})
        destinations = {r.headsign for r in records}
        self.assertEqual(destinations, {"なんば行", "住吉方面行"})

    def test_midnight_crossing_time_is_extracted_as_is(self):
        records = parse_diagram_detail(
            _read("weekday.html"),
            selector_config=FIXTURE_SELECTORS,
            source_url="https://example.invalid/x",
            fetched_at="2026-08-29T09:00:00+09:00",
            calendar_hint="weekday",
        )
        times = [r.departure_time for r in records if r.line_no == "27号"]
        self.assertIn("24:10", times)

    def test_calendar_hint_is_used_as_service_when_no_label_selector(self):
        records = parse_diagram_detail(
            _read("saturday.html"),
            selector_config=FIXTURE_SELECTORS,
            source_url="https://example.invalid/x",
            fetched_at="2026-08-29T09:00:00+09:00",
            calendar_hint="saturday",
        )
        self.assertTrue(all(r.service == "saturday" for r in records))

    def test_calendar_label_selector_overrides_hint_when_present(self):
        records = parse_diagram_detail(
            _read("with_calendar_label.html"),
            selector_config=FIXTURE_SELECTORS_WITH_CALENDAR_LABEL,
            source_url="https://example.invalid/x",
            fetched_at="2026-08-29T09:00:00+09:00",
            calendar_hint="should-be-overridden",
        )
        self.assertTrue(all(r.service == "休日" for r in records))

    def test_missing_calendar_hint_and_label_raises(self):
        with self.assertRaises(ParseError):
            parse_diagram_detail(
                _read("weekday.html"),
                selector_config=FIXTURE_SELECTORS,
                source_url="https://example.invalid/x",
                fetched_at="2026-08-29T09:00:00+09:00",
                # calendar_hint省略、calendar_labelセレクタも無し
            )

    def test_no_route_blocks_raises_parse_error_not_empty_list(self):
        with self.assertRaises(ParseError):
            parse_diagram_detail(
                _read("broken_no_route_blocks.html"),
                selector_config=FIXTURE_SELECTORS,
                source_url="https://example.invalid/x",
                fetched_at="2026-08-29T09:00:00+09:00",
                calendar_hint="weekday",
            )

    def test_unparsable_time_cell_raises_instead_of_guessing(self):
        with self.assertRaises(ParseError):
            parse_diagram_detail(
                _read("broken_unparsable_time.html"),
                selector_config=FIXTURE_SELECTORS,
                source_url="https://example.invalid/x",
                fetched_at="2026-08-29T09:00:00+09:00",
                calendar_hint="weekday",
            )

    def test_missing_stop_name_raises(self):
        html = '<html><body><div class="route-block"></div></body></html>'
        with self.assertRaises(ParseError):
            parse_diagram_detail(
                html,
                selector_config=FIXTURE_SELECTORS,
                source_url="https://example.invalid/x",
                fetched_at="2026-08-29T09:00:00+09:00",
                calendar_hint="weekday",
            )

    def test_direction_hint_overrides_destination_as_direction(self):
        records = parse_diagram_detail(
            _read("saturday.html"),
            selector_config=FIXTURE_SELECTORS,
            source_url="https://example.invalid/x",
            fetched_at="2026-08-29T09:00:00+09:00",
            calendar_hint="saturday",
            direction_hint="なんば方面",
        )
        self.assertTrue(all(r.direction == "なんば方面" for r in records))
        # headsign(行先)はdirection_hintの影響を受けない
        self.assertTrue(all(r.headsign == "なんば行" for r in records))

    def test_direction_falls_back_to_destination_without_hint(self):
        records = parse_diagram_detail(
            _read("saturday.html"),
            selector_config=FIXTURE_SELECTORS,
            source_url="https://example.invalid/x",
            fetched_at="2026-08-29T09:00:00+09:00",
            calendar_hint="saturday",
        )
        self.assertTrue(all(r.direction == r.headsign for r in records))


if __name__ == "__main__":
    unittest.main()
