"""Full offline CLI smoke tests: scaffold -> ready manifest -> dry-run -> CSV.

No live/third-party HTML is stored. HTML strings below are synthetic fixtures that only
model the already-tested semantic shape: a stop departure links to one trip detail page,
and the trip detail contains route metadata plus stop/time rows.
"""
from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
STOP_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=80&stopCd=811&strLineList=71-1-1_87-1-1"
)
DETAIL_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "corpCd=1&dateDivCd=11&diaCd=5047&lang=0&lineCd=87&"
    "opeYmd=20260304&revYmd=20260301&routeCd=8700&"
    "timetableDateDivCd=-1&updownCd=1"
)


def stop_html() -> str:
    relative = DETAIL_URL.split("/view/", 1)[1].replace("&", "&amp;")
    return (
        '<html><body><div class="departure">'
        '<span class="time">07:35</span>'
        f'<a class="detail" href="{relative}">trip</a>'
        '</div></body></html>'
    )


def detail_html(*, target_time: str = "07:35") -> str:
    return f"""
<html><body>
  <span class="line-no">87</span>
  <span class="destination">なんば行き</span>
  <div class="trip-stop"><span class="time">07:34</span><span class="stop">鶴町四丁目</span></div>
  <div class="trip-stop"><span class="time">{target_time}</span><span class="stop">鶴町三丁目</span></div>
  <div class="trip-stop"><span class="time">08:08</span><span class="stop">なんば</span></div>
</body></html>
"""


class OfflineCliE2ETest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, *args],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def _scaffold(self, name: str = "manifest.json") -> Path:
        manifest = self.root / name
        result = self._run(
            "-m",
            "collector.scaffold_manifest",
            "--url",
            STOP_URL,
            "--output",
            str(manifest),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(manifest.is_file())
        document = json.loads(manifest.read_text(encoding="utf-8"))
        self.assertEqual(document["templateState"], "incomplete")
        return manifest

    def _make_ready(self, manifest: Path, *, target_time: str = "07:35") -> None:
        stop_path = manifest.parent / "stop.html"
        detail_path = manifest.parent / "detail.html"
        stop_path.write_text(stop_html(), encoding="utf-8")
        detail_path.write_text(detail_html(target_time=target_time), encoding="utf-8")

        document = json.loads(manifest.read_text(encoding="utf-8"))
        document.update(
            {
                "templateState": "ready",
                "fetchedAt": "2026-09-03T12:00:00+09:00",
                "directionHint": "なんば方面",
                "stopTimetableHtml": "stop.html",
                "details": [{"url": DETAIL_URL, "html": "detail.html"}],
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
        )
        manifest.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")

    def test_scaffold_to_real_project_route_csv_via_actual_clis(self):
        manifest = self._scaffold()
        self._make_ready(manifest)
        output_csv = self.root / "timetable.csv"

        result = self._run(
            "-m",
            "collector.offline_dry_run",
            "--manifest",
            str(manifest),
            "--output-csv",
            str(output_csv),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["stop_name"], "鶴町三丁目")
        self.assertEqual(payload[0]["departure_time"], "07:35")
        self.assertEqual(payload[0]["line_no"], "87")
        self.assertEqual(payload[0]["service"], "11")

        with output_csv.open(encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["routeId"], "鶴町三丁目-315527__87号")
        self.assertEqual(rows[0]["calendar"], "weekday")
        self.assertEqual(rows[0]["time"], "07:35")
        self.assertEqual(rows[0]["destination"], "なんば行き")

    def test_broken_trip_time_fails_closed_and_writes_no_csv(self):
        manifest = self._scaffold("broken.json")
        self._make_ready(manifest, target_time="07:36")
        output_csv = self.root / "broken.csv"

        result = self._run(
            "-m",
            "collector.offline_dry_run",
            "--manifest",
            str(manifest),
            "--output-csv",
            str(output_csv),
        )
        self.assertEqual(result.returncode, 2)
        self.assertFalse(output_csv.exists())
        self.assertIn("ERROR:", result.stderr)

    def test_incomplete_scaffold_fails_before_html_is_needed(self):
        manifest = self._scaffold("incomplete.json")
        output_csv = self.root / "incomplete.csv"
        self.assertEqual(list(self.root.glob("*.html")), [])

        result = self._run(
            "-m",
            "collector.offline_dry_run",
            "--manifest",
            str(manifest),
            "--output-csv",
            str(output_csv),
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("templateState", result.stderr)
        self.assertFalse(output_csv.exists())
        self.assertEqual(list(self.root.glob("*.html")), [])


if __name__ == "__main__":
    unittest.main()
