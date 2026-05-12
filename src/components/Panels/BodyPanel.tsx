import { useState } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { BODY_COLORS } from '../../utils/constants';
import { computeBodyTransform, localToWorld } from '../../core/body-transform';
import { BodyNodesInlineList, bodyHasFeatureNodes } from './BodyNodesMenu';

/** Eye open SVG icon */
function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

/** Eye closed SVG icon */
function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

/** Chevron icon for collapse/expand */
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
    >
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

export function BodyPanel() {
  const bodies = useMechanismStore((s) => s.bodies);
  const joints = useMechanismStore((s) => s.joints);
  const links = useMechanismStore((s) => s.links);
  const springs = useMechanismStore((s) => s.springs);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const removeBody = useMechanismStore((s) => s.removeBody);
  const removeJoint = useMechanismStore((s) => s.removeJoint);
  const removeSpring = useMechanismStore((s) => s.removeSpring);
  const setJointLabel = useMechanismStore((s) => s.setJointLabel);
  const renameBody = useMechanismStore((s) => s.renameBody);
  const setBodyColor = useMechanismStore((s) => s.setBodyColor);
  const addJointToBody = useMechanismStore((s) => s.addJointToBody);
  const removeJointFromBody = useMechanismStore((s) => s.removeJointFromBody);
  const addBody = useMechanismStore((s) => s.addBody);
  const toggleOutlineCOM = useMechanismStore((s) => s.toggleOutlineCOM);
  const removeOutline = useMechanismStore((s) => s.removeOutline);
  const renameOutline = useMechanismStore((s) => s.renameOutline);
  const toggleBodyShowLinks = useMechanismStore((s) => s.toggleBodyShowLinks);
  const toggleOutlineVisible = useMechanismStore((s) => s.toggleOutlineVisible);
  const updateImage = useMechanismStore((s) => s.updateImage);
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsedBodies, setCollapsedBodies] = useState<Set<string>>(new Set());
  const [editingJointLabelId, setEditingJointLabelId] = useState<string | null>(null);

  const tracers = useMechanismStore((s) => s.tracers);
  const toggleTracerEnabled = useMechanismStore((s) => s.toggleTracerEnabled);
  const removeTracer = useMechanismStore((s) => s.removeTracer);
  const forceSensors = useMechanismStore((s) => s.forceSensors);
  const toggleForceSensorEnabled = useMechanismStore((s) => s.toggleForceSensorEnabled);
  const removeForceSensor = useMechanismStore((s) => s.removeForceSensor);
  const colliders = useMechanismStore((s) => s.colliders);
  const addBodyToCollider = useMechanismStore((s) => s.addBodyToCollider);
  const removeBodyFromCollider = useMechanismStore((s) => s.removeBodyFromCollider);

  const usedColors = new Set(Object.values(bodies).map((b) => b.color));
  const isOutlineMode = createTool === 'outline' || createTool === 'tracer' || createTool === 'rectangle' || createTool === 'circle' || createTool === 'ngon' || createTool === 'trim' || createTool === 'image';
  const isShapesBrowser = [...selectedIds].some((id) => outlines[id] || images[id]);

  const selectedJointId = [...selectedIds].find((id) => joints[id]);
  const selectedColliderId = [...selectedIds].find((id) => colliders[id]);
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

  return (
    <div className="panel-content">
      <div className="body-panel-header">
        <div className="panel-title">Bodies</div>
        <button
          className="tool-btn"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => addBody('Body')}
        >
          + Add Body
        </button>
      </div>
      <div className="panel-surface body-list-group">
        {bodyList.map((body) => {
        const isActive = activeBodyIds.has(body.id);
        const isBase = body.id === baseBodyId;
        const isEditing = editingId === body.id;
        const jointInBody = selectedJointId ? body.jointIds.includes(selectedJointId) : false;
        const colliderHasBody = selectedCollider ? selectedCollider.bodyIds.includes(body.id) : false;
        const bodyOutlines = Object.values(outlines).filter((o) => o.bodyId === body.id);
        const bodyImages = Object.values(images).filter((img) => img.bodyId === body.id);
        const bodyTracers = Object.values(tracers).filter((t) => t.bodyId === body.id);
        const bodyForceSensors = Object.values(forceSensors).filter((fs) => {
          const link = links[fs.linkId];
          if (!link) return false;
          return link.jointIds.some((jid) => body.jointIds.includes(jid));
        });
        const hasTreeOutlinesOrImages = !isShapesBrowser && (bodyOutlines.length > 0 || bodyImages.length > 0);
        const hasChildren = hasTreeOutlinesOrImages || bodyTracers.length > 0 || bodyForceSensors.length > 0;
        const hasFeatures = bodyHasFeatureNodes(body, joints, links, springs);
        const hasExpandable = hasChildren || hasFeatures;
        const isCollapsed = collapsedBodies.has(body.id);

        return (
          <div key={body.id} className="body-node-group">
            {/* Body row */}
            <div
              className={`body-row ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (isOutlineMode) setActiveBody(body.id);
                else if (selectedColliderId) {
                  if (colliderHasBody) removeBodyFromCollider(selectedColliderId, body.id);
                  else addBodyToCollider(selectedColliderId, body.id);
                } else if (selectedJointId) {
                  if (jointInBody) removeJointFromBody(selectedJointId, body.id);
                  else addJointToBody(selectedJointId, body.id);
                } else toggleActiveBody(body.id);
              }}
            >
              {/* Single chevron: expands joints/springs + overlays. */}
              {hasExpandable ? (
                <span
                  onClick={(e) => { e.stopPropagation(); toggleCollapsed(body.id); }}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#777' }}
                  title={isCollapsed ? 'Show body contents' : 'Hide body contents'}
                >
                  <ChevronIcon expanded={!isCollapsed} />
                </span>
              ) : (
                <span style={{ width: 10, flexShrink: 0 }} />
              )}

              {/* Selection control */}
              {isOutlineMode ? (
                <input
                  type="radio"
                  name="activeBody"
                  checked={isActive}
                  onChange={() => setActiveBody(body.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flexShrink: 0, cursor: 'pointer' }}
                />
              ) : (
                <input
                  type="checkbox"
                  checked={selectedColliderId ? colliderHasBody : selectedJointId ? jointInBody : isActive}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (selectedColliderId) {
                      if (colliderHasBody) removeBodyFromCollider(selectedColliderId, body.id);
                      else addBodyToCollider(selectedColliderId, body.id);
                    } else if (selectedJointId) {
                      if (jointInBody) removeJointFromBody(selectedJointId, body.id);
                      else addJointToBody(selectedJointId, body.id);
                    } else {
                      toggleActiveBody(body.id);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flexShrink: 0, cursor: 'pointer' }}
                />
              )}

              {/* Color swatch */}
              <span
                style={{
                  display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                  backgroundColor: body.color, flexShrink: 0,
                  border: isActive ? '2px solid #fff' : '2px solid transparent',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isBase) return;
                  const available = BODY_COLORS.filter((c) => !usedColors.has(c) || c === body.color);
                  const idx = available.indexOf(body.color);
                  const next = available[(idx + 1) % available.length];
                  if (next !== body.color) setBodyColor(body.id, next);
                }}
                title={isBase ? 'Base body color' : 'Click to change color'}
              />

              {/* Name (double-click to edit) */}
              {isEditing ? (
                <input
                  autoFocus
                  value={body.name}
                  onChange={(e) => renameBody(body.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(null); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    flex: 1, fontSize: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid #666',
                    color: 'inherit', outline: 'none', padding: '0 4px', borderRadius: 2,
                  }}
                />
              ) : (
                <span
                  style={{ flex: 1, fontSize: 12, fontWeight: isBase ? 600 : 400 }}
                  onDoubleClick={(e) => { e.stopPropagation(); if (!isBase) setEditingId(body.id); }}
                >
                  {body.name}
                </span>
              )}


              {/* CoA toggle */}
              {bodyOutlines.length > 0 && (
                <span
                  title={body.useOutlineCOM ? 'Using outline center of area for gravity' : 'Using joint centroid for gravity'}
                  style={{
                    fontSize: 9, padding: '0 3px', borderRadius: 2, cursor: 'pointer',
                    backgroundColor: body.useOutlineCOM ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,255,0.05)',
                    color: body.useOutlineCOM ? '#4CAF50' : 'inherit',
                  }}
                  onClick={(e) => { e.stopPropagation(); toggleOutlineCOM(body.id); }}
                >
                  CoA
                </span>
              )}

              {/* Link visibility toggle */}
              {!isBase && body.jointIds.length >= 2 && (
                <span
                  title={body.showLinks ? 'Hide links for this body' : 'Show links for this body'}
                  style={{
                    fontSize: 9, padding: '0 3px', borderRadius: 2, cursor: 'pointer',
                    backgroundColor: body.showLinks ? 'rgba(255,255,255,0.05)' : 'rgba(255,100,100,0.2)',
                    color: body.showLinks ? 'inherit' : '#f66',
                    opacity: body.showLinks ? 0.6 : 1,
                  }}
                  onClick={(e) => { e.stopPropagation(); toggleBodyShowLinks(body.id); }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                </span>
              )}

              {/* Delete */}
              {!isBase && (
                <button
                  className="tool-btn"
                  style={{ fontSize: 10, padding: '1px 4px' }}
                  onClick={(e) => { e.stopPropagation(); removeBody(body.id); }}
                  title="Delete body"
                >
                  x
                </button>
              )}
            </div>

            {!isCollapsed && hasExpandable && (
              <div style={{ marginLeft: 14 }}>
                {hasFeatures && (
                  <BodyNodesInlineList
                    body={body}
                    bodies={bodies}
                    baseBodyId={baseBodyId}
                    joints={joints}
                    links={links}
                    springs={springs}
                    removeJoint={removeJoint}
                    removeSpring={removeSpring}
                    setJointLabel={setJointLabel}
                    select={select}
                    selectedIds={selectedIds}
                    editingJointLabelId={editingJointLabelId}
                    setEditingJointLabelId={setEditingJointLabelId}
                  />
                )}
                {/* Outlines (hidden here while a shape/image is selected; use the property panel/context menu). */}
                {!isShapesBrowser && bodyOutlines.map((outline) => {
                  const isOutlineEditing = editingId === outline.id;
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

                      {/* Name (double-click to edit) */}
                      {isOutlineEditing ? (
                        <input
                          autoFocus
                          value={outline.name}
                          onChange={(e) => renameOutline(outline.id, e.target.value)}
                          onBlur={() => setEditingId(null)}
                          onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(null); }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            flex: 1, fontSize: 11, background: 'rgba(255,255,255,0.1)', border: '1px solid #666',
                            color: 'inherit', outline: 'none', padding: '0 4px', borderRadius: 2,
                          }}
                        />
                      ) : (
                        <span
                          style={{ flex: 1, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          onDoubleClick={(e) => { e.stopPropagation(); setEditingId(outline.id); }}
                        >
                          {outline.name}
                        </span>
                      )}


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
                {!isShapesBrowser && bodyImages.map((img) => (
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
                        onClick={() => updateImage(img.id, { visible: !img.visible })}
                        title={img.visible ? 'Hide image' : 'Show image'}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '0 1px', color: img.visible ? '#aaa' : '#555',
                          lineHeight: 1, display: 'flex', alignItems: 'center',
                        }}
                      >
                        {img.visible ? <EyeIcon /> : <EyeOffIcon />}
                      </button>

                      <span style={{ flex: 1, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Image
                      </span>

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
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(img.opacity * 100)}
                        onChange={(e) => updateImage(img.id, { opacity: Number(e.target.value) / 100 })}
                        style={{ flex: 1, height: 12, accentColor: '#2196F3' }}
                      />
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

                {/* Force Sensors */}
                {bodyForceSensors.map((sensor) => {
                  const sensorLink = links[sensor.linkId];
                  const j0 = sensorLink ? joints[sensorLink.jointIds[0]] : null;
                  const j1 = sensorLink ? joints[sensorLink.jointIds[1]] : null;
                  const label0 = j0?.label || sensorLink?.jointIds[0]?.slice(0, 4) || '?';
                  const label1 = j1?.label || sensorLink?.jointIds[1]?.slice(0, 4) || '?';
                  return (
                    <div
                      key={sensor.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '2px 6px', marginBottom: 1,
                        borderRadius: 3, fontSize: 11,
                        backgroundColor: selectedIds.has(sensor.id) ? 'rgba(74,158,255,0.15)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => select(sensor.id)}
                    >
                      <button
                        onClick={(ev) => { ev.stopPropagation(); toggleForceSensorEnabled(sensor.id); }}
                        title={sensor.enabled ? 'Disable force sensor' : 'Enable force sensor'}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '0 1px', color: sensor.enabled ? '#aaa' : '#555',
                          lineHeight: 1, display: 'flex', alignItems: 'center',
                        }}
                      >
                        {sensor.enabled ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                      {/* Diamond icon */}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E91E63" strokeWidth="2" strokeLinejoin="round" style={{ flexShrink: 0, opacity: sensor.enabled ? 1 : 0.3 }}>
                        <polygon points="12 2 22 12 12 22 2 12" />
                      </svg>
                      <span style={{ flex: 1, color: '#aaa' }}>Force {label0}–{label1}</span>
                      <button
                        className="tool-btn"
                        style={{ fontSize: 10, padding: '1px 4px' }}
                        onClick={(ev) => { ev.stopPropagation(); removeForceSensor(sensor.id); }}
                        title="Remove force sensor"
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
