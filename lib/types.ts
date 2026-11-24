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
  uid?: string;
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
  uid?: string;
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
  rematchGameId?: string;
  whiteEloApplied?: boolean;
  blackEloApplied?: boolean;
  chat: ChatMessage[];
  isBotGame: boolean;
  botId?: BotId;
}

export interface Challenge {
  id: string;
  fromUid?: string;
  from: string;
  fromElo: number;
  toUid?: string;
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
