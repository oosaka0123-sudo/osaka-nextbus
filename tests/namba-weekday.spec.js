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

async function waitForData(page) {
  await page.goto("/");
  await expect(page.locator("#stop-select option").first()).toBeAttached();
}

async function selectNambaRoute(page, routeId, directionText) {
  await page.selectOption("#stop-select", "なんば-4c8868");
  await expect(page.locator(`#route-select option[value="${routeId}"]`)).toBeAttached();
  await page.selectOption("#route-select", routeId);
  const option = page.locator("#direction-select option", { hasText: directionText }).first();
  await expect(option).toBeAttached();
  await page.selectOption("#direction-select", await option.getAttribute("value"));
}

test("なんば71/87のVerified平日raw分離をproduction merge後も保持する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);

  const data = await page.evaluate(async () => {
    const entries = await fetch("data/timetable.json").then((response) => response.json());
    const route71 = entries.find(
      (entry) =>
        entry.routeId === "なんば-4c8868__71号" &&
        entry.direction === "鶴町四丁目方面" &&
        entry.destination === "鶴町四丁目"
    );
    const route87 = entries.find(
      (entry) =>
        entry.routeId === "なんば-4c8868__87号" &&
        entry.direction === "新千歳経由・鶴町四丁目方面" &&
        entry.destination === "鶴町四丁目"
    );
    return { route71, route87 };
  });

  expect(data.route71.weekday).toHaveLength(125);
  expect(data.route87.weekday).toHaveLength(36);
  expect(data.route71.verifiedCalendars).toEqual(["weekday"]);
  expect(data.route87.verifiedCalendars).toEqual(["weekday"]);
  expect(data.route71.saturday).toEqual([]);
  expect(data.route71.holiday).toEqual([]);
  expect(data.route87.saturday).toEqual([]);
  expect(data.route87.holiday).toEqual([]);

  expect(data.route71.weekday).toContain("07:02");
  expect(data.route71.weekday).toContain("08:00");
  expect(data.route71.weekday).toContain("08:57");
  expect(data.route71.weekday).toContain("19:03");
  expect(data.route71.weekday).toContain("24:02");
  expect(data.route71.weekday).not.toContain("08:22");

  expect(data.route87.weekday).toContain("08:22");
  expect(data.route87.weekday).toContain("10:36");
  expect(data.route87.weekday).toContain("17:25");
  expect(data.route87.weekday).not.toContain("08:00");
  expectNoBrowserErrors(errors);
});

test("なんば71号は平日07:00から07:02 07:10 07:19を表示する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-04T07:00:00+09:00");
  await waitForData(page);
  await selectNambaRoute(page, "なんば-4c8868__71号", "鶴町四丁目方面");

  await expect(page.locator("#dest-0")).toHaveText("鶴町四丁目");
  await expect(page.locator("#time-0")).toHaveText("07:02");
  await expect(page.locator("#time-1")).toHaveText("07:10");
  await expect(page.locator("#time-2")).toHaveText("07:19");
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("なんば87号は平日08:20から08:22 08:41 09:01を表示する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-04T08:20:00+09:00");
  await waitForData(page);
  await selectNambaRoute(page, "なんば-4c8868__87号", "新千歳経由・鶴町四丁目方面");

  await expect(page.locator("#dest-0")).toHaveText("鶴町四丁目");
  await expect(page.locator("#time-0")).toHaveText("08:22");
  await expect(page.locator("#time-1")).toHaveText("08:41");
  await expect(page.locator("#time-2")).toHaveText("09:01");
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("なんば71号の平日深夜00:02をservice-day 24:02として表示できる", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-04T23:50:00+09:00");
  await waitForData(page);
  await selectNambaRoute(page, "なんば-4c8868__71号", "鶴町四丁目方面");

  await expect(page.locator("#time-0")).toHaveText("00:02");
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("なんば71号は未確認土曜に入ると月曜へ飛ばず準備中を表示する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-05T10:00:00+09:00");
  await waitForData(page);
  await selectNambaRoute(page, "なんば-4c8868__71号", "鶴町四丁目方面");

  await expect(page.locator("#next-bus")).toBeHidden();
  await expect(page.locator("#pending-message")).toBeVisible();
  expectNoBrowserErrors(errors);
});
