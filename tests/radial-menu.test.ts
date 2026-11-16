import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlBounds, radialHit, radialLayout } from '../src/interaction/radial-layout';
import { useMechanismStore as m } from '../src/store/mechanism-store';
import { useEditorStore as e } from '../src/store/editor-store';
import { canAssignBody, chooseRadialBody, currentRadialLayout, openRadialMenu, pickRadialTarget, radialAction, radialSelected, targetExists, targetForId } from '../src/interaction/radial-menu';
import { handleMouseMove, handleMouseUp } from '../src/interaction/tool-manager';
import { snapshotMechanism } from '../src/core/compile-mechanism';
import { computeBodyTransform, localToWorld } from '../src/core/body-transform';
import { drawHUD } from '../src/renderer/draw-overlays';

for (const coarse of [false, true]) for (const count of [0, 1, 2, 3, 4, 5, 6, 7, 20]) {
  test('radial bounds/hits are stable at every edge: ' + coarse + '/' + count, () => {
    for (const [width, height] of [[1440, 900], [404, 800], [212, 480], [800, 180]]) for (const anchor of [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: 0, y: height }, { x: width, y: height }, { x: width / 2, y: height / 2 }]) {
      const layout = radialLayout(anchor, Array.from({ length: count }, (_, i) => 'b' + i), true, width, height, coarse);
      if (layout.variant === 'list') { assert(layout.width <= width - 16); assert(layout.height <= height - 16); continue; }
      for (const control of layout.controls) {
        const bounds = controlBounds(control);
        assert(bounds.left + layout.center.x >= 7.999); assert(bounds.top + layout.center.y >= 7.999);
        assert(bounds.right + layout.center.x <= width - 7.999); assert(bounds.bottom + layout.center.y <= height - 7.999);
        assert.equal(radialHit(layout, { x: layout.center.x + control.x, y: layout.center.y + control.y }), control.key);
        assert(control.height >= (coarse ? 44 : 32));
      }
    }
  });
}
test('body identities cannot collide with delete/add/close action keys', () => {
  const layout = radialLayout({ x: 300, y: 300 }, ['__delete__', '__close__'], true, 800, 800);
  assert(layout.controls.some(c => c.key === 'body:__delete__'));
  assert.equal(layout.controls.filter(c => c.key === '__delete__').length, 1);
});
test('Design DOF and cursor HUD never overlap at narrow widths or long values', () => {
  for (const width of [212, 404, 1024]) for (const dof of [-12, 1, 1234]) {
    const rects: number[][] = [], texts: { text: string; x: number; y: number }[] = [];
    const ctx = { measureText: (text: string) => ({ width: text.length * 7.2 }), fillRect: (...r: number[]) => rects.push(r),
      fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }) } as unknown as CanvasRenderingContext2D;
    drawHUD(ctx, width, 500, dof, { x: -123456.7, y: 987654.3 });
    const badge = rects[0], coords = texts[1];
    assert(coords.x >= badge[0] + badge[2] + 8 || coords.y <= badge[1] - 4);
  }
});
const initialM = m.getState(), initialE = e.getState();
function reset() { m.setState(initialM, true); e.setState(initialE, true); }
test('held single-body assignment can revisit a body and final release wins', () => {
  reset(); e.setState({ camera: { zoom: 1, pan: { x: 0, y: 0 } } });
  const id = m.getState().addTracer('body1', { x: 300, y: 300 });
  const target = { kind: 'tracer' as const, id };
  openRadialMenu(target, { x: 300, y: 300 }, 'hold');
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) } as HTMLCanvasElement;
  const move = (body: string) => {
    const layout = currentRadialLayout(1000, 800), button = layout.controls.find(c => c.key === 'body:' + body)!;
    const event = { clientX: layout.center.x + button.x, clientY: layout.center.y + button.y } as MouseEvent;
    handleMouseMove(event, canvas); return event;
  };
  move('body1'); move('body2'); assert.equal(m.getState().tracers[id].bodyId, 'body2');
  const release = move('body1'); assert.equal(m.getState().tracers[id].bodyId, 'body1');
  move('body2'); handleMouseUp(release, canvas);
  assert.equal(m.getState().tracers[id].bodyId, 'body1'); reset();
});
test('joint membership, Base fix/revolute and undo use existing topology commands', () => {
  reset();
  const id = m.getState().addJoint('revolute', { x: 10, y: 20 }, ['body1']), target = { kind: 'joint' as const, id };
  chooseRadialBody(target, 'base'); assert(radialSelected(target, 'base')); assert.equal(m.getState().joints[id].type, 'fixed');
  m.getState().undo(); assert(!radialSelected(target, 'base'));
  chooseRadialBody(target, 'body2'); assert(radialSelected(target, 'body2')); m.getState().undo(); assert(!radialSelected(target, 'body2'));
  assert(targetExists(target)); assert.equal(targetForId(id)?.kind, 'joint');
});
test('context picking targets visible non-joint objects before previous selection', () => {
  reset(); e.setState({ camera: { zoom: 1, pan: { x: 0, y: 0 } } });
  const previous = m.getState().addJoint('revolute', { x: 10, y: 10 }, ['body1']);
  const tracer = m.getState().addTracer('base', { x: 300, y: 300 });
  e.setState({ selectedIds: new Set([previous]) });
  assert.deepEqual(pickRadialTarget({ x: 300, y: 300 }), { kind: 'tracer', id: tracer });
  const a = m.getState().addJoint('revolute', { x: 400, y: 400 }, ['body1']);
  const b = m.getState().addJoint('revolute', { x: 600, y: 400 }, ['body1']);
  const collider = m.getState().addCollider(a, b); m.getState().addLink(a, b);
  assert.deepEqual(pickRadialTarget({ x: 500, y: 400 }), { kind: 'collider', id: collider });
  m.setState({ images: { image: { id: 'image', bodyId: 'base', src: '', position: { x: 700, y: 600 }, rotation: 0, scale: 1, opacity: 1, visible: true, naturalWidth: 40, naturalHeight: 40 } } });
  assert.deepEqual(pickRadialTarget({ x: 700, y: 600 }), { kind: 'image', id: 'image' });
  assert.equal(pickRadialTarget({ x: 950, y: 750 }), null); assert(m.getState().joints[previous]); reset();
});
test('add-and-assign is one undo and redo operation, including a full history', () => {
  for (const full of [false, true]) {
    reset(); const id = m.getState().addJoint('revolute', { x: 10, y: 20 }, ['body1']);
    if (full) for (let i = 0; i < 60; i++) m.getState().renameBody('body1', 'Name ' + i);
    const before = snapshotMechanism(m.getState()), target = { kind: 'joint' as const, id };
    radialAction(target, '__add_body__');
    const added = Object.values(m.getState().bodies).find(b => !before.bodies[b.id]); assert(added?.jointIds.includes(id));
    const after = snapshotMechanism(m.getState());
    m.getState().undo(); assert.deepEqual(snapshotMechanism(m.getState()), before);
    m.getState().redo(); assert.deepEqual(snapshotMechanism(m.getState()), after);
  }
});
test('delete targets only the requested entity and restores complete graph in one undo', () => {
  reset(); const a = m.getState().addJoint('revolute', { x: 20, y: 20 }, ['body1']), b = m.getState().addJoint('revolute', { x: 100, y: 20 }, ['body2']);
  const before = snapshotMechanism(m.getState());
  e.setState({ selectedIds: new Set([a, b]) }); radialAction({ kind: 'joint', id: a }, '__delete__');
  assert(!m.getState().joints[a]); assert(m.getState().joints[b]); m.getState().undo(); assert.deepEqual(snapshotMechanism(m.getState()), before);
});
test('shape reassignment preserves world geometry and one undo', () => {
  reset(); const a = m.getState().addJoint('revolute', { x: 40, y: 60 }, ['body1']), b = m.getState().addJoint('revolute', { x: 90, y: 60 }, ['body1']);
  assert(a && b); m.getState().addJoint('revolute', { x: 300, y: 200 }, ['body2']);
  const id = m.getState().addOutline('body1', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }]);
  const before = snapshotMechanism(m.getState()), points = before.outlines[id].points.map(p => localToWorld(p, computeBodyTransform(before.bodies.body1, before.joints)));
  chooseRadialBody({ kind: 'outline', id }, 'body2');
  const after = m.getState(), actual = after.outlines[id].points.map(p => localToWorld(p, computeBodyTransform(after.bodies.body2, after.joints)));
  actual.forEach((p, i) => { assert(Math.abs(p.x - points[i].x) < 1e-8); assert(Math.abs(p.y - points[i].y) < 1e-8); });
  m.getState().undo(); assert.deepEqual(snapshotMechanism(m.getState()), before);
});
test('stale targets and simulate mode cannot mutate or open menus', () => {
  reset(); const before = snapshotMechanism(m.getState()); const missing = { kind: 'joint' as const, id: 'missing' };
  radialAction(missing, '__add_body__'); chooseRadialBody(missing, 'body1'); openRadialMenu(missing, { x: 0, y: 0 });
  assert.equal(e.getState().arcSelector, null); assert.deepEqual(snapshotMechanism(m.getState()), before);
  const id = m.getState().addJoint('revolute', { x: 10, y: 20 }, ['body1']), target = { kind: 'joint' as const, id };
  const design = snapshotMechanism(m.getState()); e.setState({ mode: 'simulate' });
  radialAction(target, '__delete__'); chooseRadialBody(target, 'base'); openRadialMenu(target, { x: 10, y: 20 });
  assert.deepEqual(snapshotMechanism(m.getState()), design); assert.equal(e.getState().arcSelector, null);
  assert(!canAssignBody({ kind: 'link', id: 'link' })); reset();
});
