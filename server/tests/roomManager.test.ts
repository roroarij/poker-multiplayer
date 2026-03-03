import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../src/rooms/roomManager.js';

function createManager() {
  return new RoomManager(
    {
      minPlayersToStart: 2,
      turnTimeoutSeconds: 30,
      smallBlind: 10,
      bigBlind: 20,
    },
    () => {
      // no-op
    },
    () => {
      // no-op
    },
  );
}

describe('room manager mechanics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-03T12:00:00.000Z'));
  });

  it('advances blind levels on interval', () => {
    const manager = createManager();
    const created = manager.createRoom('Host', {
      blindLevelsEnabled: true,
      blindLevelDurationSeconds: 30,
      blindSchedule: [
        { sb: 10, bb: 20 },
        { sb: 20, bb: 40 },
      ],
    });

    expect(created.ok).toBe(true);
    const hostId = created.playerId!;
    const roomId = created.roomId!;

    const joined = manager.joinRoom(roomId, 'Guest');
    expect(joined.ok).toBe(true);

    const started = manager.startHand(roomId, hostId);
    expect(started.ok).toBe(true);

    const roomBefore = manager.getRoom(roomId)!;
    expect(roomBefore.blindLevels.levelIndex).toBe(0);

    vi.advanceTimersByTime(30000);

    const roomAfter = manager.getRoom(roomId)!;
    expect(roomAfter.blindLevels.levelIndex).toBe(1);
    expect(roomAfter.pendingBlindChange).toEqual({ smallBlind: 20, bigBlind: 40 });
  });

  it('enforces rebuy limits and transitions busted player to sitting_out after window', () => {
    const manager = createManager();
    const created = manager.createRoom('Host', {
      allowRebuy: true,
      rebuyStack: 600,
      rebuyWindowSeconds: 60,
      maxRebuysPerPlayer: 1,
    });

    const roomId = created.roomId!;
    const hostId = created.playerId!;

    const room = manager.getRoom(roomId)!;
    const host = room.state.players.find((player) => player.id === hostId)!;

    host.chips = 0;
    host.status = 'active';
    room.state.tableStatus = 'showdown';

    manager.updateSettings(roomId, hostId, {});

    const afterBust = manager.getRoom(roomId)!;
    const hostAfterBust = afterBust.state.players.find((player) => player.id === hostId)!;
    expect(hostAfterBust.status).toBe('busted');

    const firstRebuy = manager.rebuy(roomId, hostId);
    expect(firstRebuy.ok).toBe(true);

    const afterRebuy = manager.getRoom(roomId)!;
    const hostAfterRebuy = afterRebuy.state.players.find((player) => player.id === hostId)!;
    expect(hostAfterRebuy.chips).toBe(600);
    expect(hostAfterRebuy.status).toBe('active');

    hostAfterRebuy.chips = 0;
    hostAfterRebuy.status = 'active';
    afterRebuy.state.tableStatus = 'showdown';
    manager.updateSettings(roomId, hostId, {});

    const secondRebuy = manager.rebuy(roomId, hostId);
    expect(secondRebuy.ok).toBe(false);

    vi.advanceTimersByTime(61000);
    manager.updateSettings(roomId, hostId, {});

    const afterExpire = manager.getRoom(roomId)!;
    const hostAfterExpire = afterExpire.state.players.find((player) => player.id === hostId)!;
    expect(hostAfterExpire.status).toBe('sitting_out');
  });

  it('supports sit out and sit in actions', () => {
    const manager = createManager();
    const created = manager.createRoom('Host');
    const roomId = created.roomId!;
    const hostId = created.playerId!;

    const sitOut = manager.sitOut(roomId, hostId);
    expect(sitOut.ok).toBe(true);
    expect(manager.getRoom(roomId)!.state.players.find((player) => player.id === hostId)!.status).toBe('sitting_out');

    const sitIn = manager.sitIn(roomId, hostId);
    expect(sitIn.ok).toBe(true);
    expect(manager.getRoom(roomId)!.state.players.find((player) => player.id === hostId)!.status).toBe('active');
  });

  it('allows rebuy after busted window expires by sitting in later', () => {
    const manager = createManager();
    const created = manager.createRoom('Host', {
      allowRebuy: true,
      rebuyStack: 700,
      rebuyWindowSeconds: 20,
      maxRebuysPerPlayer: null,
    });

    const roomId = created.roomId!;
    const hostId = created.playerId!;
    const room = manager.getRoom(roomId)!;
    const host = room.state.players.find((player) => player.id === hostId)!;

    host.chips = 0;
    host.status = 'active';
    room.state.tableStatus = 'showdown';
    manager.updateSettings(roomId, hostId, {});

    vi.advanceTimersByTime(21000);
    manager.updateSettings(roomId, hostId, {});
    expect(manager.getRoom(roomId)!.state.players.find((player) => player.id === hostId)!.status).toBe('sitting_out');

    const sitIn = manager.sitIn(roomId, hostId);
    expect(sitIn.ok).toBe(true);
    const afterSitIn = manager.getRoom(roomId)!.state.players.find((player) => player.id === hostId)!;
    expect(afterSitIn.chips).toBe(700);
    expect(afterSitIn.status).toBe('active');
  });

  it('lists only public rooms in lobby discovery', () => {
    const manager = createManager();
    const publicRoom = manager.createRoom('PublicHost', { visibility: 'public', roomName: 'Public One' });
    const hiddenRoom = manager.createRoom('HiddenHost', { visibility: 'unlisted', roomName: 'Hidden One' });

    expect(publicRoom.ok).toBe(true);
    expect(hiddenRoom.ok).toBe(true);

    const rooms = manager.listPublicRooms();
    expect(rooms.some((room) => room.roomName === 'Public One')).toBe(true);
    expect(rooms.some((room) => room.roomName === 'Hidden One')).toBe(false);
  });
});
