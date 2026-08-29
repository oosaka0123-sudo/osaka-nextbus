#!/usr/bin/env python3
"""
collector/convert_to_timetable_csv.py
---------------------------------------------------------
収集済みの DepartureRecord 群(JSON配列ファイル)を、既存の
scripts/timetable-csv-to-json.mjs がそのまま読み込める long format CSV
(routeId,direction,destination,calendar,time) に変換する。

    Bus-Vision (許可後)                     このスクリプト                既存ツール(そのまま流用)
    diagramDetail.html
        │ parser.py (要許可後実装)
        ▼
    収集レコードJSON ─────────────► timetable.csv ─────────────► data/timetable.json
    (stop_name/line_no/...)   convert_to_timetable_csv.py   scripts/timetable-csv-to-json.mjs

このスクリプト自体はネットワークアクセスを一切行わない
(既存の data/stops.json / data/routes.json をローカルファイルとして
読み込むだけ)。

変換ルール:
- stop_name → data/stops.json の name から stopId を検索する
  (NFKC正規化・前後空白除去のみ行い、表記ゆれで一致しない場合は
  推測せずエラーとして報告する)。
- line_no   → 同じ stopId を持つ data/routes.json の label と比較して
  routeId (routes.json の id) を検索する。
- service(dateDivCd等の生コード) → config.DATE_DIV_CD の
  weekday/saturday/holiday マッピングで平日/土曜/休日に変換する。
  マッピングが未確定(None)のままの値は必ずエラーになる
  (config.py 側で許可後に実際の値を確認して埋めるまで、
  このスクリプトは1件も変換を完了させない)。

見つからない・変換できない行はスキップせず、全件のエラーを収集してから
変換を中断する(scripts/timetable-csv-to-json.mjs と同じ方針。
架空マッチ・部分的な変換結果を残さないため)。
"""
import argparse
import csv
import json
import sys
import unicodedata
from pathlib import Path


def _normalize(s: str) -> str:
    return unicodedata.normalize("NFKC", str(s)).strip()


def load_stop_index(stops_path: Path) -> dict:
    """{ 正規化した停留所名: stopId } を返す。"""
    stops = json.loads(stops_path.read_text(encoding="utf-8"))
    return {_normalize(s["name"]): s["id"] for s in stops}


def load_route_index(routes_path: Path) -> dict:
    """{ (stopId, 正規化した系統名): routeId } を返す。"""
    routes = json.loads(routes_path.read_text(encoding="utf-8"))
    return {(r["stopId"], _normalize(r["label"])): r["id"] for r in routes}


REQUIRED_RECORD_FIELDS = (
    "stop_name",
    "departure_time",
    "line_no",
    "headsign",
    "direction",
    "service",
)


def convert(records, stop_index: dict, route_index: dict, date_div_cd_map: dict):
    """records(dict のリスト) → (csv_rows, errors) を返す。

    errors が1件でもあれば csv_rows は使用しないこと
    (呼び出し側は必ず errors を先にチェックする)。
    """
    code_to_calendar = {
        code: name for name, code in date_div_cd_map.items() if code is not None
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

        line_key = (stop_id, _normalize(rec["line_no"]))
        route_id = route_index.get(line_key)
        if route_id is None:
            errors.append(
                f"{loc}: data/routes.json に一致する系統が見つかりません"
                f"(stopId={stop_id}, line_no=\"{rec['line_no']}\")"
            )
            continue

        calendar = code_to_calendar.get(rec["service"])
        if calendar is None:
            errors.append(
                f"{loc}: service(\"{rec['service']}\")に対応する平日/土曜/休日の"
                "マッピングが config.DATE_DIV_CD に未設定です(推測禁止のため停止)"
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
    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["routeId", "direction", "destination", "calendar", "time"]
        )
        writer.writeheader()
        writer.writerows(rows)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", required=True, help="収集済みレコードのJSON配列ファイル")
    ap.add_argument("--stops", default="data/stops.json")
    ap.add_argument("--routes", default="data/routes.json")
    ap.add_argument("--output", required=True, help="出力するCSVファイル(timetable-csv-to-json.mjsへの入力)")
    args = ap.parse_args(argv)

    from . import config  # 遅延importでテストからの直接呼び出しを妨げない

    records = json.loads(Path(args.input).read_text(encoding="utf-8"))
    stop_index = load_stop_index(Path(args.stops))
    route_index = load_route_index(Path(args.routes))

    rows, errors = convert(records, stop_index, route_index, config.DATE_DIV_CD)

    if errors:
        print(
            f"変換を中断しました。{len(errors)}件のエラーがあります"
            "(推測でのマッチ・補完はしません):",
            file=sys.stderr,
        )
        for e in errors[:30]:
            print(f"  {e}", file=sys.stderr)
        if len(errors) > 30:
            print(f"  ...ほか{len(errors) - 30}件", file=sys.stderr)
        return 1

    write_csv(rows, Path(args.output))
    print(f"変換完了: {len(rows)}件のCSV行を書き出しました → {args.output}")
    print("続けて次のコマンドで data/timetable.json に変換してください:")
    print(f"  node scripts/timetable-csv-to-json.mjs --input {args.output} --output data/timetable.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
