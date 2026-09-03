"""
collector/config.py
---------------------------------------------------------
Bus-Vision公開HTMLからの時刻表収集に関する設定。

【最重要】
PERMISSION_GRANTED は、大阪シティバスから正式に利用許可が得られたことを
確認できるまで、必ず False のままにしておくこと。

http_client.py 側は、この値が False の間はネットワークソケットを開く
「前」に必ず例外を送出する(robots.txt の取得すら行わない)。
このモジュールを直接書き換えて True にする前に、必ず下の
PERMISSION_GRANTED_NOTE に許可日・確認方法(受信したメール・書面等)を
記載すること。
"""

PERMISSION_GRANTED = False

# 許可が下りたら、日付・確認方法・担当をここに記載してから
# PERMISSION_GRANTED を True に変更する。
# 例: "2026-09-15 大阪シティバス お客様センターより許可メール受領(担当: ○○)"
PERMISSION_GRANTED_NOTE = "TODO: 許可が下りたら日付・確認方法をここに記載する"

# --- 収集対象 ---

# Bus-Vision公開HTMLのベースURL。
# ネットワーク収集の正式許可とproduction collector構成が確定するまでNoneを維持する。
BASE_URL = None

# 時刻表詳細ページのURLテンプレート。
# 公開URL構造のEvidenceは別Registry/テストへ保存しているが、network collector用の
# production templateは正式許可と実装Issueなしに有効化しない。
DIAGRAM_DETAIL_PATH_TEMPLATE = None

# Bus-Vision dateDivCd -> project calendar のVerified値。
# 正本Evidenceは collector/evidence/calendar_codes.json。
# Issue #68 / PR #69で公式Bus-Vision公開便詳細を根拠に3区分を確定済み。
# legacy converter CLIとの互換用に同じ値をここへ同期する。
DATE_DIV_CD = {
    "weekday": "11",
    "saturday": "13",
    "holiday": "12",
}

# 停留所コードの取得方法は全停留所について確定していない。
# Verified stop identifiersは collector/evidence/stop_timetables.json に限定して保存する。
# 未確認値を連番や隣接停留所から補完しない。
STOP_CODE_SOURCE_NOTE = (
    "Verified stop identifiers live in collector/evidence/stop_timetables.json; "
    "unverified stop IDs must remain unresolved"
)

# --- 低速アクセス・リトライ設定 ---
MIN_DELAY_SEC = 3.0     # 1リクエストごとの最小sleep(秒)
MAX_DELAY_SEC = 6.0     # 1リクエストごとの最大sleep(秒。ジッタとしてランダムに選ぶ)
BACKOFF_BASE_SEC = 5.0  # 指数バックオフの基準値(秒)。n回目失敗時は BACKOFF_BASE_SEC * 2**n 待つ
MAX_RETRIES = 3         # 5xx/接続エラー時の最大再試行回数(4xxは再試行しない)
REQUEST_TIMEOUT_SEC = 15

# 個人開発・非商用であることが明確に伝わるUser-Agent。
# TODO: 許可後、連絡先(メールアドレス等)を追記する。
USER_AGENT = "osaka-nextbus-collector/0.1 (individual non-commercial project; contact: TODO)"

# --- 保存先 ---
CHECKPOINT_DB_PATH = "collector/data/checkpoint.sqlite3"
RAW_OUTPUT_DIR = "collector/data/raw"
