import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [referencePath, candidatePath] = process.argv.slice(2);
assert(referencePath && candidatePath, 'Pass the two actual-browser report.json paths.');
const reference = JSON.parse(await readFile(referencePath, 'utf8'));
const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
assert.notEqual(candidate.passed, false, 'Native stationary hold/release must preserve the mechanism');
const motionOnly = process.argv.includes('--motion-only');
const adaptive = process.argv.includes('--adaptive');
const bodyCount = reference.geometry.spokes;
const positionTolerance = candidate.engine === 'webkit' ? .25 : .06;
if (!motionOnly) {
assert.equal(reference.geometry.rings, 1); assert.equal(candidate.geometry.rings, 1);
assert(bodyCount > 0); assert.equal(candidate.geometry.spokes, bodyCount);
assert.equal(candidate.geometry.controls.length, reference.geometry.controls.length, 'No invented center action');
}
for (let index = 0; index < bodyCount; index++) {
  const a = reference.geometry.controls[index], b = candidate.geometry.controls[index];
  assert.equal(b.name, a.name);
  if (!motionOnly) {
  if (!adaptive) for (const field of ['dx', 'dy']) assert(Math.abs(b[field] - a[field]) < positionTolerance, 'Historical orbit ' + field);
  // Canvas text metrics and native button kerning can differ by a subpixel.
  assert(Math.abs(parseFloat(b.width) - parseFloat(a.width)) <= .25, 'Historical pill width (0.25 CSS px tolerance)');
  for (const field of ['height', 'padding', 'background', 'border', 'direction']) assert.equal(b[field], a[field], 'Historical pill ' + field);
  assert.equal(b.font.replace(', sans-serif', ''), a.font);
  const rotation = report => Number(report.frames[0].controls[index].animations[0].frames[1].transform.match(/rotate\(([-.\d]+)deg\)/)[1]);
  const difference = ((rotation(candidate) - rotation(reference) + 540) % 360) - 180;
  assert(Math.abs(difference) < .001, 'Historical readable label rotation');
  }
  for (const report of [reference, candidate]) {
    const opening = report.frames.filter(f => !f.closing && f.controls[index]);
    const animation = opening[0].controls[index].animations[0];
    assert.equal(animation.timing.duration, 220); assert.equal(animation.timing.delay, index * 38);
    assert.equal(animation.frames[0].easing, 'cubic-bezier(0.4, 0, 0.2, 1)');
    assert(animation.frames[0].transform.includes('scale(0.7)'));
    assert(animation.frames[1].transform.includes('scale(1)'));
    assert(new Set(opening.map(f => f.controls[index].transform)).size >= 4, 'Real rendered translation/scale, not opacity-only fade');
  }
}
const closing = candidate.frames.filter(f => f.closing && f.controls[0]);
assert(closing.length >= 4, 'Retraction frames must actually be captured');
assert(new Set(closing.map(f => f.controls[0].transform)).size >= 4, 'Actual reverse retraction');
assert(candidate.frames.some(f => !f.controls.length), 'Presentation is removed after closing');
console.log(JSON.stringify({ passed: true, referencePath, candidatePath,
  contract: 'Native desktop hold, historical geometry/paint, actual 220ms translated/scaled fan and 38ms stagger; noninteractive reverse retraction' }));
