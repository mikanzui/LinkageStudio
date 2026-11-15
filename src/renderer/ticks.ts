/** Index-based iteration cannot stall when adding a small step to a huge value. */
export function visibleTicks(start: number, end: number, step: number, limit: number): number[] {
  if (![start, end, step, limit].every(Number.isFinite) || step <= 0 || limit <= 0 || end < start) return [];
  const count = Math.min(Math.floor(limit), Math.max(0, Math.floor((end - start) / step) + 1));
  return Array.from({ length: count }, (_, i) => start + i * step).filter(Number.isFinite);
}
