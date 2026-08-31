#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const FILES = {
  stops: "data/stops.json",
  routes: "data/routes.json",
  base: "data/timetable.json",
  extra: "data/timetable-extra.json",
  metadata: "data/metadata.json",
};

const calendars = ["weekday", "saturday", "holiday"];
const errors = [];
const warnings = [];

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    errors.push(`${path}: JSONの読み込みに失敗: ${error.message}`);
    return null;
  }
}

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function entryKey(entry) {
  return `${entry.routeId ?? ""}\u0000${entry.direction ?? ""}\u0000${entry.destination ?? ""}`;
}

function timeToMinutes(value) {
  const match = /^(\d{2}):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  // 大阪シティバスの深夜便表記を想定し、00:00〜29:59まで許容する。
  if (hour > 29) return null;
  return hour * 60 + minute;
}

function validateTimetableEntry(entry, index, source, routeIds) {
  const prefix = `${source}[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`${prefix}: オブジェクトではありません`);
    return;
  }

  if (!entry.routeId || typeof entry.routeId !== "string") {
    fail(`${prefix}: routeId がありません`);
  } else if (!routeIds.has(entry.routeId)) {
    fail(`${prefix}: routeId が routes.json に存在しません: ${entry.routeId}`);
  }

  if (!entry.direction || typeof entry.direction !== "string") {
    fail(`${prefix}: direction が空です`);
  }
  if (!entry.destination || typeof entry.destination !== "string") {
    fail(`${prefix}: destination が空です`);
  }

  for (const calendar of calendars) {
    const values = entry[calendar];
    if (!Array.isArray(values)) {
      fail(`${prefix}.${calendar}: 配列ではありません`);
      continue;
    }

    const seen = new Set();
    let previous = -1;
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (typeof value !== "string") {
        fail(`${prefix}.${calendar}[${i}]: 文字列ではありません`);
        continue;
      }
      const minutes = timeToMinutes(value);
      if (minutes === null) {
        fail(`${prefix}.${calendar}[${i}]: HH:MM形式が不正です: ${value}`);
        continue;
      }
      if (seen.has(value)) {
        fail(`${prefix}.${calendar}: 重複時刻があります: ${value}`);
      }
      seen.add(value);
      if (minutes < previous) {
        fail(`${prefix}.${calendar}: 時刻が昇順ではありません: ${value}`);
      }
      previous = minutes;
    }
  }
}

const [stops, routes, base, extra, metadata] = await Promise.all([
  readJson(FILES.stops),
  readJson(FILES.routes),
  readJson(FILES.base),
  readJson(FILES.extra),
  readJson(FILES.metadata),
]);

if (![stops, routes, base, extra, metadata].every(Boolean)) {
  process.exitCode = 1;
} else {
  if (!Array.isArray(stops)) fail(`${FILES.stops}: 配列ではありません`);
  if (!Array.isArray(routes)) fail(`${FILES.routes}: 配列ではありません`);
  if (!Array.isArray(base)) fail(`${FILES.base}: 配列ではありません`);
  if (!Array.isArray(extra)) fail(`${FILES.extra}: 配列ではありません`);

  const stopIds = new Set(Array.isArray(stops) ? stops.map((stop) => stop?.id).filter(Boolean) : []);
  const routeIds = new Set();

  if (Array.isArray(routes)) {
    for (let i = 0; i < routes.length; i += 1) {
      const route = routes[i];
      const prefix = `${FILES.routes}[${i}]`;
      if (!route?.id) {
        fail(`${prefix}: id がありません`);
        continue;
      }
      if (routeIds.has(route.id)) fail(`${prefix}: route id が重複しています: ${route.id}`);
      routeIds.add(route.id);
      if (!route.stopId || !stopIds.has(route.stopId)) {
        fail(`${prefix}: stopId が stops.json に存在しません: ${route.stopId ?? "(empty)"}`);
      }
    }
  }

  if (Array.isArray(base)) {
    base.forEach((entry, index) => validateTimetableEntry(entry, index, FILES.base, routeIds));
  }
  if (Array.isArray(extra)) {
    extra.forEach((entry, index) => validateTimetableEntry(entry, index, FILES.extra, routeIds));
  }

  const allEntries = [...(Array.isArray(base) ? base : []), ...(Array.isArray(extra) ? extra : [])];
  const timetableKeys = new Map();
  allEntries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const key = entryKey(entry);
    if (timetableKeys.has(key)) {
      fail(`時刻表キーが重複しています: ${entry.routeId} / ${entry.direction} / ${entry.destination}`);
    } else {
      timetableKeys.set(key, index);
    }
  });

  const coverage = metadata?.timetableSource?.coverage;
  if (!Array.isArray(coverage)) {
    fail(`${FILES.metadata}: timetableSource.coverage が配列ではありません`);
  } else if (coverage.length !== allEntries.length) {
    fail(`${FILES.metadata}: coverage件数(${coverage.length})と時刻表エントリ件数(${allEntries.length})が一致しません`);
  }

  const note = metadata?.note;
  if (typeof note !== "string" || !note.includes(`${allEntries.length}系統×方面`)) {
    warn(`${FILES.metadata}: note に現在の収録数「${allEntries.length}系統×方面」が見つかりません`);
  }

  console.log(`停留所: ${stopIds.size}件`);
  console.log(`停留所×系統: ${routeIds.size}件`);
  console.log(`時刻表: base ${Array.isArray(base) ? base.length : 0} + extra ${Array.isArray(extra) ? extra.length : 0} = ${allEntries.length}系統×方面`);
}

for (const message of warnings) console.warn(`WARN: ${message}`);
for (const message of errors) console.error(`ERROR: ${message}`);

if (errors.length > 0) {
  console.error(`\n検証FAIL: ${errors.length}件の問題`);
  process.exitCode = 1;
} else {
  console.log(`\n検証PASS${warnings.length ? `（警告${warnings.length}件）` : ""}`);
}
