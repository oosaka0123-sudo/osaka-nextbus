"""
collector.convert_to_timetable_csv のテスト。

collector/tests/fixtures/ 配下の合成データ(実際のBus-Visionデータは
一切含まない)だけを使い、ネットワークアクセスは一切行わない。
本番の data/stops.json / data/routes.json も参照しない
(CLAUDE.mdの「本番データとテストデータを完全に分離する」方針に合わせている)。
"""
import json
import unittest
from pathlib import Path

from collector.convert_to_timetable_csv import convert, load_route_index, load_stop_index

FIXTURES = Path(__file__).parent / "fixtures"


class ConvertTest(unittest.TestCase):
    def setUp(self):
        self.stop_index = load_stop_index(FIXTURES / "stops.json")
        self.route_index = load_route_index(FIXTURES / "routes.json")
        self.date_div_cd = {"weekday": "1", "saturday": "2", "holiday": "3"}
        self.records = json.loads((FIXTURES / "sample_departures.json").read_text(encoding="utf-8"))

    def test_all_valid_records_convert_without_errors(self):
        rows, errors = convert(self.records, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(errors, [])
        self.assertEqual(len(rows), len(self.records))
        for row in rows:
            self.assertEqual(set(row.keys()), {"routeId", "direction", "destination", "calendar", "time"})

    def test_route_id_matches_existing_routes_json_scheme(self):
        rows, errors = convert(self.records, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(errors, [])
        self.assertIn("test-stop-1__27号", [r["routeId"] for r in rows])
        self.assertIn("test-stop-2__37号", [r["routeId"] for r in rows])

    def test_calendar_codes_are_mapped_to_japanese_calendar_names(self):
        rows, errors = convert(self.records, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(errors, [])
        calendars = {r["calendar"] for r in rows}
        self.assertEqual(calendars, {"weekday", "saturday", "holiday"})

    def test_midnight_crossing_time_passes_through_unchanged(self):
        rows, errors = convert(self.records, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(errors, [])
        self.assertIn("24:10", [r["time"] for r in rows])

    def test_unknown_stop_name_is_reported_as_error_not_guessed(self):
        bad = [{**self.records[0], "stop_name": "存在しない停留所"}]
        rows, errors = convert(bad, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(rows, [])
        self.assertEqual(len(errors), 1)
        self.assertIn("停留所名が見つかりません", errors[0])

    def test_unknown_line_no_is_reported_as_error_not_guessed(self):
        bad = [{**self.records[0], "line_no": "999号"}]
        rows, errors = convert(bad, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(rows, [])
        self.assertEqual(len(errors), 1)
        self.assertIn("系統が見つかりません", errors[0])

    def test_unmapped_service_code_is_reported_as_error_not_guessed(self):
        bad = [{**self.records[0], "service": "unknown-code"}]
        rows, errors = convert(bad, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(rows, [])
        self.assertEqual(len(errors), 1)
        self.assertIn("マッピング", errors[0])

    def test_all_date_div_cd_none_means_every_record_errors(self):
        # config.py の初期状態(許可待ち)を模した状態。dateDivCdが1つも
        # 確認されていない限り、全レコードが必ずエラーになり、
        # timetable.jsonにつながる変換が完了しないことを保証する。
        unset = {"weekday": None, "saturday": None, "holiday": None}
        rows, errors = convert(self.records, self.stop_index, self.route_index, unset)
        self.assertEqual(rows, [])
        self.assertEqual(len(errors), len(self.records))

    def test_missing_required_field_is_reported(self):
        bad = [{**self.records[0], "headsign": ""}]
        rows, errors = convert(bad, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(rows, [])
        self.assertIn("headsign", errors[0])

    def test_errors_are_collected_for_all_bad_rows_not_just_first(self):
        bad = [
            {**self.records[0], "stop_name": "存在しない停留所A"},
            {**self.records[0], "stop_name": "存在しない停留所B"},
        ]
        rows, errors = convert(bad, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(rows, [])
        self.assertEqual(len(errors), 2)

    def test_stop_name_matching_tolerates_full_width_half_width_and_whitespace(self):
        # NFKC正規化・trimの範囲(全角/半角・前後空白)のみ許容する。
        bad = [{**self.records[0], "stop_name": " テスト停留所1 "}]
        rows, errors = convert(bad, self.stop_index, self.route_index, self.date_div_cd)
        self.assertEqual(errors, [])
        self.assertEqual(len(rows), 1)


if __name__ == "__main__":
    unittest.main()
