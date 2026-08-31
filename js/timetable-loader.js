/**
 * Supplemental timetable loader
 * ---------------------------------------------------------
 * data/timetable.json を取得する際に data/timetable-extra.json を結合する。
 * Service Worker の制御開始前（PWA初回アクセス）でも追加時刻表が利用できるよう、
 * アプリの fetch レイヤーで結合する。
 *
 * 旧Service Worker(v21/v22)が一時的に残る端末ではbase側が既にextraを含む
 * 可能性があるため、routeId + direction + destination で重複排除する。
 * 同じキーがある場合は新しく取得したextra側を優先する。
 */
(() => {
  const nativeFetch = window.fetch.bind(window);
  const EXTRA_URL = new URL("data/timetable-extra.json", document.baseURI).href;

  function getRequestUrl(input) {
    if (typeof input === "string") return new URL(input, document.baseURI);
    if (input instanceof URL) return input;
    if (input && typeof input.url === "string") return new URL(input.url, document.baseURI);
    return null;
  }

  function entryKey(item) {
    return `${item.routeId || ""}\u0000${item.direction || ""}\u0000${item.destination || ""}`;
  }

  function mergePreferExtra(base, extra) {
    const byKey = new Map();

    for (const item of base) {
      if (!item || typeof item !== "object") continue;
      byKey.set(entryKey(item), item);
    }
    for (const item of extra) {
      if (!item || typeof item !== "object") continue;
      // extraは現在配信中の追加データなので、同じキーなら旧base内の値を上書きする。
      byKey.set(entryKey(item), item);
    }
    return [...byKey.values()];
  }

  window.fetch = async function mergedTimetableFetch(input, init) {
    const requestUrl = getRequestUrl(input);
    if (!requestUrl || !requestUrl.pathname.endsWith("/data/timetable.json")) {
      return nativeFetch(input, init);
    }

    const baseResponse = await nativeFetch(input, init);
    if (!baseResponse.ok) return baseResponse;

    let extraResponse;
    try {
      extraResponse = await nativeFetch(EXTRA_URL, init);
    } catch (_error) {
      return baseResponse;
    }

    if (!extraResponse.ok) return baseResponse;

    try {
      const [baseRaw, extraRaw] = await Promise.all([
        baseResponse.clone().json(),
        extraResponse.json(),
      ]);

      const base = Array.isArray(baseRaw) ? baseRaw : [];
      const extra = Array.isArray(extraRaw) ? extraRaw : [];
      const merged = mergePreferExtra(base, extra);

      return new Response(JSON.stringify(merged), {
        status: baseResponse.status,
        statusText: baseResponse.statusText,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } catch (_error) {
      // JSON追加側に問題が起きても既存データで起動できるようにする。
      return baseResponse;
    }
  };
})();
