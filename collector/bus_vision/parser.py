"""
collector/bus_vision/parser.py
---------------------------------------------------------
diagramDetail.html(時刻表詳細ページ)のHTML文字列を解析し、
DepartureRecord のリストに変換する。

collector のネットワーク層(http_client.py / checkpoint.py / config.py)
には一切依存しない。入力はHTML文字列と SelectorConfig のみで、
ネットワークアクセスは一切発生しない、オフラインで完結する
純粋な変換処理。

安全要件「HTML解析失敗時は停止」に対応するため、SelectorConfig で
指定した要素が見つからない場合、行ごとに必要な情報(系統番号・行先・
時刻のいずれか)が欠けている場合、または時刻として解釈できない文字列の
場合は、値を推測して埋めたり黙ってスキップしたりせず、ParseError を
送出してその場で処理を止める。
"""
import re
from typing import List, Optional

from ..models import DepartureRecord
from .html_dom import Element, parse_html
from .selectors import ElementSpec, SelectorConfig

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


def parse_diagram_detail(
    html: str,
    *,
    selector_config: SelectorConfig,
    source_url: str,
    fetched_at: str,
    calendar_hint: Optional[str] = None,
    direction_hint: Optional[str] = None,
) -> List[DepartureRecord]:
    """diagramDetail.html の内容を解析し、DepartureRecordのリストを返す。

    calendar_hint: このページが表す曜日区分を表す文字列(例: dateDivCdの値、
      または "weekday"等)。dateDivCdの意味付けが未確認のため、既定では
      HTMLから自動判定せず、呼び出し側(どのdateDivCd値でこのページを
      取得したか把握している側)が明示的に渡す運用とする。
      selector_config.calendar_label が指定されている場合は、そちらで
      取得したHTML内の表示ラベルを優先する。
    direction_hint: 方面名。HTML側に方面固有の見出しが無い場合に使う
      フォールバック値。省略時は行先(destination)をそのまま方面としても使う。

    見つかった系統ブロックが0件、時刻セルが0件、または時刻として解釈
    できないセルが1件でもあれば、その場で ParseError を送出して停止する
    (部分的な結果を返さない)。
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
            m = _TIME_RE.search(text)
            if not m:
                raise ParseError(
                    f"{loc}(系統{line_no})の{j + 1}件目の時刻セルから時刻を抽出できません"
                    f"(セルの内容: {text!r})。推測で補完せず停止します。"
                )
            record = DepartureRecord(
                stop_name=stop_name,
                departure_time=m.group(0),
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
