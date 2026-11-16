const cancellations = new Set<() => void>();
const active = new Set<symbol>();

export function setInteractionActive(owner: symbol, value: boolean): void {
  if (value) active.add(owner); else active.delete(owner);
}
export function hasActiveInteractions(): boolean { return active.size > 0; }

export function registerInteractionCancellation(cancel: () => void): () => void {
  cancellations.add(cancel);
  return () => { cancellations.delete(cancel); };
}

/** Document boundaries must cancel captures before replacing the graph/history. */
export function cancelInteractions(): void {
  for (const cancel of [...cancellations]) cancel();
}
