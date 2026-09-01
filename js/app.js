/**
 * アプリ本体 (UI 制御)
 * データ取得は必ず BusDataSource (data.js) 経由で行い、
 * ここには仮データや実データの詳細を直接書かない。
 *
 * デフォルトは系統・方面を未選択にし、選択した停留所から早く来る順に5便を表示する。
 * 系統だけ選んだ場合はその系統内の早い順5便、方面まで選んだ場合は従来どおり
 * 次の3便を表示し、主表示の次便だけ残り時間を分・秒で表示する。
 */
(() => {
  "use strict";

  const dataSource = BusDataSource;
  const STORAGE_KEY = "osaka-nextbus:selection";
  const REFRESH_MS = 1000;
  const OVERVIEW_COUNT = 5;
  const NEARBY_DISPLAY_COUNT = 10;

  const els = {
    demoBadge: document.getElementById("demo-badge"),
    lastUpdated: document.getElementById("last-updated"),
    nearbyLabel: document.getElementById("nearby-label"),
    stopSelect: document.getElementById("stop-select"),
    routeSelect: document.getElementById("route-select"),
    directionSelect: document.getElementById("direction-select"),
    statusMessage: document.getElementById("status-message"),
    locateBtn: document.getElementById("locate-btn"),
    overviewBoard: document.getElementById("overview-board"),
    overviewLabel: document.getElementById("overview-label"),
    overviewList: document.getElementById("overview-list"),
    detailLabel: document.getElementById("detail-label"),
    nextBus: document.getElementById("next-bus"),
    upcoming: document.getElementById("upcoming"),
    pendingMessage: document.getElementById("pending-message"),
    eta0: document.getElementById("eta-0"),
    eta0Seconds: document.getElementById("eta-0-seconds"),
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
  let suppressSave = false;

  /**
   * 保存するのは「いつもの停留所」だけ。
   * 系統・方面は毎回未選択から始め、停留所全体の早い順5便を最初に見せる。
   * 旧バージョンが routeId/directionId も保存していても stopId だけを読む。
   */
  function loadSavedStop() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.stopId) return parsed.stopId;
    } catch (e) {
      /* localStorage が使えない/壊れている場合は無視 */
    }
    return null;
  }

  function saveStopSelection(stopId) {
    if (suppressSave || !stopId) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ stopId }));
    } catch (e) {
      /* 保存できなくても致命的ではないので無視 */
    }
  }

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

  function etaParts(date, now) {
    const totalSeconds = Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 1000));
    return {
      minutes: Math.floor(totalSeconds / 60),
      seconds: totalSeconds % 60,
    };
  }

  function formatEtaMinutes(date, now) {
    return `あと ${etaParts(date, now).minutes}分`;
  }

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

  function populateStopSelect(stops) {
    els.stopSelect.innerHTML = "";
    for (const stop of stops) {
      els.stopSelect.appendChild(makeStopOption(stop));
    }
  }

  function makePlaceholder(text) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = text;
    return opt;
  }

  function populateRouteSelect(routes) {
    els.routeSelect.innerHTML = "";
    els.routeSelect.appendChild(makePlaceholder("号数を選択（未選択＝早い順）"));
    for (const route of routes) {
      if (route.pending) continue;
      const opt = document.createElement("option");
      opt.value = route.id;
      opt.textContent = route.label;
      els.routeSelect.appendChild(opt);
    }
    els.routeSelect.value = "";
    els.routeSelect.disabled = routes.every((route) => route.pending === true);
  }

  function populateDirectionSelect(directions, enabled = false) {
    els.directionSelect.innerHTML = "";
    els.directionSelect.appendChild(
      makePlaceholder(enabled ? "行き先を選択（未選択＝早い順）" : "行き先を選択")
    );
    for (const d of directions) {
      if (d.pending) continue;
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.direction;
      els.directionSelect.appendChild(opt);
    }
    els.directionSelect.value = "";
    els.directionSelect.disabled = !enabled || directions.every((d) => d.pending === true);
  }

  function setOverviewMode() {
    els.overviewBoard.hidden = false;
    els.detailLabel.hidden = true;
    els.nextBus.hidden = true;
    els.upcoming.hidden = true;
  }

  function setDetailMode() {
    els.overviewBoard.hidden = true;
    els.detailLabel.hidden = false;
  }

  function collectUpcoming(routes, now, count) {
    const items = [];

    for (const route of routes) {
      if (!route || route.pending) continue;
      const directions = dataSource.getDirectionsForRoute(route.id);
      for (const direction of directions) {
        if (!direction || direction.pending) continue;
        const departures = dataSource.getNextDepartures(direction.id, now, count);
        for (const departure of departures) {
          items.push({
            time: departure.time,
            routeLabel: route.label,
            destination: direction.destination,
            direction: direction.direction,
          });
        }
      }
    }

    items.sort((a, b) => a.time.getTime() - b.time.getTime());
    return items.slice(0, count);
  }

  function renderOverview() {
    const now = new Date();
    const routes = selectedRouteId
      ? currentRoutes.filter((route) => route.id === selectedRouteId)
      : currentRoutes;
    const items = collectUpcoming(routes, now, OVERVIEW_COUNT);

    setOverviewMode();
    els.overviewList.innerHTML = "";
    els.overviewLabel.textContent = selectedRouteId
      ? `${routes[0]?.label || "選択中の号数"} 早く来る順`
      : "早く来る順 5件";

    if (items.length === 0) {
      els.overviewBoard.hidden = true;
      els.pendingMessage.hidden = false;
      return;
    }

    els.pendingMessage.hidden = true;

    for (const item of items) {
      const li = document.createElement("li");
      li.className = "overview-item";

      const top = document.createElement("div");
      top.className = "overview-item-top";

      const route = document.createElement("span");
      route.className = "overview-route";
      route.textContent = item.routeLabel;

      const time = document.createElement("span");
      time.className = "overview-time";
      time.textContent = formatTime(item.time);

      const eta = document.createElement("span");
      eta.className = "overview-eta";
      eta.textContent = formatEtaMinutes(item.time, now);

      const destination = document.createElement("div");
      destination.className = "overview-destination";
      destination.textContent = item.destination;

      top.append(route, time, eta);
      li.append(top, destination);
      els.overviewList.appendChild(li);
    }
  }

  function renderDetail() {
    const direction = currentDirections.find((d) => d.id === selectedDirectionId);
    if (!direction) {
      renderOverview();
      return;
    }

    const now = new Date();
    const departures = dataSource.getNextDepartures(selectedDirectionId, now, 3);
    setDetailMode();

    if (departures.length === 0) {
      els.nextBus.hidden = true;
      els.upcoming.hidden = true;
      els.pendingMessage.hidden = false;
      return;
    }

    els.nextBus.hidden = false;
    els.upcoming.hidden = false;
    els.pendingMessage.hidden = true;

    const first = departures[0];
    const firstEta = etaParts(first.time, now);
    els.eta0.textContent = firstEta.minutes;
    els.eta0Seconds.textContent = String(firstEta.seconds).padStart(2, "0");
    els.time0.textContent = formatTime(first.time);
    els.dest0.textContent = direction.destination;

    if (departures[1]) {
      els.time1.textContent = formatTime(departures[1].time);
      els.eta1.textContent = formatEtaMinutes(departures[1].time, now);
    } else {
      els.time1.textContent = "--:--";
      els.eta1.textContent = "";
    }

    if (departures[2]) {
      els.time2.textContent = formatTime(departures[2].time);
      els.eta2.textContent = formatEtaMinutes(departures[2].time, now);
    } else {
      els.time2.textContent = "--:--";
      els.eta2.textContent = "";
    }
  }

  function renderBoard() {
    if (!dataSource.getStopById(selectedStopId)) return;
    if (!selectedRouteId || !selectedDirectionId) {
      renderOverview();
      return;
    }
    renderDetail();
  }

  function scheduleRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(renderBoard, REFRESH_MS);
  }

  function selectDirection(directionId) {
    selectedDirectionId = directionId || null;
    els.directionSelect.value = directionId || "";
    renderBoard();
  }

  function selectRoute(routeId) {
    selectedRouteId = routeId || null;
    selectedDirectionId = null;
    els.routeSelect.value = routeId || "";

    if (!selectedRouteId) {
      currentDirections = [];
      populateDirectionSelect([], false);
      renderBoard();
      return;
    }

    currentDirections = dataSource.getDirectionsForRoute(selectedRouteId);
    populateDirectionSelect(currentDirections, true);
    renderBoard();
  }

  function selectStop(stopId) {
    const stop = dataSource.getStopById(stopId);
    if (!stop) return;

    selectedStopId = stopId;
    selectedRouteId = null;
    selectedDirectionId = null;
    currentDirections = [];
    els.stopSelect.value = stopId;

    currentRoutes = dataSource.getRoutesForStop(stopId);
    populateRouteSelect(currentRoutes);
    populateDirectionSelect([], false);
    saveStopSelection(stopId);
    renderBoard();
  }

  /**
   * 保存済み停留所があればそこから開始するが、号数・方面は必ず未選択に戻す。
   * 保存済み停留所がない初回起動だけGPSを自動取得する。
   */
  function initFromSavedOrDefault() {
    const savedStopId = loadSavedStop();

    if (savedStopId && dataSource.getStopById(savedStopId)) {
      currentStops = sortedByName(dataSource.getStops());
      populateStopSelect(currentStops);
      setNearbyLabelVisible(false);
      selectStop(savedStopId);
      return;
    }

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
    if (locating) return;
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
        currentStops = dataSource.getStopsSortedByDistance(position).slice(0, NEARBY_DISPLAY_COUNT);
        populateStopSelect(currentStops);
        setNearbyLabelVisible(true);
        selectStop(currentStops[0].id);
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
      els.demoBadge.hidden = dataSource.usingRealData === true;
      const metadata = dataSource.getMetadata();
      els.lastUpdated.textContent = `最終更新 ${formatDateLabel(metadata.lastUpdated)}`;
      initFromSavedOrDefault();
      scheduleRefresh();
    });

  if ("serviceWorker" in navigator) {
    const hadExistingController = !!navigator.serviceWorker.controller;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* SW登録に失敗してもアプリ自体は動作可能なため無視 */
      });
    });

    if (hadExistingController) {
      let hasReloadedForNewWorker = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasReloadedForNewWorker) return;
        hasReloadedForNewWorker = true;
        window.location.reload();
      });
    }
  }
})();