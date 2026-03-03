import type { BlindLevel, TableSettings } from '@poker/shared';

export function defaultBlindSchedule(smallBlind: number, bigBlind: number): BlindLevel[] {
  return [
    { sb: smallBlind, bb: bigBlind },
    { sb: smallBlind * 2, bb: bigBlind * 2 },
    { sb: smallBlind * 3, bb: bigBlind * 3 },
    { sb: smallBlind * 5, bb: bigBlind * 5 },
    { sb: smallBlind * 8, bb: bigBlind * 8 },
  ];
}

export function createDefaultTableSettings(input: Partial<TableSettings> = {}): TableSettings {
  const startingStack = Math.max(100, Math.floor(input.startingStack ?? 1000));
  const smallBlind = Math.max(1, Math.floor(input.smallBlind ?? 10));
  const bigBlind = Math.max(smallBlind + 1, Math.floor(input.bigBlind ?? 20));

  return {
    roomName: input.roomName?.trim().slice(0, 40) || 'Poker Room',
    visibility: input.visibility ?? 'unlisted',
    maxSeats: Math.min(9, Math.max(2, Math.floor(input.maxSeats ?? 9))),
    startingStack,
    smallBlind,
    bigBlind,
    minPlayersToStart: Math.min(9, Math.max(2, Math.floor(input.minPlayersToStart ?? 2))),
    turnTimeoutSeconds: Math.max(10, Math.floor(input.turnTimeoutSeconds ?? 30)),
    allowRebuy: input.allowRebuy ?? true,
    rebuyStack: Math.max(100, Math.floor(input.rebuyStack ?? startingStack)),
    rebuyWindowSeconds: Math.max(10, Math.floor(input.rebuyWindowSeconds ?? 60)),
    maxRebuysPerPlayer: input.maxRebuysPerPlayer ?? null,
    blindLevelsEnabled: input.blindLevelsEnabled ?? false,
    blindLevelDurationSeconds: Math.max(30, Math.floor(input.blindLevelDurationSeconds ?? 600)),
    blindSchedule: input.blindSchedule?.length ? input.blindSchedule : defaultBlindSchedule(smallBlind, bigBlind),
  };
}

export function mergeTableSettings(base: TableSettings, patch: Partial<TableSettings>): TableSettings {
  return createDefaultTableSettings({
    ...base,
    ...patch,
    blindSchedule: patch.blindSchedule ?? base.blindSchedule,
  });
}
