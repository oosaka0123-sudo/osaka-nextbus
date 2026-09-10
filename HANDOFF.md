# HANDOFF — 2026-09-10 milestone

このファイルは節目だけで更新する一時引き継ぎです。動的な正本は GitHub Issue / PR / Actions / Commit / Deploy です。
このスナップショットは Issue #171 で作成し、default branch 上の内容だけを復帰用途に使います。

## 完了した節目

- Issue #166 / PR #169: 昌運橋71号をproductionへ追加済み。
- #166 merge SHA: `750c5a8c84d634337dd2a4915272370fca93c153`。
- 昌運橋71号は両方向×平日・土曜・休日をproduction JSONと実UIで確認済み。
- 現在の時刻表coverage: **40系統×方面**。
- Service Worker: **v37**。
- Issue #167 / PR #170: 3-AI継続実行プロトコルをproject-local化済み。
- #167 merge SHA: `b6f2da8ba643b820c34e8dfa55dfde8791c4af80`。
- 継続運用の正本: `docs/CONTINUOUS-AI-PROTOCOL.md`。
- `ai-master` には新しい継続運用ファイルを置かない。

## 現在のbus appキュー

- active `status:doing` のバスアプリIssue: なし。
- open PR: なし（このHANDOFF更新PRがdefaultへ入った後の状態）。
- Issue #155 は非アプリの事業相談Issue。openのまま保持するが、バスアプリの自動キューとして実行しない。
- 次のバスアプリ要件が未定義なら推測で新機能を作らない。ユーザー確定要件が来たら重複確認後に最小Issue化する。

## 再開手順

1. `AGENTS.md` → `DECISIONS.md` → `RUNBOOK.md` → `docs/CONTINUOUS-AI-PROTOCOL.md` → `HANDOFF.md`。
2. open `status:doing` Issue、open PR、latest Actions、default branch head を確認する。
3. 複数候補があれば最も進んだvalid taskを優先し、1 Task = 1 Active Ownerを守る。
4. Gemini / Claude / Jules / reviewerが利用不能でも、protocolのfallbackへ切り替えて安全な作業を止めない。
5. Secrets / Credentials / IAM / Billing / force-push / 破壊的不可逆操作と既存risk:highはHuman Gateを維持する。
