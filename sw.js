/**
 * Service Worker
 * ---------------------------------------------------------
 * オンライン時は最新データを優先し、オフライン時のみキャッシュへ
 * フォールバックする network-first 方式。
 *
 * timetable-extra.json は現地写真から追加した時刻表を保持し、
 * data/timetable.json へのリクエスト時に既存データと結合して返す。
 */
const CACHE_VERSION = "v21";
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

async function mergedTimetableResponse(request) {
  try {
    const extraUrl = new URL(EXTRA_TIMETABLE_URL, self.location.href);
    const [baseResponse, extraResponse] = await Promise.all([
      fetch(request),
      fetch(extraUrl),
    ]);

    if (!baseResponse.ok) throw new Error(`base timetable HTTP ${baseResponse.status}`);

    const base = await baseResponse.json();
    const extra = extraResponse.ok ? await extraResponse.json() : [];
    const merged = [
      ...(Array.isArray(base) ? base : []),
      ...(Array.isArray(extra) ? extra : []),
    ];

    const response = new Response(JSON.stringify(merged), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    return response;
  } catch (_error) {
    return (await caches.match(request)) || Response.error();
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
