// 国土数値情報「道の駅」(P35-18) から北海道分を抜き出し、参考レイヤ用の GeoJSON を作る。
// 観光資源のクラスタリングには含めない (重ねて見るための参考情報)。
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const src = join(process.cwd(), 'data', 'raw', 'P35-18_GML', 'P35-18_Roadside_Station.geojson');
const gj = JSON.parse(await readFile(src, 'utf8'));
const all = gj.features.length;
const features = gj.features
  .filter((f) => f.properties.P35_003 === '北海道')
  .map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7] },
      properties: { name: `道の駅 ${p.P35_006}`, municipality: p.P35_004, code: p.P35_005 },
    };
  })
  .sort((a, b) => a.properties.code.localeCompare(b.properties.code) || a.properties.name.localeCompare(b.properties.name, 'ja'));
await writeFile(join(process.cwd(), 'public', 'data', 'michinoeki.geojson'), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');

const manifestPath = join(process.cwd(), 'public', 'data', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.overlays = {
  michinoeki: {
    name: '国土数値情報 道の駅データ 平成30年 (P35-18)',
    publisher: '国土交通省',
    pageUrl: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P35.html',
    downloadUrl: 'https://nlftp.mlit.go.jp/ksj/gml/data/P35/P35-18/P35-18_GML.zip',
    license: '非商用 (配布ページの使用許諾条件)',
    crs: 'JGD2011 地理座標を EPSG:4326 として扱う',
    filter: 'P35_003 (都道府県名) が「北海道」',
    countAll: all,
    count: features.length,
    note: '参考レイヤ。クラスタリングの対象には含めない。2018年時点の登録で、現在の営業を示さない。',
  },
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`michinoeki: ${features.length} / ${all}`);
