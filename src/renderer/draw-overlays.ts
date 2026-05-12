import type { Vec2, CameraState, SimDragState, ForceVector, GridLevel, SelectionGesture, Joint, Link, ForceAnalysisResult, Body, ForceSensor } from '../types';
import { GRID_COLOR, GRID_MAJOR_COLOR, BACKGROUND_COLOR } from '../utils/constants';
import { forceToColor, formatForce, FORCE_READOUT_LABEL_HINT_SHORT } from '../utils/units';

function drawBadgeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bgColor: string,
  textColor: string,
  zoom: number,
  fontSizeScreen: number = 11,
  subtitle?: string,
) {
  const fontSize = fontSizeScreen / zoom;
  ctx.font = `bold ${fontSize}px monospace`;
  
  const paddingX = 4 / zoom;
  const paddingY = 2 / zoom;
  const w = ctx.measureText(text).width + paddingX * 2;
  const h = fontSize + paddingY * 2;
  
  const r = Math.min(w, h) / 3;
  const left = x - w / 2;
  const top = y - h / 2;
  
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + w - r, top);
  ctx.arcTo(left + w, top, left + w, top + r, r);
  ctx.lineTo(left + w, top + h - r);
  ctx.arcTo(left + w, top + h, left + w - r, top + h, r);
  ctx.lineTo(left + r, top + h);
  ctx.arcTo(left, top + h, left, top + h - r, r);
  ctx.lineTo(left, top + r);
  ctx.arcTo(left, top, left + r, top, r);
  ctx.closePath();
  
  ctx.fillStyle = bgColor;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1.0;
  
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Slight nudge for middle monospace alignment
  ctx.fillText(text, x, y + (0.5 / zoom));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (subtitle) {
    const subSize = (fontSizeScreen * 0.62) / zoom;
    ctx.font = `${subSize}px monospace`;
    ctx.fillStyle = 'rgba(28, 28, 28, 0.9)';
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(subtitle, x, y + h * 0.5 + 2 / zoom);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  canvasWidth: number,
  canvasHeight: number,
  gridSize: number,
  gridLevel: GridLevel,
) {
  const { pan, zoom } = camera;

  // Determine visible world bounds
  const left = -pan.x / zoom;
  const top = -pan.y / zoom;
  const right = (canvasWidth - pan.x) / zoom;
  const bottom = (canvasHeight - pan.y) / zoom;

  // Adaptive grid: scale spacing with zoom, but preserve a visual distinction
  // between normal/fine/ultrafine levels.
  const minScreenStepByLevel: Record<GridLevel, number> = {
    normal: 8,
    fine: 5,
    ultrafine: 2,
    off: 8,
  };
  const minScreenStep = minScreenStepByLevel[gridLevel] ?? 8;

  // Use gridSize as base unit; only collapse when too dense on screen.
  let step = gridSize;
  while (step * zoom < minScreenStep) step *= 2;

  const startX = Math.floor(left / step) * step;
  const startY = Math.floor(top / step) * step;

  ctx.lineWidth = 1 / zoom;

  for (let x = startX; x <= right; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.strokeStyle = x === 0 ? GRID_MAJOR_COLOR : GRID_COLOR;
    ctx.stroke();
  }

  for (let y = startY; y <= bottom; y += step) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.strokeStyle = y === 0 ? GRID_MAJOR_COLOR : GRID_COLOR;
    ctx.stroke();
  }

  // Origin cross
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1.5 / zoom;
  const crossSize = 15 / zoom;
  ctx.beginPath();
  ctx.moveTo(-crossSize, 0);
  ctx.lineTo(crossSize, 0);
  ctx.moveTo(0, -crossSize);
  ctx.lineTo(0, crossSize);
  ctx.stroke();
}

export function drawMirrorAxisGuide(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  canvasWidth: number,
  canvasHeight: number,
  preview: { axis: 'vertical' | 'horizontal'; value: number } | null,
) {
  if (!preview) return;
  const { pan, zoom } = camera;
  const left = -pan.x / zoom;
  const top = -pan.y / zoom;
  const right = (canvasWidth - pan.x) / zoom;
  const bottom = (canvasHeight - pan.y) / zoom;

  ctx.save();
  ctx.strokeStyle = 'rgba(64, 173, 255, 0.95)';
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([8 / zoom, 5 / zoom]);
  ctx.beginPath();
  if (preview.axis === 'vertical') {
    ctx.moveTo(preview.value, top);
    ctx.lineTo(preview.value, bottom);
  } else {
    ctx.moveTo(left, preview.value);
    ctx.lineTo(right, preview.value);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw ruler strips pinned to the top and left edges of the canvas.
 * Tick positions correspond to world coordinates (1cm = 25 world units).
 * The strips stay fixed to the viewport — they don't scroll with the canvas.
 *
 * IMPORTANT: This must be called AFTER resetCamera() since it draws in screen space.
 */
export function drawRulers(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  canvasWidth: number,
  canvasHeight: number,
) {
  const { pan, zoom } = camera;
  const PX_PER_CM = 25; // 1cm = 25 world units
  const RULER_SIZE = 20; // px height/width of ruler strip

  // Work in screen-space (identity transform assumed)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Visible world bounds
  const left = -pan.x / zoom;
  const top = -pan.y / zoom;
  const right = (canvasWidth - pan.x) / zoom;
  const bottom = (canvasHeight - pan.y) / zoom;

  // Adaptive tick spacing
  const cmScreenPx = PX_PER_CM * zoom;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let majorCm = 1;
  for (const s of steps) {
    if (s * cmScreenPx >= 40) { majorCm = s; break; }
  }
  const minorCm = majorCm / 5;
  const minorScreenPx = minorCm * cmScreenPx;

  // --- Top ruler strip (horizontal, along X axis) ---
  ctx.fillStyle = 'rgba(248, 248, 248, 0.92)';
  ctx.fillRect(RULER_SIZE, 0, canvasWidth - RULER_SIZE, RULER_SIZE);
  // Bottom border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RULER_SIZE, RULER_SIZE);
  ctx.lineTo(canvasWidth, RULER_SIZE);
  ctx.stroke();

  const xStartCm = Math.floor((left / PX_PER_CM) / minorCm) * minorCm;
  const xEndCm = Math.ceil((right / PX_PER_CM) / minorCm) * minorCm;

  for (let cm = xStartCm; cm <= xEndCm; cm += minorCm) {
    const worldX = cm * PX_PER_CM;
    const screenX = worldX * zoom + pan.x;
    if (screenX < RULER_SIZE || screenX > canvasWidth) continue;

    const isMajor = Math.abs(cm - Math.round(cm / majorCm) * majorCm) < minorCm * 0.1;
    const tickH = isMajor ? RULER_SIZE : RULER_SIZE * 0.4;

    ctx.beginPath();
    ctx.moveTo(screenX, RULER_SIZE);
    ctx.lineTo(screenX, RULER_SIZE - tickH);
    ctx.strokeStyle = isMajor ? '#888' : '#bbb';
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.stroke();

    if (isMajor && minorScreenPx > 2) {
      ctx.font = '9px monospace';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(formatRulerLabel(cm), screenX, 2);
    }
  }

  // --- Left ruler strip (vertical, along Y axis) ---
  ctx.fillStyle = 'rgba(248, 248, 248, 0.92)';
  ctx.fillRect(0, RULER_SIZE, RULER_SIZE, canvasHeight - RULER_SIZE);
  // Right border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RULER_SIZE, RULER_SIZE);
  ctx.lineTo(RULER_SIZE, canvasHeight);
  ctx.stroke();

  const yStartCm = Math.floor((top / PX_PER_CM) / minorCm) * minorCm;
  const yEndCm = Math.ceil((bottom / PX_PER_CM) / minorCm) * minorCm;

  for (let cm = yStartCm; cm <= yEndCm; cm += minorCm) {
    const worldY = cm * PX_PER_CM;
    const screenY = worldY * zoom + pan.y;
    if (screenY < RULER_SIZE || screenY > canvasHeight) continue;

    const isMajor = Math.abs(cm - Math.round(cm / majorCm) * majorCm) < minorCm * 0.1;
    const tickW = isMajor ? RULER_SIZE : RULER_SIZE * 0.4;

    ctx.beginPath();
    ctx.moveTo(RULER_SIZE, screenY);
    ctx.lineTo(RULER_SIZE - tickW, screenY);
    ctx.strokeStyle = isMajor ? '#888' : '#bbb';
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.stroke();

    if (isMajor && minorScreenPx > 2) {
      ctx.save();
      ctx.translate(10, screenY);
      ctx.rotate(-Math.PI / 2);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatRulerLabel(cm), 0, 0);
      ctx.restore();
    }
  }

  // Corner square (where rulers meet)
  ctx.fillStyle = 'rgba(248, 248, 248, 0.92)';
  ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, RULER_SIZE, RULER_SIZE);

  ctx.restore();
}

function formatRulerLabel(cm: number): string {
  const absCm = Math.abs(cm);
  if (absCm >= 100) {
    const m = cm / 100;
    return Number.isInteger(m) ? `${m}m` : `${m.toFixed(1)}m`;
  }
  if (absCm >= 1) {
    return Number.isInteger(cm) ? `${cm}cm` : `${cm.toFixed(1)}cm`;
  }
  return `${(cm * 10).toFixed(0)}mm`;
}

export function drawPathTraces(
  ctx: CanvasRenderingContext2D,
  traces: Map<string, Vec2[]>,
  zoom: number,
) {
  ctx.lineWidth = 1.5 / zoom;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const colors = ['#E91E63', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];
  let colorIdx = 0;

  for (const [, points] of traces) {
    if (points.length < 2) continue;
    ctx.strokeStyle = colors[colorIdx % colors.length];
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    colorIdx++;
  }
}

export function drawLinkGhost(
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2,
  zoom: number,
) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = 'rgba(33, 150, 243, 0.5)';
  ctx.lineWidth = 3 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
}

const HUD_DOF_FONT = '12px monospace';
/** Space after the DOF value before the help icon (circle extends left of the “?” glyph). */
const HUD_GAP_AFTER_DOF = 10;
/** Horizontal padding around the “?” for the HTML tooltip hitbox (matches visual). */
const HUD_DOF_HELP_PAD = 4;
/** Slightly larger than the glyph for even clearance; pairs with 1px stroke. */
const HUD_DOF_HELP_RADIUS = 8;

function measureDofHudParts(ctx: CanvasRenderingContext2D, dof: number) {
  ctx.font = HUD_DOF_FONT;
  const dofText = `DOF: ${dof}`;
  const textW = ctx.measureText(dofText).width;
  if (dof >= 0) {
    return {
      dofText,
      badgeW: textW + 12,
      showHelp: false as const,
      helpX: 0,
      circleCx: 0,
    };
  }
  const qm = ctx.measureText('?');
  const qW = qm.width;
  const helpX = 14 + textW + HUD_GAP_AFTER_DOF;
  const circleCx = helpX + qW / 2;
  const badgeRight = circleCx + HUD_DOF_HELP_RADIUS + 3;
  const badgeW = badgeRight - 8;
  return {
    dofText,
    badgeW,
    showHelp: true as const,
    helpX,
    circleCx,
    qW,
  };
}

/** Help icon only when DOF is negative (over-constrained). Screen-space hitbox aligned with `drawHUD`. */
export function getDofHudHelpTooltipRect(
  canvasWidth: number,
  canvasHeight: number,
  dof: number,
): { left: number; top: number; width: number; height: number } | null {
  if (canvasWidth <= 0 || canvasHeight <= 0 || dof >= 0) return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = HUD_DOF_FONT;
  ctx.textBaseline = 'bottom';
  const parts = measureDofHudParts(ctx, dof);
  if (!parts.showHelp) return null;
  const baselineY = canvasHeight - 10;
  const m = ctx.measureText('?');
  const ascent = m.actualBoundingBoxAscent ?? 8;
  const descent = m.actualBoundingBoxDescent ?? 2;
  const circleCy = baselineY + (descent - ascent) / 2;
  const { circleCx } = parts;
  return {
    left: circleCx - HUD_DOF_HELP_RADIUS - HUD_DOF_HELP_PAD,
    top: circleCy - HUD_DOF_HELP_RADIUS - HUD_DOF_HELP_PAD,
    width: (HUD_DOF_HELP_RADIUS + HUD_DOF_HELP_PAD) * 2,
    height: (HUD_DOF_HELP_RADIUS + HUD_DOF_HELP_PAD) * 2,
  };
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  _canvasWidth: number,
  canvasHeight: number,
  dof: number,
  cursorWorld: Vec2 | null,
) {
  ctx.font = HUD_DOF_FONT;
  ctx.textBaseline = 'bottom';

  // DOF badge; circled “?” only when DOF is negative (HTML tooltip hitbox in MechanismCanvas)
  const parts = measureDofHudParts(ctx, dof);
  const { dofText, badgeW } = parts;
  ctx.fillStyle = dof === 1 ? '#4CAF50' : dof === 0 ? '#FF9800' : dof < 0 ? '#E53935' : '#2196F3';
  ctx.fillRect(8, canvasHeight - 28, badgeW, 22);
  ctx.fillStyle = '#fff';
  const baselineY = canvasHeight - 10;
  ctx.fillText(dofText, 14, baselineY);
  if (parts.showHelp) {
    const { helpX, circleCx } = parts;
    const m = ctx.measureText('?');
    const ascent = m.actualBoundingBoxAscent ?? 8;
    const descent = m.actualBoundingBoxDescent ?? 2;
    const circleCy = baselineY + (descent - ascent) / 2;
    ctx.beginPath();
    ctx.arc(circleCx, circleCy, HUD_DOF_HELP_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillText('?', helpX, baselineY);
  }

  // Cursor coords (stay clear of widened DOF badge)
  if (cursorWorld) {
    const coordText = `(${cursorWorld.x.toFixed(1)}, ${cursorWorld.y.toFixed(1)})`;
    const coordX = Math.max(90, 8 + badgeW + 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(coordText, coordX, canvasHeight - 10);
  }

}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  color: string, lineWidth: number, zoom: number,
  dashed: boolean,
) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1 / zoom) return;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / zoom;
  if (dashed) ctx.setLineDash([5 / zoom, 3 / zoom]);
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);

  // Arrowhead
  const headLen = 10 / zoom;
  const angle = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - 0.4), toY - headLen * Math.sin(angle - 0.4));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle + 0.4), toY - headLen * Math.sin(angle + 0.4));
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / zoom;
  ctx.stroke();
}

/** Draw all force vectors from the solver (gravity + drag) */
export function drawForceVectors(
  ctx: CanvasRenderingContext2D,
  vectors: ForceVector[],
  zoom: number,
  showForceUnits: boolean = false,
) {
  for (const v of vectors) {
    const toX = v.origin.x + v.force.x;
    const toY = v.origin.y + v.force.y;
    const lineWidth = v.color === '#42A5F5' ? 1.5 : 2.5;
    drawArrow(ctx, v.origin.x, v.origin.y, toX, toY, v.color, lineWidth, zoom, false);

    // Small dot at origin
    ctx.beginPath();
    ctx.arc(v.origin.x, v.origin.y, 3 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = v.color;
    ctx.fill();

    // Force magnitude label
    if (showForceUnits) {
      const mag = Math.sqrt(v.force.x * v.force.x + v.force.y * v.force.y);
      if (mag > 0.1) {
        const label = mag >= 1000 ? `${(mag / 1000).toFixed(1)} kN` : `${mag.toFixed(1)} N`;
        const midX = v.origin.x + v.force.x * 0.5;
        const midY = v.origin.y + v.force.y * 0.5;
        // Offset label perpendicular to force direction
        const nx = -v.force.y / mag;
        const ny = v.force.x / mag;
        const offsetDist = 12 / zoom;
        ctx.font = `bold ${10 / zoom}px monospace`;
        ctx.fillStyle = v.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX + nx * offsetDist, midY + ny * offsetDist);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `${6.5 / zoom}px monospace`;
        ctx.fillStyle = 'rgba(28, 28, 28, 0.88)';
        ctx.globalAlpha = 1;
        ctx.fillText(FORCE_READOUT_LABEL_HINT_SHORT, midX + nx * offsetDist, midY + ny * offsetDist + (7 / zoom));
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }
}

/** Draw CoM markers and gravity vectors for bodies with useOutlineCOM enabled. */
export function drawCOMMarkers(
  ctx: CanvasRenderingContext2D,
  comPositions: { pos: Vec2; color: string; gravityForce: Vec2 | null }[],
  zoom: number,
) {
  for (const { pos, color, gravityForce } of comPositions) {
    // Diamond marker at COM
    const s = 6 / zoom;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - s);
    ctx.lineTo(pos.x + s, pos.y);
    ctx.lineTo(pos.x, pos.y + s);
    ctx.lineTo(pos.x - s, pos.y);
    ctx.closePath();
    ctx.fillStyle = color + '88';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();

    // Label
    ctx.font = `${9 / zoom}px monospace`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    ctx.fillText('CoM', pos.x, pos.y - s - 2 / zoom);
    ctx.textAlign = 'left';

    // Gravity vector from COM
    if (gravityForce) {
      const toX = pos.x + gravityForce.x;
      const toY = pos.y + gravityForce.y;
      drawArrow(ctx, pos.x, pos.y, toX, toY, color, 2, zoom, false);
    }
  }
}

/** Draw the user drag interaction (grab point highlight + arrow to cursor) */
export function drawDragInteraction(
  ctx: CanvasRenderingContext2D,
  simDrag: SimDragState,
  grabWorldPos: Vec2,
  zoom: number,
) {
  // Grab point highlight ring
  ctx.beginPath();
  ctx.arc(grabWorldPos.x, grabWorldPos.y, 12 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 152, 0, 0.3)';
  ctx.fill();
  ctx.strokeStyle = '#FF9800';
  ctx.lineWidth = 2.5 / zoom;
  ctx.stroke();

  // Arrow from grab point to cursor
  drawArrow(ctx, grabWorldPos.x, grabWorldPos.y, simDrag.cursorPoint.x, simDrag.cursorPoint.y, '#FF9800', 2.5, zoom, true);

  // Cursor target dot
  ctx.beginPath();
  ctx.arc(simDrag.cursorPoint.x, simDrag.cursorPoint.y, 4 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = '#FF9800';
  ctx.fill();
}

/**
 * Draw the long-press arc body selector around a joint.
 * Circles animate radially from the joint center to their arc positions.
 * Drawn in screen-space (call after resetCamera).
 */
export function drawArcSelector(
  ctx: CanvasRenderingContext2D,
  arcPositions: { screenX: number; screenY: number; centerScreenX: number; centerScreenY: number }[],
  bodyColors: string[],
  bodySelected: boolean[],
  bodyNames: string[],
  showTime: number,
  collapseTime: number | null,
  addButtonPos?: { screenX: number; screenY: number; centerScreenX: number; centerScreenY: number },
  addButtonActive?: boolean,
) {
  const now = Date.now();
  const CIRCLE_RADIUS = 12;
  const ANIM_DURATION = 180; // ms per circle
  const MAX_TOTAL_STAGGER = 400;
  const count = arcPositions.length;
  const STAGGER = count > 1 ? Math.min(50, MAX_TOTAL_STAGGER / (count - 1)) : 50;
  const LABEL_OFFSET = 22; // px beyond circle center
  const LABEL_WIPE_DURATION = 120; // ms for text wipe
  const LABEL_DELAY = 80; // ms delay after circle lands before text starts

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  for (let i = 0; i < arcPositions.length; i++) {
    const { screenX, screenY, centerScreenX, centerScreenY } = arcPositions[i];

    let t: number;
    if (collapseTime !== null) {
      const collapseElapsed = now - collapseTime - i * STAGGER;
      if (collapseElapsed < 0) {
        t = 1;
      } else {
        t = 1 - Math.min(1, collapseElapsed / ANIM_DURATION);
      }
    } else {
      const expandElapsed = now - showTime - i * STAGGER;
      if (expandElapsed < 0) { continue; }
      t = Math.min(1, expandElapsed / ANIM_DURATION);
    }

    if (t <= 0) continue;

    // Ease in-out (cubic)
    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Interpolate position from center to final
    const drawX = centerScreenX + (screenX - centerScreenX) * eased;
    const drawY = centerScreenY + (screenY - centerScreenY) * eased;
    const r = CIRCLE_RADIUS * (0.4 + 0.6 * eased);
    const alpha = eased;

    // Filled circle with body color
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(drawX, drawY, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyColors[i];
    ctx.fill();

    // Selection ring (blue) if joint is in this body
    if (bodySelected[i]) {
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Radial body name label — animated wipe from circle outward
    if (bodyNames[i] && eased > 0.5) {
      // Compute label wipe progress (starts after circle is mostly settled)
      let labelT: number;
      if (collapseTime !== null) {
        // Collapse: text disappears first (reverse wipe)
        const collapseElapsed = now - collapseTime - i * STAGGER;
        labelT = collapseElapsed < 0 ? 1 : 1 - Math.min(1, collapseElapsed / (LABEL_WIPE_DURATION * 0.5));
      } else {
        const expandElapsed = now - showTime - i * STAGGER - ANIM_DURATION * 0.6 - LABEL_DELAY;
        labelT = expandElapsed < 0 ? 0 : Math.min(1, expandElapsed / LABEL_WIPE_DURATION);
      }
      if (labelT <= 0) continue;

      // Radial direction from center to circle
      const rdx = screenX - centerScreenX;
      const rdy = screenY - centerScreenY;
      const rLen = Math.sqrt(rdx * rdx + rdy * rdy);
      if (rLen < 1) continue;
      const nrx = rdx / rLen, nry = rdy / rLen;

      // Label position: beyond the circle along the radial
      const labelX = screenX + nrx * LABEL_OFFSET;
      const labelY = screenY + nry * LABEL_OFFSET;

      // Rotate text to align radially — bottom of text always on the
      // counter-clockwise (left at top) side for consistent reading direction.
      // The radial angle points outward; we rotate 90° CCW from that so
      // the text baseline faces the CCW side.
      const radialAngle = Math.atan2(nry, nrx);
      const textAngle = radialAngle - Math.PI;

      ctx.save();
      ctx.globalAlpha = labelT * alpha;
      ctx.translate(labelX, labelY);
      ctx.rotate(textAngle);

      // Clip to create a wipe effect: reveal text from right to left
      // (since text is right-aligned, it grows from the anchor point leftward)
      const textWidth = 80;
      const clipWidth = textWidth * labelT;
      ctx.beginPath();
      ctx.rect(-clipWidth, -10, clipWidth, 20);
      ctx.clip();

      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#444';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(bodyNames[i], 0, 0);

      ctx.restore();
    }
  }

  // Draw "Add Body" button at the end of the arc (hidden once a body has been created)
  if (addButtonPos && collapseTime === null && !addButtonActive) {
    const addIdx = arcPositions.length; // stagger index
    const expandElapsed = now - showTime - addIdx * STAGGER;
    if (expandElapsed > 0) {
      const addT = Math.min(1, expandElapsed / ANIM_DURATION);
      const addEased = addT < 0.5 ? 4 * addT * addT * addT : 1 - Math.pow(-2 * addT + 2, 3) / 2;
      const addX = addButtonPos.centerScreenX + (addButtonPos.screenX - addButtonPos.centerScreenX) * addEased;
      const addY = addButtonPos.centerScreenY + (addButtonPos.screenY - addButtonPos.centerScreenY) * addEased;
      const addR = CIRCLE_RADIUS * 0.75 * (0.4 + 0.6 * addEased);

      ctx.globalAlpha = addEased * 0.7;
      ctx.beginPath();
      ctx.arc(addX, addY, addR, 0, Math.PI * 2);
      ctx.fillStyle = addButtonActive ? '#4a7a4a' : '#555';
      ctx.fill();
      if (addButtonActive) {
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2.5;
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();

      // Plus icon
      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 1.5;
      const ps = addR * 0.45;
      ctx.beginPath();
      ctx.moveTo(addX - ps, addY);
      ctx.lineTo(addX + ps, addY);
      ctx.moveTo(addX, addY - ps);
      ctx.lineTo(addX, addY + ps);
      ctx.stroke();

      // "Add Body" label
      if (addEased > 0.5) {
        const rdx = addButtonPos.screenX - addButtonPos.centerScreenX;
        const rdy = addButtonPos.screenY - addButtonPos.centerScreenY;
        const rLen = Math.sqrt(rdx * rdx + rdy * rdy);
        if (rLen > 1) {
          const nrx = rdx / rLen, nry = rdy / rLen;
          const lblX = addButtonPos.screenX + nrx * 22;
          const lblY = addButtonPos.screenY + nry * 22;
          const radAngle = Math.atan2(nry, nrx);
          const txtAngle = radAngle - Math.PI;
          ctx.save();
          ctx.globalAlpha = addEased * 0.6;
          ctx.translate(lblX, lblY);
          ctx.rotate(txtAngle);
          ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillStyle = '#888';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText('Add Body', 0, 0);
          ctx.restore();
        }
      }
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Box / lasso marquee while dragging (screen space; call after resetCamera). */
export function drawSelectionGesture(
  ctx: CanvasRenderingContext2D,
  gesture: SelectionGesture | null,
) {
  if (!gesture) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = 'rgba(74, 158, 255, 0.95)';
  ctx.fillStyle = 'rgba(74, 158, 255, 0.14)';
  ctx.lineWidth = 1.25;
  ctx.setLineDash([]);
  if (gesture.type === 'box') {
    const x0 = gesture.screenStart.x;
    const y0 = gesture.screenStart.y;
    const x1 = gesture.screenEnd.x;
    const y1 = gesture.screenEnd.y;
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0);
    const rh = Math.abs(y1 - y0);
    ctx.fillRect(left, top, rw, rh);
    ctx.strokeRect(left, top, rw, rh);
  } else {
    const pts = gesture.screenPoints;
    if (pts.length < 2) {
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Orange ring on link attachment while waiting for second pick (spring tool). */
export function drawSpringLinkPickHighlight(
  ctx: CanvasRenderingContext2D,
  link: Link | undefined,
  t: number,
  joints: Record<string, Joint>,
  zoom: number,
) {
  if (!link) return;
  const j0 = joints[link.jointIds[0]];
  const j1 = joints[link.jointIds[1]];
  if (!j0 || !j1 || j0.hidden || j1.hidden) return;
  const tt = Math.max(0, Math.min(1, t));
  const x = j0.position.x + tt * (j1.position.x - j0.position.x);
  const y = j0.position.y + tt * (j1.position.y - j0.position.y);
  const r = 16 / zoom;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#FF9800';
  ctx.lineWidth = 3 / zoom;
  ctx.setLineDash([5 / zoom, 4 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Orange ring on first joint while waiting for second joint (spring tool, joint pair mode). */
export function drawSpringJointPickHighlight(
  ctx: CanvasRenderingContext2D,
  joint: Joint | undefined,
  zoom: number,
) {
  if (!joint || joint.hidden) return;
  const { x, y } = joint.position;
  const r = 16 / zoom;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#FF9800';
  ctx.lineWidth = 3 / zoom;
  ctx.setLineDash([5 / zoom, 4 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawModeBadge(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  mode: string,
) {
  if (mode !== 'simulate') return;
  ctx.font = 'bold 11px monospace';
  ctx.textBaseline = 'top';
  const text = 'SIMULATE';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = '#FF9800';
  ctx.fillRect(canvasWidth - w - 8, 8, w, 20);
  ctx.fillStyle = '#000';
  ctx.fillText(text, canvasWidth - w - 2, 12);
}

export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw link load coloring: overlay each link with a tension/compression colour
 * and optionally label the force magnitude at the link midpoint.
 */
export function drawLinkLoads(
  ctx: CanvasRenderingContext2D,
  forceAnalysis: ForceAnalysisResult,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  bodies: Record<string, Body>,
  zoom: number,
  baseBodyId: string,
  showForceUnits: boolean = false,
) {
  const { linkForces, maxLinkForce } = forceAnalysis;
  if (maxLinkForce < 1e-6) return;

  for (const link of Object.values(links)) {
    const lf = linkForces.get(link.id);
    if (!lf) continue;

    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (!jA || !jB) continue;
    if (jA.hidden || jB.hidden) continue;

    // Skip base-body-only links (same logic as drawMechanism)
    let hasNonBase = false;
    for (const body of Object.values(bodies)) {
      if (body.id === baseBodyId) continue;
      if (body.jointIds.includes(link.jointIds[0]) && body.jointIds.includes(link.jointIds[1])) {
        hasNonBase = true;
        break;
      }
    }
    if (!hasNonBase) continue;

    const color = forceToColor(lf.axialForce, maxLinkForce);

    // Draw halo/outline behind the link (rendered before mechanism layer)
    ctx.beginPath();
    ctx.moveTo(jA.position.x, jA.position.y);
    ctx.lineTo(jB.position.x, jB.position.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 12 / zoom;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Force magnitude label at midpoint
    if (showForceUnits) {
      const abs = Math.abs(lf.axialForce);
      if (abs > maxLinkForce * 0.01) {
        const midX = (jA.position.x + jB.position.x) / 2;
        const midY = (jA.position.y + jB.position.y) / 2;
        // Pass abs force so it drops the negative sign
        const label = formatForce(abs);
        const prefix = lf.axialForce > 0 ? 'T ' : lf.axialForce < 0 ? 'C ' : '';

        // Offset label perpendicular to link
        const dx = jB.position.x - jA.position.x;
        const dy = jB.position.y - jA.position.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = len > 1e-6 ? -dy / len : 0;
        const ny = len > 1e-6 ? dx / len : 1;
        const offsetDist = 18 / zoom;

        drawBadgeLabel(
          ctx,
          prefix + label,
          midX + nx * offsetDist,
          midY + ny * offsetDist,
          color,
          '#FFFFFF',
          zoom,
          12,
          FORCE_READOUT_LABEL_HINT_SHORT,
        );
      }
    }
  }
}

/**
 * Draw joint reaction force arrows at each joint.
 * Fixed joints show ground reactions; free joints show net constraint forces.
 */
export function drawJointReactions(
  ctx: CanvasRenderingContext2D,
  forceAnalysis: ForceAnalysisResult,
  joints: Record<string, Joint>,
  zoom: number,
  showForceUnits: boolean = false,
) {
  const { jointReactions, maxJointReaction } = forceAnalysis;
  if (maxJointReaction < 1e-6) return;

  const ARROW_SCALE = 0.02;
  const MIN_ARROW_LEN = 8 / zoom;

  for (const [jointId, reaction] of jointReactions) {
    const joint = joints[jointId];
    if (!joint || joint.hidden) continue;

    const fx = reaction.reactionForce.x;
    const fy = reaction.reactionForce.y;
    const mag = reaction.magnitude;
    if (mag < maxJointReaction * 0.01) continue;

    // Scale arrow length: proportional to force, with minimum visibility
    const arrowLen = Math.max(MIN_ARROW_LEN, mag * ARROW_SCALE);
    const ux = fx / mag;
    const uy = fy / mag;

    const fromX = joint.position.x;
    const fromY = joint.position.y;
    const toX = fromX + ux * arrowLen;
    const toY = fromY + uy * arrowLen;

    // Use green for reaction arrows to distinguish from gravity (blue) and drag (orange)
    const arrowColor = joint.type === 'fixed' ? '#4CAF50' : '#AB47BC';

    // Draw arrow line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();

    // Arrowhead
    const headLen = 8 / zoom;
    const angle = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - 0.4), toY - headLen * Math.sin(angle - 0.4));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle + 0.4), toY - headLen * Math.sin(angle + 0.4));
    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();

    // Magnitude label
    if (showForceUnits && mag > maxJointReaction * 0.05) {
      const label = formatForce(mag);
      const labelX = toX + ux * (10 / zoom);
      const labelY = toY + uy * (10 / zoom);
      
      drawBadgeLabel(
        ctx,
        label,
        labelX,
        labelY,
        arrowColor,
        '#FFFFFF',
        zoom,
        11,
        FORCE_READOUT_LABEL_HINT_SHORT,
      );
    }
  }
}

/**
 * Draw force sensor icons on links and mini force-vs-time plots.
 * Shown in both create mode (icon only) and simulate mode (icon + live plot).
 */
export function drawForceSensors(
  ctx: CanvasRenderingContext2D,
  forceSensors: Record<string, ForceSensor>,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  selectedIds: Set<string>,
  zoom: number,
  forceSensorData: Map<string, { time: number; force: number }[]>,
  isSimulating: boolean,
) {
  for (const sensor of Object.values(forceSensors)) {
    if (!sensor.enabled) continue;
    const link = links[sensor.linkId];
    if (!link) continue;
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (!jA || !jB || jA.hidden || jB.hidden) continue;

    const midX = (jA.position.x + jB.position.x) / 2;
    const midY = (jA.position.y + jB.position.y) / 2;
    const isSelected = selectedIds.has(sensor.id);

    // Sensor icon: small diamond on the link midpoint
    const iconSize = 6 / zoom;
    ctx.beginPath();
    ctx.moveTo(midX, midY - iconSize);
    ctx.lineTo(midX + iconSize, midY);
    ctx.lineTo(midX, midY + iconSize);
    ctx.lineTo(midX - iconSize, midY);
    ctx.closePath();
    ctx.fillStyle = isSelected ? '#FF9800' : '#E91E63';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();

    // Mini force-vs-time plot (only during simulation with data)
    const data = forceSensorData.get(sensor.id);
    if (!isSimulating || !data || data.length < 2) continue;

    // Plot dimensions (in world units)
    const plotW = 80 / zoom;
    const plotH = 40 / zoom;
    const plotPad = 4 / zoom;

    // Offset plot perpendicular to link direction
    const dx = jB.position.x - jA.position.x;
    const dy = jB.position.y - jA.position.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = len > 1e-6 ? -dy / len : 0;
    const ny = len > 1e-6 ? dx / len : 1;
    const plotOffsetDist = 30 / zoom;
    const plotCX = midX + nx * plotOffsetDist;
    const plotCY = midY + ny * plotOffsetDist;
    const plotLeft = plotCX - plotW / 2;
    const plotTop = plotCY - plotH / 2;

    // Background panel
    ctx.fillStyle = 'rgba(30, 30, 30, 0.85)';
    ctx.strokeStyle = isSelected ? '#FF9800' : '#555';
    ctx.lineWidth = 1 / zoom;
    const r = 3 / zoom;
    ctx.beginPath();
    ctx.moveTo(plotLeft + r, plotTop);
    ctx.lineTo(plotLeft + plotW - r, plotTop);
    ctx.arcTo(plotLeft + plotW, plotTop, plotLeft + plotW, plotTop + r, r);
    ctx.lineTo(plotLeft + plotW, plotTop + plotH - r);
    ctx.arcTo(plotLeft + plotW, plotTop + plotH, plotLeft + plotW - r, plotTop + plotH, r);
    ctx.lineTo(plotLeft + r, plotTop + plotH);
    ctx.arcTo(plotLeft, plotTop + plotH, plotLeft, plotTop + plotH - r, r);
    ctx.lineTo(plotLeft, plotTop + r);
    ctx.arcTo(plotLeft, plotTop, plotLeft + r, plotTop, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Zero line
    const chartLeft = plotLeft + plotPad;
    const chartRight = plotLeft + plotW - plotPad;
    const chartTop = plotTop + plotPad;
    const chartBottom = plotTop + plotH - plotPad;
    const chartW = chartRight - chartLeft;
    const chartH = chartBottom - chartTop;

    // Find data range
    let maxAbs = 0;
    for (const pt of data) {
      const a = Math.abs(pt.force);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs < 1e-6) maxAbs = 1;

    // Zero line (center of chart)
    const zeroY = chartTop + chartH / 2;
    ctx.beginPath();
    ctx.moveTo(chartLeft, zeroY);
    ctx.lineTo(chartRight, zeroY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 0.5 / zoom;
    ctx.setLineDash([2 / zoom, 2 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Plot the force curve
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const px = chartLeft + (i / (data.length - 1)) * chartW;
      const normalized = data[i].force / maxAbs;
      const py = zeroY - normalized * (chartH / 2) * 0.9;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = '#4FC3F7';
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();

    // Current value label
    const latest = data[data.length - 1];
    const absForce = Math.abs(latest.force);
    const prefix = latest.force > 0.001 ? 'T ' : latest.force < -0.001 ? 'C ' : '';
    const valStr = formatForce(absForce);
    ctx.font = `bold ${8 / zoom}px monospace`;
    ctx.fillStyle = '#4FC3F7';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(prefix + valStr, chartLeft, plotTop + 1 / zoom);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Leader line from icon to plot
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(plotCX, plotCY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.75 / zoom;
    ctx.setLineDash([3 / zoom, 2 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
