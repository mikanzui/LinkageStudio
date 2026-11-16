import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visualViewportBounds } from '../src/interaction/visual-viewport';
test('visible keyboard viewport retains its offset rather than centering below the keyboard',()=>{assert.deepEqual(visualViewportBounds({height:450,offsetTop:80},1024),{height:450,top:80});});
test('desktop without VisualViewport uses layout height',()=>{assert.deepEqual(visualViewportBounds(null,900),{height:900,top:0});});
test('invalid/oversized viewports remain bounded and finite',()=>{for(const viewport of [{height:NaN,offsetTop:0},{height:0,offsetTop:0},{height:100,offsetTop:-1}])assert.deepEqual(visualViewportBounds(viewport,900),{height:900,top:0});assert.deepEqual(visualViewportBounds({height:2000,offsetTop:2000},900),{height:900,top:0});assert.deepEqual(visualViewportBounds(null,NaN),{height:768,top:0});});
