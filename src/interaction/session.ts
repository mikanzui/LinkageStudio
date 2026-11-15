const cancellations = new Set<() => void>();

export function registerInteractionCancellation(cancel: () => void): () => void {
  cancellations.add(cancel);
  return () => { cancellations.delete(cancel); };
}

/** Document boundaries must cancel captures before replacing the graph/history. */
export function cancelInteractions(): void {
  for (const cancel of [...cancellations]) cancel();
}
