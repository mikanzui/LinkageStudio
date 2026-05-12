import { useEffect, useMemo, useState } from 'react';
import type { Body, Joint, Link, MechanismSpring, SpringAnchor } from '../../types';
import { getJointDisplayName } from '../../utils/joint-labels';

function springTouchesBody(
  sp: MechanismSpring,
  body: Body,
  links: Record<string, Link>,
): boolean {
  const jset = new Set(body.jointIds);
  const anchorTouches = (a: SpringAnchor): boolean => {
    if (a.type === 'joint') return jset.has(a.jointId);
    const link = links[a.linkId];
    if (!link) return false;
    return jset.has(link.jointIds[0]) && jset.has(link.jointIds[1]);
  };
  return anchorTouches(sp.anchorA) || anchorTouches(sp.anchorB);
}

function springListNumber(springId: string, springs: Record<string, MechanismSpring>): number {
  const i = Object.keys(springs).sort().indexOf(springId);
  return i >= 0 ? i + 1 : 0;
}

function SpringListIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 28 16" fill="none" aria-hidden style={{ flexShrink: 0, opacity: 0.85 }}>
      <path
        d="M1 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0"
        stroke="rgba(100, 180, 120, 0.95)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function bodiesContainingJoint(jointId: string, bodies: Record<string, Body>, baseBodyId: string): Body[] {
  const list = Object.values(bodies).filter((b) => b.jointIds.includes(jointId));
  list.sort((a, b) => {
    if (a.id === baseBodyId) return -1;
    if (b.id === baseBodyId) return 1;
    return a.name.localeCompare(b.name);
  });
  return list;
}

/** True if the body has at least one visible joint or a spring that references this body. */
export function bodyHasFeatureNodes(
  body: Body,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  springs: Record<string, MechanismSpring>,
): boolean {
  const visibleJoints = body.jointIds
    .map((id) => joints[id])
    .filter((j): j is Joint => Boolean(j) && !j.hidden);
  if (visibleJoints.length > 0) return true;
  return Object.values(springs).some((sp) => springTouchesBody(sp, body, links));
}

function JointLabelEditor({
  joint,
  setJointLabel,
  onDone,
}: {
  joint: Joint;
  setJointLabel: (id: string, label: string) => void;
  onDone: () => void;
}) {
  const [v, setV] = useState(joint.label ?? '');
  useEffect(() => {
    setV(joint.label ?? '');
  }, [joint.id, joint.label]);

  return (
    <input
      autoFocus
      className="body-nodes-name-input"
      value={v}
      placeholder="Name"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setJointLabel(joint.id, v);
        onDone();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

type ListProps = {
  body: Body;
  bodies: Record<string, Body>;
  baseBodyId: string;
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  springs: Record<string, MechanismSpring>;
  removeJoint: (id: string) => void;
  removeSpring: (id: string) => void;
  setJointLabel: (id: string, label: string) => void;
  select: (id: string) => void;
  selectedIds: Set<string>;
  editingJointLabelId: string | null;
  setEditingJointLabelId: (id: string | null) => void;
};

/** Joints & springs for one body, shown under the body row when expanded. */
export function BodyNodesInlineList({
  body,
  bodies,
  baseBodyId,
  joints,
  links,
  springs,
  removeJoint,
  removeSpring,
  setJointLabel,
  select,
  selectedIds,
  editingJointLabelId,
  setEditingJointLabelId,
}: ListProps) {
  const visibleJoints = body.jointIds
    .map((id) => joints[id])
    .filter((j): j is Joint => Boolean(j) && !j.hidden);

  const bodySprings = useMemo(
    () => Object.values(springs).filter((sp) => springTouchesBody(sp, body, links)),
    [springs, body, links],
  );

  const showEmpty = visibleJoints.length === 0 && bodySprings.length === 0;

  return (
    <div className="body-nodes-inline">
      <div className="body-nodes-inline-title">Features</div>
      {showEmpty ? (
        <div className="body-nodes-empty">No joints or springs on this body</div>
      ) : null}
      {visibleJoints.map((joint) => {
          const memberBodies = bodiesContainingJoint(joint.id, bodies, baseBodyId);
          const isEditing = editingJointLabelId === joint.id;
          return (
            <div
              key={joint.id}
              className={`body-nodes-row${selectedIds.has(joint.id) ? ' body-nodes-row-selected' : ''}`}
              role="row"
              onClick={() => select(joint.id)}
            >
              <div
                className="body-nodes-swatches"
                title={memberBodies.map((b) => b.name).join(', ')}
                onClick={(e) => e.stopPropagation()}
              >
                {memberBodies.slice(0, 6).map((b) => (
                  <span
                    key={b.id}
                    className="body-nodes-swatch"
                    style={{ backgroundColor: b.color }}
                  />
                ))}
                {memberBodies.length > 6 && (
                  <span className="body-nodes-more">+{memberBodies.length - 6}</span>
                )}
              </div>
              <div className="body-nodes-label-col">
                {isEditing ? (
                  <JointLabelEditor
                    joint={joint}
                    setJointLabel={setJointLabel}
                    onDone={() => setEditingJointLabelId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className="body-nodes-name-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingJointLabelId(joint.id);
                    }}
                    title="Rename joint"
                  >
                    <span className="body-nodes-name-text">{getJointDisplayName(joint)}</span>
                    {joint.mirrored && <span className="body-nodes-mirror-badge">m</span>}
                  </button>
                )}
              </div>
              <button
                type="button"
                className="body-nodes-delete tool-btn"
                title="Delete joint"
                onClick={(e) => {
                  e.stopPropagation();
                  removeJoint(joint.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      {bodySprings.map((sp) => (
        <div
          key={sp.id}
          className={`body-nodes-row body-nodes-row-spring${selectedIds.has(sp.id) ? ' body-nodes-row-selected' : ''}`}
          role="row"
          onClick={() => select(sp.id)}
        >
          <SpringListIcon />
          <div className="body-nodes-label-col">
            <span className="body-nodes-name-text">
              {sp.kind === 'damper'
                ? 'Damper'
                : sp.kind === 'torsional'
                  ? 'Torsion spring'
                  : 'Linear spring'}{' '}
              {springListNumber(sp.id, springs)}
            </span>
          </div>
          <button
            type="button"
            className="body-nodes-delete tool-btn"
            title="Delete spring"
            onClick={(e) => {
              e.stopPropagation();
              removeSpring(sp.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

