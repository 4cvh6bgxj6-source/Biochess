import { Chess } from 'chess.js';
import type { WebSocket } from 'ws';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import {
  BOT_DEFINITIONS,
  TIME_CONTROLS,
  type BotId,
  type Challenge,
  type ChatMessage,
  type ClientEvent,
  type GameState,
  type MoveQuality,
  type PieceColor,
  type PlayerSummary,
  type RecentMatchSummary,
  type ServerEvent,
  type TimeControlId,
} from './types.ts';
import {
  chooseBotMove,
  evaluatePlayedMove,
  getBotChatReply,
  getBotGreeting,
  getBotMoveComment,
  getBotQualityReaction,
} from './chess-bot.ts';

export interface StoredPlayer {
  username: string;
  key: string;
  passwordHash?: string;
  token: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  lastSeenAt: number;
}

export interface PersistedStore {
  players: Record<string, StoredPlayer>;
  recentMatches: RecentMatchSummary[];
}

export interface HttpSessionEntry {
  queue: ServerEvent[];
  lastPollAt: number;
}

export interface BioChessEngineState {
  store: PersistedStore;
  storePath: string;
  socketsByUser: Map<string, Set<WebSocket>>;
  userBySocket: Map<WebSocket, string>;
  httpSessionsByUser: Map<string, HttpSessionEntry>;
  games: Map<string, GameState>;
  activeGameByUser: Map<string, string>;
  challenges: Map<string, Challenge>;
  botMoveTimers: Map<string, NodeJS.Timeout>;
  saveTimer: NodeJS.Timeout | null;
}

const HTTP_SESSION_TTL_MS = 15_000;

function resolveStorePath(): string {
  const localDir = path.join(process.cwd(), 'data');
  const localFile = path.join(localDir, 'club-store.json');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localFile;
  } catch {
    const tmpFile = path.join(os.tmpdir(), 'biochess-club-store.json');
    try {
      if (!fs.existsSync(tmpFile) && fs.existsSync(localFile)) {
        fs.copyFileSync(localFile, tmpFile);
      }
    } catch {
      // ignore read-only / copy issues
    }
    return tmpFile;
  }
}

function loadStoreFromDisk(storePath: string): PersistedStore {
  try {
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedStore;
      return {
        players: parsed.players || {},
        recentMatches: Array.isArray(parsed.recentMatches) ? parsed.recentMatches : [],
      };
    }
  } catch (err) {
    console.error('Failed to load store:', err);
  }
  return { players: {}, recentMatches: [] };
}

declare global {
  var __biochessEngine: BioChessEngineState | undefined;
}

export function getEngine(): BioChessEngineState {
  if (!globalThis.__biochessEngine) {
    const storePath = resolveStorePath();
    globalThis.__biochessEngine = {
      store: loadStoreFromDisk(storePath),
      storePath,
      socketsByUser: new Map(),
      userBySocket: new Map(),
      httpSessionsByUser: new Map(),
      games: new Map(),
      activeGameByUser: new Map(),
      challenges: new Map(),
      botMoveTimers: new Map(),
      saveTimer: null,
    };
  }
  return globalThis.__biochessEngine;
}

export function saveStoreNow() {
  const eng = getEngine();
  if (eng.saveTimer) {
    clearTimeout(eng.saveTimer);
    eng.saveTimer = null;
  }
  try {
    const dir = path.dirname(eng.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(eng.storePath, JSON.stringify(eng.store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save store:', err);
  }
}

export function scheduleSave() {
  const eng = getEngine();
  if (eng.saveTimer) return;
  eng.saveTimer = setTimeout(() => {
    eng.saveTimer = null;
    saveStoreNow();
  }, 300);
}

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function makeSessionToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hexHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function verifyToken(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function normalizeKey(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{2,20}$/.test(username);
}

export function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 4 && password.length <= 128;
}

export function isReservedName(key: string): boolean {
  return (
    key === 'bot_cavallo' ||
    key === 'bot_alfiere' ||
    key === 'bot_re' ||
    key === 'sistema' ||
    key === 'biochess'
  );
}

export function isHttpSessionAlive(userKey: string): boolean {
  const eng = getEngine();
  const s = eng.httpSessionsByUser.get(userKey);
  if (!s) return false;
  return Date.now() - s.lastPollAt < HTTP_SESSION_TTL_MS;
}

export function isUserOnline(userKey: string): boolean {
  const eng = getEngine();
  return (eng.socketsByUser.get(userKey)?.size || 0) > 0 || isHttpSessionAlive(userKey);
}

export function getConnectedUserKeys(): string[] {
  const eng = getEngine();
  const keys = new Set<string>(eng.socketsByUser.keys());
  for (const key of eng.httpSessionsByUser.keys()) {
    if (isHttpSessionAlive(key)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

export function sendEvent(ws: WebSocket, event: ServerEvent) {
  if (ws.readyState === 1 /* WebSocket.OPEN */) {
    ws.send(JSON.stringify(event));
  }
}

export function sendToUser(userKey: string, event: ServerEvent) {
  const eng = getEngine();
  const set = eng.socketsByUser.get(userKey);
  if (set) {
    for (const ws of set) {
      sendEvent(ws, event);
    }
  }
  const httpSess = eng.httpSessionsByUser.get(userKey);
  if (httpSess) {
    if (event.type === 'clock:sync' || event.type === 'lobby:state') {
      const idx = httpSess.queue.findIndex((e) => e.type === event.type);
      if (idx >= 0) {
        httpSess.queue[idx] = event;
      } else {
        httpSess.queue.push(event);
      }
    } else {
      httpSess.queue.push(event);
    }
    if (httpSess.queue.length > 200) {
      httpSess.queue.shift();
    }
  }
}

export function getPlayerSummary(userKey: string): PlayerSummary | null {
  const eng = getEngine();
  const p = eng.store.players[userKey];
  if (!p) return null;
  const online = isUserOnline(userKey);
  const gameId = eng.activeGameByUser.get(userKey) || null;
  const activeGame = gameId ? eng.games.get(gameId) : null;
  const inGame = Boolean(activeGame && activeGame.status === 'active');

  return {
    username: p.username,
    elo: p.elo,
    wins: p.wins,
    losses: p.losses,
    draws: p.draws,
    status: !online ? 'offline' : inGame ? 'in_game' : 'online',
    activeGameId: inGame ? gameId : null,
  };
}

export function getLobbySnapshotFor(userKey: string) {
  const eng = getEngine();
  const now = Date.now();
  for (const [id, ch] of eng.challenges.entries()) {
    if (ch.expiresAt <= now) {
      eng.challenges.delete(id);
    }
  }

  const onlinePlayers: PlayerSummary[] = [];
  for (const key of getConnectedUserKeys()) {
    if (key === userKey) continue;
    const summary = getPlayerSummary(key);
    if (summary && summary.status !== 'offline') {
      onlinePlayers.push(summary);
    }
  }
  onlinePlayers.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'online' ? -1 : 1;
    return b.elo - a.elo;
  });

  const leaderboard: PlayerSummary[] = Object.keys(eng.store.players)
    .map((k) => getPlayerSummary(k))
    .filter((p): p is PlayerSummary => p !== null)
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins)
    .slice(0, 12);

  const incomingChallenges: Challenge[] = [];
  const outgoingChallenges: Challenge[] = [];
  for (const ch of eng.challenges.values()) {
    const toKey = normalizeKey(ch.to);
    const fromKey = normalizeKey(ch.from);
    if (toKey === userKey) {
      incomingChallenges.push({
        ...ch,
        targetOnline: isUserOnline(toKey),
      });
    } else if (fromKey === userKey) {
      outgoingChallenges.push({
        ...ch,
        targetOnline: isUserOnline(toKey),
      });
    }
  }

  return {
    type: 'lobby:state' as const,
    onlinePlayers,
    leaderboard,
    recentMatches: eng.store.recentMatches.slice(0, 10),
    incomingChallenges,
    outgoingChallenges,
  };
}

export function broadcastLobbyToAll() {
  for (const userKey of getConnectedUserKeys()) {
    sendToUser(userKey, getLobbySnapshotFor(userKey));
  }
}

export function broadcastGame(game: GameState, eventType: 'game:started' | 'game:updated') {
  if (!game.white.isBot) {
    sendToUser(normalizeKey(game.white.username), { type: eventType, game });
  }
  if (!game.black.isBot) {
    sendToUser(normalizeKey(game.black.username), { type: eventType, game });
  }
}

export function broadcastGameChat(game: GameState, message: ChatMessage) {
  const payload: ServerEvent = { type: 'game:chat_message', gameId: game.id, message };
  if (!game.white.isBot) {
    sendToUser(normalizeKey(game.white.username), payload);
  }
  if (!game.black.isBot) {
    sendToUser(normalizeKey(game.black.username), payload);
  }
}

function appendSystemChat(game: GameState, text: string): ChatMessage {
  const msg: ChatMessage = {
    id: makeId('msg'),
    sender: 'Sistema',
    text,
    timestamp: Date.now(),
    kind: 'system',
  };
  game.chat.push(msg);
  if (game.chat.length > 200) {
    game.chat.shift();
  }
  return msg;
}

function appendBotChat(game: GameState, botId: BotId, text: string): ChatMessage {
  const bot = BOT_DEFINITIONS[botId];
  const msg: ChatMessage = {
    id: makeId('msg'),
    sender: bot.name,
    text,
    timestamp: Date.now(),
    kind: 'bot',
  };
  game.chat.push(msg);
  if (game.chat.length > 200) {
    game.chat.shift();
  }
  return msg;
}

function applyFixedEloDelta(currentElo: number, result: 'win' | 'loss' | 'draw'): number {
  if (result === 'win') return currentElo + 50;
  if (result === 'loss') return Math.max(0, currentElo - 76);
  return currentElo;
}

export function finalizeGame(
  game: GameState,
  status: GameState['status'],
  winner: PieceColor | 'draw',
  endReason: string
) {
  if (game.status !== 'active') return;
  const eng = getEngine();
  game.status = status;
  game.winner = winner;
  game.endReason = endReason;
  game.drawOfferBy = null;

  const timer = eng.botMoveTimers.get(game.id);
  if (timer) {
    clearTimeout(timer);
    eng.botMoveTimers.delete(game.id);
  }

  const wKey = normalizeKey(game.white.username);
  const bKey = normalizeKey(game.black.username);

  const wPlayer = !game.white.isBot ? eng.store.players[wKey] : null;
  const bPlayer = !game.black.isBot ? eng.store.players[bKey] : null;

  if (wPlayer) {
    if (winner === 'w') {
      wPlayer.wins += 1;
      wPlayer.elo = applyFixedEloDelta(wPlayer.elo, 'win');
    } else if (winner === 'b') {
      wPlayer.losses += 1;
      wPlayer.elo = applyFixedEloDelta(wPlayer.elo, 'loss');
    } else {
      wPlayer.draws += 1;
    }
  }
  if (bPlayer) {
    if (winner === 'b') {
      bPlayer.wins += 1;
      bPlayer.elo = applyFixedEloDelta(bPlayer.elo, 'win');
    } else if (winner === 'w') {
      bPlayer.losses += 1;
      bPlayer.elo = applyFixedEloDelta(bPlayer.elo, 'loss');
    } else {
      bPlayer.draws += 1;
    }
  }

  eng.store.recentMatches.unshift({
    id: game.id,
    white: game.white.username,
    black: game.black.username,
    winner,
    status,
    endReason,
    movesCount: game.moves.length,
    timeControl: game.timeControl,
    finishedAt: Date.now(),
    isBotGame: game.isBotGame,
  });
  if (eng.store.recentMatches.length > 30) {
    eng.store.recentMatches = eng.store.recentMatches.slice(0, 30);
  }

  appendSystemChat(game, endReason);
  saveStoreNow();
  broadcastGame(game, 'game:updated');
  broadcastLobbyToAll();
}

function getParticipantColor(game: GameState, userKey: string): PieceColor | null {
  if (!game.white.isBot && normalizeKey(game.white.username) === userKey) return 'w';
  if (!game.black.isBot && normalizeKey(game.black.username) === userKey) return 'b';
  return null;
}

function createChessMatch(params: {
  white: GameState['white'];
  black: GameState['black'];
  timeControl: TimeControlId;
  isBotGame: boolean;
  botId?: BotId;
}): GameState {
  const eng = getEngine();
  const chess = new Chess();
  const tc = TIME_CONTROLS[params.timeControl];
  const now = Date.now();

  const game: GameState = {
    id: makeId('game'),
    white: params.white,
    black: params.black,
    fen: chess.fen(),
    pgn: '',
    turn: 'w',
    moves: [],
    status: 'active',
    winner: null,
    timeControl: params.timeControl,
    whiteTimeMs: tc.initialMs,
    blackTimeMs: tc.initialMs,
    lastMoveAt: now,
    createdAt: now,
    drawOfferBy: null,
    rematchRequestedBy: null,
    chat: [],
    isBotGame: params.isBotGame,
    botId: params.botId,
  };

  appendSystemChat(
    game,
    `Partita iniziata · ${tc.label} · ${params.white.username} (Bianco) vs ${params.black.username} (Nero)`
  );

  if (params.isBotGame && params.botId) {
    const humanName = params.white.isBot ? params.black.username : params.white.username;
    appendBotChat(game, params.botId, getBotGreeting(params.botId, humanName));
  }

  eng.games.set(game.id, game);

  if (!params.white.isBot) {
    eng.activeGameByUser.set(normalizeKey(params.white.username), game.id);
  }
  if (!params.black.isBot) {
    eng.activeGameByUser.set(normalizeKey(params.black.username), game.id);
  }

  return game;
}

function applyMoveOnGame(
  game: GameState,
  from: string,
  to: string,
  promotion?: 'q' | 'r' | 'b' | 'n'
):
  | {
      ok: true;
      captured?: string;
      inCheck: boolean;
      newStatus: GameState['status'];
      quality: MoveQuality;
    }
  | { ok: false; error: string } {
  if (game.status !== 'active') {
    return { ok: false, error: 'La partita è già terminata.' };
  }

  const fenBefore = game.fen;
  const chess = new Chess(fenBefore);
  const movingColor = chess.turn();
  const now = Date.now();

  let moveResult;
  try {
    moveResult = chess.move({ from, to, promotion: promotion || 'q' });
  } catch {
    return { ok: false, error: 'Mossa non valida.' };
  }

  if (!moveResult) {
    return { ok: false, error: 'Mossa non consentita.' };
  }

  const prevMove = game.moves.length > 0 ? game.moves[game.moves.length - 1] : undefined;
  const evalResult = evaluatePlayedMove(fenBefore, from, to, promotion, prevMove);

  const tc = TIME_CONTROLS[game.timeControl];
  if (game.timeControl !== 'unlimited' && game.moves.length >= 1) {
    const elapsed = Math.max(0, now - game.lastMoveAt);
    if (movingColor === 'w') {
      game.whiteTimeMs = Math.max(0, game.whiteTimeMs - elapsed);
      if (game.whiteTimeMs === 0) {
        finalizeGame(game, 'timeout', 'b', `${game.white.username} ha esaurito il tempo.`);
        return {
          ok: true,
          captured: moveResult.captured,
          inCheck: false,
          newStatus: 'timeout',
          quality: evalResult.quality,
        };
      }
      game.whiteTimeMs += tc.incrementMs;
    } else {
      game.blackTimeMs = Math.max(0, game.blackTimeMs - elapsed);
      if (game.blackTimeMs === 0) {
        finalizeGame(game, 'timeout', 'w', `${game.black.username} ha esaurito il tempo.`);
        return {
          ok: true,
          captured: moveResult.captured,
          inCheck: false,
          newStatus: 'timeout',
          quality: evalResult.quality,
        };
      }
      game.blackTimeMs += tc.incrementMs;
    }
  }

  game.fen = chess.fen();
  game.pgn = chess.pgn();
  game.turn = chess.turn();
  game.lastMoveAt = now;
  game.drawOfferBy = null;
  game.moves.push({
    san: moveResult.san,
    from: moveResult.from,
    to: moveResult.to,
    fen: game.fen,
    color: movingColor,
    captured: moveResult.captured,
    promotion: moveResult.promotion,
    quality: evalResult.quality,
    cpLoss: evalResult.cpLoss,
    timestamp: now,
  });

  if (chess.isCheckmate()) {
    const winnerName = movingColor === 'w' ? game.white.username : game.black.username;
    finalizeGame(game, 'checkmate', movingColor, `Scacco matto! Vince ${winnerName}.`);
  } else if (chess.isStalemate()) {
    finalizeGame(game, 'stalemate', 'draw', 'Patta per stallo.');
  } else if (chess.isThreefoldRepetition()) {
    finalizeGame(game, 'draw', 'draw', 'Patta per ripetizione di posizione.');
  } else if (chess.isInsufficientMaterial()) {
    finalizeGame(game, 'draw', 'draw', 'Patta per materiale insufficiente.');
  } else if (chess.isDraw()) {
    finalizeGame(game, 'draw', 'draw', 'Patta per regola delle 50 mosse.');
  } else {
    broadcastGame(game, 'game:updated');
  }

  return {
    ok: true,
    captured: moveResult.captured,
    inCheck: chess.inCheck(),
    newStatus: game.status,
    quality: evalResult.quality,
  };
}

export function executeBotMoveNow(game: GameState) {
  if (!game.isBotGame || !game.botId || game.status !== 'active') return;
  const botColor: PieceColor = game.white.isBot ? 'w' : 'b';
  if (game.turn !== botColor) return;

  const chosen = chooseBotMove(game.fen, game.botId);
  if (!chosen) return;

  const res = applyMoveOnGame(
    game,
    chosen.from,
    chosen.to,
    chosen.promotion as 'q' | 'r' | 'b' | 'n' | undefined
  );

  if (res.ok && game.botId) {
    if (res.newStatus === 'checkmate') {
      const msg = appendBotChat(
        game,
        game.botId,
        getBotMoveComment(game.botId, 'checkmate_win') || 'Scacco matto!'
      );
      broadcastGameChat(game, msg);
    } else if (res.captured === 'q') {
      const msg = appendBotChat(
        game,
        game.botId,
        getBotMoveComment(game.botId, 'capture_queen') || ''
      );
      if (msg.text) broadcastGameChat(game, msg);
    } else if (res.inCheck && Math.random() < 0.45) {
      const msg = appendBotChat(
        game,
        game.botId,
        getBotMoveComment(game.botId, 'bot_checked') || ''
      );
      if (msg.text) broadcastGameChat(game, msg);
    }
  }
}

export function scheduleBotTurn(game: GameState) {
  if (!game.isBotGame || !game.botId || game.status !== 'active') return;
  const botColor: PieceColor = game.white.isBot ? 'w' : 'b';
  if (game.turn !== botColor) return;

  const eng = getEngine();
  const existingTimer = eng.botMoveTimers.get(game.id);
  if (existingTimer) clearTimeout(existingTimer);

  const delay = 280 + Math.floor(Math.random() * 200);
  const timer = setTimeout(() => {
    eng.botMoveTimers.delete(game.id);
    executeBotMoveNow(game);
  }, delay);

  eng.botMoveTimers.set(game.id, timer);
}

export function buildAuthOkEvent(key: string): ServerEvent {
  const eng = getEngine();
  const profile = getPlayerSummary(key)!;
  const activeGameId = eng.activeGameByUser.get(key);
  const activeGameObj = activeGameId ? eng.games.get(activeGameId) : null;
  const currentGame =
    activeGameObj && activeGameObj.status === 'active' ? activeGameObj : null;

  return {
    type: 'auth:ok',
    profile,
    token: eng.store.players[key].token,
    activeGame: currentGame,
  };
}

export function processAuthMessage(
  msg: ClientEvent,
  reply: (evt: ServerEvent) => void
): string | null {
  const eng = getEngine();

  if (msg.type === 'auth:register') {
    if (typeof msg.username !== 'string' || !isValidPassword(msg.password)) {
      reply({
        type: 'auth:error',
        message: 'Inserisci un username valido e una password di almeno 4 caratteri.',
      });
      return null;
    }
    const cleanName = msg.username.trim();
    if (!isValidUsername(cleanName)) {
      reply({
        type: 'auth:error',
        message: 'Username non valido: usa 2–20 caratteri (lettere, numeri o _).',
      });
      return null;
    }
    const key = normalizeKey(cleanName);
    if (isReservedName(key) || eng.store.players[key]) {
      reply({
        type: 'auth:error',
        message: 'Nome già in uso.',
      });
      return null;
    }

    eng.store.players[key] = {
      username: cleanName,
      key,
      passwordHash: hashPassword(msg.password),
      token: makeSessionToken(),
      elo: 300,
      wins: 0,
      losses: 0,
      draws: 0,
      lastSeenAt: Date.now(),
    };
    saveStoreNow();
    return key;
  }

  if (msg.type === 'auth:login') {
    if (typeof msg.username !== 'string' || typeof msg.password !== 'string') {
      reply({
        type: 'auth:error',
        message: 'Username o password sbagliati.',
      });
      return null;
    }
    const cleanName = msg.username.trim();
    const key = normalizeKey(cleanName);
    const existing = eng.store.players[key];

    if (!cleanName || !existing || !verifyPassword(msg.password, existing.passwordHash)) {
      reply({
        type: 'auth:error',
        message: 'Username o password sbagliati.',
      });
      return null;
    }

    existing.token = makeSessionToken();
    existing.lastSeenAt = Date.now();
    saveStoreNow();
    return key;
  }

  if (msg.type === 'auth:resume') {
    if (typeof msg.username !== 'string' || typeof msg.token !== 'string') {
      reply({ type: 'auth:error', message: 'Sessione scaduta. Accedi di nuovo.' });
      return null;
    }
    const key = normalizeKey(msg.username);
    const existing = eng.store.players[key];
    if (!existing || !verifyToken(msg.token, existing.token)) {
      reply({ type: 'auth:error', message: 'Sessione scaduta. Accedi di nuovo.' });
      return null;
    }
    existing.lastSeenAt = Date.now();
    return key;
  }

  return null;
}

export function handleAuthenticatedAction(
  userKey: string,
  msg: ClientEvent,
  reply: (evt: ServerEvent) => void,
  options?: { syncBotTurns?: boolean }
) {
  const eng = getEngine();
  const me = eng.store.players[userKey];
  if (!me) return;
  const syncBot = Boolean(options?.syncBotTurns);

  if (msg.type === 'lobby:refresh') {
    reply(getLobbySnapshotFor(userKey));
    return;
  }

  if (msg.type === 'challenge:send') {
    if (typeof msg.toUsername !== 'string') return;
    const targetRaw = msg.toUsername.trim();
    if (!isValidUsername(targetRaw)) {
      reply({
        type: 'challenge:error',
        message: 'Inserisci un username valido (2–20 caratteri, lettere, numeri o _).',
      });
      return;
    }
    const targetKey = normalizeKey(targetRaw);
    if (targetKey === userKey) {
      reply({
        type: 'challenge:error',
        message: 'Non puoi sfidare te stesso.',
      });
      return;
    }

    const myActiveId = eng.activeGameByUser.get(userKey);
    const myActive = myActiveId ? eng.games.get(myActiveId) : null;
    if (myActive && myActive.status === 'active') {
      reply({
        type: 'challenge:error',
        message: 'Completa o abbandona la partita in corso prima di inviare una nuova sfida.',
      });
      return;
    }

    for (const ch of eng.challenges.values()) {
      if (normalizeKey(ch.from) === userKey && normalizeKey(ch.to) === targetKey) {
        reply({
          type: 'challenge:error',
          message: `Hai già una sfida attiva verso ${ch.to}.`,
        });
        return;
      }
    }

    const targetOnline = isUserOnline(targetKey);
    const displayTarget = eng.store.players[targetKey]?.username || targetRaw;
    const now = Date.now();
    const challenge: Challenge = {
      id: makeId('chal'),
      from: me.username,
      fromElo: me.elo,
      to: displayTarget,
      timeControl: msg.timeControl,
      colorPref: msg.colorPref,
      createdAt: now,
      expiresAt: now + (targetOnline ? 90 * 1000 : 15 * 60 * 1000),
      targetOnline,
    };
    eng.challenges.set(challenge.id, challenge);

    reply({ type: 'challenge:sent', challenge });
    if (targetOnline) {
      sendToUser(targetKey, { type: 'challenge:received', challenge });
    }
    broadcastLobbyToAll();
    return;
  }

  if (msg.type === 'challenge:cancel') {
    if (typeof msg.challengeId !== 'string') return;
    const ch = eng.challenges.get(msg.challengeId);
    if (!ch || normalizeKey(ch.from) !== userKey) return;
    eng.challenges.delete(msg.challengeId);
    sendToUser(userKey, { type: 'challenge:removed', challengeId: ch.id });
    sendToUser(normalizeKey(ch.to), { type: 'challenge:removed', challengeId: ch.id });
    broadcastLobbyToAll();
    return;
  }

  if (msg.type === 'challenge:respond') {
    if (typeof msg.challengeId !== 'string') return;
    const ch = eng.challenges.get(msg.challengeId);
    if (!ch) {
      reply({ type: 'challenge:error', message: 'La sfida non è più disponibile.' });
      return;
    }
    if (normalizeKey(ch.to) !== userKey) return;

    eng.challenges.delete(ch.id);
    const fromKey = normalizeKey(ch.from);

    if (!msg.accept) {
      sendToUser(fromKey, {
        type: 'challenge:removed',
        challengeId: ch.id,
        reason: `${me.username} ha rifiutato la sfida.`,
      });
      sendToUser(userKey, { type: 'challenge:removed', challengeId: ch.id });
      broadcastLobbyToAll();
      return;
    }

    if (!isUserOnline(fromKey) || !eng.store.players[fromKey]) {
      reply({
        type: 'challenge:error',
        message: `${ch.from} non è più connesso in questo momento.`,
      });
      broadcastLobbyToAll();
      return;
    }

    const challenger = eng.store.players[fromKey];
    const challengerPlaysWhite =
      ch.colorPref === 'w'
        ? true
        : ch.colorPref === 'b'
          ? false
          : Math.random() < 0.5;

    const whiteInfo: GameState['white'] = challengerPlaysWhite
      ? { username: challenger.username, elo: challenger.elo, isBot: false }
      : { username: me.username, elo: me.elo, isBot: false };

    const blackInfo: GameState['black'] = challengerPlaysWhite
      ? { username: me.username, elo: me.elo, isBot: false }
      : { username: challenger.username, elo: challenger.elo, isBot: false };

    const game = createChessMatch({
      white: whiteInfo,
      black: blackInfo,
      timeControl: ch.timeControl,
      isBotGame: false,
    });

    sendToUser(fromKey, { type: 'challenge:removed', challengeId: ch.id });
    sendToUser(userKey, { type: 'challenge:removed', challengeId: ch.id });
    broadcastGame(game, 'game:started');
    broadcastLobbyToAll();
    return;
  }

  if (msg.type === 'bot:start') {
    const bot = BOT_DEFINITIONS[msg.botId];
    if (!bot) return;

    const playerPlaysWhite =
      msg.colorPref === 'w'
        ? true
        : msg.colorPref === 'b'
          ? false
          : Math.random() < 0.5;

    const whiteInfo: GameState['white'] = playerPlaysWhite
      ? { username: me.username, elo: me.elo, isBot: false }
      : { username: bot.name, elo: bot.elo, isBot: true, botId: bot.id };

    const blackInfo: GameState['black'] = playerPlaysWhite
      ? { username: bot.name, elo: bot.elo, isBot: true, botId: bot.id }
      : { username: me.username, elo: me.elo, isBot: false };

    const game = createChessMatch({
      white: whiteInfo,
      black: blackInfo,
      timeControl: msg.timeControl,
      isBotGame: true,
      botId: bot.id,
    });

    broadcastGame(game, 'game:started');
    broadcastLobbyToAll();
    if (syncBot) {
      executeBotMoveNow(game);
    } else {
      scheduleBotTurn(game);
    }
    return;
  }

  if (msg.type === 'game:move') {
    if (
      typeof msg.gameId !== 'string' ||
      typeof msg.from !== 'string' ||
      typeof msg.to !== 'string'
    ) {
      return;
    }
    const game = eng.games.get(msg.gameId);
    if (!game) return;
    const myColor = getParticipantColor(game, userKey);
    if (!myColor || game.turn !== myColor) {
      reply({ type: 'game:error', message: 'Non è il tuo turno.' });
      return;
    }

    const result = applyMoveOnGame(game, msg.from, msg.to, msg.promotion);
    if (!result.ok) {
      reply({ type: 'game:error', message: result.error });
      return;
    }

    if (game.isBotGame && game.botId) {
      if (result.newStatus === 'checkmate') {
        const chatMsg = appendBotChat(
          game,
          game.botId,
          getBotMoveComment(game.botId, 'checkmate_loss') || 'Bella partita!'
        );
        broadcastGameChat(game, chatMsg);
      } else if (result.newStatus === 'active') {
        const qualityReaction = getBotQualityReaction(game.botId, result.quality);
        if (qualityReaction) {
          const chatMsg = appendBotChat(game, game.botId, qualityReaction);
          broadcastGameChat(game, chatMsg);
        } else if (result.captured === 'q') {
          const chatMsg = appendBotChat(
            game,
            game.botId,
            getBotMoveComment(game.botId, 'capture_queen') || ''
          );
          if (chatMsg.text) broadcastGameChat(game, chatMsg);
        } else if (result.inCheck && Math.random() < 0.5) {
          const chatMsg = appendBotChat(
            game,
            game.botId,
            getBotMoveComment(game.botId, 'bot_checked') || ''
          );
          if (chatMsg.text) broadcastGameChat(game, chatMsg);
        }
        if (syncBot) {
          executeBotMoveNow(game);
        } else {
          scheduleBotTurn(game);
        }
      }
    }
    return;
  }

  if (msg.type === 'game:chat') {
    if (typeof msg.gameId !== 'string' || typeof msg.text !== 'string') return;
    const game = eng.games.get(msg.gameId);
    if (!game) return;
    const myColor = getParticipantColor(game, userKey);
    if (!myColor) return;

    const cleanText = msg.text.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!cleanText) return;

    const chatMsg: ChatMessage = {
      id: makeId('msg'),
      sender: me.username,
      text: cleanText,
      timestamp: Date.now(),
      kind: 'player',
    };
    game.chat.push(chatMsg);
    if (game.chat.length > 200) game.chat.shift();
    broadcastGameChat(game, chatMsg);

    if (game.isBotGame && game.botId) {
      const botId = game.botId;
      const botColor: PieceColor = game.white.isBot ? 'w' : 'b';
      const replyText = getBotChatReply(
        botId,
        cleanText,
        game.fen,
        botColor,
        game.moves.length
      );
      if (syncBot) {
        const botMsg = appendBotChat(game, botId, replyText);
        broadcastGameChat(game, botMsg);
      } else {
        setTimeout(() => {
          const botMsg = appendBotChat(game, botId, replyText);
          broadcastGameChat(game, botMsg);
        }, 450);
      }
    }
    return;
  }

  if (msg.type === 'game:resign') {
    if (typeof msg.gameId !== 'string') return;
    const game = eng.games.get(msg.gameId);
    if (!game || game.status !== 'active') return;
    const myColor = getParticipantColor(game, userKey);
    if (!myColor) return;
    const winner: PieceColor = myColor === 'w' ? 'b' : 'w';
    finalizeGame(game, 'resigned', winner, `${me.username} ha abbandonato la partita.`);
    return;
  }

  if (msg.type === 'game:offer_draw') {
    if (typeof msg.gameId !== 'string') return;
    const game = eng.games.get(msg.gameId);
    if (!game || game.status !== 'active') return;
    const myColor = getParticipantColor(game, userKey);
    if (!myColor || game.drawOfferBy === myColor) return;

    if (game.isBotGame && game.botId) {
      const sys = appendSystemChat(game, `${me.username} propone la patta.`);
      broadcastGameChat(game, sys);
      const chess = new Chess(game.fen);
      const canDraw = game.moves.length >= 24 && !chess.inCheck();
      const botId = game.botId;
      const handleDraw = () => {
        if (game.status !== 'active') return;
        if (canDraw && botId === 'knight') {
          const botMsg = appendBotChat(game, botId, 'Va bene, accettiamo la patta! Bella partita.');
          broadcastGameChat(game, botMsg);
          finalizeGame(game, 'draw', 'draw', 'Patta concordata.');
        } else {
          const botMsg = appendBotChat(
            game,
            botId,
            'Continuiamo a giocare, c’è ancora molto sulla scacchiera.'
          );
          broadcastGameChat(game, botMsg);
        }
      };
      if (syncBot) {
        handleDraw();
      } else {
        setTimeout(handleDraw, 500);
      }
      return;
    }

    game.drawOfferBy = myColor;
    const sys = appendSystemChat(game, `${me.username} ha proposto la patta.`);
    broadcastGame(game, 'game:updated');
    broadcastGameChat(game, sys);
    return;
  }

  if (msg.type === 'game:respond_draw') {
    if (typeof msg.gameId !== 'string') return;
    const game = eng.games.get(msg.gameId);
    if (!game || game.status !== 'active') return;
    const myColor = getParticipantColor(game, userKey);
    if (!myColor || !game.drawOfferBy || game.drawOfferBy === myColor) return;

    if (msg.accept) {
      finalizeGame(game, 'draw', 'draw', 'Patta concordata tra i giocatori.');
    } else {
      game.drawOfferBy = null;
      const sys = appendSystemChat(game, `${me.username} ha rifiutato la patta.`);
      broadcastGame(game, 'game:updated');
      broadcastGameChat(game, sys);
    }
    return;
  }

  if (msg.type === 'game:rematch') {
    if (typeof msg.gameId !== 'string') return;
    const game = eng.games.get(msg.gameId);
    if (!game || game.status === 'active') return;
    const myColor = getParticipantColor(game, userKey);
    if (!myColor) return;

    if (game.isBotGame && game.botId) {
      const newGame = createChessMatch({
        white: game.black,
        black: game.white,
        timeControl: game.timeControl,
        isBotGame: true,
        botId: game.botId,
      });
      broadcastGame(newGame, 'game:started');
      broadcastLobbyToAll();
      if (syncBot) {
        executeBotMoveNow(newGame);
      } else {
        scheduleBotTurn(newGame);
      }
      return;
    }

    if (game.rematchRequestedBy && game.rematchRequestedBy !== myColor) {
      const wKey = normalizeKey(game.white.username);
      const bKey = normalizeKey(game.black.username);
      if (!isUserOnline(wKey) || !isUserOnline(bKey)) {
        reply({ type: 'game:error', message: 'L’avversario non è più connesso.' });
        return;
      }
      const newGame = createChessMatch({
        white: game.black,
        black: game.white,
        timeControl: game.timeControl,
        isBotGame: false,
      });
      broadcastGame(newGame, 'game:started');
      broadcastLobbyToAll();
    } else {
      game.rematchRequestedBy = myColor;
      const sys = appendSystemChat(game, `${me.username} chiede la rivincita.`);
      broadcastGame(game, 'game:updated');
      broadcastGameChat(game, sys);
    }
    return;
  }

  if (msg.type === 'game:leave_view') {
    const currentId = eng.activeGameByUser.get(userKey);
    if (currentId) {
      const g = eng.games.get(currentId);
      if (!g || g.status !== 'active') {
        eng.activeGameByUser.delete(userKey);
        broadcastLobbyToAll();
      }
    }
  }
}

export function verifyHttpBearerHeaders(
  authHeader: string | null,
  rawUser: string | null
): string | null {
  if (!authHeader || !rawUser) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const key = normalizeKey(rawUser);
  const eng = getEngine();
  let player = eng.store.players[key];
  if (!player) {
    const disk = loadStoreFromDisk(eng.storePath);
    if (disk.players[key]) {
      eng.store.players[key] = disk.players[key];
      player = disk.players[key];
    }
  }
  if (!player || !verifyToken(token, player.token)) return null;
  return key;
}

export function tickServerClocks() {
  const eng = getEngine();
  const now = Date.now();
  let prunedHttp = false;
  for (const [key, sess] of eng.httpSessionsByUser.entries()) {
    if (now - sess.lastPollAt >= HTTP_SESSION_TTL_MS) {
      eng.httpSessionsByUser.delete(key);
      prunedHttp = true;
    }
  }
  if (prunedHttp) {
    broadcastLobbyToAll();
  }

  for (const game of eng.games.values()) {
    if (game.status !== 'active' || game.timeControl === 'unlimited') continue;
    if (game.moves.length < 1) continue;

    const elapsed = now - game.lastMoveAt;
    const whiteRemaining =
      game.turn === 'w' ? Math.max(0, game.whiteTimeMs - elapsed) : game.whiteTimeMs;
    const blackRemaining =
      game.turn === 'b' ? Math.max(0, game.blackTimeMs - elapsed) : game.blackTimeMs;

    if (game.turn === 'w' && whiteRemaining <= 0) {
      game.whiteTimeMs = 0;
      finalizeGame(game, 'timeout', 'b', `${game.white.username} ha esaurito il tempo.`);
      continue;
    }
    if (game.turn === 'b' && blackRemaining <= 0) {
      game.blackTimeMs = 0;
      finalizeGame(game, 'timeout', 'w', `${game.black.username} ha esaurito il tempo.`);
      continue;
    }

    const syncEvent: ServerEvent = {
      type: 'clock:sync',
      gameId: game.id,
      whiteTimeMs: whiteRemaining,
      blackTimeMs: blackRemaining,
    };
    if (!game.white.isBot) sendToUser(normalizeKey(game.white.username), syncEvent);
    if (!game.black.isBot) sendToUser(normalizeKey(game.black.username), syncEvent);
  }
}
