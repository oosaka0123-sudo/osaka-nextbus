# HANDOFF — 2026-09-12 next phase / Issue #179 active

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

- active `status:doing` のバスアプリIssue: **#179**。
- #179: 鶴町二丁目80号・あべの橋方面のholiday完全時刻表Evidenceを公式Bus-Vision公開画面で確定する。
- weekday / saturday はverified production済み。holidayは10:39までの部分Evidence履歴のみで、productionは `[]` / `verifiedCalendars=["weekday","saturday"]` のfail-closedを維持。
- 公式50音検索画面までは通常ブラウザで確認済み。ただし現在のBrowser Connectorではクリック/入力操作がなく、鶴町二丁目のstopCd / poleCd / strLineListは未確定。履歴アクセス権限もOFF。
- **IDや時刻を推測しない。AI回答だけでproductionへ入れない。** 公式URLを発見できたら通常ブラウザで再確認し、holiday全便Evidence確定後に別implementation Issue/branchで反映する。
- Issue #180 はこのHANDOFF同期専用。PR merge後はcloseされ、次回再開対象は #179。
- Issue #155 は非アプリの事業相談Issue。openのまま保持するが、バスアプリの自動キューとして実行しない。

## 再開手順

1. `AGENTS.md` → `DECISIONS.md` → `RUNBOOK.md` → `docs/CONTINUOUS-AI-PROTOCOL.md` → `HANDOFF.md`。
2. Issue #179を開き、最新コメント・Evidence・open PR・latest Actions・default branch headを確認する。
3. 鶴町二丁目80号の公式Bus-Vision URL/識別子を、推測せず公開画面から確定する。
4. holiday全便Evidenceを確定するまではproductionデータを変更しない。
5. Evidence確定後だけ、別implementation Issue/branchでholiday配列・metadata・tests・必要ならSW versionを更新する。
6. Gemini / Claude / Jules / reviewerが利用不能でも、protocolのfallbackへ切り替えて安全な作業を止めない。
7. Secrets / Credentials / IAM / Billing / force-push / 破壊的不可逆操作と既存risk:highはHuman Gateを維持する。
