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

test("蜿ｷ謨ｰ譛ｪ驕ｸ謚槭〒縺ｯ譌ｩ縺乗擂繧矩・莉ｶ縺ｫ蜿ｷ謨ｰ繝ｻ譎ょ綾繝ｻ陦後″蜈医′蜃ｺ繧・, async ({ page }) => {
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
  await page.selectOption("#stop-select", "鮓ｴ逕ｺ荳荳∫岼-3a81dc");

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
    await expect(item.locator(".overview-eta")).toHaveText(/^縺ゅ→ \d+蛻・/);
  }
  expectNoBrowserErrors(errors);
});

test("鮓ｴ逕ｺ荳荳∫岼71蜿ｷ縺ｧ谺｡縺ｮ3萓ｿ縺瑚｡ｨ遉ｺ縺輔ｌ繧・, async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);
  await selectRoute(
    page,
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc",
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc__71蜿ｷ",
    "縺ｪ繧薙・譁ｹ髱｢"
  );

  await expect(page.locator("#overview-board")).toBeHidden();
  await expect(page.locator("#dest-0")).toHaveText("縺ｪ繧薙・");
  await hhmm(page.locator("#time-0"));
  await hhmm(page.locator("#time-1"));
  await hhmm(page.locator("#time-2"));
  await expect(page.locator("#eta-0-seconds")).toHaveText(/^\d{2}$/);
  await expect(page.locator("#eta-1")).toHaveText(/^縺ゅ→ \d+蛻・/);
  await expect(page.locator("#eta-2")).toHaveText(/^縺ゅ→ \d+蛻・/);
  await expect(page.locator("#locate-btn")).toBeInViewport();
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("extra蛛ｴ縺ｮ鮓ｴ逕ｺ荳荳∫岼91蜿ｷ縺袈I縺ｫ邨仙粋縺輔ｌ繧・, async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);
  await selectRoute(
    page,
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc",
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc__91蜿ｷ",
    "繝峨・繝蜑榊鴻莉｣蟠取婿髱｢"
  );

  await expect(page.locator("#dest-0")).toHaveText("繝峨・繝蜑榊鴻莉｣蟠・);
  await hhmm(page.locator("#time-0"));
  await hhmm(page.locator("#time-1"));
  await hhmm(page.locator("#time-2"));
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("extra蛛ｴ縺ｮ陬懈ｭ｣繝・・繧ｿ縺恵ase繧医ｊ蜆ｪ蜈医＆繧後ｋ", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);

  const corrected = await page.evaluate(async () => {
    const entries = await fetch("data/timetable.json").then((response) => response.json());
    const route90 = entries.find(
      (entry) =>
        entry.routeId === "鮓ｴ逕ｺ荳荳∫岼-3a81dc__90蜿ｷ" &&
        entry.direction === "驥守伐髦ｪ逾槫燕譁ｹ髱｢" &&
        entry.destination === "驥守伐髦ｪ逾槫燕"
    );
    const route80 = entries.find(
      (entry) =>
        entry.routeId === "鮓ｴ逕ｺ荳荳∫岼-3a81dc__80蜿ｷ" &&
        entry.direction === "縺ゅ∋縺ｮ讖区婿髱｢" &&
        entry.destination === "縺ゅ∋縺ｮ讖具ｼｻ螟ｩ邇句ｯｺ鬧・燕・ｽ"
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

test("荳ｻ陦ｨ遉ｺ縺ｮ遘偵き繧ｦ繝ｳ繝医→24:07縺ｮ鄙梧律00:07陦ｨ遉ｺ繧剃ｸ｡遶九☆繧・, async ({ page }) => {
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
    "蟷ｸ逕ｺ荳荳∫岼-fe1e0f",
    "蟷ｸ逕ｺ荳荳∫岼-fe1e0f__71蜿ｷ",
    "鮓ｴ逕ｺ蝗帑ｸ∫岼譁ｹ髱｢"
  );

  await expect(page.locator("#time-0")).toHaveText("23:53");
  await expect(page.locator("#eta-0")).toHaveText("2");
  await expect(page.locator("#eta-0-seconds")).toHaveText("20");
  await expect(page.locator("#time-1")).toHaveText("00:07");
  await expect(page.locator("#eta-1")).toHaveText("縺ゅ→ 16蛻・);
  expectNoBrowserErrors(errors);
});

test("蜀崎ｪｭ縺ｿ霎ｼ縺ｿ蠕後・蛛懃蕗謇縺縺大ｾｩ蜈・＠縲∝捷謨ｰ繝ｻ譁ｹ髱｢縺ｯ譛ｪ驕ｸ謚槭↓謌ｻ繧・, async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);
  await selectRoute(
    page,
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc",
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc__90蜿ｷ",
    "驥守伐髦ｪ逾槫燕譁ｹ髱｢"
  );

  await expect(page.locator("#dest-0")).toHaveText("驥守伐髦ｪ逾槫燕");
  await page.reload();

  await expect(page.locator("#stop-select")).toHaveValue("鮓ｴ逕ｺ荳荳∫岼-3a81dc");
  await expect(page.locator("#route-select")).toHaveValue("");
  await expect(page.locator("#direction-select")).toHaveValue("");
  await expect(page.locator("#overview-board")).toBeVisible();
  expectNoBrowserErrors(errors);
});

test("GPS謌仙粥譎ゅ・霑代＞鬆・0蛛懃蕗謇縺ｫ邨槭ｊ霎ｼ縺ｾ繧後ｋ", async ({ browser, baseURL }) => {
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

test("GPS諡貞凄譎ゅ・蜈ｨ蛛懃蕗謇縺九ｉ謇句虚驕ｸ謚槭〒縺阪ｋ", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    permissions: [],
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = attachErrorCollector(page);
  await page.goto("/");

  await expect(page.locator("#status-message")).toContainText(/菴咲ｽｮ諠・ｱ|迴ｾ蝨ｨ蝨ｰ/);
  await expect(page.locator("#nearby-label")).toBeHidden();
  await expect(page.locator("#locate-btn")).toBeInViewport();
  const count = await page.locator("#stop-select option").count();
  expect(count).toBeGreaterThan(10);
  expectNoBrowserErrors(errors);
  await context.close();
});

test("Service Worker v31縺ｧ繧ｪ繝輔Λ繧､繝ｳ縺ｧ繧Ｆxtra蛛ｴ91蜿ｷ繧貞茜逕ｨ縺ｧ縺阪ｋ", async ({ context, page }) => {
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
  expect(cacheNames).toContain("osaka-nextbus-v32");

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#stop-select option").first()).toBeAttached();
  await selectRoute(
    page,
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc",
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc__91蜿ｷ",
    "繝峨・繝蜑榊鴻莉｣蟠取婿髱｢"
  );
  await expect(page.locator("#dest-0")).toHaveText("繝峨・繝蜑榊鴻莉｣蟠・);
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
        entry.routeId === "鮓ｴ逕ｺ荳荳∫岼-3a81dc__71蜿ｷ" &&
        entry.direction === "縺ｪ繧薙・譁ｹ髱｢"
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

test("weekday縺縺膳erified縺ｧ繧ょｹｳ譌･荳ｭ縺ｯVerified萓ｿ繧定｡ｨ遉ｺ縺吶ｋ", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-01T10:00:00+09:00");
  await installPartial71Timetable(page, {
    weekday: ["10:05", "10:15", "10:25"],
    verifiedCalendars: ["weekday"],
  });

  await waitForData(page);
  await selectRoute(
    page,
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc",
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc__71蜿ｷ",
    "縺ｪ繧薙・譁ｹ髱｢"
  );

  await expect(page.locator("#time-0")).toHaveText("10:05");
  await expect(page.locator("#time-1")).toHaveText("10:15");
  await expect(page.locator("#time-2")).toHaveText("10:25");
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("weekday縺縺膳erified縺ｪ繧画悴遒ｺ隱榊悄譖懊・貅門ｙ荳ｭ縺ｧ豁｢縺ｾ繧・, async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-05T10:00:00+09:00");
  await installPartial71Timetable(page, {
    weekday: ["10:05", "10:15", "10:25"],
    verifiedCalendars: ["weekday"],
  });

  await waitForData(page);
  await selectRoute(
    page,
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc",
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc__71蜿ｷ",
    "縺ｪ繧薙・譁ｹ髱｢"
  );

  await expect(page.locator("#next-bus")).toBeHidden();
  await expect(page.locator("#pending-message")).toBeVisible();
  expectNoBrowserErrors(errors);
});

test("驥第屆邨ゆｾｿ蠕後・譛ｪ遏･縺ｮ騾ｱ譛ｫ繧帝｣帙・縺励※譛域屆萓ｿ繧定｡ｨ遉ｺ縺励↑縺・, async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-04T23:30:00+09:00");
  await installPartial71Timetable(page, {
    weekday: ["23:00"],
    verifiedCalendars: ["weekday"],
  });

  await waitForData(page);
  await selectRoute(
    page,
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc",
    "鮓ｴ逕ｺ荳荳∫岼-3a81dc__71蜿ｷ",
    "縺ｪ繧薙・譁ｹ髱｢"
  );

  await expect(page.locator("#next-bus")).toBeHidden();
  await expect(page.locator("#pending-message")).toBeVisible();
  expectNoBrowserErrors(errors);
});

test("runtime legacy compatibility: verifiedCalendars逵∫払縺ｮfixture entry縺ｯ蠕捺擂騾壹ｊ蜈ｨ譖懈律Verified謇ｱ縺・, async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-05T10:00:00+09:00");
  await installPartial71Timetable(page, {
    weekday: ["10:05", "10:15", "10:25"],
    verifiedCalendars: undefined,
  });

  await page.route("**/data/timetable.json", async (route) => route.continue());
  await waitForData(page);

  const verification = await page.evaluate(() => {
    const direction = BusDataSource.getDirectionsForRoute("鮓ｴ逕ｺ荳荳∫岼-3a81dc__71蜿ｷ")[0];
    const internal = BusDataSource._timetableByDirectionId.get(direction.id);
    return internal ? [...internal.verifiedCalendars] : [];
  });
  expect(verification.sort()).toEqual(["holiday", "saturday", "weekday"]);
  expectNoBrowserErrors(errors);
});

test("鮓ｴ逕ｺ莠御ｸ∫岼80蜿ｷ縺ゅ∋縺ｮ讖区婿髱｢縺ｯ蟷ｳ譌･繝ｻ蝨滓屆縺ｧ蛻ｩ逕ｨ蜿ｯ閭ｽ縲∽ｼ第律縺ｯ貅門ｙ荳ｭ縺ｸfail-closed縺吶ｋ", async ({ page }) => {
  const errors = attachErrorCollector(page);

  // 1. 蟷ｳ譌･ (2026-09-01 轣ｫ譖・10:00)
  await freezeNow(page, "2026-09-01T10:00:00+09:00");
  await waitForData(page);
  await selectRoute(
    page,
    "鮓ｴ逕ｺ莠御ｸ∫岼-89573b",
    "鮓ｴ逕ｺ莠御ｸ∫岼-89573b__80蜿ｷ",
    "縺ゅ∋縺ｮ讖区婿髱｢"
  );
  await expect(page.locator("#time-0")).toHaveText("10:12");
  await expect(page.locator("#pending-message")).toBeHidden();

  // 2. 蝨滓屆 (2026-09-05 蝨滓屆 10:00)
  await page.reload();
  await freezeNow(page, "2026-09-05T10:00:00+09:00");
  await waitForData(page);
  await selectRoute(
    page,
    "鮓ｴ逕ｺ莠御ｸ∫岼-89573b",
    "鮓ｴ逕ｺ莠御ｸ∫岼-89573b__80蜿ｷ",
    "縺ゅ∋縺ｮ讖区婿髱｢"
  );
  await expect(page.locator("#time-0")).toHaveText("10:22");
  await expect(page.locator("#pending-message")).toBeHidden();

  // 3. 莨第律 (2026-09-06 譌･譖・10:00) 窶・驛ｨ蛻・凾蛻ｻ縺後≠縺｣縺ｦ繧Ｇail-closed縺玲ｺ門ｙ荳ｭ
  await page.reload();
  await freezeNow(page, "2026-09-06T10:00:00+09:00");
  await waitForData(page);
  await selectRoute(
    page,
    "鮓ｴ逕ｺ莠御ｸ∫岼-89573b",
    "鮓ｴ逕ｺ莠御ｸ∫岼-89573b__80蜿ｷ",
    "縺ゅ∋縺ｮ讖区婿髱｢"
  );
  await expect(page.locator("#next-bus")).toBeHidden();
  await expect(page.locator("#pending-message")).toBeVisible();
  expectNoBrowserErrors(errors);
});
