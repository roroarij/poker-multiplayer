import dotenv from 'dotenv';

dotenv.config();

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: intFromEnv('PORT', 3001),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  minPlayersToStart: intFromEnv('MIN_PLAYERS_TO_START', 2),
  turnTimeoutSeconds: intFromEnv('TURN_TIMEOUT_SECONDS', 30),
  defaultSmallBlind: intFromEnv('DEFAULT_SMALL_BLIND', 10),
  defaultBigBlind: intFromEnv('DEFAULT_BIG_BLIND', 20),
};
