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

async function selectSangenyaRoute(page, directionText) {
  await page.selectOption("#stop-select", "三軒家-b098ae");
  await expect(page.locator('#route-select option[value="三軒家-b098ae__71号"]')).toBeAttached();
  await page.selectOption("#route-select", "三軒家-b098ae__71号");
  const option = page.locator("#direction-select option", { hasText: directionText }).first();
  await expect(option).toBeAttached();
  await page.selectOption("#direction-select", await option.getAttribute("value"));
}

test("三軒家71号なんば方面・鶴町四丁目方面のVerified 3曜日データをproduction merge後も保持する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await waitForData(page);

  const data = await page.evaluate(async () => {
    const entries = await fetch("data/timetable.json").then((response) => response.json());
    const toNamba = entries.find(
      (entry) =>
        entry.routeId === "三軒家-b098ae__71号" &&
        entry.direction === "なんば方面" &&
        entry.destination === "なんば"
    );
    const toTsurumachi = entries.find(
      (entry) =>
        entry.routeId === "三軒家-b098ae__71号" &&
        entry.direction === "鶴町四丁目方面" &&
        entry.destination === "鶴町四丁目"
    );
    return { toNamba, toTsurumachi };
  });

  expect(data.toNamba.weekday).toHaveLength(119);
  expect(data.toNamba.saturday).toHaveLength(142);
  expect(data.toNamba.holiday).toHaveLength(133);
  expect(data.toNamba.verifiedCalendars).toEqual(["weekday", "saturday", "holiday"]);

  expect(data.toTsurumachi.weekday).toHaveLength(125);
  expect(data.toTsurumachi.saturday).toHaveLength(143);
  expect(data.toTsurumachi.holiday).toHaveLength(136);
  expect(data.toTsurumachi.verifiedCalendars).toEqual(["weekday", "saturday", "holiday"]);

  expect(data.toTsurumachi.weekday).toContain("24:02");
  expect(data.toTsurumachi.weekday).toContain("24:16");
  expectNoBrowserErrors(errors);
});

test("三軒家71号なんば方面は平日07:00から07:06 07:13 07:21を表示する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-04T07:00:00+09:00");
  await waitForData(page);
  await selectSangenyaRoute(page, "なんば方面");

  await expect(page.locator("#dest-0")).toHaveText("なんば");
  await expect(page.locator("#time-0")).toHaveText("07:06");
  await expect(page.locator("#time-1")).toHaveText("07:13");
  await expect(page.locator("#time-2")).toHaveText("07:21");
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("三軒家71号なんば方面は土曜10:00から10:04 10:09 10:14を表示する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-05T10:00:00+09:00");
  await waitForData(page);
  await selectSangenyaRoute(page, "なんば方面");

  await expect(page.locator("#dest-0")).toHaveText("なんば");
  await expect(page.locator("#time-0")).toHaveText("10:04");
  await expect(page.locator("#time-1")).toHaveText("10:09");
  await expect(page.locator("#time-2")).toHaveText("10:14");
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("三軒家71号鶴町四丁目方面は休日07:10から07:24 07:40 07:50を表示する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-06T07:10:00+09:00");
  await waitForData(page);
  await selectSangenyaRoute(page, "鶴町四丁目方面");

  await expect(page.locator("#dest-0")).toHaveText("鶴町四丁目");
  await expect(page.locator("#time-0")).toHaveText("07:24");
  await expect(page.locator("#time-1")).toHaveText("07:40");
  await expect(page.locator("#time-2")).toHaveText("07:50");
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});

test("三軒家71号鶴町四丁目方面の平日深夜24:02/24:16を翌日00:02/00:16として表示する", async ({ page }) => {
  const errors = attachErrorCollector(page);
  await freezeNow(page, "2026-09-04T23:48:00+09:00");
  await waitForData(page);
  await selectSangenyaRoute(page, "鶴町四丁目方面");

  await expect(page.locator("#time-0")).toHaveText("23:51");
  await expect(page.locator("#eta-0")).toHaveText("3");
  await expect(page.locator("#eta-0-seconds")).toHaveText("00");
  await expect(page.locator("#time-1")).toHaveText("00:02");
  await expect(page.locator("#eta-1")).toHaveText("あと 14分");
  await expect(page.locator("#time-2")).toHaveText("00:16");
  await expect(page.locator("#eta-2")).toHaveText("あと 28分");
  await expect(page.locator("#pending-message")).toBeHidden();
  expectNoBrowserErrors(errors);
});
