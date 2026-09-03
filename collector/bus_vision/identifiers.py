"""
collector/bus_vision/identifiers.py
---------------------------------------------------------
Bus-Vision URL文字列のquery parameterを解析する純粋関数。
ネットワークアクセスは一切行わない。

初期プロトタイプで想定した stopCd / poleCd / strLineList は、
実際の `diagramDetail.html` 公開インデックスURLでは確認できていないため
legacy APIとして残すだけにする。

公開検索で実在を確認できた `diagramDetail.html` では次のキーが使われている:
corpCd, dateDivCd, diaCd, lang, lineCd, opeYmd, revYmd, routeCd,
timetableDateDivCd, updownCd

値の意味や必須性まで未確認のものは推測しない。
"""
from dataclasses import dataclass
from typing import Optional
from urllib.parse import parse_qs, urlparse


# ---- Legacy prototype API -------------------------------------------------

LEGACY_QUERY_KEYS = ("stopCd", "poleCd", "strLineList", "dateDivCd")


@dataclass(frozen=True)
class PageIdentifiers:
    """初期プロトタイプ互換。実diagramDetail URLの正本モデルではない。"""

    stop_cd: Optional[str]
    pole_cd: Optional[str]
    str_line_list: Optional[str]
    date_div_cd: Optional[str]

    def is_complete(self) -> bool:
        return bool(self.stop_cd) and bool(self.pole_cd) and bool(self.date_div_cd)


def extract_query_identifiers(url: str) -> PageIdentifiers:
    """Legacy: stopCd/poleCd/strLineList/dateDivCd を存在する場合だけ抽出する。"""
    query = parse_qs(urlparse(url).query)
    values = {key: (query[key][0] if query.get(key) else None) for key in LEGACY_QUERY_KEYS}
    return PageIdentifiers(
        stop_cd=values["stopCd"],
        pole_cd=values["poleCd"],
        str_line_list=values["strLineList"],
        date_div_cd=values["dateDivCd"],
    )


# ---- Observed diagramDetail API ------------------------------------------

DIAGRAM_DETAIL_QUERY_KEYS = (
    "corpCd",
    "dateDivCd",
    "diaCd",
    "lang",
    "lineCd",
    "opeYmd",
    "revYmd",
    "routeCd",
    "timetableDateDivCd",
    "updownCd",
)


@dataclass(frozen=True)
class DiagramDetailIdentifiers:
    """実在する公開 diagramDetail URLで確認できたquery keyの値。

    すべて Optional とし、URLに無い値を推測で埋めない。
    """

    corp_cd: Optional[str]
    date_div_cd: Optional[str]
    dia_cd: Optional[str]
    lang: Optional[str]
    line_cd: Optional[str]
    ope_ymd: Optional[str]
    rev_ymd: Optional[str]
    route_cd: Optional[str]
    timetable_date_div_cd: Optional[str]
    updown_cd: Optional[str]

    def has_trip_identity(self) -> bool:
        """公開実例で1便を説明する中核値が揃っているかだけを機械判定する。

        これはBus-Vision側の公式な必須項目宣言ではなく、collector内部で
        不完全URLを早期検出するための保守的チェック。
        """
        return all(
            (
                self.corp_cd,
                self.date_div_cd,
                self.dia_cd,
                self.line_cd,
                self.route_cd,
                self.updown_cd,
            )
        )


def extract_diagram_detail_identifiers(url: str) -> DiagramDetailIdentifiers:
    """実diagramDetail公開URLでOBSERVED済みのquery keyだけを抽出する。

    未知キーは無視し、欠けている既知キーはNoneのまま返す。
    dateDivCd等のコードを weekday/saturday/holiday へ意味付けする処理は
    ここでは行わない。
    """
    query = parse_qs(urlparse(url).query)

    def first(key: str) -> Optional[str]:
        values = query.get(key)
        return values[0] if values else None

    return DiagramDetailIdentifiers(
        corp_cd=first("corpCd"),
        date_div_cd=first("dateDivCd"),
        dia_cd=first("diaCd"),
        lang=first("lang"),
        line_cd=first("lineCd"),
        ope_ymd=first("opeYmd"),
        rev_ymd=first("revYmd"),
        route_cd=first("routeCd"),
        timetable_date_div_cd=first("timetableDateDivCd"),
        updown_cd=first("updownCd"),
    )
