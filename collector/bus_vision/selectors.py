"""
collector/bus_vision/selectors.py
---------------------------------------------------------
diagramDetail.html(時刻表詳細ページ)から必要な情報を取り出すための
「どこを見るか」を表す設定(SelectorConfig)。

【最重要】実際のBus-Vision HTMLの構造は未確認である。このモジュールは
実サイト向けの既定値(デフォルトのSelectorConfig)を一切提供しない。
許可後に実際のページのHTML構造を確認してから、呼び出し側で
SelectorConfig を組み立てて parser.parse_diagram_detail() に渡すこと
(推測で埋めた値を本番コードのデフォルトに固定しないため)。

開発・テストで使う設定は collector/tests/fixtures/bus_vision_html/ の
合成HTML専用に、各テストファイル側で個別に定義している
(実際のBus-Vision構造を反映したものではない、あくまでサンプル)。
"""
from dataclasses import dataclass
from typing import Optional, Tuple

# (tag, class_) の組で1つの要素を指定する。class_ は None なら「タグ名だけで一致」。
ElementSpec = Tuple[str, Optional[str]]


@dataclass(frozen=True)
class SelectorConfig:
    """diagramDetail.html の想定DOM構造を表す設定。

    - stop_name:      停留所名を含む要素
    - route_block:    系統(方面)ごとに繰り返されるブロック要素
    - line_no:        route_block内で系統番号を含む要素
    - destination:    route_block内で行先を含む要素
    - time_cell:      route_block内で発車時刻1件ずつを含む要素
    - calendar_label: (省略可) ページ内に表示されている曜日区分ラベル
                       (例:「平日」「土曜」)を含む要素。
                       指定しない場合は呼び出し側が calendar_hint 引数で
                       明示的に渡す運用にする(dateDivCdの意味付けが
                       未確認のため、HTMLから自動判定することを既定にしない)。
    """

    stop_name: ElementSpec
    route_block: ElementSpec
    line_no: ElementSpec
    destination: ElementSpec
    time_cell: ElementSpec
    calendar_label: Optional[ElementSpec] = None
