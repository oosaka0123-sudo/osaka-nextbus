# CONTINUOUS-AI-PROTOCOL.md — 常時稼働AI運用時の継続性プロトコル

この文書は `osaka-nextbus` リポジトリ内でのみ有効です。
`ai-master` や他リポジトリへは複製しません。他リポジトリで同様の運用が必要な場合は、この文書を出発点にして個別に作成してください。

`AGENTS.md` が定義する役割・Issue/Branch/PRプロトコル・3-strike ruleを前提とし、
「常時稼働（Continuous AI）」運用中に発生しうる継続性の欠落——再起動、エージェント障害、レビュー担当不足、担当タスク不在——への対処だけを追加定義します。
`AGENTS.md` / `DECISIONS.md` / `RUNBOOK.md` / `HANDOFF.md` と矛盾する場合はそれらを優先し、本文書側を修正します。

## 1. 基本原則: 1 Task = 1 Active Owner

- 各Issue（Task）には、その時点で作業中のOwnerが常に0または1体だけ存在します。
- Ownerは`status:doing`ラベルとIssueコメントで明示します。
- 同一Issueに複数エージェントが同時に`status:doing`で着手しません。
- Ownerを引き継ぐ場合は、旧Ownerの状態（進捗・失敗理由・次の判断）をIssueへ残してから`status:doing`を再割当てします。
- GitHub（Issue/PR/Actions/Commit）が唯一の正本です。チャット履歴上の口頭引き継ぎだけでOwnerを移譲しません。

## 2. CI is an absolute gate

- GitHub Actions（`Validate bus data` / `Test collector` 等、対象範囲に応じた必須ワークフロー）がPASSしない限り、どのエージェントもマージ・完了報告をしません。
- CI失敗を「軽微だから」「時間がないから」という理由で無視しません。
- CIが未実行・結果不明の状態を「実質PASS」とみなしません。
- この原則は`AGENTS.md`の禁止コマンド/破壊操作節、および「CI失敗状態での完了扱いにしない」と同一です。本文書はこれを継続運用の文脈で再確認するものです。

## 3. 人間承認が必須の範囲

以下に該当する変更・操作は、担当がGPT/Gemini/Claude/Julesいずれであっても、人間の明示承認なしに実行しません。

- Secrets / Credentials（APIキー、トークン、パスワード等）の作成・変更・閲覧・出力
- IAM / 権限設定（アクセス権、リポジトリ権限、ワークフロー権限の追加変更）
- Billing（課金設定、支払い方法、契約プラン）
- `git push --force`
- その他の破壊的かつ不可逆な操作（大量削除、DB破壊的変更、本番への直接上書き等）

上記以外の通常のコード変更・PR作成・レビュー対応は、`AGENTS.md`のRisk分類（`risk:low` / `risk:medium` / `risk:high`）に従って進めます。`risk:high`は引き続き人間の明示承認が必要です。本節はその中でも特に見落としやすい「常時稼働中に自動化されがちな」操作を明示的に列挙するものです。

## 4. 継続性が途切れる4ケースへの対処

### 4.1 再起動（restart）

セッション・プロセス・ホスト環境が再起動した場合。

1. 過去チャットの記憶を前提にしません。
2. `AGENTS.md` → `DECISIONS.md` → `RUNBOOK.md` → `HANDOFF.md`（存在する場合）→ open `status:doing` Issue → open PR → latest Actions → default branch head の順に確認します。
3. 複数の復旧候補がある場合は、PR/CI/commitが最も進んでいるvalid taskを優先し、進行中IssueのActive Ownerを確認してから引き継ぎます。
4. 直前の状態が不明な場合は推測で実装せず、IssueへOBSERVEDな現在地だけを記録してから次の安全な処理へ進みます。

### 4.2 エージェント障害（agent failure）

担当エージェントが応答不能・実行不能になった場合。

- **Gemini（Heavy Analyzer / CI Failure Analyzer）が利用不能な場合**: 解析を省略して先へ進めます。ただし省略した理由（利用不能の内容、確認日時）をIssueへ必ず記録します。Geminiの解析はあれば有用ですが、パイプラインを止める必須依存にはしません。
- **Claude CodeまたはJules（Implementer）が利用不能な場合**: 同じIssueを別のImplementer（もう一方のAI、またはPM/人間）へフォールバックします。Owner不在のままIssueを放置しません。フォールバック先はIssueへ明記します。
- いずれの場合も、障害発生と復旧/代替の判断はIssueコメントに残し、チャットのみに留めません。

### 4.3 レビュー担当不足（reviewer quota）

レビュー担当が不足・利用不能な場合でも、レビュー自体は省略しません。

- レビューは次の順で必ず実施します: **Copilot → 別のAI → PM/人間**。
- Copilotが利用不能な場合は、実装に使ったAIとは別のAI（例: Claude実装ならGemini/GPT側でのレビュー）を充てます。
- 別AIも利用不能な場合は、PMまたは人間がレビューを行います。
- 「レビュー担当がいないためレビューなしでマージする」という扱いはしません。

### 4.4 担当タスク不在（no active task）

`status:doing`が0件になった場合、PMは停止せず次の安全なTaskを確定します。

1. open PR、`status:ready`、ラベル未整理のopen Issue、`status:blocked`の解除可否を棚卸しします。
2. 安全な未完了IssueがあればActive Ownerを1つだけ割り当て、`status:doing`へ進めます。
3. open Issueが実質空なら、既存Issue・PR・HANDOFF・ユーザー確定要件を検索して重複を確認し、未完了要件が存在する場合だけ次の最小Issueを作成します。
4. 未完了要件そのものが存在しない場合は新しい要求を創作せず、そこで初めてHuman Gateへ戻します。

`TASK_QUEUE.json`のような重複状態ファイルは作成せず、default branchへの直接変更もしません。

## 5. 3-strike ruleの継続運用での扱い

`AGENTS.md` 4章の3-strike ruleは、常時稼働運用でも変更なく適用します。

- 同一原因の「修正→テスト失敗」を3回繰り返したら停止し、Issueを`BLOCKED`として扱います。
- 再起動やエージェント交代を挟んでも、同一原因への再試行回数は通算でカウントします。「担当が変わったのでカウントをリセットする」という運用はしません。
- BLOCKED後は、次に必要な人間の判断が明確になるまで同じ修正を繰り返しません。

## 6. この文書の適用範囲

- 本文書は`osaka-nextbus`リポジトリのみを対象とします。
- `ai-master`や他プロジェクトへのコピー・同期は行いません。他プロジェクトで同種の運用が必要な場合は、この文書を参考に個別作成してください。
- `AGENTS.md` / `DECISIONS.md` / `HANDOFF.md`の内容は本文書からは変更しません。矛盾があれば本文書側を修正対象とします。
