import { useRef, useState } from 'react';
import { Check, ChevronRight, Crosshair, Eye as EyeIcon, EyeOff as EyeOffIcon, Link as LinkIcon, Pencil, Trash2, X } from 'lucide-react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { BODY_COLORS } from '../../utils/constants';
import { computeBodyTransform, localToWorld } from '../../core/body-transform';
import './BodyPanel.css';
import { ImageOpacity } from './ImageOpacity';

export function BodyPanel() {
  const mode = useEditorStore(s => s.mode);
  const bodies = useMechanismStore((s) => s.bodies);
  const joints = useMechanismStore((s) => s.joints);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const removeBody = useMechanismStore((s) => s.removeBody);
  const renameBody = useMechanismStore((s) => s.renameBody);
  const pushHistory = useMechanismStore((s) => s.pushHistory);
  const setBodyColor = useMechanismStore((s) => s.setBodyColor);
  const addJointToBody = useMechanismStore((s) => s.addJointToBody);
  const removeJointFromBody = useMechanismStore((s) => s.removeJointFromBody);
  const addBody = useMechanismStore((s) => s.addBody);
  const toggleOutlineCOM = useMechanismStore((s) => s.toggleOutlineCOM);
  const removeOutline = useMechanismStore((s) => s.removeOutline);
  const toggleBodyShowLinks = useMechanismStore((s) => s.toggleBodyShowLinks);
  const toggleOutlineVisible = useMechanismStore((s) => s.toggleOutlineVisible);
  const editImage = useMechanismStore((s) => s.editImage);
  const removeImage = useMechanismStore((s) => s.removeImage);
  const activeBodyIds = useEditorStore((s) => s.activeBodyIds);
  const toggleActiveBody = useEditorStore((s) => s.toggleActiveBody);
  const setActiveBody = useEditorStore((s) => s.setActiveBody);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const select = useEditorStore((s) => s.select);
  const createTool = useEditorStore((s) => s.createTool);
  const editingOutlineId = useEditorStore((s) => s.editingOutlineId);
  const setEditingOutline = useEditorStore((s) => s.setEditingOutline);
  const updateFrozenOutline = useEditorStore((s) => s.updateFrozenOutline);

  const [bodyRename, setBodyRename] = useState<{ id: string; name: string } | null>(null);
  const renameDraft = useRef(bodyRename);
  const renameTrigger = useRef<HTMLButtonElement | null>(null);
  const [collapsedBodies, setCollapsedBodies] = useState<Set<string>>(new Set());

  const tracers = useMechanismStore((s) => s.tracers);
  const toggleTracerEnabled = useMechanismStore((s) => s.toggleTracerEnabled);
  const removeTracer = useMechanismStore((s) => s.removeTracer);
  const colliders = useMechanismStore((s) => s.colliders);
  const addBodyToCollider = useMechanismStore((s) => s.addBodyToCollider);
  const removeBodyFromCollider = useMechanismStore((s) => s.removeBodyFromCollider);

  const usedColors = new Set(Object.values(bodies).map((b) => b.color));
  const isOutlineMode = ['outline','tracer','rectangle','circle','ngon','image'].includes(createTool);

  const selectedJointId = createTool === 'trim' ? undefined : [...selectedIds].find((id) => joints[id]);
  const selectedColliderId = createTool === 'trim' ? undefined : [...selectedIds].find((id) => colliders[id]);
  const selectedCollider = selectedColliderId ? colliders[selectedColliderId] : null;

  const bodyList = Object.values(bodies);
  bodyList.sort((a, b) => {
    if (a.id === baseBodyId) return -1;
    if (b.id === baseBodyId) return 1;
    return 0;
  });

  const toggleCollapsed = (bodyId: string) => {
    setCollapsedBodies((prev) => {
      const next = new Set(prev);
      if (next.has(bodyId)) next.delete(bodyId);
      else next.add(bodyId);
      return next;
    });
  };

  const finishRename = (commit: boolean) => {
    // Clear synchronously: Enter/Escape can also cause blur before React renders.
    const draft = renameDraft.current;
    renameDraft.current = null;
    setBodyRename(null);
    if (commit && draft && mode !== 'simulate') {
      const name = draft.name.trim();
      if (name && bodies[draft.id] && name !== bodies[draft.id].name) {
        pushHistory();
        renameBody(draft.id, name);
      }
    }
  };

  return (
    <div className="panel-content body-panel" inert={mode === 'simulate'}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="panel-title" style={{ margin: 0 }}>Bodies</div>
        <button
          className="tool-btn"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => addBody('Body')}
        >
          + Add Body
        </button>
      </div>
      <div className="body-context">
        {isOutlineMode || (!selectedJointId && !selectedColliderId) ? 'Creation bodies'
          : selectedColliderId ? 'Collider membership' : 'Joint membership'}
      </div>
      {bodyList.map((body) => {
        const isActive = activeBodyIds.has(body.id);
        const isBase = body.id === baseBodyId;
        const isEditing = bodyRename?.id === body.id;
        const jointInBody = selectedJointId ? body.jointIds.includes(selectedJointId) : false;
        const colliderHasBody = selectedCollider ? selectedCollider.bodyIds.includes(body.id) : false;
        const bodyOutlines = Object.values(outlines).filter((o) => o.bodyId === body.id);
        const bodyImages = Object.values(images).filter((img) => img.bodyId === body.id);
        const bodyTracers = Object.values(tracers).filter((t) => t.bodyId === body.id);
        const hasChildren = bodyOutlines.length > 0 || bodyImages.length > 0 || bodyTracers.length > 0;
        const isCollapsed = collapsedBodies.has(body.id);

        return (
          <div key={body.id}>
            {/* Body row */}
            <div
              className={`body-row${isActive ? ' body-row-active' : ''}`}
              data-body-id={body.id}
            >
              {/* Collapse chevron */}
              {hasChildren ? (
                <button
                  type="button"
                  className="body-icon-btn"
                  onClick={() => toggleCollapsed(body.id)}
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${body.name}`}
                  title={`${isCollapsed ? 'Expand' : 'Collapse'} ${body.name}`}
                  aria-expanded={!isCollapsed}
                  aria-controls={`body-children-${body.id}`}
                >
                  <ChevronRight size={14} style={{ transform: isCollapsed ? undefined : 'rotate(90deg)' }} />
                </button>
              ) : (
                <span className="body-collapse-spacer" />
              )}

              {/* Selection control */}
              <label className="body-selection" title={isOutlineMode || (!selectedJointId && !selectedColliderId)
                ? `Use ${body.name} for new objects` : `Change selected ${selectedColliderId ? 'collider' : 'joint'} membership in ${body.name}`}>
                <input
                  type={isOutlineMode ? 'radio' : 'checkbox'}
                  name={isOutlineMode ? 'activeBody' : undefined}
                  aria-label={isOutlineMode || (!selectedJointId && !selectedColliderId)
                    ? `Use ${body.name} for new objects` : `Selected ${selectedColliderId ? 'collider' : 'joint'} belongs to ${body.name}`}
                  checked={isOutlineMode ? isActive : selectedColliderId ? colliderHasBody : selectedJointId ? jointInBody : isActive}
                  onChange={() => {
                    if (isOutlineMode) setActiveBody(body.id);
                    else if (selectedColliderId) {
                      if (colliderHasBody) removeBodyFromCollider(selectedColliderId, body.id);
                      else addBodyToCollider(selectedColliderId, body.id);
                    } else if (selectedJointId) {
                      if (jointInBody) removeJointFromBody(selectedJointId, body.id);
                      else addJointToBody(selectedJointId, body.id);
                    } else {
                      toggleActiveBody(body.id);
                    }
                  }}
                />
                <span className="body-name" style={{ fontWeight: isBase ? 600 : 400 }} title={body.name}>
                  {body.name}
                </span>
              </label>

              {/* Color swatch */}
              <button
                type="button"
                className="body-icon-btn body-color-btn"
                disabled={isBase}
                aria-label={isBase ? 'Base body color' : `Change color of ${body.name}`}
                onClick={() => {
                  const available = BODY_COLORS.filter((c) => !usedColors.has(c) || c === body.color);
                  const idx = available.indexOf(body.color);
                  const next = available[(idx + 1) % available.length];
                  if (next && next !== body.color) { pushHistory(); setBodyColor(body.id, next); }
                }}
                title={isBase ? 'Base body color' : 'Click to change color'}
              >
                <span className="body-color-swatch" style={{ backgroundColor: body.color }} />
              </button>

              <div className="body-actions">
                {!isBase && (
                  <button type="button" className="body-icon-btn"
                    aria-label={`Rename ${body.name}`} title={`Rename ${body.name}`}
                    onClick={(e) => {
                      finishRename(true);
                      const draft = { id: body.id, name: body.name };
                      renameDraft.current = draft;
                      setBodyRename(draft);
                      renameTrigger.current = e.currentTarget;
                    }}>
                    <Pencil size={14} />
                  </button>
                )}

                {bodyOutlines.length > 0 && (
                  <button type="button" className="body-icon-btn"
                    aria-label={`Use outline center of area for ${body.name}`}
                    aria-pressed={body.useOutlineCOM}
                    title={body.useOutlineCOM ? 'Using outline center of area for gravity' : 'Using joint centroid for gravity'}
                    onClick={() => toggleOutlineCOM(body.id)}>
                    <Crosshair size={14} />
                  </button>
                )}

                {!isBase && body.jointIds.length >= 2 && (
                  <button type="button" className="body-icon-btn"
                    aria-label={`${body.showLinks ? 'Hide' : 'Show'} links for ${body.name}`}
                    aria-pressed={body.showLinks}
                    title={body.showLinks ? 'Hide links for this body' : 'Show links for this body'}
                    onClick={() => toggleBodyShowLinks(body.id)}>
                    <LinkIcon size={14} />
                  </button>
                )}

                {!isBase && (
                  <button type="button" className="tool-btn body-icon-btn"
                    onClick={() => removeBody(body.id)}
                    aria-label={`Delete body ${body.name}`} title="Delete body">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="body-rename">
                <input
                  autoFocus
                  aria-label={`Body name for ${body.name}`}
                  value={bodyRename.name}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const draft = { id: body.id, name: e.target.value };
                    renameDraft.current = draft;
                    setBodyRename(draft);
                  }}
                  onBlur={(e) => {
                    if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) finishRename(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      finishRename(e.key === 'Enter');
                      renameTrigger.current?.focus();
                    }
                  }}
                />
                <button type="button" className="body-icon-btn" aria-label="Save body name" title="Save body name"
                  // Safari may blur with no relatedTarget before the command click.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => { finishRename(true); renameTrigger.current?.focus(); }}>
                  <Check size={14} />
                </button>
                <button type="button" className="body-icon-btn" aria-label="Cancel body rename" title="Cancel body rename"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => { finishRename(false); renameTrigger.current?.focus(); }}>
                  <X size={14} />
                </button>
                </div>
              ) : null}
            </div>

            {/* Collapsible children: outlines + images */}
            {hasChildren && !isCollapsed && (
              <div id={`body-children-${body.id}`} style={{ marginLeft: 14 }}>
                {/* Outlines */}
                {bodyOutlines.map((outline) => {
                  const isSelected = selectedIds.has(outline.id);
                  return (
                    <div
                      key={outline.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '2px 6px', marginBottom: 1, borderRadius: 3,
                        fontSize: 11, cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(74,158,255,0.15)' : 'transparent',
                      }}
                      onClick={() => select(outline.id)}
                    >
                      {/* Eye toggle for shape */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleOutlineVisible(outline.id); }}
                        title={outline.visible ? 'Hide shape' : 'Show shape'}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '0 1px', color: outline.visible ? '#aaa' : '#555',
                          lineHeight: 1, display: 'flex', alignItems: 'center',
                        }}
                      >
                        {outline.visible ? <EyeIcon /> : <EyeOffIcon />}
                      </button>

                      {/* Shape icon (small polygon) */}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={body.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: outline.visible ? 1 : 0.3 }}>
                        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
                      </svg>

                      <button type="button" className="body-child-name" title={outline.name} aria-label={'Properties for '+outline.name}
                        onClick={event=>{event.stopPropagation();useEditorStore.getState().setSelectMode('single');select(outline.id);}}>
                        {outline.name}
                      </button>
                      {/* Edit vertices */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (editingOutlineId === outline.id) {
                            // Exiting edit mode: update frozen points
                            const b = bodies[outline.bodyId];
                            if (b) {
                              const transform = computeBodyTransform(b, joints);
                              const worldPts = outline.points.map((p) => localToWorld(p, transform));
                              updateFrozenOutline(outline.id, worldPts);
                            }
                            setEditingOutline(null);
                          } else {
                            // If exiting another outline's edit mode first, update its frozen points
                            if (editingOutlineId) {
                              const prevOutline = outlines[editingOutlineId];
                              if (prevOutline) {
                                const b = bodies[prevOutline.bodyId];
                                if (b) {
                                  const transform = computeBodyTransform(b, joints);
                                  const worldPts = prevOutline.points.map((p) => localToWorld(p, transform));
                                  updateFrozenOutline(editingOutlineId, worldPts);
                                }
                              }
                            }
                            setEditingOutline(outline.id);
                          }
                        }}
                        title="Edit shape vertices"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center',
                          color: editingOutlineId === outline.id ? '#4A9EFF' : '#777',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>

                      {/* Delete */}
                      <button
                        className="tool-btn"
                        style={{ fontSize: 10, padding: '1px 4px' }}
                        onClick={(e) => { e.stopPropagation(); removeOutline(outline.id); }}
                        title="Delete shape"
                      >
                        x
                      </button>
                    </div>
                  );
                })}

                {/* Images */}
                {bodyImages.map((img) => (
                  <div
                    key={img.id}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 3,
                      padding: '2px 6px', marginBottom: 1,
                      borderRadius: 3, fontSize: 11,
                      backgroundColor: selectedIds.has(img.id) ? 'rgba(74,158,255,0.15)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {/* Eye toggle */}
                      <button
                        onClick={() => editImage(img.id, { visible: !img.visible })}
                        title={img.visible ? 'Hide image' : 'Show image'}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '0 1px', color: img.visible ? '#aaa' : '#555',
                          lineHeight: 1, display: 'flex', alignItems: 'center',
                        }}
                      >
                        {img.visible ? <EyeIcon /> : <EyeOffIcon />}
                      </button>

                      <button type="button" className="body-child-name" aria-label="Image properties" onClick={()=>{useEditorStore.getState().setCreateTool('image');select(img.id);}}>Image</button>

                      <button
                        className="tool-btn"
                        style={{ fontSize: 10, padding: '1px 4px' }}
                        onClick={() => removeImage(img.id)}
                        title="Remove image"
                      >
                        x
                      </button>
                    </div>

                    {/* Opacity slider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 2 }}>
                      <span style={{ fontSize: 10, color: '#777', width: 42 }}>Opacity</span>
                      <ImageOpacity image={img}/>
                      <span style={{ fontSize: 10, color: '#777', width: 24, textAlign: 'right' }}>
                        {Math.round(img.opacity * 100)}%
                      </span>
                    </div>
                  </div>
                ))}

                {/* Tracers */}
                {bodyTracers.map((tracer) => (
                  <div
                    key={tracer.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '2px 6px', marginBottom: 1,
                      borderRadius: 3, fontSize: 11,
                      backgroundColor: selectedIds.has(tracer.id) ? 'rgba(74,158,255,0.15)' : 'transparent',
                      cursor: 'pointer',
                    }}
                    onClick={() => select(tracer.id)}
                  >
                    <button
                      onClick={(ev) => { ev.stopPropagation(); toggleTracerEnabled(tracer.id); }}
                      title={tracer.enabled ? 'Disable tracer' : 'Enable tracer'}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0 1px', color: tracer.enabled ? '#aaa' : '#555',
                        lineHeight: 1, display: 'flex', alignItems: 'center',
                      }}
                    >
                      {tracer.enabled ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                    <span style={{ flex: 1, color: '#aaa' }}>Path Plotter</span>
                    <button
                      className="tool-btn"
                      style={{ fontSize: 10, padding: '1px 4px' }}
                      onClick={(ev) => { ev.stopPropagation(); removeTracer(tracer.id); }}
                      title="Remove tracer"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
