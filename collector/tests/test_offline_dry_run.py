"""Verified Registry専用offline dry-run CLIの完全オフラインテスト。"""
from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from collector.bus_vision.parser import ParseError
from collector.offline_dry_run import (
    DryRunError,
    list_verified_targets,
    load_dry_run_bundle,
    main,
    run_dry_run,
)

STOP_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=80&stopCd=811&strLineList=71-1-1_87-1-1"
)
UNVERIFIED_STOP_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=80&stopCd=809&strLineList=71-1-1_87-1-1"
)
DETAIL_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "corpCd=1&dateDivCd=11&diaCd=5047&lang=0&lineCd=87&"
    "opeYmd=20260304&revYmd=20260301&routeCd=8700&"
    "timetableDateDivCd=-1&updownCd=1"
)
DETAIL_HREF = (
    "diagramDetail.html?corpCd=1&amp;dateDivCd=11&amp;diaCd=5047&amp;lang=0&amp;"
    "lineCd=87&amp;opeYmd=20260304&amp;revYmd=20260301&amp;routeCd=8700&amp;"
    "timetableDateDivCd=-1&amp;updownCd=1"
)

STOP_HTML = f"""
<html><body>
  <div class="departure">
    <span class="time">07:35</span>
    <a class="detail" href="{DETAIL_HREF}">87号便</a>
  </div>
</body></html>
"""

DETAIL_HTML = """
<html><body>
  <span class="line-no">87</span>
  <span class="destination">なんば行き</span>
  <div class="trip-stop"><span class="time">07:34</span><span class="stop">鶴町四丁目</span></div>
  <div class="trip-stop"><span class="time">07:35</span><span class="stop">鶴町三丁目</span></div>
  <div class="trip-stop"><span class="time">07:37</span><span class="stop">鶴町南公園</span></div>
  <div class="trip-stop"><span class="time">08:08</span><span class="stop">なんば</span></div>
</body></html>
"""


def registry_document():
    return {
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
                "evidenceNote": "公開Bus-Visionで確認済み",
            }
        ],
    }


def manifest_document(*, source_url=STOP_URL, stop_html="stop.html", detail_html="detail.html"):
    return {
        "schemaVersion": 1,
        "sourceUrl": source_url,
        "targetStopName": "鶴町三丁目",
        "fetchedAt": "2026-09-03T12:00:00+09:00",
        "directionHint": "なんば方面",
        "stopTimetableHtml": stop_html,
        "details": [{"url": DETAIL_URL, "html": detail_html}],
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


class OfflineDryRunTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.registry = self.root / "registry.json"
        self.manifest = self.root / "manifest.json"
        self.stop_html = self.root / "stop.html"
        self.detail_html = self.root / "detail.html"
        self.registry.write_text(json.dumps(registry_document(), ensure_ascii=False), encoding="utf-8")
        self.stop_html.write_text(STOP_HTML, encoding="utf-8")
        self.detail_html.write_text(DETAIL_HTML, encoding="utf-8")
        self.write_manifest(manifest_document())

    def tearDown(self):
        self.tmp.cleanup()

    def write_manifest(self, document):
        self.manifest.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")

    def test_list_verified_targets_uses_registry_only(self):
        targets = list_verified_targets(self.registry)
        self.assertEqual(len(targets), 1)
        self.assertEqual(targets[0]["stopName"], "鶴町三丁目")
        self.assertEqual(targets[0]["stopCd"], "811")
        self.assertEqual(targets[0]["poleCd"], "80")
        self.assertEqual(targets[0]["sourceUrl"], STOP_URL)

    def test_successful_bundle_returns_verified_target_record(self):
        records = run_dry_run(self.manifest, registry_path=self.registry)
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record.stop_name, "鶴町三丁目")
        self.assertEqual(record.departure_time, "07:35")
        self.assertEqual(record.line_no, "87")
        self.assertEqual(record.headsign, "なんば行き")
        self.assertEqual(record.direction, "なんば方面")
        self.assertEqual(record.service, "11")
        self.assertEqual(record.source_url, DETAIL_URL)

    def test_unverified_stop_url_is_rejected_before_parse(self):
        document = manifest_document(source_url=UNVERIFIED_STOP_URL)
        self.write_manifest(document)
        with self.assertRaises(DryRunError):
            load_dry_run_bundle(self.manifest, registry_path=self.registry)

    def test_target_stop_must_match_registry_stop_name(self):
        document = manifest_document()
        document["targetStopName"] = "鶴町一丁目"
        self.write_manifest(document)
        with self.assertRaises(DryRunError):
            load_dry_run_bundle(self.manifest, registry_path=self.registry)

    def test_missing_detail_file_fails_closed(self):
        document = manifest_document(detail_html="missing.html")
        self.write_manifest(document)
        with self.assertRaises(DryRunError):
            load_dry_run_bundle(self.manifest, registry_path=self.registry)

    def test_stop_and_detail_time_mismatch_fails_closed(self):
        self.stop_html.write_text(STOP_HTML.replace(">07:35<", ">07:36<"), encoding="utf-8")
        with self.assertRaises(ParseError):
            run_dry_run(self.manifest, registry_path=self.registry)

    def test_missing_required_trip_selector_is_rejected(self):
        document = manifest_document()
        del document["selectors"]["tripDetail"]["lineNo"]
        self.write_manifest(document)
        with self.assertRaises(DryRunError):
            load_dry_run_bundle(self.manifest, registry_path=self.registry)

    def test_duplicate_detail_url_is_rejected(self):
        document = manifest_document()
        document["details"].append({"url": DETAIL_URL, "html": "detail.html"})
        self.write_manifest(document)
        with self.assertRaises(DryRunError):
            load_dry_run_bundle(self.manifest, registry_path=self.registry)

    def test_fetched_at_requires_timezone(self):
        document = manifest_document()
        document["fetchedAt"] = "2026-09-03T12:00:00"
        self.write_manifest(document)
        with self.assertRaises(DryRunError):
            load_dry_run_bundle(self.manifest, registry_path=self.registry)

    def test_cli_list_targets_prints_json_and_succeeds(self):
        out = io.StringIO()
        with redirect_stdout(out):
            code = main(["--list-targets", "--registry", str(self.registry)])
        self.assertEqual(code, 0)
        payload = json.loads(out.getvalue())
        self.assertEqual(payload[0]["stopName"], "鶴町三丁目")

    def test_cli_manifest_prints_departure_record_json(self):
        out = io.StringIO()
        with redirect_stdout(out):
            code = main(
                [
                    "--manifest",
                    str(self.manifest),
                    "--registry",
                    str(self.registry),
                ]
            )
        self.assertEqual(code, 0)
        payload = json.loads(out.getvalue())
        self.assertEqual(payload[0]["departure_time"], "07:35")
        self.assertEqual(payload[0]["line_no"], "87")


if __name__ == "__main__":
    unittest.main()
