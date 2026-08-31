# 次バス大阪

大阪シティバス専用の個人利用PWAです。

**目的:** GPSで近い停留所を表示し、停留所 → 系統 → 方面を選ぶと、次の3便を「あと○分」で確認できます。

## 現在の状態（2026-08-31）

- 停留所: **992件**
- 停留所×系統: **1,915件**
- 基礎データ: 国土数値情報 P11 2022年度版（大阪シティバス）
- 時刻表: 現地掲示写真等を目視確認して手動整備
- 収録済み: **12系統×方面**
- 未収録系統は架空データを作らず「🚧 時刻表データ準備中」と表示

## 収録済み時刻表

### 鶴町二丁目
- 80号 → あべの橋方面
  - 平日・土曜: 終日
  - 休日: 10時台まで確認済み

### 幸町一丁目（西）
- 29号 → 地下鉄住之江公園
- 71号 → 鶴町四丁目
- 87号 → 新千歳経由・鶴町四丁目
- 60号 → 天保山

### 鶴町一丁目
- 71号 → なんば
- 55号 → 大阪駅前
- 90号 → 野田阪神前
- 91号 → ドーム前千代崎
- 94号 → 小林公園前経由・ドーム前千代崎
- 80号 → あべの橋［天王寺駅前］
- 91急行 → ドーム前千代崎（平日のみ。土曜・休日は運休）

一部の現地掲示が「○分〜○分間隔」表記になっている箇所は、個人利用向けに近似補間しています。近似を使った箇所は `data/metadata.json` に明記しています。

## データ構成

```text
data/
├── metadata.json         出典・収録範囲・注意事項
├── stops.json            停留所
├── routes.json           停留所×系統
├── timetable.json        既存時刻表
└── timetable-extra.json  追加時刻表（鶴町一丁目の追加4系統）
```

`js/timetable-loader.js` が `timetable.json` と `timetable-extra.json` をブラウザ側で結合します。

この方式により、Service Workerがまだページを制御していない**初回アクセス**でも追加時刻表を利用できます。追加ファイルの取得に失敗した場合は既存時刻表だけで起動し、アプリ全体を壊さない設計です。

旧Service Workerが一時的に残る更新途中の端末でも、`routeId + direction + destination` で重複排除するため、追加時刻表が二重登録されません。

## 主な機能

- Geolocation APIで現在地取得
- 近い停留所を10件、距離順に表示
- 停留所 → 系統 → 方面・行先 → 次の3便
- 「あと○分」表示
- 平日 / 土曜 / 休日ダイヤ切替
- 日本の祝日・振替休日・国民の休日を判定
- 24時以降の深夜便に対応
- 選択内容を `localStorage` に保存
- PWA / オフライン対応
- Service Workerはnetwork-first
- 未整備データは推測表示せず「準備中」

## ファイル構成

```text
osaka-nextbus/
├── index.html
├── manifest.json
├── sw.js
├── css/
│   └── style.css
├── js/
│   ├── timetable-loader.js
│   ├── data.js
│   └── app.js
├── data/
│   ├── metadata.json
│   ├── stops.json
│   ├── routes.json
│   ├── timetable.json
│   ├── timetable-extra.json
│   └── README.md
├── scripts/
└── icons/
```

## Service Worker

現在のキャッシュ版は **v24** です。

オンライン時はネットワークを優先し、成功したレスポンスをキャッシュします。オフライン時のみキャッシュへフォールバックします。

`index.html`、`js/timetable-loader.js`、時刻表本体・追加分をすべてprecacheします。

## 時刻表を追加するときの運用

1. 現地掲示写真など正当な情報源から転記
2. `routeId` が `routes.json` に存在することを確認
3. 平日 / 土曜 / 休日を昇順で登録
4. `metadata.json` に出典・近似補間の有無を記録
5. `README.md` / `data/README.md` の収録数を更新
6. アプリ変更時は `sw.js` の `CACHE_VERSION` を更新
7. 次の3便・曜日切替・終バス後ロールオーバーを確認
8. Copilot Code Reviewで第三者監査

## データ方針

- Bus-Vision等の無断スクレイピングは行いません。
- 非公開APIは利用しません。
- 停留所・系統の骨格には公的オープンデータを使用します。
- 時刻表は現地掲示や正式に利用可能な情報から手動整備します。
- 判読不能な時刻を無理に創作しません。
- ただし個人利用のため、掲示自体が間隔表記の場合は近似補間を許容し、必ずmetadataに記録します。

## ローカル確認

```bash
python3 -m http.server 8000
```

その後 `http://localhost:8000` を開きます。

## 公開

GitHub Pagesで静的配信できる構成です。

`https://oosaka0123-sudo.github.io/osaka-nextbus/`
