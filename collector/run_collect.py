#!/usr/bin/env python3
"""
collector/run_collect.py
---------------------------------------------------------
Bus-Vision公開HTMLからの時刻表収集のエントリポイント(許可後専用)。

現時点(2026-08-29、大阪シティバスへの利用許可申請中)では、このスクリプトは
実行しても config.PERMISSION_GRANTED が False のため即座にエラーで停止する。

許可後にやること(collector/README.md にも同じ手順を記載):
  1. config.py の PERMISSION_GRANTED を True にし、PERMISSION_GRANTED_NOTE に
     許可日・確認方法を明記する。
  2. config.py の BASE_URL / DIAGRAM_DETAIL_PATH_TEMPLATE / DATE_DIV_CD /
     STOP_CODE_SOURCE_NOTE を、実際に確認した値で埋める(推測で埋めない)。
  3. robots.txt・利用規約を確認する(http_client.check_robots_txt を使う)。
  4. 実際の diagramDetail.html を目視確認し、
     collector/bus_vision/selectors.py の SelectorConfig を実際のDOM構造
     (タグ名・class名)に合わせて組み立てる。解析アルゴリズム自体
     (collector/bus_vision/parser.py)は実装・テスト済みのため、
     基本的にはコード変更ではなく SelectorConfig の値を用意するだけでよい。
  5. このスクリプトの収集ループ本体(下記 TODO)を実装し、低速収集を実行する。
  6. collector/convert_to_timetable_csv.py で収集結果を timetable.csv に変換する。
  7. scripts/timetable-csv-to-json.mjs で data/timetable.json に変換する。
  8. CLAUDE.md記載の通常のPWA動作確認チェックリストを実施してから commit/push する。
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
    # BASE_URL・DIAGRAM_DETAIL_PATH_TEMPLATE・dateDivCd・停留所コード取得方法・
    # SelectorConfig(実HTML構造)がいずれも未確定のため、
    # 現時点ではあえて未実装のままにしてある。
    raise NotImplementedError(
        "収集ループは許可後に実装してください"
        "(BASE_URL / dateDivCd / SelectorConfigが未確定のため)。"
    )


if __name__ == "__main__":
    sys.exit(main())
