"""Verified Calendar Evidence Registry tests — network free."""
import copy
import tempfile
import unittest
from pathlib import Path

from collector.bus_vision.calendar_evidence import (
    CalendarEvidenceError,
    calendar_to_code_map,
    code_to_calendar_map,
    load_calendar_evidence,
    validate_calendar_document,
)

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
HOLIDAY_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "corpCd=1&dateDivCd=12&diaCd=9992&lang=0&lineCd=80&"
    "opeYmd=20260308&revYmd=20260301&routeCd=8000&"
    "timetableDateDivCd=-1&updownCd=1"
)


def document():
    return {
        "schemaVersion": 1,
        "entries": [
            {
                "calendar": "weekday",
                "dateDivCd": "11",
                "sourceUrl": WEEKDAY_URL,
                "observedAt": "2026-09-03",
                "evidenceNote": "verified weekday regression",
            },
            {
                "calendar": "saturday",
                "dateDivCd": "13",
                "sourceUrl": SATURDAY_URL,
                "observedAt": "2026-09-03",
                "evidenceNote": "verified saturday regression",
            },
            {
                "calendar": "holiday",
                "dateDivCd": "12",
                "sourceUrl": HOLIDAY_URL,
                "observedAt": "2026-09-03",
                "evidenceNote": "verified Sunday/holiday-bucket regression",
            },
        ],
    }


class CalendarEvidenceTest(unittest.TestCase):
    def test_repository_registry_has_all_three_verified_calendars(self):
        entries = load_calendar_evidence()
        self.assertEqual(
            [(e.calendar, e.date_div_cd) for e in entries],
            [("weekday", "11"), ("saturday", "13"), ("holiday", "12")],
        )
        self.assertEqual(entries[2].source_url, HOLIDAY_URL)

    def test_maps_are_converter_compatible(self):
        self.assertEqual(
            calendar_to_code_map(),
            {"weekday": "11", "saturday": "13", "holiday": "12"},
        )
        self.assertEqual(
            code_to_calendar_map(),
            {"11": "weekday", "13": "saturday", "12": "holiday"},
        )

    def test_holiday_evidence_locks_observed_sunday_url(self):
        entries = validate_calendar_document(document())
        holiday = next(e for e in entries if e.calendar == "holiday")
        self.assertEqual(holiday.date_div_cd, "12")
        self.assertIn("opeYmd=20260308", holiday.source_url)
        self.assertIn("dateDivCd=12", holiday.source_url)

    def test_url_date_div_must_match_declared_code(self):
        bad = document()
        bad["entries"][0]["dateDivCd"] = "12"
        with self.assertRaises(CalendarEvidenceError):
            validate_calendar_document(bad)

    def test_non_official_host_is_rejected(self):
        bad = document()
        bad["entries"][0]["sourceUrl"] = WEEKDAY_URL.replace(
            "oc.bus-vision.jp", "example.invalid"
        )
        with self.assertRaises(CalendarEvidenceError):
            validate_calendar_document(bad)

    def test_wrong_path_is_rejected(self):
        bad = document()
        bad["entries"][0]["sourceUrl"] = WEEKDAY_URL.replace(
            "diagramDetail.html", "diagram.html"
        )
        with self.assertRaises(CalendarEvidenceError):
            validate_calendar_document(bad)

    def test_unknown_calendar_name_is_rejected(self):
        bad = document()
        bad["entries"][0]["calendar"] = "special"
        with self.assertRaises(CalendarEvidenceError):
            validate_calendar_document(bad)

    def test_duplicate_code_is_rejected(self):
        bad = document()
        bad["entries"][1]["dateDivCd"] = "11"
        bad["entries"][1]["sourceUrl"] = SATURDAY_URL.replace(
            "dateDivCd=13", "dateDivCd=11"
        )
        with self.assertRaises(CalendarEvidenceError):
            validate_calendar_document(bad)

    def test_duplicate_calendar_is_rejected(self):
        bad = document()
        bad["entries"][1]["calendar"] = "weekday"
        with self.assertRaises(CalendarEvidenceError):
            validate_calendar_document(bad)

    def test_missing_holiday_is_allowed_for_incomplete_external_documents(self):
        partial = document()
        partial["entries"] = partial["entries"][:2]
        entries = validate_calendar_document(partial)
        self.assertEqual(len(entries), 2)
        self.assertFalse(any(e.calendar == "holiday" for e in entries))

    def test_file_loader_rejects_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.json"
            path.write_text("{bad", encoding="utf-8")
            with self.assertRaises(CalendarEvidenceError):
                load_calendar_evidence(path)


if __name__ == "__main__":
    unittest.main()
