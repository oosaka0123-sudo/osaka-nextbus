"""
collector/parser.py
---------------------------------------------------------
Bus-Vision の diagramDetail.html(時刻表詳細ページ)を解析し、
DepartureRecord のリストに変換する。

【未実装(許可後に対応すること)】
diagramDetail.html の実際のHTML構造が未確認のため、パース処理本体は
プレースホルダのままにしてある。許可後に実際のページを取得・確認できた
段階で、この関数の中身を実装すること(推測での実装は禁止)。

方針(安全要件「HTML解析失敗時は停止」に対応):
想定した要素が見つからない・件数が0件など、解析に失敗したとみなせる
場合は、空リストを返したり値を推測したりせず、ParseError を送出して
その場で停止すること。
"""
from .models import DepartureRecord


class ParseError(RuntimeError):
    """HTML構造が想定と異なる場合に送出する。推測して処理を継続しない。"""


def parse_diagram_detail(
    html: str, *, stop_name: str, source_url: str, fetched_at: str
) -> list:
    """diagramDetail.html の中身(html)を解析し、DepartureRecordのリストを返す。

    実装時のガイドライン:
    - 想定したDOM構造/セレクタが見つからない場合は ParseError を送出する。
    - line_no / headsign / direction / service / departure_time のいずれかが
      取得できない行は、その場でスキップしたり空文字で埋めたりせず、
      レコード全体をエラー扱いにすること(架空データを混入させないため)。
    - 生成した各 DepartureRecord は、呼び出し側で record.validate() に
      通してから利用すること。
    """
    raise NotImplementedError(
        "diagramDetail.html の実HTML構造が未確認のため未実装です。"
        "大阪シティバスからの許可後、実際のページを確認してから実装してください"
        "(推測実装は禁止)。"
    )
