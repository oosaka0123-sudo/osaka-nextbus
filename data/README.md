# data/ ディレクトリ

次バス大阪の実データを格納します。

## 現在のデータ（2026-09-11）

```text
data/
├── metadata.json         出典・更新日・収録範囲
├── stops.json            停留所 992件
├── routes.json           停留所×系統 1,915件
├── timetable.json        既存の時刻表 8系統×方面
└── timetable-extra.json  追加・補正時刻表 35エントリ（上書き補正1件含む）
```

アプリ上では `js/timetable-loader.js` が2つの時刻表JSONを結合し、同一キーのextraを優先するため、2026-09-11時点で **合計42系統×方面**として扱われます。

## stops.json

```json
[
  {
    "id": "example-stop",
    "name": "停留所名",
    "lat": 34.0,
    "lon": 135.0
  }
]
```

- `id`: 一意の停留所ID。省略可能ですが、省略時はアプリ側で自動生成されます。データ更新をまたいで同じ停留所IDを安定して維持するため、実データでは明示することを推奨します
- `name`: 停留所名
- `lat` / `lon`: 緯度・経度

## routes.json

```json
[
  {
    "id": "example-stop__71号",
    "stopId": "example-stop",
    "label": "71号",
    "destination": "71号"
  }
]
```

P11には行き先・方面が無いため、`routes.json` は停留所と系統番号の骨格として使用します。

方面・行先は時刻表JSON側に保持します。

## timetable.json / timetable-extra.json

両ファイルのエントリ形式は同じです。

```json
[
  {
    "routeId": "example-stop__71号",
    "direction": "なんば方面",
    "destination": "なんば",
    "weekday": ["05:30", "06:00"],
    "saturday": ["05:40", "06:10"],
    "holiday": ["05:50", "06:20"]
  }
]
```

### 必須ルール

- `routeId` は `routes.json` の `id` と完全一致させる
- `direction` と `destination` は空にしない
- `weekday` / `saturday` / `holiday` は `HH:MM` 形式
- 時刻は昇順
- 同一配列内で重複させない
- 深夜便は `24:10` のような24時超え表記を使用可能
- 運休曜日は空配列 `[]` で表現可能

## 追加時刻表の仕組み

`index.html` は以下の順に読み込みます。

```html
<script src="js/timetable-loader.js"></script>
<script src="js/data.js"></script>
<script src="js/app.js"></script>
```

`timetable-loader.js` は `data/timetable.json` の取得を検出すると、同時に `data/timetable-extra.json` を取得して配列を結合します。

このため、PWAのService Workerがまだ有効になる前の初回アクセスでも追加時刻表を読み込めます。

`timetable-extra.json` の取得だけに失敗した場合は本体 `timetable.json` をそのまま返し、既存データを壊しません。

旧Service Workerが一時的に残る更新途中の端末でも、`routeId + direction + destination` で重複排除します。

## 現在の収録範囲

2026-09-11時点の結合後収録数は **42系統×方面** です。`timetable.json` は8エントリ、`timetable-extra.json` は35エントリで、そのうち1エントリがbaseを意図的に上書きするため、結合後は40になります。

個別の停留所・系統・方面・行先とEvidence注記は `metadata.json` のcoverageを正本とします。このREADMEに全件一覧を複製せず、収録追加時の二重更新によるドリフトを避けます。

一部の間隔表記から近似補間した時刻があります。詳細は `metadata.json` の各coverage noteを正としてください。

## metadata.json

主な用途：

- `dataSource`
- `lastUpdated`
- データ出典
- 収録済み停留所・系統・方面
- 判読不能箇所や近似補間の注記

時刻表を追加した場合は必ずcoverageも更新します。

## データ出典ルール

使用する情報は以下に限定します。

- 合法的に利用可能な公開データ
- 公的オープンデータ
- 自ら現地で確認した停留所掲示
- 正式に提供・利用許可を得たデータ

Bus-Vision等の無断スクレイピング、非公開APIの利用は行いません。

## 更新チェック

時刻表追加後は最低限、以下を確認します。

1. JSON parse成功
2. routeIdが存在
3. 曜日別配列が昇順
4. 重複なし
5. HH:MM形式
6. 方面・行先表示
7. 次の3便表示
8. 平日/土曜/休日切替
9. 終バス後の翌日ロールオーバー
10. 既存データへの回帰影響なし
11. PWAのキャッシュ更新
12. Copilot Code Review
