"""
collector/models.py
---------------------------------------------------------
収集データ1件(1便分)を表すレコード定義。

取得予定データ(ユーザー仕様どおり):
  stop_name, departure_time, line_no, headsign, direction, service,
  source_url, fetched_at

推測データを混入させないため、validate() はすべてのフィールドが
空でないこと・時刻の形式が妥当であることだけを機械的に確認する
(値の意味的な正しさまでは保証しない。それは収集元HTMLの構造を
実際に確認した上で parser.py 側で担保する)。
"""
import re
from dataclasses import asdict, dataclass

REQUIRED_FIELDS = (
    "stop_name",
    "departure_time",
    "line_no",
    "headsign",
    "direction",
    "service",
    "source_url",
    "fetched_at",
)

_TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")


@dataclass(frozen=True)
class DepartureRecord:
    stop_name: str
    departure_time: str  # "HH:MM"。深夜0時をまたぐ便は "24:10" 等の24時以降表記も許容する
    line_no: str
    headsign: str
    direction: str
    service: str  # dateDivCd等、平日/土曜/休日を表す生コード(意味付けはconfig.DATE_DIV_CD側で行う)
    source_url: str
    fetched_at: str  # ISO8601

    def validate(self) -> list:
        """空フィールド・不正な時刻形式を検出してエラー文字列のリストを返す。
        問題があっても例外は投げず、呼び出し側が全件チェックしてから
        まとめて停止できるようにする(scripts/timetable-csv-to-json.mjs と
        同じ「全エラーを収集してから中断する」方針に合わせている)。"""
        errors = []
        for field in REQUIRED_FIELDS:
            if not getattr(self, field):
                errors.append(f"{field} が空です")
        if self.departure_time and not _TIME_RE.match(self.departure_time):
            errors.append(f'departure_time の形式が不正です: "{self.departure_time}"')
        return errors

    def as_dict(self) -> dict:
        return asdict(self)
