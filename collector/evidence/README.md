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

## Unverified evidence intake

通常ブラウザなどで新しい公開 `diagram.html` URLを取得できた時は、Registryへ直接書く前に未検証proposalを作れます。

```bash
python3 -m collector.propose_stop_evidence \
  --url 'EXPLICIT_PUBLIC_DIAGRAM_URL' \
  --stop-name '停留所名' \
  --direction-note '画面で見えた方向・のりば' \
  --observed-at '2026-09-03' \
  --evidence-note 'URLバーと停留所名を同一公開画面で確認する前のメモ' \
  --output /tmp/stop-evidence-proposal.json
```

このCLIはHTTPS公式host/pathとURL queryの `stopCd / poleCd / strLineList / lang` だけを機械検証します。**停留所名や方向とURLが意味的に一致していることは証明しません。** 出力は必ず `proposalState: unverified` / `requiresHumanConfirmation: true` で、Verified Registryを変更しません。

既存Registryと同一URLまたは同一 `stopCd/poleCd/strLineList` identityはduplicateとして拒否します。proposal生成後、通常公開画面で停留所名・方向とURLを同時に確認し、その証拠をIssue/PRへ記録してからRegistryへ昇格します。

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

## Safe manifest scaffold

Verified Stop Registryから、実データを一切創作しない未完成manifest templateを生成できます。

```bash
python3 -m collector.scaffold_manifest \
  --url 'VERIFIED_DIAGRAM_URL' \
  --output /tmp/manifest.json
```

停留所名がRegistry内で一意なら `--stop-name` でも選択できます。同名の方向・のりばが複数登録されている場合は曖昧さを避けるため停止し、`--url`指定を要求します。

生成物は必ず `templateState: incomplete` です。以下は自動生成しません。

- 発車時刻
- dummy HTML
- `diagramDetail.html` の推測URL
- production DOM selector
- `fetchedAt` / `directionHint` の推測値

実際に保存・確認したEvidenceで `REQUIRED_*` を埋めた後、最後に `templateState` を `ready` へ変更します。`offline_dry_run` は `templateState` が存在して `ready` 以外なら、HTMLファイルを読む前にfail closedします。旧manifestの互換性維持のため、`templateState`自体が存在しない既存manifestは従来どおり検証されます。

既存の出力manifestはデフォルトで上書きしません。

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
