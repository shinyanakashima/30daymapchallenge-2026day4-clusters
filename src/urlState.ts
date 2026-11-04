import type { AppSettings, CategorySel, GroupKey, MapPos } from './types';

export const SCHEMA_VERSION = '1';
export const EPS_MIN = 1;
export const EPS_MAX = 120;
export const MINPTS_MIN = 2;
export const MINPTS_MAX = 10;
export const TITLE_MAX = 40;

export const DEFAULTS: AppSettings = {
  epsKm: 40,
  minPts: 3,
  cat: { type: 'all' },
  sel: null,
  view: 'clusters',
  map: null,
  title: '',
  showRoads: true,
  showEki: true,
  showAirports: true,
  theme: 'day',
};

const GROUPS: GroupKey[] = ['nature', 'culture', 'unclassified', 'user'];

const intIn = (raw: string | null, min: number, max: number): number | null => {
  if (raw === null || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
};

export function cleanTitle(raw: string): string {
  // 制御文字を除き、長さを制限する。表示は常にテキストとして行う。
  return Array.from(raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, TITLE_MAX).join('');
}

export function parseCategory(raw: string | null, validKinds: ReadonlySet<string>): CategorySel | null {
  if (raw === null) return null;
  if (raw === 'all') return { type: 'all' };
  if ((GROUPS as string[]).includes(raw)) return { type: 'group', group: raw as GroupKey };
  if (raw === 'none') return { type: 'kinds', keys: [] };
  const keys = raw.split('.');
  if (keys.length > 0 && keys.every((k) => validKinds.has(k))) {
    return { type: 'kinds', keys: [...new Set(keys)].sort() };
  }
  return null;
}

export function serializeCategory(cat: CategorySel): string {
  if (cat.type === 'all') return 'all';
  if (cat.type === 'group') return cat.group;
  return cat.keys.length ? [...cat.keys].sort().join('.') : 'none';
}

function parseMap(raw: string | null): MapPos | null {
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lon, lat, zoom] = parts;
  if (lon < 135 || lon > 151 || lat < 38 || lat > 48 || zoom < 3 || zoom > 15) return null;
  return { lon, lat, zoom };
}

/** URL から設定を読む。未知・不正な値はその項目だけ初期値に戻す。 */
export function parseSettings(search: string, validKinds: ReadonlySet<string>, validIds: ReadonlySet<number>): AppSettings {
  const q = new URLSearchParams(search);
  const s: AppSettings = { ...DEFAULTS, cat: DEFAULTS.cat };
  if (q.get('v') !== SCHEMA_VERSION) return s;
  s.epsKm = intIn(q.get('d'), EPS_MIN, EPS_MAX) ?? DEFAULTS.epsKm;
  s.minPts = intIn(q.get('m'), MINPTS_MIN, MINPTS_MAX) ?? DEFAULTS.minPts;
  s.cat = parseCategory(q.get('c'), validKinds) ?? DEFAULTS.cat;
  const sel = intIn(q.get('s'), 0, 999999999);
  s.sel = sel !== null && validIds.has(sel) ? sel : null;
  s.view = q.get('view') === 'points' ? 'points' : 'clusters';
  s.map = parseMap(q.get('map'));
  s.title = cleanTitle(q.get('t') ?? '');
  s.theme = q.get('bm') === 'night' ? 'night' : 'day';
  const ov = q.get('ov');
  if (ov !== null && /^(none|[rea]{1,3})$/.test(ov)) {
    s.showRoads = ov.includes('r');
    s.showEki = ov.includes('e');
    s.showAirports = ov.includes('a');
  }
  return s;
}

export function serializeSettings(s: AppSettings): string {
  const q = new URLSearchParams();
  q.set('v', SCHEMA_VERSION);
  q.set('d', String(s.epsKm));
  q.set('m', String(s.minPts));
  q.set('c', serializeCategory(s.cat));
  if (s.sel !== null) q.set('s', String(s.sel));
  if (s.view === 'points') q.set('view', 'points');
  if (s.map) q.set('map', `${s.map.lon.toFixed(4)},${s.map.lat.toFixed(4)},${s.map.zoom.toFixed(2)}`);
  if (s.title) q.set('t', s.title);
  if (s.theme === 'night') q.set('bm', 'night');
  if (!s.showRoads || !s.showEki || !s.showAirports) {
    q.set('ov', (s.showRoads ? 'r' : '') + (s.showEki ? 'e' : '') + (s.showAirports ? 'a' : '') || 'none');
  }
  return q.toString();
}
