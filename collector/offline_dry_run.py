"""Verified Evidence Registryを入口にした完全オフラインdry-run CLI。

このモジュールはHTTPクライアントをimportせず、ローカル保存済みHTMLだけを
既存Bus-Vision parser/pipelineへ渡す。Registry未登録のstop timetable URLや
manifestの不備は推測で補完せずfail closedする。

Usage:
    python3 -m collector.offline_dry_run --list-targets
    python3 -m collector.offline_dry_run --manifest /path/to/manifest.json
    python3 -m collector.offline_dry_run --manifest /path/to/manifest.json --output-csv /tmp/timetable.csv

`--output-csv`を指定した場合もproduction config/dateDivCdを推測しない。
Verified Calendar Evidence Registryに存在するserviceだけを既存CSV converterへ渡す。
本番data/timetable*.jsonは一切更新しない。

manifest schemaVersion=1 の例:
{
  "schemaVersion": 1,
  "sourceUrl": "https://oc.bus-vision.jp/.../diagram.html?...",
  "targetStopName": "鶴町三丁目",
  "fetchedAt": "2026-09-03T12:00:00+09:00",
  "directionHint": "なんば方面",
  "stopTimetableHtml": "stop.html",
  "details": [
    {"url": "https://oc.bus-vision.jp/.../diagramDetail.html?...", "html": "detail-1.html"}
  ],
  "selectors": {
    "stopTimetable": {
      "departureItem": {"tag": "div", "class": "departure"},
      "timeCell": {"tag": "span", "class": "time"},
      "detailLink": {"tag": "a", "class": "detail"}
    },
    "tripDetail": {
      "stopRow": {"tag": "div", "class": "trip-stop"},
      "stopName": {"tag": "span", "class": "stop"},
      "timeCell": {"tag": "span", "class": "time"},
      "lineNo": {"tag": "span", "class": "line-no"},
      "destination": {"tag": "span", "class": "destination"},
      "calendarLabel": null
    }
  }
}

DOM/class名はmanifestで明示する。production selectorの既定値は持たない。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

from .bus_vision.calendar_evidence import (
    DEFAULT_CALENDAR_REGISTRY_PATH,
    CalendarEvidenceError,
    calendar_to_code_map,
)
from .bus_vision.evidence_registry import (
    DEFAULT_REGISTRY_PATH,
    EvidenceRegistryError,
    VerifiedStopTimetableEvidence,
    load_evidence_registry,
)
from .bus_vision.parser import ParseError
from .bus_vision.pipeline import assemble_target_departures
from .bus_vision.selectors import (
    ElementSpec,
    StopTimetableSelectorConfig,
    TripDetailSelectorConfig,
)
from .convert_to_timetable_csv import (
    convert,
    load_route_index,
    load_stop_index,
    write_csv,
)
from .models import DepartureRecord

MANIFEST_SCHEMA_VERSION = 1
DEFAULT_STOPS_PATH = Path("data/stops.json")
DEFAULT_ROUTES_PATH = Path("data/routes.json")


class DryRunError(RuntimeError):
    """dry-run入力bundleが不完全・不整合・未検証の場合に送出する。"""


@dataclass(frozen=True)
class DryRunBundle:
    source_url: str
    target_stop_name: str
    fetched_at: str
    direction_hint: Optional[str]
    stop_timetable_html: str
    detail_html_by_url: Mapping[str, str]
    stop_selectors: StopTimetableSelectorConfig
    trip_selectors: TripDetailSelectorConfig


def _require_object(value: Any, *, where: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise DryRunError(f"{where} must be an object")
    return value


def _require_list(value: Any, *, where: str) -> List[Any]:
    if not isinstance(value, list) or not value:
        raise DryRunError(f"{where} must be a non-empty array")
    return value


def _require_nonempty_string(obj: Mapping[str, Any], key: str, *, where: str) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        raise DryRunError(f"{where}.{key} must be a non-empty string")
    return value.strip()


def _optional_nonempty_string(obj: Mapping[str, Any], key: str, *, where: str) -> Optional[str]:
    value = obj.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise DryRunError(f"{where}.{key} must be null or a non-empty string")
    return value.strip()


def _element_spec(value: Any, *, where: str, optional: bool = False) -> Optional[ElementSpec]:
    if value is None:
        if optional:
            return None
        raise DryRunError(f"{where} is required")
    obj = _require_object(value, where=where)
    tag = _require_nonempty_string(obj, "tag", where=where)
    class_value = obj.get("class")
    if class_value is not None and (not isinstance(class_value, str) or not class_value.strip()):
        raise DryRunError(f"{where}.class must be null or a non-empty string")
    class_name = class_value.strip() if isinstance(class_value, str) else None
    return (tag, class_name)


def _build_stop_selectors(raw: Any) -> StopTimetableSelectorConfig:
    obj = _require_object(raw, where="selectors.stopTimetable")
    departure_item = _element_spec(obj.get("departureItem"), where="selectors.stopTimetable.departureItem")
    time_cell = _element_spec(obj.get("timeCell"), where="selectors.stopTimetable.timeCell")
    detail_link = _element_spec(obj.get("detailLink"), where="selectors.stopTimetable.detailLink")
    assert departure_item is not None and time_cell is not None and detail_link is not None
    return StopTimetableSelectorConfig(
        departure_item=departure_item,
        time_cell=time_cell,
        detail_link=detail_link,
    )


def _build_trip_selectors(raw: Any) -> TripDetailSelectorConfig:
    obj = _require_object(raw, where="selectors.tripDetail")
    stop_row = _element_spec(obj.get("stopRow"), where="selectors.tripDetail.stopRow")
    stop_name = _element_spec(obj.get("stopName"), where="selectors.tripDetail.stopName")
    time_cell = _element_spec(obj.get("timeCell"), where="selectors.tripDetail.timeCell")

    # v1 CLIではline/destinationをHTML selectorから明示取得する。
    # 未確認値をmanifest hintで補う機能はまだ持たせない。
    line_no = _element_spec(obj.get("lineNo"), where="selectors.tripDetail.lineNo")
    destination = _element_spec(obj.get("destination"), where="selectors.tripDetail.destination")
    calendar_label = _element_spec(
        obj.get("calendarLabel"),
        where="selectors.tripDetail.calendarLabel",
        optional=True,
    )
    assert stop_row is not None and stop_name is not None and time_cell is not None
    assert line_no is not None and destination is not None
    return TripDetailSelectorConfig(
        stop_row=stop_row,
        stop_name=stop_name,
        time_cell=time_cell,
        line_no=line_no,
        destination=destination,
        calendar_label=calendar_label,
    )


def _read_utf8_file(path: Path, *, what: str) -> str:
    try:
        if not path.is_file():
            raise DryRunError(f"{what} file not found: {path}")
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise DryRunError(f"{what} is not valid UTF-8: {path}") from exc
    except OSError as exc:
        raise DryRunError(f"failed to read {what}: {path}: {exc}") from exc


def _resolve_local_path(manifest_dir: Path, raw_path: str, *, what: str) -> Path:
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = manifest_dir / candidate
    return candidate.resolve()


def _validate_fetched_at(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise DryRunError("fetchedAt must be ISO8601, e.g. 2026-09-03T12:00:00+09:00") from exc
    if parsed.tzinfo is None:
        raise DryRunError("fetchedAt must include a timezone offset")
    return value


def _find_verified_entry(
    entries: Iterable[VerifiedStopTimetableEvidence],
    *,
    source_url: str,
    target_stop_name: str,
) -> VerifiedStopTimetableEvidence:
    matches = [entry for entry in entries if entry.source_url == source_url]
    if len(matches) != 1:
        raise DryRunError(
            "sourceUrl is not exactly one verified Evidence Registry entry; "
            "unverified/guessed URLs cannot be dry-run targets"
        )
    entry = matches[0]
    if entry.stop_name != target_stop_name:
        raise DryRunError(
            f"targetStopName {target_stop_name!r} does not match verified registry stop "
            f"{entry.stop_name!r}"
        )
    return entry


def load_dry_run_bundle(
    manifest_path: Path | str,
    *,
    registry_path: Path | str = DEFAULT_REGISTRY_PATH,
) -> DryRunBundle:
    """manifestとローカルHTMLを読み、検証済みbundleへ変換する。ネットワークなし。"""
    manifest_path = Path(manifest_path).expanduser().resolve()
    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise DryRunError(f"manifest file not found: {manifest_path}") from exc
    except json.JSONDecodeError as exc:
        raise DryRunError(f"manifest JSON is invalid: {exc}") from exc
    except OSError as exc:
        raise DryRunError(f"failed to read manifest: {manifest_path}: {exc}") from exc

    root = _require_object(document, where="manifest")
    if root.get("schemaVersion") != MANIFEST_SCHEMA_VERSION:
        raise DryRunError(
            f"schemaVersion must be {MANIFEST_SCHEMA_VERSION}; got {root.get('schemaVersion')!r}"
        )

    template_state = root.get("templateState")
    if template_state is not None and template_state != "ready":
        raise DryRunError(
            "manifest templateState must be 'ready' before dry-run; "
            "incomplete scaffold templates cannot be executed"
        )

    source_url = _require_nonempty_string(root, "sourceUrl", where="manifest")
    target_stop_name = _require_nonempty_string(root, "targetStopName", where="manifest")
    fetched_at = _validate_fetched_at(_require_nonempty_string(root, "fetchedAt", where="manifest"))
    direction_hint = _optional_nonempty_string(root, "directionHint", where="manifest")

    verified_entries = load_evidence_registry(registry_path)
    _find_verified_entry(
        verified_entries,
        source_url=source_url,
        target_stop_name=target_stop_name,
    )

    selectors = _require_object(root.get("selectors"), where="selectors")
    stop_selectors = _build_stop_selectors(selectors.get("stopTimetable"))
    trip_selectors = _build_trip_selectors(selectors.get("tripDetail"))

    manifest_dir = manifest_path.parent
    stop_html_path_raw = _require_nonempty_string(root, "stopTimetableHtml", where="manifest")
    stop_html_path = _resolve_local_path(
        manifest_dir,
        stop_html_path_raw,
        what="stopTimetableHtml",
    )
    stop_timetable_html = _read_utf8_file(stop_html_path, what="stop timetable HTML")

    details = _require_list(root.get("details"), where="manifest.details")
    detail_html_by_url: Dict[str, str] = {}
    for index, raw_detail in enumerate(details):
        detail = _require_object(raw_detail, where=f"manifest.details[{index}]")
        url = _require_nonempty_string(detail, "url", where=f"manifest.details[{index}]")
        html_raw = _require_nonempty_string(detail, "html", where=f"manifest.details[{index}]")
        if url in detail_html_by_url:
            raise DryRunError(f"duplicate detail URL in manifest.details[{index}]: {url}")
        html_path = _resolve_local_path(
            manifest_dir,
            html_raw,
            what=f"manifest.details[{index}].html",
        )
        detail_html_by_url[url] = _read_utf8_file(
            html_path,
            what=f"detail HTML #{index + 1}",
        )

    return DryRunBundle(
        source_url=source_url,
        target_stop_name=target_stop_name,
        fetched_at=fetched_at,
        direction_hint=direction_hint,
        stop_timetable_html=stop_timetable_html,
        detail_html_by_url=detail_html_by_url,
        stop_selectors=stop_selectors,
        trip_selectors=trip_selectors,
    )


def run_dry_run(
    manifest_path: Path | str,
    *,
    registry_path: Path | str = DEFAULT_REGISTRY_PATH,
) -> List[DepartureRecord]:
    """ローカルbundleを既存pipelineへ通す。production時刻表は一切書き換えない。"""
    bundle = load_dry_run_bundle(manifest_path, registry_path=registry_path)
    return assemble_target_departures(
        bundle.stop_timetable_html,
        stop_selector_config=bundle.stop_selectors,
        stop_source_url=bundle.source_url,
        detail_html_by_url=bundle.detail_html_by_url,
        trip_selector_config=bundle.trip_selectors,
        target_stop_name=bundle.target_stop_name,
        fetched_at=bundle.fetched_at,
        direction_hint=bundle.direction_hint,
    )


def compile_records_to_csv(
    records: Sequence[DepartureRecord],
    output_path: Path | str,
    *,
    calendar_registry_path: Path | str = DEFAULT_CALENDAR_REGISTRY_PATH,
    stops_path: Path | str = DEFAULT_STOPS_PATH,
    routes_path: Path | str = DEFAULT_ROUTES_PATH,
) -> int:
    """Validated dry-run records -> long-format CSV using verified-only mappings.

    Writes atomically only after every record passes stop/route/calendar validation.
    Existing output is never truncated by a failed validation attempt.
    """
    stop_index = load_stop_index(Path(stops_path))
    route_index = load_route_index(Path(routes_path))
    verified_calendar_map = calendar_to_code_map(calendar_registry_path)
    rows, errors = convert(
        [record.as_dict() for record in records],
        stop_index,
        route_index,
        verified_calendar_map,
    )
    if errors:
        raise DryRunError(
            "CSV compilation failed closed: " + " | ".join(errors[:10])
        )

    output_path = Path(output_path).expanduser().resolve()
    if output_path.suffix.lower() != ".csv":
        raise DryRunError("--output-csv path must end with .csv")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    tmp_name = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=f".{output_path.name}.",
            suffix=".tmp",
            dir=output_path.parent,
            delete=False,
        ) as tmp:
            tmp_name = tmp.name
        tmp_path = Path(tmp_name)
        write_csv(rows, tmp_path)
        os.replace(tmp_path, output_path)
    except OSError as exc:
        if tmp_name:
            try:
                Path(tmp_name).unlink(missing_ok=True)
            except OSError:
                pass
        raise DryRunError(f"failed to write CSV atomically: {exc}") from exc

    return len(rows)


def list_verified_targets(
    registry_path: Path | str = DEFAULT_REGISTRY_PATH,
) -> List[Dict[str, str]]:
    """Registryのverified対象を機械可読な辞書で返す。"""
    return [
        {
            "stopName": entry.stop_name,
            "directionNote": entry.direction_note,
            "sourceUrl": entry.source_url,
            "stopCd": entry.stop_cd,
            "poleCd": entry.pole_cd,
            "strLineList": entry.str_line_list,
            "observedAt": entry.observed_at,
        }
        for entry in load_evidence_registry(registry_path)
    ]


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Verified Bus-Vision evidenceを使った完全オフラインdry-run",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--list-targets",
        action="store_true",
        help="Verified Evidence Registryの登録対象をJSON表示する",
    )
    mode.add_argument(
        "--manifest",
        type=Path,
        help="ローカルHTML bundle manifest(JSON)を検証・解析する",
    )
    parser.add_argument(
        "--registry",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Stop Evidence Registry JSON path",
    )
    parser.add_argument(
        "--calendar-registry",
        type=Path,
        default=DEFAULT_CALENDAR_REGISTRY_PATH,
        help="Verified Calendar Evidence Registry JSON path",
    )
    parser.add_argument("--stops", type=Path, default=DEFAULT_STOPS_PATH)
    parser.add_argument("--routes", type=Path, default=DEFAULT_ROUTES_PATH)
    parser.add_argument(
        "--output-csv",
        type=Path,
        help="manifest dry-run成功時だけlong-format CSVをatomic出力する",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    try:
        if args.list_targets:
            if args.output_csv is not None:
                raise DryRunError("--output-csv requires --manifest")
            payload: Any = list_verified_targets(args.registry)
        else:
            records = run_dry_run(args.manifest, registry_path=args.registry)
            payload = [record.as_dict() for record in records]
            if args.output_csv is not None:
                compile_records_to_csv(
                    records,
                    args.output_csv,
                    calendar_registry_path=args.calendar_registry,
                    stops_path=args.stops,
                    routes_path=args.routes,
                )
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    except (DryRunError, EvidenceRegistryError, CalendarEvidenceError, ParseError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
