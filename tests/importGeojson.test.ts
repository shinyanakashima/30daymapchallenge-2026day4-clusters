import { describe, expect, it } from 'vitest';
import { DEFAULT_KIND, MAX_USER_POINTS, parseImportedGeojson, USER_ID_BASE } from '../src/importGeojson';

const fc = (features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features });
const pt = (lon: number, lat: number, properties: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties,
});

describe('parseImportedGeojson', () => {
  it('名称・種別・住所をよくあるキーから拾う', () => {
    const s = parseImportedGeojson(
      fc([pt(143.2, 42.9, { 名称: '帯広駅', 種別: '駅', 住所: '帯広市' }), pt(143.3, 42.95, { name: 'A', category: 'カフェ' })]),
      'my.geojson',
    );
    expect(s.resources.map((r) => [r.name, r.kind, r.address])).toEqual([
      ['帯広駅', '駅', '帯広市'],
      ['A', 'カフェ', ''],
    ]);
    expect(s.resources[0].id).toBe(USER_ID_BASE + 1);
    expect(s.resources.every((r) => r.group === 'user')).toBe(true);
    expect(s.kinds.map((k) => k.name)).toEqual(['駅', 'カフェ']);
  });

  it('名称・種別がなければ補う', () => {
    const s = parseImportedGeojson(fc([pt(143, 43)]), 'x.json');
    expect(s.resources[0].name).toBe('追加地点 1');
    expect(s.resources[0].kind).toBe(DEFAULT_KIND);
  });

  it('MultiPoint は点ごとに展開し、線・面・不正座標は理由つきで除外する', () => {
    const s = parseImportedGeojson(
      fc([
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[143, 43], [143.1, 43.1]] }, properties: {} },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[143, 43], [144, 44]] }, properties: {} },
        pt(999, 43),
      ]),
      'x.json',
    );
    expect(s.resources).toHaveLength(2);
    expect(s.skipped).toEqual([
      { reason: '点以外の形状（LineString）', count: 1 },
      { reason: '座標が不正', count: 1 },
    ]);
  });

  it('北海道の外の点も保持し、件数を数える', () => {
    const s = parseImportedGeojson(fc([pt(139.7, 35.7), pt(143, 43)]), 'x.json');
    expect(s.resources).toHaveLength(2);
    expect(s.outsideHokkaido).toBe(1);
  });

  it('上限を超えた分は切り捨てて件数を返す', () => {
    const many = Array.from({ length: MAX_USER_POINTS + 5 }, (_, i) => pt(143 + i * 1e-4, 43));
    const s = parseImportedGeojson(fc(many), 'x.json');
    expect(s.resources).toHaveLength(MAX_USER_POINTS);
    expect(s.truncated).toBe(5);
  });

  it('JSON でない・点がない場合はエラー', () => {
    expect(() => parseImportedGeojson('not json', 'x')).toThrow('JSON');
    expect(() => parseImportedGeojson(fc([]), 'x')).toThrow();
    expect(() => parseImportedGeojson(fc([{ type: 'Feature', geometry: null, properties: {} }]), 'x')).toThrow('使える点');
  });
});
