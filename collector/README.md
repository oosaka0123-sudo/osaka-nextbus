# collector/ — Bus-Vision時刻表収集(許可待ち・準備コード)

このディレクトリは、大阪シティバスから**正式な利用許可**を得た後に、
Bus-Vision公開HTMLから方面・行先・発車時刻を収集し、既存のPWA
(`data/timetable.json`)へ接続するための**準備コード**です。

**現時点(2026-08-29)では大阪シティバスへ利用許可を申請中であり、
このディレクトリのコードは一切ネットワークアクセスを行いません。**
`collector/config.py` の `PERMISSION_GRANTED` が `False` である限り、
`http_client.py` がネットワークソケットを開く直前で必ず例外を送出して
停止します(robots.txt の取得すら行いません)。

本番PWA(`index.html` / `css/` / `js/*.js` / `sw.js` / `data/*.json`)とは
完全に独立しており、このディレクトリを一切実行しなくてもPWAの動作には
何の影響もありません。

## 全体像

```
Bus-Vision公開HTML(許可後)
    │  parser.py (要: 許可後に実装)
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

`収集レコードJSON → timetable.csv` の変換だけを新規に用意し、
`timetable.csv → data/timetable.json` は既存の
`scripts/timetable-csv-to-json.mjs`(平日/土曜/休日の振り分け・時刻順ソート・
不完全な行のエラー検出を既に実装済み)をそのまま再利用しています。
二重実装を避け、本番PWAへの接続点を1箇所(CSVフォーマット)に絞っています。

## ディレクトリ構成

| ファイル | 役割 | 現状 |
|---|---|---|
| `config.py` | 許可フラグ・低速アクセス設定・未確定項目(BASE_URL/dateDivCd等) | 実装済み(値はTODOプレースホルダ) |
| `models.py` | 収集レコード `DepartureRecord`(8フィールド)の定義・検証 | 実装済み |
| `http_client.py` | 許可ゲート付き低速HTTPクライアント(sleep+ジッタ、指数バックオフ、最大3回リトライ、4xxは回避しない) | 実装済み |
| `checkpoint.py` | SQLiteによる取得済みURL管理(重複回避・途中再開) | 実装済み |
| `parser.py` | `diagramDetail.html` の解析 | **未実装**(実HTML構造が未確認のため) |
| `convert_to_timetable_csv.py` | 収集レコードJSON → timetable.csv 変換(stops.json/routes.jsonと突合) | 実装済み・テスト済み |
| `run_collect.py` | 収集のエントリポイント | 許可ゲートのみ実装済み、収集ループ本体は未実装 |
| `tests/` | 上記のうちネットワーク不要な部分のユニットテスト(フィクスチャのみ使用) | 実装済み・全件PASS |

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
| 推測データ禁止 | `dateDivCd`・停留所コード取得方法は `config.py` にプレースホルダのまま。`convert_to_timetable_csv.py` は不一致・未設定を必ずエラーとして報告し、変換を中断する |
| HTML解析失敗時は停止 | `parser.py` は要素が見つからない場合に `ParseError` を送出する設計(実装は許可後) |

## テストの実行方法(ネットワークアクセスなし)

リポジトリのルートディレクトリで実行します。

```bash
python3 -m unittest discover -s collector/tests -t .
```

すべて `collector/tests/fixtures/` 内の合成データ(実際のBus-Visionの
データは一切含まない)だけを使い、本番の `data/*.json` には触れません。
`http_client` のテストは `urllib.request.urlopen` をモックし、
実際にネットワークへアクセスしていないことを `assert_not_called()` で
検証しています。

## 許可後にやること

1. `config.py` の `PERMISSION_GRANTED` を `True` にし、
   `PERMISSION_GRANTED_NOTE` に許可日・確認方法(受領したメール等)を記載する。
2. `config.py` の `BASE_URL` / `DIAGRAM_DETAIL_PATH_TEMPLATE` / `DATE_DIV_CD`
   (平日/土曜/休日のコード) / `STOP_CODE_SOURCE_NOTE`(停留所コードの
   取得方法)を、実際にBus-Vision公開ページを確認して埋める(推測禁止)。
3. `http_client.check_robots_txt()` で robots.txt を確認し、対象パスへの
   アクセスが許可されているか確認する。あわせて利用規約を目視で確認する。
4. `parser.py` の `parse_diagram_detail()` を、実際の `diagramDetail.html`
   の構造に合わせて実装する(要素が見つからない場合は `ParseError` を
   送出し、値を推測して埋めないこと)。
5. `run_collect.py` の収集ループ本体を実装し、低速収集を実行する
   (`checkpoint.py` で重複回避・途中再開しながら)。
6. 収集結果(`DepartureRecord` のJSON配列)を
   `collector/convert_to_timetable_csv.py` で `timetable.csv` に変換する。

   ```bash
   python3 -m collector.convert_to_timetable_csv \
     --input collector/data/raw/departures.json \
     --stops data/stops.json \
     --routes data/routes.json \
     --output timetable.csv
   ```

7. 既存ツールで `data/timetable.json` に変換する。

   ```bash
   node scripts/timetable-csv-to-json.mjs --input timetable.csv --output data/timetable.json
   ```

8. `data/metadata.json` の `lastUpdated` を更新する。
9. CLAUDE.md記載の通常のPWA動作確認チェックリスト(ローカルサーバー起動・
   停留所/系統/方面選択・次3便表示・平日/土曜/休日・深夜またぎ・
   JSエラー0件・Service Worker等)をブラウザで実施する。
10. 問題がなければ commit / push する。

## 出典・利用条件に関する注意

- 収集対象は Bus-Vision の**公開HTMLページ**のみとし、非公開API・
  認証が必要なエンドポイントの解析・利用は行わない。
- 大阪シティバスからの利用許可の内容(頻度・範囲等の条件)に、
  ここに記載した設定(低速アクセス・リトライ回数等)よりも厳しい制約が
  含まれる場合は、許可条件を優先して `config.py` の値を調整すること。
- 収集したデータは `data/timetable.json` へ反映する前に、必ず内容を
  目視確認すること(架空データを紛れ込ませないという本リポジトリの
  一貫した方針のため)。
