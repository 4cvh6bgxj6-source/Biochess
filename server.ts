import express from 'express';
import { createServer } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import type { ClientEvent } from './lib/types.ts';
import {
  broadcastLobbyToAll,
  buildAuthOkEvent,
  getEngine,
  handleAuthenticatedAction,
  processAuthMessage,
  saveStoreNow,
  scheduleSave,
  sendEvent,
  tickServerClocks,
} from './lib/game-engine.ts';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);

  // Next.js handles all App Router pages and /api/* routes (shared globalThis engine)
  expressApp.all(/.*/, (req, res) => {
    return handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  const nextUpgradeHandler = app.getUpgradeHandler();

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = req.url ? req.url.split('?')[0] : '';
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      nextUpgradeHandler(req, socket, head);
    }
  });

  setInterval(() => {
    tickServerClocks();
  }, 1000);

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: ClientEvent;
      try {
        msg = JSON.parse(raw.toString()) as ClientEvent;
      } catch {
        return;
      }

      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      const eng = getEngine();

      if (
        msg.type === 'auth:register' ||
        msg.type === 'auth:login' ||
        msg.type === 'auth:resume'
      ) {
        const key = processAuthMessage(msg, (evt) => sendEvent(ws, evt));
        if (!key) return;

        const prevUser = eng.userBySocket.get(ws);
        if (prevUser && prevUser !== key) {
          eng.socketsByUser.get(prevUser)?.delete(ws);
          if (eng.socketsByUser.get(prevUser)?.size === 0) {
            eng.socketsByUser.delete(prevUser);
          }
        }

        eng.userBySocket.set(ws, key);
        if (!eng.socketsByUser.has(key)) {
          eng.socketsByUser.set(key, new Set());
        }
        eng.socketsByUser.get(key)!.add(ws);

        scheduleSave();
        sendEvent(ws, buildAuthOkEvent(key));
        broadcastLobbyToAll();
        return;
      }

      const userKey = eng.userBySocket.get(ws);
      if (!userKey || !eng.store.players[userKey]) {
        sendEvent(ws, { type: 'auth:error', message: 'Accedi per continuare.' });
        return;
      }
      const me = eng.store.players[userKey];

      if (msg.type === 'auth:logout') {
        me.token = '';
        saveStoreNow();
        eng.socketsByUser.get(userKey)?.delete(ws);
        if (eng.socketsByUser.get(userKey)?.size === 0) {
          eng.socketsByUser.delete(userKey);
        }
        eng.userBySocket.delete(ws);
        broadcastLobbyToAll();
        return;
      }

      handleAuthenticatedAction(userKey, msg, (evt) => sendEvent(ws, evt));
    });

    ws.on('close', () => {
      const eng = getEngine();
      const userKey = eng.userBySocket.get(ws);
      if (!userKey) return;
      eng.userBySocket.delete(ws);
      const set = eng.socketsByUser.get(userKey);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          eng.socketsByUser.delete(userKey);
          if (eng.store.players[userKey]) {
            eng.store.players[userKey].lastSeenAt = Date.now();
            scheduleSave();
          }
          broadcastLobbyToAll();
        }
      }
    });
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`> BioChess ready on http://0.0.0.0:${port}`);
  });
});
