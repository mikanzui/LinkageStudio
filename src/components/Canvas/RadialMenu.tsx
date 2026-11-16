import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { arcTarget, canAssignBody, chooseRadialBody, currentRadialLayout, radialAction, radialBodies, radialSelected, targetExists } from '../../interaction/radial-menu';
import { cancelInteractions } from '../../interaction/session';
import './RadialMenu.css';

export function RadialMenu({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const arc = useEditorStore(s => s.arcSelector), camera = useEditorStore(s => s.camera);
  const graph = useMechanismStore();
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const context = arc?.openMode === 'context', stamp = arc?.showTime;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect(); setSize({ width: r.width, height: r.height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);
  useEffect(() => {
    if (stamp === undefined) return;
    const canvas = canvasRef.current;
    const previous = document.activeElement === document.body ? canvas : document.activeElement as HTMLElement | null, element = host.current;
    const frame = context ? requestAnimationFrame(() => element?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })) : 0;
    const outside = (event: PointerEvent) => {
      if (context && !element?.contains(event.target as Node)) {
        event.preventDefault(); event.stopPropagation(); cancelInteractions();
      }
    };
    const wheel = (event: WheelEvent) => { if (!element?.contains(event.target as Node)) cancelInteractions(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelInteractions(); }
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('keydown', escape, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', outside, true); window.removeEventListener('wheel', wheel); window.removeEventListener('keydown', escape, true);
      const restore = previous?.isConnected ? previous : canvas;
      if (context && (element?.contains(document.activeElement) || document.activeElement === document.body)) restore?.focus({ preventScroll: true });
    };
  }, [context, stamp, canvasRef]);
  if (!arc || !size.width) return null;
  const target = arcTarget(arc);
  if (!targetExists(target)) return null;
  // Store subscriptions intentionally bind layout/highlights to the actual graph/camera.
  void graph; void camera;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const layout = currentRadialLayout(size.width, size.height, coarse), bodies = radialBodies(target);
  const act = (key: string) => {
    if (!context) return;
    if (key === '__close__') { cancelInteractions(); return; }
    if (key.startsWith('__')) { useEditorStore.getState().setArcSelector(null); radialAction(target, key); }
    else chooseRadialBody(target, key.slice(5));
  };
  const bodyButton = (id: string) => {
    const body = bodies.find(b => b.id === id)!;
    const selected = radialSelected(target, id);
    return <><span className="radial-body-dot" style={{ backgroundColor: body.color }}/><span className="radial-body-label">{body.name}</span>{selected && <span className="radial-body-check" aria-hidden="true"/>}</>;
  };
  const icon = (key: string) => key === '__add_body__' ? <Plus size={17}/> : key === '__delete__' ? <Trash2 size={17}/> : <X size={15}/>;
  const title = (key: string) => key === '__add_body__' ? 'Add body and assign' : key === '__delete__' ? 'Delete ' + (target.kind === 'outline' ? 'shape' : target.kind) : key === '__close__' ? 'Close object actions' : (target.kind === 'joint' || target.kind === 'collider' ? 'Toggle ' : 'Assign to ') + bodies.find(b => b.id === key.slice(5))!.name;
  const button = (key: string, style?: CSSProperties) => <button key={key} type="button"
    className={'radial-control ' + (key === '__delete__' ? 'radial-danger' : key.startsWith('__') ? 'radial-command' : 'radial-body')}
    style={style} aria-label={title(key)} title={title(key)} aria-pressed={key.startsWith('__') ? undefined : radialSelected(target, key.slice(5))}
    onClick={() => act(key)}>{key.startsWith('__') ? icon(key) : bodyButton(key.slice(5))}</button>;
  return <div ref={host} className={'radial-menu radial-' + layout.variant} role="group" aria-label="Object actions"
    data-open-mode={context ? 'context' : 'hold'} style={{ left: layout.center.x, top: layout.center.y,
      ...(layout.variant === 'list' ? { width: layout.width, maxHeight: layout.height } : {}) }}
    onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      event.preventDefault(); event.stopPropagation(); buttons[next]?.focus();
    }}>
    {layout.variant === 'orbit' ? layout.controls.map(control => button(control.key, { left: control.x, top: control.y, width: control.width, height: control.height, transform: 'translate(-50%, -50%) rotate(' + control.angle + 'deg)' }))
      : <><div className="radial-list-actions">{canAssignBody(target) && button('__add_body__')}{button('__delete__')}{button('__close__')}</div><div className="radial-list-bodies">{bodies.map(b => button('body:' + b.id))}</div></>}
  </div>;
}
