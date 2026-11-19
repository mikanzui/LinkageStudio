import { Hand, MousePointer2, ZoomIn, ZoomOut, Maximize, House, ChevronDown, BoxSelect, LassoSelect, Ellipsis } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { fitMechanism } from '../../renderer/viewport';
import { openRadialMenu, radialAnchor, targetForId } from '../../interaction/radial-menu';
import './ViewportTools.css';

export function ViewportTools() {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const mode = useEditorStore(s => s.mode);
  const selectMode = useEditorStore(s => s.selectMode);
  const excluded = useEditorStore(s => s.excludedBodies);
  const bodies = useMechanismStore(s => s.bodies);
  const leftCollapsed = useEditorStore(s => s.leftCollapsed), rightCollapsed = useEditorStore(s => s.rightCollapsed);
  const leftWidth = useEditorStore(s => s.leftWidth), rightWidth = useEditorStore(s => s.rightWidth);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const area = element.parentElement!.getBoundingClientRect();
      let left = area.left, right = area.right;
      for (const selector of ['.toolbar-wrapper', '.right-panel']) {
        const panel = document.querySelector(selector);
        if (!panel || getComputedStyle(panel).position !== 'absolute') continue;
        const bounds = panel.getBoundingClientRect();
        if (selector === '.toolbar-wrapper') left = Math.max(left, bounds.right);
        else right = Math.min(right, bounds.left);
      }
      // Narrow-screen panels overlay the canvas rather than resizing it.
      if (right - left >= 64) {
        element.style.left = `${(left + right) / 2 - area.left}px`;
        element.style.maxWidth = `${right - left - 16}px`;
      } else { element.style.left = '50%'; element.style.maxWidth = 'calc(100% - 16px)'; }
      const height = Math.ceil(element.getBoundingClientRect().height);
      element.style.setProperty('--viewport-menu-max-height', `${Math.max(44, area.height - height - 24)}px`);
      if (height !== useEditorStore.getState().viewportToolbarHeight) useEditorStore.setState({ viewportToolbarHeight: height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(element.parentElement!); measure();
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [leftCollapsed, rightCollapsed, leftWidth, rightWidth]);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!host.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  const tool = useEditorStore(s => s.activeTool);
  const selected = useEditorStore(s => s.selectedIds);
  const zoom = useEditorStore(s => s.camera.zoom);
  const changeZoom = (factor: number) => {
    const r = document.querySelector('canvas')?.getBoundingClientRect(); if (!r) return;
    useEditorStore.getState().zoomCamera(factor, { x: r.width / 2, y: r.height / 2 });
  };
  return <div ref={host} className="viewport-tools" role="toolbar" aria-label="Viewport">
    <div className="viewport-tool-group" role="group" aria-label="Selection tools">
      <button aria-label="Pan" title="Pan" aria-pressed={tool === 'pan'} onClick={() => useEditorStore.getState().setTool('pan')}><Hand size={17}/></button>
      <button aria-label="Select" title="Select" aria-pressed={tool === 'select' && selectMode === 'single'} onClick={() => { useEditorStore.getState().setSelectMode('single'); setOpen(false); }}><MousePointer2 size={17}/></button>
      <button aria-label="Box select" title="Box select" disabled={mode !== 'create'} aria-pressed={tool === 'select' && selectMode === 'box'} onClick={() => { useEditorStore.getState().setSelectMode('box'); setOpen(false); }}><BoxSelect size={17}/></button>
      <button aria-label="Lasso select" title="Lasso select" disabled={mode !== 'create'} aria-pressed={tool === 'select' && selectMode === 'lasso'} onClick={() => { useEditorStore.getState().setSelectMode('lasso'); setOpen(false); }}><LassoSelect size={17}/></button>
      {mode === 'create' && <button aria-label="Selection options" title="Selection options" aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDown size={15}/></button>}
    </div>
    {open && mode === 'create' && <div className="selection-options" role="group" aria-label="Selection options">
      <button type="button" aria-label="Object actions" title="Object actions" disabled={selected.size !== 1} onClick={() => {
        const target = targetForId([...selected][0]);
        if (target) { setOpen(false); openRadialMenu(target, radialAnchor(target)); }
      }}><Ellipsis size={17}/></button>
      <fieldset><legend>Selection</legend>{(['single','box','lasso'] as const).map(value => <label key={value}><input type="radio" name="selection-mode" checked={tool === 'select' && selectMode === value} onChange={() => { useEditorStore.getState().setSelectMode(value); setOpen(false); }}/>{value === 'single' ? 'Single' : value === 'box' ? 'Box' : 'Lasso'}</label>)}</fieldset>
      <fieldset><legend>Included bodies</legend>{Object.values(bodies).map(body => <label key={body.id}><input type="checkbox" checked={!excluded.has(body.id)} onChange={() => useEditorStore.getState().toggleExcludedBody(body.id)}/>{body.name}</label>)}</fieldset>
    </div>}
    <div className="viewport-tool-group viewport-navigation" role="group" aria-label="View controls">
    <button aria-label="Zoom out" title="Zoom out" onClick={() => changeZoom(1 / 1.2)}><ZoomOut size={17}/></button>
    <output aria-label="Zoom" className="viewport-zoom">{Math.round(zoom * 100)}%</output>
    <button aria-label="Zoom in" title="Zoom in" onClick={() => changeZoom(1.2)}><ZoomIn size={17}/></button>
    <button aria-label="Fit mechanism" title="Fit mechanism" onClick={() => {
      const r = document.querySelector('canvas')?.getBoundingClientRect(); if (r) useEditorStore.setState({ camera: fitMechanism(useMechanismStore.getState(), r.width, r.height) });
    }}><Maximize size={17}/></button>
    <button aria-label="Reset view" title="Reset view" onClick={() => useEditorStore.setState({ camera: { zoom: 1, pan: { x: 0, y: 0 } } })}><House size={17}/></button>
    </div>
  </div>;
}
