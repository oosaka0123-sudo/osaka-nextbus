# HANDOFF — 2026-09-23 production完成スナップショット

このファイルは節目だけで更新する一時引き継ぎです。動的な正本は GitHub Issue / PR / Actions / Commit / Deploy です。
default branch 上の内容だけを復帰用途に使います。

## 現在のproduction状態

- 合意済みの「次バス大阪」MVPと、その後ユーザーが追加指定した船町アラーム / Android対応は完成・公開・回帰確認済み。
- 時刻表coverage: **45系統×方面**。
- 初期最優先経路 **なんば ⇄ 鶴町四丁目** は71号・87号について往復とも平日・土曜・休日のproduction時刻表を整備済み。
- 現在地取得後は近い順10停留所を距離(m)付きで表示し、準備中停留所は一覧から削除しない。
- 自動選択は当日に次便を表示できる最寄り停留所を優先。準備中停留所を手動選択した場合は準備中表示を維持。
- 直近1便は「あと X分YY秒」を1秒更新、2便目以降は分表示。
- 翌日便は当日の「早く来る順 / 次の3便」へ混在させない。24:xx表記の深夜便は同一サービス日として維持。
- 確認済み時刻表が当日終了した場合は「本日の次の便はありません」。未確認曜日はfail closedで「時刻表データ準備中」。
- Service Worker: **v59**（正本は `sw.js` の `CACHE_VERSION`）。

## 主な時刻表追加

- 鶴町南公園 87号 → なんば方面: 平日37便 / 土曜33便 / 休日27便を公式Bus-Vision Evidenceで3曜日verified。
- 地下鉄動物園前 80号 → 鶴町四丁目方面: 平日29便 / 土曜28便 / 休日25便を3曜日verified。
- 西船町 70号 → ドーム前千代崎方面: 平日・土曜・休日をproduction反映。70急行はEvidence未確認のため準備中を維持。
- 鶴町二丁目 80号 → あべの橋方面: 3曜日verified。
- 時刻・stopCd / poleCd / strLineList等は今後も公開Evidenceなしに推測しない。

## 船町乗務アラーム

- Web版の現行導線は **`funamachi-alarm-v62.html`**。
- v62は日区分 / 勤務 / 音 / 音量 / 何分前 / 何秒前をプルダウン中心で操作。
- 勤務候補は確定仕様として:
  - 平日: 1¹ / 1² / 1³ / 5¹ / 5² / 5³
  - 休日: 1¹ / 1² / 1³ / 4¹ / 4² / 4³
  - 先頭に「全て鳴らす」
- 黒丸/白丸は常に両方を対象。音色・音量選択、残り時間表示、1秒テスト、自動監視を実装済み。
- Issue #232「Androidで9件UIが出ない」は診断完了。9件グリッド前提は後続の #237 / #245 / #247 で正式に変更されており、現行の曜日別プルダウン仕様が正しいためコード変更不要としてclose済み。
- 旧 `alarm.html?v=54` / `crew-alarm.html` / `duty-alarm.html` は履歴互換用に残るが、新しいホーム導線ではv62を使用する。

## Android

- Android APK版を実装済み。バス本体はWebViewでproductionサイトを表示。
- WebViewで現在地を使うための位置情報権限処理を実装済み。
- ホームから `funamachi-alarm...` を開くとWebページではなく **`NativeFunamachiAlarmActivity`** へ遷移する。
- 船町アラームNative版は:
  - 平日=1系+5系 / 休日=1系+4系
  - 「全て鳴らす」
  - 音 / 音量 / 先行分 / 先行秒
  - `AlarmManager` exact alarm + `setExactAndAllowWhileIdle`
  - Android 12+ exact alarm特別アクセス
  - Android 13+ 通知権限
  - 設定のSharedPreferences保存
  を実装済み。
- GitHub Actionsの最新 **Build Android APK** workflowは SUCCESS を確認済み。
- 公開APK直リンク `/downloads/osaka-nextbus.apk` は2026-09-23確認時 HTTP 200。
- Play配布用AAB生成/API 36対応もmerged済み。Play Console上の公開状態そのものはGitHub正本の範囲外なので、公開済みとは断定しない。

## 最終検証

- latest verified repository snapshot before this docs-only HANDOFF sync:
  `534173030cac5ba97a49ad2e5f1b9445c8695203`（PR #268 merge）。
- latest runtime-affecting commit:
  `3c21e3844d57a7e21d9ae488c1fc720c2d276401`（PR #266「船町アラームだけAndroidネイティブ化」）。
- GitHub Pages: `534173030cac5ba97a49ad2e5f1b9445c8695203` で **built** を確認。
- live確認:
  - 公開 `sw.js` = **v59**
  - ホームの船町アラーム導線 = `funamachi-alarm-v62.html`
  - v62ページ = 公開確認済み
  - APK直リンク = HTTP 200
- Issue #267 / PR #268:
  - smoke testの古いSW固定期待値 v46 をv59へ同期
  - READMEのSW表記もv59へ同期
  - app / `sw.js` / timetable / collectorは変更なし
- final regression（PR #268 head）:
  - `npm run validate`: **PASS**
  - coverage audit: **15/15 PASS**
  - browser smoke: **47/47 PASS**
  - GitHub CIのbrowser smoke step: **SUCCESS**
- `collector/config.py PERMISSION_GRANTED=False` を維持。

## 現在のbus appキュー

- open implementation PR: **なし**。
- active `status:doing`: **なし**。
- active `status:review`: **なし**。
- open bus-app implementation/diagnostic Issue: **なし**。
- Issue #155は非アプリの事業相談Issue。バスアプリ自動キューには含めない。
- 新しいユーザー要件・既存未完了要件がない限り、追加機能や時刻表を推測で作らない。

## 再開手順

1. `AGENTS.md` → `DECISIONS.md` → `RUNBOOK.md` → `docs/CONTINUOUS-AI-PROTOCOL.md` → `HANDOFF.md` の順で確認する。
2. open Issue / open PR / latest Actions / default branch head / Pages状態をGitHub正本で棚卸しする。
3. 新しい合意済みバスアプリIssueがあれば、1 Issue = 1 Agent = 1 Branchで着手する。
4. 未完了要件がなければ新機能を創作せずHuman Gateへ戻す。
5. 外部時刻表・IDは公開Evidenceなしに推測しない。
6. `collector/config.py PERMISSION_GRANTED=False` を維持し、実ネットワークcollectorは別のrisk:high Issue + 人間明示承認なしに有効化しない。
7. Secrets / Credentials / IAM / Billing / force-push / 破壊的不可逆操作はHuman Gateを維持する。
