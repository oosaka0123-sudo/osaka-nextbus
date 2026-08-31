# AGENTS.md — 次バス大阪

このリポジトリを編集するAIエージェントは、以下を最優先ルールとして扱ってください。

## 目的

大阪シティバス専用の個人利用PWAです。GPSで近い停留所を出し、停留所 → 系統 → 方面を選ぶと、次の3便を「あと○分」で表示します。

## 作業方針

- 細かな確認質問で止まらず、既知の情報から安全に進める。
- ただし、読めない発車時刻を勝手に創作しない。
- 判読不能な単発時刻は省略してよい。省略理由は `data/metadata.json` に記録する。
- 現地掲示が明示的に「○分間隔」「○〜○分間隔」と書かれている場合に限り、個人利用向けの近似補間を許容する。その場合は必ず `metadata.json` に近似であることを明記する。
- 既存データを壊さない。時刻表追加では既存エントリを不要に書き換えない。

## 時刻表データの必須ルール

- `routeId` は必ず `data/routes.json` に存在するものを使う。
- `direction` と `destination` は空にしない。
- `weekday` / `saturday` / `holiday` は配列にする。
- 運休曜日は `[]` を使う。
- 発車時刻は `HH:MM`。深夜便は `24:07` のような24時超え表記を利用できる。
- 各曜日配列は昇順・重複なし。
- `routeId + direction + destination` の同一キーを重複登録しない。
- 新規時刻表を追加したら `data/metadata.json` の `timetableSource.coverage` も必ず追加する。
- READMEの収録数も実データと一致させる。

## 現在の時刻表構成

- `data/timetable.json`: 既存8系統×方面
- `data/timetable-extra.json`: 追加4系統×方面
- `js/timetable-loader.js`: 2ファイルを結合。extra取得失敗時はbaseのみで継続。同一キーはextra優先。

合計12系統×方面（2026-08-31時点）。

## PWA / Service Worker

- Service Workerはnetwork-first。
- 現在の `CACHE_VERSION` は v25。
- `index.html` / JS / CSS / 時刻表ファイルなどPWA配信物を変更して、旧キャッシュ残存が問題になり得る場合は `CACHE_VERSION` を上げる。
- READMEや検証スクリプトだけの変更では、PWAキャッシュ版を無意味に上げなくてよい。

## 必須検証

変更後は必ず以下を行う。

```bash
node scripts/validate-data.mjs
node --check js/timetable-loader.js
node --check js/data.js
node --check js/app.js
```

GitHub Actions `Validate bus data` がPASSすることも確認する。

検証対象：

- JSON parse
- stopId参照
- routeId参照
- HH:MM形式
- 昇順
- 重複なし
- metadata coverage件数
- JavaScript構文

UIや時刻表を変更した場合は追加で、次の3便・平日/土曜/休日切替・終バス後ロールオーバー・既存系統の回帰を確認する。

## レビュー

- 実装 → 自己検証 → 修正 → GitHub Actions PASS → Copilot Code Review の順。
- Copilotで指摘が出たら内容を確認し、妥当なら修正して再監査する。
- 監査専用PRは本線へ変更がすでに入っている場合、マージせずレビュー記録として閉じてよい。

## 禁止

- 架空の時刻をそれらしく補うこと。
- Bus-Vision等の無断スクレイピング。
- 非公開APIの解析・利用。
- routeIdを推測で新規生成して時刻表だけ先に入れること。
- テスト失敗を無視して完了扱いにすること。
