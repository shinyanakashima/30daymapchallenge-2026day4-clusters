/** 地球の平均半径 (km)。IUGG の平均半径 R1。 */
export const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Haversine による 2 点間の地表距離 (km)。引数は経度・緯度 (度)。 */
export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface GeoPoint {
  id: number;
  lon: number;
  lat: number;
}

/**
 * 全点間距離のキャッシュ。点数が数百程度までなら n×n 行列で十分速い。
 * 北海道の P12a は 35 点なので、毎回の再計算をせずこの行列を使い回す。
 */
export class DistanceIndex {
  readonly ids: number[];
  private readonly pos = new Map<number, number>();
  private readonly matrix: Float32Array;

  constructor(points: readonly GeoPoint[]) {
    const sorted = [...points].sort((a, b) => a.id - b.id);
    this.ids = sorted.map((p) => p.id);
    const n = sorted.length;
    // Float32 で十分 (km 単位で 1m 未満の誤差)。2,000 点でも約 16MB に収まる。
    this.matrix = new Float32Array(n * n);
    sorted.forEach((p, i) => {
      if (this.pos.has(p.id)) throw new Error(`duplicate id ${p.id}`);
      this.pos.set(p.id, i);
    });
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = haversineKm(sorted[i].lon, sorted[i].lat, sorted[j].lon, sorted[j].lat);
        this.matrix[i * n + j] = d;
        this.matrix[j * n + i] = d;
      }
    }
  }

  has(id: number): boolean {
    return this.pos.has(id);
  }

  distance(a: number, b: number): number {
    const i = this.pos.get(a);
    const j = this.pos.get(b);
    if (i === undefined || j === undefined) throw new Error(`unknown id ${a} or ${b}`);
    return this.matrix[i * this.ids.length + j];
  }

  /** メンバー間の最大直線距離 (km)。1 点なら 0。 */
  maxPairwise(ids: readonly number[]): number {
    let max = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const d = this.distance(ids[i], ids[j]);
        if (d > max) max = d;
      }
    }
    return max;
  }
}
