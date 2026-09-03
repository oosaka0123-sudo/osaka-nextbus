"""Verified Bus-Vision stop-timetable evidence registry.

This module is deliberately network-free.  It loads only evidence that a human/PM has
already verified from a public `diagram.html` URL and rejects any entry whose declared
identifiers do not exactly match the URL query string.

Unverified guesses belong in Issues as HYPOTHESIS, never in this registry.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List
from urllib.parse import urlparse

from .identifiers import extract_stop_timetable_identifiers

DEFAULT_REGISTRY_PATH = Path(__file__).resolve().parent.parent / "evidence" / "stop_timetables.json"
EXPECTED_HOST = "oc.bus-vision.jp"
EXPECTED_PATH = "/osakacitybus/view/diagram.html"
SCHEMA_VERSION = 1


class EvidenceRegistryError(RuntimeError):
    """Registry content is incomplete, inconsistent, duplicated, or untrusted."""


@dataclass(frozen=True)
class VerifiedStopTimetableEvidence:
    stop_name: str
    direction_note: str
    source_url: str
    stop_cd: str
    pole_cd: str
    str_line_list: str
    lang: str
    observed_at: str
    evidence_note: str

    @property
    def identity(self) -> tuple[str, str, str]:
        return (self.stop_cd, self.pole_cd, self.str_line_list)


def _require_nonempty(entry: Dict[str, Any], key: str, *, index: int) -> str:
    value = entry.get(key)
    if not isinstance(value, str) or not value.strip():
        raise EvidenceRegistryError(f"entries[{index}].{key} must be a non-empty string")
    return value.strip()


def validate_registry_document(document: Dict[str, Any]) -> List[VerifiedStopTimetableEvidence]:
    """Validate a decoded registry document and return immutable verified entries.

    The validator does not infer missing IDs or normalize mismatches.  Any ambiguity is a
    hard failure so an AI cannot silently promote a hypothesis to verified evidence.
    """
    if not isinstance(document, dict):
        raise EvidenceRegistryError("registry root must be an object")
    if document.get("schemaVersion") != SCHEMA_VERSION:
        raise EvidenceRegistryError(
            f"schemaVersion must be {SCHEMA_VERSION}; got {document.get('schemaVersion')!r}"
        )

    raw_entries = document.get("entries")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise EvidenceRegistryError("entries must be a non-empty array")

    results: List[VerifiedStopTimetableEvidence] = []
    seen_urls: set[str] = set()
    seen_identities: set[tuple[str, str, str]] = set()

    for index, raw in enumerate(raw_entries):
        if not isinstance(raw, dict):
            raise EvidenceRegistryError(f"entries[{index}] must be an object")

        stop_name = _require_nonempty(raw, "stopName", index=index)
        direction_note = _require_nonempty(raw, "directionNote", index=index)
        source_url = _require_nonempty(raw, "sourceUrl", index=index)
        stop_cd = _require_nonempty(raw, "stopCd", index=index)
        pole_cd = _require_nonempty(raw, "poleCd", index=index)
        str_line_list = _require_nonempty(raw, "strLineList", index=index)
        lang = _require_nonempty(raw, "lang", index=index)
        observed_at = _require_nonempty(raw, "observedAt", index=index)
        evidence_note = _require_nonempty(raw, "evidenceNote", index=index)

        parsed = urlparse(source_url)
        if parsed.scheme != "https" or parsed.netloc != EXPECTED_HOST:
            raise EvidenceRegistryError(
                f"entries[{index}].sourceUrl must use https://{EXPECTED_HOST}"
            )
        if parsed.path != EXPECTED_PATH:
            raise EvidenceRegistryError(
                f"entries[{index}].sourceUrl must target {EXPECTED_PATH}"
            )

        ids = extract_stop_timetable_identifiers(source_url)
        if not ids.has_stop_identity():
            raise EvidenceRegistryError(
                f"entries[{index}].sourceUrl is missing verified stop timetable identifiers"
            )

        declared = {
            "stopCd": stop_cd,
            "poleCd": pole_cd,
            "strLineList": str_line_list,
            "lang": lang,
        }
        observed = {
            "stopCd": ids.stop_cd,
            "poleCd": ids.pole_cd,
            "strLineList": ids.str_line_list,
            "lang": ids.lang,
        }
        for key, declared_value in declared.items():
            if observed[key] != declared_value:
                raise EvidenceRegistryError(
                    f"entries[{index}].{key}={declared_value!r} does not match URL value {observed[key]!r}"
                )

        identity = (stop_cd, pole_cd, str_line_list)
        if source_url in seen_urls:
            raise EvidenceRegistryError(f"duplicate sourceUrl at entries[{index}]")
        if identity in seen_identities:
            raise EvidenceRegistryError(
                f"duplicate stop/pole/line identity at entries[{index}]: {identity!r}"
            )
        seen_urls.add(source_url)
        seen_identities.add(identity)

        results.append(
            VerifiedStopTimetableEvidence(
                stop_name=stop_name,
                direction_note=direction_note,
                source_url=source_url,
                stop_cd=stop_cd,
                pole_cd=pole_cd,
                str_line_list=str_line_list,
                lang=lang,
                observed_at=observed_at,
                evidence_note=evidence_note,
            )
        )

    return results


def load_evidence_registry(path: Path | str = DEFAULT_REGISTRY_PATH) -> List[VerifiedStopTimetableEvidence]:
    path = Path(path)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise EvidenceRegistryError(f"registry file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise EvidenceRegistryError(f"registry JSON is invalid: {exc}") from exc
    return validate_registry_document(document)
