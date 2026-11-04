import type { Map as MLMap, StyleSpecification } from 'maplibre-gl';

export type MapThemeName = 'day' | 'night';

export interface MapTheme {
  bg: string;
  relief: (string | number)[];
  hillShadow: string;
  hillHighlight: string;
  hillExaggeration: number;
  coast: string;
  coastOpacity: number;
  coastGlowOpacity: number;
  roads: { motorway: string; national: string; other: string };
  roadOpacity: { core: [number, number]; glow: [number, number] }; // [その他, 国道・高速]
  label: string;
  labelHalo: string;
  /** 選択の縁取りなど地図上の強調 */
  ink: string;
  memberStroke: string;
  noiseFill: string;
  noiseStroke: string;
  plainPoint: string;
  airport: string;
  airportCore: string;
  /** 空港の光の強さ (夜 = 1) */
  airportGlow: number;
  ekiFill: string;
  ekiStroke: string;
  blobAlpha: number;
  rail: string;
  railDash: string;
  railGlowOpacity: number;
  railHistory: string;
  stationFill: string;
  stationStroke: string;
  selectedOverlay: string;
  palette: string[];
}

export const THEMES: Record<MapThemeName, MapTheme> = {
  // 昼: 白い陸と淡い水色の海
  day: {
    bg: '#cfe5f2',
    relief: [-4000, '#a9cfe6', -200, '#c3dff0', -1, '#cfe5f2', 0, '#fbfaf7', 400, '#f5f3ee', 1200, '#ece9e2', 2000, '#e3dfd7'],
    hillShadow: 'rgba(70, 80, 95, 0.38)',
    hillHighlight: 'rgba(255, 255, 255, 0.7)',
    hillExaggeration: 0.35,
    coast: '#8fb8d3',
    coastOpacity: 0.9,
    coastGlowOpacity: 0.12,
    roads: { motorway: '#e0a35c', national: '#c3bdb2', other: '#d6d1c8' },
    roadOpacity: { core: [0.8, 0.9], glow: [0, 0.12] },
    label: '#5a6170',
    labelHalo: 'rgba(255, 255, 255, 0.95)',
    ink: '#1d2330',
    memberStroke: '#ffffff',
    noiseFill: '#ffffff',
    noiseStroke: '#6b7280',
    plainPoint: '#3a4150',
    airport: '#ff9a3c',
    airportCore: '#ffffff',
    airportGlow: 1.8,
    ekiFill: '#ffffff',
    ekiStroke: '#7b8494',
    blobAlpha: 0.24,
    rail: '#4a5262',
    railDash: '#ffffff',
    railGlowOpacity: 0,
    railHistory: '#8e97a8',
    stationFill: '#ffffff',
    stationStroke: '#3a4150',
    selectedOverlay: 'rgba(29, 35, 48, 0.1)',
    palette: ['#d9822b', '#1f9e94', '#7b61c9', '#5f9a2e', '#d0573a', '#2f7fc8', '#c2508a', '#2a9d6f'],
  },
  // 夜: 暗い地形と淡く光る海岸線・道路
  night: {
    bg: '#0d1117',
    relief: [-4000, '#0a0e14', -200, '#0e131a', -1, '#10161e', 0, '#1b1e23', 300, '#202328', 1000, '#272a2f', 2000, '#303338'],
    hillShadow: '#000000',
    hillHighlight: 'rgba(255, 255, 255, 0.14)',
    hillExaggeration: 0.55,
    coast: '#bcd0e4',
    coastOpacity: 0.6,
    coastGlowOpacity: 0.16,
    roads: { motorway: '#9fb4d6', national: '#7f97b8', other: '#5f7591' },
    roadOpacity: { core: [0.35, 0.55], glow: [0.06, 0.1] },
    label: 'rgba(235, 230, 222, 0.55)',
    labelHalo: 'rgba(10, 12, 17, 0.9)',
    ink: '#f2eee6',
    memberStroke: '#0d1117',
    noiseFill: '#11141a',
    noiseStroke: '#b8b3aa',
    plainPoint: '#e9e5dd',
    airport: '#ffd98a',
    airportCore: '#fff7e6',
    airportGlow: 1,
    ekiFill: '#0a0c11',
    ekiStroke: '#d8d2c6',
    blobAlpha: 0.22,
    rail: '#d5dbe6',
    railDash: '#0d1117',
    railGlowOpacity: 0.22,
    railHistory: '#6b7486',
    stationFill: '#0d1117',
    stationStroke: '#d5dbe6',
    selectedOverlay: 'rgba(242, 238, 230, 0.1)',
    palette: ['#e3b36b', '#6bc2bd', '#a99ad9', '#a3c47e', '#de8d72', '#7ea8d6', '#d493b3', '#8fcfb3'],
  },
};

export const TILE_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/vt.html" target="_blank" rel="noopener">地理院ベクトルタイル</a>' +
  '｜地形 <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain Tiles (Mapzen ほか)</a>';
export const DATA_ATTRIBUTION =
  '<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P12-v2_2.html" target="_blank" rel="noopener">国土数値情報（観光資源・道の駅・空港・鉄道時系列）国土交通省</a>';

export const HOKKAIDO_BOUNDS: [[number, number], [number, number]] = [
  [139.3, 41.3],
  [145.9, 45.6],
];

const ROAD_KEYS = ['other', 'national', 'motorway'] as const;
const ROAD_FILTER = {
  motorway: ['==', ['get', 'vt_rdctg'], '高速自動車国道等'],
  national: ['==', ['get', 'vt_rdctg'], '国道'],
  other: ['match', ['get', 'vt_rdctg'], ['都道府県道', '主要道路'], true, false],
} as const;
const ROAD_BASE = { motorway: 1, national: 0.7, other: 0.45 };
export const ROAD_LAYER_IDS = ROAD_KEYS.flatMap((k) => [`road-glow-${k}`, `road-${k}`]);

export function buildBaseStyle(t: MapTheme): StyleSpecification {
  const roads: StyleSpecification['layers'] = ROAD_KEYS.flatMap((key) => {
    const base = ROAD_BASE[key];
    const i = key === 'other' ? 0 : 1;
    return [
      {
        id: `road-glow-${key}`,
        type: 'line',
        source: 'gsi',
        'source-layer': 'RdCL',
        filter: ROAD_FILTER[key] as never,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': t.roads[key],
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, base * 2.5, 12, base * 7],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 5, 2, 12, 5],
          'line-opacity': t.roadOpacity.glow[i],
        },
      },
      {
        id: `road-${key}`,
        type: 'line',
        source: 'gsi',
        'source-layer': 'RdCL',
        filter: ROAD_FILTER[key] as never,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': t.roads[key],
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, base * 0.7, 12, base * 1.8],
          'line-opacity': t.roadOpacity.core[i],
        },
      },
    ] as StyleSpecification['layers'];
  });
  return {
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
      { id: 'sea', type: 'background', paint: { 'background-color': t.bg } },
      {
        id: 'relief',
        type: 'color-relief',
        source: 'dem',
        paint: { 'color-relief-color': ['interpolate', ['linear'], ['elevation'], ...t.relief] as never },
      },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem',
        paint: {
          'hillshade-exaggeration': t.hillExaggeration,
          'hillshade-shadow-color': t.hillShadow,
          'hillshade-highlight-color': t.hillHighlight,
          'hillshade-accent-color': 'rgba(0,0,0,0)',
        },
      },
      ...roads,
      {
        id: 'coast-glow',
        type: 'line',
        source: 'gsi',
        'source-layer': 'Cstline',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': t.coast,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 10, 10],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 8],
          'line-opacity': t.coastGlowOpacity,
        },
      },
      {
        id: 'coast',
        type: 'line',
        source: 'gsi',
        'source-layer': 'Cstline',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': t.coast, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1.1], 'line-opacity': t.coastOpacity },
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
        paint: { 'text-color': t.label, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.2 },
      },
    ],
  };
}

/** 背景部分の配色だけを切り替える (データ側のレイヤは MapView が塗り直す)。 */
export function applyBaseTheme(map: MLMap, t: MapTheme) {
  map.setPaintProperty('sea', 'background-color', t.bg);
  map.setPaintProperty('relief', 'color-relief-color', ['interpolate', ['linear'], ['elevation'], ...t.relief]);
  map.setPaintProperty('hillshade', 'hillshade-exaggeration', t.hillExaggeration);
  map.setPaintProperty('hillshade', 'hillshade-shadow-color', t.hillShadow);
  map.setPaintProperty('hillshade', 'hillshade-highlight-color', t.hillHighlight);
  for (const key of ROAD_KEYS) {
    const i = key === 'other' ? 0 : 1;
    map.setPaintProperty(`road-glow-${key}`, 'line-color', t.roads[key]);
    map.setPaintProperty(`road-glow-${key}`, 'line-opacity', t.roadOpacity.glow[i]);
    map.setPaintProperty(`road-${key}`, 'line-color', t.roads[key]);
    map.setPaintProperty(`road-${key}`, 'line-opacity', t.roadOpacity.core[i]);
  }
  map.setPaintProperty('coast-glow', 'line-color', t.coast);
  map.setPaintProperty('coast-glow', 'line-opacity', t.coastGlowOpacity);
  map.setPaintProperty('coast', 'line-color', t.coast);
  map.setPaintProperty('coast', 'line-opacity', t.coastOpacity);
  map.setPaintProperty('place-label', 'text-color', t.label);
  map.setPaintProperty('place-label', 'text-halo-color', t.labelHalo);
}
