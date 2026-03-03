import type { PublicRoomSummary, TableSettings } from '@poker/shared';
import type { EngineState } from '../engine/types.js';

export function toPublicRoomSummary(roomId: string, createdAt: number, settings: TableSettings, state: EngineState): PublicRoomSummary {
  return {
    roomId,
    roomName: settings.roomName,
    smallBlind: state.config.smallBlind,
    bigBlind: state.config.bigBlind,
    playersSeated: state.players.length,
    maxSeats: settings.maxSeats,
    status: state.tableStatus === 'in_hand' ? 'in_hand' : 'waiting',
    createdAt,
  };
}
