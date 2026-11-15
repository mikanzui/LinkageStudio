import { Hand, MousePointer2, ZoomIn, ZoomOut, Maximize, RotateCcw, ChevronDown, BoxSelect, LassoSelect } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { fitMechanism } from '../../renderer/viewport';

export function ViewportTools() {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const mode = useEditorStore(s => s.mode);
  const selectMode = useEditorStore(s => s.selectMode);
  const excluded = useEditorStore(s => s.excludedBodies);
  const bodies = useMechanismStore(s => s.bodies);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!host.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  const tool = useEditorStore(s => s.activeTool);
  const zoom = useEditorStore(s => s.camera.zoom);
  const changeZoom = (factor: number) => {
    const r = document.querySelector('canvas')?.getBoundingClientRect(); if (!r) return;
    useEditorStore.getState().zoomCamera(factor, { x: r.width / 2, y: r.height / 2 });
  };
  return <div ref={host} className="viewport-tools" role="toolbar" aria-label="Viewport">
    <button aria-label="Select" title={tool === 'select' ? `Select: ${selectMode}` : 'Select'} aria-pressed={tool === 'select'} onClick={() => useEditorStore.getState().setSelectMode('single')}>{selectMode === 'box' && tool === 'select' ? <BoxSelect size={17}/> : selectMode === 'lasso' && tool === 'select' ? <LassoSelect size={17}/> : <MousePointer2 size={17}/>}</button>
    {mode === 'create' && <button aria-label="Selection options" title="Selection options" aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDown size={15}/></button>}
    {open && mode === 'create' && <div className="selection-options" role="group" aria-label="Selection options">
      <fieldset><legend>Selection</legend>{(['single','box','lasso'] as const).map(value => <label key={value}><input type="radio" name="selection-mode" checked={tool === 'select' && selectMode === value} onChange={() => { useEditorStore.getState().setSelectMode(value); setOpen(false); }}/>{value === 'single' ? 'Single' : value === 'box' ? 'Box' : 'Lasso'}</label>)}</fieldset>
      <fieldset><legend>Included bodies</legend>{Object.values(bodies).map(body => <label key={body.id}><input type="checkbox" checked={!excluded.has(body.id)} onChange={() => useEditorStore.getState().toggleExcludedBody(body.id)}/>{body.name}</label>)}</fieldset>
    </div>}
    <button aria-label="Pan" title="Pan" aria-pressed={tool === 'pan'} onClick={() => useEditorStore.getState().setTool('pan')}><Hand size={17}/></button>
    <span className="viewport-divider"/>
    <button aria-label="Zoom out" title="Zoom out" onClick={() => changeZoom(1 / 1.2)}><ZoomOut size={17}/></button>
    <output aria-label="Zoom" className="viewport-zoom">{Math.round(zoom * 100)}%</output>
    <button aria-label="Zoom in" title="Zoom in" onClick={() => changeZoom(1.2)}><ZoomIn size={17}/></button>
    <span className="viewport-divider"/>
    <button aria-label="Fit mechanism" title="Fit mechanism" onClick={() => {
      const r = document.querySelector('canvas')?.getBoundingClientRect(); if (r) useEditorStore.setState({ camera: fitMechanism(useMechanismStore.getState(), r.width, r.height) });
    }}><Maximize size={17}/></button>
    <button aria-label="Reset view" title="Reset view" onClick={() => useEditorStore.setState({ camera: { zoom: 1, pan: { x: 0, y: 0 } } })}><RotateCcw size={17}/></button>
  </div>;
}
