import { useEffect, useState, type ReactNode } from 'react';
import type { LoadedData } from '../data';
import { MAX_FILE_BYTES, MAX_USER_POINTS, parseImportedGeojson, type ImportedSet } from '../importGeojson';
import { TITLE_MAX } from '../urlState';

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

export function ImportBox({ imported, onImport }: { imported: ImportedSet | null; onImport: (s: ImportedSet | null) => void }) {
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
    <div>
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

export function ExportBox({ initial, onSave }: { initial: string; onSave: (t: string) => Promise<string | null>; onClose?: () => void }) {
  const [title, setTitle] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div role="group" aria-label="画像（PNG）を保存">
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

export function About({ data }: { data: LoadedData }) {
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
