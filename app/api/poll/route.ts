import { NextRequest, NextResponse } from 'next/server';
import {
  broadcastLobbyToAll,
  getEngine,
  tickServerClocks,
  verifyHttpBearerHeaders,
} from '@/lib/game-engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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

  tickServerClocks();

  const eng = getEngine();
  let sess = eng.httpSessionsByUser.get(userKey);
  if (!sess) {
    sess = { queue: [], lastPollAt: Date.now() };
    eng.httpSessionsByUser.set(userKey, sess);
    broadcastLobbyToAll();
  } else {
    sess.lastPollAt = Date.now();
  }

  const events = sess.queue.splice(0);
  return NextResponse.json({ events });
}
