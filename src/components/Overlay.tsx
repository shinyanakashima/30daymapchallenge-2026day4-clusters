import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { LoadedData } from '../data';
import type { ImportedSet } from '../importGeojson';
import { PALETTE } from '../lib/colors';
import type { Computed, Group } from '../model';
import type { AppSettings, CategorySel, Edition, GroupKey, Resource } from '../types';
import { EPS_MAX, EPS_MIN, MINPTS_MAX, MINPTS_MIN } from '../urlState';
import { GUIDE_STEPS, GuideCard, type GuideAnchor } from './Guide';
import { About, ExportBox, ImportBox, NumberField } from './parts';
import { GroupCard, PointCard } from './SelectionCard';

interface Props {
  data: LoadedData;
  byId: Map<number, Resource>;
  settings: AppSettings;
  defaults: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  computed: Computed | null;
  selectedGroup: Group | null;
  focusPoint: boolean;
  nearest: { name: string; km: number } | null;
  candidates: number[] | null;
  onSelect: (id: number | null, viaPoint?: boolean) => void;
  onCloseCandidates: () => void;
  guideOpen: boolean;
  guideStep: number;
  setGuideStep: (n: number) => void;
  openGuide: () => void;
  closeGuide: () => void;
  onShare: () => void;
  onSave: (title: string) => Promise<string | null>;
  isMobile: boolean;
  categoryLabel: string;
  imported: ImportedSet | null;
  onImport: (set: ImportedSet | null) => void;
  onEdition: (e: Edition) => void;
}

const LAYERS_KEY = 'd4-clusters-layers-open';

type Pop = 'groups' | 'minpts' | 'theme' | 'more' | 'import' | 'export' | 'about';

/** 地図の上に重ねる UI。普段は小さな札と下の操作バーだけを見せ、詳細は開いたときだけ出す。 */
export function Overlay(p: Props) {
  const { data, byId, settings, update, computed } = p;
  const [pop, setPop] = useState<Pop | null>(null);
  const toggle = (k: Pop) => {
    setPop((cur) => (cur === k ? null : k));
    // スマホでは左の札と窓が重なるので、窓を開いたら畳む
    if (p.isMobile) setLayersOpen(false);
  };
  // 重ねる情報の札: PC では最初から開く。開閉はこのブラウザに覚えさせる
  const [layersOpen, setLayersOpen] = useState<boolean>(() => {
    try {
      const v = window.localStorage.getItem(LAYERS_KEY);
      if (v !== null) return v === '1' && !p.isMobile;
    } catch {
      /* 保存できない環境では初期値 */
    }
    return !p.isMobile;
  });
  const setLayers = (open: boolean) => {
    setLayersOpen(open);
    if (open && p.isMobile) setPop(null);
    try {
      window.localStorage.setItem(LAYERS_KEY, open ? '1' : '0');
    } catch {
      /* 保存できなくても動作に影響しない */
    }
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const anchors = useRef<Partial<Record<GuideAnchor, HTMLElement | null>>>({});
  const setAnchor = (k: GuideAnchor) => (el: HTMLElement | null) => {
    anchors.current[k] = el;
  };
  // 操作バーのボタン。窓はそのボタンの真上に開く
  const buttons = useRef<Partial<Record<'minpts' | 'theme' | 'layers' | 'more', HTMLElement | null>>>({});
  const setButton = (k: 'minpts' | 'theme' | 'layers' | 'more') => (el: HTMLElement | null) => {
    buttons.current[k] = el;
    if (k === 'theme') anchors.current.category = el;
  };
  const popRef = useRef<HTMLDivElement>(null);
  const [popLeft, setPopLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!pop || pop === 'groups' || p.isMobile) return setPopLeft(null);
    const key = pop === 'import' || pop === 'export' || pop === 'about' ? 'more' : pop;
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect();
      const b = buttons.current[key]?.getBoundingClientRect();
      const w = popRef.current?.offsetWidth ?? 400;
      if (!r || !b) return setPopLeft(null);
      const cx = b.left + b.width / 2 - r.left;
      setPopLeft(Math.max(16, Math.min(r.width - w - 16, cx - w / 2)));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [pop, p.isMobile]);

  // Esc で開いているものを閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPop(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // 選択したら一覧は閉じる (詳細カードと場所が重なるため)
  useEffect(() => {
    if (settings.sel !== null) setPop((cur) => (cur === 'groups' ? null : cur));
  }, [settings.sel]);

  const clusters = settings.view === 'clusters';
  const sel = settings.sel !== null ? byId.get(settings.sel) ?? null : null;

  // ---- 詳細カード ----
  let card: ReactNode = null;
  if (p.candidates) {
    card = (
      <section className="card candidates" aria-label="同じ場所にある地点">
        <div className="card-head">
          <p className="card-title small">この場所には {p.candidates.length} 地点あります</p>
          <button type="button" className="icon-button" onClick={p.onCloseCandidates} aria-label="閉じる">
            ×
          </button>
        </div>
        <ul>
          {p.candidates.map((id) => (
            <li key={id}>
              <button type="button" className="name-button" onClick={() => p.onSelect(id, true)}>
                {byId.get(id)!.name}
                <span className="name-kind">{byId.get(id)!.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  } else if (sel && computed && computed.targetIds.includes(sel.id)) {
    if (p.selectedGroup) {
      card = (
        <>
          {p.focusPoint && (
            <p className="picked">
              選んだ地点：<b>{sel.name}</b>（{sel.kind}）
            </p>
          )}
          <GroupCard
            group={p.selectedGroup}
            byId={byId}
            selectedId={p.focusPoint ? sel.id : null}
            epsKm={computed.epsKm}
            onPick={(id) => p.onSelect(id, true)}
            onClose={() => p.onSelect(null)}
          />
        </>
      );
    } else if (clusters) {
      card = <PointCard resource={sel} nearest={p.nearest} onClose={() => p.onSelect(null)} />;
    } else {
      card = (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">{sel.name}</h2>
            <button type="button" className="icon-button" onClick={() => p.onSelect(null)} aria-label="選択を閉じる">
              ×
            </button>
          </div>
          <p className="muted">
            {sel.kind}
            {sel.address && `／${sel.address}`}
          </p>
          <p className="hint">「まとまり」に切り替えると、この地点がどのまとまりに入るかが分かります。</p>
        </section>
      );
    }
  }

  // ---- テーマ ----
  const setCat = (cat: CategorySel) => update({ cat });
  const catMode = settings.cat.type === 'kinds' ? 'kinds' : settings.cat.type === 'group' ? settings.cat.group : 'all';
  const kindKeys = settings.cat.type === 'kinds' ? settings.cat.keys : null;
  const toggleKind = (key: string) => {
    const cur = new Set(kindKeys ?? []);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    setCat({ type: 'kinds', keys: [...cur].sort() });
  };
  const themeOptions: [string, string][] = [
    ['all', 'すべて'],
    ['nature', '自然資源'],
    ['culture', '人文資源'],
    ...(p.imported ? ([['user', '追加データ']] as [string, string][]) : []),
    ['kinds', '種別で選ぶ'],
  ];

  const statsText = computed
    ? clusters
      ? [`${computed.targetIds.length} 地点`, `まとまり ${computed.groups.length}`, `孤立 ${computed.noise.length}`]
      : [`${computed.targetIds.length} 地点`, '点だけ表示']
    : ['計算中…'];

  return (
    <div className="overlay" ref={rootRef}>
      <div className="bubbles" ref={bubbleRef} aria-hidden="true" />
      {/* 左上: タイトル */}
      <header className="float title-chip">
        <div>
          <h1 className="title">Shabon Hokkaido</h1>
          <p className="subtitle">
            <span className="tagline">How Near Is Near?</span>
            {!p.isMobile && <>｜{'北海道の観光地を、距離でまとめる地図'}</>}
          </p>
          {settings.title && <p className="feature-title">特集：{settings.title}</p>}
        </div>
        <button type="button" className="round-button" onClick={p.openGuide} aria-label="操作ガイドを開く" title="操作ガイド">
          ?
        </button>
      </header>

      {/* 左: 重ねる情報 (最初から開いておき、見出しで畳める) */}
      <section className={'float layer-panel' + (layersOpen ? ' is-open' : '')} aria-label="重ねる情報">
        <button type="button" className="layer-head" onClick={() => setLayers(!layersOpen)} aria-expanded={layersOpen}>
          <span>重ねる情報</span>
          <i className="caret" aria-hidden="true" />
        </button>
        {layersOpen && (
      <div className="layer-list">
        {(
          [
            ['showRail', 'lg-rail', '鉄道（2025年末）'],
            ['showRailHistory', 'lg-rail-history', '廃止された路線'],
            ['showAirports', 'lg-airport', '空港'],
            ['showEki', 'lg-eki', '道の駅'],
            ['showRoads', 'lg-road', '道路'],
          ] as const
        ).map(([key, icon, label]) => (
          <label key={key} className="layer-row">
            <input type="checkbox" checked={settings[key]} onChange={(e) => update({ [key]: e.target.checked })} />
            <i className={icon} aria-hidden="true" />
            {label}
          </label>
        ))}
        <div className="layer-row layer-theme">
          <span>背景</span>
          <div className="seg seg-small" role="radiogroup" aria-label="背景地図">
            {(
              [
                ['day', '衛星写真'],
                ['night', '夜の地形'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={settings.theme === key} onClick={() => update({ theme: key })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="field-hint">重ねた情報は参考で、まとまりの計算には含めません。</p>
      </div>
        )}
      </section>

      {/* 右上: 件数の札 → まとまり一覧 */}
      <div className="top-right">
        <button
          type="button"
          ref={setAnchor('groups')}
          className={'float stats-chip' + (pop === 'groups' ? ' is-open' : '')}
          aria-expanded={pop === 'groups'}
          onClick={() => toggle('groups')}
          aria-live="polite"
        >
          {statsText.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
          <i className="caret" aria-hidden="true" />
        </button>
        {pop === 'groups' && (
          <div className="float popover groups-pop">
            <Legend clusters={clusters} />
            {clusters && computed && computed.groups.length > 0 && (
              <ul className="group-list" aria-label="まとまりの一覧">
                {computed.groups.map((g) => (
                  <li key={g.key}>
                    <button
                      type="button"
                      className={'group-chip' + (g === p.selectedGroup ? ' is-selected' : '')}
                      aria-pressed={g === p.selectedGroup}
                      onClick={() => p.onSelect(g.key, false)}
                    >
                      <span className="swatch" style={{ background: PALETTE[g.color] }} aria-hidden="true" />
                      <span className="chip-label">{g.label}</span>
                      <span className="chip-count">{g.members.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {clusters && computed && computed.groups.length === 0 && computed.targetIds.length > 0 && (
              <p className="muted">この条件では、まとまりはできません。すべて孤立点です。距離を広げるか、地点数を減らしてみてください。</p>
            )}
            {computed && computed.targetIds.length === 0 && <p className="muted">このテーマに当てはまる地点はありません。</p>}
          </div>
        )}
        {!pop && card && <div className="float-card">{card}</div>}
      </div>

      {/* 下: 操作バー */}
      <div className="bottom">
        {pop && pop !== 'groups' && (
          <div
            ref={popRef}
            className={'float popover bar-pop pop-' + pop + (popLeft !== null ? ' is-anchored' : '')}
            style={popLeft !== null ? { left: popLeft } : undefined}
          >
            <div className="pop-head">
              <p className="pop-title">{POP_TITLES[pop]}</p>
              <button type="button" className="icon-button" onClick={() => setPop(null)} aria-label="閉じる">
                ×
              </button>
            </div>
            {pop === 'minpts' && (
              <NumberField
                id="minpts"
                label="何地点から集まりと呼ぶ？"
                value={settings.minPts}
                min={MINPTS_MIN}
                max={MINPTS_MAX}
                unit="地点"
                onChange={(v) => update({ minPts: v })}
                hint={<p className="field-hint">その地点自身も数に含めます。</p>}
              />
            )}
            {pop === 'theme' && (
              <div>
                <div className="seg" role="radiogroup" aria-label="テーマ">
                  {themeOptions.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={catMode === key}
                      onClick={() => {
                        if (key === 'all') setCat({ type: 'all' });
                        else if (key === 'kinds') {
                          if (settings.cat.type === 'kinds') return;
                          const cur = settings.cat;
                          setCat({
                            type: 'kinds',
                            keys: data.categories.kinds
                              .filter((k) => cur.type === 'all' || (cur.type === 'group' && k.group === cur.group))
                              .map((k) => k.key),
                          });
                        } else setCat({ type: 'group', group: key as GroupKey });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {kindKeys && (
                  <div className="kind-list">
                    {data.categories.groups
                      .filter((g) => data.categories.kinds.some((k) => k.group === g.key))
                      .map((g) => (
                        <div key={g.key} className="kind-group">
                          <p className="kind-group-label">{g.label}</p>
                          {data.categories.kinds
                            .filter((k) => k.group === g.key)
                            .map((k) => (
                              <label key={k.key} className="check">
                                <input type="checkbox" checked={kindKeys.includes(k.key)} onChange={() => toggleKind(k.key)} />
                                {k.name}
                                <span className="muted"> {k.count}</span>
                              </label>
                            ))}
                        </div>
                      ))}
                    <div className="kind-actions">
                      <button type="button" className="link-button" onClick={() => setCat({ type: 'kinds', keys: data.categories.kinds.map((k) => k.key) })}>
                        すべて選ぶ
                      </button>
                      <button type="button" className="link-button" onClick={() => setCat({ type: 'kinds', keys: [] })}>
                        すべて外す
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {pop === 'more' && (
              <div className="menu">
                <div className="menu-block">
                  <p className="field-label">観光資源データの版</p>
                  <div className="seg" role="radiogroup" aria-label="観光資源データの版">
                    {(
                      [
                        ['2014', '2014年版'],
                        ['2010', '2010年版（比較用）'],
                      ] as const
                    ).map(([key, label]) => (
                      <button key={key} type="button" role="radio" aria-checked={settings.edition === key} onClick={() => p.onEdition(key)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">
                    {settings.edition === '2014'
                      ? '国土数値情報 第2.2版（基準日 2014年9月30日）。北海道は35地点です。'
                      : '第2.0版（2010年度作成）。北海道は141地点で、自然資源が中心です。収録の基準が違うため、件数はそのまま比べられません。'}
                  </p>
                </div>
                <button type="button" className="menu-item" onClick={() => setPop('import')}>
                  地点を追加する（GeoJSON）
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setPop(null);
                    p.onShare();
                  }}
                >
                  設定のURLをコピー
                </button>
                <button type="button" className="menu-item" onClick={() => setPop('export')}>
                  画像（PNG）を保存
                </button>
                <button type="button" className="menu-item" onClick={() => setPop('about')}>
                  この地図とデータについて
                </button>
                <button
                  type="button"
                  className="menu-item quiet"
                  onClick={() => update({ epsKm: p.defaults.epsKm, minPts: p.defaults.minPts, cat: p.defaults.cat })}
                >
                  距離・地点数・テーマを初期設定に戻す
                </button>
              </div>
            )}
            {pop === 'import' && <ImportBox imported={p.imported} onImport={p.onImport} />}
            {pop === 'export' && <ExportBox initial={settings.title} onSave={p.onSave} onClose={() => setPop(null)} />}
            {pop === 'about' && <About data={data} />}
          </div>
        )}

        <div className="float control-bar" role="toolbar" aria-label="地図の操作">
          <div className="view-toggle" role="group" aria-label="表示の比較">
            <button type="button" aria-pressed={clusters} onClick={() => update({ view: 'clusters' })}>
              まとまり
            </button>
            <button type="button" aria-pressed={!clusters} onClick={() => update({ view: 'points' })}>
              点だけ
            </button>
          </div>
          <span className="bar-sep" aria-hidden="true" />
          <div className="bar-distance" ref={setAnchor('distance')}>
            <DistanceControl value={settings.epsKm} onChange={(v) => update({ epsKm: v })} compact={p.isMobile} bubbleLayer={bubbleRef} />
          </div>
          <button type="button" ref={setButton('minpts')} className={'bar-button' + (pop === 'minpts' ? ' is-open' : '')} onClick={() => toggle('minpts')} aria-expanded={pop === 'minpts'}>
            {settings.minPts}地点〜
          </button>
          <span className="bar-sep" aria-hidden="true" />
          <button
            type="button"
            ref={setButton('theme')}
            className={'bar-button' + (pop === 'theme' ? ' is-open' : '')}
            onClick={() => toggle('theme')}
            aria-expanded={pop === 'theme'}
          >
            <span className="bar-label">テーマ</span>
            {p.categoryLabel}
          </button>
          <button type="button" ref={setButton('layers')} className={'bar-button' + (layersOpen ? ' is-open' : '')} onClick={() => setLayers(!layersOpen)} aria-expanded={layersOpen}>
            レイヤ
          </button>
          <button
            type="button"
            ref={setButton('more')}
            className={'bar-button bar-more' + (pop && ['more', 'import', 'export', 'about'].includes(pop) ? ' is-open' : '')}
            onClick={() => toggle('more')}
            aria-expanded={pop === 'more'}
            aria-label="その他のメニュー"
          >
            …
          </button>
        </div>
      </div>

      {p.guideOpen && (
        <PositionedGuide root={rootRef} anchor={anchors.current[GUIDE_STEPS[p.guideStep].anchor] ?? null} step={p.guideStep}>
          <GuideCard step={p.guideStep} onStep={p.setGuideStep} onClose={p.closeGuide} />
        </PositionedGuide>
      )}
    </div>
  );
}

const POP_TITLES: Record<Pop, string> = {
  groups: 'まとまり',
  minpts: '何地点から集まり？',
  theme: 'テーマ',
  more: 'その他',
  import: '地点を追加する',
  export: '画像（PNG）を保存',
  about: 'この地図とデータについて',
};

function Legend({ clusters }: { clusters: boolean }) {
  return (
    <div className="legend" aria-label="凡例">
      {clusters ? (
        <>
          <span>
            <i className="lg-blob" />
            まとまり（色のにじみ）
          </span>
          <span>
            <i className="lg-noise" />
            孤立点
          </span>
        </>
      ) : (
        <span>
          <i className="lg-dot lg-plain" />
          観光資源
        </span>
      )}
    </div>
  );
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 表示用の数値を目標値へ短くカウントアップ／ダウンさせる */
function useCountTo(target: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    if (reducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from = shownRef.current;
    if (from === target) return;
    const t0 = performance.now();
    const dur = Math.min(420, 120 + Math.abs(target - from) * 12);
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - k) ** 3;
      const v = Math.round(from + (target - from) * eased);
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

/**
 * しゃぼん玉: 値を上げるとつまみから昇り、下げると小さく出てはじける。
 * 地図の上の層に置き、操作バーの枠で切れないようにする。
 */
function spawnBubbles(layer: HTMLElement | null, from: HTMLElement | null, ratio: number, dir: 1 | -1, count: number) {
  if (!layer || !from || reducedMotion()) return;
  const lr = layer.getBoundingClientRect();
  const fr = from.getBoundingClientRect();
  const thumb = 28;
  const x = fr.left - lr.left + thumb / 2 + ratio * (fr.width - thumb);
  const y = fr.top - lr.top + fr.height / 2;
  for (let i = 0; i < count; i++) {
    if (layer.childElementCount > 40) layer.firstElementChild?.remove();
    const b = document.createElement('span');
    const size = dir > 0 ? 18 + Math.random() * 30 : 12 + Math.random() * 16;
    b.className = 'bubble ' + (dir > 0 ? 'is-up' : 'is-down');
    b.style.left = `${x + (Math.random() - 0.5) * 16}px`;
    b.style.top = `${y}px`;
    b.style.setProperty('--s', `${size}px`);
    b.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
    b.style.setProperty('--dy', `${dir > 0 ? -(110 + Math.random() * 170) : -(26 + Math.random() * 40)}px`);
    b.style.setProperty('--d', `${dir > 0 ? 1100 + Math.random() * 900 : 520 + Math.random() * 260}ms`);
    b.style.setProperty('--h', `${Math.round(Math.random() * 360)}deg`);
    b.addEventListener('animationend', () => b.remove());
    layer.appendChild(b);
  }
}

/** 操作バーに直接置く距離スライダー。数値は大きく出し、押すと数値入力に切り替わる */
function DistanceControl({ value, onChange, compact, bubbleLayer }: { value: number; onChange: (v: number) => void; compact: boolean; bubbleLayer: React.RefObject<HTMLDivElement | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const rangeRef = useRef<HTMLInputElement>(null);
  const prev = useRef(value);
  const [bump, setBump] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (!d) return;
    const ratio = (value - EPS_MIN) / (EPS_MAX - EPS_MIN);
    spawnBubbles(bubbleLayer.current, rangeRef.current, ratio, d > 0 ? 1 : -1, Math.min(5, Math.max(2, Math.round(Math.abs(d) / 2))));
    setBump(d > 0 ? 'up' : 'down');
    const t = window.setTimeout(() => setBump(''), 260);
    return () => window.clearTimeout(t);
  }, [value, bubbleLayer]);
  const shown = useCountTo(value);
  const commit = (raw: string) => {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && raw.trim() !== '') onChange(Math.min(EPS_MAX, Math.max(EPS_MIN, n)));
    else setDraft(String(value));
    setEditing(false);
  };
  const fill = `${((value - EPS_MIN) / (EPS_MAX - EPS_MIN)) * 100}%`;
  return (
    <>
      <div className="dist-main">
        <label htmlFor="eps" className="dist-label">
          近所とみなす距離{compact ? '' : '（スライダーで変えると、まとまりが組み変わります）'}
        </label>
        <input
          id="eps"
          ref={rangeRef}
          className="dist-range"
          type="range"
          min={EPS_MIN}
          max={EPS_MAX}
          step={1}
          value={value}
          style={{ ['--fill' as string]: fill }}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`${value}km`}
        />
      </div>
      <span className="dist-value">
        {editing ? (
          <input
            type="number"
            inputMode="numeric"
            min={EPS_MIN}
            max={EPS_MAX}
            value={draft}
            autoFocus
            aria-label="近所とみなす距離（km）"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') {
                setDraft(String(value));
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={'dist-number' + (bump ? ` is-${bump}` : '')}
            onClick={() => setEditing(true)}
            aria-label={`近所とみなす距離 ${value}km。押すと数値で入力できます`}
            title="押すと数値で入力"
          >
            {shown}
          </button>
        )}
        <span className="unit">km</span>
      </span>
    </>
  );
}

/** ガイドの吹き出しを、対象の操作のそばに置く */
function PositionedGuide({ root, anchor, step, children }: { root: React.RefObject<HTMLDivElement | null>; anchor: HTMLElement | null; step: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; arrow: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const r = root.current?.getBoundingClientRect();
      const a = anchor?.getBoundingClientRect();
      const w = ref.current?.offsetWidth ?? 320;
      if (!r || !a) return setPos(null);
      const cx = a.left + a.width / 2 - r.left;
      const left = Math.max(12, Math.min(r.width - w - 12, cx - w / 2));
      const below = a.top + a.height / 2 - r.top < r.height / 2;
      setPos(
        below
          ? { left, top: a.bottom - r.top + 12, arrow: cx - left, below }
          : { left, bottom: r.bottom - a.top + 12, arrow: cx - left, below },
      );
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [root, anchor, step]);
  return (
    <div
      ref={ref}
      className={'guide-pos' + (pos?.below ? ' is-below' : ' is-above')}
      style={pos ? { left: pos.left, top: pos.top, bottom: pos.bottom, ['--arrow' as string]: `${pos.arrow}px` } : { visibility: 'hidden' }}
    >
      {children}
    </div>
  );
}
