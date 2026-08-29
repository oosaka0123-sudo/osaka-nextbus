# 大阪シティバス 次のバス (MVP / デモ版)

「開いた瞬間、いつものバスがあと何分か分かる」をコンセプトにした、
毎日同じ大阪シティバスの停留所を使う人向けの、極めてシンプルなスマホ専用 PWA です。

高機能な乗換案内アプリではありません。地図もメニューも路線検索もありません。
アプリを開いたら、いつものバス停・いつもの方面の「次のバスまであと何分か」が
3秒以内にわかることだけを目的にしています。

## ⚠️ データについて(重要)

**このリポジトリに含まれるバス停・方面・時刻表データはすべて仮のデモデータです。**

- 大阪シティバス公式サイトや「い・ま・ど・こ？」等のスクレイピングは一切行っていません。
- 非公開APIの解析・利用も行っていません。
- バス停の名称・位置(緯度経度)は公開地図情報を参考にした実在の地名ですが、
  発車間隔・時刻はすべて `js/data.js` 内で機械的に生成した創作値であり、
  実際の大阪シティバスの運行時刻とは一切関係ありません。
- 大阪シティバスの GTFS/API 利用許可が得られた際は、`js/data.js` の
  `DemoBusDataSource` を正式データを返す実装に差し替えるだけで、
  UI 側 (`js/app.js` / `index.html` / `css/style.css`) は変更せずに
  そのまま利用できるように設計しています(データ層とUI層の分離)。

## 主な機能

1. Geolocation API による現在地取得
2. 現在地に近い順にバス停候補をプルダウン表示
3. バス停をプルダウンで変更可能
4. 行き先・方面もプルダウンで変更可能
5. 次のバスを大きく表示
6. 次の3便まで表示(1便目・2便目・3便目)
7. 各便に「あと○分」を表示
8. 最初の1便は特に大きく強調表示
9. 選択したバス停・方面を `localStorage` に保存
10. 次回起動時は前回利用したバス停・方面を自動表示
11. 「現在地から探す」ボタンでいつでも再検索可能
12. `manifest.json` + Service Worker による PWA 対応(ホーム画面追加・オフライン起動)
13. Android Chrome / iPhone Safari の両方を考慮した実装
14. スマホ最優先のレスポンシブ・ダークUI
15. HTTPS 環境での GPS 利用を前提とした設計(HTTPS 必須の Geolocation API)

## ファイル構成

```
osaka-nextbus/
├── index.html          画面本体(バス停・方面プルダウン、次のバス表示、現在地ボタン)
├── manifest.json        PWA マニフェスト
├── sw.js                Service Worker(静的アセットのキャッシュ)
├── css/
│   └── style.css        スマホ最優先のレスポンシブスタイル
├── js/
│   ├── data.js           データ層(BusDataSource)。デモデータと距離計算・時刻計算ロジック
│   └── app.js             UI制御(プルダウン制御・表示更新・Geolocation・localStorage連携)
├── icons/
│   ├── icon-192.png / icon-512.png   PWAアイコン(any / maskable 両対応)
│   ├── apple-touch-icon.png          iOS ホーム画面用アイコン
│   └── favicon-32.png                favicon
└── README.md
```

### データ層とUI層の分離について

`js/data.js` は `DemoBusDataSource` という1つのオブジェクトを通じてのみ
バス停・時刻表データを外部に公開しています(`getStops`, `getStopsSortedByDistance`,
`getNextDepartures` など)。`js/app.js` はこのインターフェースのみに依存しており、
デモデータの中身(バス停名・座標・発車間隔)には一切依存していません。

そのため、将来 GTFS-JP 等の正式データを利用できるようになった場合は、
同じインターフェースを実装した `RealBusDataSource` のようなオブジェクトを作成し、
`js/app.js` 冒頭の `const dataSource = DemoBusDataSource;` を
差し替えるだけで移行できます。

## 技術構成

- HTML / CSS / Vanilla JavaScript(フレームワーク・ビルドツール不使用)
- データは JSON 相当のプレーンオブジェクト(`js/data.js` 内)
- 状態保存は `localStorage`
- 現在地取得は `Geolocation API`
- PWA 対応(`manifest.json` + Service Worker によるオフラインキャッシュ)
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

1. このリポジトリの `main` ブランチ(または任意の公開用ブランチ)に
   本アプリのファイル一式を配置する。
2. GitHub リポジトリの Settings → Pages で公開ブランチ・ルートディレクトリを指定する。
3. 発行された `https://<username>.github.io/<repo>/` にスマホでアクセスし、
   「ホーム画面に追加」から PWA としてインストールして動作確認する。

## 既知の制約(MVPの範囲)

- バス停・時刻表はすべてデモデータであり、実際の運行状況とは異なります。
- 遅延・運休・臨時便などのリアルタイム情報には対応していません。
- 収録しているバス停は代表的な数か所のみです。
- 多言語対応(英語表記等)は未対応です。
