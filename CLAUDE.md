# CLAUDE.md — Claude Code追加ルール

まずリポジトリ直下の **`AGENTS.md` を正本として必ず読むこと**。
データ入力・架空時刻禁止・近似補間・metadata更新・自動検証・Service Worker更新方針は `AGENTS.md` に従う。

このファイルではClaude Code環境で追加して行う**実ブラウザ動作確認**だけを定義する。

## 基本方針

- コードを書くだけで完了しない。
- 確認質問で作業を止めず、テスト → 修正 → 再テストまで自律的に進める。
- `node scripts/validate-data.mjs` とGitHub ActionsがPASSしても、UI変更・時刻表変更時はブラウザ動作確認も行う。
- テストが通るまで「完成」と報告しない。

## 現在のデータ構成

時刻表は2ファイル構成。

- `data/timetable.json` — 基本8エントリ
- `data/timetable-extra.json` — 追加4エントリ + 上書き補正1エントリ
- `js/timetable-loader.js` — 両者を結合（extra失敗時はbaseのみ、同一キーはextra優先）

rawでは13エントリ、結合後は合計12系統×方面（2026-08-31時点）。extraの同一キーは写真再照合などの意図した補正として利用できるが、理由をmetadataへ必ず記録する。

## commit/push前の必須確認

1. ローカルWebサーバーを起動する（`python3 -m http.server 8123` 等）
2. `index.html` を実ブラウザで表示
3. pageerror / console.error が0件
4. 初回起動時の表示
5. GPS許可時：近い順10件・距離表示・最寄り自動選択
6. GPS拒否/失敗時：全停留所から手動選択可能
7. 停留所変更 → 系統変更 → 方面変更
8. 次の3便と「あと○分」
9. 平日 / 土曜 / 休日切替
10. 24時超え便（例 24:07）の翌日換算
11. 終バス後の翌日ロールオーバー
12. 未収録時の「🚧 時刻表データ準備中」
13. `data/metadata.json` の最終更新日表示
14. localStorageの選択保存・再読み込み復元
15. Service Worker登録・activate
16. 古いCACHE_VERSIONのキャッシュがactivate後に削除される
17. 375〜390px程度のスマホ幅で致命的な表示崩れなし
18. 既存収録系統の回帰確認
19. baseとextraが同一キーの場合、extraの補正値がUI/merged fetchへ反映される

## Playwright

Claude Code環境ではNode.js + Playwrightを推奨。

```bash
python3 -m http.server 8123
```

テストでは必要に応じて：

- geolocationをモック
- `page.addInitScript` で `Date` を固定して曜日・深夜ケースを再現
- `#stop-select`
- `#route-select`
- `#direction-select`
- `#eta-0`, `#time-0`, `#dest-0`
- `#time-1`, `#eta-1`
- `#time-2`, `#eta-2`
- `#pending-message`

を確認する。

テスト用の架空データが必要な場合、本番 `data/*.json` を直接差し替えない。作業用コピーまたはブラウザ側モックを使用する。

## 時刻表変更時の追加確認

- 新規 `routeId` が `routes.json` と一致
- direction / destinationがUIで正しく表示
- 曜日別の便数が指示値と一致
- 先頭便・中間便・終便を最低1件ずつ確認
- 91急行など運休曜日が `[]` の場合、その曜日に架空便が出ない
- 近似補間を使ったデータは `metadata.json` に注記がある
- 上書き補正を使った場合はbaseとextraの差分内容・補正理由を確認する

## Service Worker

`AGENTS.md` の方針を優先する。

PWA配信物（index / JS / CSS / 時刻表データなど）を変更し、旧キャッシュが問題になり得る場合は `CACHE_VERSION` を上げる。
README・AGENTS・検証スクリプトのみの変更では無意味に上げない。

## collector/

大阪シティバスから正式な利用許可を得るまでは、Bus-Vision等への実ネットワーク収集を行わない。
`collector/config.py` の `PERMISSION_GRANTED` は許可確認前に `True` にしない。
合成フィクスチャによるテストのみ許可する。
