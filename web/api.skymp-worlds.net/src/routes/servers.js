'use strict';

const { Router } = require('express');

const router = Router();

/**
 * In-memory server registry.
 * Key: server ID (string)
 * Value: { name, ip, port, players, maxPlayers, lastSeen }
 *
 * TODO (Phase 3): Replace with persistent storage (Redis / SQLite).
 */
const registry = new Map();

/** Servers not seen for more than 60 seconds are considered offline. */
const HEARTBEAT_TIMEOUT_MS = 60_000;

function pruneStaleServers() {
  const now = Date.now();
  for (const [id, server] of registry.entries()) {
    if (now - server.lastSeen > HEARTBEAT_TIMEOUT_MS) {
      registry.delete(id);
    }
  }
}

/**
 * GET /servers/list
 * Returns the list of currently active game servers.
 */
router.get('/list', (_req, res) => {
  pruneStaleServers();
  const servers = Array.from(registry.entries()).map(([id, s]) => ({ id, ...s }));
  res.json(servers);
});

/**
 * POST /servers/announce
 * Called by game servers as a heartbeat to register or update their entry.
 *
 * Expected body:
 * {
 *   "id":         "unique-server-id",   // required
 *   "name":       "My SkyMP Server",    // required
 *   "ip":         "1.2.3.4",            // required
 *   "port":       7777,                 // required
 *   "players":    3,                    // optional, default 0
 *   "maxPlayers": 64                    // optional, default 0
 * }
 */
router.post('/announce', (req, res) => {
  const { id, name, ip, port, players = 0, maxPlayers = 0 } = req.body ?? {};

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Field "id" is required and must be a string.' });
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Field "name" is required and must be a string.' });
  }
  if (!ip || typeof ip !== 'string') {
    return res.status(400).json({ error: 'Field "ip" is required and must be a string.' });
  }
  if (typeof port !== 'number' || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'Field "port" must be a number between 1 and 65535.' });
  }

  registry.set(id, {
    name,
    ip,
    port,
    players: Number(players),
    maxPlayers: Number(maxPlayers),
    lastSeen: Date.now(),
  });

  return res.json({ ok: true });
});

module.exports = router;
