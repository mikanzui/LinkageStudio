import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';

/** All delete entry points share one selection/vertex command and one undo boundary. */
export function deleteSelectedEntities(): void {
  const editor = useEditorStore.getState(), store = useMechanismStore;
  if (editor.mode !== 'create') return;
  const before = store.getState();
  if (editor.editingOutlineId && editor.editingVertexIndex !== null) {
    if (before.outlines[editor.editingOutlineId]?.points.length > 3) {
      before.removeOutlineVertex(editor.editingOutlineId, editor.editingVertexIndex);
      editor.setEditingVertexIndex(null);
    }
    return;
  }
  const collections = ['joints', 'links', 'sliders', 'colliders', 'outlines', 'images', 'tracers'] as const;
  const ids = [...editor.selectedIds].filter(id => collections.some(key => before[key][id]));
  if (!ids.length) return;
  before.pushHistory();
  const history = store.getState().past;
  try {
    for (const id of ids) {
      const m = store.getState();
      if (m.joints[id]) m.removeJoint(id);
      else if (m.links[id]) m.removeLink(id);
      else if (m.sliders[id]) m.removeSlider(id);
      else if (m.colliders[id]) m.removeCollider(id);
      else if (m.outlines[id]) m.removeOutline(id);
      else if (m.images[id]) m.removeImage(id);
      else if (m.tracers[id]) m.removeTracer(id);
    }
    store.setState({ past: history, future: [] });
    editor.clearSelection();
  } catch (error) {
    store.setState({ ...structuredClone(history[history.length - 1]), past: before.past, future: before.future });
    throw error;
  }
}
