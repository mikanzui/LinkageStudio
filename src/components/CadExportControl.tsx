import { useRef, useState } from 'react';
import { Download, FileDown, X } from 'lucide-react';
import { useEditorStore } from '../store/editor-store';
import { projectText } from '../document/project';
import { deserializeMechanism, downloadFile } from '../utils/file-io';
import { buildCadScene } from '../core/cad-scene';
import type { CadScene } from '../core/cad-scene';
import { writeDXF } from '../utils/export-dxf';
import { writeSolidWorksMacro } from '../utils/export-solidworks';
import { FORMAT_EXTENSIONS, FORMAT_LABELS, UNIT_LABELS } from '../utils/export-manager';
import type { ExportFormat, ExportUnit } from '../utils/export-manager';
import { cancelInteractions } from '../interaction/session';
import { containDialogTab } from '../interaction/dialog-focus';
import './ProjectDialog.css';

export function CadExportControl() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const create = useEditorStore(s => s.mode === 'create');
  const [format, setFormat] = useState<ExportFormat>('dxf'), [unit, setUnit] = useState<ExportUnit>('mm');
  const [scene, setScene] = useState<CadScene | null>(null), [error, setError] = useState('');
  const name = useRef('Untitled');
  const show = () => {
    cancelInteractions();
    trigger.current?.focus();
    setError(''); setScene(null);
    try {
      // Export authored/frozen geometry rather than a partially edited renderer cache.
      const graph = deserializeMechanism(projectText());
      if (!graph) throw new Error('Could not prepare CAD geometry.');
      setScene(buildCadScene({ ...graph, images: graph.images ?? {}, sliders: graph.sliders ?? {}, colliders: graph.colliders ?? {}, tracers: graph.tracers ?? {} }, useEditorStore.getState().showLinks));
      name.current = useEditorStore.getState().projectName || 'Untitled';
    } catch (issue) { setError(issue instanceof Error ? issue.message : String(issue)); }
    dialog.current?.showModal();
  };
  const exportFile = () => {
    if (!scene) return;
    try {
      const text = format === 'dxf' ? writeDXF(scene, unit) : writeSolidWorksMacro(scene, unit);
      const safe = Array.from(name.current, c => c.charCodeAt(0) < 32 ? '_' : c).join('').replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '') || 'Untitled';
      downloadFile(text, `${safe}-${unit}${FORMAT_EXTENSIONS[format]}`);
      dialog.current?.close();
    } catch (issue) { setError(issue instanceof Error ? issue.message : String(issue)); }
  };
  return <>
    <button ref={trigger} type="button" className="top-bar-btn" aria-label="Export CAD" title="Export CAD" disabled={!create} onClick={show}><FileDown size={16}/><span className="top-bar-label">Export CAD</span></button>
    <dialog ref={dialog} className="project-dialog" aria-labelledby="cad-title" onKeyDown={containDialogTab} onClose={() => { if (!document.querySelector('dialog[open]')) trigger.current?.focus(); }}>
      <header><h2 id="cad-title">Export CAD</h2><button type="button" className="dialog-icon" aria-label="Close export" title="Close" onClick={() => dialog.current?.close()}><X size={18}/></button></header>
      <div className="dialog-body">
        <label className="dialog-field">Format<select aria-label="Format" value={format} onChange={e => setFormat(e.target.value as ExportFormat)}>{Object.entries(FORMAT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="dialog-field">Units<select aria-label="Units" value={unit} onChange={e => setUnit(e.target.value as ExportUnit)}>{Object.entries(UNIT_LABELS).map(([key, label]) => <option key={key} value={key}>{label} ({key})</option>)}</select></label>
        <p className="export-format-note">{format === 'dxf' ? 'R12 coordinates only; import units must match.' : 'New Part sketch; layer colors are not preserved. Target-app qualification pending.'}</p>
        {scene && <p className="export-summary">{scene.entities.length} CAD entities / {scene.layers.length} layers</p>}
        {!!scene?.warnings.length && <ul className="export-warnings" aria-label="Export omissions and warnings">{scene.warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul>}
        {error && <p role="alert" className="dialog-error">{error}</p>}
      </div>
      <footer><button type="button" className="dialog-command" onClick={exportFile} disabled={!scene?.entities.length}><Download size={16}/>Export</button><button type="button" className="dialog-command" onClick={() => dialog.current?.close()}>Cancel</button></footer>
    </dialog>
  </>;
}
