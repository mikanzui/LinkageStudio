import type { ForceAnalysisResult, ForceSensor, Joint, Link, Vec2 } from '../types';

export function drawSensors(ctx: CanvasRenderingContext2D, sensors: Record<string, ForceSensor>, links: Record<string, Link>, joints: Record<string, Joint>, zoom: number, selected: ReadonlySet<string>): void {
  ctx.save();
  for (const sensor of Object.values(sensors)) {
    const link = links[sensor.linkId]; if (!link || !sensor.enabled) continue;
    const a = joints[link.jointIds[0]], b = joints[link.jointIds[1]];
    if (!a || !b || a.hidden || b.hidden) continue;
    const x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2, size = 6 / zoom;
    ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = selected.has(sensor.id) ? '#1976d2' : '#bd2875'; ctx.lineWidth = 2 / zoom; ctx.stroke();
  }
  ctx.restore();
}

export function drawLoads(ctx: CanvasRenderingContext2D, analysis: ForceAnalysisResult | undefined, joints: Record<string, Joint>, links: Record<string, Link>, zoom: number, showLinks: boolean, showReactions: boolean, showValues: boolean): void {
  if (!analysis) return;
  ctx.save(); ctx.font = `${10 / zoom}px monospace`; ctx.lineWidth = 3 / zoom;
  const labels: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
  const label = (text: string, p: Vec2) => {
    const width = ctx.measureText(text).width, height = 14 / zoom;
    const box = { minX: p.x - width / 2, maxX: p.x + width / 2, minY: p.y - height, maxY: p.y };
    if (labels.some(b => b.minX < box.maxX && b.maxX > box.minX && b.minY < box.maxY && b.maxY > box.minY)) return;
    labels.push(box); ctx.textAlign = 'center'; ctx.fillText(text, p.x, p.y);
  };
  if (showLinks) for (const load of analysis.linkForces.values()) {
    const link = links[load.linkId], a = link && joints[link.jointIds[0]], b = link && joints[link.jointIds[1]];
    if (!a || !b || a.hidden || b.hidden || load.axialForce === null || Math.abs(load.axialForce) < 1e-8) continue;
    const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y, length = Math.hypot(dx, dy);
    if (length < 1e-10) continue;
    const inset = Math.min(.4, 11 / zoom / length);
    ctx.strokeStyle = load.axialForce > 0 ? '#d13c36' : '#1976d2'; ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(a.position.x + dx * inset, a.position.y + dy * inset); ctx.lineTo(b.position.x - dx * inset, b.position.y - dy * inset); ctx.stroke();
    if (showValues) label(`${load.axialForce > 0 ? 'T' : 'C'} ${Number(Math.abs(load.axialForce).toPrecision(4))} model`, { x: (a.position.x + b.position.x) / 2 - dy / length * 12 / zoom, y: (a.position.y + b.position.y) / 2 + dx / length * 12 / zoom });
  }
  if (showReactions) for (const reaction of analysis.jointReactions.values()) {
    const joint = joints[reaction.jointId];
    if (!joint || joint.hidden || reaction.magnitude < 1e-8 || (reaction.kind === 'support' && !analysis.complete)) continue;
    const unit = { x: reaction.reactionForce.x / reaction.magnitude, y: reaction.reactionForce.y / reaction.magnitude };
    const length = Math.min(70, Math.max(18, reaction.magnitude * .1)) / zoom;
    const tip = { x: joint.position.x + unit.x * length, y: joint.position.y + unit.y * length };
    ctx.strokeStyle = reaction.kind === 'support' ? '#2e8b45' : '#a140a4'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2 / zoom;
    ctx.beginPath(); ctx.moveTo(joint.position.x, joint.position.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - unit.x * 8 / zoom - unit.y * 4 / zoom, tip.y - unit.y * 8 / zoom + unit.x * 4 / zoom);
    ctx.lineTo(tip.x - unit.x * 8 / zoom + unit.y * 4 / zoom, tip.y - unit.y * 8 / zoom - unit.x * 4 / zoom); ctx.closePath(); ctx.fill();
    if (showValues) label(`${Number(reaction.magnitude.toPrecision(4))} model`, { x: tip.x, y: tip.y - 5 / zoom });
  }
  ctx.restore();
}
