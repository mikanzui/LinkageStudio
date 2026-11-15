import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEditorStore as editor } from '../src/store/editor-store';
import { useMechanismStore as mechanism } from '../src/store/mechanism-store';

test('Select, Pan and drawing have distinct state, including return from simulation', () => {
  editor.getState().setMode('create');
  assert.equal(editor.getState().activeTool, 'joint');
  editor.getState().setTool('select');
  assert.equal(editor.getState().activeTool, 'select');
  editor.getState().setCreateTool('slider');
  assert.equal(editor.getState().activeTool, 'joint');
  editor.getState().setTool('pan');
  assert.equal(editor.getState().activeTool, 'pan');
  editor.getState().setMode('simulate');
  assert.equal(editor.getState().activeTool, 'select');
  editor.getState().setMode('create');
  assert.equal(editor.getState().activeTool, 'joint');
});

for (const tool of ['slider', 'collider'] as const) {
  test(`abandoning a partial ${tool} removes only its pending endpoint`, () => {
    mechanism.getState().clearAll();
    editor.getState().setMode('create');
    editor.getState().setCreateTool(tool);
    const a = mechanism.getState().addJoint('revolute', { x: 10, y: 20 });
    const pending = { jointId: a, position: { x: 10, y: 20 } };
    if (tool === 'slider') editor.getState().setSliderPointA(pending);
    else editor.getState().setColliderPointA(pending);
    const body = mechanism.getState().addBody('Unrelated edit');
    editor.getState().setTool('select');
    assert.equal(mechanism.getState().joints[a], undefined);
    assert(mechanism.getState().bodies[body]);
    assert.equal(editor.getState().sliderPointA, null);
    assert.equal(editor.getState().colliderPointA, null);
  });
}

test('panel widths reject nonfinite values and clamp to usable limits', () => {
  for (const side of ['left', 'right'] as const) {
    editor.getState().setPanelWidth(side, 250);
    for (const value of [NaN, Infinity, -Infinity]) editor.getState().setPanelWidth(side, value);
    assert.equal(editor.getState()[`${side}Width`], 250);
    editor.getState().setPanelWidth(side, -1);
    assert.equal(editor.getState()[`${side}Width`], side === 'left' ? 120 : 220);
    editor.getState().setPanelWidth(side, 5000);
    assert.equal(editor.getState()[`${side}Width`], side === 'left' ? 300 : 480);
  }
});
