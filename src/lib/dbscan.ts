import type { DistanceIndex } from './geo';

export interface DbscanParams {
  /** 近所とみなす距離 (km)。距離 <= epsKm を近傍とする。 */
  epsKm: number;
  /** 何地点から集まりと呼ぶか。本人を含む近傍数がこの値以上なら中心点。 */
  minPts: number;
}

export interface Cluster {
  /** 計算順の番号。再計算で変わるので色や選択の復元に使わない。 */
  index: number;
  /** メンバー ID (昇順)。 */
  members: number[];
  /** 中心点 (core point) の ID (昇順)。 */
  core: number[];
}

export interface DbscanResult {
  clusters: Cluster[];
  /** 孤立点 (noise) の ID (昇順)。 */
  noise: number[];
  /** ID -> クラスタ index。孤立点は -1。 */
  labelOf: Map<number, number>;
}

/**
 * Haversine 距離による DBSCAN。
 * - 入力 ID は昇順に並べ替えてから探索するので、同じデータ・条件なら同じ結果になる。
 * - 境界点は、昇順探索で最初に到達したクラスタに所属させる。
 * - minPts は本人を含めて数える。
 */
export function dbscan(index: DistanceIndex, ids: readonly number[], params: DbscanParams): DbscanResult {
  const { epsKm, minPts } = params;
  const order = [...new Set(ids)].sort((a, b) => a - b);
  for (const id of order) if (!index.has(id)) throw new Error(`unknown id ${id}`);

  const neighborsOf = (id: number): number[] =>
    order.filter((other) => other === id || index.distance(id, other) <= epsKm);

  const UNVISITED = -2;
  const NOISE = -1;
  const label = new Map<number, number>(order.map((id) => [id, UNVISITED]));
  const isCore = new Set<number>();
  const clusters: Cluster[] = [];

  for (const id of order) {
    if (label.get(id) !== UNVISITED) continue;
    const nbrs = neighborsOf(id);
    if (nbrs.length < minPts) {
      label.set(id, NOISE);
      continue;
    }
    const c = clusters.length;
    clusters.push({ index: c, members: [], core: [] });
    label.set(id, c);
    isCore.add(id);
    // 幅優先で拡張。キューも昇順の近傍を順に積むので探索順は決定的。
    const queue = nbrs.filter((n) => n !== id);
    for (let q = 0; q < queue.length; q++) {
      const p = queue[q];
      const l = label.get(p)!;
      if (l === NOISE) label.set(p, c); // 境界点として取り込む
      if (l !== UNVISITED) continue;
      label.set(p, c);
      const pn = neighborsOf(p);
      if (pn.length >= minPts) {
        isCore.add(p);
        for (const n of pn) {
          const ln = label.get(n)!;
          if (ln === UNVISITED || ln === NOISE) queue.push(n);
        }
      }
    }
  }

  const labelOf = new Map<number, number>();
  const noise: number[] = [];
  for (const id of order) {
    const l = label.get(id)!;
    labelOf.set(id, l);
    if (l < 0) noise.push(id);
    else {
      clusters[l].members.push(id);
      if (isCore.has(id)) clusters[l].core.push(id);
    }
  }
  return { clusters, noise, labelOf };
}
