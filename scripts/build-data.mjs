// data/raw の P12a (点) シェープファイルから配信用データを生成する。
//   public/data/resources.geojson  観光資源点 (EPSG:4326)
//   public/data/categories.json    種別・大分類の対応表
//   public/data/manifest.json      出典・件数・変換方法など
// 依存なし (Node 22 の TextDecoder で Shift_JIS を読む)。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const RAW = join(process.cwd(), 'data', 'raw');
const OUT = join(process.cwd(), 'public', 'data');
const BASE = 'P12a-14_01';

// ---- shapefile (点) ----
function readPointShp(buf) {
  const shapeType = buf.readInt32LE(32);
  if (shapeType !== 1) throw new Error(`P12a is not Point shapefile (type ${shapeType})`);
  const fileLen = buf.readInt32BE(24) * 2;
  const pts = [];
  let o = 100;
  while (o < fileLen) {
    const contentLen = buf.readInt32BE(o + 4) * 2;
    const type = buf.readInt32LE(o + 8);
    if (type === 0) pts.push(null);
    else if (type === 1) pts.push([buf.readDoubleLE(o + 12), buf.readDoubleLE(o + 20)]);
    else throw new Error(`unexpected record type ${type}`);
    o += 8 + contentLen;
  }
  return pts;
}

// ---- dbf ----
function readDbf(buf, encoding) {
  const n = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recLen = buf.readUInt16LE(10);
  const fields = [];
  for (let i = 32; buf[i] !== 0x0d; i += 32) {
    fields.push({
      name: buf.subarray(i, i + 11).toString('latin1').replace(/\0.*$/s, ''),
      type: String.fromCharCode(buf[i + 11]),
      len: buf[i + 16],
    });
  }
  const dec = new TextDecoder(encoding);
  const rows = [];
  for (let r = 0; r < n; r++) {
    const base = headerLen + r * recLen;
    const deleted = buf[base] === 0x2a;
    let o = base + 1;
    const row = {};
    for (const f of fields) {
      const raw = dec.decode(buf.subarray(o, o + f.len)).trim();
      row[f.name] = f.type === 'N' ? (raw === '' ? null : Number(raw)) : raw;
      o += f.len;
    }
    rows.push({ deleted, row });
  }
  return { fields, rows };
}

// 観光資源台帳 (日本交通公社) の大分類に基づく種別のまとめ。
// P12_007 (観光資源分類コード) は北海道ファイルでは全件 -1 (未設定) のため使えない。
const KIND_ORDER = {
  nature: ['山岳', '高原・湿原・原野', '湖沼', '河川・峡谷', '滝', '海岸・岬', '岩石・洞窟', '動物', '植物', '自然現象'],
  culture: [
    '史跡', '神社・寺院・教会', '城跡・城郭・宮殿', '集落・街', '郷土景観', '庭園・公園', '建造物',
    '年中行事', '動植物園・水族館', '博物館・美術館', 'テーマ公園・テーマ施設', '温泉', '食', '芸能・興行・イベント',
  ],
};
const GROUP_LABEL = { nature: '自然資源', culture: '人文資源', unclassified: '未分類' };

const shpBuf = await readFile(join(RAW, `${BASE}.shp`));
const dbfBuf = await readFile(join(RAW, `${BASE}.dbf`));
const prj = (await readFile(join(RAW, `${BASE}.prj`), 'utf8')).trim();
let fetchedAt = null;
try {
  fetchedAt = (await readFile(join(RAW, 'fetched_at.txt'), 'utf8')).trim();
} catch {
  /* 取得日不明 */
}
const geoms = readPointShp(shpBuf);
const { fields, rows } = readDbf(dbfBuf, 'shift_jis');
if (geoms.length !== rows.length) throw new Error(`shp/dbf count mismatch ${geoms.length} vs ${rows.length}`);

const excluded = [];
const features = [];
const idCount = new Map();
const missing = {};
for (const f of fields) missing[f.name] = 0;

rows.forEach(({ deleted, row }, i) => {
  for (const f of fields) {
    const v = row[f.name];
    if (v === null || v === '' || v === -1) missing[f.name]++;
  }
  idCount.set(row.P12_001, (idCount.get(row.P12_001) ?? 0) + 1);
  const g = geoms[i];
  if (deleted) return excluded.push({ index: i, id: row.P12_001, reason: 'dbf 削除フラグ' });
  if (!g) return excluded.push({ index: i, id: row.P12_001, reason: '座標なし' });
  const [lon, lat] = g;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 139 || lon > 149 || lat < 41 || lat > 46) {
    return excluded.push({ index: i, id: row.P12_001, reason: '北海道の範囲外の座標' });
  }
  const codes = String(row.P12_004).split(/[、,]/).map((s) => s.trim()).filter(Boolean);
  const names = String(row.P12_006).split(/\s*および\s*/).map((s) => s.replace(/[\s　]+/g, '')).filter(Boolean);
  const municipalities =
    codes.length === names.length ? codes.map((code, k) => ({ code, name: names[k] })) : codes.map((code) => ({ code, name: null }));
  features.push({
    type: 'Feature',
    id: row.P12_001,
    geometry: { type: 'Point', coordinates: [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7] },
    properties: {
      id: row.P12_001,
      name: row.P12_002,
      pref: row.P12_003,
      kind: row.P12_005,
      address: row.P12_006,
      categoryCode: row.P12_007,
      municipalities,
    },
  });
});

const dupIds = [...idCount].filter(([, c]) => c > 1).map(([id, c]) => ({ id, count: c }));
if (dupIds.length) throw new Error(`duplicate P12_001: ${JSON.stringify(dupIds)} — 扱いを決めてから再実行する`);
features.sort((a, b) => a.id - b.id);

const byCoord = new Map();
for (const f of features) {
  const k = f.geometry.coordinates.join(',');
  byCoord.set(k, [...(byCoord.get(k) ?? []), f.id]);
}
const sameCoord = [...byCoord].filter(([, ids]) => ids.length > 1).map(([coord, ids]) => ({ coord, ids }));

const kindCounts = new Map();
for (const f of features) kindCounts.set(f.properties.kind, (kindCounts.get(f.properties.kind) ?? 0) + 1);
const groupOf = (kind) =>
  KIND_ORDER.nature.includes(kind) ? 'nature' : KIND_ORDER.culture.includes(kind) ? 'culture' : 'unclassified';
const orderIdx = (kind) => {
  const all = [...KIND_ORDER.nature, ...KIND_ORDER.culture];
  const i = all.indexOf(kind);
  return i < 0 ? 999 : i;
};
const kinds = [...kindCounts.keys()]
  .sort((a, b) => orderIdx(a) - orderIdx(b) || a.localeCompare(b, 'ja'))
  .map((name, i) => ({ key: `k${String(i + 1).padStart(2, '0')}`, name, group: groupOf(name), count: kindCounts.get(name) }));
const kindKey = new Map(kinds.map((k) => [k.name, k.key]));
for (const f of features) f.properties.kindKey = kindKey.get(f.properties.kind);

const lons = features.map((f) => f.geometry.coordinates[0]);
const lats = features.map((f) => f.geometry.coordinates[1]);
const stats = {
  totalRecords: rows.length,
  validPoints: features.length,
  excluded: excluded.length,
  missingByField: missing,
  duplicateIds: dupIds.length,
  sameCoordinateGroups: sameCoord,
  bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
  byKind: Object.fromEntries(kinds.map((k) => [k.name, k.count])),
  byGroup: Object.fromEntries(
    ['nature', 'culture', 'unclassified'].map((g) => [GROUP_LABEL[g], kinds.filter((k) => k.group === g).reduce((s, k) => s + k.count, 0)]),
  ),
};

const categories = {
  note:
    '種別は P12_005 (種別名称) の原文。大分類は日本交通公社「観光資源台帳」の自然資源・人文資源の区分に合わせた対応表。' +
    'P12_007 (観光資源分類コード) は北海道ファイルで全件 -1 (未設定) のため、分類に使っていない。',
  groups: Object.entries(GROUP_LABEL).map(([key, label]) => ({ key, label })),
  kinds,
};

const manifest = {
  title: '北海道、旅のまとまりを探して。配信データ',
  source: {
    name: '国土数値情報 観光資源データ 第2.2版 (P12-14) 北海道',
    publisher: '国土交通省 国土政策局',
    downloadUrl: 'https://nlftp.mlit.go.jp/ksj/gml/data/P12/P12-14/P12-14_01_GML.zip',
    pageUrl: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P12-v2_2.html',
    originalSources: '日本交通公社 観光資源評価委員会「観光資源台帳」(A級以上)、観光庁「観光地点等名簿」ほか',
    referenceDate: '2014-09-30',
    fetchedAt,
    license: '非商用 (配布ページの使用許諾条件)',
    licenseUrl: 'https://nlftp.mlit.go.jp/ksj/other/agreement.html',
  },
  layerUsed: `${BASE}.shp (観光資源・点)`,
  layersNotUsed: [
    { file: 'P12b-14_01.shp', reason: '線。同じ資源が点レイヤにもあるため、代表点化して足すと二重計数になる' },
    { file: 'P12c-14_01.shp', reason: '面。同じ資源が点レイヤにもあるため、代表点化して足すと二重計数になる' },
  ],
  crs: {
    sourcePrj: prj,
    sourceNote: '.prj と GML は JGD2000、配布ページとメタデータの範囲記述は JGD2011 と表記。いずれも地理座標 (緯度経度)。',
    output: 'EPSG:4326',
    transform:
      '座標値をそのまま EPSG:4326 として扱い、小数第 7 位で丸めた。JGD2000/JGD2011 と WGS84 の差は本作品の縮尺 (数 km〜数十 km の距離判定) と元データの位置正確度 (図上 0.3mm 以内) に比べて無視できる。',
  },
  fields: fields.map((f) => ({ name: f.name, type: f.type, length: f.len })),
  fieldMapping: {
    P12_001: 'id (観光資源ID)',
    P12_002: 'name (名称)',
    P12_003: 'pref (都道府県コード)',
    P12_004: 'municipalities[].code (行政区域コード、複数は「、」区切り)',
    P12_005: 'kind (種別名称)',
    P12_006: 'address / municipalities[].name (所在地住所、複数は「および」区切り。2014年3月時点)',
    P12_007: 'categoryCode (観光資源分類コード。北海道は全件 -1)',
  },
  encoding: 'dbf: Shift_JIS (CP932)',
  stats,
  excludedRecords: excluded,
  notes: [
    '点は施設入口ではなく、資源の中心部などの代表位置。',
    '同じ座標を持つ別資源は削除せず、すべて保持する。',
    '2014年時点の評価・名簿に基づくデータで、現在の営業や入場可否を示さない。北海道のすべての観光スポットを網羅するものではない。',
    '自治体名は同じレコードの所在地住所 (2014年3月時点) から取り、行政区域コードと同じ年代で対応させている。',
  ],
  generatedAt: new Date().toISOString().slice(0, 10),
};

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'resources.geojson'), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
await writeFile(join(OUT, 'categories.json'), JSON.stringify(categories, null, 2) + '\n');
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(stats, null, 2));
const muniMismatch = features.filter((f) => f.properties.municipalities.some((m) => m.name === null));
if (muniMismatch.length) console.warn('municipality name/code mismatch:', muniMismatch.map((f) => f.id));
