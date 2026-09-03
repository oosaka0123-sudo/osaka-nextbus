# RUNBOOK.md — Operational Procedures

このファイルは新しいAIや開発者が最短で安全に作業を再開するための実行手順です。
動的な進捗はIssue / PR / Actionsを参照してください。

## 1. 最初に読むもの

作業開始時はこの順で確認します。

1. `AGENTS.md`
2. `DECISIONS.md`
3. この`RUNBOOK.md`
4. open Issue
5. open PR
6. latest GitHub Actions

巨大HTML、過去チャット全文、リポジトリ全履歴は原則として最初から読まない。
目標は新しいセッションでも約5分以内に現在状態を理解すること。

## 2. 開発サイクル

1. GPT/PMがIssueを作成し、Goal / Acceptance Criteria / Risk / Out-of-scopeを定義
2. 必要な場合だけGemini Issue Analyzerを起動
3. Geminiは`OBSERVED / EVIDENCE / HYPOTHESIS / CONFIDENCE / NEXT / RISK`形式でIssueへ記録
4. Claude Code / Jules / Human implementerが1 Issue = 1 Branchで実装
5. 必須ローカル検証
6. PR作成
7. GitHub Actions
8. Copilot / Human review
9. CI PASSかつ重大指摘なしならRiskに応じてマージ
10. Issueを完了し、次Issueへ進む

同じ原因で3回失敗したら3-strikeでBLOCKEDへ移行する。

## 3. Node.jsセットアップ

```bash
npm ci
```

依存関係は`package-lock.json`を正とする。

## 4. PWA / 時刻表データ検証

```bash
npm run validate
node --check js/timetable-loader.js
node --check js/data.js
node --check js/app.js
npm run test:smoke
```

直接validatorを実行する場合:

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
- 初期状態の号数/方面未選択
- 早く来る順の約5件
- 号数/方面フィルタ
- 主表示の秒カウント
- 24時超え便
- Service Worker / offline

## 5. collector unit tests

collector変更では必ず:

```bash
python3 -m unittest discover -s collector/tests -t .
```

GitHub Actionsは`.github/workflows/test-collector.yml`の`Test collector`を正とする。
2026-09-03時点では76 tests PASSだが、将来増えるため固定件数を完了条件にせず、最新Actionsの全PASSを正とする。

ログに以下が出ることは安全ガードの正常動作:

```text
config.PERMISSION_GRANTED が False
```

## 6. ローカルWebサーバー

```bash
python3 -m http.server 8123
```

ブラウザ:

```text
http://localhost:8123/
```

PWA / Service Worker確認時はキャッシュとcontroller更新に注意する。

## 7. Service Worker更新

PWA配信物を変更して旧キャッシュが問題になる場合だけ`sw.js`の`CACHE_VERSION`を上げる。
現在の基準は`v29`。

文書のみ、collectorのみ、CIのみの変更では無意味に上げない。

## 8. 時刻表データ変更時

必ず以下を確認する。

- routeIdが`data/routes.json`に存在
- direction / destinationが非空で正しい
- weekday / saturday / holidayが配列
- 運休は`[]`
- 時刻は昇順・重複なし
- 架空時刻を作っていない
- 近似ならmetadataへ根拠を記録
- extra補正なら上書き理由をmetadataへ記録
- coverageと結合後件数が一致

## 9. collector / 外部Web調査の安全状態

`collector/config.py`:

```text
PERMISSION_GRANTED = False
```

この状態では実ネットワークcollectorを開始しない。
AIが独断で`True`へ変更しない。

### 許可される作業

- 公開URLを通常ブラウザ/検索で人手確認
- 公開ページの最小構造解析
- GitHubに記録済み証拠のGemini解析
- 合成HTML fixtureでParserテスト
- 保存HTMLをcaller-provided mappingとして渡すオフラインE2E
- URL文字列のquery parameterを純粋関数で解析

### 禁止/別承認が必要

- 非公開内部API探索
- 認証/技術的保護回避
- 実ネットワークcollector有効化
- 全992停留所の自動巡回
- 大量取得
- 第三者HTML全文の公開GitHub保存

実ネットワーク有効化は`risk:high`の別Issue + 人間明示承認が必要。

## 10. Bus-Vision collectorの現在のパイプライン

ページ役割を混同しない。

### A. `diagram.html` — 停留所時刻表・便列挙

OBSERVED済みquery key:

```text
stopCd
poleCd
strLineList
lang
```

純粋URL解析:

```python
extract_stop_timetable_identifiers(url)
```

保存HTML Parser:

```python
parse_stop_timetable(...)
```

出力は発車時刻 + 便詳細URL候補。最終`DepartureRecord`ではない。
相対リンクはsource URL基準で絶対化し、異なるoriginは拒否する。

### B. `diagramDetail.html` — 1便詳細

OBSERVED済みquery key:

```text
corpCd
dateDivCd
diaCd
lang
lineCd
opeYmd
revYmd
routeCd
timetableDateDivCd
updownCd
```

純粋URL解析:

```python
extract_diagram_detail_identifiers(url)
```

保存HTML Parser:

```python
parse_trip_detail(...)
```

1便が通る複数停留所の`DepartureRecord[]`を返す。
Production DOM selectorは未確認のため既定値を置かない。

### C. オフラインE2E

```text
saved diagram.html
  ↓ parse_stop_timetable()
detail URL candidates
  ↓ caller-provided saved detail HTML mapping
saved diagramDetail.html
  ↓ parse_trip_detail()
records
  ↓ target stop exactly once + time一致検証
target stop DepartureRecord[]
```

Pipelineはネットワークfetchをしない。
以下はfail closed:

- detail HTML mapping欠落
- target stopが0件/複数件
- stop timetable発車時刻とdetail target stop時刻の不一致
- `dateDivCd`欠落をweekday等へ勝手に推測

## 11. Gemini Issue Analyzer

`.github/workflows/gemini-analyze.yml`がIssue解析を担当する。

通常トリガー:

```text
agent:gemini
+
status:doing を新しく付与
```

Issue作成だけでは起動しない。
再実行は一度`status:doing`を外してから再付与する。

代替:

```text
Actions → Gemini Heavy Analyzer → Run workflow → issue_number
```

Secret:

```text
GEMINI_API_KEY
```

Secret値をIssue/PR/チャット/ファイルへ貼らない。

### Issue Analyzerの原則

- まず`AGENTS.md / DECISIONS.md / RUNBOOK.md / Issue本文・コメント`を読む。
- 外部URLへアクセスしない設定のIssueでは、記録済み証拠だけで分析する。
- 未確認URL/selector/calendar codeを創作しない。
- 必須見出し不足なら結果を採用しない。

## 12. Gemini CI Failure Analyzer

`.github/workflows/gemini-ci-failure.yml`が`Validate bus data`のtrusted internal PR failureを解析する。

### 現在の正式フロー

```text
Validate bus data failure
  ↓
failed logs取得
  ↓ sanitize
Gemini read-only analysis
  ↓
required heading + secret-like pattern validation
  ↓
Actions Artifact
  ↓
PM retrieval
```

**PRコメント投稿はしない。**
GraphQL/REST comment方式はGitHub integration境界で403となり、3-strikeで廃止済み。

Workflow権限:

```text
actions: read
contents: read
```

Artifact名:

```text
gemini-ci-analysis-pr-<PR_NUMBER>-<HEAD_SHA>
```

内容:

```text
analysis.md
metadata.json
```

retentionはworkflow定義を正とする（導入時14日）。
同一PR/SHAのArtifactが存在すれば重複解析を抑止する。

### PMのArtifact回収手順

1. 最新`Gemini CI Failure Analyzer` runを確認
2. runのArtifacts一覧を取得
3. 対象PR/SHA名のArtifactを取得
4. `analysis.md`を読む
5. `metadata.json`でPR / source workflow run / head SHA / analyzer runを照合
6. Geminiの`OBSERVED`と`EVIDENCE`を根拠に次Issue/修正へ進む

Artifactの解析結果は提案であり、自動fix/自動mergeではない。

## 13. PR作成前チェック

PWA/データ変更:

```bash
npm run validate
node --check js/timetable-loader.js
node --check js/data.js
node --check js/app.js
npm run test:smoke
```

collector変更:

```bash
python3 -m unittest discover -s collector/tests -t .
```

PR本文には最低限:
- Related Issue
- Summary
- Changed behavior / files
- Tests run and results
- Risk
- UI変更なら確認内容

## 14. CI失敗時

1. 失敗stepを特定
2. Gemini CI Artifactが生成されていれば回収
3. OBSERVED/EVIDENCEを確認
4. 原因を1つに絞る
5. 最小修正
6. 同じ必須テストを再実行
7. 同じ原因で3回失敗したらBLOCKED

BLOCKED例:

```text
Issue #XX
BLOCKED
原因
3 retries exhausted
次に必要な判断
```

## 15. 復旧・引き継ぎ

新しいチャット/別AIでは過去会話復元を前提にしない。

1. `AGENTS.md`
2. `DECISIONS.md`
3. `RUNBOOK.md`
4. open Issue
5. open PR
6. latest Actions

だけを起点に再開する。

GitHubが長期記憶、LLMチャットは交換可能な作業セッションとして扱う。
