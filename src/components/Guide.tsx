import { useI18n } from '../i18n';

/** 3 ステップのガイドが指す操作。文言は i18n の guideSteps にある (同じ順) */
export const GUIDE_STEPS = [{ anchor: 'groups' }, { anchor: 'distance' }, { anchor: 'category' }] as const;

export type GuideAnchor = (typeof GUIDE_STEPS)[number]['anchor'];

interface Props {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}

export function GuideCard({ step, onStep, onClose }: Props) {
  const { t } = useI18n();
  const s = t.guideSteps[step];
  const last = step === GUIDE_STEPS.length - 1;
  return (
    <div className="guide" role="dialog" aria-modal="false" aria-labelledby="guide-title">
      <div className="guide-head">
        <span className="guide-step">
          {step + 1}/{GUIDE_STEPS.length}
        </span>
        <button type="button" className="link-button" onClick={onClose}>
          {t.skip}
        </button>
      </div>
      <p id="guide-title" className="guide-title">
        {s.title}
      </p>
      <p className="guide-body">{s.body}</p>
      <div className="guide-nav">
        <button type="button" className="btn btn-quiet" onClick={() => onStep(step - 1)} disabled={step === 0}>
          {t.back}
        </button>
        {last ? (
          <button type="button" className="btn" onClick={onClose}>
            {t.explore}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => onStep(step + 1)}>
            {t.next}
          </button>
        )}
      </div>
    </div>
  );
}
