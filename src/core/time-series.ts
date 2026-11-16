export const TRACE_POINT_LIMIT = 6000;
export const SENSOR_SAMPLE_LIMIT = 600;

export function appendBounded<T>(values: readonly T[], value: T, limit: number): T[] {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid series limit.');
  return limit === 1 ? [value] : [...values.slice(-Math.min(values.length, limit - 1)), value];
}
