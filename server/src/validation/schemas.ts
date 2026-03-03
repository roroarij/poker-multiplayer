import type { ApplyActionInput } from '../engine/types.js';
import type { TableSettings } from '@poker/shared';

function ensureObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function ensureString(value: unknown, label: string, min = 1, max = 64): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new Error(`${label} must be ${min}-${max} chars`);
  return trimmed;
}

function ensureInt(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  if (value < min || value > max) throw new Error(`${label} must be ${min}-${max}`);
  return value;
}

function ensureBool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function parseBlindSchedule(value: unknown): TableSettings['blindSchedule'] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('blindSchedule must be a non-empty array');
  return value.map((entry, index) => {
    const obj = ensureObject(entry, `blindSchedule[${index}]`);
    const sb = ensureInt(obj.sb, `blindSchedule[${index}].sb`, 1, 100000);
    const bb = ensureInt(obj.bb, `blindSchedule[${index}].bb`, 2, 100000);
    if (bb <= sb) throw new Error(`blindSchedule[${index}].bb must be greater than sb`);
    return { sb, bb };
  });
}

export function parseCreateRoomInput(raw: unknown): { nickname: string; settings?: Partial<TableSettings> } {
  const obj = ensureObject(raw, 'create room payload');
  const nickname = ensureString(obj.nickname, 'nickname', 1, 20);
  const settings = obj.settings !== undefined ? parseSettingsPatch(obj.settings) : undefined;
  return { nickname, settings };
}

export function parseJoinRoomInput(raw: unknown): { roomId: string; nickname: string; sessionToken?: string } {
  const obj = ensureObject(raw, 'join room payload');
  const roomId = ensureString(obj.roomId, 'roomId', 4, 12).toUpperCase();
  const nickname = ensureString(obj.nickname, 'nickname', 1, 20);
  const sessionToken = obj.sessionToken === undefined ? undefined : ensureString(obj.sessionToken, 'sessionToken', 8, 64);
  return { roomId, nickname, sessionToken };
}

export function parseRoomId(raw: unknown): string {
  return ensureString(raw, 'roomId', 4, 12).toUpperCase();
}

export function parseKickPayload(raw: unknown): { roomId: string; targetPlayerId: string } {
  const obj = ensureObject(raw, 'kick payload');
  return {
    roomId: ensureString(obj.roomId, 'roomId', 4, 12).toUpperCase(),
    targetPlayerId: ensureString(obj.targetPlayerId, 'targetPlayerId', 4, 64),
  };
}

export function parseUpdateSettingsPayload(raw: unknown): { roomId: string; settings: Partial<TableSettings> } {
  const obj = ensureObject(raw, 'update settings payload');
  return {
    roomId: ensureString(obj.roomId, 'roomId', 4, 12).toUpperCase(),
    settings: parseSettingsPatch(obj.settings),
  };
}

export function parseRoomActionPayload(raw: unknown): { roomId: string } {
  const obj = ensureObject(raw, 'room action payload');
  return { roomId: ensureString(obj.roomId, 'roomId', 4, 12).toUpperCase() };
}

export function parseGameActionPayload(raw: unknown): { roomId: string; action: ApplyActionInput } {
  const obj = ensureObject(raw, 'game action payload');
  const roomId = ensureString(obj.roomId, 'roomId', 4, 12).toUpperCase();
  const action = parseGameAction(obj.action);
  return { roomId, action };
}

function parseSettingsPatch(raw: unknown): Partial<TableSettings> {
  const obj = ensureObject(raw, 'settings patch');
  const settings: Partial<TableSettings> = {};

  if (obj.roomName !== undefined) settings.roomName = ensureString(obj.roomName, 'roomName', 1, 40);
  if (obj.visibility !== undefined) {
    if (obj.visibility !== 'public' && obj.visibility !== 'unlisted') throw new Error('visibility must be public|unlisted');
    settings.visibility = obj.visibility;
  }
  if (obj.maxSeats !== undefined) settings.maxSeats = ensureInt(obj.maxSeats, 'maxSeats', 2, 9);
  if (obj.startingStack !== undefined) settings.startingStack = ensureInt(obj.startingStack, 'startingStack', 100, 100000);
  if (obj.smallBlind !== undefined) settings.smallBlind = ensureInt(obj.smallBlind, 'smallBlind', 1, 100000);
  if (obj.bigBlind !== undefined) settings.bigBlind = ensureInt(obj.bigBlind, 'bigBlind', 2, 100000);
  if (obj.minPlayersToStart !== undefined) settings.minPlayersToStart = ensureInt(obj.minPlayersToStart, 'minPlayersToStart', 2, 9);
  if (obj.turnTimeoutSeconds !== undefined) settings.turnTimeoutSeconds = ensureInt(obj.turnTimeoutSeconds, 'turnTimeoutSeconds', 10, 120);
  if (obj.allowRebuy !== undefined) settings.allowRebuy = ensureBool(obj.allowRebuy, 'allowRebuy');
  if (obj.rebuyStack !== undefined) settings.rebuyStack = ensureInt(obj.rebuyStack, 'rebuyStack', 100, 100000);
  if (obj.rebuyWindowSeconds !== undefined) settings.rebuyWindowSeconds = ensureInt(obj.rebuyWindowSeconds, 'rebuyWindowSeconds', 10, 600);
  if (obj.maxRebuysPerPlayer !== undefined) {
    if (obj.maxRebuysPerPlayer === null) {
      settings.maxRebuysPerPlayer = null;
    } else {
      settings.maxRebuysPerPlayer = ensureInt(obj.maxRebuysPerPlayer, 'maxRebuysPerPlayer', 0, 20);
    }
  }
  if (obj.blindLevelsEnabled !== undefined) settings.blindLevelsEnabled = ensureBool(obj.blindLevelsEnabled, 'blindLevelsEnabled');
  if (obj.blindLevelDurationSeconds !== undefined) settings.blindLevelDurationSeconds = ensureInt(obj.blindLevelDurationSeconds, 'blindLevelDurationSeconds', 30, 3600);
  if (obj.blindSchedule !== undefined) settings.blindSchedule = parseBlindSchedule(obj.blindSchedule);

  return settings;
}

function parseGameAction(raw: unknown): ApplyActionInput {
  const obj = ensureObject(raw, 'action');
  const type = ensureString(obj.type, 'action.type', 1, 16);

  if (type === 'fold' || type === 'check' || type === 'call' || type === 'all_in') {
    return { type };
  }

  if (type === 'bet' || type === 'raise') {
    return {
      type,
      amount: ensureInt(obj.amount, 'action.amount', 1, 1000000),
    };
  }

  throw new Error('Unsupported action type');
}
