import { decodeDocument } from './codec';
import type { DocumentIssue } from './codec';
import { MAX_DOCUMENT_CHARACTERS } from './limits';
import type { ExampleProject } from '../examples/catalog';

interface Snapshot { session: string; signature: string; editable: boolean; dirty: boolean }
interface ExampleDocument {
  capture(): Snapshot;
  open(text: string): { ok: boolean; issues: DocumentIssue[] };
  opened(example: ExampleProject, issues: DocumentIssue[]): void;
}
export interface ExampleState { loading: boolean; pending: ExampleProject | null; error: string }

export function createExampleProjects(load: (example: ExampleProject, signal: AbortSignal) => Promise<string>,
  document: ExampleDocument, changed: (state: ExampleState) => void) {
  let state: ExampleState = { loading: false, pending: null, error: '' };
  let epoch = 0, disposed = false, controller: AbortController | null = null;
  let pending: { example: ExampleProject; text: string; snapshot: Snapshot } | null = null;
  const update = (patch: Partial<ExampleState>) => { if (!disposed) { state = { ...state, ...patch }; changed(state); } };
  const owns = (snapshot: Snapshot) => {
    const now = document.capture();
    return now.editable && now.session === snapshot.session && now.signature === snapshot.signature;
  };
  function commit(target: NonNullable<typeof pending>) {
    pending = null; update({ pending: null });
    if (!owns(target.snapshot)) { update({ error: 'The current project changed. Select the example again.' }); return; }
    const result = document.open(target.text);
    if (!result.ok) { update({ error: 'The example could not be opened. Current design retained.' }); return; }
    document.opened(target.example, result.issues);
  }
  return {
    state: () => state,
    async open(example: ExampleProject) {
      const snapshot = document.capture();
      if (!snapshot.editable || disposed) return;
      const version = ++epoch; controller?.abort(); controller = new AbortController(); pending = null;
      update({ loading: true, pending: null, error: '' });
      try {
        const text = await load(example, controller.signal);
        if (disposed || epoch !== version) return;
        if (text.length > MAX_DOCUMENT_CHARACTERS || !decodeDocument(text).ok) throw new Error('Invalid example');
        if (!owns(snapshot)) { update({ error: 'The current project changed. Select the example again.' }); return; }
        const target = { example, text, snapshot };
        if (snapshot.dirty) { pending = target; update({ pending: example }); }
        else commit(target);
      } catch {
        if (!disposed && epoch === version) update({ error: 'Example unavailable or invalid. Current design retained; retry when online.' });
      } finally { if (!disposed && epoch === version) { controller = null; update({ loading: false }); } }
    },
    discardAndOpen() { if (pending && !disposed) commit(pending); },
    saved() {
      if (!pending || disposed) return;
      const now = document.capture();
      if (now.session === pending.snapshot.session && now.editable) pending.snapshot = now;
    },
    cancel() { epoch++; controller?.abort(); controller = null; pending = null; update({ loading: false, pending: null, error: '' }); },
    dispose() { disposed = true; epoch++; controller?.abort(); controller = null; pending = null; },
  };
}
