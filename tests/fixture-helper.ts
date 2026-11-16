import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const legacyFixtureHashes = {
  'airer.slinker': '8e73fd936565d2c4df4d549bcc584c438c894f717da6e54ad328a8b3ffd5e0eb',
  'working-screen.json': '4f1e389186a478e7e4cd7876914b072d20a964b1130718c1f62766c57dba4c07',
} as const;
export type LegacyFixtureName = keyof typeof legacyFixtureHashes;

function fixtureDirectory(): string | undefined {
  const configured = process.env.LINKAGE_FIXTURE_DIR;
  if (configured !== undefined) {
    if (!isAbsolute(configured)) throw new Error('LINKAGE_FIXTURE_DIR must be an absolute folder containing airer.slinker and working-screen.json.');
    return configured;
  }
  // Only this preserved local archive is a fallback; never fetch or manufacture fixtures.
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(directory, 'baselines', '2026-11-15T18-45-10-493Z-CMbWTX', 'fixtures');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function fixtureText(name: LegacyFixtureName): string | undefined {
  const directory = fixtureDirectory();
  if (!directory) return undefined;
  const path = join(directory, name);
  let bytes: Buffer;
  try { bytes = readFileSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`Cannot read legacy fixture ${name} at ${path}: ${String(error)}`, { cause: error });
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== legacyFixtureHashes[name]) {
    throw new Error(`Legacy fixture SHA-256 mismatch for ${name} at ${path}: expected ${legacyFixtureHashes[name]}, got ${actual}. Restore the unmodified private fixture.`);
  }
  return bytes.toString('utf8');
}

export function legacyFixtureOptions(...names: LegacyFixtureName[]): { skip?: string } {
  let missing: LegacyFixtureName[];
  try { missing = names.filter(name => fixtureText(name) === undefined); }
  catch { return {}; } // Fail inside the callback's read, so independent tests still register/run.
  if (!missing.length) return {};
  const reason = `Private legacy fixture unavailable: ${missing.join(', ')}. Set LINKAGE_FIXTURE_DIR to an absolute folder containing the original hash-matching files.`;
  if (process.env.REQUIRE_LEGACY_FIXTURES === '1') return {};
  return { skip: reason };
}

export function readLegacyFixture(name: LegacyFixtureName): string {
  const text = fixtureText(name);
  if (text === undefined) throw new Error(`${process.env.REQUIRE_LEGACY_FIXTURES === '1' ? 'REQUIRE_LEGACY_FIXTURES=1: ' : ''}Private legacy fixture unavailable: ${name}. Set LINKAGE_FIXTURE_DIR to an absolute folder containing the original hash-matching files.`);
  return text;
}

// Public, authored seed for codec/import checks that do not require a real mechanism.
export function syntheticDocument() {
  return {
    version: '0.11.14', projectName: 'Synthetic portability fixture',
    joints: {
      a: { id: 'a', type: 'fixed', position: { x: 0, y: 0 }, connectedLinkIds: ['ab'] },
      b: { id: 'b', type: 'revolute', position: { x: 0, y: 0 }, connectedLinkIds: ['ab'] },
    },
    links: { ab: { id: 'ab', jointIds: ['a', 'b'], restLength: 0, mass: 1 } },
    bodies: {
      base: { id: 'base', name: 'Base', color: '#ff0000', jointIds: ['a'] },
      rod: { id: 'rod', name: 'Rod', color: '#00ff00', jointIds: ['a', 'b'] },
    },
    baseBodyId: 'base',
    outlines: { shape: { id: 'shape', bodyId: 'rod', name: 'Synthetic outline', visible: true,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] } },
    images: {}, sliders: {}, tracers: {},
    colliders: { stale: { id: 'stale', jointIdA: 'missing', jointIdC: 'b', bodyIds: ['rod'] } },
    viewPreferences: { camera: { pan: { x: 0, y: 0 }, zoom: 1 } },
  };
}
