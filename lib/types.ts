export type TimeControlId = 'blitz_3_2' | 'blitz_5_0' | 'rapid_10_0' | 'unlimited';

export type ColorPref = 'random' | 'w' | 'b';

export type PieceColor = 'w' | 'b';

export type BotId = 'knight' | 'bishop' | 'king';

export type MoveQuality = 'book' | 'brilliant' | 'great' | 'good' | 'mistake' | 'blunder' | 'neutral';

export interface TimeControlConfig {
  id: TimeControlId;
  label: string;
  shortLabel: string;
  initialMs: number;
  incrementMs: number;
}

export const TIME_CONTROLS: Record<TimeControlId, TimeControlConfig> = {
  blitz_3_2: {
    id: 'blitz_3_2',
    label: 'Blitz 3+2',
    shortLabel: '3+2',
    initialMs: 3 * 60 * 1000,
    incrementMs: 2 * 1000,
  },
  blitz_5_0: {
    id: 'blitz_5_0',
    label: 'Blitz 5+0',
    shortLabel: '5+0',
    initialMs: 5 * 60 * 1000,
    incrementMs: 0,
  },
  rapid_10_0: {
    id: 'rapid_10_0',
    label: 'Rapid 10+0',
    shortLabel: '10+0',
    initialMs: 10 * 60 * 1000,
    incrementMs: 0,
  },
  unlimited: {
    id: 'unlimited',
    label: 'Senza tempo',
    shortLabel: 'Libera',
    initialMs: 0,
    incrementMs: 0,
  },
};

export interface PlayerSummary {
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  status: 'online' | 'in_game' | 'offline';
  activeGameId?: string | null;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  kind: 'player' | 'bot' | 'system';
}

export interface GameMove {
  san: string;
  from: string;
  to: string;
  fen: string;
  color: PieceColor;
  captured?: string;
  promotion?: string;
  quality?: MoveQuality;
  cpLoss?: number;
  timestamp: number;
}

export type GameStatus =
  | 'active'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'timeout';

export interface GamePlayerInfo {
  username: string;
  elo: number;
  isBot: boolean;
  botId?: BotId;
}

export interface GameState {
  id: string;
  white: GamePlayerInfo;
  black: GamePlayerInfo;
  fen: string;
  pgn: string;
  turn: PieceColor;
  moves: GameMove[];
  status: GameStatus;
  winner: PieceColor | 'draw' | null;
  endReason?: string;
  timeControl: TimeControlId;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: number;
  createdAt: number;
  drawOfferBy: PieceColor | null;
  rematchRequestedBy: PieceColor | null;
  chat: ChatMessage[];
  isBotGame: boolean;
  botId?: BotId;
}

export interface Challenge {
  id: string;
  from: string;
  fromElo: number;
  to: string;
  timeControl: TimeControlId;
  colorPref: ColorPref;
  createdAt: number;
  expiresAt: number;
  targetOnline: boolean;
}

export interface RecentMatchSummary {
  id: string;
  white: string;
  black: string;
  winner: PieceColor | 'draw' | null;
  status: GameStatus;
  endReason?: string;
  movesCount: number;
  timeControl: TimeControlId;
  finishedAt: number;
  isBotGame: boolean;
}

export interface BotDefinition {
  id: BotId;
  name: string;
  username: string;
  elo: number;
  tierLabel: string;
  pieceType: 'n' | 'b' | 'k';
  styleDescription: string;
}

export const BOT_DEFINITIONS: Record<BotId, BotDefinition> = {
  knight: {
    id: 'knight',
    name: 'Bot Cavallo',
    username: 'Bot_Cavallo',
    elo: 350,
    tierLabel: 'Base',
    pieceType: 'n',
    styleDescription: 'Motore livello base, gioco aperto e qualche imprecisione naturale.',
  },
  bishop: {
    id: 'bishop',
    name: 'Bot Alfiere',
    username: 'Bot_Alfiere',
    elo: 700,
    tierLabel: 'Intermedio',
    pieceType: 'b',
    styleDescription: 'Motore tattico intermedio, attento ai cambi e al controllo del centro.',
  },
  king: {
    id: 'king',
    name: 'Bot Re',
    username: 'Bot_Re',
    elo: 1100,
    tierLabel: 'Maestro',
    pieceType: 'k',
    styleDescription: 'Motore avanzato con ricerca rapida, finali precisi e tattica severa.',
  },
};

export type ClientEvent =
  | { type: 'auth:login'; username: string; password: string }
  | { type: 'auth:register'; username: string; password: string }
  | { type: 'auth:resume'; username: string; token: string }
  | { type: 'auth:logout' }
  | { type: 'lobby:refresh' }
  | {
      type: 'challenge:send';
      toUsername: string;
      timeControl: TimeControlId;
      colorPref: ColorPref;
    }
  | { type: 'challenge:cancel'; challengeId: string }
  | { type: 'challenge:respond'; challengeId: string; accept: boolean }
  | {
      type: 'bot:start';
      botId: BotId;
      timeControl: TimeControlId;
      colorPref: ColorPref;
    }
  | {
      type: 'game:move';
      gameId: string;
      from: string;
      to: string;
      promotion?: 'q' | 'r' | 'b' | 'n';
    }
  | { type: 'game:chat'; gameId: string; text: string }
  | { type: 'game:resign'; gameId: string }
  | { type: 'game:offer_draw'; gameId: string }
  | { type: 'game:respond_draw'; gameId: string; accept: boolean }
  | { type: 'game:rematch'; gameId: string }
  | { type: 'game:leave_view' };

export type ServerEvent =
  | {
      type: 'auth:ok';
      profile: PlayerSummary;
      token: string;
      activeGame: GameState | null;
    }
  | { type: 'auth:error'; message: string }
  | {
      type: 'lobby:state';
      onlinePlayers: PlayerSummary[];
      leaderboard: PlayerSummary[];
      recentMatches: RecentMatchSummary[];
      incomingChallenges: Challenge[];
      outgoingChallenges: Challenge[];
    }
  | { type: 'challenge:sent'; challenge: Challenge }
  | { type: 'challenge:received'; challenge: Challenge }
  | { type: 'challenge:removed'; challengeId: string; reason?: string }
  | { type: 'challenge:error'; message: string }
  | { type: 'game:started'; game: GameState }
  | { type: 'game:updated'; game: GameState }
  | { type: 'game:chat_message'; gameId: string; message: ChatMessage }
  | { type: 'game:error'; message: string }
  | { type: 'clock:sync'; gameId: string; whiteTimeMs: number; blackTimeMs: number };
