/**
 * Supplemental timetable loader
 * ---------------------------------------------------------
 * data/timetable.json を取得する際に data/timetable-extra.json を結合する。
 * Service Worker の制御開始前（PWA初回アクセス）でも追加時刻表が利用できるよう、
 * アプリの fetch レイヤーで結合する。
 *
 * それ以外の fetch はそのままブラウザ標準の fetch に委譲する。
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
      // 追加ファイルだけ取得できない場合でも、既存8系統を壊さない。
      return baseResponse;
    }

    if (!extraResponse.ok) return baseResponse;

    try {
      const [base, extra] = await Promise.all([
        baseResponse.clone().json(),
        extraResponse.json(),
      ]);

      const merged = [
        ...(Array.isArray(base) ? base : []),
        ...(Array.isArray(extra) ? extra : []),
      ];

      return new Response(JSON.stringify(merged), {
        status: baseResponse.status,
        statusText: baseResponse.statusText,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } catch (_error) {
      // JSONの追加側に問題が起きても、既存データでアプリを起動できるようにする。
      return baseResponse;
    }
  };
})();
