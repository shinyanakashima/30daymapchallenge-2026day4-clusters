export const GUIDE_STEPS = [
  {
    anchor: 'groups',
    title: 'まとめると、どんなエリアが見える？',
    body: '近い観光資源どうしを、色のにじみでまとめています。にじみか、ここ（件数の札）から開く一覧を選ぶと、地点数や種別の内訳が出ます。',
  },
  {
    anchor: 'distance',
    title: '距離を広げると、どこまでまとまる？',
    body: '距離のスライダーを動かすと、まとまりが現れたり、つながったり、分かれたりします。',
  },
  {
    anchor: 'category',
    title: 'テーマを変えると、まとまりはどう変わる？',
    body: '距離はそのままに、ここからテーマを「自然資源」や「人文資源」に絞って比べてみてください。',
  },
] as const;

export type GuideAnchor = (typeof GUIDE_STEPS)[number]['anchor'];

interface Props {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}

export function GuideCard({ step, onStep, onClose }: Props) {
  const s = GUIDE_STEPS[step];
  const last = step === GUIDE_STEPS.length - 1;
  return (
    <div className="guide" role="dialog" aria-modal="false" aria-labelledby="guide-title">
      <div className="guide-head">
        <span className="guide-step">
          {step + 1}/{GUIDE_STEPS.length}
        </span>
        <button type="button" className="link-button" onClick={onClose}>
          スキップ
        </button>
      </div>
      <p id="guide-title" className="guide-title">
        {s.title}
      </p>
      <p className="guide-body">{s.body}</p>
      <div className="guide-nav">
        <button type="button" className="btn btn-quiet" onClick={() => onStep(step - 1)} disabled={step === 0}>
          戻る
        </button>
        {last ? (
          <button type="button" className="btn" onClick={onClose}>
            自由に探す
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => onStep(step + 1)}>
            次へ
          </button>
        )}
      </div>
    </div>
  );
}
