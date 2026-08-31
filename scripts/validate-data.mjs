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

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function entryKey(entry) {
  return `${entry.routeId ?? ""}\u0000${entry.direction ?? ""}\u0000${entry.destination ?? ""}`;
}

function normalizeCoverageStopName(value) {
  return String(value ?? "")
    .trim()
    .replace(/[（(][^（）()]+[）)]$/, "")
    .trim();
}

function normalizeCoverageValue(value) {
  return String(value ?? "").trim();
}

function coverageKey(stop, route, direction, destination) {
  return `${normalizeCoverageStopName(stop)}\u0000${normalizeCoverageValue(route)}\u0000${normalizeCoverageValue(direction)}\u0000${normalizeCoverageValue(destination)}`;
}

function timeToMinutes(value) {
  const match = /^(\d{2}):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
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

function validateUniqueEntryKeys(entries, source) {
  const seen = new Set();
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const key = entryKey(entry);
    if (seen.has(key)) {
      fail(`${source}[${i}]: 同一 routeId + direction + destination がファイル内で重複しています: ${entry.routeId} / ${entry.direction} / ${entry.destination}`);
    }
    seen.add(key);
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

  const stopIds = new Set();
  const stopById = new Map();

  if (Array.isArray(stops)) {
    for (let i = 0; i < stops.length; i += 1) {
      const stop = stops[i];
      const prefix = `${FILES.stops}[${i}]`;
      if (!stop || typeof stop !== "object" || Array.isArray(stop)) {
        fail(`${prefix}: オブジェクトではありません`);
        continue;
      }
      if (!stop.name || typeof stop.name !== "string") {
        fail(`${prefix}: name が空です`);
      }
      if (typeof stop.lat !== "number" || !Number.isFinite(stop.lat) || stop.lat < -90 || stop.lat > 90) {
        fail(`${prefix}: lat が不正です: ${stop.lat}`);
      }
      if (typeof stop.lon !== "number" || !Number.isFinite(stop.lon) || stop.lon < -180 || stop.lon > 180) {
        fail(`${prefix}: lon が不正です: ${stop.lon}`);
      }

      if (!stop.id) {
        warn(`${prefix}: id が省略されています（実データでは安定性のため明示推奨）`);
        continue;
      }
      if (typeof stop.id !== "string") {
        fail(`${prefix}: id が文字列ではありません`);
        continue;
      }
      if (stopIds.has(stop.id)) {
        fail(`${prefix}: stop id が重複しています: ${stop.id}`);
        continue;
      }
      stopIds.add(stop.id);
      stopById.set(stop.id, stop);
    }
  }

  const routeIds = new Set();
  const routeById = new Map();

  if (Array.isArray(routes)) {
    for (let i = 0; i < routes.length; i += 1) {
      const route = routes[i];
      const prefix = `${FILES.routes}[${i}]`;
      if (!route || typeof route !== "object" || Array.isArray(route)) {
        fail(`${prefix}: オブジェクトではありません`);
        continue;
      }
      if (!route.id || typeof route.id !== "string") {
        fail(`${prefix}: id がありません`);
        continue;
      }
      if (routeIds.has(route.id)) fail(`${prefix}: route id が重複しています: ${route.id}`);
      routeIds.add(route.id);
      routeById.set(route.id, route);
      if (!route.stopId || !stopIds.has(route.stopId)) {
        fail(`${prefix}: stopId が stops.json に存在しません: ${route.stopId ?? "(empty)"}`);
      }
      if (!route.label || typeof route.label !== "string") {
        fail(`${prefix}: label が空です`);
      }
    }
  }

  if (Array.isArray(base)) {
    base.forEach((entry, index) => validateTimetableEntry(entry, index, FILES.base, routeIds));
    validateUniqueEntryKeys(base, FILES.base);
  }
  if (Array.isArray(extra)) {
    extra.forEach((entry, index) => validateTimetableEntry(entry, index, FILES.extra, routeIds));
    validateUniqueEntryKeys(extra, FILES.extra);
  }

  const mergedByKey = new Map();
  for (const entry of Array.isArray(base) ? base : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    mergedByKey.set(entryKey(entry), entry);
  }
  let overrideCount = 0;
  for (const entry of Array.isArray(extra) ? extra : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const key = entryKey(entry);
    if (mergedByKey.has(key)) overrideCount += 1;
    mergedByKey.set(key, entry);
  }
  const allEntries = [...mergedByKey.values()];

  const coverage = metadata?.timetableSource?.coverage;
  if (!Array.isArray(coverage)) {
    fail(`${FILES.metadata}: timetableSource.coverage が配列ではありません`);
  } else {
    if (coverage.length !== allEntries.length) {
      fail(`${FILES.metadata}: coverage件数(${coverage.length})と結合後時刻表エントリ件数(${allEntries.length})が一致しません`);
    }

    const coverageKeys = new Set();
    for (let i = 0; i < coverage.length; i += 1) {
      const item = coverage[i];
      const prefix = `${FILES.metadata}.timetableSource.coverage[${i}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        fail(`${prefix}: オブジェクトではありません`);
        continue;
      }
      if (![item.stop, item.route, item.direction, item.destination].every(isNonEmptyString)) {
        fail(`${prefix}: stop / route / direction / destination は空でない文字列で指定してください`);
        continue;
      }
      if (!item.note || typeof item.note !== "string") {
        warn(`${prefix}: note が空です`);
      }
      const key = coverageKey(item.stop, item.route, item.direction, item.destination);
      if (coverageKeys.has(key)) {
        fail(`${prefix}: coverageが重複しています: ${item.stop} / ${item.route} / ${item.direction} / ${item.destination}`);
      }
      coverageKeys.add(key);
    }

    for (const entry of allEntries) {
      if (!entry || typeof entry !== "object") continue;
      const route = routeById.get(entry.routeId);
      const stop = route ? stopById.get(route.stopId) : null;
      if (!route || !stop) continue;
      const expectedKey = coverageKey(stop.name, route.label, entry.direction, entry.destination);
      if (!coverageKeys.has(expectedKey)) {
        fail(`metadata coverageに対応行がありません: ${stop.name} / ${route.label} / ${entry.direction} / ${entry.destination}`);
      }
    }
  }

  const note = metadata?.note;
  if (typeof note !== "string" || !note.includes(`${allEntries.length}系統×方面`)) {
    warn(`${FILES.metadata}: note に現在の収録数「${allEntries.length}系統×方面」が見つかりません`);
  }

  if (typeof metadata?.lastUpdated !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.lastUpdated)) {
    fail(`${FILES.metadata}: lastUpdated は YYYY-MM-DD 形式で指定してください`);
  }

  console.log(`停留所: ${stopIds.size}件`);
  console.log(`停留所×系統: ${routeIds.size}件`);
  console.log(`時刻表: base ${Array.isArray(base) ? base.length : 0} + extra ${Array.isArray(extra) ? extra.length : 0}（上書き ${overrideCount}） = 結合後 ${allEntries.length}系統×方面`);
}

for (const message of warnings) console.warn(`WARN: ${message}`);
for (const message of errors) console.error(`ERROR: ${message}`);

if (errors.length > 0) {
  console.error(`\n検証FAIL: ${errors.length}件の問題`);
  process.exitCode = 1;
} else {
  console.log(`\n検証PASS${warnings.length ? `（警告${warnings.length}件）` : ""}`);
}
