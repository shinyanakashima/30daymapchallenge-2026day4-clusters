import { describe, expect, it } from 'vitest';
import { BLOB_THRESHOLD, VISIBLE_RATIO } from '../src/blob';

const kernel = (x: number) => 0.3989422804 * Math.exp(-4.5 * x * x);

describe('にじみの寸法', () => {
  it('1 点のにじみの見た目の半径は核半径 × VISIBLE_RATIO', () => {
    expect(kernel(VISIBLE_RATIO)).toBeCloseTo(BLOB_THRESHOLD, 6);
  });
  it('距離 ε の 2 点は、中点で閾値を超えてつながる', () => {
    // 見た目の半径を ε/2 にしたとき、中点は各点から ε/2 = 核半径 × VISIBLE_RATIO
    expect(2 * kernel(VISIBLE_RATIO)).toBeGreaterThan(BLOB_THRESHOLD);
  });
});
