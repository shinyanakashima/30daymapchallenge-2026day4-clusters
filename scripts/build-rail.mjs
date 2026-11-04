// 鉄道の参考レイヤを作る。
// 元: #30DayMapChallenge 2026 Day1「駅のあった北海道」で国土数値情報「鉄道時系列データ」N05 (2025年度版、
// 2025年末時点、非商用) から作った北海道の路線・駅データ。コミットを固定して取得する。
//   public/data/rail.geojson          2025年末時点で営業中の路線
//   public/data/rail-history.geojson  1950年以降に営業していた路線 (廃止区間を含む。薄く重ねる用)
//   public/data/stations.geojson      2025年末時点で営業中の駅
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DAY1_REPO = 'shinyanakashima/30daymapchallenge-2026day1-station-history';
const DAY1_COMMIT = '5906139f5f3e8ba44b7b7f1f689a95b0503dc939';
const base = `https://raw.githubusercontent.com/${DAY1_REPO}/${DAY1_COMMIT}/public/data`;
const YEAR = 2025;

const get = async (name) => {
  const res = await fetch(`${base}/${name}`);
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${name}`);
  return res.json();
};
const lines = await get('lines.geojson');
const st = await get('stations.json');

// Douglas–Peucker で線を間引く (全道表示用。許容 約 20m)
const TOL = 0.0002;
function simplify(pts) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > TOL && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
}
const operatorName = (o) => o.replace('（旧国鉄）', '');
const cls = (n, o) => (n === '北海道新幹線' ? 'shinkansen' : o.startsWith('北海道旅客鉄道') ? 'jr' : 'other');

const active = [];
const history = [];
const seen = new Set();
for (const f of lines.features) {
  const { n, o, b, e } = f.properties;
  const coords = simplify(f.geometry.coordinates);
  const feat = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { line: n, operator: operatorName(o), cls: cls(n, o), from: b, to: e } };
  if (e >= YEAR) active.push(feat);
  const key = n + JSON.stringify(coords);
  if (!seen.has(key)) {
    seen.add(key);
    history.push({ ...feat, properties: { line: n, operator: operatorName(o), from: b, to: e } });
  }
}

// 駅: 2025年に有効なレコードを持つ物理的な駅
const F = Object.fromEntries(st.meta.recordFields.map((k, i) => [k, i]));
const stations = [];
for (const s of st.stations) {
  const recs = s.r.map((i) => st.records[i]).filter((r) => r[F.effB] <= YEAR && r[F.effE] >= YEAR);
  if (!recs.length) continue;
  const lon = recs.reduce((a, r) => a + r[F.lon], 0) / recs.length;
  const lat = recs.reduce((a, r) => a + r[F.lat], 0) / recs.length;
  const linesOf = [...new Set(recs.map((r) => r[F.line]))];
  stations.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5] },
    properties: {
      name: recs[0][F.name],
      lines: linesOf.join('・'),
      operators: [...new Set(recs.map((r) => operatorName(r[F.op])))].join('・'),
      major: linesOf.length >= 2 || linesOf.includes('北海道新幹線') ? 1 : 0,
    },
  });
}
stations.sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'ja'));

const out = (name, features) => writeFile(join(process.cwd(), 'public', 'data', name), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
await out('rail.geojson', active);
await out('rail-history.geojson', history);
await out('stations.geojson', stations);

const manifestPath = join(process.cwd(), 'public', 'data', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.overlays = {
  ...manifest.overlays,
  rail: {
    name: '国土数値情報 鉄道時系列データ 2025年度版 (N05-25)',
    publisher: '国土交通省',
    pageUrl: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N05-2025.html',
    license: '非商用 (原典に有償刊行物を含む。CC BY の N02 とは別製品)',
    referenceDate: '2025年末',
    via: `#30DayMapChallenge 2026 Day1「駅のあった北海道」の加工済みデータ https://github.com/${DAY1_REPO}/tree/${DAY1_COMMIT}/public/data`,
    method: '営業期間の終了年が2025以上の路線区間を現在の路線、全期間の区間 (重複除く) を履歴とした。駅は2025年に有効なレコードを持つ物理的な駅。線は Douglas–Peucker (許容 0.0002度≒20m) で間引き、小数第5位に丸めた。',
    activeSections: active.length,
    historySections: history.length,
    stations: stations.length,
    note: '参考レイヤ。クラスタリングの対象には含めない。',
  },
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`rail: active ${active.length}, history ${history.length}, stations ${stations.length}`);
