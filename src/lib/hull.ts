export type LonLat = [number, number];

export type Outline =
  | { kind: 'none' }
  | { kind: 'line'; coords: LonLat[] }
  | { kind: 'polygon'; ring: LonLat[] };

/** Web メルカトルの y (無次元)。画面上で凸に見えるよう、この座標系で凸包を取る。 */
const mercY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/**
 * 分類済みグループの輪郭。クラスタリングとは独立した後処理。
 * - 全点が同じ位置: 輪郭なし
 * - 2 点または一直線上: 線
 * - それ以外: 凸包 (閉じたリング)
 */
export function outlineOf(points: readonly LonLat[]): Outline {
  const uniq = new Map<string, LonLat>();
  for (const p of points) uniq.set(`${p[0]},${p[1]}`, p);
  const pts = [...uniq.values()].map((p) => ({ p, x: p[0], y: mercY(p[1]) }));
  if (pts.length <= 1) return { kind: 'none' };
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length === 2) return { kind: 'line', coords: pts.map((q) => q.p) };

  type Q = (typeof pts)[number];
  const cross = (o: Q, a: Q, b: Q) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Q[] = [];
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Q[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) {
    // 一直線上: 両端を結ぶ線
    return { kind: 'line', coords: [pts[0].p, pts[pts.length - 1].p] };
  }
  const ring = hull.map((q) => q.p);
  ring.push(ring[0]);
  return { kind: 'polygon', ring };
}
