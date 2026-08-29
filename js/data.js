/**
 * データ層 (Data Layer)
 * ---------------------------------------------------------
 * データは4つのJSONファイル(/data 以下)に分離されており、アプリ本体
 * (js/app.js)のコードを変更せずに差し替え・更新できるように設計している。
 *
 *   data/metadata.json  … データの出典種別・最終更新日
 *   data/stops.json     … 停留所(名前・緯度経度)
 *   data/routes.json    … 各停留所を通る系統・方面
 *   data/timetable.json … 各系統(route)の発車時刻表(1日分・毎日繰り返し)
 *
 * 【metadata.json の dataSource フィールドについて】
 *   "demo" の場合(またはファイル自体が存在しない場合)は、常にこのファイル内の
 *   組み込みデモデータ(DEMO_STOPS / DEMO_ROUTES / DEMO_TIMETABLE)で動作し、
 *   画面右上に「DEMO」バッジを表示する。
 *   "manual" 等、"demo" 以外の値が入っており、かつ stops.json に1件以上の
 *   停留所が入っている場合のみ、/data 以下の実データを使用し、DEMOバッジを消す。
 *   これにより、実データへの切り替えは
 *     1. /data/stops.json, routes.json, timetable.json を実データで置き換える
 *     2. /data/metadata.json の dataSource を "manual" 等に変え、lastUpdated を更新する
 *     3. commit / push する
 *   だけで完了し、アプリ本体のコード変更は一切不要。
 *
 * 【時刻表データが未整備の系統について】
 *   ある系統(routeId)の時刻表が timetable.json に存在しない(=空)場合、
 *   getNextDepartures() は必ず空配列を返す。架空の発車時刻を本物のように
 *   表示しないためで、UI側はこれを「時刻表データ準備中」として表示する。
 *   ある停留所に systemsそのものが1件も無い場合も同様に、ダミーの
 *   pending 系統を1件返すことで同じ「準備中」表示に自然に倒れるようにしている。
 *
 * 【将来の GTFS-JP / GTFS-RT への切り替えについて】
 *   BusDataSource が公開するインターフェース(init/getStops/getRoutesForStop/
 *   getNextDepartures 等)はデータの取得方法に依存しない形にしてあるため、
 *   将来 GTFS-JP(静的時刻表)や GTFS-RT(リアルタイム)を正式に利用できる
 *   ようになった場合は、init() 内のデータ取得処理をGTFSパーサー/APIクライアントに
 *   差し替えるだけでよく、UI側(app.js)の変更は不要となるように設計している。
 *
 * BusDataSource が満たすべきインターフェース:
 *   init(): Promise<void>
 *   getMetadata(): { dataSource: string, lastUpdated: string }
 *   getStops(): Stop[]
 *   getStopById(stopId): Stop | null
 *   getStopsSortedByDistance(position): Stop[]   // 各要素に distance(m)付与
 *   getRoutesForStop(stopId): Route[]
 *   getNextDepartures(routeId, fromDate, count): Departure[]
 *
 * Stop = { id, name, lat, lon }
 * Route = { id, stopId, label, destination, pending?: true }
 * Departure = { time: Date }
 */

const DATA_URLS = {
  metadata: "data/metadata.json",
  stops: "data/stops.json",
  routes: "data/routes.json",
  timetable: "data/timetable.json",
};

const DEFAULT_DEMO_METADATA = {
  dataSource: "demo",
  lastUpdated: "2026-08-29",
};

/**
 * 大阪シティバスは日本国内のサービスのため、端末のシステムタイムゾーンに関わらず
 * 常に日本時間(Asia/Tokyo, UTC+9 固定・夏時間なし)で日付・時刻を扱う。
 */
const TokyoTime = {
  parts(date) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = {};
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== "literal") parts[p.type] = parseInt(p.value, 10);
    }
    return parts;
  },

  /** 指定日時が属する「日本時間での日付」の 00:00:00 の epoch ms を返す */
  midnightEpoch(date) {
    const { year, month, day } = this.parts(date);
    return Date.UTC(year, month - 1, day, 0, 0, 0) - 9 * 60 * 60 * 1000;
  },

  /** "HH:MM" 形式(日本時間)で整形する */
  formatHHMM(date) {
    const { hour, minute } = this.parts(date);
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  },
};

/**
 * 2点間の距離をメートルで返す(Haversine formula)。
 */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** メートル数を "480m" のような表示用文字列に整形する(常にメートル表記) */
function formatDistanceLabel(meters) {
  if (typeof meters !== "number" || Number.isNaN(meters)) return "";
  return `${Math.round(meters)}m`;
}

/** "2026-08-29" のような日付文字列を "2026/08/29" 表示用に整形する */
function formatDateLabel(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "不明";
  return dateStr.replace(/-/g, "/");
}

function slugify(name, index) {
  const base = String(name)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `stop-${index}-${base || "stop"}`;
}

/**
 * サービス運行時間 05:00〜24:00 を intervalMin 間隔・phaseMin オフセットで
 * 巡回する "HH:MM" の配列を生成する(デモデータの時刻表を作るための補助関数)。
 */
function generateDailyTimes(intervalMin, phaseMin) {
  const times = [];
  const serviceStartMin = 5 * 60;
  const serviceEndMin = 24 * 60;
  for (let m = serviceStartMin + (phaseMin % intervalMin); m < serviceEndMin; m += intervalMin) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    times.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return times;
}

/**
 * デモ用データ。大阪シティバスの実際の路線・時刻とは一切関係のない創作値。
 * 緯度経度は各バス停のおおよその実在位置(公開地図情報)を参考にしている。
 */
const DEMO_STOPS = [
  { id: "daikokucho", name: "大国町", lat: 34.6596, lon: 135.4991 },
  { id: "tennoji", name: "天王寺駅前", lat: 34.6461, lon: 135.5134 },
  { id: "osakaeki", name: "大阪駅前", lat: 34.7024, lon: 135.4959 },
  { id: "namba", name: "難波(大阪シティバス)", lat: 34.6659, lon: 135.5013 },
  { id: "abenobashi", name: "あべの橋", lat: 34.6465, lon: 135.5145 },
  { id: "shinsaibashi", name: "心斎橋", lat: 34.6745, lon: 135.5013 },
];

const DEMO_ROUTE_DEFS = [
  { id: "daikokucho-namba", stopId: "daikokucho", label: "なんば方面", destination: "なんば行", intervalMin: 12, phaseMin: 7 },
  { id: "daikokucho-tamade", stopId: "daikokucho", label: "玉出方面", destination: "玉出行", intervalMin: 15, phaseMin: 3 },
  { id: "tennoji-abeno", stopId: "tennoji", label: "あべの方面", destination: "あべの橋行", intervalMin: 10, phaseMin: 2 },
  { id: "tennoji-shitennoji", stopId: "tennoji", label: "四天王寺方面", destination: "四天王寺前行", intervalMin: 18, phaseMin: 9 },
  { id: "osakaeki-umeda", stopId: "osakaeki", label: "梅田方面", destination: "梅田新道行", intervalMin: 8, phaseMin: 0 },
  { id: "osakaeki-juso", stopId: "osakaeki", label: "十三方面", destination: "十三行", intervalMin: 14, phaseMin: 5 },
  { id: "namba-daikokucho", stopId: "namba", label: "大国町方面", destination: "大国町経由 住之江公園行", intervalMin: 12, phaseMin: 4 },
  { id: "namba-nipponbashi", stopId: "namba", label: "日本橋方面", destination: "日本橋行", intervalMin: 20, phaseMin: 11 },
  { id: "abenobashi-tennoji", stopId: "abenobashi", label: "天王寺駅前方面", destination: "天王寺駅前行", intervalMin: 9, phaseMin: 1 },
  { id: "abenobashi-sumiyoshi", stopId: "abenobashi", label: "住吉方面", destination: "住吉車庫前行", intervalMin: 16, phaseMin: 6 },
  { id: "shinsaibashi-namba", stopId: "shinsaibashi", label: "なんば方面", destination: "なんば行", intervalMin: 11, phaseMin: 3 },
  { id: "shinsaibashi-honmachi", stopId: "shinsaibashi", label: "本町方面", destination: "本町行", intervalMin: 13, phaseMin: 8 },
];

const DEMO_ROUTES = DEMO_ROUTE_DEFS.map(({ intervalMin, phaseMin, ...route }) => route);

const DEMO_TIMETABLE_BY_ROUTE_ID = new Map(
  DEMO_ROUTE_DEFS.map((r) => [r.id, generateDailyTimes(r.intervalMin, r.phaseMin)])
);

function groupRoutesByStop(routes) {
  const map = new Map();
  for (const route of routes) {
    if (!route || !route.stopId || !route.id) continue;
    if (!map.has(route.stopId)) map.set(route.stopId, []);
    map.get(route.stopId).push({
      id: route.id,
      stopId: route.stopId,
      label: route.label || route.destination || route.id,
      destination: route.destination || route.label || route.id,
    });
  }
  return map;
}

function buildTimetableMap(timetableEntries) {
  const map = new Map();
  for (const entry of timetableEntries) {
    if (!entry || !entry.routeId || !Array.isArray(entry.times)) continue;
    map.set(entry.routeId, entry.times.filter((t) => /^\d{1,2}:\d{2}$/.test(t)));
  }
  return map;
}

function normalizeStops(rawStops) {
  const stops = [];
  rawStops.forEach((entry, index) => {
    const name = entry && entry.name;
    const lat = entry && Number(entry.lat);
    const lon = entry && Number(entry.lon);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return; // 不正レコードはスキップ
    stops.push({
      id: entry.id || slugify(name, index),
      name: String(name),
      lat,
      lon,
    });
  });
  return stops;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null; // オフライン・ファイル未配置・JSON解析失敗など
  }
}

const BusDataSource = {
  usingRealData: false,
  _metadata: DEFAULT_DEMO_METADATA,
  _stops: DEMO_STOPS,
  _routesByStopId: groupRoutesByStop(DEMO_ROUTES),
  _timetableByRouteId: DEMO_TIMETABLE_BY_ROUTE_ID,

  /** 起動時に一度だけ呼び出す。/data 以下の実データを読み込み、条件を満たせば採用する。 */
  async init() {
    const [metadata, rawStops, rawRoutes, rawTimetable] = await Promise.all([
      fetchJson(DATA_URLS.metadata),
      fetchJson(DATA_URLS.stops),
      fetchJson(DATA_URLS.routes),
      fetchJson(DATA_URLS.timetable),
    ]);

    const stops = Array.isArray(rawStops) ? normalizeStops(rawStops) : [];
    const declaresReal =
      !!metadata && typeof metadata.dataSource === "string" && metadata.dataSource !== "demo";

    if (declaresReal && stops.length > 0) {
      this.usingRealData = true;
      this._metadata = metadata;
      this._stops = stops;
      this._routesByStopId = groupRoutesByStop(Array.isArray(rawRoutes) ? rawRoutes : []);
      this._timetableByRouteId = buildTimetableMap(Array.isArray(rawTimetable) ? rawTimetable : []);
    } else {
      this.usingRealData = false;
      this._metadata =
        metadata && metadata.dataSource === "demo" ? metadata : DEFAULT_DEMO_METADATA;
      this._stops = DEMO_STOPS;
      this._routesByStopId = groupRoutesByStop(DEMO_ROUTES);
      this._timetableByRouteId = DEMO_TIMETABLE_BY_ROUTE_ID;
    }
  },

  getMetadata() {
    return this._metadata;
  },

  getStops() {
    return this._stops;
  },

  getStopById(stopId) {
    return this._stops.find((s) => s.id === stopId) || null;
  },

  /**
   * 現在地から近い順にバス停を並べた配列を返す。
   * position が null の場合は元の並び順をそのまま返す。
   * 各バス停には distance(メートル)を付与する。
   */
  getStopsSortedByDistance(position) {
    const stops = this._stops.map((s) => ({ ...s }));
    if (!position) return stops;
    return stops
      .map((s) => ({
        ...s,
        distance: distanceMeters(position.lat, position.lon, s.lat, s.lon),
      }))
      .sort((a, b) => a.distance - b.distance);
  },

  /**
   * 指定停留所を通る系統(方面)一覧を返す。1件も無い場合は、
   * 「時刻表データ準備中」であることを示す1件のみのダミー系統を返す
   * (方面プルダウンを空にしないための最小限の措置。架空の時刻は含まない)。
   */
  getRoutesForStop(stopId) {
    const routes = this._routesByStopId.get(stopId) || [];
    if (routes.length === 0) {
      return [
        {
          id: "pending",
          stopId,
          label: "時刻表データ準備中",
          destination: "時刻表データ準備中",
          pending: true,
        },
      ];
    }
    return routes;
  },

  /**
   * 指定系統の「次発」以降の便を count 件返す。
   * 時刻表データが存在しない系統に対しては、架空の時刻を生成せず必ず空配列を返す。
   * サービス運行時間は 05:00〜24:00、時刻表は毎日繰り返すものと仮定する。
   */
  getNextDepartures(routeId, fromDate, count) {
    const times = this._timetableByRouteId.get(routeId);
    if (!times || times.length === 0) return []; // 時刻表データ準備中

    const results = [];
    const dayStartEpoch = TokyoTime.midnightEpoch(fromDate);

    let dayOffset = 0;
    while (results.length < count && dayOffset < 3) {
      const baseEpoch = dayStartEpoch + dayOffset * 86400000;
      for (const hhmm of times) {
        const [h, m] = hhmm.split(":").map(Number);
        const epoch = baseEpoch + (h * 60 + m) * 60000;
        if (epoch > fromDate.getTime()) {
          results.push({ time: new Date(epoch) });
          if (results.length >= count) break;
        }
      }
      dayOffset += 1;
    }
    return results;
  },
};
