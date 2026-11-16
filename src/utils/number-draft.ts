/** Display precision never changes the stored value on a focus-only round trip. */
export function numberDraft(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(12))) : '';
}
