import test from "node:test";
import assert from "node:assert/strict";

import { buildCoverageReport, mergeTimetables, normalizeVerifiedCalendars } from "./report-corridor-coverage.mjs";

function fixture() {
  return {
    stops: [
      { id: "stop-a", name: "停留所A" },
      { id: "stop-b", name: "停留所B" },
    ],
    routes: [
      { id: "stop-a__1号", stopId: "stop-a", label: "1号" },
      { id: "stop-a__2号", stopId: "stop-a", label: "2号" },
      { id: "stop-b__3号", stopId: "stop-b", label: "3号" },
    ],
    base: [
      {
        routeId: "stop-a__1号",
        direction: "東方面",
        destination: "東",
        weekday: ["06:00"],
        saturday: ["07:00"],
        holiday: [],
      },
    ],
    extra: [
      {
        routeId: "stop-a__1号",
        direction: "東方面",
        destination: "東",
        weekday: ["06:05"],
        saturday: ["07:05"],
        holiday: ["08:05"],
      },
      {
        routeId: "stop-b__3号",
        direction: "西方面",
        destination: "西",
        weekday: ["09:00"],
        saturday: [],
        holiday: [],
      },
    ],
  };
}

test("extra overrides the same route/direction/destination key", () => {
  const data = fixture();
  const merged = mergeTimetables(data.base, data.extra);

  assert.equal(merged.length, 2);
  const overridden = merged.find((entry) => entry.routeId === "stop-a__1号");
  assert.deepEqual(overridden.weekday, ["06:05"]);
  assert.equal(overridden.source, "extra");
});

test("report marks route associations with and without timetable coverage", () => {
  const report = buildCoverageReport(fixture(), ["停留所A"]);
  const stop = report.stops[0];

  assert.equal(stop.routeAssociationCount, 2);
  assert.equal(stop.coveredRouteCount, 1);
  assert.equal(stop.missingRouteCount, 1);

  const route1 = stop.routes.find((route) => route.label === "1号");
  const route2 = stop.routes.find((route) => route.label === "2号");
  assert.equal(route1.covered, true);
  assert.equal(route1.services[0].source, "extra");
  assert.equal(route1.services[0].holidayCount, 1);
  assert.equal(route2.covered, false);
  assert.equal(route2.timetableEntryCount, 0);
});

test("unknown stop fails closed", () => {
  assert.throws(
    () => buildCoverageReport(fixture(), ["存在しない停留所"]),
    /停留所が見つかりません/,
  );
});

test("duplicate stop names fail closed", () => {
  const data = fixture();
  data.stops.push({ id: "stop-a-duplicate", name: "停留所A" });

  assert.throws(
    () => buildCoverageReport(data, ["停留所A"]),
    /停留所名が一意ではありません/,
  );
});

test("legacy entry without verifiedCalendars is treated as all 3 calendars verified", () => {
  assert.deepEqual(normalizeVerifiedCalendars({}), ["weekday", "saturday", "holiday"]);
  assert.deepEqual(
    normalizeVerifiedCalendars({ weekday: ["06:00"], saturday: [], holiday: [] }),
    ["weekday", "saturday", "holiday"],
  );
});

test("weekday-only verifiedCalendars entry keeps only weekday verified", () => {
  assert.deepEqual(normalizeVerifiedCalendars({ verifiedCalendars: ["weekday"] }), ["weekday"]);
});

test("report marks legacy entry as fully verified across all calendars", () => {
  const report = buildCoverageReport(fixture(), ["停留所A"]);
  const route1 = report.stops[0].routes.find((route) => route.label === "1号");

  assert.deepEqual(route1.calendarVerification, {
    weekday: "verified",
    saturday: "verified",
    holiday: "verified",
  });
  assert.deepEqual(route1.services[0].verifiedCalendars, ["weekday", "saturday", "holiday"]);
  assert.deepEqual(route1.services[0].unverifiedCalendars, []);
});

test("report marks a weekday-only partial entry as saturday/holiday missing", () => {
  const data = fixture();
  data.extra[0].verifiedCalendars = ["weekday"];
  const report = buildCoverageReport(data, ["停留所A"]);
  const route1 = report.stops[0].routes.find((route) => route.label === "1号");

  assert.deepEqual(route1.calendarVerification, {
    weekday: "verified",
    saturday: "missing",
    holiday: "missing",
  });
  assert.deepEqual(route1.services[0].verifiedCalendars, ["weekday"]);
  assert.deepEqual(route1.services[0].unverifiedCalendars, ["saturday", "holiday"]);
});

test("route with no timetable entry is missing for every calendar", () => {
  const report = buildCoverageReport(fixture(), ["停留所A"]);
  const route2 = report.stops[0].routes.find((route) => route.label === "2号");

  assert.deepEqual(route2.calendarVerification, {
    weekday: "missing",
    saturday: "missing",
    holiday: "missing",
  });
});

test("stop and corridor totals summarize verified/missing counts per calendar", () => {
  const data = fixture();
  data.extra[0].verifiedCalendars = ["weekday"];
  const report = buildCoverageReport(data, ["停留所A", "停留所B"]);

  const stopA = report.stops.find((stop) => stop.stopName === "停留所A");
  assert.deepEqual(stopA.calendarSummary, {
    weekday: { verified: 1, missing: 1 },
    saturday: { verified: 0, missing: 2 },
    holiday: { verified: 0, missing: 2 },
  });

  assert.deepEqual(report.totals.calendars, {
    weekday: { verified: 2, missing: 1 },
    saturday: { verified: 1, missing: 2 },
    holiday: { verified: 1, missing: 2 },
  });
});

test("identifies shared route candidates across stops and preserves distinct routeIds per stop", () => {
  const data = fixture();
  data.routes.push({ id: "stop-b__1号", stopId: "stop-b", label: "1号" });

  const report = buildCoverageReport(data, ["停留所A", "停留所B"]);

  const shared1 = report.sharedRouteCandidates.find((c) => c.label === "1号");
  assert.ok(shared1, "1号 should be in sharedRouteCandidates");
  assert.equal(shared1.isShared, true);
  assert.equal(shared1.stopCount, 2);
  assert.deepEqual(shared1.stopNames, ["停留所A", "停留所B"]);
  assert.deepEqual(shared1.stopRouteIds, {
    停留所A: "stop-a__1号",
    停留所B: "stop-b__1号",
  });
  assert.deepEqual(shared1.routes, [
    { stopName: "停留所A", routeId: "stop-a__1号" },
    { stopName: "停留所B", routeId: "stop-b__1号" },
  ]);

  const candidate2 = report.routeCandidates.find((c) => c.label === "2号");
  assert.ok(candidate2, "2号 should be in routeCandidates");
  assert.equal(candidate2.isShared, false);
  assert.equal(candidate2.stopCount, 1);
  assert.deepEqual(candidate2.stopNames, ["停留所A"]);
  assert.deepEqual(candidate2.stopRouteIds, {
    停留所A: "stop-a__2号",
  });

  const candidate3 = report.routeCandidates.find((c) => c.label === "3号");
  assert.ok(candidate3, "3号 should be in routeCandidates");
  assert.equal(candidate3.isShared, false);
  assert.equal(candidate3.stopCount, 1);
  assert.deepEqual(candidate3.stopNames, ["停留所B"]);
  assert.deepEqual(candidate3.stopRouteIds, {
    停留所B: "stop-b__3号",
  });

  assert.equal(report.sharedRouteCandidates.length, 1);
  assert.equal(report.routeCandidates.length, 3);
  assert.ok(report.candidateNotice.includes("決定論的な存在棚卸し"));
});

test("Namba 71/87 production data reports all 3 calendars verified", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");

  const root = resolve(import.meta.dirname, "..");
  const [stops, routes, base, extra] = await Promise.all(
    ["data/stops.json", "data/routes.json", "data/timetable.json", "data/timetable-extra.json"].map(
      async (path) => JSON.parse(await readFile(resolve(root, path), "utf8")),
    ),
  );

  const report = buildCoverageReport({ stops, routes, base, extra }, ["なんば"]);
  const nambaStop = report.stops[0];

  for (const label of ["71号", "87号"]) {
    const route = nambaStop.routes.find((r) => r.label === label);
    assert.ok(route, `${label} route not found`);
    assert.equal(route.covered, true);
    assert.deepEqual(route.calendarVerification, {
      weekday: "verified",
      saturday: "verified",
      holiday: "verified",
    });
  }
});

test("Tsumori-2chome 80号 production data reports weekday/saturday verified, holiday missing", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");

  const root = resolve(import.meta.dirname, "..");
  const [stops, routes, base, extra] = await Promise.all(
    ["data/stops.json", "data/routes.json", "data/timetable.json", "data/timetable-extra.json"].map(
      async (path) => JSON.parse(await readFile(resolve(root, path), "utf8")),
    ),
  );

  const report = buildCoverageReport({ stops, routes, base, extra }, ["鶴町二丁目"]);
  const tsumori2Stop = report.stops[0];

  const route = tsumori2Stop.routes.find((r) => r.label === "80号");
  assert.ok(route, "80号 route not found");
  assert.equal(route.covered, true);
  assert.deepEqual(route.calendarVerification, {
    weekday: "verified",
    saturday: "verified",
    holiday: "missing",
  });
});

test("Sho-un-bashi 71 production data keeps all 6 official calendars", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const root = resolve(import.meta.dirname, "..");
  const load = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
  const [stops, routes, base, extra] = await Promise.all([
    load("data/stops.json"), load("data/routes.json"), load("data/timetable.json"), load("data/timetable-extra.json"),
  ]);
  const routeId = "昌運橋-b5ace8__71号";
  const rows = extra.filter((entry) => entry.routeId === routeId);
  assert.equal(rows.length, 2);
  const namba = rows.find((entry) => entry.direction === "なんば方面");
  const tsuru = rows.find((entry) => entry.direction === "鶴町四丁目方面");
  assert.deepEqual([namba.weekday.length, namba.saturday.length, namba.holiday.length], [119, 142, 133]);
  assert.deepEqual([tsuru.weekday.length, tsuru.saturday.length, tsuru.holiday.length], [125, 143, 136]);
  assert.deepEqual([namba.weekday[0], namba.saturday[0], namba.holiday[0]], ["05:19", "05:30", "05:38"]);
  assert.deepEqual([tsuru.weekday[0], tsuru.saturday[0], tsuru.holiday[0]], ["06:28", "06:38", "06:46"]);
  assert.deepEqual(tsuru.weekday.slice(-3), ["24:07", "24:18", "24:32"]);
  const report = buildCoverageReport({ stops, routes, base, extra }, ["昌運橋"]);
  const route = report.stops[0].routes.find((entry) => entry.label === "71号");
  assert.equal(route.covered, true);
  assert.deepEqual(route.calendarVerification, { weekday: "verified", saturday: "verified", holiday: "verified" });
});


test("Tsurumachi-4 71/87 production data keeps all official calendars", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const root = resolve(import.meta.dirname, "..");
  const load = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
  const [stops, routes, base, extra] = await Promise.all([
    load("data/stops.json"), load("data/routes.json"), load("data/timetable.json"), load("data/timetable-extra.json"),
  ]);
  const byId = Object.fromEntries(extra.filter((x) => x.routeId.startsWith("鶴町四丁目-41063c__")).map((x) => [x.routeId, x]));
  const r71 = byId["鶴町四丁目-41063c__71号"];
  const r87 = byId["鶴町四丁目-41063c__87号"];
  assert.deepEqual([r71.weekday.length, r71.saturday.length, r71.holiday.length], [119, 142, 133]);
  assert.deepEqual([r87.weekday.length, r87.saturday.length, r87.holiday.length], [37, 33, 27]);
  assert.deepEqual([r71.weekday[0], r71.saturday[0], r71.holiday[0]], ["05:15", "05:26", "05:34"]);
  assert.deepEqual([r87.weekday[0], r87.saturday[0], r87.holiday[0]], ["05:20", "06:10", "07:13"]);
  assert.deepEqual(r71.verifiedCalendars, ["weekday", "saturday", "holiday"]);
  assert.deepEqual(r87.verifiedCalendars, ["weekday", "saturday", "holiday"]);
  const report = buildCoverageReport({ stops, routes, base, extra }, ["鶴町四丁目"]);
  for (const label of ["71号", "87号"]) {
    const route = report.stops[0].routes.find((x) => x.label === label);
    assert.equal(route.covered, true);
    assert.deepEqual(route.calendarVerification, { weekday: "verified", saturday: "verified", holiday: "verified" });
  }
});
