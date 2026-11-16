import { create } from 'zustand';
import type { Vec2, SolverResult } from '../types';
import { appendBounded, TRACE_POINT_LIMIT, SENSOR_SAMPLE_LIMIT } from '../core/time-series';

export interface ForceSample { time: number; force: number }

interface SimulationStore {
  forceSensorData: Map<string, ForceSample[]>;
  recordForceSensorData(id: string, time: number, force: number): void;
  isPlaying: boolean;
  stepError: string | null;
  speed: number;
  time: number;
  driverJointId: string | null;
  driverLinkId: string | null;
  driverType: 'motor' | 'slider';
  driverAngle: number;
  dof: number;
  solverResult: SolverResult | null;
  pathTraces: Map<string, Vec2[]>;
  tracerPaths: Map<string, Vec2[]>;
  tracingEnabled: boolean;
  trackedJointIds: Set<string>;
  gravityEnabled: boolean;
  gravityStrength: number;
  damping: number;
  dragMultiplier: number;
  dragDamping: number;

  play(): void;
  pause(): void;
  reset(): void;
  setSpeed(s: number): void;
  setDriver(jointId: string, linkId: string, type: 'motor' | 'slider'): void;
  clearDriver(): void;
  setDriverAngle(angle: number): void;
  setDof(dof: number): void;
  setSolverResult(result: SolverResult | null): void;
  advanceTime(dt: number): void;
  recordTrace(jointId: string, pos: Vec2): void;
  recordTracerTrace(tracerId: string, pos: Vec2): void;
  clearTraces(): void;
  toggleTracing(jointId: string): void;
  toggleGravity(): void;
  setGravityStrength(strength: number): void;
  setDamping(d: number): void;
  setDragMultiplier(m: number): void;
  setDragDamping(d: number): void;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  forceSensorData: new Map(),
  isPlaying: false,
  stepError: null,
  speed: 1,
  time: 0,
  driverJointId: null,
  driverLinkId: null,
  driverType: 'motor',
  driverAngle: 0,
  dof: 0,
  solverResult: null,
  pathTraces: new Map(),
  tracerPaths: new Map(),
  tracingEnabled: false,
  trackedJointIds: new Set(),
  gravityEnabled: false,
  gravityStrength: 250,
  damping: 0.5,
  dragMultiplier: 25,
  dragDamping: 0.25,

  play() { set({ isPlaying: true, stepError: null }); },
  pause() { set({ isPlaying: false }); },
  reset() { set({ isPlaying: false, stepError: null, solverResult: null, time: 0, driverAngle: 0, pathTraces: new Map(), tracerPaths: new Map(), forceSensorData: new Map() }); },
  setSpeed(speed) { if (Number.isFinite(speed) && speed >= .1 && speed <= 5) set({ speed }); },

  setDriver(jointId, linkId, type) {
    set({ driverJointId: jointId, driverLinkId: linkId, driverType: type });
  },

  clearDriver() {
    set({ driverJointId: null, driverLinkId: null });
  },

  setDriverAngle(angle) { set({ driverAngle: angle }); },
  setDof(dof) { set({ dof }); },
  setSolverResult(result) { set({ solverResult: result }); },

  advanceTime(dt) {
    set((s) => ({ time: s.time + dt }));
  },

  recordTrace(jointId, pos) {
    if (![pos.x, pos.y].every(Number.isFinite)) return;
    set((s) => {
      const traces = new Map(s.pathTraces);
      const arr = traces.get(jointId) || [];
      traces.set(jointId, appendBounded(arr, { ...pos }, TRACE_POINT_LIMIT));
      return { pathTraces: traces };
    });
  },

  recordTracerTrace(tracerId, pos) {
    if (![pos.x, pos.y].every(Number.isFinite)) return;
    set((s) => {
      const traces = new Map(s.tracerPaths);
      const arr = traces.get(tracerId) || [];
      traces.set(tracerId, appendBounded(arr, { ...pos }, TRACE_POINT_LIMIT));
      return { tracerPaths: traces };
    });
  },

  recordForceSensorData(id, time, force) {
    if (![time, force].every(Number.isFinite) || time < 0) return;
    set(state => {
      const previous = state.forceSensorData.get(id) ?? [];
      if (previous.length && previous[previous.length - 1].time >= time) return state;
      const forceSensorData = new Map(state.forceSensorData);
      forceSensorData.set(id, appendBounded(previous, { time, force }, SENSOR_SAMPLE_LIMIT));
      return { forceSensorData };
    });
  },

  clearTraces() { set({ pathTraces: new Map(), tracerPaths: new Map(), forceSensorData: new Map() }); },

  toggleTracing(jointId) {
    set((s) => {
      const next = new Set(s.trackedJointIds);
      if (next.has(jointId)) next.delete(jointId);
      else next.add(jointId);
      return { trackedJointIds: next, tracingEnabled: next.size > 0 };
    });
  },

  toggleGravity() {
    set((s) => ({ gravityEnabled: !s.gravityEnabled }));
  },

  setGravityStrength(strength) {
    if (Number.isFinite(strength) && strength >= 0) set({ gravityStrength: strength });
  },

  setDamping(d) {
    if (Number.isFinite(d) && d >= 0 && d <= 1) set({ damping: d });
  },

  setDragMultiplier(m) {
    if (Number.isFinite(m) && m >= 0) set({ dragMultiplier: m });
  },

  setDragDamping(d) {
    if (Number.isFinite(d) && d >= 0 && d <= 1) set({ dragDamping: d });
  },
}));

export function resetRuntimeForDocument(): void {
  useSimulationStore.getState().reset();
  useSimulationStore.setState({ trackedJointIds: new Set(), tracingEnabled: false, driverJointId: null, driverLinkId: null });
}
