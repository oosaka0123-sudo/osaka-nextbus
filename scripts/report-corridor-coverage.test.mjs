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

test("Namba 71/87 production data reports weekday verified, saturday/holiday missing", async () => {
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
      saturday: "missing",
      holiday: "missing",
    });
  }
});
