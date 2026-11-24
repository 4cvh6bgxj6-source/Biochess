'use client';

import { Chess } from 'chess.js';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  BOT_DEFINITIONS,
  isTrainingBot,
  TIME_CONTROLS,
  type BotId,
  type Challenge,
  type ChatMessage,
  type ColorPref,
  type GameMove,
  type GameState,
  type GameStatus,
  type PieceColor,
  type PlayerSummary,
  type RecentMatchSummary,
  type TimeControlId,
} from './types';
import {
  chooseBotMove,
  evaluatePlayedMove,
  getBotChatReply,
  getBotGreeting,
  getBotMoveComment,
  getBotQualityReaction,
} from './chess-bot';
import { db, handleFirestoreError, OperationType } from './firebase';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,20}$/;
const VALID_BOT_IDS = new Set<BotId>([
  'knight',
  'bishop',
  'king',
  'master',
  'dummy',
  'alien',
  'gothamchess',
  'mittens',
]);
const RESERVED_USERNAMES = new Set([
  'duolingo',
  'luna',
  'martin',
  'master',
  'bot_cavallo',
  'bot_alfiere',
  'bot_re',
  'coach_alien',
  'coach_gothamchess',
  'coach_mittens',
  'dummy_training',
  'biochess',
  'sistema',
  'system',
  'bot',
]);

function sanitizeCountryCode(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const upper = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : undefined;
}

function sanitizeLangCode(raw: unknown): string {
  if (typeof raw !== 'string') return 'it';
  const cleaned = raw.trim().toLowerCase().slice(0, 16);
  return cleaned.length >= 2 ? cleaned : 'it';
}

export function makeEntityId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function tsToMs(val: unknown): number {
  if (val && typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  return Date.now();
}

export function normalizeUsernameKey(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsernameInput(raw: string): { ok: true; username: string; key: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!USERNAME_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: 'Usa da 2 a 20 caratteri: solo lettere, numeri o underscore (_).',
    };
  }
  const key = trimmed.toLowerCase();
  if (RESERVED_USERNAMES.has(key)) {
    return { ok: false, error: 'Nome riservato. Scegline un altro.' };
  }
  return { ok: true, username: trimmed, key };
}

export interface UserProfileDocData {
  uid: string;
  username: string;
  key: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  online: boolean;
  activeGameId: string;
}

export interface GameDocSnapshot {
  id: string;
  whiteUid: string;
  whiteUsername: string;
  whiteElo: number;
  whiteIsBot: boolean;
  whiteCountry?: string;
  blackUid: string;
  blackUsername: string;
  blackElo: number;
  blackIsBot: boolean;
  blackCountry?: string;
  participantUids: string[];
  fen: string;
  pgn: string;
  turn: PieceColor;
  movesCount: number;
  status: GameStatus;
  winner: PieceColor | 'draw' | '';
  endReason: string;
  timeControl: TimeControlId;
  whiteTimeMs: number;
  blackTimeMs: number;
  drawOfferBy: PieceColor | '';
  rematchRequestedBy: PieceColor | '';
  rematchGameId: string;
  whiteEloApplied: boolean;
  blackEloApplied: boolean;
  isBotGame: boolean;
  botId: BotId | '';
  lastMoveAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

function mapUserDocToSummary(data: Record<string, unknown>): PlayerSummary {
  const activeGameId = typeof data.activeGameId === 'string' ? data.activeGameId : '';
  const online = Boolean(data.online);
  return {
    uid: String(data.uid || ''),
    username: String(data.username || ''),
    elo: typeof data.elo === 'number' ? data.elo : 300,
    wins: typeof data.wins === 'number' ? data.wins : 0,
    losses: typeof data.losses === 'number' ? data.losses : 0,
    draws: typeof data.draws === 'number' ? data.draws : 0,
    status: !online ? 'offline' : activeGameId ? 'in_game' : 'online',
    activeGameId: activeGameId || null,
    lang: typeof data.lang === 'string' ? sanitizeLangCode(data.lang) : undefined,
    country: sanitizeCountryCode(data.country),
  };
}

function mapGameDoc(id: string, data: Record<string, unknown>): GameDocSnapshot {
  const rawBotId = typeof data.botId === 'string' ? (data.botId as BotId) : '';
  const botId: BotId | '' = rawBotId && VALID_BOT_IDS.has(rawBotId) ? rawBotId : '';
  return {
    id,
    whiteUid: String(data.whiteUid || ''),
    whiteUsername: String(data.whiteUsername || ''),
    whiteElo: typeof data.whiteElo === 'number' ? data.whiteElo : 300,
    whiteIsBot: Boolean(data.whiteIsBot),
    whiteCountry: sanitizeCountryCode(data.whiteCountry),
    blackUid: String(data.blackUid || ''),
    blackUsername: String(data.blackUsername || ''),
    blackElo: typeof data.blackElo === 'number' ? data.blackElo : 300,
    blackIsBot: Boolean(data.blackIsBot),
    blackCountry: sanitizeCountryCode(data.blackCountry),
    participantUids: Array.isArray(data.participantUids)
      ? data.participantUids.map((u) => String(u))
      : [],
    fen: String(data.fen || START_FEN),
    pgn: String(data.pgn || ''),
    turn: data.turn === 'b' ? 'b' : 'w',
    movesCount: typeof data.movesCount === 'number' ? data.movesCount : 0,
    status: (data.status as GameStatus) || 'active',
    winner:
      data.winner === 'w' || data.winner === 'b' || data.winner === 'draw'
        ? data.winner
        : '',
    endReason: String(data.endReason || ''),
    timeControl: (data.timeControl as TimeControlId) || 'blitz_5_0',
    whiteTimeMs: typeof data.whiteTimeMs === 'number' ? data.whiteTimeMs : 0,
    blackTimeMs: typeof data.blackTimeMs === 'number' ? data.blackTimeMs : 0,
    drawOfferBy: data.drawOfferBy === 'w' || data.drawOfferBy === 'b' ? data.drawOfferBy : '',
    rematchRequestedBy:
      data.rematchRequestedBy === 'w' || data.rematchRequestedBy === 'b'
        ? data.rematchRequestedBy
        : '',
    rematchGameId: String(data.rematchGameId || ''),
    whiteEloApplied: Boolean(data.whiteEloApplied),
    blackEloApplied: Boolean(data.blackEloApplied),
    isBotGame: Boolean(data.isBotGame),
    botId,
    lastMoveAtMs: tsToMs(data.lastMoveAt),
    createdAtMs: tsToMs(data.createdAt),
    updatedAtMs: tsToMs(data.updatedAt),
  };
}

export function assembleGameState(
  docSnap: GameDocSnapshot,
  moves: GameMove[],
  chat: ChatMessage[]
): GameState {
  const botIdVal = docSnap.botId ? (docSnap.botId as BotId) : undefined;
  return {
    id: docSnap.id,
    white: {
      uid: docSnap.whiteUid,
      username: docSnap.whiteUsername,
      elo: docSnap.whiteElo,
      isBot: docSnap.whiteIsBot,
      botId: docSnap.whiteIsBot ? botIdVal : undefined,
      country: docSnap.whiteCountry,
    },
    black: {
      uid: docSnap.blackUid,
      username: docSnap.blackUsername,
      elo: docSnap.blackElo,
      isBot: docSnap.blackIsBot,
      botId: docSnap.blackIsBot ? botIdVal : undefined,
      country: docSnap.blackCountry,
    },
    fen: docSnap.fen,
    pgn: docSnap.pgn,
    turn: docSnap.turn,
    moves,
    status: docSnap.status,
    winner: docSnap.winner === '' ? null : docSnap.winner,
    endReason: docSnap.endReason || undefined,
    timeControl: docSnap.timeControl,
    whiteTimeMs: docSnap.whiteTimeMs,
    blackTimeMs: docSnap.blackTimeMs,
    lastMoveAt: docSnap.lastMoveAtMs,
    createdAt: docSnap.createdAtMs,
    drawOfferBy: docSnap.drawOfferBy === '' ? null : docSnap.drawOfferBy,
    rematchRequestedBy: docSnap.rematchRequestedBy === '' ? null : docSnap.rematchRequestedBy,
    rematchGameId: docSnap.rematchGameId || undefined,
    whiteEloApplied: docSnap.whiteEloApplied,
    blackEloApplied: docSnap.blackEloApplied,
    chat,
    isBotGame: docSnap.isBotGame,
    botId: botIdVal,
  };
}

export async function registerBioChessUsername(
  uid: string,
  rawUsername: string,
  rawLang = 'it',
  rawCountry = 'IT'
): Promise<{ ok: true; profile: PlayerSummary } | { ok: false; error: string }> {
  const v = validateUsernameInput(rawUsername);
  if (!v.ok) return v;

  const lang = sanitizeLangCode(rawLang);
  const country = sanitizeCountryCode(rawCountry) || 'IT';

  const usernamePath = `usernames/${v.key}`;
  try {
    const existingClaim = await getDoc(doc(db, 'usernames', v.key));
    if (existingClaim.exists()) {
      return { ok: false, error: 'Nome già in uso.' };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, usernamePath);
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', v.key), {
      uid,
      username: v.username,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid), {
      uid,
      username: v.username,
      key: v.key,
      elo: 300,
      wins: 0,
      losses: 0,
      draws: 0,
      online: true,
      activeGameId: '',
      lang,
      country,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    return {
      ok: true,
      profile: {
        uid,
        username: v.username,
        elo: 300,
        wins: 0,
        losses: 0,
        draws: 0,
        status: 'online',
        activeGameId: null,
        lang,
        country,
      },
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function updateUserLocale(
  uid: string,
  rawLang: string,
  rawCountry: string
): Promise<void> {
  const path = `users/${uid}`;
  const lang = sanitizeLangCode(rawLang);
  const country = sanitizeCountryCode(rawCountry) || 'IT';
  try {
    await updateDoc(doc(db, 'users', uid), {
      lang,
      country,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setPresence(
  uid: string,
  online: boolean,
  activeGameId?: string
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const payload: Record<string, unknown> = {
      online,
      updatedAt: serverTimestamp(),
    };
    if (activeGameId !== undefined) {
      payload.activeGameId = activeGameId;
    }
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeMyProfile(
  uid: string,
  onProfile: (profile: PlayerSummary | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onProfile(null);
        return;
      }
      onProfile(mapUserDocToSummary(snap.data()));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeOnlinePlayers(
  myUid: string,
  onPlayers: (players: PlayerSummary[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'users'), where('online', '==', true), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => mapUserDocToSummary(d.data()))
        .filter((p) => p.uid !== myUid)
        .sort((a, b) => b.elo - a.elo);
      onPlayers(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeLeaderboard(
  onLeaderboard: (players: PlayerSummary[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'users'),
    where('elo', '>=', 0),
    orderBy('elo', 'desc'),
    limit(12)
  );
  return onSnapshot(
    q,
    (snap) => {
      onLeaderboard(snap.docs.map((d) => mapUserDocToSummary(d.data())));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeRecentMatches(
  onMatches: (matches: RecentMatchSummary[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'recentMatches'),
    where('createdAt', '>', Timestamp.fromMillis(0)),
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: RecentMatchSummary[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          white: String(data.white || ''),
          black: String(data.black || ''),
          winner:
            data.winner === 'w' || data.winner === 'b' || data.winner === 'draw'
              ? data.winner
              : null,
          status: (data.status as GameStatus) || 'draw',
          endReason: String(data.endReason || ''),
          movesCount: typeof data.movesCount === 'number' ? data.movesCount : 0,
          timeControl: (data.timeControl as TimeControlId) || 'blitz_5_0',
          finishedAt: tsToMs(data.createdAt),
          isBotGame: Boolean(data.isBotGame),
        };
      });
      onMatches(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'recentMatches');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeChallenges(
  uid: string,
  onIncoming: (challenges: Challenge[]) => void,
  onOutgoing: (challenges: Challenge[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const qIncoming = query(collection(db, 'challenges'), where('toUid', '==', uid), limit(25));
  const qOutgoing = query(collection(db, 'challenges'), where('fromUid', '==', uid), limit(25));

  const mapDoc = (id: string, data: Record<string, unknown>): Challenge => ({
    id,
    fromUid: String(data.fromUid || ''),
    from: String(data.fromUsername || ''),
    fromElo: typeof data.fromElo === 'number' ? data.fromElo : 300,
    fromCountry: sanitizeCountryCode(data.fromCountry),
    toUid: String(data.toUid || ''),
    to: String(data.toUsername || ''),
    toCountry: sanitizeCountryCode(data.toCountry),
    timeControl: (data.timeControl as TimeControlId) || 'blitz_5_0',
    colorPref: (data.colorPref as ColorPref) || 'random',
    createdAt: tsToMs(data.createdAt),
    expiresAt: typeof data.expiresAtMs === 'number' ? data.expiresAtMs : Date.now() + 300000,
    targetOnline: true,
  });

  const unsub1 = onSnapshot(
    qIncoming,
    (snap) => {
      const now = Date.now();
      const pending = snap.docs
        .filter((d) => {
          const data = d.data();
          const exp = typeof data.expiresAtMs === 'number' ? data.expiresAtMs : now + 1000;
          return data.status === 'pending' && exp > now;
        })
        .map((d) => mapDoc(d.id, d.data()))
        .sort((a, b) => b.createdAt - a.createdAt);
      onIncoming(pending);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'challenges');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsub2 = onSnapshot(
    qOutgoing,
    (snap) => {
      const now = Date.now();
      const pending = snap.docs
        .filter((d) => {
          const data = d.data();
          const exp = typeof data.expiresAtMs === 'number' ? data.expiresAtMs : now + 1000;
          return data.status === 'pending' && exp > now;
        })
        .map((d) => mapDoc(d.id, d.data()))
        .sort((a, b) => b.createdAt - a.createdAt);
      onOutgoing(pending);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'challenges');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}

export function subscribeMyGames(
  uid: string,
  onGamesUpdate: (activeGames: GameDocSnapshot[], unappliedFinished: GameDocSnapshot[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'games'),
    where('participantUids', 'array-contains', uid),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => mapGameDoc(d.id, d.data()));
      const activeGames = docs
        .filter((g) => g.status === 'active')
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);

      const unapplied = docs.filter((g) => {
        if (g.status === 'active') return false;
        const isWhite = !g.whiteIsBot && g.whiteUid === uid;
        const isBlack = !g.blackIsBot && g.blackUid === uid;
        return (isWhite && !g.whiteEloApplied) || (isBlack && !g.blackEloApplied);
      });

      onGamesUpdate(activeGames, unapplied);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'games');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeGameRoom(
  gameId: string,
  onGame: (gameDoc: GameDocSnapshot | null) => void,
  onMoves: (moves: GameMove[]) => void,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const unsubGame = onSnapshot(
    doc(db, 'games', gameId),
    (snap) => {
      if (!snap.exists()) {
        onGame(null);
        return;
      }
      onGame(mapGameDoc(snap.id, snap.data()));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, `games/${gameId}`);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const qMoves = query(collection(db, 'games', gameId, 'moves'), orderBy('ply', 'asc'));
  const unsubMoves = onSnapshot(
    qMoves,
    (snap) => {
      const list: GameMove[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          san: String(data.san || ''),
          from: String(data.from || ''),
          to: String(data.to || ''),
          fen: String(data.fen || ''),
          color: data.color === 'b' ? 'b' : 'w',
          captured: data.captured ? String(data.captured) : undefined,
          promotion: data.promotion ? String(data.promotion) : undefined,
          quality: data.quality as GameMove['quality'],
          cpLoss: typeof data.cpLoss === 'number' ? data.cpLoss : 0,
          timestamp: tsToMs(data.createdAt),
        };
      });
      onMoves(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, `games/${gameId}/moves`);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const qMsgs = query(collection(db, 'games', gameId, 'messages'), orderBy('createdAt', 'asc'));
  const unsubMsgs = onSnapshot(
    qMsgs,
    (snap) => {
      const list: ChatMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          sender: String(data.sender || ''),
          text: String(data.text || ''),
          timestamp: tsToMs(data.createdAt),
          kind:
            data.kind === 'bot' || data.kind === 'system' || data.kind === 'player'
              ? data.kind
              : 'player',
        };
      });
      onMessages(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, `games/${gameId}/messages`);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubGame();
    unsubMoves();
    unsubMsgs();
  };
}

export async function sendChallengeToUser(
  me: PlayerSummary,
  myUid: string,
  targetRawUsername: string,
  timeControl: TimeControlId,
  colorPref: ColorPref
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = targetRawUsername.trim();
  const key = normalizeUsernameKey(trimmed);
  if (!USERNAME_REGEX.test(trimmed)) {
    return { ok: false, error: 'Username avversario non valido.' };
  }
  if (key === normalizeUsernameKey(me.username)) {
    return { ok: false, error: 'Non puoi sfidare te stesso.' };
  }

  let targetUid = '';
  try {
    const claimSnap = await getDoc(doc(db, 'usernames', key));
    if (!claimSnap.exists()) {
      return { ok: false, error: `Giocatore "${trimmed}" non trovato.` };
    }
    targetUid = String(claimSnap.data().uid || '');
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `usernames/${key}`);
  }

  if (!targetUid || targetUid === myUid) {
    return { ok: false, error: 'Non puoi sfidare te stesso.' };
  }

  let targetUsername = trimmed;
  let targetCountry: string | undefined;
  try {
    const userSnap = await getDoc(doc(db, 'users', targetUid));
    if (!userSnap.exists()) {
      return { ok: false, error: `Giocatore "${trimmed}" non disponibile.` };
    }
    const targetData = userSnap.data();
    targetUsername = String(targetData.username || trimmed).slice(0, 20);
    targetCountry = sanitizeCountryCode(targetData.country);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${targetUid}`);
  }

  const fromCountry = sanitizeCountryCode(me.country);
  const challengeId = makeEntityId('ch');
  try {
    const batch = writeBatch(db);
    const challengePayload: Record<string, unknown> = {
      id: challengeId,
      fromUid: myUid,
      fromUsername: me.username.slice(0, 20),
      fromElo: Math.max(0, Math.round(me.elo)),
      toUid: targetUid,
      toUsername: targetUsername,
      timeControl,
      colorPref,
      status: 'pending',
      gameId: '',
      expiresAtMs: Date.now() + 5 * 60 * 1000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (fromCountry) challengePayload.fromCountry = fromCountry;
    if (targetCountry) challengePayload.toCountry = targetCountry;

    batch.set(doc(db, 'challenges', challengeId), challengePayload);
    await batch.commit();
    return { ok: true };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `challenges/${challengeId}`);
  }
}

export async function cancelPendingChallenge(challengeId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'challenges', challengeId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `challenges/${challengeId}`);
  }
}

export async function respondToChallenge(
  challengeId: string,
  accept: boolean,
  myUid: string
): Promise<{ ok: true; gameId?: string } | { ok: false; error: string }> {
  if (!accept) {
    try {
      await updateDoc(doc(db, 'challenges', challengeId), {
        status: 'declined',
        updatedAt: serverTimestamp(),
      });
      return { ok: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `challenges/${challengeId}`);
    }
  }

  let chData: Record<string, unknown>;
  try {
    const chSnap = await getDoc(doc(db, 'challenges', challengeId));
    if (!chSnap.exists() || chSnap.data().status !== 'pending') {
      return { ok: false, error: 'La sfida non è più disponibile.' };
    }
    chData = chSnap.data();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `challenges/${challengeId}`);
  }

  const fromUid = String(chData.fromUid || '');
  const toUid = String(chData.toUid || '');
  const timeControl = (chData.timeControl as TimeControlId) || 'blitz_5_0';
  const colorPref = (chData.colorPref as ColorPref) || 'random';

  let fromProfile: { username: string; elo: number; country?: string };
  let toProfile: { username: string; elo: number; country?: string };
  try {
    const [fromSnap, toSnap] = await Promise.all([
      getDoc(doc(db, 'users', fromUid)),
      getDoc(doc(db, 'users', toUid)),
    ]);
    if (!fromSnap.exists() || !toSnap.exists()) {
      return { ok: false, error: 'Uno dei giocatori non è più disponibile.' };
    }
    const fd = fromSnap.data();
    const td = toSnap.data();
    fromProfile = {
      username: String(fd.username || chData.fromUsername || ''),
      elo: typeof fd.elo === 'number' ? fd.elo : 300,
      country: sanitizeCountryCode(fd.country) || sanitizeCountryCode(chData.fromCountry),
    };
    toProfile = {
      username: String(td.username || chData.toUsername || ''),
      elo: typeof td.elo === 'number' ? td.elo : 300,
      country: sanitizeCountryCode(td.country) || sanitizeCountryCode(chData.toCountry),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${fromUid}`);
  }

  const challengerPlaysWhite =
    colorPref === 'w' ? true : colorPref === 'b' ? false : Math.random() < 0.5;

  const whiteUid = challengerPlaysWhite ? fromUid : toUid;
  const whiteUsername = (challengerPlaysWhite ? fromProfile.username : toProfile.username).slice(0, 32);
  const whiteElo = challengerPlaysWhite ? fromProfile.elo : toProfile.elo;
  const whiteCountry = challengerPlaysWhite ? fromProfile.country : toProfile.country;

  const blackUid = challengerPlaysWhite ? toUid : fromUid;
  const blackUsername = (challengerPlaysWhite ? toProfile.username : fromProfile.username).slice(0, 32);
  const blackElo = challengerPlaysWhite ? toProfile.elo : fromProfile.elo;
  const blackCountry = challengerPlaysWhite ? toProfile.country : fromProfile.country;

  const gameId = makeEntityId('game');
  const tc = TIME_CONTROLS[timeControl];
  const startMsgId = makeEntityId('msg');

  try {
    const batch = writeBatch(db);
    const gamePayload: Record<string, unknown> = {
      id: gameId,
      whiteUid,
      whiteUsername,
      whiteElo: Math.max(0, Math.round(whiteElo)),
      whiteIsBot: false,
      blackUid,
      blackUsername,
      blackElo: Math.max(0, Math.round(blackElo)),
      blackIsBot: false,
      participantUids: [whiteUid, blackUid],
      fen: START_FEN,
      pgn: '',
      turn: 'w',
      movesCount: 0,
      status: 'active',
      winner: '',
      endReason: '',
      timeControl,
      whiteTimeMs: tc.initialMs,
      blackTimeMs: tc.initialMs,
      drawOfferBy: '',
      rematchRequestedBy: '',
      rematchGameId: '',
      whiteEloApplied: false,
      blackEloApplied: false,
      isBotGame: false,
      botId: '',
      lastMoveAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (whiteCountry) gamePayload.whiteCountry = whiteCountry;
    if (blackCountry) gamePayload.blackCountry = blackCountry;

    batch.set(doc(db, 'games', gameId), gamePayload);
    batch.set(doc(db, 'games', gameId, 'messages', startMsgId), {
      id: startMsgId,
      sender: 'BioChess',
      authorUid: myUid,
      text: 'Partita iniziata. Buona sfida!',
      kind: 'system',
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'challenges', challengeId), {
      status: 'accepted',
      gameId,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', myUid), {
      online: true,
      activeGameId: gameId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return { ok: true, gameId };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${gameId}`);
  }
}

export async function createBotGameInFirestore(
  me: PlayerSummary,
  myUid: string,
  botId: BotId,
  timeControl: TimeControlId,
  colorPref: ColorPref
): Promise<string> {
  const bot = BOT_DEFINITIONS[botId];
  const playerPlaysWhite =
    colorPref === 'w' ? true : colorPref === 'b' ? false : Math.random() < 0.5;

  const gameId = makeEntityId('game');
  const tc = TIME_CONTROLS[timeControl];
  const greetMsgId = makeEntityId('msg');

  const myCountry = sanitizeCountryCode(me.country);
  const botCountry = sanitizeCountryCode(bot.country);
  const whiteCountry = playerPlaysWhite ? myCountry : botCountry;
  const blackCountry = playerPlaysWhite ? botCountry : myCountry;

  try {
    const batch = writeBatch(db);
    const gamePayload: Record<string, unknown> = {
      id: gameId,
      whiteUid: playerPlaysWhite ? myUid : 'bot',
      whiteUsername: (playerPlaysWhite ? me.username : bot.name).slice(0, 32),
      whiteElo: playerPlaysWhite ? Math.max(0, Math.round(me.elo)) : bot.elo,
      whiteIsBot: !playerPlaysWhite,
      blackUid: playerPlaysWhite ? 'bot' : myUid,
      blackUsername: (playerPlaysWhite ? bot.name : me.username).slice(0, 32),
      blackElo: playerPlaysWhite ? bot.elo : Math.max(0, Math.round(me.elo)),
      blackIsBot: playerPlaysWhite,
      participantUids: [myUid],
      fen: START_FEN,
      pgn: '',
      turn: 'w',
      movesCount: 0,
      status: 'active',
      winner: '',
      endReason: '',
      timeControl,
      whiteTimeMs: tc.initialMs,
      blackTimeMs: tc.initialMs,
      drawOfferBy: '',
      rematchRequestedBy: '',
      rematchGameId: '',
      whiteEloApplied: false,
      blackEloApplied: false,
      isBotGame: true,
      botId,
      lastMoveAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (whiteCountry) gamePayload.whiteCountry = whiteCountry;
    if (blackCountry) gamePayload.blackCountry = blackCountry;

    batch.set(doc(db, 'games', gameId), gamePayload);
    batch.set(doc(db, 'games', gameId, 'messages', greetMsgId), {
      id: greetMsgId,
      sender: bot.name.slice(0, 32),
      authorUid: myUid,
      text: getBotGreeting(botId, me.username).slice(0, 400),
      kind: 'bot',
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', myUid), {
      online: true,
      activeGameId: gameId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return gameId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `games/${gameId}`);
  }
}

export async function submitMoveToFirestore(params: {
  game: GameState;
  uid: string;
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  liveWhiteMs: number;
  liveBlackMs: number;
  botChatText?: string | null;
}): Promise<{ ok: true; nextStatus: GameStatus; movedColor: PieceColor; captured?: string; inCheck: boolean; quality: GameMove['quality'] } | { ok: false; error: string }> {
  const { game, uid, from, to, promotion, liveWhiteMs, liveBlackMs, botChatText } = params;
  if (game.status !== 'active') {
    return { ok: false, error: 'Partita già conclusa.' };
  }

  const chess = new Chess(game.fen);
  const movingColor = chess.turn();
  const prevMove = game.moves.length > 0 ? game.moves[game.moves.length - 1] : undefined;

  let moveRes;
  try {
    moveRes = chess.move({ from, to, promotion: promotion || 'q' });
  } catch {
    return { ok: false, error: 'Mossa non valida.' };
  }
  if (!moveRes) {
    return { ok: false, error: 'Mossa non valida.' };
  }

  const evalResult = evaluatePlayedMove(
    game.fen,
    from,
    to,
    promotion,
    prevMove ? { to: prevMove.to, captured: prevMove.captured } : undefined
  );

  const tc = TIME_CONTROLS[game.timeControl];
  let nextWhiteMs = Math.max(0, Math.min(86400000, Math.round(liveWhiteMs)));
  let nextBlackMs = Math.max(0, Math.min(86400000, Math.round(liveBlackMs)));
  if (game.timeControl !== 'unlimited' && game.moves.length >= 1) {
    if (movingColor === 'w') {
      nextWhiteMs = Math.min(86400000, nextWhiteMs + tc.incrementMs);
    } else {
      nextBlackMs = Math.min(86400000, nextBlackMs + tc.incrementMs);
    }
  }

  let nextStatus: GameStatus = 'active';
  let nextWinner: PieceColor | 'draw' | '' = '';
  let nextEndReason = '';

  if (chess.isCheckmate()) {
    nextStatus = 'checkmate';
    nextWinner = movingColor;
    nextEndReason =
      movingColor === 'w'
        ? `Scacco matto · Vince ${game.white.username}`
        : `Scacco matto · Vince ${game.black.username}`;
  } else if (chess.isStalemate()) {
    nextStatus = 'stalemate';
    nextWinner = 'draw';
    nextEndReason = 'Patta per stallo';
  } else if (chess.isThreefoldRepetition()) {
    nextStatus = 'draw';
    nextWinner = 'draw';
    nextEndReason = 'Patta per ripetizione di mosse';
  } else if (chess.isInsufficientMaterial()) {
    nextStatus = 'draw';
    nextWinner = 'draw';
    nextEndReason = 'Patta per materiale insufficiente';
  } else if (chess.isDraw()) {
    nextStatus = 'draw';
    nextWinner = 'draw';
    nextEndReason = 'Patta (regola delle 50 mosse)';
  }

  const nextPly = game.moves.length + 1;
  const moveDocId = String(nextPly);

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'games', game.id, 'moves', moveDocId), {
      ply: nextPly,
      san: moveRes.san.slice(0, 16),
      from: moveRes.from,
      to: moveRes.to,
      fen: chess.fen().slice(0, 200),
      color: movingColor,
      captured: moveRes.captured ? String(moveRes.captured).slice(0, 2) : '',
      promotion: moveRes.promotion ? String(moveRes.promotion).slice(0, 2) : '',
      quality: evalResult.quality,
      cpLoss: Math.max(0, Math.min(200000, Math.round(evalResult.cpLoss))),
      authorUid: uid,
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'games', game.id), {
      fen: chess.fen().slice(0, 200),
      pgn: chess.pgn().slice(0, 8000),
      turn: chess.turn(),
      movesCount: nextPly,
      status: nextStatus,
      winner: nextWinner,
      endReason: nextEndReason.slice(0, 200),
      whiteTimeMs: nextWhiteMs,
      blackTimeMs: nextBlackMs,
      drawOfferBy: '',
      lastMoveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (nextStatus !== 'active') {
      batch.set(doc(db, 'recentMatches', game.id), {
        id: game.id,
        white: game.white.username.slice(0, 32),
        black: game.black.username.slice(0, 32),
        winner: nextWinner || 'draw',
        status: nextStatus,
        endReason: nextEndReason.slice(0, 200),
        movesCount: nextPly,
        timeControl: game.timeControl,
        isBotGame: game.isBotGame,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }

    if (botChatText && game.isBotGame && game.botId) {
      const msgId = makeEntityId('msg');
      batch.set(doc(db, 'games', game.id, 'messages', msgId), {
        id: msgId,
        sender: BOT_DEFINITIONS[game.botId].name.slice(0, 32),
        authorUid: uid,
        text: botChatText.slice(0, 400),
        kind: 'bot',
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return {
      ok: true,
      nextStatus,
      movedColor: movingColor,
      captured: moveRes.captured,
      inCheck: chess.inCheck(),
      quality: evalResult.quality,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }
}

export async function runBotTurnInFirestore(params: {
  game: GameState;
  uid: string;
  liveWhiteMs: number;
  liveBlackMs: number;
  humanLastMoveMeta?: { quality: GameMove['quality']; captured?: string; inCheck: boolean };
}): Promise<boolean> {
  const { game, uid, liveWhiteMs, liveBlackMs, humanLastMoveMeta } = params;
  if (game.status !== 'active' || !game.isBotGame || !game.botId || game.botId === 'dummy') {
    return false;
  }

  const botColor: PieceColor = game.white.isBot ? 'w' : 'b';
  if (game.turn !== botColor) return false;

  const botMove = chooseBotMove(game.fen, game.botId);
  if (!botMove) return false;

  let botComment: string | null = null;
  if (humanLastMoveMeta) {
    botComment = getBotQualityReaction(game.botId, humanLastMoveMeta.quality || 'neutral');
    if (!botComment && humanLastMoveMeta.captured === 'q') {
      botComment = getBotMoveComment(game.botId, 'capture_queen');
    } else if (!botComment && humanLastMoveMeta.inCheck && Math.random() < 0.45) {
      botComment = getBotMoveComment(game.botId, 'bot_checked');
    }
  }

  const res = await submitMoveToFirestore({
    game,
    uid,
    from: botMove.from,
    to: botMove.to,
    promotion: (botMove.promotion as 'q' | 'r' | 'b' | 'n' | undefined) || undefined,
    liveWhiteMs,
    liveBlackMs,
    botChatText: botComment,
  });

  if (!res.ok) {
    return false;
  }

  if (res.nextStatus === 'checkmate' && game.botId) {
    const winMsg = getBotMoveComment(game.botId, 'checkmate_win');
    if (winMsg) {
      await sendSystemOrBotChatMessage({
        gameId: game.id,
        uid,
        sender: BOT_DEFINITIONS[game.botId].name,
        text: winMsg,
        kind: 'bot',
      });
    }
  } else if (res.nextStatus === 'active' && game.botId && !botComment) {
    if (res.captured === 'q') {
      const text = getBotMoveComment(game.botId, 'capture_queen');
      if (text) {
        await sendSystemOrBotChatMessage({
          gameId: game.id,
          uid,
          sender: BOT_DEFINITIONS[game.botId].name,
          text,
          kind: 'bot',
        });
      }
    } else if (res.inCheck && Math.random() < 0.35) {
      const text = getBotMoveComment(game.botId, 'check_given');
      if (text) {
        await sendSystemOrBotChatMessage({
          gameId: game.id,
          uid,
          sender: BOT_DEFINITIONS[game.botId].name,
          text,
          kind: 'bot',
        });
      }
    }
  }

  return true;
}

export async function sendSystemOrBotChatMessage(params: {
  gameId: string;
  uid: string;
  sender: string;
  text: string;
  kind: 'player' | 'bot' | 'system';
}): Promise<void> {
  const clean = params.text.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!clean) return;
  const msgId = makeEntityId('msg');
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'games', params.gameId, 'messages', msgId), {
      id: msgId,
      sender: params.sender.slice(0, 32),
      authorUid: params.uid,
      text: clean,
      kind: params.kind,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `games/${params.gameId}/messages/${msgId}`);
  }
}

export async function sendPlayerChatAndMaybeBotReply(
  game: GameState,
  uid: string,
  myUsername: string,
  rawText: string
): Promise<void> {
  const clean = rawText.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!clean) return;

  await sendSystemOrBotChatMessage({
    gameId: game.id,
    uid,
    sender: myUsername,
    text: clean,
    kind: 'player',
  });

  if (game.isBotGame && game.botId) {
    const botId = game.botId;
    const botColor: PieceColor = game.white.isBot ? 'w' : 'b';
    const replyText = getBotChatReply(botId, clean, game.fen, botColor, game.moves.length);
    setTimeout(() => {
      void sendSystemOrBotChatMessage({
        gameId: game.id,
        uid,
        sender: BOT_DEFINITIONS[botId].name,
        text: replyText,
        kind: 'bot',
      });
    }, 350);
  }
}

export async function resignGameInFirestore(
  game: GameState,
  myColor: PieceColor,
  myUsername: string,
  uid: string
): Promise<void> {
  if (game.status !== 'active') return;
  const winner: PieceColor = myColor === 'w' ? 'b' : 'w';
  const endReason = `${myUsername} ha abbandonato la partita.`.slice(0, 200);
  const msgId = makeEntityId('msg');

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'games', game.id), {
      status: 'resigned',
      winner,
      endReason,
      drawOfferBy: '',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'recentMatches', game.id), {
      id: game.id,
      white: game.white.username.slice(0, 32),
      black: game.black.username.slice(0, 32),
      winner,
      status: 'resigned',
      endReason,
      movesCount: game.moves.length,
      timeControl: game.timeControl,
      isBotGame: game.isBotGame,
      authorUid: uid,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'games', game.id, 'messages', msgId), {
      id: msgId,
      sender: 'BioChess',
      authorUid: uid,
      text: endReason,
      kind: 'system',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }
}

export async function claimTimeoutInFirestore(
  game: GameState,
  timedOutColor: PieceColor,
  uid: string
): Promise<void> {
  if (game.status !== 'active' || game.timeControl === 'unlimited' || game.moves.length < 1) {
    return;
  }
  const winner: PieceColor = timedOutColor === 'w' ? 'b' : 'w';
  const loserName = timedOutColor === 'w' ? game.white.username : game.black.username;
  const endReason = `Tempo scaduto per ${loserName}.`.slice(0, 200);
  const msgId = makeEntityId('msg');

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'games', game.id), {
      status: 'timeout',
      winner,
      endReason,
      whiteTimeMs: timedOutColor === 'w' ? 0 : Math.max(0, Math.round(game.whiteTimeMs)),
      blackTimeMs: timedOutColor === 'b' ? 0 : Math.max(0, Math.round(game.blackTimeMs)),
      drawOfferBy: '',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'recentMatches', game.id), {
      id: game.id,
      white: game.white.username.slice(0, 32),
      black: game.black.username.slice(0, 32),
      winner,
      status: 'timeout',
      endReason,
      movesCount: game.moves.length,
      timeControl: game.timeControl,
      isBotGame: game.isBotGame,
      authorUid: uid,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'games', game.id, 'messages', msgId), {
      id: msgId,
      sender: 'BioChess',
      authorUid: uid,
      text: endReason,
      kind: 'system',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }
}

export async function offerDrawInFirestore(
  game: GameState,
  myColor: PieceColor,
  myUsername: string,
  uid: string
): Promise<void> {
  if (game.status !== 'active' || game.drawOfferBy === myColor) return;
  const msgId = makeEntityId('msg');

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'games', game.id), {
      drawOfferBy: myColor,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'games', game.id, 'messages', msgId), {
      id: msgId,
      sender: 'BioChess',
      authorUid: uid,
      text: `${myUsername} propone la patta.`,
      kind: 'system',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }

  if (game.isBotGame && game.botId) {
    const botId = game.botId;
    const chess = new Chess(game.fen);
    const botAccepts =
      botId === 'dummy' || (game.moves.length >= 24 && !chess.inCheck() && botId === 'knight');
    setTimeout(() => {
      void respondDrawInFirestore(
        { ...game, drawOfferBy: myColor },
        botAccepts,
        BOT_DEFINITIONS[botId].name,
        uid
      );
    }, 380);
  }
}

export async function respondDrawInFirestore(
  game: GameState,
  accept: boolean,
  responderName: string,
  uid: string
): Promise<void> {
  if (game.status !== 'active' || !game.drawOfferBy) return;
  const msgId = makeEntityId('msg');

  try {
    const batch = writeBatch(db);
    if (accept) {
      const endReason = 'Patta concordata.';
      batch.update(doc(db, 'games', game.id), {
        status: 'draw',
        winner: 'draw',
        endReason,
        drawOfferBy: '',
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'recentMatches', game.id), {
        id: game.id,
        white: game.white.username.slice(0, 32),
        black: game.black.username.slice(0, 32),
        winner: 'draw',
        status: 'draw',
        endReason,
        movesCount: game.moves.length,
        timeControl: game.timeControl,
        isBotGame: game.isBotGame,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'games', game.id, 'messages', msgId), {
        id: msgId,
        sender: game.isBotGame ? responderName.slice(0, 32) : 'BioChess',
        authorUid: uid,
        text: game.isBotGame
          ? 'Va bene, accettiamo la patta! Bella partita.'
          : 'Patta accettata.',
        kind: game.isBotGame ? 'bot' : 'system',
        createdAt: serverTimestamp(),
      });
    } else {
      batch.update(doc(db, 'games', game.id), {
        drawOfferBy: '',
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'games', game.id, 'messages', msgId), {
        id: msgId,
        sender: game.isBotGame ? responderName.slice(0, 32) : 'BioChess',
        authorUid: uid,
        text: game.isBotGame
          ? 'Continuiamo a giocare, c’è ancora molto sulla scacchiera.'
          : `${responderName} ha rifiutato la patta.`,
        kind: game.isBotGame ? 'bot' : 'system',
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }
}

export async function requestOrAcceptRematchInFirestore(
  game: GameState,
  myColor: PieceColor,
  uid: string
): Promise<string | null> {
  if (game.status === 'active') return null;

  // Bot game or PvP opponent already requested -> create new game with swapped colors
  const shouldCreateNow =
    game.isBotGame || (game.rematchRequestedBy !== null && game.rematchRequestedBy !== myColor);

  if (!shouldCreateNow) {
    if (game.rematchRequestedBy === myColor) return null;
    try {
      await updateDoc(doc(db, 'games', game.id), {
        rematchRequestedBy: myColor,
        updatedAt: serverTimestamp(),
      });
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `games/${game.id}`);
    }
  }

  const newGameId = makeEntityId('game');
  const tc = TIME_CONTROLS[game.timeControl];
  const msgId = makeEntityId('msg');

  // Swap colors from previous game
  const nextWhite = game.black;
  const nextBlack = game.white;
  const participantUids = [nextWhite.uid, nextBlack.uid].filter(
    (u): u is string => Boolean(u && u !== 'bot')
  );

  const nextWhiteCountry = sanitizeCountryCode(nextWhite.country);
  const nextBlackCountry = sanitizeCountryCode(nextBlack.country);

  try {
    const batch = writeBatch(db);
    const rematchPayload: Record<string, unknown> = {
      id: newGameId,
      whiteUid: nextWhite.isBot ? 'bot' : String(nextWhite.uid || ''),
      whiteUsername: nextWhite.username.slice(0, 32),
      whiteElo: Math.max(0, Math.round(nextWhite.elo)),
      whiteIsBot: nextWhite.isBot,
      blackUid: nextBlack.isBot ? 'bot' : String(nextBlack.uid || ''),
      blackUsername: nextBlack.username.slice(0, 32),
      blackElo: Math.max(0, Math.round(nextBlack.elo)),
      blackIsBot: nextBlack.isBot,
      participantUids,
      fen: START_FEN,
      pgn: '',
      turn: 'w',
      movesCount: 0,
      status: 'active',
      winner: '',
      endReason: '',
      timeControl: game.timeControl,
      whiteTimeMs: tc.initialMs,
      blackTimeMs: tc.initialMs,
      drawOfferBy: '',
      rematchRequestedBy: '',
      rematchGameId: '',
      whiteEloApplied: false,
      blackEloApplied: false,
      isBotGame: game.isBotGame,
      botId: game.botId || '',
      lastMoveAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (nextWhiteCountry) rematchPayload.whiteCountry = nextWhiteCountry;
    if (nextBlackCountry) rematchPayload.blackCountry = nextBlackCountry;

    batch.set(doc(db, 'games', newGameId), rematchPayload);
    batch.set(doc(db, 'games', newGameId, 'messages', msgId), {
      id: msgId,
      sender: game.isBotGame && game.botId ? BOT_DEFINITIONS[game.botId].name : 'BioChess',
      authorUid: uid,
      text:
        game.isBotGame && game.botId
          ? getBotGreeting(game.botId, nextWhite.isBot ? nextBlack.username : nextWhite.username)
          : 'Rivincita iniziata!',
      kind: game.isBotGame ? 'bot' : 'system',
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'games', game.id), {
      rematchRequestedBy: '',
      rematchGameId: newGameId,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', uid), {
      online: true,
      activeGameId: newGameId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return newGameId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${newGameId}`);
  }
}

export async function settleMyEloForGame(uid: string, gameDoc: GameDocSnapshot): Promise<void> {
  if (gameDoc.status === 'active') return;
  const isWhite = !gameDoc.whiteIsBot && gameDoc.whiteUid === uid;
  const isBlack = !gameDoc.blackIsBot && gameDoc.blackUid === uid;
  if (!isWhite && !isBlack) return;
  if ((isWhite && gameDoc.whiteEloApplied) || (isBlack && gameDoc.blackEloApplied)) return;

  try {
    const [userSnap, latestGameSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, 'games', gameDoc.id)),
    ]);
    if (!userSnap.exists() || !latestGameSnap.exists()) return;
    const latestGame = mapGameDoc(latestGameSnap.id, latestGameSnap.data());
    if (latestGame.status === 'active') return;
    if ((isWhite && latestGame.whiteEloApplied) || (isBlack && latestGame.blackEloApplied)) return;

    const batch = writeBatch(db);

    // Training games against Coaches or Dummy do NOT affect ranked ELO or W/L/D stats
    if (latestGame.isBotGame && isTrainingBot(latestGame.botId)) {
      batch.update(doc(db, 'users', uid), {
        online: true,
        activeGameId: '',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'games', gameDoc.id), {
        [isWhite ? 'whiteEloApplied' : 'blackEloApplied']: true,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return;
    }

    const u = userSnap.data();
    const curElo = typeof u.elo === 'number' ? u.elo : 300;
    const curWins = typeof u.wins === 'number' ? u.wins : 0;
    const curLosses = typeof u.losses === 'number' ? u.losses : 0;
    const curDraws = typeof u.draws === 'number' ? u.draws : 0;

    const myColor: PieceColor = isWhite ? 'w' : 'b';
    let nextElo = curElo;
    let nextWins = curWins;
    let nextLosses = curLosses;
    let nextDraws = curDraws;

    if (latestGame.winner === 'draw' || latestGame.winner === '') {
      nextDraws += 1;
    } else if (latestGame.winner === myColor) {
      nextWins += 1;
      nextElo = curElo + 50;
    } else {
      nextLosses += 1;
      nextElo = Math.max(0, curElo - 76);
    }

    batch.update(doc(db, 'users', uid), {
      elo: nextElo,
      wins: nextWins,
      losses: nextLosses,
      draws: nextDraws,
      activeGameId: '',
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'games', gameDoc.id), {
      [isWhite ? 'whiteEloApplied' : 'blackEloApplied']: true,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}
