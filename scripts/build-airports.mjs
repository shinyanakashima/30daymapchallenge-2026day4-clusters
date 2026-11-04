// 国土数値情報「空港」(C28-21) から北海道の空港を抜き出し、標点位置の点データを作る。
// 参考レイヤ。クラスタリングには含めない。
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = join(process.cwd(), 'data', 'raw', 'C28-21_GML', 'UTF-8');
const airports = JSON.parse(await readFile(join(dir, 'C28-21_Airport.geojson'), 'utf8'));
const refs = JSON.parse(await readFile(join(dir, 'C28-21_AirportReferencePoint.geojson'), 'utf8'));
const refById = new Map(refs.features.map((f) => [f.properties.C28_000, f.geometry.coordinates]));

// 空港範囲 (面) は 1 空港で複数の地物を持つことがあるので、標点 ID で 1 件にまとめる
const seen = new Map();
for (const f of airports.features) {
  const p = f.properties;
  if (!String(p.C28_001).startsWith('01')) continue;
  const refId = String(p.C28_101).replace(/^#/, '');
  if (seen.has(refId)) continue;
  const c = refById.get(refId);
  if (!c) throw new Error(`reference point not found: ${p.C28_005} ${refId}`);
  seen.set(refId, {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Math.round(c[0] * 1e7) / 1e7, Math.round(c[1] * 1e7) / 1e7] },
    properties: { name: p.C28_005, status: p.C28_004, code: p.C28_001 },
  });
}
const features = [...seen.values()].sort((a, b) => a.properties.code.localeCompare(b.properties.code) || a.properties.name.localeCompare(b.properties.name, 'ja'));
await writeFile(join(process.cwd(), 'public', 'data', 'airports.geojson'), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');

const manifestPath = join(process.cwd(), 'public', 'data', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.overlays = {
  ...manifest.overlays,
  airports: {
    name: '国土数値情報 空港データ 令和3年 (C28-21)',
    publisher: '国土交通省',
    pageUrl: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C28-2021.html',
    downloadUrl: 'https://nlftp.mlit.go.jp/ksj/gml/data/C28/C28-21/C28-21_GML.zip',
    referenceDate: '2021-12-31',
    license: '商用可 (配布ページの使用許諾条件)',
    method: '空港 (C28_001 行政区域コードが 01 で始まるもの) を標点 (C28_101 → AirportReferencePoint) の位置で点にした。同じ標点を持つ地物は 1 件にまとめた。',
    count: features.length,
    statuses: Object.fromEntries([...new Set(features.map((f) => f.properties.status))].map((s) => [s, features.filter((f) => f.properties.status === s).length])),
    note: '参考レイヤ。クラスタリングの対象には含めない。',
  },
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`airports: ${features.length}`, features.map((f) => f.properties.name + (f.properties.status === '供用中' ? '' : `(${f.properties.status})`)).join(' '));
