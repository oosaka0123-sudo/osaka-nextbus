/**
 * データ層 (Data Layer)
 * ---------------------------------------------------------
 * 【停留所名・緯度経度】について:
 *   data/osaka-citybus-stops.json が存在する場合、それを実データ(バス停名・
 *   緯度経度)として読み込みます。このファイルは国土交通省「国土数値情報
 *   (バス停留所データ / P11)」等の合法的に利用可能なオープンデータのみを
 *   出典として生成することを前提としています。
 *   大阪シティバス公式サイトや「い・ま・ど・こ？」等のスクレイピング、
 *   非公開APIの解析・利用は一切行っていません。
 *   ファイルが存在しない/読み込みに失敗した場合は、下記の DEMO_STOPS に
 *   自動的にフォールバックします(アプリが壊れないようにするため)。
 *
 * 【方面・時刻表】について:
 *   停留所名・緯度経度が実データであっても、行き先(方面)・発車間隔・
 *   時刻表は【現時点ではすべてデモ(仮データ)】です。正式な GTFS-JP 等の
 *   時刻表データが利用可能になった際に差し替えてください。
 *
 * このファイル (BusDataSource が返すデータの形) だけを差し替えれば、
 * UI 側 (app.js) のコードは変更せずに済むように設計しています。
 *
 * BusDataSource が満たすべきインターフェース:
 *   init(): Promise<void>                      // 起動時に一度だけ呼び出す
 *   getStops(): Stop[]
 *   getNextDepartures(stopId, directionId, fromDate, count): Departure[]
 *
 * Stop = {
 *   id: string,
 *   name: string,          // バス停名
 *   lat: number,
 *   lon: number,
 *   directions: Direction[]
 * }
 * Direction = {
 *   id: string,
 *   label: string,         // プルダウン表示用 (例: "なんば方面")
 *   destination: string    // 大きい表示用 (例: "なんば行")
 * }
 * Departure = {
 *   time: Date             // 発車予定時刻
 * }
 */

const IS_DEMO_DATA = true;
const REAL_STOPS_URL = "data/osaka-citybus-stops.json";

/**
 * デモ用バス停データ。
 * 大阪シティバスの実際の路線・時刻とは一切関係のない仮データです。
 * 緯度経度は各バス停のおおよその実在位置(公開地図情報)を参考にしていますが、
 * 時刻表(発車間隔)は完全な創作値です。
 */
const DEMO_STOPS = [
  {
    id: "daikokucho",
    name: "大国町",
    lat: 34.6596,
    lon: 135.4991,
    directions: [
      { id: "namba", label: "なんば方面", destination: "なんば行", intervalMin: 12, phaseMin: 7 },
      { id: "tamade", label: "玉出方面", destination: "玉出行", intervalMin: 15, phaseMin: 3 },
    ],
  },
  {
    id: "tennoji",
    name: "天王寺駅前",
    lat: 34.6461,
    lon: 135.5134,
    directions: [
      { id: "abeno", label: "あべの方面", destination: "あべの橋行", intervalMin: 10, phaseMin: 2 },
      { id: "shitennoji", label: "四天王寺方面", destination: "四天王寺前行", intervalMin: 18, phaseMin: 9 },
    ],
  },
  {
    id: "osakaeki",
    name: "大阪駅前",
    lat: 34.7024,
    lon: 135.4959,
    directions: [
      { id: "umeda", label: "梅田方面", destination: "梅田新道行", intervalMin: 8, phaseMin: 0 },
      { id: "juso", label: "十三方面", destination: "十三行", intervalMin: 14, phaseMin: 5 },
    ],
  },
  {
    id: "namba",
    name: "難波(大阪シティバス)",
    lat: 34.6659,
    lon: 135.5013,
    directions: [
      { id: "daikokucho2", label: "大国町方面", destination: "大国町経由 住之江公園行", intervalMin: 12, phaseMin: 4 },
      { id: "nipponbashi", label: "日本橋方面", destination: "日本橋行", intervalMin: 20, phaseMin: 11 },
    ],
  },
  {
    id: "abenobashi",
    name: "あべの橋",
    lat: 34.6465,
    lon: 135.5145,
    directions: [
      { id: "tennoji2", label: "天王寺駅前方面", destination: "天王寺駅前行", intervalMin: 9, phaseMin: 1 },
      { id: "sumiyoshi", label: "住吉方面", destination: "住吉車庫前行", intervalMin: 16, phaseMin: 6 },
    ],
  },
  {
    id: "shinsaibashi",
    name: "心斎橋",
    lat: 34.6745,
    lon: 135.5013,
    directions: [
      { id: "namba2", label: "なんば方面", destination: "なんば行", intervalMin: 11, phaseMin: 3 },
      { id: "honmachi", label: "本町方面", destination: "本町行", intervalMin: 13, phaseMin: 8 },
    ],
  },
];

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
    // hour12:false な形式でも24時が"24"ではなく"00"表記になる実装があるため、
    // 深夜0時付近の丸め誤差は許容範囲(発車間隔計算にのみ使用)とする。
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

/** メートル数を "480m" や "1.2km" のような表示用文字列に整形する */
function formatDistanceLabel(meters) {
  if (typeof meters !== "number" || Number.isNaN(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * 実データ(停留所名・緯度経度のみ)には方面・時刻表が含まれないため、
 * 停留所ごとに決定論的な(=毎回同じ結果になる)仮の方面を2つ生成する。
 * これは表示上「行き先」を空にしないための最小限のデモ処理であり、
 * 実在の系統・行き先情報ではない。
 */
function buildPlaceholderDirections(stopId) {
  let hash = 0;
  for (let i = 0; i < stopId.length; i++) {
    hash = (hash * 31 + stopId.charCodeAt(i)) >>> 0;
  }
  const intervalA = 8 + (hash % 13); // 8〜20分
  const intervalB = 8 + ((hash >> 4) % 13);
  const phaseA = hash % intervalA;
  const phaseB = (hash >> 8) % intervalB;
  return [
    {
      id: "up",
      label: "①方面(デモ)",
      destination: "①方面行(デモ)",
      intervalMin: intervalA,
      phaseMin: phaseA,
    },
    {
      id: "down",
      label: "②方面(デモ)",
      destination: "②方面行(デモ)",
      intervalMin: intervalB,
      phaseMin: phaseB,
    },
  ];
}

function slugify(name, index) {
  const base = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `real-${index}-${base || "stop"}`;
}

/**
 * data/osaka-citybus-stops.json を読み込み、Stop[] 形式に変換する。
 * 期待するファイル形式(最小構成): [{ "name": "大国町", "lat": 34.66, "lon": 135.50 }, ...]
 * 取得・解析に失敗した場合や空配列の場合は null を返す(呼び出し側でデモにフォールバック)。
 */
async function fetchRealStops() {
  let response;
  try {
    response = await fetch(REAL_STOPS_URL, { cache: "no-cache" });
  } catch (e) {
    return null; // オフライン・ファイル未配置など
  }
  if (!response || !response.ok) return null;

  let raw;
  try {
    raw = await response.json();
  } catch (e) {
    return null;
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const stops = [];
  raw.forEach((entry, index) => {
    const name = entry && entry.name;
    const lat = entry && Number(entry.lat);
    const lon = entry && Number(entry.lon);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return; // 不正レコードはスキップ
    const id = entry.id || slugify(String(name), index);
    stops.push({
      id,
      name: String(name),
      lat,
      lon,
      isRealLocation: true,
      directions: buildPlaceholderDirections(id),
    });
  });

  return stops.length > 0 ? stops : null;
}

/**
 * デモデータ用の BusDataSource 実装。
 * 発車時刻は「1日を通じて一定間隔で運行している」という仮定で
 * 決定論的に算出しています(サーバー通信なし・完全ローカル計算)。
 */
const DemoBusDataSource = {
  isDemo: IS_DEMO_DATA,
  usingRealStops: false,
  _activeStops: DEMO_STOPS,

  /**
   * 起動時に一度だけ呼び出す。実データ(停留所名・緯度経度)があれば読み込み、
   * なければデモの停留所一覧のまま動作する。
   */
  async init() {
    const realStops = await fetchRealStops();
    if (realStops) {
      this._activeStops = realStops;
      this.usingRealStops = true;
    } else {
      this._activeStops = DEMO_STOPS;
      this.usingRealStops = false;
    }
  },

  getStops() {
    return this._activeStops;
  },

  getStopById(stopId) {
    return this._activeStops.find((s) => s.id === stopId) || null;
  },

  getDirection(stopId, directionId) {
    const stop = this.getStopById(stopId);
    if (!stop) return null;
    return stop.directions.find((d) => d.id === directionId) || null;
  },

  /**
   * 現在地から近い順にバス停を並べた配列を返す。
   * position が null の場合は元の並び順をそのまま返す。
   * 各バス停には distance(メートル)を付与する。
   */
  getStopsSortedByDistance(position) {
    const stops = this._activeStops.map((s) => ({ ...s }));
    if (!position) return stops;
    return stops
      .map((s) => ({
        ...s,
        distance: distanceMeters(position.lat, position.lon, s.lat, s.lon),
      }))
      .sort((a, b) => a.distance - b.distance);
  },

  /**
   * 指定バス停・方面の「次発」以降の便を count 件返す。
   * サービス運行時間は 05:00〜24:00 と仮定。
   */
  getNextDepartures(stopId, directionId, fromDate, count) {
    const direction = this.getDirection(stopId, directionId);
    if (!direction) return [];

    const { intervalMin, phaseMin } = direction;
    const serviceStartMin = 5 * 60; // 05:00
    const serviceEndMin = 24 * 60; // 24:00

    const results = [];
    const dayStartEpoch = TokyoTime.midnightEpoch(fromDate);

    let dayOffset = 0;
    while (results.length < count && dayOffset < 3) {
      const baseEpoch = dayStartEpoch + dayOffset * 86400000;
      for (
        let m = serviceStartMin + (phaseMin % intervalMin);
        m < serviceEndMin;
        m += intervalMin
      ) {
        const epoch = baseEpoch + m * 60000;
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
