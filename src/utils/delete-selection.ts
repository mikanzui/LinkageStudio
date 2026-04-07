import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';

/** Deletes the current vertex selection, or all selected entities. Matches keyboard Delete behavior. */
export function deleteSelectedEntities(): void {
  const editor = useEditorStore.getState();
  const mech = useMechanismStore.getState();

  const { editingOutlineId, editingVertexIndex, selectedIds, clearSelection, setEditingVertexIndex } = editor;

  const hasVertexSelection = editingOutlineId !== null && editingVertexIndex !== null;
  if (hasVertexSelection) {
    const outline = mech.outlines[editingOutlineId!];
    const canDeleteVertex = outline && outline.points.length > 3;
    if (canDeleteVertex) {
      mech.removeOutlineVertex(editingOutlineId!, editingVertexIndex!);
      setEditingVertexIndex(null);
      return;
    }
  }

  for (const id of selectedIds) {
    if (mech.joints[id]) mech.removeJoint(id);
    else if (mech.links[id]) mech.removeLink(id);
    else if (mech.colliders[id]) mech.removeCollider(id);
    else if (mech.outlines[id]) mech.removeOutline(id);
    else if (mech.images[id]) mech.removeImage(id);
    else if (mech.tracers[id]) mech.removeTracer(id);
    else if (mech.springs[id]) mech.removeSpring(id);
  }
  clearSelection();
}
