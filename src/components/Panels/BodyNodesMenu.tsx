import { useEffect, useState } from 'react';
import type { Body, Joint } from '../../types';
import { getJointDisplayName } from '../../utils/joint-labels';

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: 'transform 0.15s ease', transform: open ? 'rotate(180deg)' : 'none' }}
    >
      <polyline points="6 9 12 15 18 9" />
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
  bodyMenuId: string;
  bodies: Record<string, Body>;
  baseBodyId: string;
  joints: Record<string, Joint>;
  onClose: () => void;
  removeJoint: (id: string) => void;
  setJointLabel: (id: string, label: string) => void;
  select: (id: string) => void;
  editingJointLabelId: string | null;
  setEditingJointLabelId: (id: string | null) => void;
};

/** Inline list under a body row — closes on outside click within the bodies panel. */
export function BodyNodesInlineList({
  body,
  bodyMenuId,
  bodies,
  baseBodyId,
  joints,
  onClose,
  removeJoint,
  setJointLabel,
  select,
  editingJointLabelId,
  setEditingJointLabelId,
}: ListProps) {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const root = document.querySelector(`[data-body-node-menu="${bodyMenuId}"]`);
      if (root && !root.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [bodyMenuId, onClose]);

  const visibleJoints = body.jointIds
    .map((id) => joints[id])
    .filter((j): j is Joint => Boolean(j) && !j.hidden);

  return (
    <div className="body-nodes-inline">
      <div className="body-nodes-inline-title">Nodes</div>
      {visibleJoints.length === 0 ? (
        <div className="body-nodes-empty">No nodes in this body</div>
      ) : (
        visibleJoints.map((joint) => {
          const memberBodies = bodiesContainingJoint(joint.id, bodies, baseBodyId);
          const isEditing = editingJointLabelId === joint.id;
          return (
            <div
              key={joint.id}
              className="body-nodes-row"
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
                    title="Rename node"
                  >
                    <span className="body-nodes-name-text">{getJointDisplayName(joint)}</span>
                    {joint.mirrored && <span className="body-nodes-mirror-badge">m</span>}
                  </button>
                )}
              </div>
              <button
                type="button"
                className="body-nodes-delete tool-btn"
                title="Delete node"
                onClick={(e) => {
                  e.stopPropagation();
                  removeJoint(joint.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

type TriggerProps = {
  isOpen: boolean;
  onToggle: () => void;
};

export function BodyNodesTrigger({ isOpen, onToggle }: TriggerProps) {
  return (
    <button
      type="button"
      className="body-nodes-trigger"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title="Nodes in this body"
      aria-expanded={isOpen}
      aria-haspopup="true"
    >
      <ChevronDownIcon open={isOpen} />
    </button>
  );
}
