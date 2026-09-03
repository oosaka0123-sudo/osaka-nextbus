# collector/ — Bus-Vision時刻表収集(許可待ち・準備コード)

このディレクトリは、大阪シティバスから**正式な利用許可**を得た後に、
Bus-Vision公開HTMLから方面・行先・発車時刻を収集し、既存のPWA
(`data/timetable.json`)へ接続するための**準備コード**です。

**2026-09-04時点でも `collector/config.py` の `PERMISSION_GRANTED` は `False` です。**
そのため、このディレクトリのnetwork collectorはネットワークアクセスを開始しません。
`http_client.py` がソケットを開く前に必ず例外を送出して停止します
(robots.txt の取得すら行いません)。

一方で、ネットワークを使わない公開Evidence確認・Registry・offline dry-run・変換・テストは
進んでいます。Bus-Visionの曜日コードはVerified済みで、正本は
`collector/evidence/calendar_codes.json` です。

```text
weekday  = 11
saturday = 13
holiday  = 12
```

本番PWA(`index.html` / `css/` / `js/*.js` / `sw.js` / `data/*.json`)とは
完全に独立しており、このディレクトリを一切実行しなくてもPWAの動作には
何の影響もありません。

## 全体像

```
Bus-Vision公開HTML(正式許可後のnetwork collection)
    │  bus_vision/parser.py (アルゴリズムは実装・テスト済み。
    │                         production SelectorConfigは実HTML確認後に用意する)
    ▼
収集レコードJSON (stop_name / departure_time / line_no / headsign /
                   direction / service / source_url / fetched_at)
    │  convert_to_timetable_csv.py (実装済み・テスト済み・ネットワーク不要)
    ▼
timetable.csv (routeId,direction,destination,calendar,time)
    │  scripts/timetable-csv-to-json.mjs (既存・実装済み・テスト済み)
    ▼
data/timetable.json
    │
    ▼
BusDataSource (js/data.js) → 停留所 → 系統 → 行先 → 次3便
```

`bus_vision/parser.py`(HTML解析)と `convert_to_timetable_csv.py`
(JSON→CSV変換)を用意し、`timetable.csv → data/timetable.json` は
既存の `scripts/timetable-csv-to-json.mjs`(平日/土曜/休日の振り分け・
時刻順ソート・重複除去・不完全な行のエラー検出を既に実装済み)を
そのまま再利用しています。二重実装を避け、本番PWAへの接続点を
1箇所(CSVフォーマット)に絞っています。

## ディレクトリ構成

collector本体(ネットワーク層・許可ゲート・チェックポイント)と
`bus_vision/`(HTML解析、ネットワーク非依存)は完全に分離されています。
`bus_vision/` 配下のどのモジュールも `http_client` / `checkpoint` /
`config.PERMISSION_GRANTED` を一切参照しません。

| ファイル | 役割 | 現状 |
|---|---|---|
| `config.py` | 許可フラグ・低速アクセス設定・legacy calendar mapping | `PERMISSION_GRANTED=False`。`DATE_DIV_CD` はVerified Registryと同期済み(11/13/12)。network `BASE_URL` / templateは未有効 |
| `models.py` | 収集レコード `DepartureRecord`(8フィールド)の定義・検証 | 実装済み |
| `http_client.py` | 許可ゲート付き低速HTTPクライアント(sleep+ジッタ、指数バックオフ、最大3回リトライ、4xxは回避しない) | 実装済み |
| `checkpoint.py` | SQLiteによる取得済みURL管理(重複回避・途中再開) | 実装済み |
| `convert_to_timetable_csv.py` | 収集レコードJSON → timetable.csv 変換(stops.json/routes.jsonと突合) | 実装済み・テスト済み。未知calendar codeはfail closed |
| `run_collect.py` | 収集のエントリポイント | 許可ゲートのみ実装済み、network収集ループ本体は未実装 |
| `bus_vision/html_dom.py` | 標準ライブラリのみで書いた最小HTML木構造パーサー(find_all/get_text) | 実装済み・テスト済み |
| `bus_vision/identifiers.py` | 公開URLから stopCd/poleCd/strLineList/dateDivCd 等を抽出 | 実装済み・テスト済み。公開実例でquery keyをOBSERVED済み |
| `bus_vision/selectors.py` | `diagramDetail.html` のDOM構造を表す設定 `SelectorConfig` | 型のみ実装。**実サイト向けのproduction既定値は意図的に持たせていない** |
| `bus_vision/parser.py` | `SelectorConfig` に従ってHTMLからDepartureRecordを抽出する解析アルゴリズム | **実装済み・テスト済み**。production SelectorConfigはEvidence確認後に用意する |
| `evidence/` | Verified stop URL / calendar code の証拠台帳 | 実装済み。候補値やAI推測は禁止 |
| `tests/` | ネットワーク不要なユニット/統合テスト | 2026-09-04時点で **136 tests PASS** |

### なぜ「解析済み」なのにnetwork実データ収集はまだ動かないのか

`bus_vision/parser.py` の**解析アルゴリズム**は実装・テスト済みです。
一方、network collectorを安全に有効化するには次が別途必要です。

- 正式な利用許可
- network collector用 `BASE_URL` / URL template
- 対象停留所がVerified Evidence Registryに存在すること
- 実HTMLに対応するproduction `SelectorConfig`
- `run_collect.py` の収集ループ実装

曜日コード自体は未確認項目ではありません。`weekday=11 / saturday=13 / holiday=12` を
Verified Registryに保存し、legacy `config.DATE_DIV_CD` と一致することもテストで固定しています。

## 安全設計(要件との対応)

| 要件 | 実装箇所 |
|---|---|
| permission_granted=false が初期値 | `config.PERMISSION_GRANTED = False` |
| falseの場合はネットワークアクセスを一切しない | `http_client.ensure_permission()` を全ネットワーク関数の先頭で呼び、ソケットを開く前に例外送出 |
| 利用規約/robots.txt確認 | `http_client.check_robots_txt()`(こちらも許可ゲート付き) |
| 低速アクセス / sleep+ジッタ | `config.MIN_DELAY_SEC`〜`MAX_DELAY_SEC` の範囲でランダムsleep |
| 指数バックオフ / 最大リトライ3回 | `config.BACKOFF_BASE_SEC * 2**attempt`、`config.MAX_RETRIES = 3` |
| 4xx時は無理に回避しない | `HttpForbiddenError` を送出してそのまま停止(リトライしない) |
| SQLiteチェックポイント / 途中再開 / 同一URL再取得防止 | `checkpoint.py` |
| 取得URL/取得日時記録 | `checkpoint.py`(url, status, fetched_at, detail) |
| 曜日コードの推測禁止 | `evidence/calendar_codes.json` のVerified値だけを利用。未知codeは変換時にfail closed |
| 停留所IDの推測禁止 | `evidence/stop_timetables.json` のVerified値のみ採用。隣接番号や第三者情報から補完しない |
| production DOM推測禁止 | `bus_vision/selectors.py` は実サイト向け既定値を持たず、Evidenceで確認したSelectorConfigだけを明示的に渡す |
| HTML解析失敗時は停止 | `bus_vision/parser.py` は、必要要素が0件・時刻解釈不能等で `ParseError` を送出して停止 |

## テストの実行方法(ネットワークアクセスなし)

リポジトリのルートディレクトリで実行します。

```bash
python3 -m unittest discover -s collector/tests -t .
```

テストはローカルfixture / Verified Registry / production indexのread-only検証を使い、
network collectorを起動しません。`http_client` のテストは `urllib.request.urlopen` を
モックし、実際にネットワークへアクセスしていないことを検証します。
`test_bus_vision_end_to_end.py` では既存の `scripts/timetable-csv-to-json.mjs` を
検証するため `node` コマンドを子プロセスとして呼び出しますが、ネットワークは使用しません。

**2026-09-04時点のGitHub Actions `Test collector` は136 tests PASS。**
同じsuite内で `PERMISSION_GRANTED=False` も回帰確認しています。

## 正式許可後にやること

1. `config.py` の `PERMISSION_GRANTED` を `True` にし、
   `PERMISSION_GRANTED_NOTE` に許可日・確認方法(受領したメール等)を記載する。
2. `config.py` の `BASE_URL` / `DIAGRAM_DETAIL_PATH_TEMPLATE` と、対象停留所の
   Verified Registry / `STOP_CODE_SOURCE_NOTE` を確認する。未確認値を推測で埋めない。
3. `evidence/calendar_codes.json` と `config.DATE_DIV_CD` が
   `weekday=11 / saturday=13 / holiday=12` で一致していることを確認する。
4. `http_client.check_robots_txt()` で robots.txt を確認し、対象パスへの
   アクセスが許可されているか確認する。あわせて利用規約を目視で確認する。
5. 実際の `diagramDetail.html` を目視確認し、
   `collector/bus_vision/selectors.py` の `SelectorConfig` を実際のDOM構造
   (タグ名・class名)に合わせて組み立てる。解析アルゴリズム自体
   (`bus_vision/parser.py`)は実装・テスト済み。
6. `run_collect.py` の収集ループ本体を実装し、低速収集を実行する
   (`checkpoint.py` で重複回避・途中再開しながら)。
7. 収集結果(`DepartureRecord` のJSON配列)を
   `collector/convert_to_timetable_csv.py` で `timetable.csv` に変換する。

   ```bash
   python3 -m collector.convert_to_timetable_csv \
     --input collector/data/raw/departures.json \
     --stops data/stops.json \
     --routes data/routes.json \
     --output timetable.csv
   ```

8. 既存ツールで `data/timetable.json` に変換する。

   ```bash
   node scripts/timetable-csv-to-json.mjs --input timetable.csv --output data/timetable.json
   ```

9. `data/metadata.json` の `lastUpdated` を更新する。
10. CLAUDE.md記載の通常のPWA動作確認チェックリスト(ローカルサーバー起動・
    停留所/系統/方面選択・次3便表示・平日/土曜/休日・深夜またぎ・
    JSエラー0件・Service Worker等)をブラウザで実施する。
11. 問題がなければ commit / push する。

## 出典・利用条件に関する注意

- network収集対象は Bus-Vision の**公開HTMLページ**のみとし、非公開API・
  認証が必要なエンドポイントの解析・利用は行わない。
- 大阪シティバスからの利用許可の内容(頻度・範囲等の条件)に、
  ここに記載した設定(低速アクセス・リトライ回数等)よりも厳しい制約が
  含まれる場合は、許可条件を優先して `config.py` の値を調整すること。
- 収集したデータは `data/timetable.json` へ反映する前に、必ず内容を
  目視確認すること(架空データを紛れ込ませないという本リポジトリの方針)。
