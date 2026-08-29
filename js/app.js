/**
 * アプリ本体 (UI 制御)
 * データ取得は必ず BusDataSource (data.js) 経由で行い、
 * ここには仮データや実データの詳細を直接書かない。
 *
 * 選択の流れ: 停留所 → 系統番号 → 方面・行先 → 次のバス3便・あと○分
 */
(() => {
  "use strict";

  const dataSource = BusDataSource;
  const STORAGE_KEY = "osaka-nextbus:selection";
  const REFRESH_MS = 15000;
  const NEARBY_DISPLAY_COUNT = 10; // 現在地取得後、近い順に表示する停留所件数(11件目以降は表示しない)

  const els = {
    demoBadge: document.getElementById("demo-badge"),
    lastUpdated: document.getElementById("last-updated"),
    nearbyLabel: document.getElementById("nearby-label"),
    stopSelect: document.getElementById("stop-select"),
    routeSelect: document.getElementById("route-select"),
    directionSelect: document.getElementById("direction-select"),
    statusMessage: document.getElementById("status-message"),
    locateBtn: document.getElementById("locate-btn"),
    nextBus: document.getElementById("next-bus"),
    upcoming: document.getElementById("upcoming"),
    pendingMessage: document.getElementById("pending-message"),
    eta0: document.getElementById("eta-0"),
    time0: document.getElementById("time-0"),
    dest0: document.getElementById("dest-0"),
    time1: document.getElementById("time-1"),
    eta1: document.getElementById("eta-1"),
    time2: document.getElementById("time-2"),
    eta2: document.getElementById("eta-2"),
  };

  let currentStops = [];
  let currentRoutes = [];
  let currentDirections = [];
  let selectedStopId = null;
  let selectedRouteId = null;
  let selectedDirectionId = null;
  let refreshTimer = null;

  // 位置情報が確定するまでの「暫定選択」(五十音順の先頭停留所)を
  // localStorageに保存してしまわないようにするフラグ。
  // これをtrueのまま保存すると、位置情報の解決前にアプリが再読み込み・再起動
  // された場合(古いService Workerの入れ替え時の自動リロード等)に、
  // 本来一時的なだけの暫定選択が「いつもの停留所」として永続化されてしまい、
  // 以後ずっと距離順ではなく全件五十音順のリストしか表示されなくなる
  // 不具合が実際に発生したため、明示的なユーザー操作またはGPS解決結果のみを
  // 保存対象とする。
  let suppressSave = false;

  function loadSavedSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.stopId && parsed.routeId && parsed.directionId) return parsed;
    } catch (e) {
      /* localStorage が使えない/壊れている場合は無視して初期状態を使う */
    }
    return null;
  }

  function saveSelection(stopId, routeId, directionId) {
    if (suppressSave) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ stopId, routeId, directionId }));
    } catch (e) {
      /* 保存できなくても致命的ではないので無視 */
    }
  }

  /**
   * 「近い順」ラベルは、現在地取得に成功して距離順に絞り込んだ一覧を
   * 表示している間だけ出す。全停留所一覧(初回の暫定表示・保存済み選択の
   * 復元・GPS拒否/失敗時)では表示しない。
   */
  function setNearbyLabelVisible(visible) {
    els.nearbyLabel.hidden = !visible;
  }

  function showStatus(message) {
    if (!message) {
      els.statusMessage.hidden = true;
      els.statusMessage.textContent = "";
      return;
    }
    els.statusMessage.hidden = false;
    els.statusMessage.textContent = message;
  }

  function formatTime(date) {
    return TokyoTime.formatHHMM(date);
  }

  function etaMinutes(date, now) {
    return Math.max(0, Math.round((date.getTime() - now.getTime()) / 60000));
  }

  /**
   * 距離情報が無いフラットな一覧(GPS未取得時や保存済み選択の復元時)は、
   * 停留所数が多いと探しにくいため、五十音順に並べ替えてから表示する。
   */
  function sortedByName(stops) {
    return [...stops].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }

  function makeStopOption(stop) {
    const opt = document.createElement("option");
    opt.value = stop.id;
    opt.textContent =
      typeof stop.distance === "number"
        ? `${stop.name} ${formatDistanceLabel(stop.distance)}`
        : stop.name;
    return opt;
  }

  /**
   * バス停プルダウンを構築する。距離情報(現在地取得済み)がある場合は
   * 「停留所名 距離m」の形式で表示する(呼び出し側で既に近い順・件数を絞り込み済み)。
   */
  function populateStopSelect(stops) {
    els.stopSelect.innerHTML = "";
    for (const stop of stops) {
      els.stopSelect.appendChild(makeStopOption(stop));
    }
  }

  function populateRouteSelect(routes) {
    els.routeSelect.innerHTML = "";
    for (const route of routes) {
      const opt = document.createElement("option");
      opt.value = route.id;
      opt.textContent = route.label;
      els.routeSelect.appendChild(opt);
    }
    // 系統が1件も無い(ダミーの「時刻表データ準備中」のみ)場合は、選択の余地がなく無効化する
    els.routeSelect.disabled = routes.length === 1 && routes[0].pending === true;
  }

  function populateDirectionSelect(directions) {
    els.directionSelect.innerHTML = "";
    for (const d of directions) {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.direction;
      els.directionSelect.appendChild(opt);
    }
    // 方面が1件も無い(ダミーの「時刻表データ準備中」のみ)場合は、選択の余地がなく無効化する
    els.directionSelect.disabled = directions.length === 1 && directions[0].pending === true;
  }

  function renderBoard() {
    const stop = dataSource.getStopById(selectedStopId);
    if (!stop) return;
    const direction = currentDirections.find((d) => d.id === selectedDirectionId);
    if (!direction) return;

    const now = new Date();
    const departures = dataSource.getNextDepartures(selectedDirectionId, now, 3);

    if (departures.length === 0) {
      // 時刻表データが無い(系統/方面が未整備、または該当曜日区分の時刻が未入力):
      // 架空の時刻は表示せず準備中メッセージのみ表示する
      els.nextBus.hidden = true;
      els.upcoming.hidden = true;
      els.pendingMessage.hidden = false;
      return;
    }
    els.nextBus.hidden = false;
    els.upcoming.hidden = false;
    els.pendingMessage.hidden = true;

    if (departures[0]) {
      els.eta0.textContent = etaMinutes(departures[0].time, now);
      els.time0.textContent = formatTime(departures[0].time);
      els.dest0.textContent = direction.destination;
    }
    if (departures[1]) {
      els.time1.textContent = formatTime(departures[1].time);
      els.eta1.textContent = `あと ${etaMinutes(departures[1].time, now)}分`;
    }
    if (departures[2]) {
      els.time2.textContent = formatTime(departures[2].time);
      els.eta2.textContent = `あと ${etaMinutes(departures[2].time, now)}分`;
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(renderBoard, REFRESH_MS);
  }

  function selectDirection(directionId) {
    selectedDirectionId = directionId;
    els.directionSelect.value = directionId;
    saveSelection(selectedStopId, selectedRouteId, selectedDirectionId);
    renderBoard();
  }

  function selectRoute(routeId, { keepDirection = false } = {}) {
    selectedRouteId = routeId;
    els.routeSelect.value = routeId;

    currentDirections = dataSource.getDirectionsForRoute(routeId);
    populateDirectionSelect(currentDirections);
    const savedDirectionValid =
      keepDirection && currentDirections.some((d) => d.id === selectedDirectionId);
    selectDirection(savedDirectionValid ? selectedDirectionId : currentDirections[0].id);
  }

  function selectStop(stopId, { keepRoute = false, keepDirection = false } = {}) {
    const stop = dataSource.getStopById(stopId);
    if (!stop) return;
    selectedStopId = stopId;
    els.stopSelect.value = stopId;

    currentRoutes = dataSource.getRoutesForStop(stopId);
    populateRouteSelect(currentRoutes);
    const savedRouteValid = keepRoute && currentRoutes.some((r) => r.id === selectedRouteId);
    const routeId = savedRouteValid ? selectedRouteId : currentRoutes[0].id;
    selectRoute(routeId, { keepDirection: savedRouteValid && keepDirection });
  }

  /**
   * 初回起動(保存済み停留所がない場合)は位置情報の許可を求め、最寄り停留所を自動表示する。
   * 2回目以降は localStorage に保存された「いつもの停留所・系統・方面」を優先する。
   * (「現在地から探す」ボタンを押した場合のみ、明示的に現在地基準へ切り替える)
   */
  function initFromSavedOrDefault() {
    const saved = loadSavedSelection();

    if (saved && dataSource.getStopById(saved.stopId)) {
      currentStops = sortedByName(dataSource.getStops());
      populateStopSelect(currentStops);
      setNearbyLabelVisible(false);
      selectedRouteId = saved.routeId;
      selectedDirectionId = saved.directionId;
      selectStop(saved.stopId, { keepRoute: true, keepDirection: true });
      return;
    }

    // 保存済みの選択がない = 初回起動。まず全件のデフォルト一覧(五十音順)を即座に
    // 表示しておき(位置情報の許可待ち・取得失敗時にも画面が空のまま止まって
    // 見えないようにするため)、位置情報が取得できた時点で近い順の一覧に差し替える。
    // この時点の選択はまだ「仮」なので localStorage には保存しない
    // (保存すると、位置情報解決前にアプリが再起動された場合に暫定選択が
    // 「いつもの停留所」として固定されてしまうため)。
    currentStops = sortedByName(dataSource.getStops());
    populateStopSelect(currentStops);
    setNearbyLabelVisible(false);
    suppressSave = true;
    selectStop(currentStops[0].id);
    suppressSave = false;
    locateAndSort();
  }

  let locating = false;

  function setLocatingUi(isLocating) {
    locating = isLocating;
    els.locateBtn.disabled = isLocating;
    els.locateBtn.textContent = isLocating ? "📍 現在地を取得中..." : "📍 現在地から探す";
  }

  function locateAndSort() {
    if (locating) return; // 二重タップで getCurrentPosition が重複実行されるのを防ぐ
    if (!("geolocation" in navigator)) {
      showStatus("この端末では現在地を利用できません。バス停は手動で選択してください");
      return;
    }
    setLocatingUi(true);
    showStatus("現在地を取得しています…GPSの電波が届く場所でお待ちください");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingUi(false);
        const position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        // Haversine式で全停留所との距離を計算し、近い順に10件だけを表示する(11件目以降は表示しない)
        currentStops = dataSource.getStopsSortedByDistance(position).slice(0, NEARBY_DISPLAY_COUNT);
        populateStopSelect(currentStops);
        setNearbyLabelVisible(true);
        selectStop(currentStops[0].id); // 最寄り停留所を自動選択。以降ユーザーは他の候補を自由に選べる
        showStatus(null);
      },
      (err) => {
        setLocatingUi(false);
        let message = "現在地を取得できませんでした。バス停は手動で選択してください";
        if (err.code === err.PERMISSION_DENIED) {
          message = "位置情報の利用が許可されていません。端末の設定を確認するか、バス停は手動で選択してください";
        } else if (err.code === err.TIMEOUT) {
          message = "現在地の取得に時間がかかっています。電波の良い場所でもう一度お試しください";
        }
        showStatus(message);
        // GPS拒否・失敗時は距離順に絞り込まず、全停留所から手動で選べるようにする
        // (既に選択済みの停留所があれば、その選択は維持したまま一覧だけ全件に戻す)。
        currentStops = sortedByName(dataSource.getStops());
        populateStopSelect(currentStops);
        setNearbyLabelVisible(false);
        if (selectedStopId) els.stopSelect.value = selectedStopId;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  els.stopSelect.addEventListener("change", (e) => selectStop(e.target.value));
  els.routeSelect.addEventListener("change", (e) => selectRoute(e.target.value));
  els.directionSelect.addEventListener("change", (e) => selectDirection(e.target.value));
  els.locateBtn.addEventListener("click", () => locateAndSort());

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") renderBoard();
  });

  dataSource
    .init()
    .catch(() => {
      /* 実データの読み込みに失敗してもデモデータで動作継続する */
    })
    .then(() => {
      // 実データ(data/*.json)に切り替わったら「DEMO」バッジを外す。
      // (系統・方面・時刻表が未整備の停留所は、別途「時刻表データ準備中」表示で伝える)
      els.demoBadge.hidden = dataSource.usingRealData === true;
      const metadata = dataSource.getMetadata();
      els.lastUpdated.textContent = `最終更新 ${formatDateLabel(metadata.lastUpdated)}`;
      initFromSavedOrDefault();
      scheduleRefresh();
    });

  if ("serviceWorker" in navigator) {
    // 初回インストール(このページを今まで制御していたSWがない)かどうかを先に記録しておく。
    // 初回インストール時は skipWaiting/clients.claim() によっても "controllerchange" が
    // 発火するが、その場合は何も更新すべきものがないため、リロードしてはいけない
    // (このガードがないと、初回訪問者が意図せず一度リロードされ、その拍子に
    //  ちょうど保存されたばかりの位置情報ベースの選択が「保存済み選択」経路に
    //  切り替わり、距離付きの一覧が失われるという不具合が実際に発生した)。
    const hadExistingController = !!navigator.serviceWorker.controller;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* SW登録に失敗してもアプリ自体は動作可能なため無視 */
      });
    });

    if (hadExistingController) {
      // 新しいバージョンの Service Worker が有効化されたら、
      // 開いたままのタブにも即座に最新のコードを反映するため1回だけ再読み込みする。
      let hasReloadedForNewWorker = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasReloadedForNewWorker) return;
        hasReloadedForNewWorker = true;
        window.location.reload();
      });
    }
  }
})();
