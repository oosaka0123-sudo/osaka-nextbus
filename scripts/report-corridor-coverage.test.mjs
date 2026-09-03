import test from "node:test";
import assert from "node:assert/strict";

import { buildCoverageReport, mergeTimetables } from "./report-corridor-coverage.mjs";

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
