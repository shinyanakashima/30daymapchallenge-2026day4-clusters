import { PALETTE } from '../lib/colors';
import type { Group } from '../model';
import type { Resource } from '../types';

const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : Math.round(km).toString());

interface GroupProps {
  group: Group;
  byId: Map<number, Resource>;
  selectedId: number | null;
  epsKm: number;
  onPick: (id: number) => void;
  onClose: () => void;
}

export function GroupCard({ group, byId, selectedId, epsKm, onPick, onClose }: GroupProps) {
  const total = group.members.length;
  const count = (g: string) => group.members.filter((id) => byId.get(id)?.group === g).length;
  const nature = count('nature');
  const culture = count('culture');
  const user = count('user');
  return (
    <section className="card" aria-labelledby="card-title">
      <div className="card-head">
        <span className="swatch" style={{ background: PALETTE[group.color] }} aria-hidden="true" />
        <h2 id="card-title" className="card-title">
          {group.label}
          <span className="card-sub"> のまとまり</span>
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="選択を閉じる">
          ×
        </button>
      </div>
      <dl className="facts">
        <div>
          <dt>地点数</dt>
          <dd>{total}</dd>
        </div>
        <div>
          <dt>最大直線距離</dt>
          <dd>{fmtKm(group.maxKm)} km</dd>
        </div>
      </dl>
      <div className="mix" aria-label={`自然資源 ${nature}、人文資源 ${culture}` + (user ? `、追加データ ${user}` : '')}>
        <div className="mix-bar">
          <span className="mix-nature" style={{ flexGrow: nature }} />
          <span className="mix-culture" style={{ flexGrow: culture }} />
          <span className="mix-user" style={{ flexGrow: user }} />
        </div>
        <div className="mix-legend">
          <span>
            <i className="dot dot-nature" />
            自然資源 {nature}
          </span>
          <span>
            <i className="dot dot-culture" />
            人文資源 {culture}
          </span>
          {user > 0 && (
            <span>
              <i className="dot dot-user" />
              追加データ {user}
            </span>
          )}
        </div>
      </div>
      <p className="kinds">
        {group.kinds.map((k) => (
          <span key={k.kind} className="tag">
            {k.kind} {k.count}
          </span>
        ))}
      </p>
      {group.municipalities.length > 0 && (
        <p className="munis">
          <span className="label">含まれる自治体</span>
          {group.municipalities.map((m) => m.name).join('、')}
        </p>
      )}
      {group.maxKm > epsKm * 2 && (
        <p className="hint">近い点が連なると、大きなまとまりにもなります。まとまりの端から端までが「近所」という意味ではありません。</p>
      )}
      <details className="names">
        <summary>名称の一覧</summary>
        <ul>
          {group.members.map((id) => {
            const r = byId.get(id)!;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={'name-button' + (id === selectedId ? ' is-current' : '')}
                  onClick={() => onPick(id)}
                  aria-current={id === selectedId ? 'true' : undefined}
                >
                  {r.name}
                  <span className="name-kind">{r.kind}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

interface PointProps {
  resource: Resource;
  nearest: { name: string; km: number } | null;
  onClose: () => void;
}

export function PointCard({ resource, nearest, onClose }: PointProps) {
  return (
    <section className="card" aria-labelledby="card-title">
      <div className="card-head">
        <span className="swatch swatch-noise" aria-hidden="true" />
        <h2 id="card-title" className="card-title">
          {resource.name}
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="選択を閉じる">
          ×
        </button>
      </div>
      <p className="muted">この条件では孤立点です（どのまとまりにも入っていません）。</p>
      <dl className="facts">
        <div>
          <dt>種別</dt>
          <dd className="small">{resource.kind}</dd>
        </div>
        <div>
          <dt>最も近い対象地点</dt>
          <dd className="small">{nearest ? `${nearest.name}（${fmtKm(nearest.km)} km）` : 'なし'}</dd>
        </div>
      </dl>
      {resource.address && (
        <p className="munis">
          <span className="label">所在地</span>
          {resource.address}
        </p>
      )}
      {resource.group === 'user' && <p className="muted">利用者が追加した地点です。</p>}
    </section>
  );
}
