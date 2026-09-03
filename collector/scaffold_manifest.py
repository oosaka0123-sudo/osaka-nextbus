"""Generate a non-runnable dry-run manifest template from verified stop evidence.

Network-free. This tool never creates timetable HTML, departure times, detail URLs, or
production selectors. Generated templates are intentionally marked `incomplete` and must
be completed from real saved evidence before offline_dry_run accepts them.
"""
from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path
from typing import Iterable, Optional, Sequence

from .bus_vision.evidence_registry import (
    DEFAULT_REGISTRY_PATH,
    EvidenceRegistryError,
    VerifiedStopTimetableEvidence,
    load_evidence_registry,
)


class ScaffoldError(RuntimeError):
    pass


def _normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip()


def select_verified_entry(
    entries: Iterable[VerifiedStopTimetableEvidence],
    *,
    source_url: Optional[str] = None,
    stop_name: Optional[str] = None,
) -> VerifiedStopTimetableEvidence:
    entries = list(entries)
    if bool(source_url) == bool(stop_name):
        raise ScaffoldError("specify exactly one of --url or --stop-name")

    if source_url:
        matches = [entry for entry in entries if entry.source_url == source_url.strip()]
        if len(matches) != 1:
            raise ScaffoldError("URL is not exactly one Verified Stop Evidence entry")
        return matches[0]

    normalized = _normalize(stop_name or "")
    matches = [entry for entry in entries if _normalize(entry.stop_name) == normalized]
    if not matches:
        raise ScaffoldError(f"stop name is not in Verified Stop Evidence: {stop_name!r}")
    if len(matches) > 1:
        raise ScaffoldError(
            f"stop name {stop_name!r} has {len(matches)} verified entries; use --url to select direction/pole explicitly"
        )
    return matches[0]


def build_template(entry: VerifiedStopTimetableEvidence) -> dict:
    """Build an intentionally incomplete manifest without fabricated data."""
    return {
        "schemaVersion": 1,
        "templateState": "incomplete",
        "templateNote": (
            "Fill every REQUIRED_* value from saved verified evidence, then set "
            "templateState to 'ready'. Do not invent times, detail URLs, or selectors."
        ),
        "sourceUrl": entry.source_url,
        "targetStopName": entry.stop_name,
        "verifiedEvidence": {
            "directionNote": entry.direction_note,
            "stopCd": entry.stop_cd,
            "poleCd": entry.pole_cd,
            "strLineList": entry.str_line_list,
            "observedAt": entry.observed_at,
        },
        "fetchedAt": "REQUIRED_ISO8601_WITH_TIMEZONE",
        "directionHint": "REQUIRED_DIRECTION_HINT_OR_NULL",
        "stopTimetableHtml": "REQUIRED_LOCAL_PATH_TO_SAVED_DIAGRAM_HTML",
        "details": [
            {
                "url": "REQUIRED_VERIFIED_DIAGRAM_DETAIL_URL",
                "html": "REQUIRED_LOCAL_PATH_TO_SAVED_DETAIL_HTML",
            }
        ],
        "selectors": {
            "stopTimetable": {
                "departureItem": {"tag": "REQUIRED_TAG", "class": "REQUIRED_CLASS_OR_NULL"},
                "timeCell": {"tag": "REQUIRED_TAG", "class": "REQUIRED_CLASS_OR_NULL"},
                "detailLink": {"tag": "REQUIRED_TAG", "class": "REQUIRED_CLASS_OR_NULL"},
            },
            "tripDetail": {
                "stopRow": {"tag": "REQUIRED_TAG", "class": "REQUIRED_CLASS_OR_NULL"},
                "stopName": {"tag": "REQUIRED_TAG", "class": "REQUIRED_CLASS_OR_NULL"},
                "timeCell": {"tag": "REQUIRED_TAG", "class": "REQUIRED_CLASS_OR_NULL"},
                "lineNo": {"tag": "REQUIRED_TAG", "class": "REQUIRED_CLASS_OR_NULL"},
                "destination": {"tag": "REQUIRED_TAG", "class": "REQUIRED_CLASS_OR_NULL"},
                "calendarLabel": None,
            },
        },
    }


def write_template(output_path: Path | str, document: dict) -> Path:
    output = Path(output_path).expanduser().resolve()
    if output.exists():
        raise ScaffoldError(f"output already exists; refusing to overwrite: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def scaffold(
    *,
    output_path: Path | str,
    registry_path: Path | str = DEFAULT_REGISTRY_PATH,
    source_url: Optional[str] = None,
    stop_name: Optional[str] = None,
) -> Path:
    entry = select_verified_entry(
        load_evidence_registry(registry_path),
        source_url=source_url,
        stop_name=stop_name,
    )
    return write_template(output_path, build_template(entry))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate an intentionally incomplete dry-run manifest from Verified Stop Evidence",
    )
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--url", help="exact verified diagram.html source URL")
    target.add_argument("--stop-name", help="verified stop name; fails if multiple poles/directions exist")
    parser.add_argument("--output", type=Path, required=True, help="new manifest template JSON path")
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY_PATH)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        output = scaffold(
            output_path=args.output,
            registry_path=args.registry,
            source_url=args.url,
            stop_name=args.stop_name,
        )
        print(output)
        return 0
    except (ScaffoldError, EvidenceRegistryError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
