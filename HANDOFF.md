# HANDOFF — 2026-09-12 #182/#185 complete / app implementation queue clear

このファイルは節目だけで更新する一時引き継ぎです。動的な正本は GitHub Issue / PR / Actions / Commit / Deploy です。
default branch 上の内容だけを復帰用途に使います。

## 完了した節目

- 初期MVPの最優先経路 **なんば ⇄ 鶴町四丁目** は、71号・87号について往復とも平日・土曜・休日のproduction時刻表を整備済み。
- 現在の時刻表coverage: **42系統×方面**。
- Issue #179: 鶴町二丁目80号・あべの橋方面の公式Bus-Vision Evidenceを確定済み。
  - `stopCd=810` / `poleCd=60` / `strLineList=80-1-1`
  - holiday 25便、`06:07`〜`21:27`、2026-09-13(日) `dateDivCd=12`
- Issue #183 / PR #184: 上記holiday完全時刻表をproductionへ反映し、weekday / saturday / holidayの3曜日verified化済み。
- PR #184 merge SHA: `6a1b5aacd9877d0930c648c587a3cb76a6795080`。
- Issue #182 / PR #185: ハンバーガーメニューと「改善・お問い合わせ」画面をproductionへ追加済み。
  - 改善要望 / 不具合報告 / その他の3区分
  - 下書きlocalStorage保存、GitHub Issues送信、内容コピー、下書き削除
  - GPS / 現在地 / 選択中の停留所・系統は自動添付しない
- PR #185 merge SHA: `6e8f2d7df17ea6e1f7873c06cce1e347c8e0174f`。
- GitHub PagesでPR #185のmerge SHAをbuild済み。live menu / feedback page / Service Worker **v40** を確認済み。
- Issue #167 / PR #170: 継続実行プロトコルをproject-local化済み。正本は `docs/CONTINUOUS-AI-PROTOCOL.md`。
- `collector/config.py PERMISSION_GRANTED=False` を維持。

## 現在のbus appキュー

- active `status:doing` のバスアプリ実装Issue: **なし**。
- open implementation PR: **なし**。
- Issue #186はこのHANDOFF同期専用。merge後にcloseして完了する。
- Issue #155は非アプリの事業相談Issue。openでもバスアプリ自動キューには含めない。
- 追加の時刻表・機能は、既存Issueまたはユーザー要件なしに創作しない。

## 再開手順

1. `AGENTS.md` → `DECISIONS.md` → `RUNBOOK.md` → `docs/CONTINUOUS-AI-PROTOCOL.md` → `HANDOFF.md` の順で確認する。
2. GitHubのopen Issue / open PR / latest Actions / default branch head / Pages状態を棚卸しする。
3. バスアプリの新しい合意済みIssueがあれば、1 Issue = 1 Branchで着手する。
4. 新しい合意済み要件がなければ、機能を勝手に増やさずHuman Gateへ戻す。
5. 時刻表・stopCd / poleCd / strLineList等は公開Evidenceなしに推測しない。
6. `collector/config.py PERMISSION_GRANTED=False` を維持し、collector networkは許可がない限り実行しない。
7. Secrets / Credentials / IAM / Billing / force-push / 破壊的不可逆操作と既存risk:highはHuman Gateを維持する。
