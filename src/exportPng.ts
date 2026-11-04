import type { Map as MLMap } from 'maplibre-gl';
import { PALETTE } from './lib/colors';
import { blobRadiusKm, metersPerPixel } from './blob';
import type { Computed } from './model';
import type { Resource, ViewMode } from './types';
import { INK, NOISE_STROKE, PAPER, PLAIN_POINT } from './mapStyle';

export interface ExportInfo {
  title: string;
  epsKm: number;
  minPts: number;
  categoryLabel: string;
  view: ViewMode;
  /** 利用者が追加した地点数 */
  userCount: number;
}

const FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';
const DATA_CREDIT = '出典：国土数値情報（観光資源）国土交通省／基準日 2014年9月30日／非商用利用';
const TILE_CREDIT = '背景：地理院タイル（淡色地図）';

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
  const footH = Math.round(108 * dpr);
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
  ctx.fillText(info.title || '北海道、旅のまとまりを探して。', 20 * s, 34 * s);
  ctx.font = `${12.5 * s}px ${FONT}`;
  ctx.fillStyle = '#5c564d';
  const counts = computed ? `対象 ${computed.targetIds.length} 地点・まとまり ${computed.groups.length}・孤立点 ${computed.noise.length}` : '';
  const viewLabel = info.view === 'points' ? '点だけ表示' : `近所とみなす距離 ${info.epsKm} km／${info.minPts} 地点から集まり`;
  ctx.fillText(`${viewLabel}／テーマ：${info.categoryLabel}　${counts}`, 20 * s, 58 * s);

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
    ctx.fillStyle = '#ebe4d6';
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
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.4 * k;
      } else {
        ctx.fillStyle = PAPER;
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
      ctx.fillStyle = '#fffdf8';
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
    ctx.fillText('まとまりに入る地点（色はまとまりの区別）', x + 16 * s, ly);
    x += ctx.measureText('まとまりに入る地点（色はまとまりの区別）').width + 36 * s;
    ctx.beginPath();
    ctx.arc(x + 5 * s, ly - 4 * s, 4.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.strokeStyle = NOISE_STROKE;
    ctx.lineWidth = 1.8 * s;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText('孤立点', x + 16 * s, ly);
  } else {
    ctx.beginPath();
    ctx.arc(x + 5 * s, ly - 4 * s, 5 * s, 0, Math.PI * 2);
    ctx.fillStyle = PLAIN_POINT;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText('観光資源の代表位置', x + 16 * s, ly);
  }
  ctx.fillStyle = '#5c564d';
  ctx.font = `${11 * s}px ${FONT}`;
  ctx.fillText('まとまりは代表位置間の距離による分類で、交通アクセスや周遊実績を示すものではありません。', 20 * s, fy + 50 * s);
  ctx.fillText(info.userCount ? `${DATA_CREDIT}＋利用者の追加データ ${info.userCount} 地点` : DATA_CREDIT, 20 * s, fy + 72 * s);
  ctx.fillText(mapCanvas ? TILE_CREDIT : '背景地図は取得できなかったため省略', 20 * s, fy + 92 * s);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('PNG を作成できませんでした');
  return { blob, fallback: !mapCanvas, reason };
}
