import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = join(root, '.rebuild.local/evidence/g0');
const checks = [];
for (const fixture of ['airer', 'airer-foot', 'working-screen']) {
  for (const id of ['upstream', 'local', 'local-causal', 'negative-control']) {
    const record = JSON.parse(await readFile(join(dir, `${fixture}-drag/${id}.json`), 'utf8'));
    const { summary, before, held, samples } = record;
    let finite = true;
    let maxLinkError = 0;
    let maxFixedDrift = 0;
    const fixed = new Set(before.bodies[before.baseBodyId].jointIds);
    for (const frame of [before, ...samples, held]) {
      for (const joint of Object.values(frame.joints)) {
        finite &&= Number.isFinite(joint.position.x) && Number.isFinite(joint.position.y);
        if (fixed.has(joint.id)) maxFixedDrift = Math.max(maxFixedDrift, Math.hypot(
          joint.position.x - before.joints[joint.id].position.x,
          joint.position.y - before.joints[joint.id].position.y));
      }
      for (const link of Object.values(frame.links)) {
        const a = frame.joints[link.jointIds[0]], b = frame.joints[link.jointIds[1]];
        maxLinkError = Math.max(maxLinkError, Math.abs(Math.hypot(
          a.position.x - b.position.x, a.position.y - b.position.y) - link.restLength));
      }
    }
    // Broad dead-drag smoke criterion, derived from reference and suppressed-input runs.
    // This is deliberately separate from pose/constraint/physics acceptance.
    const motionDetected = summary.grabbed?.active === true
      && summary.handleTravel > 10 && summary.timeHeld - summary.timeBefore > 0.5
      && !summary.stepError && finite && maxFixedDrift < 1e-8 && summary.restoreError < 1e-8;
    const expectedMotion = id !== 'negative-control' && !(id === 'local' && fixture.startsWith('airer'));
    checks.push({ fixture, id, motionDetected, expectedMotion, expectationMatches: motionDetected === expectedMotion,
      handleTravel: summary.handleTravel, finite, maxFixedDrift, restoreError: summary.restoreError,
      maxLinkError, stepError: summary.stepError,
      physicsAccepted: false,
    });
  }
}
const result = {
  createdAt: new Date().toISOString(),
  purpose: 'Reproduce dead drag and detect suppressed input; not full G0/physics acceptance.',
  checks,
  harnessPassed: checks.every((check) => check.expectationMatches),
  releaseAccepted: false,
};
await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'motion-checks.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.harnessPassed) process.exitCode = 1;
