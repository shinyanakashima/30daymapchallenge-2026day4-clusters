import type { StyleSpecification } from 'maplibre-gl';

export const PAPER = '#f3eee4';
export const INK = '#26231f';
export const NOISE_STROKE = '#5f5a52';
export const PLAIN_POINT = '#3b3833';

export const TILE_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
export const DATA_ATTRIBUTION =
  '<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P12-v2_2.html" target="_blank" rel="noopener">国土数値情報（観光資源）2014年 国土交通省</a>';

export const HOKKAIDO_BOUNDS: [[number, number], [number, number]] = [
  [139.3, 41.3],
  [145.9, 45.6],
];

export const baseStyle: StyleSpecification = {
  version: 8,
  sources: {
    gsi: {
      type: 'raster',
      tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 2,
      maxzoom: 18,
      attribution: TILE_ATTRIBUTION,
    },
  },
  layers: [
    { id: 'paper', type: 'background', paint: { 'background-color': PAPER } },
    {
      id: 'gsi',
      type: 'raster',
      source: 'gsi',
      paint: { 'raster-saturation': -0.75, 'raster-opacity': 0.72, 'raster-contrast': -0.1 },
    },
  ],
};
