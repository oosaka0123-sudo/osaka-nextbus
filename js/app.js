/**
 * アプリ本体 (UI 制御)
 * データ取得は必ず BusDataSource (data.js) 経由で行い、
 * ここには仮データや実データの詳細を直接書かない。
 */
(() => {
  "use strict";

  const dataSource = DemoBusDataSource;
  const STORAGE_KEY = "osaka-nextbus:selection";
  const REFRESH_MS = 15000;
  const NEARBY_DISPLAY_COUNT = 10; // 現在地取得後、近い順に表示する最大件数(最低10件を目安に)

  const els = {
    demoBadge: document.getElementById("demo-badge"),
    stopSelect: document.getElementById("stop-select"),
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
  let selectedStopId = null;
  let selectedDirectionId = null;
  let refreshTimer = null;

  function loadSavedSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.stopId && parsed.directionId) return parsed;
    } catch (e) {
      /* localStorage が使えない/壊れている場合は無視して初期状態を使う */
    }
    return null;
  }

  function saveSelection(stopId, directionId) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ stopId, directionId }));
    } catch (e) {
      /* 保存できなくても致命的ではないので無視 */
    }
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

  function populateDirectionSelect(stop) {
    els.directionSelect.innerHTML = "";
    for (const dir of stop.directions) {
      const opt = document.createElement("option");
      opt.value = dir.id;
      opt.textContent = dir.label;
      els.directionSelect.appendChild(opt);
    }
    // 実データ停留所は方面が「時刻表データ準備中」の1件だけなので、選択の余地がなく無効化する
    els.directionSelect.disabled = stop.directions.length === 1 && stop.directions[0].pending === true;
  }

  function renderBoard() {
    const stop = dataSource.getStopById(selectedStopId);
    if (!stop) return;
    const direction = dataSource.getDirection(selectedStopId, selectedDirectionId);
    if (!direction) return;

    if (direction.pending) {
      // 正式な時刻表データがまだ無い停留所: 架空の時刻は一切表示せず、準備中メッセージのみ表示する
      els.nextBus.hidden = true;
      els.upcoming.hidden = true;
      els.pendingMessage.hidden = false;
      return;
    }
    els.nextBus.hidden = false;
    els.upcoming.hidden = false;
    els.pendingMessage.hidden = true;

    const now = new Date();
    const departures = dataSource.getNextDepartures(selectedStopId, selectedDirectionId, now, 3);

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

  function selectStop(stopId, { keepDirection = false } = {}) {
    const stop = dataSource.getStopById(stopId);
    if (!stop) return;
    selectedStopId = stopId;
    els.stopSelect.value = stopId;

    populateDirectionSelect(stop);
    const savedDirectionValid =
      keepDirection && stop.directions.some((d) => d.id === selectedDirectionId);
    selectedDirectionId = savedDirectionValid ? selectedDirectionId : stop.directions[0].id;
    els.directionSelect.value = selectedDirectionId;

    saveSelection(selectedStopId, selectedDirectionId);
    renderBoard();
  }

  function selectDirection(directionId) {
    selectedDirectionId = directionId;
    saveSelection(selectedStopId, selectedDirectionId);
    renderBoard();
  }

  /**
   * 初回起動(保存済み停留所がない場合)は位置情報の許可を求め、最寄り停留所を自動表示する。
   * 2回目以降は localStorage に保存された「いつもの停留所・方面」を優先する。
   * (「現在地から探す」ボタンを押した場合のみ、明示的に現在地基準へ切り替える)
   */
  function initFromSavedOrDefault() {
    const saved = loadSavedSelection();

    if (saved && dataSource.getStopById(saved.stopId)) {
      currentStops = dataSource.getStops();
      populateStopSelect(currentStops);
      selectedDirectionId = saved.directionId;
      selectStop(saved.stopId, { keepDirection: true });
      return;
    }

    // 保存済みの選択がない = 初回起動。まず全件のデフォルト一覧を即座に表示しておき
    // (位置情報の許可待ち・取得失敗時にも画面が空のまま止まって見えないようにするため)、
    // 位置情報が取得できた時点で近い順の一覧に差し替える。
    currentStops = dataSource.getStops();
    populateStopSelect(currentStops);
    selectStop(currentStops[0].id);
    locateAndSort();
  }

  function locateAndSort() {
    if (!("geolocation" in navigator)) {
      showStatus("この端末では現在地を利用できません");
      return;
    }
    showStatus("現在地を取得中...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        // Haversine式で全停留所との距離を計算し、近い順に最低10件(全件がそれ未満ならその件数)を表示する
        currentStops = dataSource.getStopsSortedByDistance(position).slice(0, NEARBY_DISPLAY_COUNT);
        populateStopSelect(currentStops);
        selectStop(currentStops[0].id); // 最寄り停留所を自動選択。以降ユーザーは他の候補を自由に選べる
        showStatus(null);
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "位置情報の利用が許可されていません。バス停は手動で選択してください"
            : "現在地を取得できませんでした";
        showStatus(message);
        // 取得に失敗しても、initFromSavedOrDefault が既に表示しているデフォルト一覧
        // (または「現在地から探す」ボタン押下前の現在の選択)はそのまま維持する。
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  els.stopSelect.addEventListener("change", (e) => selectStop(e.target.value));
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
      // 停留所名・緯度経度が実データに切り替わったら「DEMO」バッジを外す
      // (方面・時刻表はまだ準備中のため、その旨は別途「時刻表データ準備中」表示で伝える)
      els.demoBadge.hidden = dataSource.usingRealStops === true;
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
