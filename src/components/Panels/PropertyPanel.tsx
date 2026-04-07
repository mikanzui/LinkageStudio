import { useMemo } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { Joint, Link, Outline, CanvasImage, SpringAnchor, MechanismSpring } from '../../types';
import { getJointDisplayName } from '../../utils/joint-labels';
import { ParamSliderRow } from './ParamSliderRow';

function linkRowLabel(link: Link, joints: Record<string, Joint>): string {
  const ja = joints[link.jointIds[0]];
  const jb = joints[link.jointIds[1]];
  if (!ja || !jb) return 'Link';
  return `${getJointDisplayName(ja)} ↔ ${getJointDisplayName(jb)}`;
}

function SpringEndEditor(props: {
  title: string;
  anchor: SpringAnchor;
  springId: string;
  patchKey: 'anchorA' | 'anchorB';
  joints: Record<string, Joint>;
  visibleJointIds: string[];
  visibleLinks: Link[];
  allLinks: Record<string, Link>;
  springLinkResolution: number;
  updateSpring: (
    id: string,
    updates: Partial<Pick<MechanismSpring, 'anchorA' | 'anchorB'>>,
  ) => void;
  /** Torsion: link endpoints at pivot only (t = 0 or 1). */
  linkEndpointsOnly?: boolean;
}) {
  const {
    title,
    anchor,
    springId,
    patchKey,
    joints,
    visibleJointIds,
    visibleLinks,
    allLinks,
    springLinkResolution,
    updateSpring,
    linkEndpointsOnly,
  } = props;

  const patch = (next: SpringAnchor) =>
    updateSpring(springId, patchKey === 'anchorA' ? { anchorA: next } : { anchorB: next });

  const tStep = linkEndpointsOnly ? 1 : 1 / Math.max(2, Math.floor(springLinkResolution));

  const onTypeChange = (type: 'joint' | 'link') => {
    if (type === 'joint') {
      const jid = anchor.type === 'joint' ? anchor.jointId : visibleJointIds[0];
      if (!jid) return;
      patch({ type: 'joint', jointId: jid });
    } else {
      const lk = visibleLinks[0];
      if (!lk) return;
      patch({ type: 'link', linkId: lk.id, t: 0.5 });
    }
  };

  const jointIdsForSelect =
    anchor.type === 'joint' && !visibleJointIds.includes(anchor.jointId)
      ? [anchor.jointId, ...visibleJointIds]
      : visibleJointIds;

  const linkSelectList = (() => {
    const byId = new Map(visibleLinks.map((l) => [l.id, l]));
    if (anchor.type === 'link' && !byId.has(anchor.linkId) && allLinks[anchor.linkId]) {
      byId.set(anchor.linkId, allLinks[anchor.linkId]);
    }
    return [...byId.values()].sort((a, b) =>
      linkRowLabel(a, joints).localeCompare(linkRowLabel(b, joints)),
    );
  })();

  const typeRadioName = `spring-${springId}-${patchKey}-attach`;

  if (linkEndpointsOnly) {
    if (anchor.type !== 'link') {
      return (
        <div className="panel-spring-attachment-segment">
          <div className="panel-info">Torsion end must attach along a link at the pivot.</div>
        </div>
      );
    }
    const linkSelectList = (() => {
      const byId = new Map(visibleLinks.map((l) => [l.id, l]));
      if (!byId.has(anchor.linkId) && allLinks[anchor.linkId]) {
        byId.set(anchor.linkId, allLinks[anchor.linkId]);
      }
      return [...byId.values()].sort((a, b) =>
        linkRowLabel(a, joints).localeCompare(linkRowLabel(b, joints)),
      );
    })();
    const tSnap = (raw: number) => (raw < 0.5 ? 0 : 1);
    return (
      <div className="panel-spring-attachment-segment">
        <div className="panel-spring-attach-head">
          <span className="panel-spring-end-title">{title}</span>
        </div>
        <div className="panel-spring-end-row panel-spring-end-select-row">
          <select
            className="panel-spring-select"
            aria-label={`${title} link`}
            value={anchor.linkId}
            onChange={(e) => {
              const lk = e.target.value;
              patch({ type: 'link', linkId: lk, t: anchor.type === 'link' && anchor.linkId === lk ? anchor.t : 0 });
            }}
          >
            {linkSelectList.map((lk) => (
              <option key={lk.id} value={lk.id}>
                {linkRowLabel(lk, joints)}
              </option>
            ))}
          </select>
        </div>
        <div className="panel-spring-along-bar">
          <span className="panel-spring-along-label">At pivot end (0 or 1)</span>
          <div className="panel-spring-along-slider-row">
            <span className="panel-num-axis panel-spring-along-axis-gap" aria-hidden="true" />
            <div className="panel-param-slider-body">
              <div className="panel-param-range-cell">
                <input
                  className="panel-param-range-input"
                  type="range"
                  min={0}
                  max={1}
                  step={1}
                  value={tSnap(anchor.t)}
                  aria-label={`${title} end at pivot`}
                  onChange={(e) => patch({ type: 'link', linkId: anchor.linkId, t: tSnap(+e.target.value) })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-spring-attachment-segment">
      <div className="panel-spring-attach-head">
        <span className="panel-spring-end-title">{title}</span>
        <div
          className="panel-spring-type-radios"
          role="radiogroup"
          aria-label={`${title} attachment`}
        >
          <label className="panel-toggle-row panel-spring-type-radio">
            <input
              type="radio"
              name={typeRadioName}
              value="joint"
              checked={anchor.type === 'joint'}
              disabled={visibleJointIds.length === 0}
              onChange={() => onTypeChange('joint')}
            />
            <span>Joint</span>
          </label>
          <label className="panel-toggle-row panel-spring-type-radio">
            <input
              type="radio"
              name={typeRadioName}
              value="link"
              checked={anchor.type === 'link'}
              disabled={visibleLinks.length === 0}
              onChange={() => onTypeChange('link')}
            />
            <span>Link</span>
          </label>
        </div>
      </div>
      {anchor.type === 'joint' ? (
        <div className="panel-spring-end-row panel-spring-end-select-row">
          <select
            className="panel-spring-select"
            aria-label={`${title} joint`}
            value={anchor.jointId}
            onChange={(e) => patch({ type: 'joint', jointId: e.target.value })}
          >
            {jointIdsForSelect.map((jid) => (
              <option key={jid} value={jid}>
                {joints[jid] ? getJointDisplayName(joints[jid]) : jid}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="panel-spring-end-row panel-spring-end-select-row">
            <select
              className="panel-spring-select"
              aria-label={`${title} link`}
              value={anchor.linkId}
              onChange={(e) => {
                const lk = e.target.value;
                const keepT = anchor.type === 'link' && anchor.linkId === lk;
                patch({ type: 'link', linkId: lk, t: keepT ? anchor.t : 0.5 });
              }}
            >
              {linkSelectList.map((lk) => (
                <option key={lk.id} value={lk.id}>
                  {linkRowLabel(lk, joints)}
                </option>
              ))}
            </select>
          </div>
          <div className="panel-spring-along-bar">
            <span className="panel-spring-along-label">Along bar (0–1)</span>
            <div className="panel-spring-along-slider-row">
              <span className="panel-num-axis panel-spring-along-axis-gap" aria-hidden="true" />
              <div className="panel-param-slider-body">
                <div className="panel-param-range-cell">
                  <input
                    className="panel-param-range-input"
                    type="range"
                    min={0}
                    max={1}
                    step={tStep}
                    value={anchor.t}
                    aria-label={`${title} position along link`}
                    onChange={(e) => patch({ type: 'link', linkId: anchor.linkId, t: +e.target.value })}
                  />
                </div>
                <div className="panel-param-value-suffix panel-param-value-suffix--solo">
                  <label className="panel-param-slider-num">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={tStep}
                      value={anchor.t}
                      aria-label={`${title} position along link (0–1)`}
                      onChange={(e) =>
                        patch({
                          type: 'link',
                          linkId: anchor.linkId,
                          t: Math.max(0, Math.min(1, +e.target.value)),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PropertyPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const springLinkResolution = useEditorStore((s) => s.springLinkResolution);
  const setSpringLinkResolution = useEditorStore((s) => s.setSpringLinkResolution);
  const joints = useMechanismStore((s) => s.joints);
  const links = useMechanismStore((s) => s.links);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const springs = useMechanismStore((s) => s.springs);
  const bodies = useMechanismStore((s) => s.bodies);
  const moveJoint = useMechanismStore((s) => s.moveJoint);
  const updateImage = useMechanismStore((s) => s.updateImage);
  const updateSpring = useMechanismStore((s) => s.updateSpring);

  const visibleJointIds = useMemo(
    () =>
      Object.keys(joints)
        .filter((id) => joints[id] && !joints[id].hidden)
        .sort((a, b) => getJointDisplayName(joints[a]).localeCompare(getJointDisplayName(joints[b]))),
    [joints],
  );

  const visibleLinks = useMemo(
    () =>
      Object.values(links)
        .filter((l) => {
          const ja = joints[l.jointIds[0]];
          const jb = joints[l.jointIds[1]];
          return ja && jb && !ja.hidden && !jb.hidden;
        })
        .sort((a, b) => linkRowLabel(a, joints).localeCompare(linkRowLabel(b, joints))),
    [links, joints],
  );

  if (selectedIds.size === 0) {
    return null;
  }

  const id = [...selectedIds][0];
  const joint = joints[id] as Joint | undefined;
  const outline = outlines[id] as Outline | undefined;
  const image = images[id] as CanvasImage | undefined;

  if (joint) {
    const step = 0.1;
    return (
      <div className="panel-content">
        <div className="panel-section-header">
          <div className="panel-title">Joint</div>
        </div>
        <div className="panel-surface panel-section">
          <div className="panel-kind-label">
            {joint.type === 'fixed' ? 'Fixed (Base)' : 'Revolute'}
          </div>
          <label className="panel-num-row">
            <span className="panel-num-axis">X</span>
            <div className="panel-num-stepper">
              <input
                type="number"
                step={step}
                value={joint.position.x.toFixed(1)}
                onChange={(e) => moveJoint(joint.id, { x: +e.target.value, y: joint.position.y })}
              />
              <div className="panel-num-arrows" role="group" aria-label="Adjust X">
                <button
                  type="button"
                  className="panel-num-arrow"
                  tabIndex={-1}
                  onClick={() =>
                    moveJoint(joint.id, { x: joint.position.x + step, y: joint.position.y })
                  }
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
                    <path d="M1 5L5 1L9 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="panel-num-arrow"
                  tabIndex={-1}
                  onClick={() =>
                    moveJoint(joint.id, { x: joint.position.x - step, y: joint.position.y })
                  }
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
                    <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </label>
          <label className="panel-num-row">
            <span className="panel-num-axis">Y</span>
            <div className="panel-num-stepper">
              <input
                type="number"
                step={step}
                value={joint.position.y.toFixed(1)}
                onChange={(e) => moveJoint(joint.id, { x: joint.position.x, y: +e.target.value })}
              />
              <div className="panel-num-arrows" role="group" aria-label="Adjust Y">
                <button
                  type="button"
                  className="panel-num-arrow"
                  tabIndex={-1}
                  onClick={() =>
                    moveJoint(joint.id, { x: joint.position.x, y: joint.position.y + step })
                  }
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
                    <path d="M1 5L5 1L9 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="panel-num-arrow"
                  tabIndex={-1}
                  onClick={() =>
                    moveJoint(joint.id, { x: joint.position.x, y: joint.position.y - step })
                  }
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
                    <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </label>
        </div>
      </div>
    );
  }

  if (outline) {
    const body = bodies[outline.bodyId];
    return (
      <div className="panel-content">
        <div className="panel-section-header">
          <div className="panel-title">{outline.name || 'Shape'}</div>
        </div>
        <div className="panel-surface panel-section">
          <div className="panel-info">Body: {body?.name ?? 'Unknown'}</div>
          <div className="panel-info">{outline.points.length} vertices</div>
        </div>
      </div>
    );
  }

  const spring = springs[id];
  if (spring) {
    const title =
      spring.kind === 'damper' ? 'Linear damper' : spring.kind === 'torsional' ? 'Torsion spring' : 'Linear spring';
    const torsion = spring.kind === 'torsional';
    return (
      <div className="panel-content">
        <div className="panel-section-header">
          <div className="panel-title">{title}</div>
        </div>
        <div className="panel-surface panel-section">
          <div className="panel-spring-combined">
            <SpringEndEditor
              title={torsion ? 'Link A (at pivot)' : 'From'}
              anchor={spring.anchorA}
              springId={spring.id}
              patchKey="anchorA"
              joints={joints}
              visibleJointIds={visibleJointIds}
              visibleLinks={visibleLinks}
              allLinks={links}
              springLinkResolution={springLinkResolution}
              updateSpring={updateSpring}
              linkEndpointsOnly={torsion}
            />
            <SpringEndEditor
              title={torsion ? 'Link B (at pivot)' : 'To'}
              anchor={spring.anchorB}
              springId={spring.id}
              patchKey="anchorB"
              joints={joints}
              visibleJointIds={visibleJointIds}
              visibleLinks={visibleLinks}
              allLinks={links}
              springLinkResolution={springLinkResolution}
              updateSpring={updateSpring}
              linkEndpointsOnly={torsion}
            />
            <div className="panel-spring-params">
              {spring.kind !== 'damper' && (
                <ParamSliderRow
                  key={`${spring.id}-stiffness`}
                  axisLabel="k"
                  suffix={torsion ? 'N·m/rad' : 'N/m'}
                  value={spring.stiffness}
                  onChange={(v) => updateSpring(spring.id, { stiffness: v })}
                  defaultMin={0}
                  defaultMax={torsion ? 200 : 500}
                  step={torsion ? 0.5 : 1}
                  clamp={(v) => Math.max(0, v)}
                />
              )}
              <ParamSliderRow
                key={`${spring.id}-damping`}
                axisLabel="c"
                suffix={torsion ? 'N·m·s/rad' : 'N·s/m'}
                value={spring.damping}
                onChange={(v) => updateSpring(spring.id, { damping: v })}
                defaultMin={0}
                defaultMax={torsion ? 80 : 80}
                step={0.5}
                clamp={(v) => Math.max(0, v)}
              />
              {spring.kind !== 'damper' && (
                <ParamSliderRow
                  key={`${spring.id}-rest`}
                  axisLabel={torsion ? 'φ₀' : 'L₀'}
                  suffix={torsion ? 'rad' : 'm'}
                  value={spring.restLength}
                  onChange={(v) => updateSpring(spring.id, { restLength: v })}
                  defaultMin={torsion ? -6.29 : 0}
                  defaultMax={torsion ? 6.29 : 400}
                  step={torsion ? 0.01 : 0.01}
                  displayDecimals={torsion ? 3 : 3}
                  clamp={(v) => (torsion ? v : Math.max(1e-9, v))}
                />
              )}
              {spring.kind !== 'damper' && (
                <ParamSliderRow
                  key={`${spring.id}-prestress`}
                  axisLabel="Δ"
                  suffix={torsion ? 'rad' : 'm'}
                  value={spring.prestressDelta}
                  onChange={(v) => updateSpring(spring.id, { prestressDelta: v })}
                  defaultMin={torsion ? -6.29 : -100}
                  defaultMax={torsion ? 6.29 : 100}
                  step={0.01}
                  clamp={(v) => v}
                />
              )}
              {!torsion && (
                <ParamSliderRow
                  key="spring-link-snap-resolution"
                  axisLabel="#"
                  suffix={'steps'}
                  value={springLinkResolution}
                  onChange={(v) => setSpringLinkResolution(v)}
                  defaultMin={2}
                  defaultMax={48}
                  step={1}
                  integer
                  clamp={(v) => Math.max(2, Math.round(v))}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (image) {
    const body = bodies[image.bodyId];
    return (
      <div className="panel-content">
        <div className="panel-section-header">
          <div className="panel-title">Image</div>
        </div>
        <div className="panel-surface panel-section">
          <div className="panel-info">Body: {body?.name ?? 'Unknown'}</div>
          <div className="panel-info">{image.naturalWidth} x {image.naturalHeight} px</div>
          <label>
            Scale
            <input
              type="number"
              step="0.1"
              min="0.01"
              value={image.scale.toFixed(2)}
              onChange={(e) => updateImage(image.id, { scale: Math.max(0.01, +e.target.value) })}
            />
          </label>
          <label>
            Rotation
            <input
              type="number"
              step="5"
              value={Math.round((image.rotation * 180) / Math.PI)}
              onChange={(e) => updateImage(image.id, { rotation: (+e.target.value * Math.PI) / 180 })}
            />
            <span style={{ fontSize: 10, color: '#777' }}>deg</span>
          </label>
        </div>
      </div>
    );
  }

  return null;
}
