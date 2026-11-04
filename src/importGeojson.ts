import type { KindDef, Resource } from './types';

/** 追加データの ID は元データ (5 桁) と衝突しない範囲に振る。 */
export const USER_ID_BASE = 100_000_000;
export const MAX_USER_POINTS = 2000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const NAME_KEYS = ['name', 'Name', 'NAME', '名称', '名前', 'title', 'タイトル'];
const KIND_KEYS = ['kind', 'category', 'type', 'Category', 'Type', '種別', 'カテゴリ', '分類'];
const ADDRESS_KEYS = ['address', 'Address', '住所', '所在地'];
export const DEFAULT_KIND = '追加データ';

export interface ImportedSet {
  fileName: string;
  importedAt: string;
  resources: Resource[];
  kinds: KindDef[];
  skipped: { reason: string; count: number }[];
  outsideHokkaido: number;
  truncated: number;
}

const pick = (props: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = props[k];
    if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v).trim().slice(0, 80);
  }
  return null;
};

const validLonLat = (c: unknown): c is [number, number] =>
  Array.isArray(c) &&
  c.length >= 2 &&
  typeof c[0] === 'number' &&
  typeof c[1] === 'number' &&
  Number.isFinite(c[0]) &&
  Number.isFinite(c[1]) &&
  Math.abs(c[0]) <= 180 &&
  Math.abs(c[1]) <= 90;

const inHokkaido = (lon: number, lat: number) => lon >= 139 && lon <= 149 && lat >= 41 && lat <= 46;

/**
 * GeoJSON テキストを観光資源として読み込む。点 (Point / MultiPoint) だけを使い、
 * 線・面は代表点に変換しない (元データと同じ方針)。
 */
export function parseImportedGeojson(text: string, fileName: string): ImportedSet {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('JSON として読めませんでした');
  }
  const root = json as { type?: string; features?: unknown[]; geometry?: unknown };
  const features: unknown[] =
    root?.type === 'FeatureCollection' && Array.isArray(root.features)
      ? root.features
      : root?.type === 'Feature'
        ? [root]
        : [];
  if (features.length === 0) throw new Error('GeoJSON の Feature が見つかりませんでした');

  const skipped = new Map<string, number>();
  const skip = (reason: string, n = 1) => skipped.set(reason, (skipped.get(reason) ?? 0) + n);
  const kindKeys = new Map<string, string>();
  const kindCount = new Map<string, number>();
  const resources: Resource[] = [];
  let truncated = 0;

  for (const f of features) {
    const feat = f as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> | null };
    const g = feat?.geometry;
    const props = feat?.properties ?? {};
    let coords: unknown[] = [];
    if (g?.type === 'Point') coords = [g.coordinates];
    else if (g?.type === 'MultiPoint' && Array.isArray(g.coordinates)) coords = g.coordinates;
    else {
      skip(g?.type ? `点以外の形状（${g.type}）` : '形状なし');
      continue;
    }
    for (const c of coords) {
      if (!validLonLat(c)) {
        skip('座標が不正');
        continue;
      }
      if (resources.length >= MAX_USER_POINTS) {
        truncated++;
        continue;
      }
      const kind = pick(props, KIND_KEYS) ?? DEFAULT_KIND;
      if (!kindKeys.has(kind)) kindKeys.set(kind, `u${String(kindKeys.size + 1).padStart(2, '0')}`);
      kindCount.set(kind, (kindCount.get(kind) ?? 0) + 1);
      const n = resources.length + 1;
      resources.push({
        id: USER_ID_BASE + n,
        name: pick(props, NAME_KEYS) ?? `追加地点 ${n}`,
        kind,
        kindKey: kindKeys.get(kind)!,
        group: 'user',
        address: pick(props, ADDRESS_KEYS) ?? '',
        municipalities: [],
        lon: Math.round(c[0] * 1e7) / 1e7,
        lat: Math.round(c[1] * 1e7) / 1e7,
      });
    }
  }
  if (resources.length === 0) throw new Error('使える点がありませんでした（点の Feature が必要です）');
  return {
    fileName: fileName.slice(0, 80),
    importedAt: new Date().toISOString(),
    resources,
    kinds: [...kindKeys].map(([name, key]) => ({ key, name, group: 'user' as const, count: kindCount.get(name)! })),
    skipped: [...skipped].map(([reason, count]) => ({ reason, count })),
    outsideHokkaido: resources.filter((r) => !inHokkaido(r.lon, r.lat)).length,
    truncated,
  };
}

const STORAGE_KEY = 'd4-clusters-imported-v1';

export function loadStoredImport(): ImportedSet | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ImportedSet;
    if (!Array.isArray(s.resources) || !Array.isArray(s.kinds)) return null;
    return s;
  } catch {
    return null;
  }
}

/** 保存できなかった場合は false (読み込み自体は有効)。 */
export function storeImport(set: ImportedSet | null): boolean {
  try {
    if (set) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(set));
    else window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
