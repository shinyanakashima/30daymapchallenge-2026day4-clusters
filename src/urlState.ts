import type { AppSettings, CategorySel, Edition, GroupKey, MapPos } from './types';

export const SCHEMA_VERSION = '1';
export const EPS_MIN = 1;
export const EPS_MAX = 120;
export const MINPTS_MIN = 2;
export const MINPTS_MAX = 10;
export const TITLE_MAX = 40;

/** 版ごとの距離の初期値 (README の比較表から選んだ値) */
export const DEFAULT_EPS: Record<Edition, number> = { '2014': 40, '2010': 25 };

export const DEFAULTS: AppSettings = {
  lang: 'en',
  edition: '2010',
  epsKm: 25,
  minPts: 3,
  cat: { type: 'all' },
  sel: null,
  view: 'clusters',
  map: null,
  title: '',
  showRoads: true,
  showEki: true,
  showAirports: true,
  showRail: true,
  showRailHistory: false,
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

/** URL の版 (ed)。標準は件数の多い 2010年度版。未知の値も 2010。 */
export function parseEdition(search: string): Edition {
  return new URLSearchParams(search).get('ed') === '2014' ? '2014' : '2010';
}

/** URL から設定を読む。未知・不正な値はその項目だけ初期値に戻す。 */
export function parseSettings(search: string, validKinds: ReadonlySet<string>, validIds: ReadonlySet<number>): AppSettings {
  const q = new URLSearchParams(search);
  const s: AppSettings = { ...DEFAULTS, cat: DEFAULTS.cat };
  if (q.get('v') !== SCHEMA_VERSION) return s;
  s.edition = parseEdition(search);
  s.lang = q.get('lang') === 'ja' ? 'ja' : 'en';
  s.epsKm = intIn(q.get('d'), EPS_MIN, EPS_MAX) ?? DEFAULT_EPS[s.edition];
  s.minPts = intIn(q.get('m'), MINPTS_MIN, MINPTS_MAX) ?? DEFAULTS.minPts;
  s.cat = parseCategory(q.get('c'), validKinds) ?? DEFAULTS.cat;
  const sel = intIn(q.get('s'), 0, 999999999);
  s.sel = sel !== null && validIds.has(sel) ? sel : null;
  s.view = q.get('view') === 'points' ? 'points' : 'clusters';
  s.map = parseMap(q.get('map'));
  s.title = cleanTitle(q.get('t') ?? '');
  s.theme = q.get('bm') === 'night' ? 'night' : 'day';
  const ov = q.get('ov');
  if (ov !== null && /^(none|[reath]{1,5})$/.test(ov)) {
    s.showRoads = ov.includes('r');
    s.showEki = ov.includes('e');
    s.showAirports = ov.includes('a');
    s.showRail = ov.includes('t');
    s.showRailHistory = ov.includes('h');
  }
  return s;
}

export function serializeSettings(s: AppSettings): string {
  const q = new URLSearchParams();
  q.set('v', SCHEMA_VERSION);
  if (s.edition !== '2010') q.set('ed', s.edition);
  if (s.lang === 'ja') q.set('lang', 'ja');
  q.set('d', String(s.epsKm));
  q.set('m', String(s.minPts));
  q.set('c', serializeCategory(s.cat));
  if (s.sel !== null) q.set('s', String(s.sel));
  if (s.view === 'points') q.set('view', 'points');
  if (s.map) q.set('map', `${s.map.lon.toFixed(4)},${s.map.lat.toFixed(4)},${s.map.zoom.toFixed(2)}`);
  if (s.title) q.set('t', s.title);
  if (s.theme === 'night') q.set('bm', 'night');
  const flags: [boolean, boolean, string][] = [
    [s.showRoads, DEFAULTS.showRoads, 'r'],
    [s.showEki, DEFAULTS.showEki, 'e'],
    [s.showAirports, DEFAULTS.showAirports, 'a'],
    [s.showRail, DEFAULTS.showRail, 't'],
    [s.showRailHistory, DEFAULTS.showRailHistory, 'h'],
  ];
  if (flags.some(([v, d]) => v !== d)) q.set('ov', flags.map(([v, , c]) => (v ? c : '')).join('') || 'none');
  return q.toString();
}
