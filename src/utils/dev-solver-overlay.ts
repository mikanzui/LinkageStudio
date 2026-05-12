/**
 * Dev-only: show last tick wall time & sim dt in the Simulation panel.
 * Enable with `?devSolverTiming=1` (or `true`) on the URL, or the same key in the hash query (e.g. `#/editor?devSolverTiming=1`).
 * No-op unless `import.meta.env.DEV` is true.
 */
export function isDevSolverTimingOverlayEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  const ok = (v: string | null) => v === '1' || v === 'true';
  if (ok(new URLSearchParams(window.location.search).get('devSolverTiming'))) return true;
  const hash = window.location.hash;
  const q = hash.includes('?') ? hash.split('?')[1] : '';
  if (q && ok(new URLSearchParams(q).get('devSolverTiming'))) return true;
  return false;
}
