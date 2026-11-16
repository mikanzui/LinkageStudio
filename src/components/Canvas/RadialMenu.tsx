import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { arcTarget, canAddRadialBody, chooseRadialBody, currentRadialLayout, dismissRadialMenu, radialAction, radialBodies, radialSelected, targetExists } from '../../interaction/radial-menu';
import type { RadialTarget } from '../../types/editor';
import type { RadialLayout } from '../../interaction/radial-layout';
import { cancelInteractions } from '../../interaction/session';
import './RadialMenu.css';

interface Presentation {
  stamp: number;
  layout: RadialLayout;
  target: RadialTarget;
  context: boolean;
  canAdd: boolean;
  bodies: { id: string; name: string; color: string; selected: boolean }[];
}

export function RadialMenu({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const arc = useEditorStore(s => s.arcSelector), camera = useEditorStore(s => s.camera);
  const graph = useMechanismStore();
  const host = useRef<HTMLDivElement>(null), latest = useRef<Presentation | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [exiting, setExiting] = useState<Presentation | null>(null);
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { clearTimeout(timer); setExiting(null); };
    const stop = useEditorStore.subscribe((next, previous) => {
      if (next.arcSelector && (!previous.arcSelector || next.arcSelector.showTime !== previous.arcSelector.showTime)) clear();
      if (!next.arcSelector && previous.arcSelector) {
        clear();
        if (previous.arcSelector.collapseTime !== null && latest.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setExiting(latest.current);
          timer = setTimeout(() => setExiting(null), 230);
        }
      }
      if (next.mode !== previous.mode) clear();
    });
    const hidden = () => { if (document.hidden) clear(); };
    window.addEventListener('pointerdown', clear, true);
    window.addEventListener('keydown', clear, true);
    window.addEventListener('blur', clear);
    window.addEventListener('resize', clear);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      stop(); clearTimeout(timer);
      window.removeEventListener('pointerdown', clear, true);
      window.removeEventListener('keydown', clear, true);
      window.removeEventListener('blur', clear);
      window.removeEventListener('resize', clear);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useEffect(() => {
    if (stamp === undefined) return;
    const canvas = canvasRef.current;
    const previous = document.activeElement === document.body ? canvas : document.activeElement as HTMLElement | null, element = host.current;
    const frame = context ? requestAnimationFrame(() => element?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })) : 0;
    const outside = (event: PointerEvent) => {
      if (context && !element?.contains(event.target as Node)) {
        event.preventDefault(); event.stopPropagation(); dismissRadialMenu(); cancelInteractions();
      }
    };
    const wheel = (event: WheelEvent) => { if (!element?.contains(event.target as Node)) { dismissRadialMenu(); cancelInteractions(); } };
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
  // Retraction freezes only presentation. Commands and gesture ownership end immediately.
  void graph; void camera;
  const target = arc ? arcTarget(arc) : null;
  const model: Presentation | null = arc && size.width && target && targetExists(target) ? {
    layout: currentRadialLayout(size.width, size.height, matchMedia('(pointer: coarse)').matches),
    stamp: arc.showTime, target, context, canAdd: canAddRadialBody(target),
    bodies: radialBodies(target).map(b => ({ id: b.id, name: b.name, color: b.color, selected: radialSelected(target, b.id) })),
  } : null;
  useLayoutEffect(() => { if (model) latest.current = model; });

  const render = (view: Presentation, closing: boolean) => {
    const { layout, target, bodies } = view;
    const act = (key: string) => {
      if (closing || !view.context) return;
      if (key === '__close__') { dismissRadialMenu(); cancelInteractions(); return; }
      if (key.startsWith('__')) { dismissRadialMenu(); radialAction(target, key); }
      else chooseRadialBody(target, key.slice(5));
    };
    const title = (key: string) => key === '__add_body__' ? 'Add body and assign' : key === '__delete__' ? 'Delete ' + (target.kind === 'outline' ? 'shape' : target.kind) : key === '__close__' ? 'Close object actions' : (target.kind === 'joint' || target.kind === 'collider' ? 'Toggle ' : 'Assign to ') + bodies.find(b => b.id === key.slice(5))!.name;
    const button = (key: string, style?: CSSProperties, inward = false) => {
      const body = key.startsWith('body:') ? bodies.find(b => b.id === key.slice(5)) : undefined;
      return <button key={key} type="button" disabled={closing} tabIndex={closing ? -1 : undefined}
        className={'radial-control ' + (body ? 'radial-body' + (inward ? ' dot-right' : '') : key === '__delete__' ? 'radial-command radial-danger' : 'radial-command')}
        data-radial-key={key} style={style} aria-label={title(key)} title={title(key)} aria-pressed={body?.selected}
        onClick={closing ? undefined : () => act(key)}>
        {body ? <><span className="radial-body-dot" style={{ backgroundColor: body.color }}/><span className="radial-body-label">{body.name}</span></>
          : key === '__add_body__' ? <Plus size={14}/> : key === '__delete__' ? <Trash2 size={18} strokeWidth={1.7}/> : <X size={15}/>}
      </button>;
    };
    return <div key={(closing ? 'exiting-' : 'active-') + view.stamp} ref={closing ? undefined : host} className={'radial-menu radial-' + layout.variant + (closing ? ' closing' : '')}
      role={closing ? undefined : 'group'} aria-label={closing ? undefined : 'Object actions'} aria-hidden={closing || undefined} inert={closing}
      data-open-mode={view.context ? 'context' : 'hold'} style={{ left: layout.center.x, top: layout.center.y,
        ...(layout.variant === 'list' ? { width: layout.width, maxHeight: layout.height } : {}) }}
      onContextMenu={event => event.preventDefault()} onKeyDown={event => {
        if (closing || !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        event.preventDefault(); event.stopPropagation(); buttons[next]?.focus();
      }}>
      {layout.variant === 'orbit' ? <>
        <span className="radial-ring" style={{ width: layout.radius * 2 + 54, height: layout.radius * 2 + 54 }}/>
        {layout.controls.map((control, index) => <span className="radial-orbit-item" key={control.key}>
          {control.key.startsWith('body:') && <span className="radial-spoke" style={{ width: Math.hypot(control.x, control.y) - 14, transform: 'translateY(-50%) rotate(' + Math.atan2(control.y, control.x) + 'rad)', animationDelay: index * 38 + 'ms' }}/>}
          {button(control.key, { left: control.x, top: control.y, width: control.width, height: control.height,
            animationDelay: control.key.startsWith('body:') ? index * 38 + 'ms' : '0ms',
            '--orbit-x': control.x + 'px', '--orbit-y': control.y + 'px', '--pill-rot': control.angle + 'deg' } as CSSProperties, control.x < 0)}
        </span>)}
      </> : <><div className="radial-list-actions">{view.canAdd && button('__add_body__')}{button('__delete__')}{button('__close__')}</div><div className="radial-list-bodies">{bodies.map(b => button('body:' + b.id))}</div></>}
    </div>;
  };
  return model ? render(model, false) : exiting ? render(exiting, true) : null;
}
