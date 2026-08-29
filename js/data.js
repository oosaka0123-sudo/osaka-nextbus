/**
 * データ層 (Data Layer)
 * ---------------------------------------------------------
 * ここに定義されているバス停・方面・時刻表データはすべて【デモ用の仮データ】です。
 * 大阪シティバス公式サイトや「い・ま・ど・こ？」等のスクレイピング、
 * 非公開APIの解析・利用は一切行っていません。
 *
 * 正式な GTFS-JP データ等の利用許可が得られた場合は、
 * このファイル (BusDataSource が返すデータの形) だけを差し替えれば、
 * UI 側 (app.js) のコードは変更せずに済むように設計しています。
 *
 * BusDataSource が満たすべきインターフェース:
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

/**
 * デモデータ用の BusDataSource 実装。
 * 発車時刻は「1日を通じて一定間隔で運行している」という仮定で
 * 決定論的に算出しています(サーバー通信なし・完全ローカル計算)。
 */
const DemoBusDataSource = {
  isDemo: IS_DEMO_DATA,

  getStops() {
    return DEMO_STOPS;
  },

  getStopById(stopId) {
    return DEMO_STOPS.find((s) => s.id === stopId) || null;
  },

  getDirection(stopId, directionId) {
    const stop = this.getStopById(stopId);
    if (!stop) return null;
    return stop.directions.find((d) => d.id === directionId) || null;
  },

  /**
   * 現在地から近い順にバス停を並べた配列を返す。
   * position が null の場合は元の並び順をそのまま返す。
   */
  getStopsSortedByDistance(position) {
    const stops = DEMO_STOPS.map((s) => ({ ...s }));
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
