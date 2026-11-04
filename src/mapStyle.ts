import type { StyleSpecification } from 'maplibre-gl';

// 夜の地形図をイメージした暗い配色
export const MAP_BG = '#0d1117';
export const INK = '#f2eee6'; // 地図上の強調 (選択の縁取りなど)
export const NOISE_FILL = '#11141a';
export const NOISE_STROKE = '#b8b3aa';
export const PLAIN_POINT = '#e9e5dd';
export const COAST = '#bcd0e4';
export const ROAD_COLORS = { motorway: '#9fb4d6', national: '#7f97b8', other: '#5f7591' };

export const TILE_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/vt.html" target="_blank" rel="noopener">地理院ベクトルタイル</a>' +
  '｜地形 <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain Tiles (Mapzen ほか)</a>';
export const DATA_ATTRIBUTION =
  '<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P12-v2_2.html" target="_blank" rel="noopener">国土数値情報（観光資源 2014年・道の駅 2018年）国土交通省</a>';

export const HOKKAIDO_BOUNDS: [[number, number], [number, number]] = [
  [139.3, 41.3],
  [145.9, 45.6],
];

const ROAD_FILTER = {
  motorway: ['==', ['get', 'vt_rdctg'], '高速自動車国道等'],
  national: ['==', ['get', 'vt_rdctg'], '国道'],
  other: ['match', ['get', 'vt_rdctg'], ['都道府県道', '主要道路'], true, false],
} as const;

/** 道路の光る線 (にじみ + 芯) */
function roadLayers(): StyleSpecification['layers'] {
  const out: StyleSpecification['layers'] = [];
  for (const key of ['other', 'national', 'motorway'] as const) {
    const color = ROAD_COLORS[key];
    const base = key === 'motorway' ? 1 : key === 'national' ? 0.7 : 0.45;
    out.push({
      id: `road-glow-${key}`,
      type: 'line',
      source: 'gsi',
      'source-layer': 'RdCL',
      filter: ROAD_FILTER[key] as never,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': color,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, base * 2.5, 12, base * 7],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 5, 2, 12, 5],
        'line-opacity': key === 'other' ? 0.06 : 0.1,
      },
    });
    out.push({
      id: `road-${key}`,
      type: 'line',
      source: 'gsi',
      'source-layer': 'RdCL',
      filter: ROAD_FILTER[key] as never,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': color,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, base * 0.7, 12, base * 1.6],
        'line-opacity': key === 'other' ? 0.35 : 0.55,
      },
    });
  }
  return out;
}

export const ROAD_LAYER_IDS = (['other', 'national', 'motorway'] as const).flatMap((k) => [`road-glow-${k}`, `road-${k}`]);

export const baseStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    dem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      minzoom: 0,
      maxzoom: 12,
    },
    gsi: {
      type: 'vector',
      tiles: ['https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf'],
      minzoom: 4,
      maxzoom: 16,
      attribution: TILE_ATTRIBUTION,
    },
  },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': MAP_BG } },
    {
      id: 'relief',
      type: 'color-relief',
      source: 'dem',
      paint: {
        'color-relief-color': [
          'interpolate', ['linear'], ['elevation'],
          -4000, '#0a0e14',
          -200, '#0e131a',
          -1, '#10161e',
          0, '#1b1e23',
          300, '#202328',
          1000, '#272a2f',
          2000, '#303338',
        ],
      },
    },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-exaggeration': 0.55,
        'hillshade-shadow-color': '#000000',
        'hillshade-highlight-color': 'rgba(255,255,255,0.14)',
        'hillshade-accent-color': 'rgba(0,0,0,0)',
      },
    },
    ...roadLayers(),
    {
      id: 'coast-glow',
      type: 'line',
      source: 'gsi',
      'source-layer': 'Cstline',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': COAST,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 10, 10],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 8],
        'line-opacity': 0.16,
      },
    },
    {
      id: 'coast',
      type: 'line',
      source: 'gsi',
      'source-layer': 'Cstline',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': COAST, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1.1], 'line-opacity': 0.6 },
    },
    {
      id: 'place-label',
      type: 'symbol',
      source: 'gsi',
      'source-layer': 'Anno',
      filter: ['match', ['get', 'vt_code'], [1301, 1302, 1303], true, false],
      layout: {
        'text-field': ['get', 'vt_text'],
        'text-font': ['Open Sans Semibold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 10, 13],
        'text-letter-spacing': 0.08,
        'text-padding': 6,
      },
      paint: { 'text-color': 'rgba(235,230,222,0.55)', 'text-halo-color': 'rgba(10,12,17,0.9)', 'text-halo-width': 1.2 },
    },
  ],
};
