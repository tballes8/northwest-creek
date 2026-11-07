import { expiryPnl, summarizePayoff, PayoffLeg } from './spreadPayoff';

const bullCall = (K1: number, K2: number): PayoffLeg[] => [
  { type: 'call', K: K1, dir: 1 },
  { type: 'call', K: K2, dir: -1 },
];

test('bull call spread at the model price', () => {
  const s = summarizePayoff(bullCall(285, 305), 8.42);
  expect(s.maxProfit).toBeCloseTo(11.58, 10);
  expect(s.maxLoss).toBeCloseTo(-8.42, 10);
  expect(s.breakevens).toHaveLength(1);
  expect(s.breakevens[0]).toBeCloseTo(293.42, 10);
  expect(s.rewardToRisk).toBeCloseTo(11.58 / 8.42, 10);
});

test('your own fill changes the trade: $5 spread bought for $0.14 is about 35 to 1', () => {
  const s = summarizePayoff(bullCall(290, 295), 0.14);
  expect(s.maxProfit).toBeCloseTo(4.86, 10);
  expect(s.maxLoss).toBeCloseTo(-0.14, 10);
  expect(s.breakevens[0]).toBeCloseTo(290.14, 10);
  expect(s.rewardToRisk).toBeCloseTo(34.71, 2);
});

test('a debit above the spread width can only lose', () => {
  const s = summarizePayoff(bullCall(290, 295), 5.5);
  expect(s.maxProfit).toBeCloseTo(-0.5, 10);
  expect(s.breakevens).toEqual([]);
  expect(s.rewardToRisk).toBeNull();
});

test('bear put spread', () => {
  const legs: PayoffLeg[] = [{ type: 'put', K: 305, dir: 1 }, { type: 'put', K: 285, dir: -1 }];
  const s = summarizePayoff(legs, 9);
  expect(s.maxProfit).toBeCloseTo(11, 10);
  expect(s.maxLoss).toBeCloseTo(-9, 10);
  expect(s.breakevens[0]).toBeCloseTo(296, 10);
});

test('iron condor for a credit: two breakevens, both sides capped', () => {
  const legs: PayoffLeg[] = [
    { type: 'put', K: 90, dir: 1 }, { type: 'put', K: 95, dir: -1 },
    { type: 'call', K: 105, dir: -1 }, { type: 'call', K: 110, dir: 1 },
  ];
  const s = summarizePayoff(legs, -1.5);
  expect(s.maxProfit).toBeCloseTo(1.5, 10);
  expect(s.maxLoss).toBeCloseTo(-3.5, 10);
  expect(s.breakevens.map((b) => +b.toFixed(6))).toEqual([93.5, 106.5]);
});

test('straddle: unlimited upside, breakevens beyond any chart edge still found', () => {
  const legs: PayoffLeg[] = [{ type: 'call', K: 100, dir: 1 }, { type: 'put', K: 100, dir: 1 }];
  const s = summarizePayoff(legs, 60);
  expect(s.maxProfit).toBe(Infinity);
  expect(s.maxLoss).toBeCloseTo(-60, 10);
  expect(s.breakevens.map((b) => +b.toFixed(6))).toEqual([40, 160]);
  expect(s.rewardToRisk).toBeNull();
});

test('a short call has unlimited loss', () => {
  const s = summarizePayoff([{ type: 'call', K: 100, dir: -1 }], -3);
  expect(s.maxLoss).toBe(-Infinity);
  expect(s.maxProfit).toBeCloseTo(3, 10);
  expect(s.breakevens[0]).toBeCloseTo(103, 10);
});

test('expiryPnl matches the summary at the strikes', () => {
  expect(expiryPnl(bullCall(285, 305), 8.42, 250)).toBeCloseTo(-8.42, 10);
  expect(expiryPnl(bullCall(285, 305), 8.42, 400)).toBeCloseTo(11.58, 10);
});
