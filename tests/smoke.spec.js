const { test, expect } = require("@playwright/test");

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
  await expect(page.locator("#pending-message")).toBeHidden();
});

test("extra側の鶴町一丁目91号がUIに結合される", async ({ page }) => {
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
});

test("幸町一丁目71号の24:07を翌日00:07として表示する", async ({ page }) => {
  const fixedNow = new Date("2026-08-31T23:50:00+09:00").getTime();
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
  await expect(page.locator("#eta-0")).toHaveText("3");
  await expect(page.locator("#time-1")).toHaveText("00:07");
  await expect(page.locator("#eta-1")).toHaveText("あと 17分");
});

test("選択した停留所・系統・方面が再読み込み後も復元される", async ({ page }) => {
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
});
