import { assignColors, type ColoredGroup } from './lib/colors';
import { dbscan } from './lib/dbscan';
import type { DistanceIndex } from './lib/geo';
import type { CategorySel, Resource } from './types';

export interface Group {
  /** 表示用の安定キー (最小メンバー ID)。 */
  key: number;
  members: number[];
  color: number;
  maxKm: number;
  centroid: [number, number];
  municipalities: { name: string; count: number }[];
  kinds: { kind: string; count: number }[];
  label: string;
}

export interface Computed {
  requestId: number;
  epsKm: number;
  minPts: number;
  targetIds: number[];
  groups: Group[];
  noise: number[];
  groupOf: Map<number, Group>;
}

export function selectIds(resources: readonly Resource[], cat: CategorySel): number[] {
  return resources
    .filter((r) =>
      cat.type === 'all' ? true : cat.type === 'group' ? r.group === cat.group : cat.keys.includes(r.kindKey),
    )
    .map((r) => r.id);
}

const muniNames = (r: Resource): string[] =>
  r.municipalities.length ? r.municipalities.map((m) => m.name ?? m.code) : [r.address];

export function groupLabel(munis: { name: string; count: number }[]): string {
  if (munis.length === 0) return 'まとまり';
  if (munis.length === 1) return munis[0].name;
  if (munis.length === 2) return `${munis[0].name}・${munis[1].name}`;
  return `${munis[0].name}・${munis[1].name} ほか`;
}

export function computeClusters(
  requestId: number,
  index: DistanceIndex,
  byId: Map<number, Resource>,
  targetIds: number[],
  epsKm: number,
  minPts: number,
  prev: readonly ColoredGroup[] | null,
): Computed {
  const r = dbscan(index, targetIds, { epsKm, minPts });
  const colors = assignColors(
    r.clusters.map((c) => c.members),
    prev,
  );
  const groups: Group[] = r.clusters.map((c, i) => {
    const rs = c.members.map((id) => byId.get(id)!);
    const muni = new Map<string, number>();
    for (const res of rs) for (const n of muniNames(res)) muni.set(n, (muni.get(n) ?? 0) + 1);
    const municipalities = [...muni]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
    const kind = new Map<string, number>();
    for (const res of rs) kind.set(res.kind, (kind.get(res.kind) ?? 0) + 1);
    const kinds = [...kind].map(([k, count]) => ({ kind: k, count })).sort((a, b) => b.count - a.count);
    const lon = rs.reduce((s, x) => s + x.lon, 0) / rs.length;
    const lat = rs.reduce((s, x) => s + x.lat, 0) / rs.length;
    return {
      key: c.members[0],
      members: c.members,
      color: colors[i],
      maxKm: index.maxPairwise(c.members),
      centroid: [lon, lat],
      municipalities,
      kinds,
      label: groupLabel(municipalities),
    };
  });
  // 一覧は大きい順 → 最小 ID 順 (計算順の番号に依存させない)
  groups.sort((a, b) => b.members.length - a.members.length || a.key - b.key);
  const groupOf = new Map<number, Group>();
  for (const g of groups) for (const m of g.members) groupOf.set(m, g);
  return { requestId, epsKm, minPts, targetIds, groups, noise: r.noise, groupOf };
}

/** 最も近い対象点 (自分以外)。 */
export function nearestOf(index: DistanceIndex, id: number, targetIds: readonly number[]): { id: number; km: number } | null {
  let best: { id: number; km: number } | null = null;
  for (const t of targetIds) {
    if (t === id) continue;
    const km = index.distance(id, t);
    if (!best || km < best.km) best = { id: t, km };
  }
  return best;
}
