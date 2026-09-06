"""鶴町一丁目のVerified Bus-Vision Evidenceを使う完全オフライン回帰テスト。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from collector.offline_dry_run import run_dry_run

STOP_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "stopCd=809&poleCd=70&strLineList=null&lang=0"
)
DETAIL_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "revYmd=20260831&corpCd=1&diaCd=9567&lineCd=71&routeCd=7100&"
    "updownCd=2&dateDivCd=12&timetableDateDivCd=-1&opeYmd=20260906&lang=0"
)
DETAIL_HREF = (
    "diagramDetail.html?revYmd=20260831&amp;corpCd=1&amp;diaCd=9567&amp;"
    "lineCd=71&amp;routeCd=7100&amp;updownCd=2&amp;dateDivCd=12&amp;"
    "timetableDateDivCd=-1&amp;opeYmd=20260906&amp;lang=0"
)

STOP_HTML = f"""
<html><body>
  <div class="departure">
    <span class="time">06:47</span>
    <a class="detail" href="{DETAIL_HREF}">71号便</a>
  </div>
</body></html>
"""

DETAIL_HTML = """
<html><body>
  <span class="line-no">71</span>
  <span class="destination">鶴町四丁目行き</span>
  <div class="trip-stop"><span class="time">06:47</span><span class="stop">鶴町一丁目</span></div>
</body></html>
"""


class Tsurumachi1VerifiedOfflineTest(unittest.TestCase):
    def test_verified_pole70_route71_trip_matches_target_once_and_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            registry = root / "registry.json"
            manifest = root / "manifest.json"
            (root / "stop.html").write_text(STOP_HTML, encoding="utf-8")
            (root / "detail.html").write_text(DETAIL_HTML, encoding="utf-8")

            registry.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "entries": [
                            {
                                "stopName": "鶴町一丁目",
                                "directionNote": "鶴町四丁目向き",
                                "sourceUrl": STOP_URL,
                                "stopCd": "809",
                                "poleCd": "70",
                                "strLineList": "null",
                                "lang": "0",
                                "observedAt": "2026-09-06",
                                "evidenceNote": "Issue #39 verified public Bus-Vision evidence",
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            manifest.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "sourceUrl": STOP_URL,
                        "targetStopName": "鶴町一丁目",
                        "fetchedAt": "2026-09-06T23:22:00+09:00",
                        "directionHint": "鶴町四丁目方面",
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
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            records = run_dry_run(manifest, registry_path=registry)
            self.assertEqual(len(records), 1)
            record = records[0]
            self.assertEqual(record.stop_name, "鶴町一丁目")
            self.assertEqual(record.departure_time, "06:47")
            self.assertEqual(record.line_no, "71")
            self.assertEqual(record.headsign, "鶴町四丁目行き")
            self.assertEqual(record.direction, "鶴町四丁目方面")
            self.assertEqual(record.service, "12")
            self.assertEqual(record.source_url, DETAIL_URL)


if __name__ == "__main__":
    unittest.main()
