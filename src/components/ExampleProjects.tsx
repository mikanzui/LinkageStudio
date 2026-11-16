import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Save, Search } from 'lucide-react';
import { EXAMPLE_PROJECTS, exampleAssetPath } from '../examples/catalog';
import { createExampleProjects } from '../document/example-projects';
import type { ExampleState } from '../document/example-projects';
import { importProject, isProjectDirty, projectDesignSignature, projectText, setProjectMessage, useProjectStatus } from '../document/project';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { fitMechanism } from '../renderer/viewport';
import { cancelInteractions } from '../interaction/session';

export function ExampleProjects({ saveLocal, beforeOpen, opened }: { saveLocal(): Promise<boolean>; beforeOpen(): void; opened(): void }) {
  const [state, setState] = useState<ExampleState>({ loading: false, pending: null, error: '' });
  const [selection, setSelection] = useState(EXAMPLE_PROJECTS[0].id), [query, setQuery] = useState(''), [saving, setSaving] = useState(false);
  const mode = useEditorStore(s => s.mode), runtime = useRef<ReturnType<typeof createExampleProjects> | null>(null);
  const callbacks = useRef({ beforeOpen, opened });
  useEffect(() => { callbacks.current = { beforeOpen, opened }; }, [beforeOpen, opened]);
  useEffect(() => {
    const owned = createExampleProjects(async (example, signal) => {
      const response = await fetch(exampleAssetPath(example, import.meta.env.BASE_URL), { signal, credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw new Error('Unavailable example');
      return response.text();
    }, {
      capture() {
        const text = projectText();
        return { session: useProjectStatus.getState().sessionId, signature: projectDesignSignature(text), dirty: isProjectDirty(text), editable: useEditorStore.getState().mode === 'create' };
      },
      open(text) { cancelInteractions(); callbacks.current.beforeOpen(); return importProject(text); },
      opened(example, issues) {
        const rect = document.querySelector('canvas[aria-label="Mechanism canvas"]')?.getBoundingClientRect();
        if (rect) useEditorStore.setState({ camera: fitMechanism(useMechanismStore.getState(), rect.width, rect.height) });
        setProjectMessage(issues.length ? `Opened ${example.name}. ${issues.length} saved barrier references are unresolved; data retained.` : `Opened ${example.name}.`);
        callbacks.current.opened();
      },
    }, setState);
    runtime.current = owned;
    return () => { owned.dispose(); if (runtime.current === owned) runtime.current = null; };
  }, []);
  const filtered = EXAMPLE_PROJECTS.filter(e => [e.name, e.description, ...e.tags].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const selected = filtered.find(e => e.id === selection), busy = state.loading || saving;
  return <section className="example-projects" aria-label="Example projects" aria-busy={busy}>
    {state.error && <div className="dialog-error" role="alert">{state.error}</div>}
    {state.pending ? <section aria-label="Unsaved example navigation"><h3>Unsaved Changes</h3><div className="cloud-actions">
      <button type="button" className="dialog-command" disabled={busy} onClick={async () => {
        const owned = runtime.current; setSaving(true);
        try { if (await saveLocal()) owned?.saved(); } finally { if (runtime.current === owned) setSaving(false); }
      }}><Save size={16}/>Save local first</button>
      <button type="button" className="dialog-command" disabled={busy} onClick={() => runtime.current?.discardAndOpen()}>Discard and open</button>
      <button type="button" className="dialog-command" disabled={busy} onClick={() => runtime.current?.cancel()}>Cancel</button>
    </div></section> : <>
      <label className="example-search"><Search size={16}/><input type="search" aria-label="Search examples" value={query} onChange={e => setQuery(e.target.value)} disabled={busy}/></label>
      <div className="recovery-list example-list" role="radiogroup" aria-label="Examples">
        {filtered.map(example => <label key={example.id}><input type="radio" name="example-project" value={example.id} checked={selection === example.id} disabled={busy} onChange={() => setSelection(example.id)}/>
          <span><strong>{example.name}</strong><small>{example.description}</small><small className="example-meta">{example.source} | {example.tags.join(' / ')}</small></span>
        </label>)}
        {!filtered.length && <div className="cloud-status" role="status">No matching examples</div>}
      </div>
      <div className="cloud-actions example-actions">
        <button type="button" className="dialog-command" disabled={!selected || busy || mode !== 'create'} onClick={() => { if (selected) void runtime.current?.open(selected); }}><FolderOpen size={17}/>{state.loading ? 'Opening...' : 'Open example'}</button>
        {selected && <a className="dialog-icon" aria-label="Download example" title="Download example" href={exampleAssetPath(selected, import.meta.env.BASE_URL)} download={selected.filename}><Download size={17}/></a>}
      </div>
    </>}
  </section>;
}
