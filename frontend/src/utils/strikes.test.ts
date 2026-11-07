import {
  strikeStep,
  roundStrike,
  strikeAtOrBelow,
  strikeAtOrAbove,
  defaultVerticalStrikes,
  defaultCondorStrikes,
  isPlausibleStrike,
} from './strikes';

describe('strike grid', () => {
  test('step widens with the price', () => {
    expect([3, 12, 30, 293.71, 750].map(strikeStep)).toEqual([0.5, 1, 2.5, 5, 10]);
  });

  test('rounding lands on the grid', () => {
    expect(roundStrike(284.89, 5)).toBe(285);
    expect(roundStrike(28.6, 2.5)).toBe(27.5);
    expect(strikeAtOrBelow(279.02, 5)).toBe(275);
    expect(strikeAtOrAbove(308.4, 5)).toBe(310);
  });

  test('a price already on the grid stays put despite float noise', () => {
    expect(strikeAtOrBelow(0.29 * 100, 1)).toBe(29); // 28.999999999999996; a bare floor gives 28
    expect(strikeAtOrAbove(1.1 * 100, 5)).toBe(110); // 110.00000000000001; a bare ceil gives 115
  });
});

describe('default spread strikes', () => {
  test('AVGO at $293.71: listed strikes, not $284.88 / $302.50', () => {
    expect(defaultVerticalStrikes(293.71)).toEqual([285, 305]);
    expect(defaultCondorStrikes(293.71)).toEqual([265, 275, 310, 325]);
  });

  test('cheap stock: the two vertical strikes never collapse to one', () => {
    expect(defaultVerticalStrikes(10)).toEqual([9, 11]);
  });

  test('condor strikes stay strictly ordered at every price', () => {
    for (const S of [2, 7.3, 10, 24.9, 26, 49, 51, 120, 499, 501, 1200]) {
      const ks = defaultCondorStrikes(S)!;
      for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThan(ks[i - 1]);
      expect(ks[1]).toBeLessThan(S);
      expect(ks[2]).toBeGreaterThan(S);
      expect(ks[0]).toBeGreaterThan(0);
      ks.forEach((k) => expect(isPlausibleStrike(k)).toBe(true));
    }
  });

  test('no price, no defaults', () => {
    expect(defaultVerticalStrikes(NaN)).toBeNull();
    expect(defaultCondorStrikes(0)).toBeNull();
  });
});

describe('isPlausibleStrike', () => {
  test('whole dollars and $0.50 steps pass; other cents do not', () => {
    expect([285, 287.5, 12.5, 3.5].every(isPlausibleStrike)).toBe(true);
    expect([284.88, 302.25, 0, -5, NaN].some(isPlausibleStrike)).toBe(false);
  });
});
