// 複数の距離・最小地点数で DBSCAN を実行し、初期値を選ぶための表を出す。
// Node 22.18+ の型除去で src/lib の TypeScript をそのまま読み込む。
import { readFile } from 'node:fs/promises';
import { DistanceIndex } from '../src/lib/geo.ts';
import { dbscan } from '../src/lib/dbscan.ts';

const gj = JSON.parse(await readFile('public/data/resources.geojson', 'utf8'));
const pts = gj.features.map((f) => ({ id: f.properties.id, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], name: f.properties.name, group: f.properties.kindKey }));
const name = new Map(pts.map((p) => [p.id, p.name]));
const idx = new DistanceIndex(pts);

// 最近傍距離の分布
const nn = pts.map((p) => Math.min(...pts.filter((q) => q.id !== p.id).map((q) => idx.distance(p.id, q.id))));
nn.sort((a, b) => a - b);
console.log('nearest-neighbour km:', nn.map((d) => d.toFixed(1)).join(' '));

const epsList = (process.argv[2] ?? '5,10,15,20,25,30,40,50,60,70,80,100,120,150').split(',').map(Number);
for (const minPts of [2, 3, 4]) {
  console.log(`\nminPts=${minPts}`);
  for (const epsKm of epsList) {
    const r = dbscan(idx, idx.ids, { epsKm, minPts });
    const desc = r.clusters.map((c) => `${c.members.length}[${name.get(c.members[0])}…] ${idx.maxPairwise(c.members).toFixed(0)}km`).join(' | ');
    console.log(`eps=${String(epsKm).padStart(3)}  groups=${r.clusters.length} noise=${String(r.noise.length).padStart(2)}  ${desc}`);
  }
}

// 計算時間の実測 (この実行環境での値。端末により異なる)
const runs = 500;
const t0 = performance.now();
for (let i = 0; i < runs; i++) dbscan(idx, idx.ids, { epsKm: 1 + (i % 120), minPts: 3 });
const t1 = performance.now();
console.log(`\ntiming: ${runs} runs, avg ${((t1 - t0) / runs).toFixed(3)} ms per DBSCAN (${pts.length} points, Node ${process.version})`);
