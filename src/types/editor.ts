import type { Vec2 } from './geometry';

export type AppMode = 'create' | 'simulate';
export type ToolType = 'select' | 'joint' | 'link' | 'pan';
/** Pivot-tool selection: click, axis-aligned box, or freeform lasso (viewport bar). */
export type SelectMode = 'single' | 'box' | 'lasso';

export type SelectionGesture =
  | { type: 'box'; screenStart: Vec2; screenEnd: Vec2 }
  | { type: 'lasso'; screenPoints: Vec2[] };
export type JointSubType = 'revolute' | 'fixed';
export type CreateTool =
  | 'joints'
  | 'slider'
  | 'collider'
  | 'spring'
  | 'damper'
  | 'torsionSpring'
  | 'outline'
  /** Select outlines & images; compact list in Bodies panel */
  | 'shapes'
  | 'rectangle'
  | 'circle'
  | 'ngon'
  | 'trim'
  | 'image'
  | 'tracer'
  | 'forceSensor'
  | 'mirror';

/** Spring tool: two-click placement pattern (both ends are joint or link). */
export type SpringToolSubmode = 'jointJoint' | 'jointLink' | 'linkLink';
export type JointMode = 'manual' | 'autochain';
export type GridLevel = 'normal' | 'fine' | 'ultrafine' | 'off';

export interface SimDragState {
  active: boolean;
  grabPoint: Vec2;
  cursorPoint: Vec2;
  jointId: string;
  linkId: string | null;
  grabT: number;
  tempJointId?: string;  // temporary joint created for shape dragging
  /** Simulate: pull this joint directly (slider B — not on any distance link; A/C may be fixed). */
  directJointId?: string | null;
}

export interface CameraState {
  pan: Vec2;
  zoom: number;
}

export interface EditorState {
  mode: AppMode;
  activeTool: ToolType;
  jointSubType: JointSubType;
  selectedIds: Set<string>;
  hoveredId: string | null;
  camera: CameraState;
  gridEnabled: boolean;
  gridSize: number;
  gridLevel: GridLevel;
  linkStartJointId: string | null;
  simDrag: SimDragState | null;
  savedPositions: Record<string, Vec2> | null;
}
