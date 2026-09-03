"""
collector/bus_vision/stop_timetable.py
---------------------------------------------------------
保存済み `diagram.html` を「停留所/のりばの発車便列挙ページ」として解析する
ネットワーク非依存の純粋処理。

公開検索で確認できた意味だけをモデル化し、production DOM selectorは
決め打ちしない。呼び出し側が明示したselectorで、各発車時刻と便詳細リンクを
抽出する。

このモジュールはURLへアクセスしない。HTML文字列とsource_urlだけを受け取る。
1件でも時刻・リンクが不正なら部分結果を返さず ParseError で停止する。
"""
import re
from dataclasses import dataclass
from typing import List
from urllib.parse import urljoin, urlparse

from .html_dom import Element, parse_html
from .parser import ParseError
from .selectors import ElementSpec, StopTimetableSelectorConfig

_TIME_RE = re.compile(r"\d{1,2}:\d{2}")


@dataclass(frozen=True)
class StopTimetableDeparture:
    """停留所時刻表から得た1発車分の、便詳細へ進むための候補。"""

    departure_time: str
    detail_url: str
    source_url: str


def _find_required_element(root: Element, spec: ElementSpec, *, what: str) -> Element:
    tag, class_ = spec
    element = root.find(tag=tag, class_=class_)
    if element is None:
        raise ParseError(f"{what} の要素が見つかりません(tag={tag!r}, class_={class_!r})")
    return element


def _find_required_text(root: Element, spec: ElementSpec, *, what: str) -> str:
    element = _find_required_element(root, spec, what=what)
    text = element.get_text(strip=True)
    if not text:
        raise ParseError(f"{what} の要素は見つかりましたが、テキストが空です")
    return text


def _extract_time(text: str, *, what: str) -> str:
    match = _TIME_RE.search(text)
    if not match:
        raise ParseError(f"{what}から時刻を抽出できません(内容: {text!r})。推測で補完せず停止します")
    return match.group(0)


def _same_origin_detail_url(source_url: str, href: str, *, what: str) -> str:
    """相対hrefを絶対URL化し、source_urlと同一originだけを許可する。"""
    source = urlparse(source_url)
    if source.scheme not in ("http", "https") or not source.netloc:
        raise ParseError(f"source_url がHTTP(S)の絶対URLではありません: {source_url!r}")

    href = href.strip()
    if not href:
        raise ParseError(f"{what} のhrefが空です")

    resolved = urljoin(source_url, href)
    target = urlparse(resolved)
    if target.scheme not in ("http", "https") or not target.netloc:
        raise ParseError(f"{what} をHTTP(S)の絶対URLへ解決できません: {href!r}")
    if (target.scheme, target.netloc) != (source.scheme, source.netloc):
        raise ParseError(
            f"{what} がsource_urlと異なるoriginを指しています。"
            "保存HTML内の外部リンクを便詳細として追跡しません"
        )
    return resolved


def parse_stop_timetable(
    html: str,
    *,
    selector_config: StopTimetableSelectorConfig,
    source_url: str,
) -> List[StopTimetableDeparture]:
    """保存済み `diagram.html` から発車時刻と便詳細URLを列挙する。

    Production selectorは未確認なので、この関数はHTMLのclass/idを推測しない。
    selector_configで指定した発車行・時刻・リンクだけを読む。

    各候補はまだ最終 `DepartureRecord` ではない。次段でdetail_urlの保存HTMLを
    `parse_trip_detail()` に渡して系統/行先/各停留所時刻を確定するための入口。
    """
    root = parse_html(html)
    row_tag, row_class = selector_config.departure_item
    rows = root.find_all(tag=row_tag, class_=row_class)
    if not rows:
        raise ParseError(
            f"発車便が1件も見つかりません(tag={row_tag!r}, class_={row_class!r})。"
            "HTML構造が想定と異なる可能性があります"
        )

    departures: List[StopTimetableDeparture] = []
    for i, row in enumerate(rows):
        loc = f"{i + 1}件目の発車便"
        time_text = _find_required_text(
            row,
            selector_config.time_cell,
            what=f"{loc}の発車時刻",
        )
        departure_time = _extract_time(time_text, what=f"{loc}の発車時刻要素")

        link = _find_required_element(
            row,
            selector_config.detail_link,
            what=f"{loc}の便詳細リンク",
        )
        href = link.attrs.get("href")
        if href is None:
            raise ParseError(f"{loc}の便詳細リンクにhref属性がありません")
        detail_url = _same_origin_detail_url(
            source_url,
            href,
            what=f"{loc}の便詳細リンク",
        )

        departures.append(
            StopTimetableDeparture(
                departure_time=departure_time,
                detail_url=detail_url,
                source_url=source_url,
            )
        )

    return departures
