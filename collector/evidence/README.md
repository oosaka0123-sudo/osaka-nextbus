# Bus-Vision Verified Evidence Registry

このディレクトリはcollectorが扱う外部識別子を **verified evidence only** で保存する正本です。候補値やAI推測を置く場所ではありません。

## Stop timetable registry

`stop_timetables.json` は確認済み `diagram.html` 停留所時刻表URLだけを保持します。

- 登録できるのは通常の公開Bus-Vision画面または公開検索結果で停留所名とURLを実際に確認したものだけ。
- `stopCd / poleCd / strLineList / lang` はURLに存在する値をそのまま記録する。
- 隣接停留所の連番、第三者サイト、AI推測からIDを補完しない。
- 未確認候補はGitHub Issueの `HYPOTHESIS` に置き、このJSONへ入れない。
- `sourceUrl` は `https://oc.bus-vision.jp/osakacitybus/view/diagram.html` に限定する。
- `evidence_registry.py` が宣言値とURL queryを照合し、不一致・欠損・重複をfail closedする。

2026-09-03時点の初期登録は **鶴町三丁目・市内向き** 1件です。

```text
stopCd=811
poleCd=80
strLineList=71-1-1_87-1-1
```

公開停留所時刻表の07:35と、87号なんば行き便詳細の鶴町三丁目07:35が一致することを Issue #37 / PR #38 で回帰確認しています。

鶴町一丁目の `stopCd` は Issue #39 が解決するまで未確認です。隣接番号から考えられる値があってもRegistryへ登録してはいけません。

## Calendar code registry

`calendar_codes.json` は確認済み `diagramDetail.html` の `dateDivCd` とアプリ側calendar名の対応だけを保持します。

現在verified:

```text
11 -> weekday
13 -> saturday
```

根拠URLは `collector/tests/test_bus_vision_trip_detail.py` に公開検索由来の `WEEKDAY_URL` / `SATURDAY_URL` として既に回帰固定されているものと同一です。`calendar_evidence.py` が公式HTTPS host/pathとURL中の`dateDivCd`完全一致、calendar/code/source URLの重複を検証します。

**holiday codeは現在未登録です。** 未確認コード（例: 12）を「たぶん休日」と補完せず、CSV変換時もfail closedします。

## Registry追加手順

1. 公式Bus-Visionの通常公開画面または既にGitHub正本へ記録済みの明示Evidenceで値を確認する。
2. Issueへ `OBSERVED / EVIDENCE` を記録する。
3. 対応するRegistry JSONへ1 entry追加する。
4. URL queryと宣言値の一致・重複テストを通す。
5. `python3 -m unittest discover -s collector/tests -t .` を実行する。
6. `Test collector` がPASSしたPRだけマージする。

Registry登録はネットワーク収集許可を意味しません。`collector/config.py` の `PERMISSION_GRANTED = False` は別のrisk:high承認まで維持します。

## Offline dry-run

Registryの登録対象だけを確認する:

```bash
python3 -m collector.offline_dry_run --list-targets
```

保存済みHTML bundleを検証する:

```bash
python3 -m collector.offline_dry_run --manifest /path/to/manifest.json
```

validated recordsをVerified Calendar Evidenceだけでlong-format CSVへcompileする:

```bash
python3 -m collector.offline_dry_run \
  --manifest /path/to/manifest.json \
  --output-csv /tmp/timetable.csv
```

`offline_dry_run` 自身はHTTPアクセスを行いません。manifestには以下を明示します。

- Stop Registryに存在する正確な `sourceUrl`
- `targetStopName`
- timezone付き `fetchedAt`
- ローカル保存済み `diagram.html` のファイルパス
- 各 `diagramDetail.html` の実URLとローカルファイルパスのmapping
- `StopTimetableSelectorConfig` / `TripDetailSelectorConfig` に対応するDOM selector

selectorはproduction既定値を持たず、manifestで毎回明示します。Registry未登録URL、対象停留所名不一致、ローカルHTML欠損、時刻不一致、未登録`dateDivCd`、stop/route不一致はfail closedします。

`--output-csv`は成功したvalidated recordsだけを一時ファイルへ書き、全検証成功後にatomic replaceします。`data/timetable*.json` は更新しません。

このEvidence Registryは「候補データベース」ではなく、**確認済み公開情報の証拠台帳**です。
