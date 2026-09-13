# HANDOFF — 2026-09-13 agreed MVP complete / implementation queue clear

このファイルは節目だけで更新する一時引き継ぎです。動的な正本は GitHub Issue / PR / Actions / Commit / Deploy です。
default branch 上の内容だけを復帰用途に使います。

## 現在のproduction状態

- 合意済みMVPは完成・公開・回帰確認済み。
- 初期MVPの最優先経路 **なんば ⇄ 鶴町四丁目** は、71号・87号について往復とも平日・土曜・休日のproduction時刻表を整備済み。
- 現在の時刻表coverage: **42系統×方面**。
- Issue #179 / #183 / PR #184: 鶴町二丁目80号・あべの橋方面のholiday 25便を公式Evidenceで確定し、3曜日verifiedでproduction反映済み。
- Issue #182 / PR #185: ハンバーガーメニューと「改善・お問い合わせ」をproduction反映済み。
  - 改善要望 / 不具合報告 / その他の3区分
  - 下書きlocalStorage保存、GitHub Issues送信、内容コピー、下書き削除
  - GPS / 現在地 / 選択中の停留所・系統は自動添付しない
- Issue #188 / PR #189: PWA manifestの古い「時刻表は準備中」説明を現行production状態へ修正済み。
- Issue #192 / PR #193: 現在地からの停留所距離表示と、早く来る順の直近1便の秒カウントをproduction反映済み。
  - GPS成功時は `現在地から NNm` を表示
  - 保存済み停留所があっても距離付き近隣リストへ切り替え、選択を維持
  - 直近1便は `あと X分YY秒` を1秒更新、2便目以降は分表示
- Issue #198 / PR #199: GPS自動選択時の準備中停留所UXを修正済み。
  - 準備中の停留所は近い順リストから削除しない
  - 自動選択だけ、次便を表示できる最寄り停留所を優先
  - 準備中停留所を手動選択した場合は従来どおり準備中表示
- 最終app production SHA: `c796ad18962247193b69b7ad81afeb10c79d9499`。
- PR #199 merge時点で、上記app production SHAのGitHub Pages buildが `built` であることを確認済み。
- live確認: home OK / manifest更新OK / 距離表示・秒カウントOK / 西船町は一覧保持 / 自動選択は鶴町一丁目 / 西船町手動選択で準備中表示 / 不要 `_noop` は404。
- Service Worker: **v42**。
- final regression: validator PASS / coverage audit **15/15 PASS** / smoke **35/35 PASS**。
- `collector/config.py PERMISSION_GRANTED=False` を維持。

## 現在のbus appキュー

- active `status:doing` のバスアプリ実装Issue: **なし**。
- open implementation PR: **なし**。
- Issue #155は非アプリの事業相談Issue。openでもバスアプリ自動キューには含めない。
- 追加の時刻表・機能は、既存Issueまたはユーザー要件なしに創作しない。

## 再開手順

1. `AGENTS.md` → `DECISIONS.md` → `RUNBOOK.md` → `docs/CONTINUOUS-AI-PROTOCOL.md` → `HANDOFF.md` の順で確認する。
2. GitHubのopen Issue / open PR / latest Actions / default branch head / Pages状態を棚卸しする。
3. 新しい合意済みバスアプリIssueがあれば、1 Issue = 1 Branchで着手する。
4. 新しい合意済み要件がなければ、新機能を推測で追加せずHuman Gateへ戻す。
5. 時刻表・stopCd / poleCd / strLineList等は公開Evidenceなしに推測しない。
6. `collector/config.py PERMISSION_GRANTED=False` を維持し、collector networkは許可がない限り実行しない。
7. Secrets / Credentials / IAM / Billing / force-push / 破壊的不可逆操作と既存risk:highはHuman Gateを維持する。
