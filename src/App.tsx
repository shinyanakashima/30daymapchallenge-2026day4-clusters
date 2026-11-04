import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { loadData, type LoadedData } from './data';
import { DistanceIndex } from './lib/geo';
import { computeClusters, nearestOf, selectIds, type Computed, type Group } from './model';
import { cleanTitle, DEFAULTS, parseSettings, serializeSettings } from './urlState';
import type { AppSettings, CategorySel, MapPos } from './types';
import { MapView } from './components/MapView';
import { Panel } from './components/Panel';
import { exportPng } from './exportPng';
import { loadStoredImport, storeImport, type ImportedSet } from './importGeojson';

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

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    loadData()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (loadError) {
    return (
      <div className="fatal" role="alert">
        <h1>データを読み込めませんでした</h1>
        <p>{loadError}</p>
        <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
          再試行
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="fatal" aria-busy="true">
        <p>観光資源データを読み込んでいます…</p>
      </div>
    );
  }
  return <Explorer data={data} />;
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

function categoryLabel(cat: CategorySel, data: LoadedData): string {
  if (cat.type === 'all') return 'すべて';
  if (cat.type === 'group') return data.categories.groups.find((g) => g.key === cat.group)?.label ?? cat.group;
  if (cat.keys.length === 0) return '種別なし';
  const names = data.categories.kinds.filter((k) => cat.keys.includes(k.key)).map((k) => k.name);
  return names.length <= 3 ? names.join('・') : `${names.slice(0, 3).join('・')} ほか${names.length - 3}種別`;
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

function Explorer({ data: baseData }: { data: LoadedData }) {
  const [imported, setImported] = useState<ImportedSet | null>(() => loadStoredImport());
  const data = useMemo(() => mergeData(baseData, imported), [baseData, imported]);
  const { resources } = data;
  const byId = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const index = useMemo(() => new DistanceIndex(resources), [resources]);
  const validKinds = useMemo(() => new Set(data.categories.kinds.map((k) => k.key)), [data]);
  const validIds = useMemo(() => new Set(resources.map((r) => r.id)), [resources]);
  const isMobile = useIsMobile();

  const [settings, setSettings] = useState<AppSettings>(() => parseSettings(window.location.search, validKinds, validIds));
  const [focusPoint, setFocusPoint] = useState(false);
  const [computed, setComputed] = useState<Computed | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<number[] | null>(null);
  const [guideOpen, setGuideOpen] = useState(() => !readGuideClosed());
  const [guideStep, setGuideStep] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
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
        setNotice(
          `${set.fileName} から ${set.resources.length} 地点を追加しました。` + (saved ? '' : '（このブラウザには保存できなかったため、再読み込みで消えます）'),
        );
      } else setNotice('追加データを取り消しました。');
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
        const result = computeClusters(id, index, byId, targetIds, settings.epsKm, settings.minPts, prevColors.current);
        if (id !== latestReq.current) return; // 古い結果で上書きしない
        prevColors.current = result.groups.map((g) => ({ members: g.members, color: g.color }));
        setComputed(result);
      });
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, byId, targetIds, settings.epsKm, settings.minPts]);

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
      setNotice(`「${r.name}」は選んだテーマに含まれないため、選択を外しました。`);
      update({ sel: null });
      return;
    }
    const inGroup = computed.groupOf.has(sel);
    const prev = prevSelState.current;
    if (prev.id === sel && prev.inGroup && !inGroup) {
      setNotice(`「${r.name}」を含むまとまりは、この条件では孤立点になりました。`);
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
      if (id !== null && isMobile) setSheetExpanded(true);
    },
    [update, isMobile],
  );
  const onMove = useCallback((pos: MapPos) => update({ map: pos }), [update]);

  const closeGuide = () => {
    setGuideOpen(false);
    writeGuideClosed();
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${serializeSettings(settings)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(imported ? 'この設定の URL をコピーしました。追加データは URL に含まれないため、開いた人には元データだけが表示されます。' : 'この設定の URL をコピーしました。');
    } catch {
      window.prompt('この URL をコピーしてください', url);
    }
  };

  const save = async (title: string) => {
    const t = cleanTitle(title);
    update({ title: t });
    if (!mapRef.current) throw new Error('地図の準備ができていません');
    const res = await exportPng(mapRef.current, computed, resources, {
      title: t,
      epsKm: settings.epsKm,
      minPts: settings.minPts,
      categoryLabel: categoryLabel(settings.cat, data),
      view: settings.view,
      userCount: imported?.resources.length ?? 0,
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(res.blob);
    a.download = `hokkaido-clusters-${settings.epsKm}km.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return res.fallback
      ? `背景地図を画像に入れられなかったため、背景を省いた出典付きの画像を保存しました。（${res.reason ?? '原因不明'}）`
      : null;
  };

  const nearest = useMemo(() => {
    if (settings.sel === null || !computed) return null;
    const n = nearestOf(index, settings.sel, computed.targetIds);
    return n ? { name: byId.get(n.id)!.name, km: n.km } : null;
  }, [settings.sel, computed, index, byId]);

  const padding = isMobile ? { top: 20, right: 20, bottom: Math.round(window.innerHeight * 0.42), left: 20 } : { top: 30, right: 400, bottom: 30, left: 30 };

  return (
    <div className={'app' + (isMobile ? ' is-mobile' : '') + (sheetExpanded ? ' sheet-expanded' : '')}>
      <MapView
        resources={resources}
        computed={computed}
        view={settings.view}
        selectedId={settings.sel}
        selectedGroup={selectedGroup}
        epsKm={settings.epsKm}
        initialPos={initialPos.current}
        padding={padding}
        onSelect={onSelect}
        onCandidates={setCandidates}
        onMove={onMove}
        onReady={(m) => (mapRef.current = m)}
        onError={setMapError}
      />
      <Panel
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
        sheetExpanded={sheetExpanded}
        setSheetExpanded={setSheetExpanded}
        categoryLabel={categoryLabel(settings.cat, data)}
        imported={imported}
        onImport={applyImport}
      />
      <div className="toast-region" aria-live="polite">
        {notice && (
          <div className="toast">
            <span>{notice}</span>
            <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="通知を閉じる">
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
              }}
            >
              再試行
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
