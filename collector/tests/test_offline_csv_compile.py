"""Offline dry-run -> verified calendar mapping -> real project route CSV integration."""
from __future__ import annotations

import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from collector.offline_dry_run import (
    DryRunError,
    compile_records_to_csv,
    main,
    run_dry_run,
)

STOP_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=80&stopCd=811&strLineList=71-1-1_87-1-1"
)
DETAIL_11 = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "corpCd=1&dateDivCd=11&diaCd=5047&lang=0&lineCd=87&"
    "opeYmd=20260304&revYmd=20260301&routeCd=8700&"
    "timetableDateDivCd=-1&updownCd=1"
)
DETAIL_13 = DETAIL_11.replace("dateDivCd=11", "dateDivCd=13").replace("diaCd=5047", "diaCd=synthetic-sat")
DETAIL_12 = DETAIL_11.replace("dateDivCd=11", "dateDivCd=12").replace("diaCd=5047", "diaCd=synthetic-holiday")

DETAIL_HTML = """
<html><body>
  <span class="line-no">87</span>
  <span class="destination">なんば行き</span>
  <div class="trip-stop"><span class="time">07:34</span><span class="stop">鶴町四丁目</span></div>
  <div class="trip-stop"><span class="time">07:35</span><span class="stop">鶴町三丁目</span></div>
  <div class="trip-stop"><span class="time">08:08</span><span class="stop">なんば</span></div>
</body></html>
"""


class OfflineCsvCompileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.registry = self.root / "stop_registry.json"
        self.registry.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "entries": [
                        {
                            "stopName": "鶴町三丁目",
                            "directionNote": "市内向き",
                            "sourceUrl": STOP_URL,
                            "stopCd": "811",
                            "poleCd": "80",
                            "strLineList": "71-1-1_87-1-1",
                            "lang": "0",
                            "observedAt": "2026-09-03",
                            "evidenceNote": "test copy of verified registry identity",
                        }
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    def tearDown(self):
        self.tmp.cleanup()

    def _manifest_for(self, detail_url: str) -> Path:
        relative_detail = detail_url.split("/view/", 1)[1].replace("&", "&amp;")
        (self.root / "stop.html").write_text(
            f'<html><body><div class="departure"><span class="time">07:35</span>'
            f'<a class="detail" href="{relative_detail}">trip</a></div></body></html>',
            encoding="utf-8",
        )
        (self.root / "detail.html").write_text(DETAIL_HTML, encoding="utf-8")
        manifest = {
            "schemaVersion": 1,
            "sourceUrl": STOP_URL,
            "targetStopName": "鶴町三丁目",
            "fetchedAt": "2026-09-03T12:00:00+09:00",
            "directionHint": "なんば方面",
            "stopTimetableHtml": "stop.html",
            "details": [{"url": detail_url, "html": "detail.html"}],
            "selectors": {
                "stopTimetable": {
                    "departureItem": {"tag": "div", "class": "departure"},
                    "timeCell": {"tag": "span", "class": "time"},
                    "detailLink": {"tag": "a", "class": "detail"},
                },
                "tripDetail": {
                    "stopRow": {"tag": "div", "class": "trip-stop"},
                    "stopName": {"tag": "span", "class": "stop"},
                    "timeCell": {"tag": "span", "class": "time"},
                    "lineNo": {"tag": "span", "class": "line-no"},
                    "destination": {"tag": "span", "class": "destination"},
                    "calendarLabel": None,
                },
            },
        }
        path = self.root / "manifest.json"
        path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        return path

    def _compile(self, detail_url: str, filename: str):
        manifest = self._manifest_for(detail_url)
        records = run_dry_run(manifest, registry_path=self.registry)
        output = self.root / filename
        count = compile_records_to_csv(records, output)
        with output.open(encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        return count, rows, output

    def test_weekday_11_compiles_against_real_project_stop_and_route_indexes(self):
        count, rows, _ = self._compile(DETAIL_11, "weekday.csv")
        self.assertEqual(count, 1)
        self.assertEqual(rows[0]["routeId"], "鶴町三丁目-315527__87号")
        self.assertEqual(rows[0]["calendar"], "weekday")
        self.assertEqual(rows[0]["time"], "07:35")
        self.assertEqual(rows[0]["destination"], "なんば行き")

    def test_saturday_13_compiles_from_verified_calendar_registry(self):
        count, rows, _ = self._compile(DETAIL_13, "saturday.csv")
        self.assertEqual(count, 1)
        self.assertEqual(rows[0]["calendar"], "saturday")

    def test_verified_12_compiles_as_holiday(self):
        count, rows, output = self._compile(DETAIL_12, "holiday.csv")
        self.assertEqual(count, 1)
        self.assertTrue(output.exists())
        self.assertEqual(rows[0]["calendar"], "holiday")
        self.assertEqual(rows[0]["routeId"], "鶴町三丁目-315527__87号")
        self.assertEqual(rows[0]["time"], "07:35")

    def test_numeric_busvision_line_resolves_only_to_existing_number_suffix_route(self):
        _, rows, _ = self._compile(DETAIL_11, "route-format.csv")
        self.assertEqual(rows[0]["routeId"], "鶴町三丁目-315527__87号")

    def test_non_csv_output_is_rejected(self):
        manifest = self._manifest_for(DETAIL_11)
        records = run_dry_run(manifest, registry_path=self.registry)
        with self.assertRaises(DryRunError):
            compile_records_to_csv(records, self.root / "wrong.json")

    def test_cli_output_csv_runs_full_verified_path(self):
        manifest = self._manifest_for(DETAIL_11)
        output = self.root / "cli.csv"
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            code = main(
                [
                    "--manifest",
                    str(manifest),
                    "--registry",
                    str(self.registry),
                    "--output-csv",
                    str(output),
                ]
            )
        self.assertEqual(code, 0)
        self.assertTrue(output.exists())
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload[0]["service"], "11")
        with output.open(encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(rows[0]["calendar"], "weekday")
        self.assertEqual(rows[0]["routeId"], "鶴町三丁目-315527__87号")


if __name__ == "__main__":
    unittest.main()
