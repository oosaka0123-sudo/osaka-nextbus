/**
 * データ層 (Data Layer)
 * ---------------------------------------------------------
 * データは4つのJSONファイル(/data 以下)に分離されており、アプリ本体
 * (js/app.js)のコードを変更せずに差し替え・更新できるように設計している。
 *
 *   data/metadata.json  … データの出典種別・最終更新日
 *   data/stops.json     … 停留所(名前・緯度経度)
 *   data/routes.json    … 各停留所を通る系統(系統番号)
 *   data/timetable.json … 各系統の方面・行先・平日/土曜/休日の発車時刻表
 *
 * 選択の流れは 停留所 → 系統番号 → 方面・行先 → 次のバス3便 の4段階。
 *
 * 【metadata.json の dataSource フィールドについて】
 *   "demo" の場合(またはファイル自体が存在しない場合)は、常にこのファイル内の
 *   組み込みデモデータで動作し、画面右上に「DEMO」バッジを表示する。
 *   "manual" 等、"demo" 以外の値が入っており、かつ stops.json に1件以上の
 *   停留所が入っている場合のみ、/data 以下の実データを使用し、DEMOバッジを消す。
 *
 * 【時刻表データが未整備の場合について】
 *   ・ある停留所に系統が1件も無い場合、ダミーの pending 系統を1件返す。
 *   ・ある系統に方面・行先(timetable.json のエントリ)が1件も無い場合、
 *     ダミーの pending 方面を1件返す。
 *   ・ある方面に、今日以降のカレンダー種別(平日/土曜/休日)に該当する時刻が
 *     一件も登録されていない場合、getNextDepartures() は空配列を返す。
 *   ・verifiedCalendars が指定されたentryでは、未確認曜日に到達した時点で
 *     それより先の曜日へ飛ばず探索を停止する。未確認を運休扱いしない。
 *   いずれの場合も、UI側は「時刻表データ準備中」を表示し、架空の時刻・
 *   行き先は一切生成しない。
 *
 * 【timetable.json の1エントリが表す内容】
 *   1つの (系統, 方面, 行先) の組み合わせにつき1エントリとし、その中に
 *   平日(weekday) / 土曜(saturday) / 休日(holiday) それぞれの発車時刻
 *   ("HH:MM" の配列、当日 05:00〜翌日未明想定で24:00以降の表記も可) を持つ。
 *   optional の verifiedCalendars を省略した既存entryは3曜日すべて確認済みとして
 *   従来互換で扱う。指定する場合は、Evidence確認済み曜日だけを列挙し、未確認曜日の
 *   配列は空にする。
 *   同じ系統番号でも上り/下りや行先違いが複数存在する場合は、
 *   timetable.json に複数エントリを追加すればよい。
 *   例:
 *     {
 *       "routeId": "○○-a1b2c3__27号",
 *       "direction": "守口車庫前方面",
 *       "destination": "守口車庫前行",
 *       "weekday":  ["05:31", "05:52", "24:10", "25:05"],
 *       "saturday": [],
 *       "holiday":  [],
 *       "verifiedCalendars": ["weekday"]
 *     }
 *   24:10 / 25:05 のように24時を超える表記は「前日(平日)ダイヤの深夜便」を
 *   意味する(実際の時刻としては翌日の00:10 / 01:05になる)。
 *
 * 【曜日・祝日判定について】
 *   日曜日、および内閣府の祝日基準(振替休日・国民の休日を含む)に基づく
 *   祝日を「休日」ダイヤ、土曜日を「土曜」ダイヤ、それ以外を「平日」ダイヤと
 *   判定する(JapaneseCalendar)。祝日の日付そのものは公知の計算式・法律に
 *   基づく算出であり、特定サイトからの取得やスクレイピングは行っていない。
 *
 * 【将来の GTFS-JP / GTFS-RT への切り替えについて】
 *   BusDataSource が公開するインターフェースはデータの取得方法に依存しない
 *   形にしてあるため、将来 GTFS-JP(静的時刻表)や GTFS-RT(リアルタイム)を
 *   正式に利用できるようになった場合は、init() 内のデータ取得処理を
 *   GTFSパーサー/APIクライアントに差し替えるだけでよく、UI側(app.js)の
 *   変更は不要となるように設計している。
 *
 * BusDataSource が満たすべきインターフェース:
 *   init(): Promise<void>
 *   getMetadata(): { dataSource: string, lastUpdated: string }
 *   getStops(): Stop[]
 *   getStopById(stopId): Stop | null
 *   getStopsSortedByDistance(position): Stop[]        // 各要素に distance(m)付与
 *   getRoutesForStop(stopId): Route[]
 *   getDirectionsForRoute(routeId): Direction[]
 *   getNextDepartures(directionId, fromDate, count): Departure[]
 *
 * Stop      = { id, name, lat, lon }
 * Route     = { id, stopId, label, destination, pending?: true }       // 系統番号
 * Direction = { id, routeId, direction, destination, pending?: true }  // 方面・行先
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

const SEARCH_DAYS = 8; // 平日/土曜/休日いずれの周期でも1回は巡り合う日数
const CALENDAR_TYPES = ["weekday", "saturday", "holiday"];

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
 * 日本の祝日判定(内閣府「国民の祝日に関する法律」に基づく計算)。
 * 春分の日・秋分の日は2000〜2099年で有効な標準的な近似式を使用。
 * 振替休日(祝日が日曜の場合、直後の祝日でない日を休日にする)と
 * 国民の休日(祝日と祝日に挟まれた平日を休日とする)にも対応する。
 */
const JapaneseCalendar = (() => {
  const dateUTC = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const dayOfWeekUTC = (y, m, d) => dateUTC(y, m, d).getUTCDay(); // 0=日,1=月,...,6=土
  const addDaysUTC = (y, m, d, delta) => {
    const dt = new Date(Date.UTC(y, m - 1, d) + delta * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  };
  const dateKey = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  function nthWeekday(year, month, weekday, n) {
    const first = dayOfWeekUTC(year, month, 1);
    const offset = (weekday - first + 7) % 7;
    return 1 + offset + (n - 1) * 7;
  }
  function vernalEquinoxDay(year) {
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }
  function autumnalEquinoxDay(year) {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  function fixedHolidays(year) {
    const list = [];
    const push = (m, d) => list.push({ y: year, m, d });
    push(1, 1); // 元日
    push(2, 11); // 建国記念の日
    if (year >= 2020) push(2, 23); // 天皇誕生日
    push(4, 29); // 昭和の日
    push(5, 3); // 憲法記念の日
    push(5, 4); // みどりの日
    push(5, 5); // こどもの日
    push(8, 11); // 山の日
    push(11, 3); // 文化の日
    push(11, 23); // 勤労感謝の日
    push(1, nthWeekday(year, 1, 1, 2)); // 成人の日: 1月第2月曜
    push(7, nthWeekday(year, 7, 1, 3)); // 海の日: 7月第3月曜
    push(9, nthWeekday(year, 9, 1, 3)); // 敬老の日: 9月第3月曜
    push(10, nthWeekday(year, 10, 1, 2)); // スポーツの日: 10月第2月曜
    push(3, vernalEquinoxDay(year)); // 春分の日
    push(9, autumnalEquinoxDay(year)); // 秋分の日
    return list;
  }

  function computeHolidaySet(centerYear) {
    const raw = [centerYear - 1, centerYear, centerYear + 1].flatMap(fixedHolidays);
    const keySet = new Set(raw.map((h) => dateKey(h.y, h.m, h.d)));

    // 振替休日: 祝日が日曜なら、直後の「祝日でない日」を休日にする
    for (const h of raw) {
      if (dayOfWeekUTC(h.y, h.m, h.d) !== 0) continue;
      let cur = { y: h.y, m: h.m, d: h.d };
      do {
        cur = addDaysUTC(cur.y, cur.m, cur.d, 1);
      } while (keySet.has(dateKey(cur.y, cur.m, cur.d)));
      keySet.add(dateKey(cur.y, cur.m, cur.d));
    }

    // 国民の休日: 前日・翌日がともに祝日で、その日自体が祝日でない平日を休日にする
    const holidayDates = [...keySet];
    const additions = [];
    for (const key of holidayDates) {
      const [y, m, d] = key.split("-").map(Number);
      const next = addDaysUTC(y, m, d, 1);
      const nextKey = dateKey(next.y, next.m, next.d);
      if (keySet.has(nextKey)) continue;
      const nextNext = addDaysUTC(y, m, d, 2);
      const nextNextKey = dateKey(nextNext.y, nextNext.m, nextNext.d);
      if (keySet.has(nextNextKey) && dayOfWeekUTC(next.y, next.m, next.d) !== 0) {
        additions.push(nextKey);
      }
    }
    for (const key of additions) keySet.add(key);

    return keySet;
  }

  const cache = new Map();
  function isHoliday(year, month, day) {
    if (!cache.has(year)) cache.set(year, computeHolidaySet(year));
    return cache.get(year).has(dateKey(year, month, day));
  }

  return {
    /** 指定日(日本時間の年月日)のカレンダー種別("weekday"|"saturday"|"holiday")を返す */
    calendarTypeFor(year, month, day) {
      const dow = dayOfWeekUTC(year, month, day);
      if (dow === 0 || isHoliday(year, month, day)) return "holiday";
      if (dow === 6) return "saturday";
      return "weekday";
    },
  };
})();

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

function slugifyText(text) {
  return String(text)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
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
 * 停留所 → 系統番号 → 方面・行先 の3段階構造を実データと同じ形で持つ。
 */
const DEMO_STOPS = [
  { id: "daikokucho", name: "大国町", lat: 34.6596, lon: 135.4991 },
  { id: "tennoji", name: "天王寺駅前", lat: 34.6461, lon: 135.5134 },
  { id: "osakaeki", name: "大阪駅前", lat: 34.7024, lon: 135.4959 },
  { id: "namba", name: "難波(大阪シティバス)", lat: 34.6659, lon: 135.5013 },
  { id: "abenobashi", name: "あべの橋", lat: 34.6465, lon: 135.5145 },
  { id: "shinsaibashi", name: "心斎橋", lat: 34.6745, lon: 135.5013 },
];

const DEMO_ROUTES = [
  { id: "daikokucho-1", stopId: "daikokucho", label: "1号", destination: "1号" },
  { id: "tennoji-1", stopId: "tennoji", label: "2号", destination: "2号" },
  { id: "osakaeki-1", stopId: "osakaeki", label: "3号", destination: "3号" },
  { id: "namba-1", stopId: "namba", label: "4号", destination: "4号" },
  { id: "abenobashi-1", stopId: "abenobashi", label: "5号", destination: "5号" },
  { id: "shinsaibashi-1", stopId: "shinsaibashi", label: "6号", destination: "6号" },
];

const DEMO_DIRECTION_DEFS = [
  { id: "daikokucho-1__namba", routeId: "daikokucho-1", direction: "なんば方面", destination: "なんば行", intervalMin: 12, phaseMin: 7 },
  { id: "daikokucho-1__tamade", routeId: "daikokucho-1", direction: "玉出方面", destination: "玉出行", intervalMin: 15, phaseMin: 3 },
  { id: "tennoji-1__abeno", routeId: "tennoji-1", direction: "あべの方面", destination: "あべの橋行", intervalMin: 10, phaseMin: 2 },
  { id: "tennoji-1__shitennoji", routeId: "tennoji-1", direction: "四天王寺方面", destination: "四天王寺前行", intervalMin: 18, phaseMin: 9 },
  { id: "osakaeki-1__umeda", routeId: "osakaeki-1", direction: "梅田方面", destination: "梅田新道行", intervalMin: 8, phaseMin: 0 },
  { id: "osakaeki-1__juso", routeId: "osakaeki-1", direction: "十三方面", destination: "十三行", intervalMin: 14, phaseMin: 5 },
  { id: "namba-1__daikokucho", routeId: "namba-1", direction: "大国町方面", destination: "大国町経由 住之江公園行", intervalMin: 12, phaseMin: 4 },
  { id: "namba-1__nipponbashi", routeId: "namba-1", direction: "日本橋方面", destination: "日本橋行", intervalMin: 20, phaseMin: 11 },
  { id: "abenobashi-1__tennoji", routeId: "abenobashi-1", direction: "天王寺駅前方面", destination: "天王寺駅前行", intervalMin: 9, phaseMin: 1 },
  { id: "abenobashi-1__sumiyoshi", routeId: "abenobashi-1", direction: "住吉方面", destination: "住吉車庫前行", intervalMin: 16, phaseMin: 6 },
  { id: "shinsaibashi-1__namba", routeId: "shinsaibashi-1", direction: "なんば方面", destination: "なんば行", intervalMin: 11, phaseMin: 3 },
  { id: "shinsaibashi-1__honmachi", routeId: "shinsaibashi-1", direction: "本町方面", destination: "本町行", intervalMin: 13, phaseMin: 8 },
];

const DEMO_DIRECTIONS = DEMO_DIRECTION_DEFS.map(({ intervalMin, phaseMin, ...d }) => d);

const DEMO_TIMETABLE_BY_DIRECTION_ID = new Map(
  DEMO_DIRECTION_DEFS.map((d) => {
    const times = generateDailyTimes(d.intervalMin, d.phaseMin);
    return [
      d.id,
      {
        weekday: times,
        saturday: times,
        holiday: times,
        verifiedCalendars: new Set(CALENDAR_TYPES),
      },
    ];
  })
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

function sanitizeTimes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((t) => /^\d{1,2}:\d{2}$/.test(t));
}

function normalizeVerifiedCalendars(entry) {
  if (!Array.isArray(entry.verifiedCalendars)) return new Set(CALENDAR_TYPES);
  return new Set(entry.verifiedCalendars.filter((calendar) => CALENDAR_TYPES.includes(calendar)));
}

/**
 * timetable.json の生データから、方面一覧(routeId別)と、
 * directionId → 平日/土曜/休日の時刻表、の2つの索引を作る。
 * direction / destination のどちらかが欠けている行は、架空の行き先を
 * 表示しないため無視する。
 */
function buildTimetableIndex(entries) {
  const directionsByRouteId = new Map();
  const timetableByDirectionId = new Map();

  entries.forEach((entry, index) => {
    if (!entry || !entry.routeId || !entry.direction || !entry.destination) return;
    const id = entry.id || `${entry.routeId}__${slugifyText(String(entry.direction) + String(entry.destination))}-${index}`;
    const direction = {
      id,
      routeId: String(entry.routeId),
      direction: String(entry.direction),
      destination: String(entry.destination),
    };
    if (!directionsByRouteId.has(direction.routeId)) directionsByRouteId.set(direction.routeId, []);
    directionsByRouteId.get(direction.routeId).push(direction);

    timetableByDirectionId.set(id, {
      weekday: sanitizeTimes(entry.weekday),
      saturday: sanitizeTimes(entry.saturday),
      holiday: sanitizeTimes(entry.holiday),
      verifiedCalendars: normalizeVerifiedCalendars(entry),
    });
  });

  return { directionsByRouteId, timetableByDirectionId };
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

const DEMO_DIRECTIONS_BY_ROUTE_ID = groupDirectionsByRoute(DEMO_DIRECTIONS);

function groupDirectionsByRoute(directions) {
  const map = new Map();
  for (const d of directions) {
    if (!map.has(d.routeId)) map.set(d.routeId, []);
    map.get(d.routeId).push(d);
  }
  return map;
}

const BusDataSource = {
  usingRealData: false,
  _metadata: DEFAULT_DEMO_METADATA,
  _stops: DEMO_STOPS,
  _routesByStopId: groupRoutesByStop(DEMO_ROUTES),
  _directionsByRouteId: DEMO_DIRECTIONS_BY_ROUTE_ID,
  _timetableByDirectionId: DEMO_TIMETABLE_BY_DIRECTION_ID,

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
      const { directionsByRouteId, timetableByDirectionId } = buildTimetableIndex(
        Array.isArray(rawTimetable) ? rawTimetable : []
      );
      this.usingRealData = true;
      this._metadata = metadata;
      this._stops = stops;
      this._routesByStopId = groupRoutesByStop(Array.isArray(rawRoutes) ? rawRoutes : []);
      this._directionsByRouteId = directionsByRouteId;
      this._timetableByDirectionId = timetableByDirectionId;
    } else {
      this.usingRealData = false;
      this._metadata =
        metadata && metadata.dataSource === "demo" ? metadata : DEFAULT_DEMO_METADATA;
      this._stops = DEMO_STOPS;
      this._routesByStopId = groupRoutesByStop(DEMO_ROUTES);
      this._directionsByRouteId = DEMO_DIRECTIONS_BY_ROUTE_ID;
      this._timetableByDirectionId = DEMO_TIMETABLE_BY_DIRECTION_ID;
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
   * 指定停留所を通る系統番号一覧を返す。1件も無い場合は、
   * 「時刻表データ準備中」であることを示す1件のみのダミー系統を返す。
   */
  getRoutesForStop(stopId) {
    const routes = this._routesByStopId.get(stopId) || [];
    if (routes.length === 0) {
      return [
        { id: "pending", stopId, label: "時刻表データ準備中", destination: "時刻表データ準備中", pending: true },
      ];
    }
    return routes;
  },

  /**
   * 指定系統の方面・行先一覧を返す。1件も無い場合は、
   * 「時刻表データ準備中」であることを示す1件のみのダミー方面を返す。
   */
  getDirectionsForRoute(routeId) {
    const directions = this._directionsByRouteId.get(routeId) || [];
    if (directions.length === 0) {
      return [
        { id: "pending", routeId, direction: "時刻表データ準備中", destination: "時刻表データ準備中", pending: true },
      ];
    }
    return directions;
  },

  /**
   * 指定方面の「次発」以降の便を count 件返す。
   * 平日/土曜/休日の判定は日本時間の暦日ごとに行い、24:00を超える時刻表記
   * (深夜0時をまたぐ便)にも対応する。verifiedCalendarsで未確認の暦日に到達した
   * 場合は、その日を飛ばして先の曜日を検索せずfail closedで探索を停止する。
   */
  getNextDepartures(directionId, fromDate, count) {
    const timesByCalendar = this._timetableByDirectionId.get(directionId);
    if (!timesByCalendar) return [];

    const results = [];
    const dayStartEpoch = TokyoTime.midnightEpoch(fromDate);
    const verifiedCalendars = timesByCalendar.verifiedCalendars || new Set(CALENDAR_TYPES);

    for (let dayOffset = 0; dayOffset < SEARCH_DAYS && results.length < count; dayOffset++) {
      const baseEpoch = dayStartEpoch + dayOffset * 86400000;
      const { year, month, day } = TokyoTime.parts(new Date(baseEpoch));
      const calendarType = JapaneseCalendar.calendarTypeFor(year, month, day);
      if (!verifiedCalendars.has(calendarType)) break;
      const times = timesByCalendar[calendarType] || [];

      for (const hhmm of times) {
        const [h, m] = hhmm.split(":").map(Number);
        const epoch = baseEpoch + (h * 60 + m) * 60000;
        if (epoch > fromDate.getTime()) {
          results.push({ time: new Date(epoch) });
          if (results.length >= count) break;
        }
      }
    }
    return results;
  },
};
