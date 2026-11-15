import { useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { useEditorStore } from '../store/editor-store';

export function PanelResizeHandle({ side }: { side: 'left' | 'right' }) {
  const width = useEditorStore(s => side === 'left' ? s.leftWidth : s.rightWidth);
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const min = side === 'left' ? 120 : 220, max = side === 'left' ? 300 : 480;
  const change = (value: number) => useEditorStore.getState().setPanelWidth(side, value);
  const cancel = () => { if (drag.current) change(drag.current.width); drag.current = null; };
  return <div role="separator" tabIndex={0} aria-label={`Resize ${side} panel`} title={`Resize ${side} panel`}
    aria-orientation="vertical" aria-valuenow={Math.round(width)} aria-valuemin={min} aria-valuemax={max} className="panel-resize-handle"
    onPointerDown={event => { if (drag.current || event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); drag.current = { id: event.pointerId, x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (drag.current?.id === event.pointerId) change(drag.current.width + (event.clientX - drag.current.x) * (side === 'left' ? 1 : -1)); }}
    onPointerUp={event => { if (drag.current?.id !== event.pointerId) return; drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={event => { if (drag.current?.id === event.pointerId) cancel(); }} onLostPointerCapture={event => { if (drag.current?.id === event.pointerId) cancel(); }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); change(width + (event.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1) * (event.shiftKey ? 25 : 10)); }
      else if (event.key === 'Home') { event.preventDefault(); change(side === 'left' ? 140 : 260); }
      else if (event.key === 'Escape') { event.preventDefault(); const id = drag.current?.id; cancel(); if (id !== undefined && event.currentTarget.hasPointerCapture(id)) event.currentTarget.releasePointerCapture(id); }
    }}><GripVertical size={15}/></div>;
}
