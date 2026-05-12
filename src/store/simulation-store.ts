import { create } from 'zustand';
import type { Vec2, SolverResult } from '../types';
import { resetForceSmoothing } from '../core/solver/force-analysis';

interface SimulationStore {
  isPlaying: boolean;
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
  /** Force sensor time-series: sensorId → array of { time, force } */
  forceSensorData: Map<string, { time: number; force: number }[]>;
  /** User-visible solver/driver message (invalid driver, bad mechanism, unstable step). */
  stepError: string | null;

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
  recordForceSensorData(sensorId: string, time: number, force: number): void;
  clearTraces(): void;
  toggleTracing(jointId: string): void;
  toggleGravity(): void;
  setGravityStrength(strength: number): void;
  setDamping(d: number): void;
  setDragMultiplier(m: number): void;
  setDragDamping(d: number): void;
  setStepError(msg: string | null): void;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  isPlaying: false,
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
  forceSensorData: new Map(),
  stepError: null,

  play() { set({ isPlaying: true }); },
  pause() { set({ isPlaying: false }); },
  reset() {
    resetForceSmoothing();
    set({
      isPlaying: false,
      time: 0,
      driverAngle: 0,
      pathTraces: new Map(),
      tracerPaths: new Map(),
      forceSensorData: new Map(),
      stepError: null,
    });
  },
  setSpeed(speed) { set({ speed }); },

  setDriver(jointId, linkId, type) {
    set({ driverJointId: jointId, driverLinkId: linkId, driverType: type, stepError: null });
  },

  clearDriver() {
    set({ driverJointId: null, driverLinkId: null, stepError: null });
  },

  setDriverAngle(angle) { set({ driverAngle: angle }); },
  setDof(dof) { set({ dof }); },
  setSolverResult(result) { set({ solverResult: result }); },

  advanceTime(dt) {
    set((s) => ({ time: s.time + dt }));
  },

  recordTrace(jointId, pos) {
    set((s) => {
      const traces = new Map(s.pathTraces);
      const arr = traces.get(jointId) || [];
      traces.set(jointId, [...arr, pos]);
      return { pathTraces: traces };
    });
  },

  recordTracerTrace(tracerId, pos) {
    set((s) => {
      const traces = new Map(s.tracerPaths);
      const arr = traces.get(tracerId) || [];
      traces.set(tracerId, [...arr, pos]);
      return { tracerPaths: traces };
    });
  },

  recordForceSensorData(sensorId, time, force) {
    set((s) => {
      const data = new Map(s.forceSensorData);
      const arr = data.get(sensorId) || [];
      // Limit to 600 data points (~10 seconds at 60fps)
      const next = arr.length >= 600 ? [...arr.slice(1), { time, force }] : [...arr, { time, force }];
      data.set(sensorId, next);
      return { forceSensorData: data };
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
    set({ gravityStrength: strength });
  },

  setDamping(d) {
    set({ damping: d });
  },

  setDragMultiplier(m) {
    set({ dragMultiplier: m });
  },

  setDragDamping(d) {
    set({ dragDamping: d });
  },

  setStepError(msg) {
    set({ stepError: msg });
  },
}));
