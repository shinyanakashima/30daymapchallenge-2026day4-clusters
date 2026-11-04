import { useEffect, useState, type ReactNode } from 'react';
import type { LoadedData } from '../data';
import { MAX_FILE_BYTES, MAX_USER_POINTS, parseImportedGeojson, type ImportedSet } from '../importGeojson';
import { TITLE_MAX } from '../urlState';
import { useI18n } from '../i18n';

export function NumberField(props: {
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
            aria-label={label}
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

export function ImportBox({ imported, onImport }: { imported: ImportedSet | null; onImport: (s: ImportedSet | null) => void }) {
  const { t, lang } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(t.importTooLarge(Math.round(MAX_FILE_BYTES / 1024 / 1024)));
      return;
    }
    try {
      onImport(parseImportedGeojson(await file.text(), file.name, lang));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div>
      {imported && (
        <div>
          <p className="import-info">
            {t.importInfo(imported.fileName, imported.resources.length)}
            {imported.skipped.length > 0 && t.importSkipped(imported.skipped.map((x) => `${x.reason} ${x.count}`).join(t.listSep))}
            {imported.truncated > 0 && t.importTruncated(MAX_USER_POINTS, imported.truncated)}
            {imported.outsideHokkaido > 0 && t.importOutside(imported.outsideHokkaido)}
          </p>
          <button type="button" className="link-button" onClick={() => onImport(null)}>
            {t.importRemove}
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
        {imported ? t.importReplace : t.importChoose}
      </label>
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
      <p className="field-hint">
        {t.importHint}
      </p>
    </div>
  );
}

export function ExportBox({ initial, onSave }: { initial: string; onSave: (t: string) => Promise<string | null>; onClose?: () => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div role="group" aria-label={t.menuExport}>
      <label className="field-label" htmlFor="feature-title">
        {t.exportTitleLabel(TITLE_MAX)}
      </label>
      <input
        id="feature-title"
        className="text-input"
        type="text"
        maxLength={TITLE_MAX}
        value={title}
        placeholder={t.exportPlaceholder}
        onChange={(e) => setTitle(e.target.value)}
      />
      <p className="field-hint">{t.exportHint}</p>
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
              setMsg(m ?? t.exportSaved);
            } catch (e) {
              setMsg(t.exportFailed(e instanceof Error ? e.message : String(e)));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t.exportSaving : t.exportSave}
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

export function About({ data }: { data: LoadedData }) {
  const { lang } = useI18n();
  return lang === 'en' ? <AboutEn data={data} /> : <AboutJa data={data} />;
}

function AboutJa({ data }: { data: LoadedData }) {
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
        で加工）。衛星写真：
        <a href="https://s2maps.eu" target="_blank" rel="noopener">
          Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)
        </a>
        、
        <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">
          地理院タイル（全国最新写真（シームレス））
        </a>
        。海岸線・道路・地名：
        <a href="https://maps.gsi.go.jp/development/vt.html" target="_blank" rel="noopener">
          地理院ベクトルタイル
        </a>
        。夜の地形：
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
          <li>ズームでは分類は変わりません。しゃぼん玉は、まとまりに入った各地点のまわりに「近所とみなす距離」の半分の範囲を描いたもので、分類の後に描いています。しゃぼん玉どうしが触れるのは、おおむね地点どうしが設定距離以内のときです。海や山にかかることもあり、しゃぼん玉の範囲をすべて巡れるという意味ではありません。</li>
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

function AboutEn({ data }: { data: LoadedData }) {
  const s = data.manifest.source;
  const is2010 = data.manifest.edition === '2010';
  return (
    <footer className="about" lang="en">
      <p>
        Hokkaido faces an uneven distribution of visitors and limited secondary transport for touring between sites. This map groups tourism resources by distance
        ({is2010 ? '2010 edition, for comparison' : '2014 edition'}) to look for “places to visit together” across municipal borders. Clusters are based only on
        straight-line distances between representative points; they do not show actual transport access or travel patterns.
      </p>
      <p className="credit">
        Data:{' '}
        <a href={s.pageUrl} target="_blank" rel="noopener">
          National Land Numerical Information, Tourism Resources {is2010 ? 'ver. 2.0' : 'ver. 2.2'}
        </a>{' '}
        (MLIT Japan, {is2010 ? 'compiled in FY2010' : 'as of 30 Sep 2014'}, {data.manifest.stats.validPoints} spots in Hokkaido). Terms:{' '}
        <a href={s.licenseUrl} target="_blank" rel="noopener">
          non-commercial use
        </a>
        . Roadside stations:{' '}
        <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P35.html" target="_blank" rel="noopener">
          NLNI Roadside Stations
        </a>{' '}
        (MLIT, 2018, non-commercial). Airports:{' '}
        <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C28-2021.html" target="_blank" rel="noopener">
          NLNI Airports
        </a>{' '}
        (MLIT, 2021). Railways:{' '}
        <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N05-2025.html" target="_blank" rel="noopener">
          NLNI Railway Time Series
        </a>{' '}
        (MLIT, FY2025 edition, non-commercial; processed in{' '}
        <a href="https://github.com/shinyanakashima/30daymapchallenge-2026day1-station-history" target="_blank" rel="noopener">
          the Day 1 map
        </a>
        ). Satellite imagery:{' '}
        <a href="https://s2maps.eu" target="_blank" rel="noopener">
          Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)
        </a>
        ,{' '}
        <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">
          GSI Tiles (seamless photo)
        </a>
        . Coastlines, roads and place names:{' '}
        <a href="https://maps.gsi.go.jp/development/vt.html" target="_blank" rel="noopener">
          GSI Vector Tiles
        </a>
        . Night terrain:{' '}
        <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">
          Terrain Tiles (Mapzen and others)
        </a>
        .
      </p>
      <details>
        <summary>About the data and the method</summary>
        <ul className="notes">
          <li>
            The data comes from the Tourism Resource Register (Japan Travel Bureau Foundation), mainly grade A and above. It is not a list of every tourist spot in
            Hokkaido and does not show current opening status. Place names are kept in Japanese as in the source data.
          </li>
          <li>Points are representative locations such as the centre of a resource, not entrances. Line and area features are not used, to avoid counting the same resource twice.</li>
          <li>
            Clusters are found with DBSCAN (density-based clustering). A spot becomes a core when at least “spots per cluster” spots (including itself) lie within the
            distance that counts as near; spots within that distance of a core join its cluster. Distances are great-circle distances (Haversine formula).
          </li>
          <li>Spots in a chain can form a cluster longer than the set distance. The distance is neither a diameter nor a travel time.</li>
          <li>
            Zooming does not change the clusters. Each soap bubble is drawn after clustering, as half the set distance around each member spot, so bubbles touch
            roughly when spots are within the set distance. A bubble may cover sea or mountains; it does not mean the whole area can be visited.
          </li>
          <li>
            Railways are from the NLNI Railway Time Series (FY2025, non-commercial), processed in the Day 1 map “Where the Stations Were”. They show lines and stations
            in service at the end of 2025; “Closed railway lines” adds sections in service since 1950 as dashed lines. Stations appear when you zoom in.
          </li>
          <li>Airports are reference points from NLNI Airports (2021). Airports in service glow; suspended ones are hollow. They are not used in the clustering.</li>
          <li>Roadside stations are registrations as of 2018, shown for reference only. Roads are GSI road centre lines (expressways, national and prefectural roads).</li>
          <li>Colors carry over from the previous result by member overlap. They help tell clusters apart but do not guarantee that a cluster is “the same”.</li>
          <li>The Nature / Culture themes follow the categories of the Tourism Resource Register (the source’s own category codes are not set for Hokkaido).</li>
        </ul>
      </details>
    </footer>
  );
}
