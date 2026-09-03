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

test("号数未選択では早く来る順5件に号数・時刻・行き先が出る", async ({ page }) => {
  const errors = attachErrorCollector(page);
  const fixedNow = new Date("2026-09-01T10:00:00+09:00").getTime();
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
  await page.selectOption("#stop-select", "鶴町一丁目-3a81dc");

  await expect(page.locator("#route-select")).toHaveValue("");
  await expect(page.locator("#direction-select")).toHaveValue("");
  await expect(page.locator("#direction-select")).toBeDisabled();
  await expect(page.locator("#overview-board")).toBeVisible();
  await expect(page.locator("#overview-list .overview-item")).toHaveCount(5);

  const items = page.locator("#overview-list .overview-item");
  for (let i = 0; i < 5; i += 1) {
    const item = items.nth(i);
    await expect(item.locator(".overview-route")).not.toHaveText("");
    await expect(item.locator(".overview-time")).toHaveText(/^\d{2}:\d{2}$/);
    await expect(item.locator(".overview-destination")).not.toHaveText("");
    await expect(item.locator(".overview-eta")).toHaveText(/^あと \d+分$/);
  }
  expectNoBrowserErrors(errors);
});

test("鶴町一丁目71号で次の3便が表示される", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);
  await selectRoute(
    page,
    "鶴町一丁目-3a81dc",
    "鶴町一丁目-3a81dc__71号",
    "なんば方面"
  );

  await expect(page.locator("#overview-board")).toBeHidden();
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

test("再読み込み後は停留所だけ復元し、号数・方面は未選択に戻る", async ({ page }) => {
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
  await expect(page.locator("#route-select")).toHaveValue("");
  await expect(page.locator("#direction-select")).toHaveValue("");
  await expect(page.locator("#overview-board")).toBeVisible();
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
  await expect(page.locator("#route-select")).toHaveValue("");
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

test("Service Worker v29でオフラインでもextra側91号を利用できる", async ({ context, page }) => {
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
  expect(cacheNames).toContain("osaka-nextbus-v29");

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

async function freezeNow(page, iso) {
  const fixedNow = new Date(iso).getTime();
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
}

async function installPartial71Timetable(page, { weekday, verifiedCalendars }) {
  await page.route("**/data/timetable.json", async (route) => {
    const response = await route.fetch();
    const entries = await response.json();
    const target = entries.find(
      (entry) =>
        entry.routeId === "鶴町一丁目-3a81dc__71号" &&
        entry.direction === "なんば方面"
    );
    if (!target) throw new Error("partial-calendar test target not found");
    target.weekday = weekday;
    target.saturday = [];
    target.holiday = [];
    if (verifiedCalendars === undefined) delete target.verifiedCalendars;
    else target.verifiedCalendars = verifiedCalendars;
    await route.fulfill({ response, json: entries });
  });
}

test("weekdayだけVerifiedでも平日中はVerified便を表示する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-01T10:00:00+09:00");
  await installPartial71Timetable(page, {
    weekday: ["10:05", "10:15", "10:25"],
    verifiedCalendars: ["weekday"],
  });

  await waitForData(page);
  await selectRoute(
    page,
    "鶴町一丁目-3a81dc",
    "鶴町一丁目-3a81dc__71号",
    "なんば方面"
  );

  await expect(page.locator("#time-0")).toHaveText("10:05");
  await expect(page.locator("#time-1")).toHaveText("10:15");
  await expect(page.locator("#time-2")).toHaveText("10:25");
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("weekdayだけVerifiedなら未確認土曜は準備中で止まる", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-05T10:00:00+09:00");
  await installPartial71Timetable(page, {
    weekday: ["10:05", "10:15", "10:25"],
    verifiedCalendars: ["weekday"],
  });

  await waitForData(page);
  await selectRoute(
    page,
    "鶴町一丁目-3a81dc",
    "鶴町一丁目-3a81dc__71号",
    "なんば方面"
  );

  await expect(page.locator("#next-bus")).toBeHidden();
  await expect(page.locator("#pending-message")).toBeVisible();
  expectNoBrowserErrors(errors);
});

test("金曜終便後は未知の週末を飛ばして月曜便を表示しない", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-04T23:30:00+09:00");
  await installPartial71Timetable(page, {
    weekday: ["23:00"],
    verifiedCalendars: ["weekday"],
  });

  await waitForData(page);
  await selectRoute(
    page,
    "鶴町一丁目-3a81dc",
    "鶴町一丁目-3a81dc__71号",
    "なんば方面"
  );

  await expect(page.locator("#next-bus")).toBeHidden();
  await expect(page.locator("#pending-message")).toBeVisible();
  expectNoBrowserErrors(errors);
});

test("verifiedCalendars省略の既存entryは従来通り全曜日Verified扱い", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-05T10:00:00+09:00");
  await installPartial71Timetable(page, {
    weekday: ["10:05", "10:15", "10:25"],
    verifiedCalendars: undefined,
  });

  await page.route("**/data/timetable.json", async (route) => route.continue());
  await waitForData(page);

  const verification = await page.evaluate(() => {
    const direction = BusDataSource.getDirectionsForRoute("鶴町一丁目-3a81dc__71号")[0];
    const internal = BusDataSource._timetableByDirectionId.get(direction.id);
    return internal ? [...internal.verifiedCalendars] : [];
  });
  expect(verification.sort()).toEqual(["holiday", "saturday", "weekday"]);
  expectNoBrowserErrors(errors);
});
