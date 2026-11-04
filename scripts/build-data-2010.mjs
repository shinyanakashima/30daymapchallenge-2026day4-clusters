// 国土数値情報「観光資源」第2.0版 (P12-10, 2010年度) から北海道の点を抜き出し、比較用の版として出力する。
//   public/data/resources-2010.geojson / categories-2010.json / manifest-2010.json
// 第2.0版の点データには観光資源 ID も住所もないため、
//  - ID は (行政区域コード, 名称, 経度, 緯度) の順に並べて 20001 から振る
//  - 自治体名は国土数値情報の行政区域コード表 (廃止コードを含む) から引く
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readDbf, readPointShp } from './lib-shp.mjs';
import { readSheet } from './lib-xlsx.mjs';

const RAW = join(process.cwd(), 'data', 'raw');
const BASE = join(RAW, 'P12-10_GML', 'P12-10-g_TourismResource_Point');
const OUT = join(process.cwd(), 'public', 'data');

const geoms = readPointShp(await readFile(`${BASE}.shp`));
const { fields, rows } = readDbf(await readFile(`${BASE}.dbf`), 'shift_jis');
if (geoms.length !== rows.length) throw new Error('shp/dbf count mismatch');

const codeRows = await readSheet(join(RAW, 'AdminiBoundary_CD'));
const muniName = new Map(codeRows.filter((r) => /^01\d{3}$/.test(String(r.A)) && r.C).map((r) => [String(r.A), String(r.C)]));

// 観光資源台帳の大分類 (第2.0版の種別名)
const NATURE = ['山岳', '高原', '原野', '湿原', '湖沼', '河川', '峡谷', '滝', '海岸', '岬', '島', '岩石・洞窟', '動物', '植物', '自然現象'];
const CULTURE = ['史跡', '社寺', '城跡・城郭', '庭園・公園', '歴史景観', '地域景観', '年中行事', '碑・像', '建造物', '博物館・美術館', '動植物園・水族館', '温泉', '食', '芸能・イベント', '郷土景観'];
const groupOf = (k) => (NATURE.includes(k) ? 'nature' : CULTURE.includes(k) ? 'culture' : 'unclassified');
const order = (k) => {
  const i = [...NATURE, ...CULTURE].indexOf(k);
  return i < 0 ? 999 : i;
};

const nationwide = rows.length;
const recs = [];
const excluded = [];
rows.forEach(({ deleted, row }, i) => {
  if (!String(row.P12_002).startsWith('01')) return;
  const g = geoms[i];
  if (deleted) return excluded.push({ index: i, name: row.P12_003, reason: 'dbf 削除フラグ' });
  if (!g || !Number.isFinite(g[0]) || !Number.isFinite(g[1])) return excluded.push({ index: i, name: row.P12_003, reason: '座標なし' });
  if (g[0] < 139 || g[0] > 149 || g[1] < 41 || g[1] > 46) {
    // 第2.0版には、北海道の行政区域コードで座標が本州にあるレコードが 3 件ある (五色ヶ原・駒ヶ岳・大沼)。
    // 同名の別資源の座標と見られ、北海道側の座標を持つ同じ名称・コードのレコードが別にあるため除外する。
    return excluded.push({ index: i, name: row.P12_003, reason: '北海道の行政区域コードだが座標が北海道の外（同名の本州の資源の座標と見られる。北海道側のレコードは別にある）' });
  }
  recs.push({ code: String(row.P12_002).split(/[,、]/)[0].trim(), codes: String(row.P12_002).split(/[,、]/).map((c) => c.trim()).filter((c) => c.startsWith('01')), name: row.P12_003, kind: row.P12_004 || '未分類', lon: Math.round(g[0] * 1e7) / 1e7, lat: Math.round(g[1] * 1e7) / 1e7 });
});
const hokkaidoRecords = recs.length + excluded.length;

// 名称・座標・種別がすべて同じレコードは同一資源の重複として 1 件にする (名称だけの一致では消さない)
const seen = new Map();
const kept = [];
for (const r of recs) {
  const key = [r.name, r.kind, r.lon, r.lat].join('|');
  if (seen.has(key)) {
    excluded.push({ name: r.name, reason: '名称・種別・座標が同じレコードの重複' });
    continue;
  }
  seen.set(key, true);
  kept.push(r);
}
kept.sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name, 'ja') || a.lon - b.lon || a.lat - b.lat);

const kindCounts = new Map();
for (const r of kept) kindCounts.set(r.kind, (kindCounts.get(r.kind) ?? 0) + 1);
const kinds = [...kindCounts.keys()]
  .sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'ja'))
  .map((name, i) => ({ key: `k${String(i + 1).padStart(2, '0')}`, name, group: groupOf(name), count: kindCounts.get(name) }));
const kindKey = new Map(kinds.map((k) => [k.name, k.key]));

const unknownCodes = new Set();
const features = kept.map((r, i) => {
  const municipalities = r.codes.map((code) => {
    const name = muniName.get(code) ?? null;
    if (!name) unknownCodes.add(code);
    return { code, name };
  });
  const name = municipalities.map((m) => m.name ?? m.code).join('・');
  return {
    type: 'Feature',
    id: 20001 + i,
    geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
    properties: {
      id: 20001 + i,
      name: r.name,
      pref: '01',
      kind: r.kind,
      kindKey: kindKey.get(r.kind),
      address: name,
      categoryCode: null,
      municipalities,
    },
  };
});

const byCoord = new Map();
for (const f of features) byCoord.set(f.geometry.coordinates.join(','), [...(byCoord.get(f.geometry.coordinates.join(',')) ?? []), f.id]);
const sameName = new Map();
for (const f of features) sameName.set(f.properties.name, [...(sameName.get(f.properties.name) ?? []), f.id]);
const lons = features.map((f) => f.geometry.coordinates[0]);
const lats = features.map((f) => f.geometry.coordinates[1]);
const stats = {
  nationwideRecords: nationwide,
  totalRecords: hokkaidoRecords,
  validPoints: features.length,
  excluded: excluded.length,
  sameCoordinateGroups: [...byCoord].filter(([, ids]) => ids.length > 1).map(([coord, ids]) => ({ coord, ids })),
  sameNameGroups: [...sameName].filter(([, ids]) => ids.length > 1).map(([name, ids]) => ({ name, ids })),
  unknownMunicipalityCodes: [...unknownCodes],
  bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
  byKind: Object.fromEntries(kinds.map((k) => [k.name, k.count])),
  byGroup: {
    自然資源: kinds.filter((k) => k.group === 'nature').reduce((s, k) => s + k.count, 0),
    人文資源: kinds.filter((k) => k.group === 'culture').reduce((s, k) => s + k.count, 0),
    未分類: kinds.filter((k) => k.group === 'unclassified').reduce((s, k) => s + k.count, 0),
  },
};

const categories = {
  note: '種別は P12_004 (種別) の原文。大分類は観光資源台帳の自然資源・人文資源の区分に合わせた対応表。',
  groups: [
    { key: 'nature', label: '自然資源' },
    { key: 'culture', label: '人文資源' },
    { key: 'unclassified', label: '未分類' },
  ],
  kinds,
};
const manifest = {
  title: 'Shabon Hokkaido 配信データ (2010年度版・比較用)',
  edition: '2010',
  source: {
    name: '国土数値情報 観光資源データ 第2.0版 (P12-10) 全国から北海道を抽出',
    publisher: '国土交通省 国土政策局',
    downloadUrl: 'https://nlftp.mlit.go.jp/ksj/gml/data/P12/P12-10/P12-10_GML.zip',
    pageUrl: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P12-v2_0.html',
    referenceDate: '2010年度 (平成22年度) 作成',
    fetchedAt: (await readFile(join(RAW, 'fetched_at.txt'), 'utf8').catch(() => '')).trim() || null,
    license: '非商用 (配布ページの使用許諾条件)',
    licenseUrl: 'https://nlftp.mlit.go.jp/ksj/other/agreement.html',
    municipalityCodes: 'https://nlftp.mlit.go.jp/ksj/gml/codelist/AdminiBoundary_CD.xlsx',
  },
  layerUsed: 'P12-10-g_TourismResource_Point.shp (観光資源・点)。線・面は二重計数を避けるため使わない',
  fields: fields.map((f) => ({ name: f.name, type: f.type, length: f.len })),
  fieldMapping: { P12_001: '都道府県コード', P12_002: '行政区域コード (01 で始まるものを北海道として抽出)', P12_003: 'name (名称)', P12_004: 'kind (種別)' },
  idRule: '(行政区域コード, 名称, 経度, 緯度) の順に並べて 20001 から付番。第2.0版には観光資源 ID がない',
  crs: { output: 'EPSG:4326', transform: '地理座標をそのまま EPSG:4326 として扱い、小数第7位で丸めた' },
  stats,
  excludedRecords: excluded,
  notes: [
    '比較用の古い版。2010年度の作成で、現在の状況を示さない。',
    '第2.2版 (2014年) とは種別名・収録基準が異なり、件数をそのまま比べられない。',
    '自治体名は行政区域コード表 (令和6年1月1日現在、廃止コードを含む) の名称。',
  ],
  generatedAt: new Date().toISOString().slice(0, 10),
};
await writeFile(join(OUT, 'resources-2010.geojson'), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
await writeFile(join(OUT, 'categories-2010.json'), JSON.stringify(categories, null, 2) + '\n');
await writeFile(join(OUT, 'manifest-2010.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ ...stats, sameCoordinateGroups: stats.sameCoordinateGroups.length }, null, 1));
console.log('excluded:', JSON.stringify(excluded));
