import { describe, expect, it } from 'vitest';
import {
  clampRatio,
  computeScrollRatio,
  ratioToScrollTop,
} from '@/lib/reader/progress';

describe('clampRatio', () => {
  it('clamps into [0, 1]', () => {
    expect(clampRatio(-1)).toBe(0);
    expect(clampRatio(0)).toBe(0);
    expect(clampRatio(0.42)).toBe(0.42);
    expect(clampRatio(2)).toBe(1);
    expect(clampRatio(Number.NaN)).toBe(0);
  });
});

describe('computeScrollRatio / ratioToScrollTop', () => {
  it('returns 0 when content fits viewport', () => {
    expect(computeScrollRatio(0, 800, 900)).toBe(0);
    expect(ratioToScrollTop(0.5, 800, 900)).toBe(0);
  });

  it('round-trips mid and end positions', () => {
    const scrollHeight = 2000;
    const clientHeight = 500;
    const mid = computeScrollRatio(750, scrollHeight, clientHeight);
    expect(mid).toBeCloseTo(0.5, 5);
    expect(ratioToScrollTop(mid, scrollHeight, clientHeight)).toBeCloseTo(
      750,
      5,
    );
    expect(computeScrollRatio(1500, scrollHeight, clientHeight)).toBe(1);
    expect(ratioToScrollTop(1, scrollHeight, clientHeight)).toBe(1500);
  });
});
