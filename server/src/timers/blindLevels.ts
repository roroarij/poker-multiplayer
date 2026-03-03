import type { TableSettings } from '@poker/shared';

export interface BlindLevelState {
  levelIndex: number;
  nextLevelAt: number | null;
  startedAt: number | null;
}

export function initialBlindLevelState(): BlindLevelState {
  return {
    levelIndex: 0,
    nextLevelAt: null,
    startedAt: null,
  };
}

export function beginBlindLevels(state: BlindLevelState, settings: TableSettings, now = Date.now()): BlindLevelState {
  if (!settings.blindLevelsEnabled) {
    return { ...state, nextLevelAt: null, startedAt: now };
  }

  return {
    ...state,
    startedAt: now,
    nextLevelAt: now + settings.blindLevelDurationSeconds * 1000,
  };
}

export function advanceBlindLevel(state: BlindLevelState, settings: TableSettings, now = Date.now()): BlindLevelState {
  const nextIndex = Math.min(state.levelIndex + 1, settings.blindSchedule.length - 1);
  return {
    levelIndex: nextIndex,
    startedAt: state.startedAt ?? now,
    nextLevelAt: settings.blindLevelsEnabled ? now + settings.blindLevelDurationSeconds * 1000 : null,
  };
}

export function currentBlindPair(state: BlindLevelState, settings: TableSettings): { sb: number; bb: number } {
  const level = settings.blindSchedule[state.levelIndex];
  if (!level) {
    return { sb: settings.smallBlind, bb: settings.bigBlind };
  }
  return level;
}
