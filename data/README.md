# data/ ディレクトリについて

このアプリのデータは4つのJSONファイルに分離されています。
**アプリ本体(index.html / css / js)を一切変更せずに、このファイルだけを
差し替えることでデータを更新できます。**

```
data/
├── metadata.json    データの出典種別・最終更新日
├── stops.json       停留所(名前・緯度経度)
├── routes.json      各停留所を通る系統・方面
└── timetable.json   各系統の発車時刻表(1日分・毎日繰り返し)
```

現時点では `stops.json` / `routes.json` / `timetable.json` はすべて空 `[]` で、
`metadata.json` の `dataSource` も `"demo"` のままです。この状態では、アプリは
自動的に `js/data.js` 内蔵のデモデータ(停留所6件)で動作し、画面右上に
「DEMO」バッジが表示されます。

## 実データへの切り替え方法(スマホだけでも可能)

1. `stops.json` / `routes.json` / `timetable.json` を下記の形式で実データに置き換える
   (GitHubのWeb UIの `Add file → Upload files` または直接編集で可能)。
2. `metadata.json` の `dataSource` を `"demo"` 以外の値(例: `"manual"`)に変更し、
   `lastUpdated` を更新した日付(`YYYY-MM-DD`)に変更する。
3. commit / push する。

これだけで、次回アプリを開いたときに実データが使われ、DEMOバッジは自動的に
消えます(`dataSource` が `"demo"` のまま、または `stops.json` が空のままだと
安全のため引き続きデモ動作になります)。

系統(方面)や時刻表がまだ整備されていない停留所・系統は、架空の時刻を
表示する代わりに自動的に「🚧 時刻表データ準備中」と表示されます。
系統ごとに準備が整った時点で `routes.json` / `timetable.json` を追記すれば、
その系統だけ次のバス表示が有効になります(全件揃える必要はありません)。

## ファイル形式

### metadata.json

```json
{
  "dataSource": "demo",
  "lastUpdated": "2026-08-29",
  "note": "任意の説明文(表示はされません)"
}
```

- `dataSource`: `"demo"` ならデモデータで動作。それ以外(`"manual"` 等)かつ
  `stops.json` が空でなければ実データとして採用される。
  将来 GTFS-JP / GTFS-RT を利用する場合は `"gtfs-jp"` / `"gtfs-rt"` 等、
  好きな文字列に変更してよい(アプリ側は `"demo"` かどうかしか見ていない)。
- `lastUpdated`: 画面上部に「最終更新 2026/08/29」のように表示される
  (`YYYY-MM-DD` 形式で入力する)。手動更新のたびに必ず変更すること。

### stops.json

```json
[
  { "id": "daikokucho", "name": "大国町", "lat": 34.6596, "lon": 135.4991 }
]
```

- `name` / `lat` / `lon` は必須。`id` は任意(省略時は名前から自動生成)。

### routes.json

停留所ごとに、そこを通る系統・方面を列挙する。

```json
[
  { "id": "daikokucho-namba", "stopId": "daikokucho", "label": "なんば方面", "destination": "なんば行" }
]
```

- `id`: アプリ全体で一意な系統ID(timetable.json から参照される)。
- `stopId`: `stops.json` の `id` と一致させる。
- `label`: プルダウンに表示する文字列(例: `"なんば方面"`)。
- `destination`: 次のバス表示欄に大きく表示する行き先(例: `"なんば行"`)。

### timetable.json

系統ごとの発車時刻を、1日分・毎日繰り返す前提で列挙する
(実際のバス停の時刻表に書かれている時刻をそのまま入力すればよい)。

```json
[
  { "routeId": "daikokucho-namba", "times": ["05:31", "05:43", "05:55", "06:07"] }
]
```

- `routeId`: `routes.json` の `id` と一致させる。
- `times`: `"HH:MM"` (24時間表記)の配列。**昇順に並べること。**
  平日・土休日ダイヤの区別や早朝・深夜のみの運行など、細かい表現は
  現バージョンでは非対応(将来 GTFS-JP 移行時に対応予定)。

## データの出典に関するルール

このディレクトリに投入するデータは、**合法的に利用可能な公開データ、または
自ら現地で確認した情報など、正当な手段で得たデータのみ**を出典としてください。

- 大阪シティバス公式サイトや「い・ま・ど・こ？」(Bus-Vision)等のスクレイピングは禁止。
- 非公開API・利用規約違反となるAPIの利用は禁止。
- 停留所の名称・位置は、国土交通省「国土数値情報(バス停留所データ / P11)」等の
  オープンデータを優先する。
  https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11.html
- 系統・時刻表は、現時点で正式なオープンデータが確認できていないため、
  現地の時刻表掲示など正当な手段で確認した内容を手動で入力する運用とする。
  大阪シティバスへの正式なデータ提供の問い合わせ結果を待って、
  GTFS-JP / GTFS-RT が利用可能になり次第切り替える予定。

## 実データへの変換ツール

`scripts/convert-ksj-p11.mjs` を使うと、国土数値情報(P11)のGeoJSONから
`stops.json` 形式への変換ができます。使い方はスクリプト冒頭のコメントを参照してください。
