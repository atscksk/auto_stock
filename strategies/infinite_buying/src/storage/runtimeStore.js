import path from 'node:path';
import { readJson, writeJson } from './jsonStore.js';

const DATA_DIR = path.resolve('strategies/infinite_buying/data');

export function runtimePath() {
  return path.join(DATA_DIR, 'runtime.json');
}

export function loadRuntimeState() {
  return readJson(runtimePath(), { lastRuns: {} });
}

export function markStrategyRun(name, timestamp = new Date().toISOString()) {
  const state = loadRuntimeState();
  const nextState = {
    ...state,
    lastRuns: {
      ...(state.lastRuns || {}),
      [name]: timestamp
    }
  };
  writeJson(runtimePath(), nextState);
  return nextState;
}
