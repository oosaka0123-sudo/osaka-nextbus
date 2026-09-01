const { test, expect } = require("@playwright/test");

function attachErrorCollector(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

function expectNoBrowserErrors(errors) {
  expect(errors, errors.join("\n")).toEqual([]);
}

async function waitForData(page) {
  await page.goto("/");
  await expect(page.locator("#stop-select option").first()).toBeAttached();
}

async function selectDirectionByText(page, text) {
  const option = page.locator("#direction-select option", { hasText: text }).first();
  await expect(option).toBeAttached();
  const value = await option.getAttribute("value");
  await page.selectOption("#direction-select", value);
}

async function selectRoute(page, stopId, routeId, directionText) {
  await page.selectOption("#stop-select", stopId);
  await expect(page.locator(`#route-select option[value="${routeId}"]`)).toBeAttached();
  await page.selectOption("#route-select", routeId);
  await selectDirectionByText(page, directionText);
}

function hhmm(locator) {
  return expect(locator).toHaveText(/^\d{2}:\d{2}$/);
}

test("鶴町一丁目71号で次の3便が表示される", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);
  await selectRoute(
    page,
    "鶴町一丁目-3a81dc",
    "鶴町一丁目-3a81dc__71号",
    "なんば方面"
  );

  await expect(page.locator("#dest-0")).toHaveText("なんば");
  await hhmm(page.locator("#time-0"));
  await hhmm(page.locator("#time-1"));
  await hhmm(page.locator("#time-2"));
  await expect(page.locator("#eta-0-seconds")).toHaveText(/^\d{2}$/);
  await expect(page.locator("#eta-1")).toHaveText(/^あと \d+分$/);
  await expect(page.locator("#eta-2")).toHaveText(/^あと \d+分$/);
  await expect(page.locator("#locate-btn")).toBeInViewport();
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("extra側の鶴町一丁目91号がUIに結合される", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);
  await selectRoute(
    page,
    "鶴町一丁目-3a81dc",
    "鶴町一丁目-3a81dc__91号",
    "ドーム前千代崎方面"
  );

  await expect(page.locator("#dest-0")).toHaveText("ドーム前千代崎");
  await hhmm(page.locator("#time-0"));
  await hhmm(page.locator("#time-1"));
  await hhmm(page.locator("#time-2"));
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("extra側の補正データがbaseより優先される", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);

  const corrected = await page.evaluate(async () => {
    const entries = await fetch("data/timetable.json").then((response) => response.json());
    const route90 = entries.find(
      (entry) =>
        entry.routeId === "鶴町一丁目-3a81dc__90号" &&
        entry.direction === "野田阪神前方面" &&
        entry.destination === "野田阪神前"
    );
    const route80 = entries.find(
      (entry) =>
        entry.routeId === "鶴町一丁目-3a81dc__80号" &&
        entry.direction === "あべの橋方面" &&
        entry.destination === "あべの橋［天王寺駅前］"
    );
    return {
      route90Holiday: route90?.holiday ?? null,
      route80Holiday: route80?.holiday ?? null,
    };
  });

  expect(corrected.route90Holiday).toContain("14:51");
  expect(corrected.route90Holiday).not.toContain("13:51");
  expect(corrected.route80Holiday).toContain("09:51");
  expect(corrected.route80Holiday).not.toContain("10:51");
  expectNoBrowserErrors(errors);
});

test("主表示の秒カウントと24:07の翌日00:07表示を両立する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  const fixedNow = new Date("2026-08-31T23:50:40+09:00").getTime();
  await page.addInitScript(({ now }) => {
    const OriginalDate = Date;
    class MockDate extends OriginalDate {
      constructor(...args) {
        super(...(args.length ? args : [now]));
      }
      static now() {
        return now;
      }
    }
    window.Date = MockDate;
  }, { now: fixedNow });

  await waitForData(page);
  await selectRoute(
    page,
    "幸町一丁目-fe1e0f",
    "幸町一丁目-fe1e0f__71号",
    "鶴町四丁目方面"
  );

  await expect(page.locator("#time-0")).toHaveText("23:53");
  await expect(page.locator("#eta-0")).toHaveText("2");
  await expect(page.locator("#eta-0-seconds")).toHaveText("20");
  await expect(page.locator("#time-1")).toHaveText("00:07");
  await expect(page.locator("#eta-1")).toHaveText("あと 16分");
  expectNoBrowserErrors(errors);
});

test("選択した停留所・系統・方面が再読み込み後も復元される", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);
  await selectRoute(
    page,
    "鶴町一丁目-3a81dc",
    "鶴町一丁目-3a81dc__90号",
    "野田阪神前方面"
  );

  await expect(page.locator("#dest-0")).toHaveText("野田阪神前");
  await page.reload();

  await expect(page.locator("#stop-select")).toHaveValue("鶴町一丁目-3a81dc");
  await expect(page.locator("#route-select")).toHaveValue("鶴町一丁目-3a81dc__90号");
  await expect(page.locator("#dest-0")).toHaveText("野田阪神前");
  expectNoBrowserErrors(errors);
});

test("GPS成功時は近い順10停留所に絞り込まれる", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    permissions: ["geolocation"],
    geolocation: { latitude: 34.6937, longitude: 135.5023 },
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = attachErrorCollector(page);
  await page.goto("/");

  await expect(page.locator("#nearby-label")).toBeVisible();
  await expect(page.locator("#stop-select option")).toHaveCount(10);
  await expect(page.locator("#status-message")).toBeHidden();
  await expect(page.locator("#locate-btn")).toBeInViewport();
  expectNoBrowserErrors(errors);
  await context.close();
});

test("GPS拒否時は全停留所から手動選択できる", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    permissions: [],
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = attachErrorCollector(page);
  await page.goto("/");

  await expect(page.locator("#status-message")).toContainText(/位置情報|現在地/);
  await expect(page.locator("#nearby-label")).toBeHidden();
  await expect(page.locator("#locate-btn")).toBeInViewport();
  const count = await page.locator("#stop-select option").count();
  expect(count).toBeGreaterThan(10);
  expectNoBrowserErrors(errors);
  await context.close();
});

test("Service Worker v28でオフラインでもextra側91号を利用できる", async ({ context, page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);

  const swState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.state ?? null;
  });
  expect(swState).toBe("activated");

  await page.reload();
  await expect(page.locator("#stop-select option").first()).toBeAttached();

  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).toContain("osaka-nextbus-v28");

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#stop-select option").first()).toBeAttached();
  await selectRoute(
    page,
    "鶴町一丁目-3a81dc",
    "鶴町一丁目-3a81dc__91号",
    "ドーム前千代崎方面"
  );
  await expect(page.locator("#dest-0")).toHaveText("ドーム前千代崎");
  await hhmm(page.locator("#time-0"));
  await expect(page.locator("#eta-0-seconds")).toHaveText(/^\d{2}$/);

  await context.setOffline(false);
  expectNoBrowserErrors(errors);
});