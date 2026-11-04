import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LoadedData } from '../data';
import { PALETTE } from '../lib/colors';
import type { Computed, Group } from '../model';
import type { AppSettings, CategorySel, GroupKey, Resource } from '../types';
import { EPS_MAX, EPS_MIN, MINPTS_MAX, MINPTS_MIN, TITLE_MAX } from '../urlState';
import { GUIDE_STEPS, GuideCard, type GuideAnchor } from './Guide';
import { GroupCard, PointCard } from './SelectionCard';
import { MAX_FILE_BYTES, MAX_USER_POINTS, parseImportedGeojson, type ImportedSet } from '../importGeojson';

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
  sheetExpanded: boolean;
  setSheetExpanded: (v: boolean) => void;
  categoryLabel: string;
  imported: ImportedSet | null;
  onImport: (set: ImportedSet | null) => void;
  onEdition: (e: '2014' | '2010') => void;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function NumberField(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
  hint?: ReactNode;
}) {
  const { id, label, value, min, max, unit, onChange, hint } = props;
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && raw.trim() !== '') onChange(Math.min(max, Math.max(min, n)));
    else setDraft(String(value));
  };
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="field-row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`${value}${unit}`}
        />
        <span className="num">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={draft}
            aria-label={`${label}（数値）`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
          />
          <span className="unit">{unit}</span>
        </span>
      </div>
      {hint}
    </div>
  );
}

export function Panel(p: Props) {
  const { data, byId, settings, update, computed, guideOpen, guideStep } = p;
  const anchorRefs = useRef<Partial<Record<GuideAnchor, HTMLElement | null>>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (settings.sel === null) return;
    const t = window.setTimeout(() => cardRef.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }), 50);
    return () => window.clearTimeout(t);
  }, [settings.sel]);

  const guided: GuideAnchor | null = guideOpen ? GUIDE_STEPS[guideStep].anchor : null;
  const firstGuideRun = useRef(true);
  useEffect(() => {
    // 初回表示ではパネルを動かさない (見出しを隠さない)
    if (firstGuideRun.current) {
      firstGuideRun.current = false;
      return;
    }
    if (!guided) return;
    anchorRefs.current[guided]?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guided]);

  const guide = (anchor: GuideAnchor) =>
    guided === anchor ? <GuideCard step={guideStep} onStep={p.setGuideStep} onClose={p.closeGuide} /> : null;
  const section = (anchor: GuideAnchor, className: string, children: ReactNode) => (
    <div
      ref={(el) => {
        anchorRefs.current[anchor] = el;
      }}
      className={className + (guided === anchor ? ' is-guided' : '')}
    >
      {guide(anchor)}
      {children}
    </div>
  );

  const setCat = (cat: CategorySel) => update({ cat });
  const catMode = settings.cat.type === 'kinds' ? 'kinds' : settings.cat.type === 'group' ? settings.cat.group : 'all';
  const kindKeys = settings.cat.type === 'kinds' ? settings.cat.keys : null;
  const toggleKind = (key: string) => {
    const cur = new Set(kindKeys ?? []);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    setCat({ type: 'kinds', keys: [...cur].sort() });
  };

  const sel = settings.sel !== null ? byId.get(settings.sel) ?? null : null;
  const clusters = settings.view === 'clusters';
  const stats = computed && (
    <p className="stats" aria-live="polite">
      <span>
        対象 <b>{computed.targetIds.length}</b> 地点
      </span>
      {clusters ? (
        <>
          <span>
            まとまり <b>{computed.groups.length}</b>
          </span>
          <span>
            孤立点 <b>{computed.noise.length}</b>
          </span>
        </>
      ) : (
        <span className="muted">点だけ表示中</span>
      )}
    </p>
  );

  let card: ReactNode = null;
  if (sel && computed && computed.targetIds.includes(sel.id)) {
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
            {sel.kind}／{sel.address}
          </p>
          <p className="hint">「まとまり」に切り替えると、この地点がどのまとまりに入るかが分かります。</p>
        </section>
      );
    }
  }

  return (
    <aside className="panel" aria-label="操作パネル">
      {p.isMobile && (
        <button
          type="button"
          className="sheet-handle"
          aria-expanded={p.sheetExpanded}
          onClick={() => p.setSheetExpanded(!p.sheetExpanded)}
        >
          <span className="sheet-grip" aria-hidden="true" />
          {p.sheetExpanded ? '地図を広く見る' : '操作をひらく'}
        </button>
      )}
      <div className="panel-scroll">
        <header className="panel-head">
          <div>
            <h1 className="title">北海道、旅のまとまりを探して。</h1>
            <p className="subtitle">クラスターにすると見えてくる</p>
            {settings.title && <p className="feature-title">特集：{settings.title}</p>}
          </div>
          <div className="head-actions">
            <button type="button" className="btn btn-quiet" onClick={p.openGuide}>
              ガイド
            </button>
            <div className="seg seg-small" role="radiogroup" aria-label="背景地図">
              {(
                [
                  ['day', '昼'],
                  ['night', '夜'],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" role="radio" aria-checked={settings.theme === key} onClick={() => update({ theme: key })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {candidates(p, byId)}

        {section(
          'groups',
          'block',
          <>
            <div className="view-toggle" role="group" aria-label="表示の比較">
              <button type="button" aria-pressed={clusters} onClick={() => update({ view: 'clusters' })}>
                まとまり
              </button>
              <button type="button" aria-pressed={!clusters} onClick={() => update({ view: 'points' })}>
                点だけ
              </button>
            </div>
            {stats}
            <div className="legend" aria-label="凡例">
              {clusters ? (
                <>
                  <span><i className="lg-dot" />まとまりの地点</span>
                  <span><i className="lg-noise" />孤立点</span>
                </>
              ) : (
                <span><i className="lg-dot lg-plain" />観光資源</span>
              )}
              <label className="lg-toggle">
                <input type="checkbox" checked={settings.showEki} onChange={(e) => update({ showEki: e.target.checked })} />
                <i className="lg-eki" />道の駅
              </label>
              <label className="lg-toggle">
                <input type="checkbox" checked={settings.showAirports} onChange={(e) => update({ showAirports: e.target.checked })} />
                <i className="lg-airport" />空港
              </label>
              <label className="lg-toggle">
                <input type="checkbox" checked={settings.showRail} onChange={(e) => update({ showRail: e.target.checked })} />
                <i className="lg-rail" />鉄道
              </label>
              <label className="lg-toggle">
                <input type="checkbox" checked={settings.showRailHistory} onChange={(e) => update({ showRailHistory: e.target.checked })} />
                <i className="lg-rail-history" />廃止された路線
              </label>
              <label className="lg-toggle">
                <input type="checkbox" checked={settings.showRoads} onChange={(e) => update({ showRoads: e.target.checked })} />
                <i className="lg-road" />道路
              </label>
            </div>
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
          </>,
        )}

        {card && (
          <div className="block" ref={cardRef}>
            {card}
          </div>
        )}

        <div className="block">
          <p className="field-label">観光資源データの版</p>
          <div className="seg" role="radiogroup" aria-label="観光資源データの版">
            {(
              [
                ['2014', '2014年版'],
                ['2010', '2010年版'],
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
              : '比較用の古い版（第2.0版、2010年度作成）。北海道は141地点で、自然資源が中心です。収録の基準が違うため、件数はそのまま比べられません。'}
          </p>
        </div>

        {section(
          'distance',
          'block',
          <>
            <NumberField
              id="eps"
              label="近所とみなす距離"
              value={settings.epsKm}
              min={EPS_MIN}
              max={EPS_MAX}
              unit="km"
              onChange={(v) => update({ epsKm: v })}
            />
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
          </>,
        )}

        {section(
          'category',
          'block',
          <fieldset className="field">
            <legend className="field-label">テーマ</legend>
            <div className="seg" role="radiogroup" aria-label="テーマ">
              {(
                [
                  ['all', 'すべて'],
                  ['nature', '自然資源'],
                  ['culture', '人文資源'],
                  ...(p.imported ? ([['user', '追加データ']] as const) : []),
                  ['kinds', '種別で選ぶ'],
                ] as const
              ).map(([key, label]) => (
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
                      const keys = data.categories.kinds
                        .filter((k) => cur.type === 'all' || (cur.type === 'group' && k.group === cur.group))
                        .map((k) => k.key);
                      setCat({ type: 'kinds', keys });
                    }
                    else setCat({ type: 'group', group: key as GroupKey });
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
          </fieldset>,
        )}

        <div className="block actions">
          <button type="button" className="btn btn-quiet" onClick={p.onShare}>
            設定URLをコピー
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setExportOpen(true)}>
            画像を保存
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => update({ epsKm: p.defaults.epsKm, minPts: p.defaults.minPts, cat: p.defaults.cat })}
          >
            初期設定に戻す
          </button>
        </div>
        <ImportBox imported={p.imported} onImport={p.onImport} />
        {exportOpen && <ExportBox initial={settings.title} onSave={p.onSave} onClose={() => setExportOpen(false)} />}

        <About data={data} />
      </div>
    </aside>
  );
}

function candidates(p: Props, byId: Map<number, Resource>) {
  if (!p.candidates) return null;
  return (
    <div className="block card candidates" role="dialog" aria-label="同じ場所にある地点">
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
    </div>
  );
}

function ImportBox({ imported, onImport }: { imported: ImportedSet | null; onImport: (s: ImportedSet | null) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`ファイルが大きすぎます（${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB まで）`);
      return;
    }
    try {
      onImport(parseImportedGeojson(await file.text(), file.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="block">
      <p className="field-label">地点を追加する</p>
      {imported && (
        <div>
          <p className="import-info">
            <b>{imported.fileName}</b>：{imported.resources.length} 地点
            {imported.skipped.length > 0 && `（除外：${imported.skipped.map((x) => `${x.reason} ${x.count}`).join('、')}）`}
            {imported.truncated > 0 && `（上限 ${MAX_USER_POINTS} 地点を超えた ${imported.truncated} 地点は読み込んでいません）`}
            {imported.outsideHokkaido > 0 && `。うち ${imported.outsideHokkaido} 地点は北海道の外です`}
          </p>
          <button type="button" className="link-button" onClick={() => onImport(null)}>
            追加データを取り消す
          </button>
        </div>
      )}
      <label
        className={'import-drop' + (over ? ' is-over' : '')}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void read(e.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {imported ? '別の GeoJSON に差し替える' : 'GeoJSON（点）を選ぶ、またはここにドロップ'}
      </label>
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
      <p className="field-hint">
        ファイルは送信されず、このブラウザの中だけで使います。名称は name／名称、種別は kind／category／種別 の項目から読み取ります。テーマ「すべて」で元データと合わせて、「追加データ」で追加分だけでまとめます。
      </p>
    </div>
  );
}

function ExportBox({ initial, onSave, onClose }: { initial: string; onSave: (t: string) => Promise<string | null>; onClose: () => void }) {
  const [title, setTitle] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="block card" role="dialog" aria-labelledby="export-title">
      <div className="card-head">
        <h2 id="export-title" className="card-title small">
          画像（PNG）を保存
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>
      <label className="field-label" htmlFor="feature-title">
        特集タイトル（任意・{TITLE_MAX}字まで）
      </label>
      <input
        id="feature-title"
        className="text-input"
        type="text"
        maxLength={TITLE_MAX}
        value={title}
        placeholder="例：道東の湖をめぐるなら"
        onChange={(e) => setTitle(e.target.value)}
      />
      <p className="field-hint">地図・凡例・出典・基準年が画像に入ります。タイトルは共有URLにも残ります。</p>
      <div className="guide-nav">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              const m = await onSave(title);
              setMsg(m ?? '保存しました。');
            } catch (e) {
              setMsg(`保存できませんでした：${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '作成中…' : 'PNGを保存'}
        </button>
      </div>
      {msg && (
        <p className="field-hint" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

function About({ data }: { data: LoadedData }) {
  const s = data.manifest.source;
  return (
    <footer className="about">
      <p>
        北海道では、観光客の地域偏在や、二次交通による周遊のしづらさが課題とされています。この地図では{data.manifest.edition === '2010' ? '2010年度版（比較用）' : '2014年版'}の観光資源データを距離でグループ化し、行政界を越えた「一緒に巡る候補」を探ります。まとまりは代表位置間の距離に基づくもので、実際の交通アクセスや周遊実績を示すものではありません。
      </p>
      <p className="credit">
        出典：
        <a href={s.pageUrl} target="_blank" rel="noopener">
          国土数値情報（観光資源）{data.manifest.edition === '2010' ? '第2.0版' : '第2.2版'}
        </a>
        （国土交通省、{data.manifest.edition === '2010' ? '2010年度作成' : '基準日 2014年9月30日'}、北海道 {data.manifest.stats.validPoints} 地点）。利用条件：
        <a href={s.licenseUrl} target="_blank" rel="noopener">
          非商用
        </a>
        。道の駅：
        <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P35.html" target="_blank" rel="noopener">
          国土数値情報（道の駅）
        </a>
        （国土交通省、2018年、非商用）。空港：
        <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C28-2021.html" target="_blank" rel="noopener">
          国土数値情報（空港）
        </a>
        （国土交通省、2021年）。鉄道：
        <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N05-2025.html" target="_blank" rel="noopener">
          国土数値情報（鉄道時系列）
        </a>
        （国土交通省、2025年度版、非商用。
        <a href="https://github.com/shinyanakashima/30daymapchallenge-2026day1-station-history" target="_blank" rel="noopener">
          Day1 作品
        </a>
        で加工）。背景：
        <a href="https://maps.gsi.go.jp/development/vt.html" target="_blank" rel="noopener">
          地理院ベクトルタイル
        </a>
        、地形：
        <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">
          Terrain Tiles（Mapzen ほか）
        </a>
        。
      </p>
      <details>
        <summary>データと計算について</summary>
        <ul className="notes">
          <li>観光資源台帳（日本交通公社）のA級以上などから整備されたデータで、北海道の全観光スポットではありません。現在の営業や入場可否も示しません。</li>
          <li>点は施設の入口ではなく、資源の中心部などの代表位置です。線・面のデータは同じ資源の二重計数を避けるため使っていません。</li>
          <li>
            まとまりは DBSCAN（密度にもとづくクラスタリング）で求めています。「近所とみなす距離」以内に「何地点から集まりと呼ぶ？」以上の地点（その地点自身を含む）があれば中心となり、中心から距離内の地点を同じまとまりに加えます。距離は Haversine 式による地表の直線距離です。
          </li>
          <li>近い点が連なると、端から端までが設定距離より長いまとまりもできます。設定距離は直径でも移動時間でもありません。</li>
          <li>ズームでは分類は変わりません。色のにじみは、まとまりに入った各地点のまわりに「近所とみなす距離」の半分の範囲を描いたもので、分類の後に描いています。にじみが重なるのは、おおむね地点どうしが設定距離以内のときです。海や山にかかることもあり、にじみの範囲をすべて巡れるという意味ではありません。</li>
          <li>鉄道は国土数値情報（鉄道時系列、2025年度版・非商用）を Day1 作品「駅のあった北海道」で加工したデータです。2025年末時点で営業中の路線と駅を示し、「廃止された路線」では1950年以降に営業していた区間を破線で重ねます。駅は拡大すると表示されます。</li>
          <li>空港は国土数値情報（空港、2021年）の標点位置です。供用中の空港を光らせ、休止中は白抜きで示します。まとまりの計算には含めていません。</li>
          <li>道の駅は2018年時点の登録を重ねた参考情報で、まとまりの計算には含めていません。道路は地理院ベクトルタイルの道路中心線（高速・国道・道道など）です。</li>
          <li>色は前回のまとまりとの重なりで引き継いでいますが、識別の補助で、まとまりの同一性を保証するものではありません。</li>
          <li>テーマの「自然資源・人文資源」は観光資源台帳の区分に合わせた対応表です（元データの分類コードは北海道分が未設定のため）。</li>
        </ul>
      </details>
    </footer>
  );
}
