import { NextResponse } from 'next/server';
import { getConnectedUserKeys, getEngine } from '@/lib/game-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const eng = getEngine();
  return NextResponse.json({
    status: 'ok',
    onlinePlayers: getConnectedUserKeys().length,
    activeGames: eng.games.size,
  });
}
