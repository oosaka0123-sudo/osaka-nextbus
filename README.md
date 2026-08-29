# 次バス大阪 (大阪シティバス 次のバス表示 PWA)

「開いた瞬間、いつものバスがあと何分か分かる」をコンセプトにした、
毎日同じ大阪シティバスの停留所を使う人向けの、極めてシンプルなスマホ専用 PWA です。

高機能な乗換案内アプリではありません。地図もメニューも路線検索もありません。
アプリを開いたら、いつものバス停・いつもの方面の「次のバスまであと何分か」が
3秒以内にわかることだけを目的にしています。

## 画面の流れ

```
現在地取得 → 近い停留所を6件・距離順に表示 → 最寄りを自動選択
→ 方面・系統を選択 → 次のバス3便を表示 → 「あと○分」を大きく表示
```

## ⚠️ データについて(重要)

大阪シティバスの GTFS-JP / GTFS-RT は、現時点で一般開発者向けの正式な
公開URL・APIを確認できていません(大阪シティバスへ別途問い合わせ中)。
そのため、当面は **`/data` 以下のJSONファイルを手動更新する方式** で運用します。

- 大阪シティバス公式サイトや「い・ま・ど・こ？」(Bus-Vision)のスクレイピングは一切行っていません。
- 非公開APIの解析・利用も行っていません。
- 停留所名・緯度経度は、国土交通省「国土数値情報(バス停留所データ / P11)」等の
  合法的に利用可能なオープンデータを優先します。
- 系統・時刻表は、現地の時刻表掲示など正当な手段で確認した内容を手動入力します。

**正式な時刻表データが無い停留所・系統は、架空の時刻を本物のように表示せず、
「🚧 時刻表データ準備中」と明示します。** データの形式・更新手順の詳細は
[`data/README.md`](data/README.md) を参照してください。

## 主な機能

1. Geolocation API による現在地取得
2. 現在地から近い順に停留所を6件取得・距離順に表示(例: `大国町 420m`)
3. 最も近い停留所を自動選択。残り5件はプルダウンから自由に選択可能
4. 停留所・方面(系統)をそれぞれプルダウンで変更可能
5. 次のバスを大きく表示、次の3便まで表示、各便に「あと○分」を表示
6. 選択したバス停・方面を `localStorage` に保存し、次回起動時に自動復元
7. 初回起動時は位置情報の許可を求めて最寄りを自動表示。2回目以降は保存済みの
   「いつもの停留所」を優先し、「現在地から探す」ボタンでのみ現在地基準に切り替え
8. 画面上部に「最終更新 2026/08/29」のようにデータの最終更新日を表示(`data/metadata.json` 由来)
9. 系統・時刻表データが未整備の場合は「時刻表データ準備中」と明示し、架空の時刻は表示しない
10. `manifest.json` + Service Worker による PWA 対応(ホーム画面追加・オフライン起動)
11. Service Worker は network-first 方式のため、オンライン時は常に最新のデータ・コードを取得しつつ、
    オフライン時のみキャッシュにフォールバックする(古い時刻表が残り続けることを防止)
12. Android Chrome / iPhone Safari の両方を考慮した、スマホ最優先のレスポンシブ・ダークUI

## ファイル構成

```
osaka-nextbus/
├── index.html          画面本体
├── manifest.json        PWA マニフェスト
├── sw.js                Service Worker(network-first キャッシュ)
├── css/
│   └── style.css        スマホ最優先のレスポンシブスタイル
├── js/
│   ├── data.js           データ層(BusDataSource)。/data 読み込み・デモデータ・距離/時刻計算
│   └── app.js             UI制御(プルダウン制御・表示更新・Geolocation・localStorage連携)
├── data/
│   ├── metadata.json      データの出典種別(demo/manual/gtfs-jp等)・最終更新日
│   ├── stops.json         停留所(名前・緯度経度)
│   ├── routes.json        各停留所を通る系統・方面
│   ├── timetable.json     各系統の発車時刻表
│   └── README.md          データ形式・更新手順の詳細
├── scripts/
│   └── convert-ksj-p11.mjs   国土数値情報(P11)→ data/stops.json 変換スクリプト
├── icons/                 PWAアイコン一式
└── README.md
```

## データ層とUI層の分離について

`js/data.js` の `BusDataSource` は、`init / getMetadata / getStops /
getStopsSortedByDistance / getRoutesForStop / getNextDepartures` という
データ取得方法に依存しないインターフェースのみを公開しており、`js/app.js` は
このインターフェースだけに依存しています。

`data/metadata.json` の `dataSource` が `"demo"`(またはファイル自体が無い)の
間は、`js/data.js` 内蔵のデモデータで動作し「DEMO」バッジを表示します。
`dataSource` を `"demo"` 以外にし、`stops.json` にデータを入れて commit / push
するだけで実データに切り替わり、DEMOバッジは自動的に消えます。

将来 GTFS-JP / GTFS-RT の提供を受けられた場合は、`BusDataSource.init()` 内の
データ取得処理を GTFS パーサー/APIクライアントに差し替えるだけで移行でき、
`js/app.js` 側の変更は不要です(手動データ → GTFS-JP → GTFS-RT の段階的移行を想定した設計)。

## 手動データの更新方法(スマホだけで完結)

1. `data/stops.json` / `routes.json` / `timetable.json` を実データに置き換える
   (GitHubのWeb UIの `Add file → Upload files` または直接編集)。
2. `data/metadata.json` の `dataSource` を `"demo"` 以外に、`lastUpdated` を更新日に変更する。
3. commit / push する。

GitHub Pagesが自動的に再デプロイし、次にアプリを開いたときから反映されます
(手順の詳細・JSON形式は [`data/README.md`](data/README.md) を参照)。

## 技術構成

- HTML / CSS / Vanilla JavaScript(フレームワーク・ビルドツール不使用)
- データは `/data` 以下のプレーンなJSONファイル
- 状態保存は `localStorage`
- 現在地取得は `Geolocation API`
- PWA 対応(`manifest.json` + Service Worker)
- 外部通信・サーバーサイド処理なし。完全に静的ファイルのみで構成されており、
  GitHub Pages 等の静的ホスティングでそのまま公開可能です。

## ローカルでの動作確認方法

Geolocation API と Service Worker はセキュリティ上の理由から
`file://` では正しく動作しないため、簡易HTTPサーバー経由で確認してください
(`localhost` は例外的に HTTPS 扱いのため、ローカル確認時は HTTP で問題ありません)。

```bash
cd osaka-nextbus
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

スマホの実機で試す場合は GPS・Service Worker の制約上、
本番相当の HTTPS 環境(GitHub Pages 等)での確認を推奨します。

## 公開方法(例: GitHub Pages)

1. このリポジトリの公開用ブランチに本アプリのファイル一式を配置する。
2. GitHub リポジトリの Settings → Pages で公開ブランチ・ルートディレクトリを指定する。
3. 発行された `https://<username>.github.io/<repo>/` にスマホでアクセスし、
   「ホーム画面に追加」から PWA としてインストールして動作確認する。

## 既知の制約

- 停留所・系統・時刻表は、実データが投入されるまでデモデータ(停留所6件)で動作します。
- 平日/土休日ダイヤの区別には未対応(将来 GTFS-JP 移行時に対応予定)。
- 遅延・運休・臨時便などのリアルタイム情報には対応していません(GTFS-RT 移行後に対応予定)。
- 多言語対応(英語表記等)は未対応です。
