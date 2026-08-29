"""
collector/tests/test_bus_vision_end_to_end.py
---------------------------------------------------------
bus_vision.parser → convert_to_timetable_csv → 既存の
scripts/timetable-csv-to-json.mjs までを実際につないで検証する統合テスト。

フィクスチャHTML(collector/tests/fixtures/bus_vision_html/)と
フィクスチャstops/routes.json のみを使い、ネットワークアクセスは
一切行わない。node コマンドを子プロセスとして1回だけ呼び出す
(このリポジトリの開発環境には既にNode.jsがインストール済み)。

検証項目(ユーザー仕様の自動テスト項目に対応):
- 重複除去:      同じ(routeId,direction,destination,calendar)内の
                 重複時刻が1件にまとまること
- 時刻順ソート:   各曜日区分の配列が時刻の昇順で並ぶこと
- 日付跨ぎ:      "24:10"のような24時以降表記がそのまま保持され、
                 時系列上も正しい位置(23:59台の後)にソートされること
- 最終出力形式:   BusDataSource(js/data.js)が読み込める
                 {routeId, direction, destination, weekday, saturday, holiday}
                 という data/timetable.json と同じ形式になること
"""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from collector.bus_vision.parser import parse_diagram_detail
from collector.bus_vision.selectors import SelectorConfig
from collector.convert_to_timetable_csv import convert, load_route_index, load_stop_index, write_csv

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).parent / "fixtures"
HTML_FIXTURES = FIXTURES / "bus_vision_html"

SELECTORS = SelectorConfig(
    stop_name=("div", "stop-name"),
    route_block=("div", "route-block"),
    line_no=("span", "line-no"),
    destination=("span", "destination"),
    time_cell=("li", "time-cell"),
)


def _read(name: str) -> str:
    return (HTML_FIXTURES / name).read_text(encoding="utf-8")


@unittest.skipUnless(shutil.which("node"), "node コマンドが見つからないため統合テストをスキップします")
class BusVisionEndToEndTest(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp_dir.cleanup)

    def _run_full_pipeline(self):
        weekday_records = parse_diagram_detail(
            _read("weekday.html"),
            selector_config=SELECTORS,
            source_url="https://example.invalid/diagramDetail.html?stopCd=1&poleCd=1&dateDivCd=1",
            fetched_at="2026-08-29T09:00:00+09:00",
            calendar_hint="weekday",
        )
        saturday_records = parse_diagram_detail(
            _read("saturday.html"),
            selector_config=SELECTORS,
            source_url="https://example.invalid/diagramDetail.html?stopCd=1&poleCd=1&dateDivCd=2",
            fetched_at="2026-08-29T09:00:01+09:00",
            calendar_hint="saturday",
        )
        all_records = [r.as_dict() for r in (weekday_records + saturday_records)]

        stop_index = load_stop_index(FIXTURES / "stops.json")
        route_index = load_route_index(FIXTURES / "routes.json")
        # calendar_hintが既にそのまま平日/土曜/休日を表す文字列なので、
        # ここでは恒等マッピングを使う(実運用ではdateDivCdの生コードを
        # config.DATE_DIV_CDでこの3値にマッピングする)。
        date_div_cd_map = {"weekday": "weekday", "saturday": "saturday", "holiday": "holiday"}

        rows, errors = convert(all_records, stop_index, route_index, date_div_cd_map)
        self.assertEqual(errors, [], f"変換エラーが発生しました: {errors}")

        csv_path = Path(self.tmp_dir.name) / "timetable.csv"
        json_path = Path(self.tmp_dir.name) / "timetable.json"
        write_csv(rows, csv_path)

        result = subprocess.run(
            [
                "node",
                "scripts/timetable-csv-to-json.mjs",
                "--input", str(csv_path),
                "--output", str(json_path),
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, f"stdout={result.stdout}\nstderr={result.stderr}")

        return json.loads(json_path.read_text(encoding="utf-8"))

    def test_output_matches_timetable_json_schema(self):
        entries = self._run_full_pipeline()
        for entry in entries:
            self.assertEqual(
                set(entry.keys()),
                {"routeId", "direction", "destination", "weekday", "saturday", "holiday"},
            )

    def test_duplicate_times_are_removed(self):
        # weekday.html の27号には "06:00発" が2回含まれている
        entries = self._run_full_pipeline()
        entry = next(e for e in entries if e["routeId"] == "test-stop-1__27号")
        self.assertEqual(entry["weekday"].count("06:00"), 1)

    def test_times_are_sorted_ascending(self):
        entries = self._run_full_pipeline()
        entry = next(e for e in entries if e["routeId"] == "test-stop-1__27号")
        # weekday.html内は 06:30, 06:00, 06:00, 24:10 の順(未整列)で書かれている
        self.assertEqual(entry["weekday"], ["06:00", "06:30", "24:10"])
        self.assertEqual(entry["saturday"], ["07:00", "07:30"])

    def test_midnight_crossing_time_is_preserved_and_sorted_last(self):
        entries = self._run_full_pipeline()
        entry = next(e for e in entries if e["routeId"] == "test-stop-1__27号")
        self.assertIn("24:10", entry["weekday"])
        self.assertEqual(entry["weekday"][-1], "24:10")  # 23:59台より後ろに来ること

    def test_second_route_at_same_stop_is_independent(self):
        entries = self._run_full_pipeline()
        entry = next(e for e in entries if e["routeId"] == "test-stop-1__37号")
        self.assertEqual(entry["weekday"], ["07:15"])
        self.assertEqual(entry["saturday"], [])
        self.assertEqual(entry["holiday"], [])

    def test_direction_and_destination_are_not_empty(self):
        entries = self._run_full_pipeline()
        for entry in entries:
            self.assertTrue(entry["direction"])
            self.assertTrue(entry["destination"])


if __name__ == "__main__":
    unittest.main()
