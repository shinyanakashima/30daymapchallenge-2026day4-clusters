/** 紙色の背景で見分けやすい 8 色。色は識別の補助で、同一性を保証しない。 */
export const PALETTE = [
  '#c2410c', // 朱
  '#0f766e', // 青緑
  '#7c3aed', // 菫
  '#b45309', // 黄土
  '#1d4ed8', // 藍
  '#be185d', // 紅
  '#4d7c0f', // 草
  '#0e7490', // 浅葱
] as const;

export interface ColoredGroup {
  members: readonly number[];
  color: number;
}

/** メンバー由来の安定した色番号 (最小 ID のハッシュ)。 */
export function memberColor(members: readonly number[]): number {
  const min = Math.min(...members);
  let h = (min * 2654435761) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h % PALETTE.length;
}

/**
 * 新しいグループに色番号を割り当てる。
 * - prev があれば、メンバーの重なりが大きい組から順に前回の色を引き継ぐ。
 *   分裂では重なり最大の子が、合流では最大の寄与元の色が残る。
 * - 対応がないグループや初期表示は、メンバー由来の色 (使用中ならずらす)。
 */
export function assignColors(groups: readonly (readonly number[])[], prev: readonly ColoredGroup[] | null): number[] {
  const colors: (number | null)[] = groups.map(() => null);
  const used = new Set<number>();

  if (prev && prev.length > 0) {
    const pairs: { g: number; p: number; overlap: number }[] = [];
    const prevSets = prev.map((p) => new Set(p.members));
    groups.forEach((members, g) => {
      prevSets.forEach((set, p) => {
        let overlap = 0;
        for (const m of members) if (set.has(m)) overlap++;
        if (overlap > 0) pairs.push({ g, p, overlap });
      });
    });
    const minId = (g: number) => Math.min(...groups[g]);
    pairs.sort(
      (a, b) =>
        b.overlap - a.overlap ||
        groups[b.g].length - groups[a.g].length ||
        minId(a.g) - minId(b.g) ||
        a.p - b.p,
    );
    const prevTaken = new Set<number>();
    for (const { g, p } of pairs) {
      if (colors[g] !== null || prevTaken.has(p)) continue;
      const c = prev[p].color;
      if (used.has(c)) continue;
      colors[g] = c;
      used.add(c);
      prevTaken.add(p);
    }
  }

  // 残り: 大きい順・最小 ID 順に、メンバー由来の色から空きを探す
  const rest = groups
    .map((members, g) => ({ g, size: members.length, min: Math.min(...members) }))
    .filter(({ g }) => colors[g] === null)
    .sort((a, b) => b.size - a.size || a.min - b.min);
  for (const { g } of rest) {
    const base = memberColor(groups[g]);
    let c = base;
    for (let k = 0; k < PALETTE.length; k++) {
      const cand = (base + k) % PALETTE.length;
      if (!used.has(cand)) {
        c = cand;
        break;
      }
    }
    colors[g] = c;
    used.add(c);
  }
  return colors as number[];
}
