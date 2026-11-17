/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   these tests check drawn geometry: SVG lines, dots and labels have no accessible
   role, so their coordinates can only be read off the nodes. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Area, AreaChart, Legend, XAxis, YAxis } from 'recharts';
import { ThemeProvider } from '../contexts/ThemeContext';
import {
  DrawingOverlay, DrawingToolbar, FrameSource, PlotRect, RechartsPlotArea, useDrawingTools,
} from './DrawingTools';

// A fake chart: 41 bars across x 50→450 (10px per bar), prices 0→100 over y 210→10.
const frame: FrameSource = {
  getFrame: () => ({
    plot: { left: 50, top: 10, right: 450, bottom: 210 },
    xToPx: xi => 50 + xi * 10,
    pxToX: px => Math.max(0, Math.min(40, Math.round((px - 50) / 10))),
    yToPx: price => 210 - price * 2,
    pxToY: py => (210 - py) / 2,
  }),
};

const Harness: React.FC<{ resetKey?: string }> = ({ resetKey }) => {
  const drawing = useDrawingTools(resetKey);
  return (
    <>
      <DrawingToolbar drawing={drawing} />
      <div id="chart"><DrawingOverlay drawing={drawing} frame={frame} /></div>
    </>
  );
};

const setup = (resetKey = 'A') => {
  const utils = render(<ThemeProvider><Harness resetKey={resetKey} /></ThemeProvider>);
  const overlay = () => utils.container.querySelector('#chart svg') as SVGSVGElement;
  // jsdom has no layout, so the overlay's bounding rect is at 0,0 and client coords are local px
  const click = (x: number, y: number) => fireEvent.click(overlay(), { clientX: x, clientY: y });
  const lines = () => Array.from(overlay().querySelectorAll('line')).map(l =>
    ['x1', 'y1', 'x2', 'y2'].map(a => Number(l.getAttribute(a))));
  const dots = () => Array.from(overlay().querySelectorAll('circle')).map(c =>
    [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);
  return { ...utils, overlay, click, lines, dots };
};

test('channel: base line, parallel through the third click, both across the plot', () => {
  const { click, lines, dots, overlay } = setup();
  fireEvent.click(screen.getByRole('button', { name: /Channel/ }));
  expect(screen.getByText('Click to set start point')).toBeTruthy();
  click(100, 110); // bar 5, $50
  click(300, 60);  // bar 25, $75  → slope $1.25/bar
  click(200, 150); // bar 15, $30  → $32.50 below the base line

  expect(overlay().querySelectorAll('polygon')).toHaveLength(1);
  // base: $43.75 at bar 0, $93.75 at bar 40; parallel $32.50 lower
  expect(lines()).toEqual([
    [50, 122.5, 450, 22.5],
    [50, 187.5, 450, 87.5],
  ]);
  expect(dots()).toEqual([[100, 110], [300, 60], [200, 150]]);
  expect(screen.getByRole('button', { name: /Clear/ })).toBeTruthy();
});

test('trend line extends across the plot with dots at both clicks', () => {
  const { click, lines, dots } = setup();
  fireEvent.click(screen.getByRole('button', { name: /Trend Line/ }));
  click(100, 110);
  click(300, 60);
  expect(lines()).toEqual([[50, 122.5, 450, 22.5]]);
  expect(dots()).toEqual([[100, 110], [300, 60]]);
});

test('fibonacci: 0% at the second click, 100% at the first, off-plot extensions skipped', () => {
  const { click, overlay } = setup();
  fireEvent.click(screen.getByRole('button', { name: /Fibonacci/ }));
  click(100, 190); // $10, start of the move (100%)
  click(300, 30);  // $90, end of the move (0%)
  const labels = Array.from(overlay().querySelectorAll('text')).map(t => t.textContent?.replace(/ /g, ' '));
  expect(labels).toEqual([
    '0.0%  $90.00', '23.6%  $71.12', '38.2%  $59.44', '50.0%  $50.00',
    '61.8%  $40.56', '78.6%  $27.12', '100.0%  $10.00',
  ]);
});

test('clicks just outside the plot land on its edge', () => {
  const { click, dots } = setup();
  fireEvent.click(screen.getByRole('button', { name: /Trend Line/ }));
  click(5, 300);   // left of and below the plot → bar 0, bottom edge
  click(600, -20); // right of and above → bar 40, top edge
  expect(dots()).toEqual([[50, 210], [450, 10]]);
});

test('the overlay only takes the mouse while a tool is armed', () => {
  const { overlay } = setup();
  expect(overlay().style.pointerEvents).toBe('none');
  fireEvent.click(screen.getByRole('button', { name: /Channel/ }));
  expect(overlay().style.pointerEvents).toBe('auto');
  fireEvent.click(screen.getByRole('button', { name: /Channel/ }));
  expect(overlay().style.pointerEvents).toBe('none');
});

test('a new reset key clears drawings and disarms the tool', () => {
  const { click, lines, rerender, overlay } = setup('A');
  fireEvent.click(screen.getByRole('button', { name: /Trend Line/ }));
  click(100, 110);
  click(300, 60);
  expect(lines()).toHaveLength(1);
  rerender(<ThemeProvider><Harness resetKey="B" /></ThemeProvider>);
  expect(lines()).toHaveLength(0);
  expect(overlay().style.pointerEvents).toBe('none');
});

// The popup's frame is null until this reports, and a null frame ignores every
// click. Recharts 3 stopped passing `offset` to <Customized> children, which
// silently broke the popup's tools; this renders a real chart to catch that.
test('RechartsPlotArea reports the plot rect inside the axes and legend', () => {
  const onChange = jest.fn<void, [PlotRect]>();
  const data = [{ t: 'a', p: 1 }, { t: 'b', p: 3 }, { t: 'c', p: 2 }];
  render(
    <AreaChart width={400} height={200} data={data}>
      <XAxis dataKey="t" />
      <YAxis orientation="right" width={55} />
      <Legend />
      <Area dataKey="p" isAnimationActive={false} />
      <RechartsPlotArea onChange={onChange} />
    </AreaChart>,
  );
  expect(onChange).toHaveBeenCalled();
  const rect = onChange.mock.calls[onChange.mock.calls.length - 1][0];
  expect(rect.left).toBeGreaterThanOrEqual(0);
  expect(rect.top).toBeGreaterThanOrEqual(0);
  expect(rect.left + rect.width).toBeLessThanOrEqual(400 - 55); // right axis is outside the plot
  expect(rect.top + rect.height).toBeLessThan(200);             // so are the x axis and legend
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
});
