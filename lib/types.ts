export type TimeControlId = 'blitz_3_2' | 'blitz_5_0' | 'rapid_10_0' | 'unlimited';

export type ColorPref = 'random' | 'w' | 'b';

export type PieceColor = 'w' | 'b';

export type BotId =
  | 'knight'
  | 'bishop'
  | 'king'
  | 'master'
  | 'dummy'
  | 'alien'
  | 'gothamchess'
  | 'mittens';

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
  lang?: string;
  country?: string;
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
  country?: string;
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
  fromCountry?: string;
  toUid?: string;
  to: string;
  toCountry?: string;
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
  role: 'bot' | 'coach' | 'dummy';
  hasPostGameReview: boolean;
  tierLabel: string;
  pieceType: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  badgeEmoji: string;
  country?: string;
  styleDescription: string;
}

export const BOT_DEFINITIONS: Record<BotId, BotDefinition> = {
  knight: {
    id: 'knight',
    name: 'Duolingo',
    username: 'Duolingo',
    elo: 350,
    role: 'bot',
    hasPostGameReview: false,
    tierLabel: 'Base',
    pieceType: 'n',
    badgeEmoji: '🦉',
    styleDescription: 'Il gufo da 350 ELO: non perdere la serie, aperture semplici e gioco leggero.',
  },
  bishop: {
    id: 'bishop',
    name: 'Luna',
    username: 'Luna',
    elo: 700,
    role: 'bot',
    hasPostGameReview: false,
    tierLabel: 'Intermedio',
    pieceType: 'b',
    badgeEmoji: '🌙',
    styleDescription: 'Motore tattico da 700 ELO, attento ai cambi e al controllo del centro.',
  },
  king: {
    id: 'king',
    name: 'Martin',
    username: 'Martin',
    elo: 1100,
    role: 'bot',
    hasPostGameReview: false,
    tierLabel: 'Avanzato',
    pieceType: 'k',
    badgeEmoji: '🧔',
    styleDescription: 'Il classico Martin da 1100 ELO: solido, pratico e pronto a punire le sviste.',
  },
  master: {
    id: 'master',
    name: 'Master',
    username: 'Master',
    elo: 2800,
    role: 'bot',
    hasPostGameReview: false,
    tierLabel: 'Gran Maestro',
    pieceType: 'q',
    badgeEmoji: '👑',
    styleDescription: 'Il bot più forte da 2800 ELO: calcolo profondo da Gran Maestro e zero pietà.',
  },
  dummy: {
    id: 'dummy',
    name: 'Dummy',
    username: 'Dummy_Training',
    elo: 150,
    role: 'dummy',
    hasPostGameReview: true,
    tierLabel: 'Allenamento',
    pieceType: 'p',
    badgeEmoji: '🎯',
    styleDescription: 'Allenamento libero: muovi tu anche i pezzi del Dummy per provare tattiche e matti + revisione finale.',
  },
  alien: {
    id: 'alien',
    name: 'Coach Alien',
    username: 'Coach_Alien',
    elo: 1850,
    role: 'coach',
    hasPostGameReview: true,
    tierLabel: 'Coach · Alieno',
    pieceType: 'q',
    badgeEmoji: '🛸',
    styleDescription: 'Coach cosmico posizionale, mette pressione sul centro e analizza ogni errore a fine partita.',
  },
  gothamchess: {
    id: 'gothamchess',
    name: 'Coach GothamChess',
    username: 'Coach_GothamChess',
    elo: 2400,
    role: 'coach',
    hasPostGameReview: true,
    tierLabel: 'Coach · IM',
    pieceType: 'r',
    badgeEmoji: '🇺🇸',
    country: 'US',
    styleDescription: 'Coach tattico stile IM Levy: sacrifici di Torre, attacchi rapidi e revisione completa.',
  },
  mittens: {
    id: 'mittens',
    name: 'Coach Mittens',
    username: 'Coach_Mittens',
    elo: 3200,
    role: 'coach',
    hasPostGameReview: true,
    tierLabel: 'Coach · Supremo',
    pieceType: 'k',
    badgeEmoji: '🐱',
    styleDescription: 'Il gattino implacabile da 3200 ELO: calcolo profondo e revisione severa a fine partita.',
  },
};

export function isTrainingBot(botId?: BotId | string | null): boolean {
  if (!botId) return false;
  const def = BOT_DEFINITIONS[botId as BotId];
  return Boolean(def?.hasPostGameReview);
}
