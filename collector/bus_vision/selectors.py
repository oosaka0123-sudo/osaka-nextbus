"""
collector/bus_vision/selectors.py
---------------------------------------------------------
保存済みBus-Vision HTMLを解析する際に使う「どこを見るか」の設定。

【最重要】実際のBus-Vision HTMLのDOM selectorは未確認である。
このモジュールは実サイト向けの既定値を一切提供しない。
Production selector は、実ページの最小HTML構造を確認した後にだけ
呼び出し側で明示的に組み立てる。

ページの意味は公開検索で確認できた範囲だけ分離して扱う:
- diagram.html: 停留所/のりば時刻表 + 便詳細リンク列挙
- diagramDetail.html: 1便 + 複数停留所時刻

既存 SelectorConfig は初期プロトタイプ互換のため残している。
"""
from dataclasses import dataclass
from typing import Optional, Tuple

# (tag, class_) の組で1つの要素を指定する。class_ は None なら「タグ名だけで一致」。
ElementSpec = Tuple[str, Optional[str]]


@dataclass(frozen=True)
class SelectorConfig:
    """旧・停留所中心の合成fixture用Selector契約。

    この形を実Bus-Visionの diagramDetail.html のproduction構造だと
    解釈しないこと。既存テスト/移行互換のため残す。
    """

    stop_name: ElementSpec
    route_block: ElementSpec
    line_no: ElementSpec
    destination: ElementSpec
    time_cell: ElementSpec
    calendar_label: Optional[ElementSpec] = None


@dataclass(frozen=True)
class StopTimetableSelectorConfig:
    """`diagram.html` 停留所時刻表の意味だけを表すSelector契約。

    公開検索では、停留所/のりば単位の時刻表から各発車時刻を選ぶと
    その便の詳細へ進めることを確認している。この設定はその役割だけを
    モデル化し、実サイトのclass名・id名などは一切決め打ちしない。

    - departure_item: 1便/1発車分として繰り返される親要素
    - time_cell:      departure_item 内の発車時刻要素
    - detail_link:    departure_item 内の便詳細リンク要素。hrefを必須とする
    """

    departure_item: ElementSpec
    time_cell: ElementSpec
    detail_link: ElementSpec


@dataclass(frozen=True)
class TripDetailSelectorConfig:
    """1便詳細ページを「1便 + 複数停留所時刻」として読むSelector契約。

    公開検索で確認できた diagramDetail.html は、1つの系統/行先について
    停留所と時刻が順番に並ぶ便詳細ページである。この設定はその意味だけを
    モデル化し、実サイトのclass名などは一切決め打ちしない。

    - stop_row:      1停留所分の時刻行として繰り返される要素
    - stop_name:     stop_row 内の停留所名
    - time_cell:     stop_row 内の時刻
    - line_no:       ページ全体の系統番号。HTMLから直接取れる場合だけ指定
    - destination:   ページ全体の行先。HTMLから直接取れる場合だけ指定
    - calendar_label:ページ内の曜日区分ラベル。確認できる場合だけ指定

    line_no / destination / calendar_label を指定しない場合は、parser呼び出し側が
    *_hint で明示的に渡す。未確認情報をHTMLから推測して補完しないための設計。
    """

    stop_row: ElementSpec
    stop_name: ElementSpec
    time_cell: ElementSpec
    line_no: Optional[ElementSpec] = None
    destination: Optional[ElementSpec] = None
    calendar_label: Optional[ElementSpec] = None
