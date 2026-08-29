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

# --- 収集対象(現時点では未確定。許可後にBus-Vision側の実際の値を確認してから埋める) ---

# Bus-Vision公開HTMLのベースURL。
# TODO: 許可後に実際のドメイン・URL構成を確認して設定する(推測で埋めない)。
BASE_URL = None

# 時刻表詳細ページのURLテンプレート。停留所コード・dateDivCd等、実際に
# 必要なクエリパラメータが未確認のため、プレースホルダのままにしてある。
# TODO: 許可後に実際のURL構造を確認してから埋める。
DIAGRAM_DETAIL_PATH_TEMPLATE = None

# dateDivCd(平日/土曜/休日を表すコード)は未確認。
# 「推測データ禁止」の方針により、許可後に実際の値を1つずつ確認してから
# 埋めること。3つとも None のままの場合、collector/convert_to_timetable_csv.py
# はすべてのレコードをエラーとして報告し、変換を完了しない
# (=未確認のまま誤ったカレンダー区分でtimetable.jsonが生成されることを防ぐ)。
DATE_DIV_CD = {
    "weekday": None,   # TODO: 平日を表すdateDivCdの値
    "saturday": None,  # TODO: 土曜を表すdateDivCdの値
    "holiday": None,   # TODO: 休日を表すdateDivCdの値
}

# 停留所コードの取得方法も未確定(検索ページのクロールが必要か、
# 一覧ページから機械的に取得できるか等)。
# TODO: 許可後に確認し、必要であれば stop_code_lookup.py 等を追加する。
STOP_CODE_SOURCE_NOTE = "TODO: 許可後に停留所コードの取得方法を確認する"

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
