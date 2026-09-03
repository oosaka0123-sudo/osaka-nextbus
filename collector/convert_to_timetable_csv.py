#!/usr/bin/env python3
"""
collector/convert_to_timetable_csv.py
---------------------------------------------------------
DepartureRecord JSON arrays are converted to the existing long-format CSV
(routeId,direction,destination,calendar,time) used by timetable-csv-to-json.mjs.

This module is completely network-free. It reads only local JSON data.

Safety rules:
- stop_name must match data/stops.json after NFKC + trim only.
- line_no first requires an exact route label at the same stop. If the Bus-Vision value
  is digits only (e.g. "87") and exact matching fails, one deterministic display-format
  fallback ("87号") is allowed. No fuzzy matching or route guessing is performed.
- service/dateDivCd must exist in an explicitly supplied calendar mapping. Unknown codes
  fail closed.
- all row errors are collected; callers must not write output when any error exists.

The legacy CLI still supports collector.config.DATE_DIV_CD for future production use, but
`--calendar-registry` selects the separate Verified Calendar Evidence Registry without
modifying production config.py.
"""
import argparse
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path


def _normalize(s: str) -> str:
    return unicodedata.normalize("NFKC", str(s)).strip()


def load_stop_index(stops_path: Path) -> dict:
    """Return `{normalized stop name: stopId}` and reject duplicate normalized names."""
    stops = json.loads(stops_path.read_text(encoding="utf-8"))
    result = {}
    for stop in stops:
        key = _normalize(stop["name"])
        stop_id = stop["id"]
        if key in result and result[key] != stop_id:
            raise ValueError(f"duplicate normalized stop name {key!r} in {stops_path}")
        result[key] = stop_id
    return result


def load_route_index(routes_path: Path) -> dict:
    """Return `{(stopId, normalized route label): routeId}` and reject duplicates."""
    routes = json.loads(routes_path.read_text(encoding="utf-8"))
    result = {}
    for route in routes:
        key = (route["stopId"], _normalize(route["label"]))
        route_id = route["id"]
        if key in result and result[key] != route_id:
            raise ValueError(f"duplicate stop/route label {key!r} in {routes_path}")
        result[key] = route_id
    return result


def resolve_route_id(stop_id: str, line_no: str, route_index: dict):
    """Resolve one route ID using exact match or one explicit Osaka-bus display suffix.

    `87` -> `87号` is a formatting bridge, not a fuzzy guess. We never strip arbitrary
    text, compare destinations, use nearby stops, or choose between multiple fuzzy matches.
    """
    normalized = _normalize(line_no)
    exact = route_index.get((stop_id, normalized))
    if exact is not None:
        return exact

    if re.fullmatch(r"\d+", normalized):
        with_suffix = route_index.get((stop_id, f"{normalized}号"))
        if with_suffix is not None:
            return with_suffix

    return None


REQUIRED_RECORD_FIELDS = (
    "stop_name",
    "departure_time",
    "line_no",
    "headsign",
    "direction",
    "service",
)


def convert(records, stop_index: dict, route_index: dict, date_div_cd_map: dict):
    """Convert record dicts to `(csv_rows, errors)` using an explicit calendar map.

    `date_div_cd_map` has the existing `{calendar: dateDivCd}` shape. It may be partial:
    missing calendar codes are intentionally unverified and any record using them fails.
    """
    code_to_calendar = {
        str(code): name for name, code in date_div_cd_map.items() if code is not None
    }

    csv_rows = []
    errors = []

    for i, rec in enumerate(records):
        loc = f"{i + 1}件目(stop_name={rec.get('stop_name')!r}, line_no={rec.get('line_no')!r})"

        missing = [f for f in REQUIRED_RECORD_FIELDS if not rec.get(f)]
        if missing:
            errors.append(f"{loc}: 必須フィールドが空です: {', '.join(missing)}")
            continue

        stop_key = _normalize(rec["stop_name"])
        stop_id = stop_index.get(stop_key)
        if stop_id is None:
            errors.append(
                f"{loc}: data/stops.json に一致する停留所名が見つかりません"
                f"(\"{rec['stop_name']}\")"
            )
            continue

        route_id = resolve_route_id(stop_id, rec["line_no"], route_index)
        if route_id is None:
            errors.append(
                f"{loc}: data/routes.json に一致する系統が見つかりません"
                f"(stopId={stop_id}, line_no=\"{rec['line_no']}\")"
            )
            continue

        calendar = code_to_calendar.get(str(rec["service"]))
        if calendar is None:
            errors.append(
                f"{loc}: service(\"{rec['service']}\")に対応する平日/土曜/休日の"
                "verified mappingがありません(推測禁止のため停止)"
            )
            continue

        csv_rows.append(
            {
                "routeId": route_id,
                "direction": rec["direction"],
                "destination": rec["headsign"],
                "calendar": calendar,
                "time": rec["departure_time"],
            }
        )

    return csv_rows, errors


def write_csv(rows, output_path: Path) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["routeId", "direction", "destination", "calendar", "time"]
        )
        writer.writeheader()
        writer.writerows(rows)


def _load_cli_calendar_map(calendar_registry):
    if calendar_registry is not None:
        from .bus_vision.calendar_evidence import calendar_to_code_map

        return calendar_to_code_map(calendar_registry)

    # Legacy/future production path. Keeping this does not change config or permissions.
    from . import config

    return config.DATE_DIV_CD


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", required=True, help="収集済みレコードのJSON配列ファイル")
    ap.add_argument("--stops", default="data/stops.json")
    ap.add_argument("--routes", default="data/routes.json")
    ap.add_argument("--output", required=True, help="出力するlong-format CSV")
    ap.add_argument(
        "--calendar-registry",
        default=None,
        help="Verified calendar evidence JSON。指定時はconfig.DATE_DIV_CDを使用しない",
    )
    args = ap.parse_args(argv)

    records = json.loads(Path(args.input).read_text(encoding="utf-8"))
    stop_index = load_stop_index(Path(args.stops))
    route_index = load_route_index(Path(args.routes))
    date_div_cd_map = _load_cli_calendar_map(args.calendar_registry)

    rows, errors = convert(records, stop_index, route_index, date_div_cd_map)

    if errors:
        print(
            f"変換を中断しました。{len(errors)}件のエラーがあります"
            "(推測でのマッチ・補完はしません):",
            file=sys.stderr,
        )
        for error in errors[:30]:
            print(f"  {error}", file=sys.stderr)
        if len(errors) > 30:
            print(f"  ...ほか{len(errors) - 30}件", file=sys.stderr)
        return 1

    write_csv(rows, Path(args.output))
    print(f"変換完了: {len(rows)}件のCSV行を書き出しました → {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
