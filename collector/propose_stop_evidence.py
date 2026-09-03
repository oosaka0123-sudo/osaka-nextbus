"""Create an explicitly UNVERIFIED stop-evidence proposal from a public URL.

This module is completely network-free and NEVER edits the Verified Stop Evidence Registry.
It can verify URL structure/query consistency only; it cannot prove that a human-visible
stop name/direction matches the URL. Therefore every output remains `unverified` until a
human/PM confirms the same public screen and promotes it through a reviewed Issue/PR.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Optional, Sequence
from urllib.parse import urlparse

from .bus_vision.evidence_registry import (
    DEFAULT_REGISTRY_PATH,
    EXPECTED_HOST,
    EXPECTED_PATH,
    EvidenceRegistryError,
    load_evidence_registry,
)
from .bus_vision.identifiers import extract_stop_timetable_identifiers


class EvidenceProposalError(RuntimeError):
    pass


def _nonempty(value: str, *, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise EvidenceProposalError(f"{field} must be a non-empty string")
    return value.strip()


def _validate_observed_at(value: str) -> str:
    value = _nonempty(value, field="observedAt")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise EvidenceProposalError("observedAt must use YYYY-MM-DD") from exc
    if parsed.isoformat() != value:
        raise EvidenceProposalError("observedAt must use canonical YYYY-MM-DD")
    return value


def build_proposal(
    *,
    source_url: str,
    stop_name: str,
    direction_note: str,
    observed_at: str,
    evidence_note: str,
    registry_path: Path | str = DEFAULT_REGISTRY_PATH,
) -> dict:
    """Validate one explicit public URL and return an unverified proposal document."""
    source_url = _nonempty(source_url, field="sourceUrl")
    stop_name = _nonempty(stop_name, field="stopName")
    direction_note = _nonempty(direction_note, field="directionNote")
    observed_at = _validate_observed_at(observed_at)
    evidence_note = _nonempty(evidence_note, field="evidenceNote")

    parsed = urlparse(source_url)
    if parsed.scheme != "https" or parsed.netloc != EXPECTED_HOST:
        raise EvidenceProposalError(f"sourceUrl must use https://{EXPECTED_HOST}")
    if parsed.path != EXPECTED_PATH:
        raise EvidenceProposalError(f"sourceUrl must target {EXPECTED_PATH}")

    ids = extract_stop_timetable_identifiers(source_url)
    if not ids.has_stop_identity() or not ids.lang:
        raise EvidenceProposalError(
            "sourceUrl must contain stopCd, poleCd, strLineList, and lang"
        )

    existing = load_evidence_registry(registry_path)
    identity = (ids.stop_cd, ids.pole_cd, ids.str_line_list)
    for entry in existing:
        if entry.source_url == source_url:
            raise EvidenceProposalError(
                f"sourceUrl is already in Verified Stop Evidence for {entry.stop_name!r}"
            )
        if entry.identity == identity:
            raise EvidenceProposalError(
                "stopCd/poleCd/strLineList identity is already in Verified Stop Evidence "
                f"for {entry.stop_name!r}"
            )

    return {
        "schemaVersion": 1,
        "proposalState": "unverified",
        "requiresHumanConfirmation": True,
        "sourceUrl": source_url,
        "stopName": stop_name,
        "directionNote": direction_note,
        "stopCd": ids.stop_cd,
        "poleCd": ids.pole_cd,
        "strLineList": ids.str_line_list,
        "lang": ids.lang,
        "observedAt": observed_at,
        "evidenceNote": evidence_note,
        "verificationBoundary": (
            "URL structure and query identifiers were machine-validated only. "
            "The stopName/directionNote semantic match has NOT been verified by this CLI."
        ),
        "nextAction": (
            "Confirm stop name/direction and this exact URL on the same normal public "
            "Bus-Vision screen, record that evidence in a GitHub Issue/PR, then promote "
            "the entry to collector/evidence/stop_timetables.json through review."
        ),
    }


def write_proposal(output_path: Path | str, document: dict) -> Path:
    output = Path(output_path).expanduser().resolve()
    if output.exists():
        raise EvidenceProposalError(f"output already exists; refusing to overwrite: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def propose(
    *,
    source_url: str,
    stop_name: str,
    direction_note: str,
    observed_at: str,
    evidence_note: str,
    output_path: Path | str,
    registry_path: Path | str = DEFAULT_REGISTRY_PATH,
) -> Path:
    document = build_proposal(
        source_url=source_url,
        stop_name=stop_name,
        direction_note=direction_note,
        observed_at=observed_at,
        evidence_note=evidence_note,
        registry_path=registry_path,
    )
    return write_proposal(output_path, document)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create an unverified stop-evidence proposal from an explicit Bus-Vision URL",
    )
    parser.add_argument("--url", required=True, help="explicit public diagram.html URL")
    parser.add_argument("--stop-name", required=True)
    parser.add_argument("--direction-note", required=True)
    parser.add_argument("--observed-at", required=True, help="YYYY-MM-DD")
    parser.add_argument("--evidence-note", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY_PATH)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        output = propose(
            source_url=args.url,
            stop_name=args.stop_name,
            direction_note=args.direction_note,
            observed_at=args.observed_at,
            evidence_note=args.evidence_note,
            output_path=args.output,
            registry_path=args.registry,
        )
        print(output)
        return 0
    except (EvidenceProposalError, EvidenceRegistryError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
