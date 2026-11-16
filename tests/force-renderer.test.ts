import test from 'node:test';
import assert from 'node:assert/strict';
import { drawForceVectors } from '../src/renderer/draw-overlays';
import type { ForceVector } from '../src/types';

function canvas() {
  const lines: number[][] = [], labels: { text: string; x: number; y: number }[] = [];
  const context = { beginPath() {}, moveTo() {}, lineTo(x: number, y: number) { lines.push([x, y]); },
    stroke() {}, arc() {}, fill() {}, setLineDash() {}, measureText: (s: string) => ({ width: s.length * 6 }),
    fillText(text: string, x: number, y: number) { labels.push({ text, x, y }); } } as unknown as CanvasRenderingContext2D;
  return { context, lines, labels };
}
const vector: ForceVector = { origin: { x: 0, y: 0 }, force: { x: 0, y: 1e6 }, color: '#42A5F5', magnitude: 250 };
test('force arrows are bounded in screen pixels without changing model readout', () => {
  for (const zoom of [.1, 1, 2, 10]) {
    const c = canvas(); drawForceVectors(c.context, [vector], zoom, true);
    assert.equal(c.lines[0][1] * zoom, 100); assert.equal(c.labels[0].text, '250 model');
    assert(c.labels[0].x + '250 model'.length * 6 / 2 < -10 / zoom);
  }
});
test('force labels suppress collocated duplicates and omit unavailable/invalid values', () => {
  const c = canvas(); drawForceVectors(c.context, [vector, vector, { ...vector, origin: { x: NaN, y: 0 } }], 1, true);
  assert.equal(c.labels.length, 1);
  const noMagnitude = canvas(); drawForceVectors(noMagnitude.context, [{ ...vector, magnitude: undefined }], 1, true);
  assert.equal(noMagnitude.labels.length, 0);
});
