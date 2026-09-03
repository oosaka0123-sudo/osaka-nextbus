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
- GitHub Actionsでデータ・JavaScript・Chromiumブラウザ動作をpush/PR時に自動検証

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
├── timetable.json        基本時刻表（8エントリ）
└── timetable-extra.json  追加・補正時刻表（追加4 + 上書き補正1）
```

`js/timetable-loader.js` が `timetable.json` と `timetable-extra.json` をブラウザ側で結合します。

この方式により、Service Workerがまだページを制御していない**初回アクセス**でも追加時刻表を利用できます。追加ファイルの取得に失敗した場合は既存時刻表だけで起動し、アプリ全体を壊さない設計です。

`routeId + direction + destination` が同じ場合は `timetable-extra.json` 側を優先します。旧Service Worker対策だけでなく、写真再照合で判明した時刻表修正を安全に上書きする補正レイヤーとしても使用します。現在は鶴町一丁目90号の休日ダイヤ補正に利用しています。

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
├── AGENTS.md
├── CLAUDE.md
├── index.html
├── manifest.json
├── sw.js
├── package.json
├── package-lock.json
├── playwright.config.js
├── .github/
│   └── workflows/
│       └── validate-data.yml
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
│   ├── validate-data.mjs
│   ├── report-corridor-coverage.mjs
│   ├── report-corridor-coverage.test.mjs
│   ├── convert-ksj-p11.mjs
│   └── timetable-csv-to-json.mjs
├── tests/
│   └── smoke.spec.js
└── icons/
```

## 自動検証

`node scripts/validate-data.mjs` は、次の**運行データ5ファイル**を対象に機械検証します。

- `data/stops.json`
- `data/routes.json`
- `data/timetable.json`
- `data/timetable-extra.json`
- `data/metadata.json`

検証内容：

- 上記5ファイルが正常にJSON parseできる
- 停留所ID重複、停留所名、緯度経度の妥当性
- `routes.json` の `stopId` が `stops.json` に存在する
- route ID重複、route labelの欠落
- 時刻表の `routeId` が `routes.json` に存在する
- `direction` / `destination` が空でない
- `weekday` / `saturday` / `holiday` が配列
- `HH:MM` 形式（24時以降の深夜便も許容）
- 時刻が昇順
- 同一曜日内の重複時刻なし
- 同一ファイル内の `routeId + direction + destination` 重複なし
- baseとextraで同じ複合キーがある場合はブラウザと同じくextraを正式な上書きとして扱う
- `metadata.json` のcoverage件数と**結合後の一意な時刻表エントリ数**が一致
- coverage各要素の `stop / route / direction / destination` がtrim後も空でない文字列
- coverageと結合後の実時刻表が停留所・系統・方面・行先で1対1対応する
- `lastUpdated` が `YYYY-MM-DD` 形式

`manifest.json` や `collector/tests/fixtures/*.json` など、上記5ファイル以外のJSONは `validate-data.mjs` の対象ではありません。

## 優先区間のcoverage監査

ユーザー最優先区間の「停留所×系統に時刻表が収録されているか」を、既存データだけからオフラインで確認できます。未収録routeを架空時刻で補完する機能ではありません。

既定対象は `なんば / 鶴町一丁目 / 鶴町二丁目 / 鶴町三丁目 / 鶴町四丁目` です。

```bash
node scripts/report-corridor-coverage.mjs
```

JSON出力:

```bash
node scripts/report-corridor-coverage.mjs --json
```

任意の停留所だけを指定する場合:

```bash
node scripts/report-corridor-coverage.mjs なんば 鶴町四丁目
```

監査スクリプトは `timetable.json` と `timetable-extra.json` をブラウザと同じルールで結合し、同一 `routeId + direction + destination` はextra側を優先してcoverageを判定します。存在しない停留所名や同名停留所で一意に決められない場合はfail closedします。

route単位のcovered/missingに加えて、曜日区分（weekday/saturday/holiday）ごとのverified/missingも出力します。`verifiedCalendars` を省略したentryは既存互換のため3曜日ともverified扱い、指定したentryは列挙した曜日だけverified扱いです。例えばなんば71号/87号は `verifiedCalendars: ["weekday"]` のため `weekday=verified saturday=missing holiday=missing` と出ます（土曜・休日のEvidence収集はまだ未完了という意味で、架空の時刻を補完済みという意味ではありません）。

監査ロジックの自動テスト:

```bash
npm run test:coverage-audit
```

## ブラウザ回帰テスト

Playwright（Chromium）で、現在は次の8シナリオを自動テストします。

1. 鶴町一丁目71号の次の3便表示
2. `timetable-extra.json` 側の鶴町一丁目91号がUIへ結合されること
3. extra側の補正がbaseより優先され、90号休日の誤読 `13:51` が除外・80号休日 `09:51` が反映されること
4. 幸町一丁目71号の `24:07` が翌日 `00:07` として表示されること
5. 停留所・系統・方面の `localStorage` 保存と再読み込み復元
6. GPS成功時に近い順10停留所へ絞り込まれること
7. GPS拒否時に全停留所から手動選択できること
8. Service Worker v29でオフライン時もextra側91号を利用できること

各テストでは可能な範囲で `pageerror` / `console.error` も監視します。

GitHub Actionsの `.github/workflows/validate-data.yml` がpush/PR時に自動実行し、データvalidator、coverage audit、JavaScript構文、Playwright Chromium回帰をまとめて検査します。npm依存は `package-lock.json` をコミットし、CIでは `npm ci` を使って固定します。

## Service Worker

現在のキャッシュ版は **v29** です。

オンライン時はネットワークを優先し、成功したレスポンスをキャッシュします。オフライン時のみキャッシュへフォールバックします。

`index.html`、`js/timetable-loader.js`、時刻表本体・追加分をすべてprecacheします。

## 時刻表を追加・補正するときの運用

1. 現地掲示写真など正当な情報源から転記
2. `routeId` が `routes.json` に存在することを確認
3. 平日 / 土曜 / 休日を昇順で登録
4. 写真再照合による補正は、必要に応じて `timetable-extra.json` の同一複合キーで上書きする
5. `metadata.json` に出典・近似補間・補正理由を記録
6. `README.md` / `data/README.md` の説明を更新
7. `node scripts/validate-data.mjs` を実行
8. 配信データ変更時は `sw.js` の `CACHE_VERSION` を更新
9. 次の3便・曜日切替・終バス後ロールオーバーを確認
10. GitHub ActionsがPASSすることを確認
11. Copilot Code Reviewで第三者監査

## データ方針

- Bus-Vision等の無断スクレイピングは行いません。
- 非公開APIは利用しません。
- 停留所・系統の骨格には公的オープンデータを使用します。
- 時刻表は現地掲示や正式に利用可能な情報から手動整備します。
- 判読不能な時刻を無理に創作しません。
- ただし個人利用のため、掲示自体が間隔表記の場合は近似補間を許容し、必ずmetadataに記録します。

## ローカル確認

```bash
node scripts/validate-data.mjs
npm run test:coverage-audit
node scripts/report-corridor-coverage.mjs
npm ci
npx playwright install chromium
npm run test:smoke
```

単純にブラウザで確認する場合は、別ターミナルで以下を起動します。

```bash
python3 -m http.server 8000
```

その後 `http://localhost:8000` を開きます。

## 公開

GitHub Pagesで静的配信できる構成です。

`https://oosaka0123-sudo.github.io/osaka-nextbus/`
