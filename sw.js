/**
 * Service Worker
 * ---------------------------------------------------------
 * このアプリは「次のバスまであと何分か」という時間に敏感な情報を表示するため、
 * オンライン時は常に最新のコード・データを優先し、オフライン時のみキャッシュに
 * フォールバックする(network-first)方式を採用している。
 *
 * CACHE_VERSION は index.html / app.js / data.js 等の中身を更新するたびに
 * 必ず値を変更すること。変更しないと、古いバージョンをインストール済みの
 * 端末でキャッシュが入れ替わらず、古い画面が表示され続ける原因になる。
 */
const CACHE_VERSION = "v17";
const CACHE_NAME = `osaka-nextbus-${CACHE_VERSION}`;

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
        // CACHE_VERSION が異なる(=古い)キャッシュをすべて削除する。
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // network-first: オンライン時は常にネットワークから最新を取得し、
  // 取得できた場合のみキャッシュを更新する。オフライン時のみキャッシュを使う。
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
