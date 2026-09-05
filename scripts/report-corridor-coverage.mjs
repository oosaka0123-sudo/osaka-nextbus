#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_STOP_NAMES = [
  "なんば",
  "鶴町一丁目",
  "鶴町二丁目",
  "鶴町三丁目",
  "鶴町四丁目",
];

export const CALENDAR_TYPES = ["weekday", "saturday", "holiday"];

// verifiedCalendars省略entryはlegacy audit compatibilityとして3曜日すべてverified扱いにする。
export function normalizeVerifiedCalendars(entry) {
  if (!Array.isArray(entry?.verifiedCalendars)) return [...CALENDAR_TYPES];
  const verified = entry.verifiedCalendars.filter((calendar) => CALENDAR_TYPES.includes(calendar));
  return CALENDAR_TYPES.filter((calendar) => verified.includes(calendar));
}

const FILES = {
  stops: "data/stops.json",
  routes: "data/routes.json",
  base: "data/timetable.json",
  extra: "data/timetable-extra.json",
};

function entryKey(entry) {
  return `${entry.routeId ?? ""}\u0000${entry.direction ?? ""}\u0000${entry.destination ?? ""}`;
}

export function mergeTimetables(base, extra) {
  const merged = new Map();

  for (const entry of base) {
    merged.set(entryKey(entry), { ...entry, source: "base" });
  }

  for (const entry of extra) {
    merged.set(entryKey(entry), { ...entry, source: "extra" });
  }

  return [...merged.values()];
}

function uniqueStopByName(stops, stopName) {
  const matches = stops.filter((stop) => stop?.name === stopName);
  if (matches.length === 0) {
    throw new Error(`停留所が見つかりません: ${stopName}`);
  }
  if (matches.length > 1) {
    throw new Error(`停留所名が一意ではありません: ${stopName} (${matches.length}件)`);
  }
  return matches[0];
}

export function buildCoverageReport({ stops, routes, base, extra }, stopNames = DEFAULT_STOP_NAMES) {
  for (const [name, value] of Object.entries({ stops, routes, base, extra })) {
    if (!Array.isArray(value)) {
      throw new Error(`${name} は配列である必要があります`);
    }
  }

  const mergedTimetables = mergeTimetables(base, extra);
  const entriesByRouteId = new Map();

  for (const entry of mergedTimetables) {
    if (!entriesByRouteId.has(entry.routeId)) {
      entriesByRouteId.set(entry.routeId, []);
    }
    entriesByRouteId.get(entry.routeId).push(entry);
  }

  const reportStops = stopNames.map((stopName) => {
    const stop = uniqueStopByName(stops, stopName);
    const stopRoutes = routes
      .filter((route) => route?.stopId === stop.id)
      .sort((a, b) => String(a.label ?? "").localeCompare(String(b.label ?? ""), "ja", { numeric: true }));

    const routeReports = stopRoutes.map((route) => {
      const entries = entriesByRouteId.get(route.id) ?? [];
      const services = entries.map((entry) => {
        const verifiedCalendars = normalizeVerifiedCalendars(entry);
        const unverifiedCalendars = CALENDAR_TYPES.filter(
          (calendar) => !verifiedCalendars.includes(calendar),
        );
        return {
          direction: entry.direction,
          destination: entry.destination,
          source: entry.source,
          weekdayCount: Array.isArray(entry.weekday) ? entry.weekday.length : 0,
          saturdayCount: Array.isArray(entry.saturday) ? entry.saturday.length : 0,
          holidayCount: Array.isArray(entry.holiday) ? entry.holiday.length : 0,
          verifiedCalendars,
          unverifiedCalendars,
        };
      });

      // 曜日ごとのverification state: そのrouteの全serviceがverified扱いにしている場合のみ"verified"。
      // service自体が無い(covered=false)場合は当然すべて"missing"。
      const calendarVerification = Object.fromEntries(
        CALENDAR_TYPES.map((calendar) => [
          calendar,
          services.length > 0 && services.every((service) => service.verifiedCalendars.includes(calendar))
            ? "verified"
            : "missing",
        ]),
      );

      return {
        routeId: route.id,
        label: route.label ?? "",
        covered: entries.length > 0,
        timetableEntryCount: entries.length,
        calendarVerification,
        services,
      };
    });

    const calendarSummary = Object.fromEntries(
      CALENDAR_TYPES.map((calendar) => {
        const verified = routeReports.filter((route) => route.calendarVerification[calendar] === "verified").length;
        return [calendar, { verified, missing: routeReports.length - verified }];
      }),
    );

    return {
      stopName: stop.name,
      stopId: stop.id,
      routeAssociationCount: routeReports.length,
      coveredRouteCount: routeReports.filter((route) => route.covered).length,
      missingRouteCount: routeReports.filter((route) => !route.covered).length,
      calendarSummary,
      routes: routeReports,
    };
  });

  const totalCalendarSummary = Object.fromEntries(
    CALENDAR_TYPES.map((calendar) => [
      calendar,
      {
        verified: reportStops.reduce((sum, stop) => sum + stop.calendarSummary[calendar].verified, 0),
        missing: reportStops.reduce((sum, stop) => sum + stop.calendarSummary[calendar].missing, 0),
      },
    ]),
  );

  const candidateMap = new Map();

  for (const stopReport of reportStops) {
    for (const routeReport of stopReport.routes) {
      const label = routeReport.label;
      if (!label) continue;
      if (!candidateMap.has(label)) {
        candidateMap.set(label, []);
      }
      candidateMap.get(label).push({
        stopName: stopReport.stopName,
        routeId: routeReport.routeId,
      });
    }
  }

  const CANDIDATE_DISCLAIMER =
    "同じ系統ラベルが複数停留所に存在しても、それだけでその便が対象区間を通過することや同一方向で利用可能であることを示すものではありません。本出力は決定論的な存在棚卸し（inventory）に限定されています。";

  const routeCandidates = [...candidateMap.entries()]
    .sort(([labelA], [labelB]) => labelA.localeCompare(labelB, "ja", { numeric: true }))
    .map(([label, stopEntries]) => {
      const stopNames = stopEntries.map((e) => e.stopName);
      const stopRouteIds = Object.fromEntries(stopEntries.map((e) => [e.stopName, e.routeId]));
      return {
        label,
        stopCount: stopEntries.length,
        isShared: stopEntries.length >= 2,
        stopNames,
        stopRouteIds,
        routes: stopEntries,
      };
    });

  const sharedRouteCandidates = routeCandidates.filter((c) => c.isShared);

  return {
    generatedFrom: [FILES.stops, FILES.routes, FILES.base, FILES.extra],
    candidateNotice: CANDIDATE_DISCLAIMER,
    stopCount: reportStops.length,
    totals: {
      routeAssociations: reportStops.reduce((sum, stop) => sum + stop.routeAssociationCount, 0),
      coveredRoutes: reportStops.reduce((sum, stop) => sum + stop.coveredRouteCount, 0),
      missingRoutes: reportStops.reduce((sum, stop) => sum + stop.missingRouteCount, 0),
      routeCandidates: routeCandidates.length,
      sharedRouteCandidates: sharedRouteCandidates.length,
      mergedTimetableEntries: mergedTimetables.length,
      calendars: totalCalendarSummary,
    },
    routeCandidates,
    sharedRouteCandidates,
    stops: reportStops,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadProjectData(root = process.cwd()) {
  const [stops, routes, base, extra] = await Promise.all([
    readJson(resolve(root, FILES.stops)),
    readJson(resolve(root, FILES.routes)),
    readJson(resolve(root, FILES.base)),
    readJson(resolve(root, FILES.extra)),
  ]);
  return { stops, routes, base, extra };
}

function formatHuman(report) {
  const formatCalendarCounts = (summary) =>
    CALENDAR_TYPES.map((calendar) => `${calendar}=${summary[calendar].verified}/${summary[calendar].verified + summary[calendar].missing}`).join(" ");

  const lines = [
    "次バス大阪 — 時刻表カバレッジ監査",
    `対象停留所: ${report.stopCount}`,
    `route associations: ${report.totals.routeAssociations}`,
    `covered: ${report.totals.coveredRoutes}`,
    `missing: ${report.totals.missingRoutes}`,
    `calendar verified (verified/routes): ${formatCalendarCounts(report.totals.calendars)}`,
    "",
    "【横断系統ラベル Candidate Inventory】",
    `※ ${report.candidateNotice}`,
    `候補系統数: ${report.totals.routeCandidates} (shared: ${report.totals.sharedRouteCandidates})`,
  ];

  if (report.sharedRouteCandidates.length > 0) {
    lines.push("  [Shared Candidates (2停留所以上)]");
    for (const c of report.sharedRouteCandidates) {
      lines.push(`  - ${c.label} (${c.stopCount}停留所: ${c.stopNames.join(", ")})`);
      for (const r of c.routes) {
        lines.push(`      ${r.stopName}: ${r.routeId}`);
      }
    }
  } else {
    lines.push("  [Shared Candidates] なし");
  }

  const singleCandidates = report.routeCandidates.filter((c) => !c.isShared);
  if (singleCandidates.length > 0) {
    lines.push("  [Single Stop Candidates (1停留所のみ)]");
    for (const c of singleCandidates) {
      lines.push(`  - ${c.label} (${c.stopNames.join(", ")}) [${c.routes[0].routeId}]`);
    }
  }

  lines.push("");

  for (const stop of report.stops) {
    lines.push(`[${stop.stopName}] ${stop.stopId}`);
    lines.push(`  routes=${stop.routeAssociationCount} covered=${stop.coveredRouteCount} missing=${stop.missingRouteCount}`);
    lines.push(`  calendar verified (verified/routes): ${formatCalendarCounts(stop.calendarSummary)}`);

    if (stop.routes.length === 0) {
      lines.push("  (route associationなし)");
    }

    for (const route of stop.routes) {
      const calendarState = CALENDAR_TYPES.map(
        (calendar) => `${calendar}=${route.calendarVerification[calendar]}`,
      ).join(" ");
      lines.push(`  ${route.covered ? "COVERED" : "MISSING"} ${route.label} (${route.routeId}) [${calendarState}]`);
      for (const service of route.services) {
        lines.push(
          `    - ${service.direction} / ${service.destination} [${service.source}] ` +
            `weekday=${service.weekdayCount} saturday=${service.saturdayCount} holiday=${service.holidayCount} ` +
            `verified=${service.verifiedCalendars.join(",") || "なし"} unverified=${service.unverifiedCalendars.join(",") || "なし"}`,
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function parseArgs(argv) {
  const stopNames = [];
  let json = false;

  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, json, stopNames };
    }
    if (arg.startsWith("-")) {
      throw new Error(`未対応のオプションです: ${arg}`);
    }
    stopNames.push(arg);
  }

  return { help: false, json, stopNames };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/report-corridor-coverage.mjs [--json] [停留所名 ...]");
    console.log(`Default stops: ${DEFAULT_STOP_NAMES.join(", ")}`);
    return;
  }

  const data = await loadProjectData();
  const report = buildCoverageReport(data, args.stopNames.length > 0 ? args.stopNames : DEFAULT_STOP_NAMES);
  console.log(args.json ? JSON.stringify(report, null, 2) : formatHuman(report));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`coverage audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
