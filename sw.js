/**
 * Service Worker
 * ---------------------------------------------------------
 * オンライン時は常に最新のコード・データを優先し、オフライン時のみキャッシュに
 * フォールバックする network-first 方式。
 *
 * 時刻表の本体と追加分の結合は js/timetable-loader.js が担当するため、
 * Service Worker は各ファイルを独立してキャッシュするだけにする。
 */
const CACHE_VERSION = "v23";
const CACHE_NAME = `osaka-nextbus-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/timetable-loader.js",
  "./js/app.js",
  "./js/data.js",
  "./data/metadata.json",
  "./data/stops.json",
  "./data/routes.json",
  "./data/timetable.json",
  "./data/timetable-extra.json",
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

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
