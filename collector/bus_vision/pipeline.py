"""
collector/bus_vision/pipeline.py
---------------------------------------------------------
保存済みBus-Vision HTMLだけを使い、停留所時刻表から便詳細を経由して
指定停留所の DepartureRecord を組み立てるネットワーク非依存パイプライン。

このモジュール自身はHTTPアクセスを一切行わない。
- stop timetable HTML: 呼び出し側から文字列で受け取る
- detail HTML: detail URL -> HTML のmappingで受け取る

1便でも証拠が欠ける・時刻が食い違う・対象停留所を一意に特定できない場合、
部分結果を返さず ParseError で停止する。
"""
from typing import List, Mapping, Optional

from ..models import DepartureRecord
from .identifiers import extract_diagram_detail_identifiers
from .parser import ParseError, parse_trip_detail
from .selectors import StopTimetableSelectorConfig, TripDetailSelectorConfig
from .stop_timetable import parse_stop_timetable


def assemble_target_departures(
    stop_timetable_html: str,
    *,
    stop_selector_config: StopTimetableSelectorConfig,
    stop_source_url: str,
    detail_html_by_url: Mapping[str, str],
    trip_selector_config: TripDetailSelectorConfig,
    target_stop_name: str,
    fetched_at: str,
    direction_hint: Optional[str] = None,
) -> List[DepartureRecord]:
    """停留所時刻表と保存済み便詳細HTMLを結合して対象停留所便を返す。

    `diagram.html` 側の発車時刻は「便詳細への列挙・整合確認」に使い、
    最終レコードの系統/行先/停留所時刻は `parse_trip_detail()` の結果を正とする。

    detail URLに `dateDivCd` が存在する場合だけ、その生値をcalendar_hintとして
    trip parserへ渡す。欠損時に曜日を推測しないため、HTML側calendar selectorも
    無ければ `parse_trip_detail()` が fail closed する。
    """
    if not target_stop_name:
        raise ParseError("target_stop_name が空です")
    if not fetched_at:
        raise ParseError("fetched_at が空です")

    candidates = parse_stop_timetable(
        stop_timetable_html,
        selector_config=stop_selector_config,
        source_url=stop_source_url,
    )

    result: List[DepartureRecord] = []
    for i, candidate in enumerate(candidates):
        loc = f"{i + 1}件目の発車便"
        detail_html = detail_html_by_url.get(candidate.detail_url)
        if detail_html is None:
            raise ParseError(
                f"{loc}の便詳細HTMLが保存済みmappingにありません: {candidate.detail_url}"
            )

        identifiers = extract_diagram_detail_identifiers(candidate.detail_url)
        trip_records = parse_trip_detail(
            detail_html,
            selector_config=trip_selector_config,
            source_url=candidate.detail_url,
            fetched_at=fetched_at,
            calendar_hint=identifiers.date_div_cd,
            direction_hint=direction_hint,
        )

        target_records = [r for r in trip_records if r.stop_name == target_stop_name]
        if len(target_records) != 1:
            raise ParseError(
                f"{loc}の便詳細で対象停留所 {target_stop_name!r} が"
                f"{len(target_records)}件見つかりました。1件だけ必要です"
            )

        target = target_records[0]
        if target.departure_time != candidate.departure_time:
            raise ParseError(
                f"{loc}の時刻が停留所時刻表({candidate.departure_time})と"
                f"便詳細({target.departure_time})で一致しません"
            )
        result.append(target)

    return result
