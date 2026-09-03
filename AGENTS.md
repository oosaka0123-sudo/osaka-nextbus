# AGENTS.md — 次バス大阪 Multi-Agent Operating Protocol

このリポジトリを編集するAIエージェントは、本ファイルを最優先ルールとして扱ってください。
チャット履歴ではなく、GitHub上のIssue / PR / Actions / Commitを正本とします。

## 1. プロジェクト目的

大阪シティバス専用の個人利用PWAです。
GPSで近い停留所を表示し、初期状態では号数・方面を未選択のまま、その停留所から早く来る順に約5件を表示します。
利用者が号数を選ぶとその系統で絞り込み、方面まで選ぶと従来の次の3便表示へ切り替えます。

## 2. Single Source of Truth

動的な現在状態はGitHubの各機能を正本とします。

- Issue = タスク状態・要件・Acceptance Criteria
- PR = 実装差分・レビュー状態
- Actions = テスト状態
- Commit = コード状態
- Deploy = 公開状態
- DECISIONS.md = 設計理由・変えてはいけない制約
- RUNBOOK.md = 実行・検証・復旧手順

`STATUS.md` や `TASK_QUEUE.json` のような手動の重複状態ファイルは作成しません。
チャットUIの過去ログをプロジェクト記憶として前提にしません。

## 3. 交換可能性

すべてのAIエージェントは交換可能とします。
新しいGPT / Gemini / Claude / Julesが途中参加しても、GitHubだけ読めば再開できる状態を維持します。

### GPT — Orchestrator / Lightweight PM
- 原則として読むもの: `AGENTS.md`, `DECISIONS.md`, `RUNBOOK.md`, 現在のIssue, 現在のPR/CI結果。
- 原則として巨大HTMLやリポジトリ全文を毎回読まない。
- 短い人間の依頼をIssueへ展開し、Goal / Acceptance Criteria / Risk / Out-of-scopeを明確化する。
- 次の作業、例外、ブロック解除を判断する。

### Gemini — Heavy Analyzer
- 公開HTML/PDFの巨大コンテキスト解析、長いログ解析、外部仕様調査を担当する。
- 解析結果はIssueコメントへ短く構造化して残す。
- 第三者HTML全文や巨大ダンプをIssue・PR・公開リポジトリへ貼らない。
- OBSERVED（確認事実）とHYPOTHESIS（推測）を必ず分離する。

### Claude Code / Jules — Implementer
- 現在のIssueと、必要ならGeminiの`NEXT`を読んで実装する。
- 1 Issue = 1 Branchで作業し、PRを作成する。
- 必須検証を実行してからレビューへ回す。
- 3回の修正・再テストで解決できなければ無限ループせずBLOCKEDにする。

### Copilot / GitHub Actions — Review & Deterministic Gate
- CopilotはPRレビュー・要約・指摘に使用する。
- GitHub Actionsは決定論的な絶対ゲート。CIが赤なら次へ進まない。
- テスト失敗を無視して完了扱いにしない。

## 4. Issue / Branch / PR プロトコル

Phase 1では同一リポジトリの同時AI編集を避けます。

- 1 Issue = 1 Agent = 1 Branch
- 原則として同時に`status:doing`は1件のみ
- ブランチ例: `feat/issue-31`, `fix/issue-31`, `chore/issue-31`
- default branchへの直接コミットは禁止
- 実装は必ずPR経由
- CI PASS後にレビューし、リスクに応じてマージ判断する

推奨ラベル:

- `status:ready`
- `status:doing`
- `status:review`
- `status:blocked`
- `agent:claude`
- `agent:gemini`
- `agent:human`
- `risk:low`
- `risk:medium`
- `risk:high`

### 3-strike rule

同じ原因に対する「修正 → テスト失敗」を3回繰り返したら停止する。
Issueを`status:blocked`相当として扱い、以下だけを短く残す。

```text
Issue #XX
BLOCKED
原因の要約
3 retries exhausted
次に必要な判断
```

## 5. Gemini解析報告フォーマット

Geminiが解析を完了した場合、Issueへ以下の形式で記録します。

```markdown
## 🤖 GEMINI ANALYSIS COMPLETE

Target:
[停留所名 / 系統番号 / 調査対象]

### OBSERVED
- 実際に確認できた客観的事実のみ

### EVIDENCE
- 確認した公開URL:
- 必要最小限の構造抜粋:
- 取得確認日時: YYYY-MM-DD HH:MM JST

### HYPOTHESIS
- 未確認の推測・仮説

### CONFIDENCE
High / Medium / Low

### NEXT
- 実装担当が次に行う具体的な処理

### RISK
- 規約、負荷、データ欠損、仕様変更など
```

### 報告ルール

- `OBSERVED`に推測を書かない。
- セレクタ名、URLパラメータ、曜日コード等を未確認のまま創作しない。
- アクセス間隔などの数値を「推奨」と書く場合も根拠がなければ`HYPOTHESIS`または`RISK`へ置く。
- 巨大HTMLはIssueへ貼らない。

## 6. スクレイピング / データ収集ガードレール

### 対象
- 公開されているHTML/PDFページのみを調査対象とする。
- 公開画面上で確認できる情報を低頻度・低負荷で扱う方針とする。

### 禁止
- 非公開内部APIや認証回避の解析・利用。
- アクセス制限や技術的保護の回避。
- 第三者サイトの完全HTMLダンプを公開リポジトリへ保存すること。
- 利用規約・robots.txt・明示的な運営者指示に反する収集。
- Bus-Vision等の公開画面を、許諾・運用条件を確認しないまま自動大量取得すること。

### 現在のcollector安全状態

`collector/config.py` の `PERMISSION_GRANTED` は現在 `False` を維持する。
実ネットワーク収集は、このガードを明示的に更新するIssueが承認されるまで実行しない。
第三者からの一般的な回答やAIの解釈だけで勝手に`True`へ変更しない。
合成フィクスチャや最小限のダミー構造によるパーサーテストは可。

## 7. 時刻表データの必須ルール

- 読めない発車時刻を勝手に創作しない。
- 判読不能な単発時刻は省略可。理由は`data/metadata.json`へ記録する。
- 現地掲示が明示的に「○分間隔」等と記載する場合に限り、個人利用向け近似補間を許容する。その場合はmetadataへ明記する。
- `routeId`は必ず`data/routes.json`に存在するものを使う。
- `direction`と`destination`は空にしない。
- `weekday` / `saturday` / `holiday`は配列。
- 運休曜日は`[]`。
- 発車時刻は`HH:MM`。深夜便は`24:07`等の24時超え表記を利用できる。
- 各曜日配列は昇順・重複なし。
- 同一ファイル内で`routeId + direction + destination`を重複登録しない。
- baseとextraの同一キーは意図した上書き補正の場合だけ。extraを正とし、補正理由をmetadataへ記録する。
- 新規時刻表追加時は`data/metadata.json`のcoverageも更新する。
- READMEの収録数は結合後の一意な系統×方面数と一致させる。

## 8. 現在の時刻表構成

- `data/timetable.json`: 基本データ
- `data/timetable-extra.json`: 追加・上書き補正
- `js/timetable-loader.js`: 2ファイルを結合。extra取得失敗時はbaseのみ、同一キーはextra優先

結合後の既存収録データを壊さないこと。
具体的な収録件数はvalidatorとREADMEの現在値を正として確認する。

## 9. PWA / Service Worker

- Service Workerはnetwork-first。
- 現在の`CACHE_VERSION`はv29。
- `index.html` / JS / CSS / 時刻表データ等のPWA配信物を変更し、旧キャッシュ残存が問題になり得る場合は`CACHE_VERSION`を上げる。
- README / AGENTS / DECISIONS / RUNBOOK / 検証スクリプトのみの変更では無意味に上げない。

## 10. 必須検証

変更後はRUNBOOKに従う。
最低限:

```bash
npm ci
npm run validate
node --check js/timetable-loader.js
node --check js/data.js
node --check js/app.js
npm run test:smoke
```

GitHub Actions `Validate bus data` がPASSすること。

## 11. Risk分類

### risk:low
- 文言、軽微なUI、テスト追加、限定的な時刻表修正

### risk:medium
- 複数ファイルにまたがるロジック変更
- データ収集ロジック
- PWA挙動の変更

### risk:high
- 認証、課金、DNS/ドメイン、本番インフラ
- `.htaccess`やルーティング基盤
- 大量削除、DB破壊的変更
- 規約・外部サービス利用条件に関わる収集方式変更
- 実ネットワークcollectorの有効化

`risk:high`は人間の明示承認なしに実行しない。

## 12. 禁止コマンド / 破壊操作

原則禁止:

- `git push --force`
- `rm -rf`
- `DROP TABLE`
- 本番への直接FTP/SSH上書き
- 大量・破壊的削除
- CI失敗状態での完了扱い

## 13. Bootstrap例外

AI開発OS v1そのものを最初に導入する1回だけ、Issueプロトコル導入前のためブートストラップ用ブランチで3コア文書を追加する例外を認める。
この初回PRがマージされた後は、原則として全作業をIssue起点にする。
