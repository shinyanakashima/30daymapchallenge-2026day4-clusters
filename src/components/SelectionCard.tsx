import { PALETTE } from '../lib/colors';
import type { Group } from '../model';
import type { Resource } from '../types';
import { kindName, useI18n } from '../i18n';

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
  const { lang, t } = useI18n();
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
          <span className="card-sub">{t.clusterSuffix}</span>
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t.closeSelection}>
          ×
        </button>
      </div>
      <dl className="facts">
        <div>
          <dt>{t.spots}</dt>
          <dd>{total}</dd>
        </div>
        <div>
          <dt>{t.maxDistance}</dt>
          <dd>{fmtKm(group.maxKm)} km</dd>
        </div>
      </dl>
      <div className="mix" aria-label={`${t.nature} ${nature}${t.listSep}${t.culture} ${culture}` + (user ? `${t.listSep}${t.added} ${user}` : '')}>
        <div className="mix-bar">
          <span className="mix-nature" style={{ flexGrow: nature }} />
          <span className="mix-culture" style={{ flexGrow: culture }} />
          <span className="mix-user" style={{ flexGrow: user }} />
        </div>
        <div className="mix-legend">
          <span>
            <i className="dot dot-nature" />
            {t.nature} {nature}
          </span>
          <span>
            <i className="dot dot-culture" />
            {t.culture} {culture}
          </span>
          {user > 0 && (
            <span>
              <i className="dot dot-user" />
              {t.added} {user}
            </span>
          )}
        </div>
      </div>
      <p className="kinds">
        {group.kinds.map((k) => (
          <span key={k.kind} className="tag">
            {kindName(k.kind, lang)} {k.count}
          </span>
        ))}
      </p>
      {group.municipalities.length > 0 && (
        <p className="munis">
          <span className="label">{t.municipalities}</span>
          {group.municipalities.map((m) => m.name).join(t.listSep)}
        </p>
      )}
      {group.maxKm > epsKm * 2 && (
        <p className="hint">{t.chainHint}</p>
      )}
      <details className="names">
        <summary>{t.names}</summary>
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
                  <span className="name-kind">{kindName(r.kind, lang)}</span>
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
  const { lang, t } = useI18n();
  return (
    <section className="card" aria-labelledby="card-title">
      <div className="card-head">
        <span className="swatch swatch-noise" aria-hidden="true" />
        <h2 id="card-title" className="card-title">
          {resource.name}
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t.closeSelection}>
          ×
        </button>
      </div>
      <p className="muted">{t.isolatedNote}</p>
      <dl className="facts">
        <div>
          <dt>{t.kind}</dt>
          <dd className="small">{kindName(resource.kind, lang)}</dd>
        </div>
        <div>
          <dt>{t.nearest}</dt>
          <dd className="small">{nearest ? (lang === 'en' ? `${nearest.name} (${fmtKm(nearest.km)} km)` : `${nearest.name}（${fmtKm(nearest.km)} km）`) : t.none}</dd>
        </div>
      </dl>
      {resource.address && (
        <p className="munis">
          <span className="label">{t.location}</span>
          {resource.address}
        </p>
      )}
      {resource.group === 'user' && <p className="muted">{t.userSpot}</p>}
    </section>
  );
}
