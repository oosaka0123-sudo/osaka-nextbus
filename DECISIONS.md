# DECISIONS.md — Architecture & Policy Decisions

このファイルには「なぜその設計にしたか」を短く記録します。
動的な進捗や現在状態はIssue / PR / Actionsを参照し、ここへ重複記録しません。

## ADR-001: GitHubをSingle Source of Truthにする

- **Status**: Accepted
- **Context**: 長期開発でチャットUIのコンテキスト枯渇・セッション断絶が発生し得る。AIごとの会話履歴を前提にすると引き継ぎ不能になる。
- **Decision**:
  - Issue = タスク・要件・Acceptance Criteria
  - PR = 実装・レビュー
  - Actions = テスト
  - Commit = コード
  - DECISIONS.md = 設計理由
  - RUNBOOK.md = 実行手順
  - `STATUS.md` / `TASK_QUEUE.json`等の手動重複状態ファイルは作らない。
- **Consequence**: 新しいAIや新しいチャットでもGitHubだけで再開できる状態を維持する必要がある。

## ADR-002: Multi-Agent AI Development OS v1

- **Status**: Accepted
- **Context**: 巨大HTML、長いログ、全コードをGPTへ毎回投入するとトークン消費が大きく、長期開発に向かない。
- **Decision**:
  - GPT = 軽量PM / Orchestrator
  - Gemini = Heavy Analyzer
  - Claude Code / Jules = Implementer
  - Copilot = PR review
  - GitHub Actions = deterministic test gate
  - 各AIは交換可能で、GitHubの記録だけを引き継ぎ基盤とする。
- **Consequence**: GPTは原則として巨大HTMLや全履歴を読まず、現在Issueと短い解析結果だけで判断する。

## ADR-003: GeminiはOBSERVEDとHYPOTHESISを分離する

- **Status**: Accepted
- **Context**: 外部データ仕様やGTFS公開状況など、一般論を特定事業者へ誤適用するとハルシネーションが連鎖する危険がある。
- **Decision**:
  - Gemini解析結果は`OBSERVED / EVIDENCE / HYPOTHESIS / CONFIDENCE / NEXT / RISK`形式でIssueへ記録する。
  - 未確認のURL、セレクタ、曜日コード、アクセス間隔等を事実として記録しない。
- **Consequence**: 実装担当は`OBSERVED`を根拠に実装し、`HYPOTHESIS`は検証対象として扱う。

## ADR-004: 大阪シティバスのGTFS/APIを前提にしない

- **Status**: Accepted
- **Context**: 大阪シティバスから、GTFS-JP / GTFS-RT / APIは一般開発者向けに公開していない旨の回答を受けている。
- **Decision**:
  - GTFSや一般公開APIの存在を前提に設計しない。
  - 必要なデータ連携は、公開HTML/PDF等の公式Web情報を対象に実現性を個別検証する。
- **Consequence**: AIが一般論から「公開GTFSがある」と推測しても採用しない。必ず一次情報で確認する。

## ADR-005: 外部Web収集は公開画面・低負荷・明示ガード付き

- **Status**: Accepted
- **Context**: 公式回答ではスクレイピング等について「常識の範囲で」と案内されている一方、公開情報の存在自体は再配布・大量自動取得の包括許諾を意味しない。
- **Decision**:
  - 非公開内部APIや保護回避は行わない。
  - 公開HTML/PDFのみを調査対象とする。
  - 実ネットワークcollectorは`collector/config.py`の明示ガードを通す。
  - 現時点では`PERMISSION_GRANTED = False`を維持し、有効化は別Issueでリスク評価・人間承認を行う。
  - 第三者HTML全文を公開GitHubへコミットしない。
- **Consequence**: Phase 1の調査・パーサーテストは合成または必要最小限のフィクスチャで行う。

## ADR-006: 1 Issue = 1 Agent = 1 Branch

- **Status**: Accepted
- **Context**: 複数AIが同一リポジトリを同時編集すると競合、重複実装、文脈混線が起きる。
- **Decision**:
  - Phase 1では原則として`status:doing`は1件のみ。
  - default branchへ直接コミットしない。
  - すべてPR経由で、CI PASSをマージ条件にする。
  - 同じ失敗を3回繰り返したらBLOCKEDへ移行する。
- **Consequence**: 並列性より再現性と安全性を優先する。

## ADR-007: AI開発OS導入時のみBootstrap例外を認める

- **Status**: Accepted
- **Context**: Issue起点ルールを導入する前には、そのルール自体を置くためのIssueプロトコルが存在しない。
- **Decision**: `chore/ai-dev-os-v1-bootstrap`ブランチでAGENTS.md / DECISIONS.md / RUNBOOK.mdを整備する1回だけIssueなしの初期化を認める。
- **Consequence**: Bootstrap PRマージ後はすべてIssue起点とする。GitHubではIssueとPRが同じ番号系列を共有するため、最初の通常Issue番号が1とは限らない。

## ADR-008: Gemini Heavy Analyzerは制御ラベルで起動する

- **Status**: Accepted
- **Context**: GeminiをIssue解析に使いたいが、Issue作成だけで無条件自動起動すると、意図しない実行・コスト・権限範囲が広がる。一方で毎回Actions画面から手動実行するとPMの自動運用が止まる。
- **Decision**:
  - Google公式`google-github-actions/run-gemini-cli`をGitHub Actionsから使用する。
  - 通常運用は、対象Issueに`agent:gemini`が存在する状態で`status:doing`ラベルが付与された時だけ起動する。
  - `workflow_dispatch`によるIssue番号指定も、復旧・手動再実行用の代替経路として残す。
  - Issueオープンだけでは自動起動しない。Geminiによるコード書き込み・自動マージもPhase 1では許可しない。
  - 認証はGitHub Actions Secret `GEMINI_API_KEY`のみを使い、値をコード・Issue・ログへ記録しない。
  - Issue解析Geminiの権限は解析用途に限定し、リポジトリcontentsはread、Issueへの検証済み結果コメントのみwriteを許可する。
  - Gemini出力は必須見出しを機械検査し、プロトコル不一致ならIssueへ流さない。
  - Action参照はリリースコミットSHAへ固定する。
- **Consequence**: Secret設定後はPMがIssueラベルを遷移させるだけでGemini解析を開始でき、チャットUIや人間のActions操作に依存しない。誤爆を抑えつつGoogle解析基盤を継続運用できる。

## ADR-009: CI失敗Gemini解析はread-only Artifact handoffにする

- **Status**: Accepted
- **Context**: `workflow_run`からPR conversationへGemini解析結果を書き込む方式は、GraphQL/RESTともGitHub integration境界でHTTP 403になった。同じ書き込み方式を3回試行したため3-strikeで打ち切った。一方、Gemini解析・構造検証・Secret-like pattern検査自体は正常動作した。
- **Decision**:
  - `.github/workflows/gemini-ci-failure.yml`は`actions: read` + `contents: read`のみを持つ。
  - 失敗CIログはサニタイズし、Geminiはread-onlyローカル解析だけを行う。
  - `OBSERVED / EVIDENCE / HYPOTHESIS / CONFIDENCE / NEXT / RISK`の必須見出しとSecret-like patternを機械検査する。
  - 合格結果をActions Artifact `gemini-ci-analysis-pr-<PR>-<HEAD_SHA>`として保存する。
  - Artifactには`analysis.md`と非機密の`metadata.json`だけを含め、PMがAPIから回収する。
  - 同じPR/SHAのArtifactが存在する場合は再解析を抑止する。
- **Consequence**: CI失敗解析GeminiはGitHubへのコメント・コード変更権限を持たず、トークン節約と自動診断を維持しながら権限面を最小化できる。PR #21の意図的失敗E2EでArtifact生成・API回収まで確認済み。

## ADR-010: Bus-Visionページ種別を分離してオフラインParserを組み立てる

- **Status**: Accepted
- **Context**: 初期prototypeは`diagramDetail.html`を停留所中心時刻表と仮定していたが、公開検索で確認できた実例ではページの意味が異なった。
- **Decision**:
  - `diagram.html` = 停留所/のりば単位の時刻表・便詳細リンク列挙ページ。
  - `diagramDetail.html` = 1便の系統/行先 + 複数停留所の通過/発車時刻ページ。
  - `stopCd / poleCd / strLineList / lang`は`diagram.html`側のOBSERVED済みquery keyとして扱う。
  - `corpCd / dateDivCd / diaCd / lang / lineCd / opeYmd / revYmd / routeCd / timetableDateDivCd / updownCd`は`diagramDetail.html`側のOBSERVED済みquery keyとして扱う。
  - Production DOM selectorは実構造未確認の間は既定値を置かない。
  - 現在のオフライン流れは `parse_stop_timetable()` → 保存済みdetail HTML lookup → `parse_trip_detail()` → target stop `DepartureRecord`。
  - 停留所ページと便詳細の時刻不一致、detail HTML欠落、target stop 0件/複数件はfail closedする。
  - `PERMISSION_GRANTED = False`を維持し、実ネットワーク収集を有効化しない。
- **Consequence**: 実ID/実HTMLを後から差し込める一方、未確認selectorやIDを推測して本番データへ混入させない。2026-09-03時点でcollector unit tests 76件PASS。

## ADR-011: Copilot Code Review Request Automation

- **Status**: Accepted
- **Context**: PRごとにPMが手動でCopilot reviewerを要求する操作があり、依頼漏れや非効率が生じていた。PR #91にてGitHub REST API経由の `copilot-pull-request-reviewer[bot]` 指定でCopilotレビュー自動開始が実証された。
- **Decision**:
  - `.github/workflows/copilot-review-request.yml` を新設し、PRが `opened`, `reopened`, `ready_for_review`, `synchronize` になった際にCopilot Code Reviewを自動要求する。
  - Draft PRは `ready_for_review` になるまで要求を抑止する。
  - レビュー要求前に `GET /repos/{owner}/{repo}/pulls/{number}/requested_reviewers` を確認し、すでに `copilot-pull-request-reviewer[bot]` が requested_reviewers に存在する場合は重複リクエストを行わない。
  - 権限は最小限（`contents: read`, `pull-requests: write`）とし、`contents: write` や外部Secretは使用しない。
  - レビュー指摘時の自動マージ（Auto-merge）は行わない。
- **Consequence**: 同一リポジトリ内の通常PRが作成・更新された際、手動操作なしで独立したCopilot PRレビューが自動開始される。
