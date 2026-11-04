import type { Map as MLMap } from 'maplibre-gl';
import { PALETTE } from './lib/colors';
import { blobRadiusKm, metersPerPixel } from './blob';
import type { Computed } from './model';
import type { Resource, ViewMode } from './types';
import { THEMES, type MapThemeName } from './mapStyle';

const PAPER = '#ffffff'; // 画像の地 (ページと同じ白)
const INK = '#1d2330';
const SUB = '#5a6170';

export interface ExportInfo {
  title: string;
  epsKm: number;
  minPts: number;
  categoryLabel: string;
  view: ViewMode;
  /** 利用者が追加した地点数 */
  userCount: number;
  showRoads: boolean;
  showEki: boolean;
  showAirports: boolean;
  showRail: boolean;
  theme: MapThemeName;
  lang: 'en' | 'ja';
  edition: '2014' | '2010';
}

const FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';
/** 画像に書き込む文言 (英語・日本語) */
const TXT = {
  en: {
    credit2014: 'Data: National Land Numerical Information, Tourism Resources ver. 2.2 (MLIT Japan), as of 30 Sep 2014, non-commercial use',
    credit2010: 'Data: National Land Numerical Information, Tourism Resources ver. 2.0 (MLIT Japan), compiled in FY2010, non-commercial use',
    userData: (n: number) => ` + ${n} spots added by the user`,
    tileNight: 'Base map: GSI Vector Tiles (coastlines, roads) / Terrain: Terrain Tiles (Mapzen and others)',
    tileSat: 'Imagery: Sentinel-2 cloudless (EOX, contains modified Copernicus Sentinel data 2016) / GSI Tiles (seamless photo) / GSI Vector Tiles',
    noTiles: 'Base map omitted because it could not be captured',
    overlays: (list: string) => `${list}: National Land Numerical Information (MLIT Japan)`,
    eki: 'Roadside stations (2018)',
    airports: 'Airports (2021)',
    rail: 'Railways (time series, FY2025)',
    sep: ', ',
    counts: (a: number, b: number, c: number) => `${a} spots · ${b} clusters · ${c} isolated`,
    viewPoints: 'Points only',
    viewClusters: (eps: number, min: number) => `Near = ${eps} km / ${min}+ spots make a cluster`,
    theme: (l: string) => ` / Theme: ${l}`,
    legendMember: 'Spots in a cluster (colors tell clusters apart)',
    legendNoise: 'Isolated spots',
    legendPoints: 'Representative points of tourism resources',
    disclaimer: 'Clusters are based on straight-line distances between representative points, not on transport access or travel patterns.',
  },
  ja: {
    credit2014: '出典：国土数値情報（観光資源 第2.2版）国土交通省／基準日 2014年9月30日／非商用利用',
    credit2010: '出典：国土数値情報（観光資源 第2.0版）国土交通省／2010年度作成／非商用利用',
    userData: (n: number) => `＋利用者の追加データ ${n} 地点`,
    tileNight: '背景：地理院ベクトルタイル（海岸線・道路）／地形：Terrain Tiles（Mapzen ほか）',
    tileSat: '背景：Sentinel-2 cloudless（EOX, Copernicus Sentinel data 2016）／地理院タイル（全国最新写真）／地理院ベクトルタイル',
    noTiles: '背景地図は取得できなかったため省略',
    overlays: (list: string) => `${list}：国土数値情報 国土交通省`,
    eki: '道の駅（2018年）',
    airports: '空港（2021年）',
    rail: '鉄道（鉄道時系列 2025年度版）',
    sep: '・',
    counts: (a: number, b: number, c: number) => `対象 ${a} 地点・まとまり ${b}・孤立点 ${c}`,
    viewPoints: '点だけ表示',
    viewClusters: (eps: number, min: number) => `近所とみなす距離 ${eps} km／${min} 地点から集まり`,
    theme: (l: string) => `／テーマ：${l}`,
    legendMember: 'まとまりに入る地点（色はまとまりの区別）',
    legendNoise: '孤立点',
    legendPoints: '観光資源の代表位置',
    disclaimer: 'まとまりは代表位置間の距離による分類で、交通アクセスや周遊実績を示すものではありません。',
  },
};

/** 地図キャンバスを 1 フレーム描画させてから取り出す (preserveDrawingBuffer 不要)。 */
function grabMapCanvas(map: MLMap): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('地図の描画が終わりませんでした')), 4000);
    map.once('render', () => {
      window.clearTimeout(timer);
      try {
        const src = map.getCanvas();
        const copy = document.createElement('canvas');
        copy.width = src.width;
        copy.height = src.height;
        const ctx = copy.getContext('2d')!;
        ctx.drawImage(src, 0, 0);
        // CORS で汚染されていればここで例外になる
        ctx.getImageData(0, 0, 1, 1);
        resolve(copy);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    map.triggerRepaint();
  });
}

/**
 * 地図・凡例・出典・基準年を入れた PNG を作る。
 * 背景地図を取り出せなければ、背景を省いた出典付きカードに切り替える。
 */
export async function exportPng(
  map: MLMap,
  computed: Computed | null,
  resources: Resource[],
  info: ExportInfo,
): Promise<{ blob: Blob; fallback: boolean; reason?: string }> {
  const T = THEMES[info.theme];
  const X = TXT[info.lang];
  const MAP_BG = T.bg;
  const NOISE_FILL = T.noiseFill;
  const NOISE_STROKE = T.noiseStroke;
  const PLAIN_POINT = T.plainPoint;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = map.getContainer().clientWidth;
  const cssH = map.getContainer().clientHeight;
  let mapCanvas: HTMLCanvasElement | null = null;
  let reason: string | undefined;
  try {
    mapCanvas = await grabMapCanvas(map);
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e);
  }

  const W = Math.round(Math.max(cssW, 640) * dpr);
  const headH = Math.round(76 * dpr);
  const footH = Math.round(124 * dpr);
  const mapH = Math.round(cssH * dpr * (Math.max(cssW, 640) / cssW));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = headH + mapH + footH;
  const ctx = canvas.getContext('2d')!;
  const s = dpr;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 見出し
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${20 * s}px ${FONT}`;
  ctx.fillText(info.title || 'Kawaii clusters of Hokkaido — How Near Is Near?', 20 * s, 34 * s);
  ctx.font = `${12.5 * s}px ${FONT}`;
  ctx.fillStyle = SUB;
  const counts = computed ? X.counts(computed.targetIds.length, computed.groups.length, computed.noise.length) : '';
  const viewLabel = info.view === 'points' ? X.viewPoints : X.viewClusters(info.epsKm, info.minPts);
  ctx.fillText(`${viewLabel}${X.theme(info.categoryLabel)}　${counts}`, 20 * s, 58 * s);

  // 地図部分
  const scale = mapH / (cssH * dpr) || 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, headH, W, mapH);
  ctx.clip();
  if (mapCanvas) {
    ctx.drawImage(mapCanvas, 0, headH, W, mapH);
  } else {
    // 背景を省いたカード: 点と輪郭を自前で描く
    ctx.fillStyle = MAP_BG;
    ctx.fillRect(0, headH, W, mapH);
    const k = dpr * scale;
    const proj = (lon: number, lat: number) => {
      const p = map.project([lon, lat]);
      return [p.x * k, headH + p.y * k] as const;
    };
    if (computed && info.view === 'clusters') {
      // にじみ: 色ごとに不透明の円を重ねてから半透明で合成し、重なりを 1 枚に見せる
      const rPx = ((blobRadiusKm(info.epsKm) * 1000) / metersPerPixel(map.getZoom())) * k;
      for (const g of computed.groups) {
        const layer = document.createElement('canvas');
        layer.width = W;
        layer.height = canvas.height;
        const lc = layer.getContext('2d')!;
        lc.fillStyle = PALETTE[g.color];
        for (const id of g.members) {
          const r = resources.find((x) => x.id === id)!;
          const [x, y] = proj(r.lon, r.lat);
          lc.beginPath();
          lc.arc(x, y, rPx, 0, Math.PI * 2);
          lc.fill();
        }
        ctx.globalAlpha = 0.24;
        ctx.drawImage(layer, 0, 0);
        ctx.globalAlpha = 1;
      }
    }
    const target = new Set(computed?.targetIds ?? []);
    for (const r of resources) {
      const [x, y] = proj(r.lon, r.lat);
      const g = computed?.groupOf.get(r.id);
      ctx.beginPath();
      if (!target.has(r.id)) {
        ctx.arc(x, y, 2.5 * k, 0, Math.PI * 2);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = NOISE_STROKE;
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.arc(x, y, 5 * k, 0, Math.PI * 2);
      if (info.view === 'points' || g) {
        ctx.fillStyle = info.view === 'points' || !g ? PLAIN_POINT : PALETTE[g.color];
        ctx.fill();
        ctx.strokeStyle = T.memberStroke;
        ctx.lineWidth = 1.4 * k;
      } else {
        ctx.fillStyle = NOISE_FILL;
        ctx.fill();
        ctx.strokeStyle = NOISE_STROKE;
        ctx.lineWidth = 1.8 * k;
      }
      ctx.stroke();
    }
  }
  // 地点数バッジ (HTML マーカーはキャンバスに入らないので描き直す)
  if (computed && info.view === 'clusters') {
    const k = dpr * scale;
    for (const g of computed.groups) {
      const p = map.project(g.centroid);
      const x = p.x * k;
      const y = headH + (p.y - 16) * k;
      ctx.beginPath();
      ctx.arc(x, y, 11 * k, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2 * k;
      ctx.strokeStyle = PALETTE[g.color];
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `600 ${11 * k}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(g.members.length), x, y + 0.5 * k);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
  ctx.restore();

  // 凡例と出典
  const fy = headH + mapH;
  ctx.fillStyle = INK;
  ctx.font = `${12 * s}px ${FONT}`;
  let x = 20 * s;
  const ly = fy + 26 * s;
  if (info.view === 'clusters') {
    ctx.beginPath();
    ctx.arc(x + 5 * s, ly - 4 * s, 5 * s, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE[0];
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(X.legendMember, x + 16 * s, ly);
    x += ctx.measureText(X.legendMember).width + 36 * s;
    ctx.beginPath();
    ctx.arc(x + 5 * s, ly - 4 * s, 4.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = NOISE_FILL;
    ctx.fill();
    ctx.strokeStyle = NOISE_STROKE;
    ctx.lineWidth = 1.8 * s;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(X.legendNoise, x + 16 * s, ly);
  } else {
    ctx.beginPath();
    ctx.arc(x + 5 * s, ly - 4 * s, 5 * s, 0, Math.PI * 2);
    ctx.fillStyle = PLAIN_POINT;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(X.legendPoints, x + 16 * s, ly);
  }
  ctx.fillStyle = SUB;
  ctx.font = `${11 * s}px ${FONT}`;
  ctx.fillText(X.disclaimer, 20 * s, fy + 50 * s);
  ctx.fillText((info.edition === '2010' ? X.credit2010 : X.credit2014) + (info.userCount ? X.userData(info.userCount) : ''), 20 * s, fy + 70 * s);
  const tile = mapCanvas ? (T.satellite ? X.tileSat : X.tileNight) : X.noTiles;
  ctx.fillText(tile, 20 * s, fy + 88 * s);
  const overlays = [info.showEki ? X.eki : '', info.showAirports ? X.airports : '', info.showRail ? X.rail : ''].filter(Boolean);
  if (overlays.length && mapCanvas) ctx.fillText(X.overlays(overlays.join(X.sep)), 20 * s, fy + 106 * s);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('PNG を作成できませんでした');
  return { blob, fallback: !mapCanvas, reason };
}
