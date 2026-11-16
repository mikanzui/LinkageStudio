import { pathToFileURL } from 'node:url';

const stores = {
  mechanism: ['useMechanismStore', 'joints, links, bodies, baseBodyId, outlines, images, sliders, colliders, tracers, angleConstraints, springs, forceSensors, legacySavedLinks'],
  editor: ['useEditorStore', 'mode, activeTool, createTool, camera, simDrag, savedPositions, leftCollapsed, rightCollapsed, projectName, selectedIds, selectMode, selectionGesture, excludedBodies, springPlacement, springReattachId, showLoads, showReactions, showVectors, showForceUnits, lockOutlines, editingOutlineId, editingVertexIndex'],
  simulation: ['useSimulationStore', 'time, dof, gravityEnabled, gravityStrength, damping, dragMultiplier, dragDamping, speed, isPlaying, stepError, driverJointId, driverLinkId, solverResult, forceSensorData, tracerPaths, pathTraces, trackedJointIds'],
  recovery: ['useRecoveryStore', 'status, error, drafts, open'],
};

export function observationConfig(paths) {
  return `// Generated read-only observer. Never use this config for a production release.
import original from ${JSON.stringify(pathToFileURL(paths.candidate + '/vite.config.ts').href)};
import { candidateFingerprint } from ${JSON.stringify(pathToFileURL(paths.fingerprint).href)};
const stores = ${JSON.stringify(stores)};
const candidate = ${JSON.stringify(paths.candidate)};
const configPath = ${JSON.stringify(paths.config)};
const harnessRoot = ${JSON.stringify(paths.root)};
const mockPath = ${JSON.stringify(paths.mock)};
const useMock = process.env.LINKAGE_CLOUD_MOCK === '1';
const originalAliases = original.resolve?.alias ?? [];
const aliases = Array.isArray(originalAliases) ? originalAliases : Object.entries(originalAliases).map(([find, replacement]) => ({ find, replacement }));
export default {
  ...original,
  resolve: useMock ? { ...original.resolve, alias: [{ find: /^@azure\\/msal-browser$/, replacement: mockPath }, ...aliases] } : original.resolve,
  root: candidate,
  cacheDir: candidate + '/node_modules/.vite-portable-observer',
  server: { ...original.server, host: '127.0.0.1', port: 5183, strictPort: true },
  plugins: [...(original.plugins ?? []), {
    name: 'linkage-read-only-observation',
    transform(code, id) {
      const clean = id.split('?')[0].replaceAll('\\\\', '/');
      const source = candidate.replaceAll('\\\\', '/').replace(/\\/$/, '') + '/src/';
      if (!clean.startsWith(source)) return;
      if (clean === source + 'document/project.ts') return code + '\\n;globalThis.__LINKAGE_G0_READ__ ??= {}; globalThis.__LINKAGE_G0_READ__.project = () => ({ sessionId: useProjectStatus.getState().sessionId, forceDirty: useProjectStatus.getState().forceDirty, dirty: isProjectDirty() });';
      for (const [name, [binding, fields]] of Object.entries(stores)) {
        if (clean === source + 'store/' + name + '-store.ts') {
          return code + '\\n;globalThis.__LINKAGE_G0_READ__ ??= {}; globalThis.__LINKAGE_G0_READ__.' + name
            + ' = () => { const {' + fields + '} = ' + binding + '.getState(); return JSON.parse(JSON.stringify({' + fields + '}, (_key, value) => value instanceof Set ? [...value] : value instanceof Map ? Object.fromEntries(value) : value)); };';
        }
      }
    },
    async transformIndexHtml(html) {
      const identity = { id: 'candidate', ...await candidateFingerprint({ harnessRoot, candidateDir: candidate, configPath }) };
      return { html, tags: [{ tag: 'meta', attrs: { name: 'linkage-g0-build', content: JSON.stringify(identity) }, injectTo: 'head' }] };
    }
  }]
};
`;
}
