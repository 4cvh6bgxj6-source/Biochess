import { NextRequest, NextResponse } from 'next/server';
import type { ClientEvent, ServerEvent } from '@/lib/types';
import {
  broadcastLobbyToAll,
  buildAuthOkEvent,
  getEngine,
  handleAuthenticatedAction,
  processAuthMessage,
  saveStoreNow,
  verifyHttpBearerHeaders,
} from '@/lib/game-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let msg: ClientEvent;
  try {
    msg = (await req.json()) as ClientEvent;
  } catch {
    return NextResponse.json({ events: [] }, { status: 400 });
  }

  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
    return NextResponse.json({ events: [] }, { status: 400 });
  }

  const eng = getEngine();
  const directEvents: ServerEvent[] = [];

  if (
    msg.type === 'auth:register' ||
    msg.type === 'auth:login' ||
    msg.type === 'auth:resume'
  ) {
    const authKey = processAuthMessage(msg, (evt) => directEvents.push(evt));
    if (!authKey) {
      return NextResponse.json({ events: directEvents });
    }

    eng.httpSessionsByUser.set(authKey, { queue: [], lastPollAt: Date.now() });
    saveStoreNow();
    directEvents.push(buildAuthOkEvent(authKey));
    broadcastLobbyToAll();

    const sess = eng.httpSessionsByUser.get(authKey);
    if (sess && sess.queue.length > 0) {
      directEvents.push(...sess.queue.splice(0));
    }
    return NextResponse.json({ events: directEvents });
  }

  const userKey = verifyHttpBearerHeaders(
    req.headers.get('authorization'),
    req.headers.get('x-biochess-user')
  );
  if (!userKey) {
    return NextResponse.json(
      { events: [{ type: 'auth:error', message: 'Sessione scaduta. Accedi di nuovo.' }] },
      { status: 401 }
    );
  }

  const me = eng.store.players[userKey];
  if (msg.type === 'auth:logout') {
    if (me) {
      me.token = '';
      saveStoreNow();
    }
    eng.httpSessionsByUser.delete(userKey);
    broadcastLobbyToAll();
    return NextResponse.json({ events: [] });
  }

  let sess = eng.httpSessionsByUser.get(userKey);
  if (!sess) {
    sess = { queue: [], lastPollAt: Date.now() };
    eng.httpSessionsByUser.set(userKey, sess);
  } else {
    sess.lastPollAt = Date.now();
  }

  handleAuthenticatedAction(userKey, msg, (evt) => directEvents.push(evt), {
    syncBotTurns: true,
  });

  if (sess.queue.length > 0) {
    directEvents.push(...sess.queue.splice(0));
  }

  return NextResponse.json({ events: directEvents });
}
