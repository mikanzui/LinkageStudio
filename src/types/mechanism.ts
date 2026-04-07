import type { Vec2 } from './geometry';

export type JointType = 'revolute' | 'fixed';

export interface Joint {
  readonly id: string;
  type: JointType;
  position: Vec2;
  connectedLinkIds: string[];
  mass?: number;
  externalForce?: Vec2;
  /** Hidden bracing joints are invisible to the user but participate in physics */
  hidden?: boolean;
  /** User-defined name (Bodies panel node list). */
  label?: string;
  /** Created by mirror — shown with “m” in the bodies node menu. */
  mirrored?: boolean;
}

export interface Link {
  readonly id: string;
  jointIds: [string, string];
  restLength: number;
  mass: number;
}

export interface Body {
  readonly id: string;
  name: string;
  color: string;
  jointIds: string[];
  useOutlineCOM: boolean;
  showLinks: boolean;
}

export interface Outline {
  readonly id: string;
  bodyId: string;
  name: string;
  visible: boolean;
  points: Vec2[];  // local coordinates relative to body reference frame
}

export interface CanvasImage {
  readonly id: string;
  bodyId: string;           // which body this image is attached to (initially Base)
  src: string;              // data URL of the image
  position: Vec2;           // world-space center position
  scale: number;            // uniform scale factor (1 = original size)
  rotation: number;         // rotation in radians
  opacity: number;          // 0-1 transparency
  visible: boolean;         // eye toggle
  naturalWidth: number;     // original pixel width
  naturalHeight: number;    // original pixel height
}

/** A slider constraint: 3 joints (A, B, C) where A-C are rigid and B slides along AC. */
export interface SliderConstraint {
  readonly id: string;
  jointIdA: string;
  jointIdB: string;  // the slider joint (slides between A and C)
  jointIdC: string;
  /** B's parametric position along AC (0 = at A, 1 = at C) */
  t: number;
}

/**
 * Angle constraint: maintains the angle at joint B (vertex) between joints A and C.
 * Used to stiffen collinear or near-collinear joint triplets where distance
 * constraints alone become degenerate and converge slowly in PBD.
 */
export interface AngleConstraint {
  readonly id: string;
  jointIdA: string;
  jointIdB: string;  // vertex joint (the angle is measured here)
  jointIdC: string;
  restAngle: number; // radians — the angle ABC at design time
}

/**
 * Collider constraint: a barrier line between joints A and C.
 * Joints in the assigned bodies cannot cross this line segment.
 * Endpoints A and C are regular joints (can be on any body).
 * The barrier's bodyIds determines which bodies' joints are blocked.
 */
export interface ColliderConstraint {
  readonly id: string;
  jointIdA: string;
  jointIdC: string;
  /** Bodies whose joints are blocked by this barrier */
  bodyIds: string[];
}

/**
 * Tracer: a point fixed to a body that plots its world-space path
 * during simulation. Position stored in body-local coordinates.
 */
export interface Tracer {
  readonly id: string;
  bodyId: string;
  localPosition: Vec2;
  enabled: boolean;
}

/**
 * Force sensor: attached to a link to record and display axial force
 * over time during simulation. Works like a strain gauge / load cell.
 */
export interface ForceSensor {
  readonly id: string;
  linkId: string;
  enabled: boolean;
}

/** End of a spring: joint or point along a rigid link (t ∈ [0,1]). Both ends are visible and move with the mechanism. */
export type SpringAnchor =
  | { type: 'joint'; jointId: string }
  | { type: 'link'; linkId: string; t: number };

/**
 * Massless spring / damper (forces applied in Simulate only).
 * - `linear`: k [N/m], c [N·s/m], restLength + prestressDelta = equilibrium length [m].
 * - `damper`: same attachments as linear; k fixed at 0 (dashpot along the bar); c [N·s/m].
 * - `torsional`: two link ends at a shared pivot; k [N·m/rad], c [N·m·s/rad];
 *   restLength + prestressDelta = equilibrium angle [rad].
 */
export interface MechanismSpring {
  readonly id: string;
  kind: 'linear' | 'damper' | 'torsional';
  anchorA: SpringAnchor;
  anchorB: SpringAnchor;
  stiffness: number;
  damping: number;
  restLength: number;
  prestressDelta: number;
}

export interface MechanismState {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  baseBodyId: string;
  outlines: Record<string, Outline>;
  images: Record<string, CanvasImage>;
  sliders: Record<string, SliderConstraint>;
  colliders: Record<string, ColliderConstraint>;
  tracers: Record<string, Tracer>;
  springs: Record<string, MechanismSpring>;
  forceSensors: Record<string, ForceSensor>;
}
