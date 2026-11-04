import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { loadData, type LoadedData } from './data';
import { DistanceIndex } from './lib/geo';
import { computeClusters, nearestOf, selectIds, type Computed, type Group } from './model';
import { cleanTitle, DEFAULTS, parseEdition, parseSettings, serializeSettings } from './urlState';
import type { AppSettings, CategorySel, Edition, MapPos } from './types';
import { MapView } from './components/MapView';
import { Overlay } from './components/Overlay';
import { exportPng } from './exportPng';
import { loadStoredImport, storeImport, type ImportedSet } from './importGeojson';
import { DICTS, I18n, initialLang, kindName, rememberLang, type Lang, type T } from './i18n';

const GUIDE_KEY = 'd4-clusters-guide-closed';
const readGuideClosed = () => {
  try {
    return window.localStorage.getItem(GUIDE_KEY) === '1';
  } catch {
    return false;
  }
};
const writeGuideClosed = () => {
  try {
    window.localStorage.setItem(GUIDE_KEY, '1');
  } catch {
    /* 保存できなくても動作に影響しない */
  }
};

export default function App() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edition, setEdition] = useState<Edition>(() => parseEdition(window.location.search));
  const t = DICTS[initialLang(window.location.search)];

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    setData(null);
    loadData(edition)
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [attempt, edition]);

  if (loadError) {
    return (
      <div className="fatal" role="alert">
        <h1>{t.loadFailed}</h1>
        <p>{loadError}</p>
        <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
          {t.retry}
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="fatal" aria-busy="true">
        <p>{t.loading}</p>
      </div>
    );
  }
  return <Explorer key={edition} data={data} onEdition={setEdition} />;
}

function useIsMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function categoryLabel(cat: CategorySel, data: LoadedData, lang: Lang, t: T): string {
  if (cat.type === 'all') return t.themeAll;
  if (cat.type === 'group') {
    const byKey: Record<string, string> = { nature: t.themeNature, culture: t.themeCulture, user: t.themeUser };
    return byKey[cat.group] ?? data.categories.groups.find((g) => g.key === cat.group)?.label ?? cat.group;
  }
  if (cat.keys.length === 0) return t.catNone;
  const sep = lang === 'en' ? ', ' : '・';
  const names = data.categories.kinds.filter((k) => cat.keys.includes(k.key)).map((k) => kindName(k.name, lang));
  return names.length <= 3 ? names.join(sep) : t.catMore(names.slice(0, 3).join(sep), names.length - 3);
}

function mergeData(base: LoadedData, imported: ImportedSet | null): LoadedData {
  if (!imported) return base;
  return {
    ...base,
    resources: [...base.resources, ...imported.resources],
    categories: {
      ...base.categories,
      groups: [...base.categories.groups.filter((g) => g.key !== 'user'), { key: 'user', label: '追加データ' }],
      kinds: [...base.categories.kinds, ...imported.kinds],
    },
  };
}

function Explorer({ data: baseData, onEdition }: { data: LoadedData; onEdition: (e: Edition) => void }) {
  const [imported, setImported] = useState<ImportedSet | null>(() => loadStoredImport());
  const data = useMemo(() => mergeData(baseData, imported), [baseData, imported]);
  const { resources } = data;
  const byId = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const index = useMemo(() => new DistanceIndex(resources), [resources]);
  const validKinds = useMemo(() => new Set(data.categories.kinds.map((k) => k.key)), [data]);
  const validIds = useMemo(() => new Set(resources.map((r) => r.id)), [resources]);
  const isMobile = useIsMobile();

  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...parseSettings(window.location.search, validKinds, validIds),
    lang: initialLang(window.location.search),
  }));
  const lang = settings.lang;
  const t = DICTS[lang];
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => rememberLang(lang), [lang]);
  const [focusPoint, setFocusPoint] = useState(false);
  const [computed, setComputed] = useState<Computed | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<number[] | null>(null);
  const [guideOpen, setGuideOpen] = useState(() => !readGuideClosed());
  const [guideStep, setGuideStep] = useState(0);
  const mapRef = useRef<MLMap | null>(null);
  const initialPos = useRef(settings.map);

  const update = useCallback((patch: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const applyImport = useCallback(
    (set: ImportedSet | null) => {
      setImported(set);
      const saved = storeImport(set);
      setSettings((s) => {
        const next = { ...s };
        const userCat = (s.cat.type === 'group' && s.cat.group === 'user') || (s.cat.type === 'kinds' && s.cat.keys.some((k) => k.startsWith('u')));
        if (userCat) next.cat = set ? { type: 'group', group: 'user' } : { type: 'all' };
        if (s.sel !== null && s.sel >= 100_000_000) next.sel = null;
        if (set && !userCat && s.cat.type === 'kinds') next.cat = { type: 'all' };
        return next;
      });
      prevColors.current = null;
      setComputed(null); // 古い結果は削除・追加された地点を参照するので捨てる
      if (set) {
        setNotice(tRef.current.noticeImported(set.fileName, set.resources.length) + (saved ? '' : tRef.current.noticeNotSaved));
      } else setNotice(tRef.current.noticeImportRemoved);
    },
    [],
  );

  // --- 再計算: 短いデバウンスと最新要求 ID ---
  const latestReq = useRef(0);
  const prevColors = useRef<{ members: number[]; color: number }[] | null>(null);
  const targetIds = useMemo(() => selectIds(resources, settings.cat), [resources, settings.cat]);
  useEffect(() => {
    const id = ++latestReq.current;
    const delay = computed === null ? 0 : 90;
    const timer = window.setTimeout(() => {
      // 計算は軽い (35 点) のでメインスレッドで行う。重くなったら Worker に移す。
      Promise.resolve().then(() => {
        const result = computeClusters(id, index, byId, targetIds, settings.epsKm, settings.minPts, prevColors.current, lang);
        if (id !== latestReq.current) return; // 古い結果で上書きしない
        prevColors.current = result.groups.map((g) => ({ members: g.members, color: g.color }));
        setComputed(result);
      });
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, byId, targetIds, settings.epsKm, settings.minPts, lang]);

  // --- 選択の追従と、消えたときの通知 ---
  const prevSelState = useRef<{ id: number | null; inGroup: boolean }>({ id: null, inGroup: false });
  useEffect(() => {
    if (!computed) return;
    const sel = settings.sel;
    if (sel === null) {
      prevSelState.current = { id: null, inGroup: false };
      return;
    }
    const r = byId.get(sel)!;
    if (!computed.targetIds.includes(sel)) {
      setNotice(tRef.current.noticeExcluded(r.name));
      update({ sel: null });
      return;
    }
    const inGroup = computed.groupOf.has(sel);
    const prev = prevSelState.current;
    if (prev.id === sel && prev.inGroup && !inGroup) {
      setNotice(tRef.current.noticeIsolated(r.name));
    }
    prevSelState.current = { id: sel, inGroup };
  }, [computed, settings.sel, byId, update]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // --- URL へ反映 ---
  useEffect(() => {
    const t = window.setTimeout(() => {
      const qs = serializeSettings(settings);
      window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
    }, 250);
    return () => window.clearTimeout(t);
  }, [settings]);

  const selectedGroup: Group | null =
    settings.view === 'clusters' && settings.sel !== null && computed ? computed.groupOf.get(settings.sel) ?? null : null;

  const onSelect = useCallback(
    (id: number | null, viaPoint = true) => {
      setCandidates(null);
      setFocusPoint(viaPoint && id !== null);
      update({ sel: id });
    },
    [update],
  );
  const onMove = useCallback((pos: MapPos) => update({ map: pos }), [update]);

  const closeGuide = () => {
    setGuideOpen(false);
    writeGuideClosed();
  };

  // 版の切り替え: 距離・最小地点数・地図位置などは保ち、版ごとに異なる選択と種別指定だけ外す
  const switchEdition = (ed: Edition) => {
    if (ed === settings.edition) return;
    const next: AppSettings = { ...settings, edition: ed, sel: null, cat: settings.cat.type === 'kinds' ? { type: 'all' } : settings.cat };
    window.history.replaceState(null, '', `${window.location.pathname}?${serializeSettings(next)}`);
    onEdition(ed);
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${serializeSettings(settings)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(imported ? t.noticeCopiedNoImport : t.noticeCopied);
    } catch {
      window.prompt(t.copyPrompt, url);
    }
  };

  const save = async (title: string) => {
    const ttl = cleanTitle(title);
    update({ title: ttl });
    if (!mapRef.current) throw new Error(t.mapNotReady);
    const res = await exportPng(mapRef.current, computed, resources, {
      title: ttl,
      epsKm: settings.epsKm,
      minPts: settings.minPts,
      categoryLabel: categoryLabel(settings.cat, data, lang, t),
      lang,
      view: settings.view,
      userCount: imported?.resources.length ?? 0,
      showRoads: settings.showRoads,
      showEki: settings.showEki,
      showAirports: settings.showAirports,
      showRail: settings.showRail,
      theme: settings.theme,
      edition: settings.edition,
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(res.blob);
    a.download = `hokkaido-clusters-${settings.epsKm}km.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return res.fallback
      ? t.pngFallback(res.reason ?? t.unknownCause)
      : null;
  };

  const nearest = useMemo(() => {
    if (settings.sel === null || !computed) return null;
    const n = nearestOf(index, settings.sel, computed.targetIds);
    return n ? { name: byId.get(n.id)!.name, km: n.km } : null;
  }, [settings.sel, computed, index, byId]);

  // 上の札と下の操作バーの分だけ余白をとって北海道全体を収める
  const padding = isMobile ? { top: 110, right: 12, bottom: 140, left: 12 } : { top: 70, right: 40, bottom: 110, left: 40 };

  return (
    <I18n.Provider value={{ lang, t }}>
    <div className={'app' + (isMobile ? ' is-mobile' : '')}>
      <div className="map-card">
        <MapView
          resources={resources}
          computed={computed}
          view={settings.view}
          selectedId={settings.sel}
          selectedGroup={selectedGroup}
          epsKm={settings.epsKm}
          showRoads={settings.showRoads}
          showEki={settings.showEki}
          showAirports={settings.showAirports}
          showRail={settings.showRail}
          showRailHistory={settings.showRailHistory}
          theme={settings.theme}
          initialPos={initialPos.current}
          padding={padding}
          onSelect={onSelect}
          onCandidates={setCandidates}
          onMove={onMove}
          onReady={(m) => (mapRef.current = m)}
          onError={(m) => setMapError(m ? t.tileError : null)}
        />
        <Overlay
          data={data}
          byId={byId}
          settings={settings}
          defaults={DEFAULTS}
          update={update}
          computed={computed}
          selectedGroup={selectedGroup}
          focusPoint={focusPoint}
          nearest={nearest}
          candidates={candidates}
          onSelect={onSelect}
          onCloseCandidates={() => setCandidates(null)}
          guideOpen={guideOpen}
          guideStep={guideStep}
          setGuideStep={setGuideStep}
          openGuide={() => {
            setGuideStep(0);
            setGuideOpen(true);
          }}
          closeGuide={closeGuide}
          onShare={share}
          onSave={save}
          isMobile={isMobile}
          categoryLabel={categoryLabel(settings.cat, data, lang, t)}
          imported={imported}
          onImport={applyImport}
          onEdition={switchEdition}
        />
      <div className="toast-region" aria-live="polite">
        {notice && (
          <div className="toast">
            <span>{notice}</span>
            <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label={t.close}>
              ×
            </button>
          </div>
        )}
        {mapError && (
          <div className="toast toast-warn" role="status">
            <span>{mapError}</span>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setMapError(null);
                mapRef.current?.refreshTiles('gsi');
                mapRef.current?.refreshTiles('dem');
                mapRef.current?.refreshTiles('s2');
                mapRef.current?.refreshTiles('photo');
              }}
            >
              {t.retry}
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
    </I18n.Provider>
  );
}
