import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gj = JSON.parse(readFileSync('public/data/resources.geojson', 'utf8'));
const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
const cats = JSON.parse(readFileSync('public/data/categories.json', 'utf8'));

describe('配信データ', () => {
  it('件数が manifest と一致する', () => {
    expect(gj.features.length).toBe(manifest.stats.validPoints);
    expect(manifest.stats.totalRecords - manifest.stats.excluded).toBe(manifest.stats.validPoints);
  });
  it('ID は一意で、すべての種別が対応表にある', () => {
    const ids = gj.features.map((f: { properties: { id: number } }) => f.properties.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = new Set(cats.kinds.map((k: { key: string }) => k.key));
    for (const f of gj.features) expect(keys.has(f.properties.kindKey)).toBe(true);
    const sum = cats.kinds.reduce((s: number, k: { count: number }) => s + k.count, 0);
    expect(sum).toBe(gj.features.length);
  });
  it('座標は北海道の範囲', () => {
    for (const f of gj.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThan(139);
      expect(lon).toBeLessThan(149);
      expect(lat).toBeGreaterThan(41);
      expect(lat).toBeLessThan(46);
    }
  });
});

describe('配信データ (2010年度版・比較用)', () => {
  const gj10 = JSON.parse(readFileSync('public/data/resources-2010.geojson', 'utf8'));
  const m10 = JSON.parse(readFileSync('public/data/manifest-2010.json', 'utf8'));
  const c10 = JSON.parse(readFileSync('public/data/categories-2010.json', 'utf8'));
  it('件数が manifest と一致し、除外理由が記録されている', () => {
    expect(gj10.features.length).toBe(m10.stats.validPoints);
    expect(m10.stats.totalRecords - m10.excludedRecords.length).toBe(m10.stats.validPoints);
    expect(m10.excludedRecords.every((e: { reason: string }) => e.reason.length > 0)).toBe(true);
  });
  it('ID は 2014年版と重ならず一意、自治体名がすべて引けている', () => {
    const ids = gj10.features.map((f: { properties: { id: number } }) => f.properties.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBeGreaterThan(20000);
    expect(m10.stats.unknownMunicipalityCodes).toEqual([]);
    const keys = new Set(c10.kinds.map((k: { key: string }) => k.key));
    for (const f of gj10.features) expect(keys.has(f.properties.kindKey)).toBe(true);
  });
});
