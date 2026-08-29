"""
collector/bus_vision/identifiers.py
---------------------------------------------------------
Bus-Vision の時刻表詳細ページのURLから、停留所ID(stopCd)・
乗り場ID(poleCd)・系統指定値(strLineList)・平日/土曜/休日切替コード
(dateDivCd)を抽出する。

【注意】これらのクエリパラメータ名は事前調査による想定であり、
実際にBus-Vision側で使われている名称・形式かどうかは未確認である。
許可後に実URLを確認し、名称が異なっていればここを修正すること
(推測で別名を決め打ちしない。存在しないパラメータは None のままにする)。

ネットワークアクセスは行わない。渡された文字列を解析するだけの
純粋関数。
"""
from dataclasses import dataclass
from typing import Optional
from urllib.parse import parse_qs, urlparse

QUERY_KEYS = ("stopCd", "poleCd", "strLineList", "dateDivCd")


@dataclass(frozen=True)
class PageIdentifiers:
    stop_cd: Optional[str]
    pole_cd: Optional[str]
    str_line_list: Optional[str]
    date_div_cd: Optional[str]

    def is_complete(self) -> bool:
        """停留所を一意に特定するのに最低限必要な項目が揃っているか
        (strLineListは系統絞り込み用のため必須には含めない)。"""
        return bool(self.stop_cd) and bool(self.pole_cd) and bool(self.date_div_cd)


def extract_query_identifiers(url: str) -> PageIdentifiers:
    """URLのクエリ文字列から stopCd/poleCd/strLineList/dateDivCd を抽出する。
    存在しないパラメータは None のままにする(推測で埋めない)。"""
    query = parse_qs(urlparse(url).query)
    values = {key: (query[key][0] if query.get(key) else None) for key in QUERY_KEYS}
    return PageIdentifiers(
        stop_cd=values["stopCd"],
        pole_cd=values["poleCd"],
        str_line_list=values["strLineList"],
        date_div_cd=values["dateDivCd"],
    )
