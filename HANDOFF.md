# HANDOFF — 2026-09-10

このファイルは次セッションが安全に即再開するための一時引き継ぎです。GitHub Issue / PR / Actions がSSOTで、ここには復帰に必要な現在状態だけを残します。

## 現在の優先順位

1. Issue #166 `昌運橋71号の公式3カレンダー時刻表をproductionへ追加`
2. Issue #167 `3-AI継続実行プロトコルをproject-localで実装`

## #166 昌運橋71号 — CURRENT

OBSERVED:
- app routeId: `昌運橋-b5ace8__71号`
- Bus-Vision: `stopCd=808`
- なんば方面: `poleCd=60`, `strLineList=71-1-1`
- 鶴町四丁目方面: `poleCd=70`; `selectDiagramLine` は複数系統共通ページだが `lineCd=71` の便リンクを確認済み
- production timetable は未収録

公式6カレンダー抽出済み:
- なんば方面 weekday 119便: first `05:19,05:35,05:50,06:03,06:12`; last `22:15,22:31,22:46,23:02,23:23`
- なんば方面 saturday 142便: first `05:30,05:42,05:52,06:02,06:15`; last `22:36,22:46,22:56,23:04,23:13`
- なんば方面 holiday 133便: first `05:38,05:58,06:17,06:30,06:44`; last `22:04,22:20,22:37,22:53,23:13`
- 鶴町四丁目方面 weekday 125便: first `06:28,06:44,06:59,07:12,07:23`; last `23:45,23:56,24:07,24:18,24:32`
- 鶴町四丁目方面 saturday 143便: first `06:38,07:02,07:24,07:43,07:58`; last `23:48,23:58,24:08,24:18,24:29`
- 鶴町四丁目方面 holiday 136便: first `06:46,07:06,07:25,07:40,07:56`; last `23:26,23:36,23:51,24:06,24:21`

NEXT:
- 上記6セットの全時刻配列を実装用branchへ入れる
- evidence registry / metadata / README coverage を既存パターンに合わせて更新
- 必須検証: `npm run validate`, JS syntax 3本, collector tests, Chromium smoke
- `collector/config.py PERMISSION_GRANTED=False` を維持
- PR → CI → review → squash merge → Pages → production JSON + UI両方向確認

## #167 3-AI継続運用 — CURRENT

User requirement:
- マスターリポジトリには書かない
- `osaka-nextbus` 内だけで管理する
- 終わるまで止めず、agent失敗時は別経路へ切り替える

OBSERVED:
- `ai-master/docs/CONTINUOUS-AI-PROTOCOL.md` は一度作成したがユーザー指示により削除済み。今後Masterへ追加しない。
- Gemini Heavy Analyzerは実行したが HTTP 429 `RESOURCE_EXHAUSTED` / prepayment credits depleted で分析結果なし。課金変更は要求せずblocker扱いしない。
- Claude Codeも #167 で起動直後にfailure。再開時はログ原因を一度確認し、同一失敗を反復しない。
- `osaka-nextbus` の既存 `RUNBOOK.md` には既に Issue→Gemini(必要時)→Claude/Jules/Human→CI→review→merge→次Issue の基本サイクルがある。

AGREED FALLBACK DESIGN:
- GPT = PM / orchestrator
- Gemini = 独立Analyzer。利用不能なら省略して次へ
- Claude Code or Jules = single implementer。利用不能ならPM/Human実装へ切替
- GitHub Actions = deterministic gate
- Copilot/Jules/PM = independent review fallback
- 1 Task = 1 Active Owner。競合branchを作らない
- terminal completion後は次の安全なIssueを即開始
- secrets / credentials / IAM / billing / force-push / destructive irreversible operations はHuman Gate

NEXT:
- #167本文の `ai-master/docs/CONTINUOUS-AI-PROTOCOL.md` 参照を削除しproject-local設計へ修正
- 必要なら `docs/CONTINUOUS-AI-PROTOCOL.md` を `osaka-nextbus` 内だけにPRで追加
- RUNBOOKは最小参照だけ追加し重複ドキュメント化しない

## 直近完成済み

- 大運橋通71号 #164 / PR #165: production完成
- merge head at handoff start: `a1fda718cccc67ed9e814c32567219eb8378e2a1`
- coverage: 38系統×方面
- Service Worker: v36

## 再開手順

1. `AGENTS.md`
2. `DECISIONS.md`
3. `RUNBOOK.md`
4. この `HANDOFF.md`
5. open `status:doing` Issues (#166/#167)
6. open PR
7. recent Actions

最優先は #166 を本番完了まで進める。#167のagent障害は #166 を止める理由にしない。
