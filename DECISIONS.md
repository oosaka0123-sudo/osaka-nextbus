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
  - Geminiの権限は解析用途に限定し、リポジトリcontentsはread、Issueへの検証済み結果コメントのみwriteを許可する。
  - Gemini出力は必須見出しを機械検査し、プロトコル不一致ならIssueへ流さない。
  - Action参照はリリースコミットSHAへ固定する。
- **Consequence**: Secret設定後はPMがIssueラベルを遷移させるだけでGemini解析を開始でき、チャットUIや人間のActions操作に依存しない。誤爆を抑えつつGoogle解析基盤を継続運用できる。
