# 開発・動作確認ルール

このリポジトリでは、コードを書くだけで終了しない。
**必ずClaude Codeのクラウド環境内で実際にアプリを起動し、動作確認してから commit/push する。**

## 必須確認(commit/push前に毎回実施)

- ローカルWebサーバーを起動する(`python3 -m http.server` 等)
- `index.html` を実際に表示する
- 初回起動(保存済み選択なし)の挙動を確認する
- 位置情報許可時・拒否時の両方を確認する(モック座標で許可/権限拒否の両方)
- 現在地から近い停留所が6件・距離順に表示されることを確認する
- 停留所変更・系統(#route-select)変更・方面(#direction-select)変更が正しく機能することを確認する
- 次の3便表示、「あと○分」表示を確認する
- 平日・土曜・休日でダイヤが異なるデータの場合、それぞれ正しい時刻が出ることを確認する
  (テスト時は `page.addInitScript` でブラウザの `Date` を固定して曜日を制御する)
- 深夜0時をまたぐ便("24:10"等の表記)が正しい実時刻で表示されることを確認する
- 終バス後(当日の全便終了後)に翌日以降のダイヤへ正しくロールオーバーすることを確認する
- 系統・方面が0件、または該当曜日区分の時刻表が未登録の場合に
  「時刻表データ準備中」と表示され、プルダウンが無効化されることを確認する
- 画面上部の最終更新日表示(`data/metadata.json` の `lastUpdated` 由来)を確認する
- JavaScriptエラーを確認する(pageerror / console.error が0件であること)
- Service Workerの登録(登録→activate)を確認する
- localStorageの記憶動作(選択保存・再読み込み後の復元)を確認する
- 旧Service Workerキャッシュが残らないこと(新バージョンのactivateで削除されること)を確認する
- スマホ幅(375〜390px程度)での表示崩れがないことを確認する
- 問題があれば自分で修正する
- 修正後は再テストする
- テストが通るまで「完成」と報告しない
- テスト完了後に commit/push する

GitHub Pagesへの反映前に、Claude Code内で正常動作を確認すること。
質問で作業を止めず、テスト → 修正 → 再テスト まで自律的に進める。

実GPSとスマホ実機特有の挙動(位置情報ダイアログ、ホーム画面追加、iOS Safari特有の
Service Worker挙動等)だけは、この環境では確認できないため、最終的にAndroid/iPhone
実機での確認が必要。

テスト用フィクスチャ(架空の停留所・系統・時刻表データ)は、本番の
`/home/user/osaka-nextbus` 配下の `data/*.json` を直接書き換えず、
アプリ一式を別ディレクトリにコピーした上でそのコピー側のデータだけを
差し替え、別ポートで起動したサーバーに対してテストすること
(本番データとテストデータを完全に分離するため)。

## 動作確認の実施方法

推奨: Node.js + Playwright(このリポジトリの Chromium は
`/opt/pw-browsers/chromium`、`args: ['--headless=new']` を指定すること。
指定しないと "Old Headless mode has been removed" で起動に失敗する)。

```bash
# 1. ローカルサーバー起動
cd osaka-nextbus
nohup python3 -m http.server 8123 >/tmp/http.log 2>&1 &

# 2. Playwrightで index.html を開き、以下を検証する
#    - geolocation をモック座標で contextに設定
#    - #stop-select / #direction-select の内容
#    - #eta-0,#time-0,#dest-0 / #time-1,#eta-1 / #time-2,#eta-2 の3便表示
#    - localStorage の保存内容(キー: osaka-nextbus:selection)
#    - navigator.serviceWorker.getRegistration() の active.state
#    - 旧キャッシュ(古いCACHE_VERSION)がactivate後に caches.keys() に残っていないこと
#    - page.on('pageerror'/'console') でエラーが出ていないこと
```

## データについて

- データは `/data` 以下の4ファイル(`metadata.json` / `stops.json` / `routes.json` /
  `timetable.json`)に分離されている。詳細は `data/README.md` を参照。
- 選択の流れは 停留所 → 系統番号(routes.json) → 方面・行先(timetable.json) →
  次のバス3便 の4段階。
- `metadata.json` の `dataSource` が `"demo"`(またはファイル欠落時)は常にデモデータで動作。
  `"demo"` 以外 かつ `stops.json` に1件以上あれば実データとして採用され、DEMOバッジが消える。
- 出典は合法的に利用可能な公開データ、または正当な手段で確認したデータのみ。
  大阪シティバス公式サイト・「い・ま・ど・こ？」のスクレイピングや非公開APIの利用は禁止。
- 系統・方面・時刻表データが無い場合、または該当曜日区分(平日/土曜/休日)の時刻が
  無い場合は、架空の時刻・行き先を表示せず「時刻表データ準備中」と表示する
  (`getNextDepartures` が空配列を返す場合は必ずこの表示にする)。
- 平日/土曜/休日の判定(`JapaneseCalendar`、`js/data.js`内)は内閣府の祝日基準
  (振替休日・国民の休日を含む)に基づく計算式で行っており、特定サイトからの
  祝日データ取得は行っていない。
- 将来 GTFS-JP / GTFS-RT が利用可能になった場合は、`BusDataSource.init()` 内のデータ取得処理を
  差し替えるだけで移行できる設計を維持すること(UI側 `js/app.js` は変更不要にする)。

## Service Worker のキャッシュ更新

`sw.js` の `index.html` / `js/*.js` / `css/*.css` 等の中身を変更した場合、
**必ず `CACHE_VERSION` の値も変更すること**。変更を忘れると、既にアプリを開いたことのある
端末でキャッシュが更新されず、古い画面が表示され続ける(過去に実際に発生した障害)。
