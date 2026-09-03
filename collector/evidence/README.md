# Bus-Vision Verified Evidence Registry

`stop_timetables.json` は、collectorが将来対象停留所を段階的に増やすための **verified evidence only** の正本です。

## ルール

- 登録できるのは、通常の公開Bus-Vision画面または公開検索結果で停留所名とURLを実際に確認した `diagram.html` だけ。
- `stopCd / poleCd / strLineList / lang` はURLに存在する値をそのまま記録する。
- 隣接停留所の連番、第三者サイト、AI推測からIDを補完しない。
- 未確認候補はGitHub Issueの `HYPOTHESIS` に置き、このJSONへ入れない。
- `sourceUrl` は `https://oc.bus-vision.jp/osakacitybus/view/diagram.html` に限定する。
- `evidence_registry.py` が宣言値とURL queryを照合し、不一致・欠損・重複をfail closedする。
- Registryへの追加は `1 Issue = 1 Branch = 1 PR` とし、`Test collector` PASSを必須にする。
- Registry登録はネットワーク収集許可を意味しない。`collector/config.py` の `PERMISSION_GRANTED = False` は別のrisk:high承認まで維持する。

## 現在のverified entry

2026-09-03時点の初期登録は **鶴町三丁目・市内向き** 1件のみです。

```text
stopCd=811
poleCd=80
strLineList=71-1-1_87-1-1
```

公開停留所時刻表の07:35と、87号なんば行き便詳細の鶴町三丁目07:35が一致することを Issue #37 / PR #38 で回帰確認しています。

## 未確認の例

鶴町一丁目の `stopCd` は Issue #39 が解決するまで未確認です。隣接番号から考えられる値があってもRegistryへ登録してはいけません。

## 追加手順

1. 公式Bus-Visionの通常公開画面で対象停留所の時刻表を開く。
2. URLと停留所名・方向/のりばを同時に確認する。
3. Issueへ `OBSERVED / EVIDENCE` を記録する。
4. `stop_timetables.json` に1 entry追加する。
5. URL queryと宣言IDの一致テスト、重複テストを通す。
6. `python3 -m unittest discover -s collector/tests -t .` を実行する。
7. `Test collector` がPASSしたPRだけマージする。

## Offline dry-run

Registryの登録対象だけを確認する:

```bash
python3 -m collector.offline_dry_run --list-targets
```

保存済みHTML bundleを検証する:

```bash
python3 -m collector.offline_dry_run --manifest /path/to/manifest.json
```

`offline_dry_run` 自身はHTTPアクセスを行わない。manifestには以下を明示する。

- Registryに存在する正確な `sourceUrl`
- `targetStopName`
- timezone付き `fetchedAt`
- ローカル保存済み `diagram.html` のファイルパス
- 各 `diagramDetail.html` の実URLとローカルファイルパスのmapping
- `StopTimetableSelectorConfig` / `TripDetailSelectorConfig` に対応するDOM selector

selectorはproduction既定値を持たず、manifestで毎回明示する。Registry未登録URL、対象停留所名不一致、ローカルHTML欠損、時刻不一致などはfail closedする。成功時は `DepartureRecord.as_dict()` 相当のJSONを標準出力するだけで、`data/timetable*.json` は更新しない。

このRegistryは「候補データベース」ではなく、**確認済み公開URLの証拠台帳**です。
