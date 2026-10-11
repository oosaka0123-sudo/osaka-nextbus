const { test, expect } = require("@playwright/test");

async function openDutyAlarmAt(page, {
  year = 2026,
  month = 8,
  day = 28,
  hour,
  minute,
  second,
  dayType = "weekday",
  dayMode = dayType,
  duty = "1¹",
  audioStub = false,
  holidays = {},
} = {}) {
  await page.route("https://holidays-jp.github.io/api/v1/date.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(holidays),
    });
  });

  await page.addInitScript((config) => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(
      config.year,
      config.month,
      config.day,
      config.hour,
      config.minute,
      config.second,
      500
    ).getTime();

    class MockDate extends OriginalDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;

    localStorage.setItem("funamachi-alarm-day-mode", config.dayMode);
    localStorage.setItem("funamachi-alarm-duty", config.duty);
    localStorage.setItem("funamachi-alarm-all", "false");
    localStorage.setItem("funamachi-alarm-sound", "beep");
    localStorage.setItem("funamachi-alarm-volume", "medium");
    localStorage.removeItem("funamachi-shift-end-fired-key");

    if (config.audioStub) {
      window.__toneStarts = 0;
      class FakeAudioContext {
        constructor() {
          this.state = "running";
          this.currentTime = 0;
          this.destination = {};
        }
        resume() {
          return Promise.resolve();
        }
        createOscillator() {
          return {
            type: "sine",
            frequency: { setValueAtTime() {} },
            connect() {},
            start() { window.__toneStarts += 1; },
            stop() {},
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime() {},
              exponentialRampToValueAtTime() {},
            },
            connect() {},
          };
        }
      }
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
    }
  }, { year, month, day, hour, minute, second, dayType, dayMode, duty, audioStub });

  await page.goto("/funamachi-alarm-v62.html");
}

test("勤務1は開始前に05:45まで秒単位でカウントダウンする", async ({ page }) => {
  await openDutyAlarmAt(page, { hour: 5, minute: 44, second: 30 });

  await expect(page.locator("#shift-countdown-title")).toHaveText("勤務1・平日");
  await expect(page.locator("#shift-countdown-hours")).toHaveText("05:45 → 14:15");
  await expect(page.locator("#shift-countdown-phase")).toHaveText("勤務開始まで");
  await expect(page.locator("#shift-countdown-value")).toHaveText("00:00:30");

  const correctOrder = await page.evaluate(() => {
    const list = document.querySelector(".alarm-list-card");
    const card = document.querySelector("#shift-countdown-card");
    const note = document.querySelector(".alarm-note");
    return Boolean(
      list && card && note &&
      (list.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (card.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  });
  expect(correctOrder).toBe(true);
});

test("勤務開始後は終了時刻までHH:MM:SSでカウントダウンする", async ({ page }) => {
  await openDutyAlarmAt(page, { hour: 5, minute: 45, second: 1 });

  await expect(page.locator("#shift-countdown-phase")).toHaveText("勤務終了まで");
  await expect(page.locator("#shift-countdown-value")).toHaveText("08:29:59");
});

test("休日4番と平日5番の確定勤務時間を表示する", async ({ page }) => {
  await openDutyAlarmAt(page, {
    hour: 10,
    minute: 0,
    second: 0,
    dayType: "holiday",
    duty: "4¹",
  });

  await expect(page.locator("#shift-countdown-title")).toHaveText("勤務4・休日");
  await expect(page.locator("#shift-countdown-hours")).toHaveText("12:25 → 20:55");

  await page.selectOption("#alarm-day", "weekday");
  await expect(page.locator("#alarm-duty-select")).toHaveValue("5¹");
  await expect(page.locator("#shift-countdown-title")).toHaveText("勤務5・平日");
  await expect(page.locator("#shift-countdown-hours")).toHaveText("12:45 → 21:15");
});

test("勤務終了時刻は既存の音設定で1回だけ鳴動する", async ({ page }) => {
  await openDutyAlarmAt(page, {
    hour: 14,
    minute: 15,
    second: 0,
    dayType: "weekday",
    duty: "1¹",
    audioStub: true,
  });

  await expect(page.locator("#shift-countdown-phase")).toHaveText("本日の勤務は終了");
  await expect(page.locator("#shift-countdown-value")).toHaveText("00:00:00");

  await page.waitForTimeout(800);
  const starts = await page.evaluate(() => window.__toneStarts);
  expect(starts).toBe(1);
});


test("日区分はデフォルト自動で平日を判定する", async ({ page }) => {
  await page.route("https://holidays-jp.github.io/api/v1/date.json", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(() => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 9, 13, 9, 0, 0, 0).getTime();
    class MockDate extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    }
    window.Date = MockDate;
    localStorage.removeItem("funamachi-alarm-day-mode");
    localStorage.setItem("funamachi-alarm-duty", "1¹");
    localStorage.setItem("funamachi-alarm-all", "false");
  });
  await page.goto("/funamachi-alarm-v62.html");

  await expect(page.locator("#alarm-day")).toHaveValue("auto");
  await expect(page.locator('#alarm-day option[value="auto"]')).toHaveText("自動（平日）");
  await expect(page.locator("#shift-countdown-title")).toContainText("平日");
});

test("平日の祝日はカレンダー取得で自動的に休日へ切り替わる", async ({ page }) => {
  await openDutyAlarmAt(page, {
    year: 2026,
    month: 9,
    day: 12,
    hour: 10,
    minute: 0,
    second: 0,
    dayMode: "auto",
    duty: "1¹",
    holidays: { "2026-10-12": "スポーツの日" },
  });

  await expect(page.locator("#alarm-day")).toHaveValue("auto");
  await expect(page.locator('#alarm-day option[value="auto"]')).toHaveText("自動（休日・スポーツの日）");
  await expect(page.locator("#shift-countdown-title")).toHaveText("勤務1・休日");
  await expect(page.locator("#shift-countdown-hours")).toHaveText("06:00 → 14:30");
});

test("土日は祝日APIに無くても自動で休日になる", async ({ page }) => {
  await openDutyAlarmAt(page, {
    year: 2026,
    month: 9,
    day: 11,
    hour: 10,
    minute: 0,
    second: 0,
    dayMode: "auto",
    duty: "1¹",
  });

  await expect(page.locator('#alarm-day option[value="auto"]')).toHaveText("自動（休日）");
  await expect(page.locator("#shift-countdown-title")).toHaveText("勤務1・休日");
});

test("日区分は手動で平日と休日へ切り替えできる", async ({ page }) => {
  await openDutyAlarmAt(page, {
    year: 2026,
    month: 9,
    day: 12,
    hour: 10,
    minute: 0,
    second: 0,
    dayMode: "auto",
    duty: "1¹",
    holidays: { "2026-10-12": "スポーツの日" },
  });

  await page.selectOption("#alarm-day", "weekday");
  await expect(page.locator("#shift-countdown-title")).toHaveText("勤務1・平日");
  await expect(page.locator("#shift-countdown-hours")).toHaveText("05:45 → 14:15");

  await page.selectOption("#alarm-day", "holiday");
  await expect(page.locator("#shift-countdown-title")).toHaveText("勤務1・休日");
  await expect(page.locator("#shift-countdown-hours")).toHaveText("06:00 → 14:30");

  await expect.poll(() => page.evaluate(() => localStorage.getItem("funamachi-alarm-day-mode"))).toBe("holiday");
});
