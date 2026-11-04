import { describe, expect, it } from 'vitest';
import { DEFAULTS, parseSettings, serializeSettings, TITLE_MAX } from '../src/urlState';
import type { AppSettings } from '../src/types';

const kinds = new Set(['k01', 'k02', 'k03']);
const ids = new Set([10001, 10007, 10035]);

describe('urlState', () => {
  it('往復しても同じ設定になる', () => {
    const s: AppSettings = {
      epsKm: 62,
      minPts: 4,
      cat: { type: 'kinds', keys: ['k01', 'k03'] },
      sel: 10007,
      view: 'points',
      map: { lon: 142.5, lat: 43.25, zoom: 7.5 },
      title: '道東の湖',
      showRoads: false,
      showEki: true,
    };
    expect(parseSettings('?' + serializeSettings(s), kinds, ids)).toEqual(s);
  });

  it('schema 版が違えば初期値', () => {
    expect(parseSettings('?v=99&d=10', kinds, ids)).toEqual(DEFAULTS);
  });

  it('未知・範囲外の値は項目ごとに初期値へ戻す', () => {
    const s = parseSettings('?v=1&d=999&m=1&c=zzz&s=12345&map=0,0,1&view=x', kinds, ids);
    expect(s.epsKm).toBe(DEFAULTS.epsKm);
    expect(s.minPts).toBe(DEFAULTS.minPts);
    expect(s.cat).toEqual({ type: 'all' });
    expect(s.sel).toBeNull();
    expect(s.map).toBeNull();
    expect(s.view).toBe('clusters');
  });

  it('大分類と空の種別指定を読める', () => {
    expect(parseSettings('?v=1&c=nature', kinds, ids).cat).toEqual({ type: 'group', group: 'nature' });
    expect(parseSettings('?v=1&c=none', kinds, ids).cat).toEqual({ type: 'kinds', keys: [] });
    expect(parseSettings('?v=1&c=k01.k09', kinds, ids).cat).toEqual({ type: 'all' });
  });

  it('タイトルは長さを制限し、制御文字を除く (HTML はテキストのまま)', () => {
    const long = 'あ'.repeat(100);
    expect(parseSettings(`?v=1&t=${encodeURIComponent(long)}`, kinds, ids).title).toHaveLength(TITLE_MAX);
    const t = parseSettings(`?v=1&t=${encodeURIComponent('<b>x</b>\u0007')}`, kinds, ids).title;
    expect(t).toBe('<b>x</b>');
  });
});
