import { openImageFile } from './file-adapter';
import { useMechanismStore } from '../store/mechanism-store';
import { useEditorStore } from '../store/editor-store';
import { setProjectMessage } from '../document/project';
import { screenToWorld } from '../renderer/camera';

let busy = false;
export async function importImage(): Promise<void> {
  if (busy || useEditorStore.getState().mode !== 'create') return;
  busy = true;
  const epoch = useMechanismStore.getState().documentEpoch;
  try {
    const result = await openImageFile();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') throw result.error;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => { image.onload = image.onerror = null; resolve(image); };
      image.onerror = () => { image.onload = image.onerror = null; reject(new Error('The image could not be decoded.')); };
      image.src = result.content;
    });
    const m = useMechanismStore.getState(), e = useEditorStore.getState();
    if (m.documentEpoch !== epoch || e.mode !== 'create') return;
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0 || image.naturalWidth * image.naturalHeight > 32_000_000) throw new Error('Choose an image with at most 32 million pixels.');
    const rect = document.querySelector('canvas')?.getBoundingClientRect();
    const center = rect ? screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, e.camera) : { x: 0, y: 0 };
    const bodyId = [...e.activeBodyIds].find(id => m.bodies[id]) ?? m.baseBodyId;
    const id = m.addImage(bodyId, result.content, image.naturalWidth, image.naturalHeight, center);
    e.setCreateTool('image'); e.select(id);
    setProjectMessage(`Imported ${result.name}.`);
  } catch (error) {
    if (useMechanismStore.getState().documentEpoch === epoch) setProjectMessage(`Image import failed: ${error instanceof Error ? error.message : String(error)}`, 'alert');
  } finally { busy = false; }
}
