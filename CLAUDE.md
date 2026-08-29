# 開発・動作確認ルール

このリポジトリでは、コードを書くだけで終了しない。
**必ずClaude Codeのクラウド環境内で実際にアプリを起動し、動作確認してから commit/push する。**

## 必須確認(commit/push前に毎回実施)

- ローカルWebサーバーを起動する(`python3 -m http.server` 等)
- `index.html` を実際に表示する
- JavaScriptエラーを確認する(pageerror / console.error が0件であること)
- Service Workerの登録(登録→activate)を確認する
- 停留所プルダウンの表示を確認する
- 次の3便表示を確認する
- localStorageの記憶動作(選択保存・再読み込み後の復元)を確認する
- GPS部分はモック座標でテストする(実GPSはこの環境では使えないため)
- 旧Service Workerキャッシュが残らないこと(新バージョンのactivateで削除されること)を確認する
- 問題があれば自分で修正する
- 修正後は再テストする
- テスト完了後に commit/push する

GitHub Pagesへの反映前に、Claude Code内で正常動作を確認すること。
質問で作業を止めず、テスト → 修正 → 再テスト まで自律的に進める。

実GPSとスマホ実機特有の挙動(位置情報ダイアログ、ホーム画面追加、iOS Safari特有の
Service Worker挙動等)だけは、この環境では確認できないため、最終的にAndroid/iPhone
実機での確認が必要。

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

- 停留所名・緯度経度は `data/osaka-citybus-stops.json` に実データを置けば自動的に反映される
  (空/欠落時はデモ停留所にフォールバック)。詳細は `data/README.md` を参照。
- 出典は合法的に利用可能な公開データのみ(国土数値情報 等)。
  大阪シティバス公式サイト・「い・ま・ど・こ？」のスクレイピングや非公開APIの利用は禁止。
- 方面・時刻表は現時点ではすべてデモ。

## Service Worker のキャッシュ更新

`sw.js` の `index.html` / `js/*.js` / `css/*.css` 等の中身を変更した場合、
**必ず `CACHE_VERSION` の値も変更すること**。変更を忘れると、既にアプリを開いたことのある
端末でキャッシュが更新されず、古い画面が表示され続ける(過去に実際に発生した障害)。
