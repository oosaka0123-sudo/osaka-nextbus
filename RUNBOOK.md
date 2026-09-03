# RUNBOOK.md — Operational Procedures

このファイルは新しいAIや開発者が最短で安全に作業を再開するための実行手順です。
動的な進捗はIssue / PR / Actionsを参照してください。

## 1. 最初に読むもの

作業開始時はこの順で確認します。

1. `AGENTS.md`
2. `DECISIONS.md`
3. この`RUNBOOK.md`
4. 現在のIssue
5. 現在のPR / GitHub Actions結果

巨大HTML、過去チャット全文、リポジトリ全履歴は原則として最初から読まない。

## 2. 開発サイクル

1. GPTがIssueを作成し、Goal / Acceptance Criteria / Risk / Out-of-scopeを定義
2. 必要な場合だけGeminiが公開ページや巨大ログを解析
3. GeminiはIssueへ`GEMINI ANALYSIS COMPLETE`形式で短く記録
4. Claude Code / Julesが1 Issue = 1 Branchで実装
5. ローカル検証
6. PR作成
7. GitHub Actionsを実行
8. Copilot / Human review
9. CI PASSかつレビュー問題なしならマージ
10. Issueを完了し、次Issueへ進む

同じ失敗を3回繰り返したら作業を停止しBLOCKEDとして報告する。

## 3. セットアップ

Node.js環境で:

```bash
npm ci
```

依存関係は`package-lock.json`を正として再現します。

## 4. データ検証

```bash
npm run validate
```

直接実行する場合:

```bash
node scripts/validate-data.mjs
```

主な確認対象:

- JSON parse
- stopId / routeId参照
- HH:MM形式
- 曜日別配列の昇順・重複
- base / extra結合後の整合性
- metadata coverage

## 5. JavaScript構文確認

```bash
node --check js/timetable-loader.js
node --check js/data.js
node --check js/app.js
```

## 6. ブラウザ回帰テスト

```bash
npm run test:smoke
```

Playwrightが必要なブラウザをまだ持っていない環境では、必要に応じてPlaywrightのブラウザセットアップを行ってから再実行する。

確認対象例:

- 停留所表示
- GPS許可 / 拒否
- 初期状態の号数・方面未選択
- 早く来る順の約5件表示
- 号数フィルタ
- 方面選択後の次3便表示
- 主表示の秒カウント
- 平日 / 土曜 / 休日
- 24時超え便
- 終バス後ロールオーバー
- pending表示
- Service Worker / offline
- 既存時刻表の回帰

## 7. ローカルWebサーバー

簡易確認:

```bash
python3 -m http.server 8123
```

ブラウザで:

```text
http://localhost:8123/
```

PWA / Service Workerの挙動を確認する場合は、キャッシュ状態とcontroller更新にも注意する。

## 8. Service Worker更新

PWA配信物を変更して旧キャッシュが問題になる場合のみ`sw.js`の`CACHE_VERSION`を上げる。

現在の基準バージョン:

```text
v29
```

次のような文書変更だけでは上げない:

- AGENTS.md
- DECISIONS.md
- RUNBOOK.md
- README.mdのみ

## 9. 時刻表データ変更時

必ず以下を確認する。

- routeIdが`data/routes.json`に存在する
- direction / destinationが正しい
- weekday / saturday / holidayが配列
- 運休は`[]`
- 時刻は昇順・重複なし
- 架空時刻を作っていない
- 近似ならmetadataに明記
- extra補正なら上書き理由をmetadataに記録
- coverageと結合後件数が一致

## 10. collector / 外部Web調査

### 現在の安全状態

`collector/config.py`:

```text
PERMISSION_GRANTED = False
```

この状態では実ネットワーク収集を開始しない。
AIが独断で`True`へ変更しない。

### 許可されるPhase 1作業

- 公開URLの人手確認
- 公開ページ構造の解析
- Geminiによる巨大コンテキスト解析
- 合成フィクスチャでのパーサーテスト
- JSON変換仕様の設計

### 実ネットワークcollector有効化前の条件

別Issueを作成し、最低限以下をAcceptance Criteriaに含める。

- 対象URLと公開範囲が確認済み
- 規約・robots.txt・運営者回答を確認済み
- アクセス頻度と並列数を明示
- キャッシュ / checkpoint / backoff設計を明示
- `risk:high`として人間承認
- `PERMISSION_GRANTED_NOTE`に根拠を記録

## 11. Gemini調査の入力・出力

Geminiへ巨大HTMLを渡す場合、GitHubへ全文を保存する必要はありません。
解析結果だけをIssueへ残します。

Issueコメントは:

```text
OBSERVED
EVIDENCE
HYPOTHESIS
CONFIDENCE
NEXT
RISK
```

の順に整理します。

第三者HTMLの引用は必要最小限にし、構造確認に必要な範囲を超えて転載しない。

## 12. Gemini Heavy Analyzer GitHub Actions

Phase 1では`.github/workflows/gemini-analyze.yml`を**手動dispatch**で起動する。
Issueオープン時の自動起動やGeminiによるコード書き込みはまだ有効化しない。

### 初回だけ必要: Gemini API KeyをGitHub Secretへ登録

Google AI Studio等で取得したキーを、GitHubリポジトリの:

```text
Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

へ登録する。

Secret名は必ず:

```text
GEMINI_API_KEY
```

キー値を`.env`、Issue、PR、チャット貼り付け用ファイル、リポジトリ内ドキュメントへ保存しない。
このSecretが未設定ならworkflowは明示エラーで停止する。

### Gemini解析を実行

GitHubリポジトリで:

```text
Actions
→ Gemini Heavy Analyzer
→ Run workflow
→ issue_number に対象Issue番号を入力
→ Run workflow
```

例:

```text
issue_number: 12
```

workflowは以下を行う。

1. リポジトリをread-only権限でcheckout
2. 対象Issueを`.gemini/issue.json`へ一時取得
3. Geminiへ`AGENTS.md / DECISIONS.md / RUNBOOK.md / issue.json`を読ませる
4. 公開情報だけを解析させる
5. `OBSERVED / EVIDENCE / HYPOTHESIS / CONFIDENCE / NEXT / RISK`形式を要求
6. 必須見出しを機械検査
7. 合格した結果だけ対象Issueへコメント

`.gemini/`は`.gitignore`対象で、生成した一時コンテキストをGitHubへコミットしない。

### Gemini workflow失敗時

- `GEMINI_API_KEY is not configured` → Secret設定を確認
- 必須見出し不足 → Gemini出力を採用せず、prompt/Issue要件を確認
- 外部ページが取得不能 → 取得不能を事実としてIssueへ残し、推測で補完しない
- 3回同じ失敗 → Issueを`status:blocked`

Geminiの結果がIssueへ正常投稿されたら、PMは`OBSERVED`と`EVIDENCE`を確認して次のImplementer Issueへ進める。

## 13. PR作成前チェック

```bash
npm run validate
node --check js/timetable-loader.js
node --check js/data.js
node --check js/app.js
npm run test:smoke
```

すべてPASSしたらPRへ。

PR本文には最低限:

- Related Issue
- Summary
- Changed behavior / files
- Tests run and results
- Risk
- UI変更なら確認内容

を記載する。

## 14. CI失敗時

1. Actionsの失敗stepを特定
2. 原因を1つに絞る
3. 修正
4. 同じ必須テストを再実行
5. 3回失敗で停止

BLOCKED報告例:

```text
Issue #31
BLOCKED
Playwright: expected 5 rows but got 0
3 retries exhausted
Need timetable fixture / requirement review
```

## 15. 復旧・引き継ぎ

新しいチャットや別AIへ移った場合、過去チャットを復元しようとせず:

1. `AGENTS.md`
2. `DECISIONS.md`
3. `RUNBOOK.md`
4. open Issue
5. open PR
6. latest Actions

だけを読んで再開する。

目標: 完全に新しいセッションでも約5分以内に現在状態を理解し、安全に次作業へ進めること。
