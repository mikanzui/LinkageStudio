import { useRef } from 'react';
import type { CanvasImage } from '../../types';
import { useMechanismStore } from '../../store/mechanism-store';

type State = ReturnType<typeof useMechanismStore.getState>;
export function ImageOpacity({ image }: { image: CanvasImage }) {
  const transaction = useRef<{ opacity: number; past: State['past']; future: State['future']; pushed: State['past'] } | null>(null);
  const finish = (cancel: boolean) => {
    const tx = transaction.current;
    if (!tx) return;
    transaction.current = null;
    const m = useMechanismStore.getState();
    if (cancel && m.images[image.id]) m.updateImage(image.id,{opacity:tx.opacity});
    if ((cancel || m.images[image.id]?.opacity === tx.opacity) && m.past === tx.pushed) useMechanismStore.setState({past:tx.past,future:tx.future});
  };
  return <input type="range" aria-label="Image opacity" min={0} max={100} value={Math.round(image.opacity*100)}
    onPointerDown={event=>{if(transaction.current)return;const m=useMechanismStore.getState();m.pushHistory();transaction.current={opacity:image.opacity,past:m.past,future:m.future,pushed:useMechanismStore.getState().past};event.currentTarget.setPointerCapture(event.pointerId);}}
    onChange={event=>{const opacity=Number(event.target.value)/100,m=useMechanismStore.getState();if(transaction.current)m.updateImage(image.id,{opacity});else m.editImage(image.id,{opacity});}}
    onPointerUp={()=>finish(false)} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish(true)}
    onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();finish(true);}}}
    style={{flex:1,height:12,accentColor:'#2196F3'}}/>;
}
