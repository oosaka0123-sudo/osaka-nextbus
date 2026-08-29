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
 * 【2. 事業者名フィールドと停留所名フィールドを指定して変換する】
 *   node scripts/convert-ksj-p11.mjs \
 *     --input path/to/P11-xx_27.geojson \
 *     --output ../data/stops.json \
 *     --name-field "P11_001" \
 *     --operator-field "P11_003" \
 *     --operator "大阪シティバス,大阪市高速電気軌道,Osaka Metro"
 *
 *   --operator はカンマ区切りで複数指定可。事業者名フィールドの値に、
 *   指定した文字列のいずれかが「部分一致」すればそのバス停を採用する。
 *
 *   --name-field / --operator-field は【必須】(自動推定はしない)。
 *   実際のキー名によって停留所を誤判定すると誤ったデータが配信されてしまうため、
 *   必ず --inspect で内容を確認したうえで、正しいキー名を明示的に指定すること。
 */

import { readFileSync, writeFileSync } from "node:fs";

function parseArgs(argv) {
  const args = { operator: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--inspect") args.inspect = true;
    else if (a === "--input") args.input = argv[++i];
    else if (a === "--output") args.output = argv[++i];
    else if (a === "--name-field") args.nameField = argv[++i];
    else if (a === "--operator-field") args.operatorField = argv[++i];
    else if (a === "--operator") args.operator = argv[++i].split(",").map((s) => s.trim());
  }
  return args;
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
    console.error("使い方: node scripts/convert-ksj-p11.mjs --input <geojsonファイル> [--inspect] [--output <出力先>] [--name-field <キー>] [--operator-field <キー>] [--operator <事業者名,...>]");
    process.exit(1);
  }

  const features = loadFeatures(args.input);

  if (args.inspect) {
    inspect(features);
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
  const seen = new Set();
  let skippedByOperator = 0;
  let skippedByGeometry = 0;

  for (const feature of features) {
    const props = feature.properties || {};
    const name = props[nameField];
    if (!name) continue;

    if (operatorFilters && operatorField) {
      const operatorValue = String(props[operatorField] || "");
      const matched = operatorFilters.some((f) => operatorValue.includes(f));
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

    const key = `${name}@${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
    if (seen.has(key)) continue; // 同一停留所・同一系統の重複行を除去
    seen.add(key);

    stops.push({ name: String(name), lat: point.lat, lon: point.lon });
  }

  console.log(`変換結果: ${stops.length} 件を採用 (事業者不一致で除外: ${skippedByOperator}件, 座標不正で除外: ${skippedByGeometry}件)`);

  const outputPath = args.output || "stops.json";
  writeFileSync(outputPath, JSON.stringify(stops, null, 2) + "\n", "utf-8");
  console.log(`書き出し完了: ${outputPath}`);
}

main();
