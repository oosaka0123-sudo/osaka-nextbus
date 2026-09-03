import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runValidatorWithMutation(mutate) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nextbus-partial-calendar-"));
  try {
    await cp(path.join(repoRoot, "data"), path.join(root, "data"), { recursive: true });
    await mkdir(path.join(root, "scripts"), { recursive: true });
    await cp(
      path.join(repoRoot, "scripts", "validate-data.mjs"),
      path.join(root, "scripts", "validate-data.mjs")
    );

    const timetablePath = path.join(root, "data", "timetable.json");
    const entries = JSON.parse(await readFile(timetablePath, "utf8"));
    assert.ok(entries.length > 0, "production timetable fixture must contain an entry");
    mutate(entries[0]);
    await writeFile(timetablePath, JSON.stringify(entries), "utf8");

    return spawnSync(process.execPath, ["scripts/validate-data.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function makeWeekdayOnly(entry) {
  entry.verifiedCalendars = ["weekday"];
  entry.saturday = [];
  entry.holiday = [];
}

test("weekday-only verified entry is accepted", async () => {
  const result = await runValidatorWithMutation(makeWeekdayOnly);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("verifiedCalendars must be an array", async () => {
  const result = await runValidatorWithMutation((entry) => {
    entry.verifiedCalendars = "weekday";
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verifiedCalendars: 配列ではありません/);
});

test("unknown calendar label is rejected", async () => {
  const result = await runValidatorWithMutation((entry) => {
    makeWeekdayOnly(entry);
    entry.verifiedCalendars.push("special");
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /未知の曜日区分/);
});

test("duplicate verified calendar is rejected", async () => {
  const result = await runValidatorWithMutation((entry) => {
    makeWeekdayOnly(entry);
    entry.verifiedCalendars.push("weekday");
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verifiedCalendars: 重複があります: weekday/);
});

test("times under an unverified calendar are rejected", async () => {
  const result = await runValidatorWithMutation((entry) => {
    makeWeekdayOnly(entry);
    entry.saturday = ["12:34"];
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /saturday: 未確認曜日なのに時刻が登録されています/);
});
