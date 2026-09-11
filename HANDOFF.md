# HANDOFF — 2026-09-12 initial MVP complete milestone

このファイルは節目だけで更新する一時引き継ぎです。動的な正本は GitHub Issue / PR / Actions / Commit / Deploy です。
default branch 上の内容だけを復帰用途に使います。

## 完了した節目

- 初期MVPの最優先経路 **なんば ⇄ 鶴町四丁目** は、71号・87号について往復とも平日・土曜・休日のproduction時刻表を整備済み。
- Issue #175 / PR #176: 鶴町四丁目発71号・87号（なんば方面）を公式Bus-Vision Evidenceで追加済み。
- #176 merge SHA: `4629b7f1f42d24e279706a494224dd79cb4824ab`。
- #175はブラウザ再確認で6配列の件数・先頭/末尾・全時刻列をproductionと一致確認し、merge後CI・Pages deployまで成功確認済み。
- 現在の時刻表coverage: **42系統×方面**。
- Service Worker: **v38**。
- Issue #166 / PR #169: 昌運橋71号を両方向×3曜日でproduction化済み。
- Issue #167 / PR #170: 3-AI継続実行プロトコルをproject-local化済み。
- 継続運用の正本: `docs/CONTINUOUS-AI-PROTOCOL.md`。
- `ai-master` には新しい継続運用ファイルを置かない。

## 初期MVP完成判定

- Decision #81の初期方針は「大阪市バス全体を一気に完成」ではなく、ユーザー実利用の **なんば ⇄ 鶴町四丁目** を最優先に正確に完成させること。
- なんば側でRepository Evidence上この直通用途が確定している71号・87号は、往復とも3曜日verifiedとなったため、初期直通MVPは完成扱い。
- coverage reportに残る未収録系統は段階拡張対象であり、推測値で埋めない。

## 現在のbus appキュー

- active `status:doing` のバスアプリIssue: なし（このHANDOFF更新PRがdefaultへ入った後の状態）。
- open PR: なし（このHANDOFF更新PRがdefaultへ入った後の状態）。
- Issue #155 は非アプリの事業相談Issue。openのまま保持するが、バスアプリの自動キューとして実行しない。
- 次のバスアプリ要件が未定義なら推測で新機能を作らない。ユーザー確定要件が来たら重複確認後に最小Issue化する。

## 再開手順

1. `AGENTS.md` → `DECISIONS.md` → `RUNBOOK.md` → `docs/CONTINUOUS-AI-PROTOCOL.md` → `HANDOFF.md`。
2. open `status:doing` Issue、open PR、latest Actions、default branch head を確認する。
3. 複数候補があれば最も進んだvalid taskを優先し、1 Task = 1 Active Ownerを守る。
4. Gemini / Claude / Jules / reviewerが利用不能でも、protocolのfallbackへ切り替えて安全な作業を止めない。
5. Secrets / Credentials / IAM / Billing / force-push / 破壊的不可逆操作と既存risk:highはHuman Gateを維持する。
