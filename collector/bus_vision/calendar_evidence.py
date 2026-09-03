"""Verified Bus-Vision dateDivCd -> calendar evidence registry.

Network-free. Only codes already preserved as verified project evidence may enter this
registry. Missing calendars are intentionally allowed: absence means "unverified" and must
remain fail-closed during conversion.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import urlparse

from .identifiers import extract_diagram_detail_identifiers

DEFAULT_CALENDAR_REGISTRY_PATH = (
    Path(__file__).resolve().parent.parent / "evidence" / "calendar_codes.json"
)
EXPECTED_HOST = "oc.bus-vision.jp"
EXPECTED_PATH = "/osakacitybus/view/diagramDetail.html"
SCHEMA_VERSION = 1
ALLOWED_CALENDARS = frozenset(("weekday", "saturday", "holiday"))


class CalendarEvidenceError(RuntimeError):
    """Calendar evidence is incomplete, inconsistent, duplicated, or untrusted."""


@dataclass(frozen=True)
class VerifiedCalendarEvidence:
    calendar: str
    date_div_cd: str
    source_url: str
    observed_at: str
    evidence_note: str


def _require_nonempty(entry: Dict[str, Any], key: str, *, index: int) -> str:
    value = entry.get(key)
    if not isinstance(value, str) or not value.strip():
        raise CalendarEvidenceError(f"entries[{index}].{key} must be a non-empty string")
    return value.strip()


def validate_calendar_document(document: Dict[str, Any]) -> List[VerifiedCalendarEvidence]:
    if not isinstance(document, dict):
        raise CalendarEvidenceError("calendar registry root must be an object")
    if document.get("schemaVersion") != SCHEMA_VERSION:
        raise CalendarEvidenceError(
            f"schemaVersion must be {SCHEMA_VERSION}; got {document.get('schemaVersion')!r}"
        )

    raw_entries = document.get("entries")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise CalendarEvidenceError("entries must be a non-empty array")

    results: List[VerifiedCalendarEvidence] = []
    seen_calendars: set[str] = set()
    seen_codes: set[str] = set()
    seen_urls: set[str] = set()

    for index, raw in enumerate(raw_entries):
        if not isinstance(raw, dict):
            raise CalendarEvidenceError(f"entries[{index}] must be an object")

        calendar = _require_nonempty(raw, "calendar", index=index)
        date_div_cd = _require_nonempty(raw, "dateDivCd", index=index)
        source_url = _require_nonempty(raw, "sourceUrl", index=index)
        observed_at = _require_nonempty(raw, "observedAt", index=index)
        evidence_note = _require_nonempty(raw, "evidenceNote", index=index)

        if calendar not in ALLOWED_CALENDARS:
            raise CalendarEvidenceError(
                f"entries[{index}].calendar must be one of {sorted(ALLOWED_CALENDARS)}"
            )

        parsed = urlparse(source_url)
        if parsed.scheme != "https" or parsed.netloc != EXPECTED_HOST:
            raise CalendarEvidenceError(
                f"entries[{index}].sourceUrl must use https://{EXPECTED_HOST}"
            )
        if parsed.path != EXPECTED_PATH:
            raise CalendarEvidenceError(
                f"entries[{index}].sourceUrl must target {EXPECTED_PATH}"
            )

        identifiers = extract_diagram_detail_identifiers(source_url)
        if identifiers.date_div_cd is None:
            raise CalendarEvidenceError(
                f"entries[{index}].sourceUrl does not contain dateDivCd"
            )
        if identifiers.date_div_cd != date_div_cd:
            raise CalendarEvidenceError(
                f"entries[{index}].dateDivCd={date_div_cd!r} does not match URL value "
                f"{identifiers.date_div_cd!r}"
            )

        if calendar in seen_calendars:
            raise CalendarEvidenceError(f"duplicate calendar at entries[{index}]: {calendar}")
        if date_div_cd in seen_codes:
            raise CalendarEvidenceError(
                f"duplicate dateDivCd at entries[{index}]: {date_div_cd}"
            )
        if source_url in seen_urls:
            raise CalendarEvidenceError(f"duplicate sourceUrl at entries[{index}]")

        seen_calendars.add(calendar)
        seen_codes.add(date_div_cd)
        seen_urls.add(source_url)
        results.append(
            VerifiedCalendarEvidence(
                calendar=calendar,
                date_div_cd=date_div_cd,
                source_url=source_url,
                observed_at=observed_at,
                evidence_note=evidence_note,
            )
        )

    return results


def load_calendar_evidence(
    path: Path | str = DEFAULT_CALENDAR_REGISTRY_PATH,
) -> List[VerifiedCalendarEvidence]:
    path = Path(path)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CalendarEvidenceError(f"calendar registry file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CalendarEvidenceError(f"calendar registry JSON is invalid: {exc}") from exc
    return validate_calendar_document(document)


def calendar_to_code_map(
    path: Path | str = DEFAULT_CALENDAR_REGISTRY_PATH,
) -> Dict[str, str]:
    """Return the converter-compatible `{calendar: dateDivCd}` verified map."""
    return {entry.calendar: entry.date_div_cd for entry in load_calendar_evidence(path)}


def code_to_calendar_map(
    path: Path | str = DEFAULT_CALENDAR_REGISTRY_PATH,
) -> Dict[str, str]:
    return {entry.date_div_cd: entry.calendar for entry in load_calendar_evidence(path)}
