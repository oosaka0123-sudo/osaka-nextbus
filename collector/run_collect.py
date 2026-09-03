#!/usr/bin/env python3
"""
collector/run_collect.py
---------------------------------------------------------
Bus-Vision公開HTMLからの時刻表収集のエントリポイント(許可後専用)。

2026-09-04時点でも config.PERMISSION_GRANTED は False のため、このスクリプトを
実行するとネットワークアクセスを開始する前に即座にエラーで停止する。

Bus-Visionの曜日コードはVerified Evidence Registryで確認済み:
  weekday=11 / saturday=13 / holiday=12
これらは collector/evidence/calendar_codes.json を正本とし、config.DATE_DIV_CDへ
同期済み。ネットワーク収集許可とは別のEvidenceであり、許可フラグを有効化しない。

許可後にやること(collector/README.md にも同じ手順を記載):
  1. config.py の PERMISSION_GRANTED を True にし、PERMISSION_GRANTED_NOTE に
     許可日・確認方法を明記する。
  2. config.py の BASE_URL / DIAGRAM_DETAIL_PATH_TEMPLATE と、対象停留所の
     Verified Registry / STOP_CODE_SOURCE_NOTE を確認し、未確認値を推測で埋めない。
  3. calendar_codes.json と config.DATE_DIV_CD が一致していることを確認する。
  4. robots.txt・利用規約を確認する(http_client.check_robots_txt を使う)。
  5. 実際の diagramDetail.html を目視確認し、
     collector/bus_vision/selectors.py の SelectorConfig を実際のDOM構造
     (タグ名・class名)に合わせて組み立てる。解析アルゴリズム自体
     (collector/bus_vision/parser.py)は実装・テスト済みのため、
     基本的にはコード変更ではなく SelectorConfig の値を用意するだけでよい。
  6. このスクリプトの収集ループ本体(下記 TODO)を実装し、低速収集を実行する。
  7. collector/convert_to_timetable_csv.py で収集結果を timetable.csv に変換する。
  8. scripts/timetable-csv-to-json.mjs で data/timetable.json に変換する。
  9. CLAUDE.md記載の通常のPWA動作確認チェックリストを実施してから commit/push する。
"""
import sys

from . import config
from .http_client import PermissionNotGrantedError, ensure_permission


def main() -> int:
    try:
        ensure_permission()
    except PermissionNotGrantedError as e:
        print(f"収集を開始できません: {e}", file=sys.stderr)
        return 1

    # 許可が下りた後、ここに checkpoint.py / http_client.py /
    # bus_vision.parser を組み合わせた実際の収集ループを実装すること。
    # dateDivCdの3区分はVerified済みだが、network collector用BASE_URL/template、
    # 対象停留所のVerified identity、production SelectorConfig、収集ループ自体は
    # 正式許可と専用実装Issueなしに有効化しない。
    raise NotImplementedError(
        "収集ループは許可後に実装してください"
        "(network production settings / SelectorConfig / collection loop are not enabled)。"
    )


if __name__ == "__main__":
    sys.exit(main())
