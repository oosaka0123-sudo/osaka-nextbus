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
  const NEARBY_RADIUS_M = 1000; // 「現在地から半径1km以内」を優先表示する基準

  const els = {
    stopSelect: document.getElementById("stop-select"),
    directionSelect: document.getElementById("direction-select"),
    statusMessage: document.getElementById("status-message"),
    locateBtn: document.getElementById("locate-btn"),
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
        ? `${stop.name}(${formatDistanceLabel(stop.distance)})`
        : stop.name;
    return opt;
  }

  /**
   * バス停プルダウンを構築する。距離情報(現在地取得済み)がある場合は、
   * 「現在地から半径1km以内」を優先グループとして先頭にまとめ、
   * 各停留所名の横に距離を表示する。距離情報がない場合は通常の一覧のまま表示する。
   */
  function populateStopSelect(stops) {
    els.stopSelect.innerHTML = "";
    const hasDistance = stops.length > 0 && typeof stops[0].distance === "number";

    if (!hasDistance) {
      for (const stop of stops) {
        els.stopSelect.appendChild(makeStopOption(stop));
      }
      return;
    }

    const nearby = stops.filter((s) => s.distance <= NEARBY_RADIUS_M);
    const others = stops.filter((s) => s.distance > NEARBY_RADIUS_M);

    if (nearby.length > 0) {
      const group = document.createElement("optgroup");
      group.label = `現在地から1km以内`;
      for (const stop of nearby) group.appendChild(makeStopOption(stop));
      els.stopSelect.appendChild(group);
    }
    if (others.length > 0) {
      const group = document.createElement("optgroup");
      group.label = nearby.length > 0 ? "その他の停留所" : "停留所一覧";
      for (const stop of others) group.appendChild(makeStopOption(stop));
      els.stopSelect.appendChild(group);
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
  }

  function renderBoard() {
    const stop = dataSource.getStopById(selectedStopId);
    if (!stop) return;
    const direction = dataSource.getDirection(selectedStopId, selectedDirectionId);
    if (!direction) return;

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

  function initFromSavedOrDefault() {
    currentStops = dataSource.getStops();
    const saved = loadSavedSelection();
    populateStopSelect(currentStops);

    if (saved && dataSource.getStopById(saved.stopId)) {
      selectedDirectionId = saved.directionId;
      selectStop(saved.stopId, { keepDirection: true });
      return;
    }

    selectStop(currentStops[0].id);
    locateAndSort({ silent: true });
  }

  function locateAndSort({ silent = false } = {}) {
    if (!("geolocation" in navigator)) {
      if (!silent) showStatus("この端末では現在地を利用できません");
      return;
    }
    if (!silent) showStatus("現在地を取得中...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        currentStops = dataSource.getStopsSortedByDistance(position);
        populateStopSelect(currentStops);
        selectStop(currentStops[0].id);
        showStatus(null);
      },
      (err) => {
        if (!silent) {
          const message =
            err.code === err.PERMISSION_DENIED
              ? "位置情報の利用が許可されていません。バス停は手動で選択してください"
              : "現在地を取得できませんでした";
          showStatus(message);
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  els.stopSelect.addEventListener("change", (e) => selectStop(e.target.value));
  els.directionSelect.addEventListener("change", (e) => selectDirection(e.target.value));
  els.locateBtn.addEventListener("click", () => locateAndSort({ silent: false }));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") renderBoard();
  });

  dataSource
    .init()
    .catch(() => {
      /* 実データの読み込みに失敗してもデモデータで動作継続する */
    })
    .then(() => {
      initFromSavedOrDefault();
      scheduleRefresh();
    });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* SW登録に失敗してもアプリ自体は動作可能なため無視 */
      });
    });
  }
})();
