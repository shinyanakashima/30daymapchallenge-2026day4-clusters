import { describe, expect, it } from 'vitest';
import { DistanceIndex, haversineKm, type GeoPoint } from '../src/lib/geo';
import { dbscan } from '../src/lib/dbscan';
import { outlineOf } from '../src/lib/hull';
import { assignColors } from '../src/lib/colors';

// 緯度 43 度付近で経度方向に並べる小さな既知配置。
const LAT = 43;
const KM_PER_DEG_LON = haversineKm(143, LAT, 144, LAT);
const at = (id: number, xKm: number, yKm = 0): GeoPoint => ({
  id,
  lon: 143 + xKm / KM_PER_DEG_LON,
  lat: LAT + yKm / 111.195,
});
const run = (pts: GeoPoint[], epsKm: number, minPts: number, ids?: number[]) => {
  const idx = new DistanceIndex(pts);
  return dbscan(idx, ids ?? pts.map((p) => p.id), { epsKm, minPts });
};

describe('haversineKm', () => {
  it('赤道上の経度 1 度は約 111.2km', () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.195, 2);
  });
  it('同一点は 0', () => {
    expect(haversineKm(143, 43, 143, 43)).toBe(0);
  });
});

describe('dbscan', () => {
  it('距離境界: eps ちょうどは近傍に含み、わずかに超えると含まない', () => {
    const pts = [at(1, 0), at(2, 10)];
    const d = new DistanceIndex(pts).distance(1, 2);
    expect(run(pts, d, 2).clusters).toHaveLength(1);
    expect(run(pts, d - 1e-6, 2).clusters).toHaveLength(0);
  });

  it('minPts は本人を含めて数える', () => {
    const pts = [at(1, 0), at(2, 5), at(3, 10)];
    // 中央の点は本人+2 = 3 で中心点になる
    const r3 = run(pts, 6, 3);
    expect(r3.clusters).toHaveLength(1);
    expect(r3.clusters[0].members).toEqual([1, 2, 3]);
    expect(r3.clusters[0].core).toEqual([2]);
    // 本人を含めても 3 に届かないので集まりにならない
    expect(run(pts, 6, 4).clusters).toHaveLength(0);
  });

  it('孤立点は noise として個別に残す', () => {
    const pts = [at(1, 0), at(2, 1), at(3, 2), at(4, 100)];
    const r = run(pts, 3, 3);
    expect(r.clusters.map((c) => c.members)).toEqual([[1, 2, 3]]);
    expect(r.noise).toEqual([4]);
    expect(r.labelOf.get(4)).toBe(-1);
  });

  it('同位置の点はすべて保持され、同じグループに入る', () => {
    const pts = [at(1, 0), at(2, 0), at(3, 0)];
    const r = run(pts, 1, 3);
    expect(r.clusters[0].members).toEqual([1, 2, 3]);
  });

  it('連鎖する点は、端どうしが eps より遠くても 1 つのまとまりになる', () => {
    const pts = [0, 8, 16, 24, 32, 40].map((x, i) => at(i + 1, x));
    const r = run(pts, 10, 2);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].members).toHaveLength(6);
    const idx = new DistanceIndex(pts);
    expect(idx.maxPairwise(r.clusters[0].members)).toBeGreaterThan(10);
  });

  it('距離を広げると 2 群が合流する', () => {
    const pts = [at(1, 0), at(2, 2), at(3, 4), at(4, 20), at(5, 22), at(6, 24)];
    expect(run(pts, 3, 3).clusters).toHaveLength(2);
    expect(run(pts, 17, 3).clusters).toHaveLength(1);
  });

  it('カテゴリ変更後は対象点だけで再計算する', () => {
    const pts = [at(1, 0), at(2, 3), at(3, 6), at(4, 9)];
    expect(run(pts, 3.5, 3).clusters[0].members).toEqual([1, 2, 3, 4]);
    // 2 番を外すと 1 は孤立し、3-4 だけでは minPts=3 に届かない
    const r = run(pts, 3.5, 3, [1, 3, 4]);
    expect(r.clusters).toHaveLength(0);
    expect(r.noise).toEqual([1, 3, 4]);
  });

  it('入力順が違っても同じ結果 (再現性)', () => {
    const pts = [at(5, 0), at(3, 4), at(9, 8), at(1, 30), at(7, 33), at(2, 36), at(8, 80)];
    const a = run(pts, 5, 3);
    const b = run([...pts].reverse(), 5, 3, [8, 2, 7, 1, 9, 3, 5]);
    expect(b.clusters).toEqual(a.clusters);
    expect(b.noise).toEqual(a.noise);
  });

  it('境界点は昇順探索で先に到達したクラスタに入る', () => {
    // 3 は左右どちらの群の中心点からも eps 内にあるが、本人は中心点ではない境界点
    const pts = [
      at(10, -4.5), at(11, -4), at(12, -3), at(1, -2),
      at(3, 0),
      at(2, 2), at(20, 3), at(21, 4), at(22, 4.5),
    ];
    const r = run(pts, 2.1, 4);
    expect(r.clusters).toHaveLength(2);
    const owner = r.labelOf.get(3)!;
    expect(r.clusters[owner].members).toEqual([1, 3, 10, 11, 12]);
    expect(r.clusters[owner].core).not.toContain(3);
    // 入力順を変えても所属は同じ
    const r2 = run([...pts].reverse(), 2.1, 4);
    expect(r2.clusters).toEqual(r.clusters);
  });

  it('0 件でも落ちない', () => {
    const r = run([at(1, 0)], 10, 3, []);
    expect(r.clusters).toEqual([]);
    expect(r.noise).toEqual([]);
  });
});

describe('outlineOf', () => {
  it('同位置だけなら輪郭なし、2 点なら線、3 点以上で面', () => {
    expect(outlineOf([[143, 43], [143, 43]]).kind).toBe('none');
    expect(outlineOf([[143, 43], [143.1, 43]]).kind).toBe('line');
    const poly = outlineOf([[143, 43], [143.1, 43], [143.05, 43.1], [143.05, 43.02]]);
    expect(poly.kind).toBe('polygon');
    if (poly.kind === 'polygon') expect(poly.ring).toHaveLength(4); // 内側の点は除かれ、閉じる
  });
  it('一直線上の 3 点は線', () => {
    expect(outlineOf([[143, 43], [143.1, 43], [143.2, 43]]).kind).toBe('line');
  });
});

describe('assignColors', () => {
  it('前回との対応がなければメンバー由来で決定的', () => {
    const g = [[1, 2, 3], [7, 8]];
    expect(assignColors(g, null)).toEqual(assignColors(g, null));
    const c = assignColors(g, null);
    expect(c[0]).not.toBe(c[1]);
  });
  it('色番号は常にパレットの範囲内', () => {
    for (let id = 0; id < 20000; id += 7) {
      const [c] = assignColors([[id, id + 1]], null);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(8);
    }
  });
  it('分裂では最大の子が色を引き継ぐ', () => {
    const prev = [{ members: [1, 2, 3, 4, 5], color: 4 }];
    const c = assignColors([[1, 2], [3, 4, 5]], prev);
    expect(c[1]).toBe(4);
    expect(c[0]).not.toBe(4);
  });
  it('合流では最大の寄与元の色を優先する', () => {
    const prev = [
      { members: [1, 2], color: 2 },
      { members: [3, 4, 5], color: 6 },
    ];
    expect(assignColors([[1, 2, 3, 4, 5]], prev)).toEqual([6]);
  });
});
