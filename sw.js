/**
 * Service Worker
 * ---------------------------------------------------------
 * オンライン時は最新データを優先し、オフライン時のみキャッシュへ
 * フォールバックする network-first 方式。
 *
 * timetable-extra.json は現地写真から追加した時刻表を保持し、
 * data/timetable.json へのリクエスト時に既存データと結合して返す。
 */
const CACHE_VERSION = "v22";
const CACHE_NAME = `osaka-nextbus-${CACHE_VERSION}`;
const EXTRA_TIMETABLE_URL = "./data/timetable-extra.json";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/data.js",
  "./data/metadata.json",
  "./data/stops.json",
  "./data/routes.json",
  "./data/timetable.json",
  EXTRA_TIMETABLE_URL,
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

async function buildMergedTimetableResponse(baseResponse, extraResponse) {
  const base = baseResponse ? await baseResponse.json() : [];
  const extra = extraResponse ? await extraResponse.json() : [];
  const merged = [
    ...(Array.isArray(base) ? base : []),
    ...(Array.isArray(extra) ? extra : []),
  ];

  return new Response(JSON.stringify(merged), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function mergedTimetableResponse(request) {
  const extraUrl = new URL(EXTRA_TIMETABLE_URL, self.location.href);

  try {
    const [baseResponse, extraResponse] = await Promise.all([
      fetch(request),
      fetch(extraUrl),
    ]);

    if (!baseResponse.ok) throw new Error(`base timetable HTTP ${baseResponse.status}`);

    // キャッシュには「結合前」のbase/extraを別々に保存する。
    // 結合済みレスポンスを timetable.json のキーへ保存すると、オフライン時に
    // extraを再結合して重複する可能性があるため保存しない。
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, baseResponse.clone());
    if (extraResponse.ok) await cache.put(extraUrl, extraResponse.clone());

    return buildMergedTimetableResponse(baseResponse, extraResponse.ok ? extraResponse : null);
  } catch (_error) {
    // 初回インストール直後の完全オフラインでも、precache済みのbaseとextraを
    // それぞれ取り出して結合する。
    const cache = await caches.open(CACHE_NAME);
    const [cachedBase, cachedExtra] = await Promise.all([
      cache.match(request),
      cache.match(extraUrl),
    ]);

    if (!cachedBase) return Response.error();
    return buildMergedTimetableResponse(cachedBase, cachedExtra || null);
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.pathname.endsWith("/data/timetable.json")) {
    event.respondWith(mergedTimetableResponse(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
