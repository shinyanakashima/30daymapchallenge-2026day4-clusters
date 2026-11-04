/**
 * まとまりの「にじみ」表現の寸法。
 * 各メンバー点のまわりに半径 ε/2 のにじみを描く。2 点のにじみが重なるのは、
 * おおむね 2 点の距離が ε 以内のとき (= DBSCAN の近所) になる。
 *
 * MapLibre の heatmap はガウス核 0.3989·exp(-4.5·(d/r)²) を足し合わせる。
 * 濃度 BLOB_THRESHOLD 以上を塗ると、1 点だけのにじみの見た目の半径は r·VISIBLE_RATIO。
 */
export const BLOB_THRESHOLD = 0.05;
export const VISIBLE_RATIO = Math.sqrt(Math.log(0.3989422804 / BLOB_THRESHOLD) / 4.5); // ≈ 0.68
const EARTH_CIRCUMFERENCE_M = 40075016.686;
/** 北海道の代表緯度。ピクセル換算の基準に使う。 */
export const REF_LAT = 43.5;
const MAX_RADIUS_PX = 1200;

/** 見た目の半径 (km) */
export const blobRadiusKm = (epsKm: number) => epsKm / 2;

/** ズーム z でのメートル/ピクセル (MapLibre は 512px タイル基準) */
export const metersPerPixel = (zoom: number, lat = REF_LAT) =>
  (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);

/** heatmap-radius のズーム式 */
export function heatmapRadiusExpr(epsKm: number): unknown[] {
  const kernelM = (blobRadiusKm(epsKm) * 1000) / VISIBLE_RATIO;
  const stops: number[] = [];
  for (let z = 3; z <= 15; z++) stops.push(z, Math.min(MAX_RADIUS_PX, Math.max(1, kernelM / metersPerPixel(z))));
  return ['interpolate', ['exponential', 2], ['zoom'], ...stops];
}

export const hexToRgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
