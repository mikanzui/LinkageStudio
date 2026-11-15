import type { Vec2 } from '../types';

export interface PointerRuntime {
  activePointers: Map<number, Vec2>;
  mode: 'none' | 'pending' | 'interact' | 'pan' | 'pinch';
  lastPinchDist: number | null;
  lastPinchCenter: Vec2 | null;
  touchStartPos: Vec2 | null;
  touchStartPointerId: number | null;
  lastTouchScreen: Vec2 | null;
  penId: number | null;
  mouseId: number | null;
  accepts(id: number, type: string, phase: 'down' | 'move' | 'up' | 'cancel'): boolean;
  reset(): void;
}

export function createPointerRuntime(): PointerRuntime {
  const state: PointerRuntime = {
    activePointers: new Map(), mode: 'none', lastPinchDist: null, lastPinchCenter: null,
    touchStartPos: null, touchStartPointerId: null, lastTouchScreen: null, penId: null, mouseId: null,
    accepts(id, type, phase) {
      if (state.penId !== null) return type === 'pen' && id === state.penId && phase !== 'down';
      if (type === 'pen') return phase === 'down' || (phase === 'move' && state.mode === 'none');
      if (type === 'mouse') {
        if (state.activePointers.size) return false;
        return phase === 'down' || phase === 'move' || state.mouseId === id;
      }
      if (type !== 'touch' || state.mouseId !== null) return false;
      return phase === 'down' || state.activePointers.has(id);
    },
    reset() {
      state.activePointers.clear(); state.mode = 'none'; state.lastPinchDist = null;
      state.lastPinchCenter = null; state.touchStartPos = null; state.touchStartPointerId = null;
      state.lastTouchScreen = null; state.penId = null; state.mouseId = null;
    },
  };
  return state;
}
