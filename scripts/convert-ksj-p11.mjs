#!/usr/bin/env node
/**
 * scripts/convert-ksj-p11.mjs
 * ---------------------------------------------------------
 * 国土交通省「国土数値情報(バス停留所データ / P11)」の GeoJSON を、
 * このアプリの data/stops.json 形式(name/lat/lon)に変換するスクリプト。
 *
 * 依存パッケージなし。Node.js だけで動作する(`node scripts/convert-ksj-p11.mjs ...`)。
 *
 * 入力データの入手先(合法的な公開データのみ):
 *   https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11.html
 *   大阪府のデータを GeoJSON (UTF-8) 形式でダウンロードしてください。
 *   ※ Shapefile(.shp一式)は本スクリプトでは扱いません。GeoJSON を選択してください。
 *
 * KSJ P11 の属性名(事業者名・停留所名などのキー)はバージョンや変換ツールにより
 * 表記ゆれがあるため、このスクリプトはまず --inspect でキー名を確認してから、
 * 実際のキー名を指定して変換する2段階の使い方を想定しています。
 *
 * 【1. まず中身を確認する】
 *   node scripts/convert-ksj-p11.mjs --inspect --input path/to/P11-xx_27.geojson
 *   → 属性キー一覧と先頭数件のサンプル値が表示される。
 *
 * 【1.5 事業者名の表記ゆれを確認する(--inspectでキー名を確認した後)】
 *   node scripts/convert-ksj-p11.mjs --list-operators --input path/to/P11-xx_27.geojson --operator-field "P11_003"
 *   → 事業者名フィールドに含まれる値を件数の多い順にすべて表示する。
 *     「大阪シティバス株式会社」「大阪市高速電気軌道株式会社」等、
 *     表記のゆれ(全角/半角、㈱と株式会社、旧社名など)がないか目視で確認してから
 *     --operator に渡す値を決めること。
 *
 * 【2. 事業者名フィールドと停留所名フィールドを指定して変換する】
 *   node scripts/convert-ksj-p11.mjs \
 *     --input path/to/P11-xx_27.geojson \
 *     --output ../data/stops.json \
 *     --name-field "P11_001" \
 *     --operator-field "P11_003" \
 *     --operator "大阪シティバス,大阪市高速電気軌道,Osaka Metro"
 *
 *   --operator はカンマ区切りで複数指定可。事業者名フィールドの値に、
 *   指定した文字列のいずれかが「部分一致」すればそのバス停を採用する
 *   (全角/半角の違いはNFKC正規化してから比較するため、表記ゆれにある程度強い)。
 *
 *   --name-field / --operator-field は【必須】(自動推定はしない)。
 *   実際のキー名によって停留所を誤判定すると誤ったデータが配信されてしまうため、
 *   必ず --inspect で内容を確認したうえで、正しいキー名を明示的に指定すること。
 *
 *   出力する停留所には、名前と座標から決定論的に計算した安定IDを付与する
 *   (配列の並び順に依存しないため、後から --routes-output で生成する
 *   routes.json との stopId 参照が壊れない)。
 *
 * 【3. 系統情報(routes.json)も同時に生成する場合】
 *   --routes-field <キー> --routes-output <出力先> を追加で指定する。
 *   指定したフィールドの値を "," 区切りで分割し、(停留所, 系統)ごとに
 *   1行の routes.json エントリを生成する。KSJ P11 には系統の行き先・方面
 *   情報は含まれていないため、label/destination には系統番号の文字列を
 *   そのまま使う(架空の行き先を作らない)。
 *
 *   node scripts/convert-ksj-p11.mjs \
 *     --input path/to/P11-xx_27.geojson \
 *     --output ../data/stops.json \
 *     --name-field "P11_001" --operator-field "P11_002" --operator "大阪シティバス" \
 *     --routes-field "P11_003_01" --routes-output ../data/routes.json
 *
 * 大阪シティバスの事業者名として想定される表記ゆれの例:
 *   "大阪シティバス株式会社" (2018年の民営化後の正式名称)
 *   "大阪市高速電気軌道株式会社" (Osaka Metro。地下鉄の運営会社で、バス事業を
 *     大阪シティバスに委託している関係上、データ上の事業者名として
 *     こちらが使われている可能性がある)
 *   "大阪市交通局" (2018年の民営化以前の旧名称。データの整備時期によっては
 *     残っている可能性がある)
 * --operator にはこれらをカンマ区切りで複数渡し、--list-operators で
 * 実際の表記を確認してから最終決定すること。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

function parseArgs(argv) {
  const args = { operator: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--inspect") args.inspect = true;
    else if (a === "--list-operators") args.listOperators = true;
    else if (a === "--input") args.input = argv[++i];
    else if (a === "--output") args.output = argv[++i];
    else if (a === "--name-field") args.nameField = argv[++i];
    else if (a === "--operator-field") args.operatorField = argv[++i];
    else if (a === "--operator") args.operator = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--routes-field") args.routesField = argv[++i];
    else if (a === "--routes-output") args.routesOutput = argv[++i];
  }
  return args;
}

/** 停留所名+座標から、配列の並び順に依存しない安定したIDを生成する */
function stableStopId(name, lat, lon) {
  const base = String(name)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const hash = createHash("md5").update(`${lat.toFixed(6)},${lon.toFixed(6)}`).digest("hex").slice(0, 6);
  return `${base || "stop"}-${hash}`;
}

/** 系統番号を安全にID化する(記号を含みうるため) */
function slugifyRoute(route) {
  return String(route)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** 全角/半角等の表記ゆれを吸収するため、比較前にNFKC正規化・前後空白除去する */
function normalizeForMatch(str) {
  return String(str).normalize("NFKC").trim();
}

function listOperators(features, operatorField) {
  const counts = new Map();
  for (const f of features) {
    const value = f.properties && f.properties[operatorField];
    if (value == null || value === "") continue;
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`事業者名フィールド "${operatorField}" に含まれる値(件数の多い順):`);
  for (const [value, count] of sorted) {
    console.log(`  ${count}件: "${value}"`);
  }
}

function loadFeatures(inputPath) {
  const raw = readFileSync(inputPath, "utf-8");
  const geojson = JSON.parse(raw);
  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error("入力ファイルは GeoJSON FeatureCollection ではありません");
  }
  return geojson.features;
}

function getPointLatLon(feature) {
  const geom = feature.geometry;
  if (!geom || geom.type !== "Point" || !Array.isArray(geom.coordinates)) return null;
  const [lon, lat] = geom.coordinates;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  return { lat, lon };
}

function inspect(features) {
  const sample = features.slice(0, 5);
  const keys = new Set();
  for (const f of sample) Object.keys(f.properties || {}).forEach((k) => keys.add(k));

  console.log(`features: ${features.length} 件`);
  console.log(`属性キー: ${[...keys].join(", ")}`);
  console.log("");
  console.log("先頭5件のサンプル:");
  for (const f of sample) {
    console.log(JSON.stringify(f.properties, null, 2));
  }

  // カーディナリティによる自動推定ヒント
  const allKeys = new Set();
  for (const f of features) Object.keys(f.properties || {}).forEach((k) => allKeys.add(k));
  console.log("");
  console.log("--- フィールド推定ヒント(値の種類数 / 全体件数) ---");
  for (const key of allKeys) {
    const values = features.map((f) => f.properties && f.properties[key]).filter((v) => v != null);
    const distinct = new Set(values.map(String));
    console.log(`${key}: ${distinct.size} 種類 / ${values.length} 件`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("使い方: node scripts/convert-ksj-p11.mjs --input <geojsonファイル> [--inspect] [--list-operators --operator-field <キー>] [--output <出力先>] [--name-field <キー>] [--operator-field <キー>] [--operator <事業者名,...>] [--routes-field <キー> --routes-output <出力先>]");
    process.exit(1);
  }

  const features = loadFeatures(args.input);

  if (args.inspect) {
    inspect(features);
    return;
  }

  if (args.listOperators) {
    if (!args.operatorField) {
      console.error("--list-operators には --operator-field の指定が必要です。");
      process.exit(1);
    }
    listOperators(features, args.operatorField);
    return;
  }

  if (!args.nameField) {
    console.error("--name-field が指定されていません。まず --inspect で属性キー名を確認してから指定してください。");
    process.exit(1);
  }
  if (args.operator.length > 0 && !args.operatorField) {
    console.error("--operator を指定する場合は --operator-field も指定してください。");
    process.exit(1);
  }

  const nameField = args.nameField;
  const operatorField = args.operatorField;

  console.log(`使用フィールド: name-field="${nameField}", operator-field="${operatorField || "(なし/フィルタしない)"}"`);

  const operatorFilters = args.operator.length > 0 ? args.operator : null;

  const stops = [];
  const routes = [];
  const seenStops = new Set();
  const seenRoutes = new Set();
  let skippedByOperator = 0;
  let skippedByGeometry = 0;

  for (const feature of features) {
    const props = feature.properties || {};
    const name = props[nameField];
    if (!name) continue;

    if (operatorFilters && operatorField) {
      const operatorValue = normalizeForMatch(props[operatorField] || "");
      const matched = operatorFilters.some((f) => operatorValue.includes(normalizeForMatch(f)));
      if (!matched) {
        skippedByOperator++;
        continue;
      }
    }

    const point = getPointLatLon(feature);
    if (!point) {
      skippedByGeometry++;
      continue;
    }

    const dedupeKey = `${name}@${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
    const stopId = stableStopId(String(name), point.lat, point.lon);

    if (!seenStops.has(dedupeKey)) {
      seenStops.add(dedupeKey);
      stops.push({ id: stopId, name: String(name), lat: point.lat, lon: point.lon });
    }

    if (args.routesField) {
      const raw = props[args.routesField];
      if (raw) {
        const routeNames = String(raw)
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "");
        for (const routeName of routeNames) {
          const routeId = `${stopId}__${slugifyRoute(routeName)}`;
          if (seenRoutes.has(routeId)) continue;
          seenRoutes.add(routeId);
          routes.push({ id: routeId, stopId, label: routeName, destination: routeName });
        }
      }
    }
  }

  console.log(`変換結果: 停留所 ${stops.length} 件を採用 (事業者不一致で除外: ${skippedByOperator}件, 座標不正で除外: ${skippedByGeometry}件)`);

  const outputPath = args.output || "stops.json";
  writeFileSync(outputPath, JSON.stringify(stops, null, 2) + "\n", "utf-8");
  console.log(`書き出し完了: ${outputPath}`);

  if (args.routesField) {
    if (!args.routesOutput) {
      console.error("--routes-field を指定する場合は --routes-output も指定してください。");
      process.exit(1);
    }
    console.log(`変換結果: 系統(停留所×系統番号) ${routes.length} 件を採用`);
    writeFileSync(args.routesOutput, JSON.stringify(routes, null, 2) + "\n", "utf-8");
    console.log(`書き出し完了: ${args.routesOutput}`);
    console.log("注意: KSJ P11 には行き先・方面の情報が含まれていないため、label/destination には系統番号をそのまま使用しています。");
  }
}

main();
