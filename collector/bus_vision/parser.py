"""
collector/bus_vision/parser.py
---------------------------------------------------------
保存済みHTML文字列を DepartureRecord に変換する、ネットワーク非依存の
純粋な解析処理。

`parse_diagram_detail()` は初期プロトタイプ互換の旧・停留所中心Parser。
公開検索で確認できた実際の Bus-Vision `diagramDetail.html` は
「1便の系統/行先 + 複数停留所の時刻」という意味を持つため、新規実装は
`parse_trip_detail()` を使う。

Production DOM selector は未確認なので、このモジュールは実サイト向けの
selectorを決め打ちしない。必要要素が見つからない場合や情報が不足する場合は
推測・部分成功をせず ParseError で停止する。
"""
import re
from typing import List, Optional

from ..models import DepartureRecord
from .html_dom import Element, parse_html
from .selectors import ElementSpec, SelectorConfig, TripDetailSelectorConfig

_TIME_RE = re.compile(r"\d{1,2}:\d{2}")


class ParseError(RuntimeError):
    """HTML構造が想定と異なる場合に送出する。推測して処理を継続しない。"""


def _find_text(root: Element, spec: Optional[ElementSpec], *, required: bool, what: str) -> Optional[str]:
    if spec is None:
        return None
    tag, class_ = spec
    el = root.find(tag=tag, class_=class_)
    if el is None:
        if required:
            raise ParseError(f"{what} の要素が見つかりません(tag={tag!r}, class_={class_!r})")
        return None
    text = el.get_text(strip=True)
    if required and not text:
        raise ParseError(f"{what} の要素は見つかりましたが、テキストが空です")
    return text


def _resolve_page_value(
    root: Element,
    spec: Optional[ElementSpec],
    hint: Optional[str],
    *,
    what: str,
) -> str:
    """HTML selectorを指定した場合はHTML値を必須とし、未指定時だけhintを使う。

    selectorを設定したのに要素が消えた場合、hintで黙って救済するとDOM変更を
    見逃すためフォールバックしない。
    """
    if spec is not None:
        value = _find_text(root, spec, required=True, what=what)
        assert value is not None
        return value
    if hint:
        return hint
    raise ParseError(f"{what}を決定できません。selector または明示的なhintが必要です")


def _extract_time(text: str, *, what: str) -> str:
    match = _TIME_RE.search(text)
    if not match:
        raise ParseError(f"{what}から時刻を抽出できません(内容: {text!r})。推測で補完せず停止します")
    return match.group(0)


def parse_trip_detail(
    html: str,
    *,
    selector_config: TripDetailSelectorConfig,
    source_url: str,
    fetched_at: str,
    calendar_hint: Optional[str] = None,
    line_no_hint: Optional[str] = None,
    destination_hint: Optional[str] = None,
    direction_hint: Optional[str] = None,
) -> List[DepartureRecord]:
    """1便詳細ページを解析し、その便が通る各停留所のRecordを返す。

    公開検索で確認できた `diagramDetail.html` は、1つの系統/行先について
    `停留所 + 時刻` が順番に並ぶ便詳細ページである。この関数はその意味を
    モデル化する。

    Production DOMは未確認のため、line_no / destination / calendar をHTMLから
    取るselectorを指定しない場合は、呼び出し側が *_hint を明示する必要がある。
    URLや本文から未知の値を推測する処理は行わない。

    stop row が0件、必須要素が欠落、時刻が解釈不能、生成Recordが不正の
    いずれか1件でも発生した場合は、部分結果を返さず ParseError で停止する。
    """
    root = parse_html(html)

    line_no = _resolve_page_value(
        root,
        selector_config.line_no,
        line_no_hint,
        what="系統番号",
    )
    destination = _resolve_page_value(
        root,
        selector_config.destination,
        destination_hint,
        what="行先",
    )

    if selector_config.calendar_label is not None:
        calendar_label = _find_text(
            root,
            selector_config.calendar_label,
            required=True,
            what="曜日区分ラベル",
        )
        assert calendar_label is not None
        service = calendar_label
    else:
        service = calendar_hint
    if not service:
        raise ParseError(
            "曜日区分(service)を決定できません。calendar_hint を指定するか、"
            "selector_config.calendar_label を設定してください。"
        )

    row_tag, row_class = selector_config.stop_row
    rows = root.find_all(tag=row_tag, class_=row_class)
    if not rows:
        raise ParseError(
            f"停留所時刻行が1件も見つかりません(tag={row_tag!r}, class_={row_class!r})。"
            "HTML構造が想定と異なる可能性があります"
        )

    direction = direction_hint or destination
    records: List[DepartureRecord] = []

    for i, row in enumerate(rows):
        loc = f"{i + 1}件目の停留所時刻行"
        stop_name = _find_text(
            row,
            selector_config.stop_name,
            required=True,
            what=f"{loc}の停留所名",
        )
        time_text = _find_text(
            row,
            selector_config.time_cell,
            required=True,
            what=f"{loc}の時刻",
        )
        assert stop_name is not None
        assert time_text is not None
        departure_time = _extract_time(time_text, what=f"{loc}の時刻要素")

        record = DepartureRecord(
            stop_name=stop_name,
            departure_time=departure_time,
            line_no=line_no,
            headsign=destination,
            direction=direction,
            service=service,
            source_url=source_url,
            fetched_at=fetched_at,
        )
        errors = record.validate()
        if errors:
            raise ParseError(f"{loc}のレコードが不正です: {', '.join(errors)}")
        records.append(record)

    return records


def parse_diagram_detail(
    html: str,
    *,
    selector_config: SelectorConfig,
    source_url: str,
    fetched_at: str,
    calendar_hint: Optional[str] = None,
    direction_hint: Optional[str] = None,
) -> List[DepartureRecord]:
    """旧・停留所中心の合成fixture互換Parser。

    注意: この関数のDOMモデルを実Bus-Vision `diagramDetail.html` のproduction
    構造として扱わないこと。既存テスト/移行互換のため残している。
    新規の便詳細処理は `parse_trip_detail()` を使用する。
    """
    root = parse_html(html)

    stop_name = _find_text(root, selector_config.stop_name, required=True, what="停留所名")

    calendar_label = None
    if selector_config.calendar_label is not None:
        calendar_label = _find_text(root, selector_config.calendar_label, required=False, what="曜日区分ラベル")
    service = calendar_label or calendar_hint
    if not service:
        raise ParseError(
            "曜日区分(service)を決定できません。calendar_hint を指定するか、"
            "selector_config.calendar_label でHTML内のラベルを取得できるようにしてください。"
        )

    route_tag, route_class = selector_config.route_block
    route_blocks = root.find_all(tag=route_tag, class_=route_class)
    if not route_blocks:
        raise ParseError(
            f"系統ブロックが1件も見つかりません(tag={route_tag!r}, class_={route_class!r})。"
            "HTML構造が想定と異なる可能性があります(HTML解析失敗として停止します)。"
        )

    time_tag, time_class = selector_config.time_cell

    records: List[DepartureRecord] = []
    for i, block in enumerate(route_blocks):
        loc = f"{i + 1}件目の系統ブロック"

        line_no = _find_text(block, selector_config.line_no, required=True, what=f"{loc}の系統番号")
        destination = _find_text(block, selector_config.destination, required=True, what=f"{loc}の行先")
        direction = direction_hint or destination

        time_cells = block.find_all(tag=time_tag, class_=time_class)
        if not time_cells:
            raise ParseError(f"{loc}(系統{line_no})に発車時刻の要素が1件も見つかりません")

        for j, cell in enumerate(time_cells):
            text = cell.get_text(strip=True)
            departure_time = _extract_time(
                text,
                what=f"{loc}(系統{line_no})の{j + 1}件目の時刻セル",
            )
            record = DepartureRecord(
                stop_name=stop_name,
                departure_time=departure_time,
                line_no=line_no,
                headsign=destination,
                direction=direction,
                service=service,
                source_url=source_url,
                fetched_at=fetched_at,
            )
            errors = record.validate()
            if errors:
                raise ParseError(
                    f"{loc}(系統{line_no})の{j + 1}件目のレコードが不正です: {', '.join(errors)}"
                )
            records.append(record)

    return records
