import { Chess } from 'chess.js';
import type { Move, PieceSymbol } from 'chess.js';
import type { GameState, PieceColor, SavedGameReview } from './types';
import { searchBestMoves, searchPositionWithPv } from './fast-chess-engine';
import { detectGenuineSacrifice } from './chess-bot';

export type CoachMoveClass =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'missed_win';

export interface AnalyzedMove {
  ply: number; // 0-indexed
  moveNumber: number;
  color: PieceColor;
  san: string;
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  captured?: string;
  fenBefore: string;
  fenAfter: string;
  evalBeforeWhiteCp: number;
  evalAfterWhiteCp: number;
  mateBefore?: number; // +N = White mates in N, -N = Black mates in N
  mateAfter?: number;
  bestMoveSan: string;
  bestMoveFrom: string;
  bestMoveTo: string;
  bestMovePromo?: 'q' | 'r' | 'b' | 'n';
  bestPvSan: string[];
  playedPvSan: string[];
  cpLoss: number;
  evalSwingCp: number;
  classification: CoachMoveClass;
  phase: 'opening' | 'middlegame' | 'endgame';
  isDecisiveMoment: boolean;
  tacticalNote: string;
}

export interface PlayerSideSummary {
  accuracyPct: number;
  openingAcc: number;
  middlegameAcc: number;
  endgameAcc: number;
  book: number;
  brilliant: number;
  great: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  missedWin: number;
}

export interface FullGameAnalysis {
  id: string;
  source: 'biochess' | 'pgn';
  whiteUsername: string;
  blackUsername: string;
  whiteElo?: number;
  blackElo?: number;
  playerColor: PieceColor;
  result: 'win' | 'loss' | 'draw';
  resultLabel: string;
  endReason: string;
  openingEco: string;
  openingName: string;
  pgn: string;
  moves: AnalyzedMove[];
  decisiveMoments: AnalyzedMove[];
  whiteStats: PlayerSideSummary;
  blackStats: PlayerSideSummary;
  analyzedAtMs: number;
}

export interface StudentAttemptEvaluation {
  san: string;
  from: string;
  to: string;
  isBest: boolean;
  cpLossVsBest: number;
  evalWhiteCp: number;
  mateIn?: number;
  refutationLineSan: string[];
  verdict: 'exact_best' | 'strong_alternative' | 'inaccurate' | 'blunder';
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

interface OpeningEntry {
  eco: string;
  name: string;
  line: string[];
}

const OPENING_BOOK_CATALOG: OpeningEntry[] = [
  { eco: 'B15', name: 'Caro-Kann: Alien Gambit', line: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nf6', 'Ng5', 'h6', 'Nxf7'] },
  { eco: 'C50', name: 'Partita Italiana (Giuoco Piano)', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'] },
  { eco: 'C55', name: 'Partita Italiana: Difesa dei Due Cavalli', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
  { eco: 'C50', name: 'Partita Italiana', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { eco: 'C60', name: 'Partita Spagnola (Ruy Lopez)', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'C45', name: 'Partita Scozzese', line: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'] },
  { eco: 'C47', name: 'Partita dei Quattro Cavalli', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'] },
  { eco: 'C42', name: 'Difesa Petrov (Stafford Gambit)', line: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'Nc6'] },
  { eco: 'C42', name: 'Difesa Petrov (Russa)', line: ['e4', 'e5', 'Nf3', 'Nf6'] },
  { eco: 'C41', name: 'Difesa Philidor', line: ['e4', 'e5', 'Nf3', 'd6'] },
  { eco: 'C25', name: 'Partita Viennese', line: ['e4', 'e5', 'Nc3'] },
  { eco: 'C30', name: 'Gambetto di Re', line: ['e4', 'e5', 'f4'] },
  { eco: 'B27', name: 'Difesa Siciliana: Drago / Najdorf', line: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'] },
  { eco: 'B23', name: 'Difesa Siciliana: Chiusa', line: ['e4', 'c5', 'Nc3'] },
  { eco: 'B20', name: 'Difesa Siciliana', line: ['e4', 'c5'] },
  { eco: 'C02', name: 'Difesa Francese: Variante di Spinta', line: ['e4', 'e6', 'd4', 'd5', 'e5'] },
  { eco: 'C00', name: 'Difesa Francese', line: ['e4', 'e6'] },
  { eco: 'B12', name: 'Difesa Caro-Kann', line: ['e4', 'c6', 'd4', 'd5'] },
  { eco: 'B10', name: 'Difesa Caro-Kann', line: ['e4', 'c6'] },
  { eco: 'B01', name: 'Difesa Scandinava', line: ['e4', 'd5'] },
  { eco: 'B07', name: 'Difesa Pirc', line: ['e4', 'd6', 'd4', 'Nf6'] },
  { eco: 'B02', name: 'Difesa Alekhine', line: ['e4', 'Nf6'] },
  { eco: 'D30', name: 'Gambetto di Donna Rifiutato', line: ['d4', 'd5', 'c4', 'e6'] },
  { eco: 'D10', name: 'Difesa Slava', line: ['d4', 'd5', 'c4', 'c6'] },
  { eco: 'D20', name: 'Gambetto di Donna Accettato', line: ['d4', 'd5', 'c4', 'dxc4'] },
  { eco: 'D06', name: 'Gambetto di Donna', line: ['d4', 'd5', 'c4'] },
  { eco: 'D02', name: 'Sistema Londra', line: ['d4', 'd5', 'Bf4'] },
  { eco: 'A45', name: 'Sistema Londra', line: ['d4', 'Nf6', 'Bf4'] },
  { eco: 'A40', name: 'Gambetto Englund', line: ['d4', 'e5'] },
  { eco: 'E20', name: 'Difesa Nimzo-Indiana', line: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { eco: 'E60', name: 'Difesa Est-Indiana', line: ['d4', 'Nf6', 'c4', 'g6'] },
  { eco: 'A50', name: 'Difesa Indiana', line: ['d4', 'Nf6'] },
  { eco: 'A10', name: 'Apertura Inglese', line: ['c4'] },
  { eco: 'A06', name: 'Apertura Reti', line: ['Nf3', 'd5'] },
  { eco: 'A04', name: 'Apertura Zukertort / Reti', line: ['Nf3'] },
  { eco: 'C20', name: 'Apertura di Pedone di Re', line: ['e4'] },
  { eco: 'D00', name: 'Apertura di Pedone di Donna', line: ['d4'] },
];

export function detectOpeningFromSans(sans: string[]): { eco: string; name: string } {
  let bestMatch: OpeningEntry | null = null;
  for (const entry of OPENING_BOOK_CATALOG) {
    if (sans.length < entry.line.length) continue;
    let matches = true;
    for (let i = 0; i < entry.line.length; i++) {
      if (sans[i] !== entry.line[i]) {
        matches = false;
        break;
      }
    }
    if (matches && (!bestMatch || entry.line.length > bestMatch.line.length)) {
      bestMatch = entry;
    }
  }
  return bestMatch
    ? { eco: bestMatch.eco, name: bestMatch.name }
    : { eco: 'A00', name: 'Apertura Libera' };
}

function pvUciToSan(fen: string, pv: Array<{ from: string; to: string; promo?: string }>): string[] {
  try {
    const chess = new Chess(fen);
    const sans: string[] = [];
    for (const step of pv) {
      try {
        const m = chess.move({
          from: step.from,
          to: step.to,
          promotion: (step.promo as 'q' | 'r' | 'b' | 'n' | undefined) || 'q',
        });
        if (!m) break;
        sans.push(m.san);
      } catch {
        break;
      }
    }
    return sans;
  } catch {
    return [];
  }
}

function moveToSan(fen: string, from: string, to: string, promo?: string): string {
  try {
    const chess = new Chess(fen);
    const m = chess.move({
      from,
      to,
      promotion: (promo as 'q' | 'r' | 'b' | 'n' | undefined) || 'q',
    });
    return m ? m.san : `${from}${to}`;
  } catch {
    return `${from}${to}`;
  }
}

function getGamePhase(fen: string, ply: number): 'opening' | 'middlegame' | 'endgame' {
  if (ply < 14) return 'opening';
  try {
    const chess = new Chess(fen);
    const board = chess.board();
    let nonKingMaterial = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = board[r][c];
        if (!sq || sq.type === 'k' || sq.type === 'p') continue;
        nonKingMaterial += PIECE_VALUES[sq.type];
      }
    }
    if (nonKingMaterial <= 2600) return 'endgame';
    return 'middlegame';
  } catch {
    return 'middlegame';
  }
}

function buildTacticalNote(params: {
  color: PieceColor;
  san: string;
  bestMoveSan: string;
  classification: CoachMoveClass;
  cpLoss: number;
  evalBeforeMoverCp: number;
  evalAfterMoverCp: number;
  mateBefore?: number;
  mateAfter?: number;
  bestPvSan: string[];
  playedPvSan: string[];
}): string {
  const {
    color,
    san,
    bestMoveSan,
    classification,
    cpLoss,
    evalBeforeMoverCp,
    evalAfterMoverCp,
    mateBefore,
    mateAfter,
    bestPvSan,
    playedPvSan,
  } = params;

  const moverSign = color === 'w' ? 1 : -1;
  const mateBeforeForMover = mateBefore ? mateBefore * moverSign : undefined;
  const mateAfterForMover = mateAfter ? mateAfter * moverSign : undefined;

  if (san.includes('#')) return 'Scacco matto decisivo.';
  if (mateAfterForMover !== undefined && mateAfterForMover < 0) {
    return `Permette uno scacco matto forzato in ${Math.abs(mateAfterForMover)} mosse (${playedPvSan.slice(0, 3).join(' ')}).`;
  }
  if (mateBeforeForMover !== undefined && mateBeforeForMover > 0 && (!mateAfterForMover || mateAfterForMover < 0)) {
    return `Manca un matto forzato in ${mateBeforeForMover} con ${bestMoveSan}.`;
  }
  if (classification === 'brilliant') {
    return `Sacrificio spettacolare (${san}) che mantiene la valutazione vincente.`;
  }
  if (classification === 'great') {
    return `Unica mossa precisa (${san}) che conserva il vantaggio critico.`;
  }
  if (classification === 'missed_win') {
    return `Occasione vincente mancata: ${bestMoveSan} (${bestPvSan.slice(0, 3).join(' ')}) dava un vantaggio netto (~+${(evalBeforeMoverCp / 100).toFixed(1)}).`;
  }
  if (classification === 'blunder') {
    const lossStr = (cpLoss / 100).toFixed(1);
    const seq = playedPvSan.length > 0 ? ` L'avversario risponde con ${playedPvSan.slice(0, 3).join(' ')}.` : '';
    return `Errore grave (-${lossStr} pedoni): invece di ${san}, bisognava giocare ${bestMoveSan} (${bestPvSan.slice(0, 3).join(' ')}).${seq}`;
  }
  if (classification === 'mistake') {
    const lossStr = (cpLoss / 100).toFixed(1);
    return `Errore (-${lossStr} pedoni): ${bestMoveSan} (${bestPvSan.slice(0, 3).join(' ')}) era nettamente migliore (valutazione ${(evalAfterMoverCp / 100).toFixed(1)}).`;
  }
  if (classification === 'inaccuracy') {
    return `Imprecisione: ${bestMoveSan} manteneva maggiore controllo.`;
  }
  if (classification === 'book') {
    return 'Mossa teorica di apertura.';
  }
  return 'Mossa solida e coerente con la posizione.';
}

function summarizeSide(moves: AnalyzedMove[], color: PieceColor): PlayerSideSummary {
  const sideMoves = moves.filter((m) => m.color === color);
  const calcAcc = (arr: AnalyzedMove[]): number => {
    if (arr.length === 0) return 100;
    const avgLoss =
      arr.reduce((sum, m) => sum + Math.min(600, m.cpLoss), 0) / arr.length;
    return Math.max(10, Math.min(99, Math.round(100 * Math.exp(-avgLoss / 175))));
  };

  const counts = {
    book: 0,
    brilliant: 0,
    great: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    missedWin: 0,
  };

  for (const m of sideMoves) {
    if (m.classification === 'book') counts.book++;
    else if (m.classification === 'brilliant') counts.brilliant++;
    else if (m.classification === 'great') counts.great++;
    else if (m.classification === 'good') counts.good++;
    else if (m.classification === 'inaccuracy') counts.inaccuracy++;
    else if (m.classification === 'mistake') counts.mistake++;
    else if (m.classification === 'blunder') counts.blunder++;
    else if (m.classification === 'missed_win') counts.missedWin++;
  }

  return {
    accuracyPct: calcAcc(sideMoves),
    openingAcc: calcAcc(sideMoves.filter((m) => m.phase === 'opening')),
    middlegameAcc: calcAcc(sideMoves.filter((m) => m.phase === 'middlegame')),
    endgameAcc: calcAcc(sideMoves.filter((m) => m.phase === 'endgame')),
    ...counts,
  };
}

export interface RawMoveEntry {
  san: string;
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  captured?: string;
  color: PieceColor;
  fenBefore: string;
  fenAfter: string;
}

export interface ParsedGameInput {
  id: string;
  source: 'biochess' | 'pgn';
  whiteUsername: string;
  blackUsername: string;
  whiteElo?: number;
  blackElo?: number;
  playerColor: PieceColor;
  result: 'win' | 'loss' | 'draw';
  resultLabel: string;
  endReason: string;
  pgn: string;
  rawMoves: RawMoveEntry[];
}

export function parsePgnForAnalysis(
  pgnText: string,
  preferredColor: PieceColor = 'w',
  myUsername?: string
): { ok: true; parsed: ParsedGameInput } | { ok: false; error: string } {
  const cleaned = pgnText.trim();
  if (!cleaned) {
    return { ok: false, error: 'Incolla un PGN valido prima di avviare l’analisi.' };
  }

  const chess = new Chess();
  try {
    chess.loadPgn(cleaned);
  } catch {
    return {
      ok: false,
      error: 'PGN non valido o illeggibile. Verifica le mosse algebriche (es. 1. e4 e5 2. Nf3 Nc6).',
    };
  }

  const history = chess.history({ verbose: true }) as Move[];
  if (history.length === 0) {
    return { ok: false, error: 'Il PGN non contiene alcuna mossa da analizzare.' };
  }

  const headers = chess.header();
  const whiteName = (headers.White || 'Bianco').slice(0, 32);
  const blackName = (headers.Black || 'Nero').slice(0, 32);
  const whiteElo = headers.WhiteElo ? parseInt(headers.WhiteElo, 10) : undefined;
  const blackElo = headers.BlackElo ? parseInt(headers.BlackElo, 10) : undefined;

  let detectedColor: PieceColor = preferredColor;
  if (myUsername) {
    const low = myUsername.toLowerCase();
    if (blackName.toLowerCase() === low && whiteName.toLowerCase() !== low) {
      detectedColor = 'b';
    } else if (whiteName.toLowerCase() === low && blackName.toLowerCase() !== low) {
      detectedColor = 'w';
    }
  }

  const resStr = headers.Result || '*';
  let result: 'win' | 'loss' | 'draw' = 'draw';
  let resultLabel = '½-½';
  if (resStr === '1-0') {
    result = detectedColor === 'w' ? 'win' : 'loss';
    resultLabel = '1-0';
  } else if (resStr === '0-1') {
    result = detectedColor === 'b' ? 'win' : 'loss';
    resultLabel = '0-1';
  } else if (resStr === '1/2-1/2') {
    result = 'draw';
    resultLabel = '½-½';
  } else if (chess.isCheckmate()) {
    const winnerColor: PieceColor = chess.turn() === 'w' ? 'b' : 'w';
    result = winnerColor === detectedColor ? 'win' : 'loss';
    resultLabel = winnerColor === 'w' ? '1-0' : '0-1';
  } else if (chess.isDraw()) {
    result = 'draw';
    resultLabel = '½-½';
  } else {
    resultLabel = '*';
  }

  const rawMoves: RawMoveEntry[] = [];
  try {
    const startFenHeader = headers.FEN || headers.Fen;
    let fallbackReplay: Chess | null = null;
    for (const m of history) {
      let fenBefore = typeof m.before === 'string' && m.before ? m.before : '';
      let fenAfter = typeof m.after === 'string' && m.after ? m.after : '';

      if (!fenBefore || !fenAfter) {
        if (!fallbackReplay) {
          fallbackReplay = startFenHeader ? new Chess(startFenHeader) : new Chess();
        }
        fenBefore = fallbackReplay.fen();
        const res = fallbackReplay.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
        });
        fenAfter = fallbackReplay.fen();
        rawMoves.push({
          san: res.san,
          from: res.from,
          to: res.to,
          promotion: res.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
          captured: res.captured,
          color: res.color,
          fenBefore,
          fenAfter,
        });
      } else {
        rawMoves.push({
          san: m.san,
          from: m.from,
          to: m.to,
          promotion: m.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
          captured: m.captured,
          color: m.color,
          fenBefore,
          fenAfter,
        });
      }
    }
  } catch (err) {
    console.warn('[BioChess][Coach] Failed extracting PGN moves cleanly:', err);
    if (rawMoves.length === 0) {
      return {
        ok: false,
        error: 'PGN non valido o incompleto: impossibile ricostruire le mosse della partita.',
      };
    }
  }

  // Deterministic short hash for PGN deduplication
  let hash = 2166136261;
  for (let i = 0; i < cleaned.length; i++) {
    hash ^= cleaned.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const pgnId = `pgn_${(hash >>> 0).toString(36)}`;

  return {
    ok: true,
    parsed: {
      id: pgnId,
      source: 'pgn',
      whiteUsername: whiteName,
      blackUsername: blackName,
      whiteElo: Number.isFinite(whiteElo) ? whiteElo : undefined,
      blackElo: Number.isFinite(blackElo) ? blackElo : undefined,
      playerColor: detectedColor,
      result,
      resultLabel,
      endReason: headers.Termination || headers.Event || 'Partita importata da PGN',
      pgn: chess.pgn(),
      rawMoves,
    },
  };
}

export function gameStateToParsedInput(
  game: GameState,
  myUsername: string
): ParsedGameInput {
  const playerColor: PieceColor =
    !game.white.isBot && game.white.username.toLowerCase() === myUsername.toLowerCase()
      ? 'w'
      : 'b';

  const result: 'win' | 'loss' | 'draw' =
    game.winner === 'draw' || !game.winner
      ? 'draw'
      : game.winner === playerColor
        ? 'win'
        : 'loss';

  const resultLabel =
    game.winner === 'w' ? '1-0' : game.winner === 'b' ? '0-1' : '½-½';

  const rawMoves: RawMoveEntry[] = [];
  for (let i = 0; i < game.moves.length; i++) {
    const m = game.moves[i];
    const fenBefore = i === 0 ? START_FEN : game.moves[i - 1]?.fen || START_FEN;
    rawMoves.push({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
      captured: m.captured,
      color: m.color,
      fenBefore,
      fenAfter: m.fen,
    });
  }

  return {
    id: game.id,
    source: 'biochess',
    whiteUsername: game.white.username,
    blackUsername: game.black.username,
    whiteElo: game.white.elo,
    blackElo: game.black.elo,
    playerColor,
    result,
    resultLabel,
    endReason: game.endReason || 'Partita BioChess',
    pgn: game.pgn,
    rawMoves,
  };
}

export async function analyzeFullGameWithEngine(
  parsed: ParsedGameInput,
  onProgress?: (completed: number, total: number) => void
): Promise<FullGameAnalysis> {
  const total = parsed.rawMoves.length;
  const evalCache = new Map<string, ReturnType<typeof searchPositionWithPv>>();

  const getEval = (fen: string) => {
    if (evalCache.has(fen)) return evalCache.get(fen)!;
    const res = searchPositionWithPv(fen, { maxDepth: 3, budgetMs: 14, quiescencePlies: 3 }, 1);
    evalCache.set(fen, res);
    return res;
  };

  const analyzedMoves: AnalyzedMove[] = [];
  const sans = parsed.rawMoves.map((m) => m.san);
  const opening = detectOpeningFromSans(sans);

  for (let i = 0; i < total; i++) {
    const raw = parsed.rawMoves[i];
    const beforeEval = getEval(raw.fenBefore);
    let isTerminalMate = false;
    let isTerminalDraw = false;
    try {
      const afterChess = new Chess(raw.fenAfter);
      isTerminalMate = afterChess.isCheckmate();
      isTerminalDraw = afterChess.isDraw();
    } catch {
      isTerminalMate = false;
      isTerminalDraw = false;
    }

    const afterEval = isTerminalMate
      ? {
          scoreCpWhite: raw.color === 'w' ? 30000 : -30000,
          mateIn: 0,
          bestFrom: raw.from,
          bestTo: raw.to,
          pv: [],
          reachedDepth: 3,
        }
      : isTerminalDraw
        ? {
            scoreCpWhite: 0,
            bestFrom: raw.from,
            bestTo: raw.to,
            pv: [],
            reachedDepth: 3,
          }
        : getEval(raw.fenAfter);

    const moverSign = raw.color === 'w' ? 1 : -1;
    const evalBeforeWhiteCp = beforeEval?.scoreCpWhite ?? 0;
    const evalAfterWhiteCp = isTerminalMate
      ? raw.color === 'w'
        ? 30000
        : -30000
      : isTerminalDraw
        ? 0
        : (afterEval?.scoreCpWhite ?? evalBeforeWhiteCp);

    const evalBeforeMoverCp = evalBeforeWhiteCp * moverSign;
    const evalAfterMoverCp = evalAfterWhiteCp * moverSign;

    const bestFrom = beforeEval?.bestFrom || raw.from;
    const bestTo = beforeEval?.bestTo || raw.to;
    const bestPromo = beforeEval?.bestPromo;
    const bestMoveSan = moveToSan(raw.fenBefore, bestFrom, bestTo, bestPromo);
    const bestPvSan = [bestMoveSan];
    const playedPvSan: string[] = [];

    const playedWasBest =
      bestFrom === raw.from &&
      bestTo === raw.to &&
      (!bestPromo || !raw.promotion || bestPromo === raw.promotion);

    const cpLoss = isTerminalMate || playedWasBest
      ? 0
      : Math.max(0, Math.round(evalBeforeMoverCp - evalAfterMoverCp));

    const evalSwingCp = Math.abs(evalAfterWhiteCp - evalBeforeWhiteCp);
    const phase = getGamePhase(raw.fenBefore, i);

    const mateBeforeForMover = beforeEval?.mateIn ? beforeEval.mateIn * moverSign : undefined;
    const mateAfterForMover = afterEval?.mateIn ? afterEval.mateIn * moverSign : undefined;

    let classification: CoachMoveClass = 'good';

    if (isTerminalMate) {
      classification = 'great';
    } else if (
      (mateAfterForMover !== undefined && mateAfterForMover < 0) ||
      cpLoss >= 250 ||
      (evalBeforeMoverCp >= 300 && evalAfterMoverCp < 50 && cpLoss >= 220)
    ) {
      if (evalBeforeMoverCp >= 320 && evalAfterMoverCp >= 40 && mateAfterForMover === undefined) {
        classification = 'missed_win';
      } else {
        classification = 'blunder';
      }
    } else if (
      (mateBeforeForMover !== undefined && mateBeforeForMover > 0 && !mateAfterForMover) ||
      (evalBeforeMoverCp >= 280 && evalAfterMoverCp <= 90 && cpLoss >= 170)
    ) {
      classification = 'missed_win';
    } else if (i < 10 && cpLoss <= 55 && Math.abs(evalBeforeWhiteCp) < 160) {
      classification = 'book';
    } else if (cpLoss >= 100) {
      classification = 'mistake';
    } else if (cpLoss >= 46) {
      classification = 'inaccuracy';
    } else if (
      cpLoss <= 25 &&
      (evalAfterMoverCp >= 60 || (mateAfterForMover !== undefined && mateAfterForMover > 0)) &&
      detectGenuineSacrifice(raw.fenBefore, raw.from, raw.to, raw.promotion)
    ) {
      // Verify soundness and non-crushing alternative gap at depth 5 (only runs on genuine sacrifice candidates)
      const vRes = searchBestMoves(raw.fenBefore, {
        maxDepth: 5,
        budgetMs: 100,
        quiescencePlies: 5,
      });
      let confirmedBrilliant = false;
      if (vRes && vRes.ranked.length > 0) {
        const vBest = vRes.ranked[0].scoreCp;
        const vSecond = vRes.ranked[1]?.scoreCp ?? vBest;
        const targetPromo = raw.promotion || 'q';
        const vPlayedEntry = vRes.ranked.find(
          (e) => e.from === raw.from && e.to === raw.to && (!e.promo || e.promo === targetPromo)
        );
        const vPlayed = vPlayedEntry ? vPlayedEntry.scoreCp : vBest - 120;
        const vCpLoss = Math.max(0, Math.round(vBest - vPlayed));
        if (
          vCpLoss <= 15 &&
          (vPlayed >= 80 || vPlayed >= 25000) &&
          vSecond < 750 &&
          vBest - vSecond >= 85
        ) {
          confirmedBrilliant = true;
        }
      }
      classification = confirmedBrilliant ? 'brilliant' : 'good';
    } else if (playedWasBest && evalSwingCp <= 35 && Math.abs(evalBeforeMoverCp) >= 80 && cpLoss === 0 && i >= 8 && Math.abs(evalBeforeMoverCp) < 1500) {
      classification = raw.san.includes('+') ? 'great' : 'good';
    } else {
      classification = 'good';
    }

    const tacticalNote = buildTacticalNote({
      color: raw.color,
      san: raw.san,
      bestMoveSan,
      classification,
      cpLoss,
      evalBeforeMoverCp,
      evalAfterMoverCp,
      mateBefore: beforeEval?.mateIn,
      mateAfter: afterEval?.mateIn,
      bestPvSan,
      playedPvSan,
    });

    analyzedMoves.push({
      ply: i,
      moveNumber: Math.floor(i / 2) + 1,
      color: raw.color,
      san: raw.san,
      from: raw.from,
      to: raw.to,
      promotion: raw.promotion,
      captured: raw.captured,
      fenBefore: raw.fenBefore,
      fenAfter: raw.fenAfter,
      evalBeforeWhiteCp,
      evalAfterWhiteCp,
      mateBefore: beforeEval?.mateIn,
      mateAfter: afterEval?.mateIn,
      bestMoveSan,
      bestMoveFrom: bestFrom,
      bestMoveTo: bestTo,
      bestMovePromo: bestPromo as 'q' | 'r' | 'b' | 'n' | undefined,
      bestPvSan,
      playedPvSan,
      cpLoss,
      evalSwingCp,
      classification,
      phase,
      isDecisiveMoment: false,
      tacticalNote,
    });

    if (onProgress && (i % 4 === 3 || i === total - 1)) {
      onProgress(i + 1, total);
    }
    if (i % 12 === 11) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Identify top 5 decisive moments across the game
  const candidates = analyzedMoves
    .filter(
      (m) =>
        m.classification === 'blunder' ||
        m.classification === 'missed_win' ||
        m.classification === 'mistake' ||
        m.classification === 'brilliant' ||
        m.cpLoss >= 95
    )
    .map((m) => {
      const playerWeight = m.color === parsed.playerColor ? 1.35 : 0.9;
      const severity =
        m.classification === 'blunder'
          ? 400
          : m.classification === 'missed_win'
            ? 350
            : m.classification === 'brilliant'
              ? 280
              : 180;
      return {
        ply: m.ply,
        priority: (severity + Math.min(600, m.cpLoss)) * playerWeight,
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((c) => c.ply);

  const decisiveSet = new Set(candidates);
  for (const m of analyzedMoves) {
    if (!decisiveSet.has(m.ply)) continue;
    m.isDecisiveMoment = true;

    // Enrich ONLY the decisive moments with 4-ply Principal Variations for instant coaching accuracy
    const deepBefore = searchPositionWithPv(
      m.fenBefore,
      { maxDepth: 4, budgetMs: 26, quiescencePlies: 4 },
      4
    );
    if (deepBefore && deepBefore.pv.length > 0) {
      m.bestPvSan = pvUciToSan(m.fenBefore, deepBefore.pv);
    }

    try {
      const afterCh = new Chess(m.fenAfter);
      if (!afterCh.isGameOver()) {
        const deepAfter = searchPositionWithPv(
          m.fenAfter,
          { maxDepth: 3, budgetMs: 18, quiescencePlies: 3 },
          3
        );
        if (deepAfter && deepAfter.pv.length > 0) {
          m.playedPvSan = pvUciToSan(m.fenAfter, deepAfter.pv);
        }
      }
    } catch {
      // ignore invalid fenAfter
    }

    const moverSign = m.color === 'w' ? 1 : -1;
    m.tacticalNote = buildTacticalNote({
      color: m.color,
      san: m.san,
      bestMoveSan: m.bestMoveSan,
      classification: m.classification,
      cpLoss: m.cpLoss,
      evalBeforeMoverCp: m.evalBeforeWhiteCp * moverSign,
      evalAfterMoverCp: m.evalAfterWhiteCp * moverSign,
      mateBefore: m.mateBefore,
      mateAfter: m.mateAfter,
      bestPvSan: m.bestPvSan,
      playedPvSan: m.playedPvSan,
    });
  }

  const decisiveMoments = analyzedMoves.filter((m) => m.isDecisiveMoment);
  const whiteStats = summarizeSide(analyzedMoves, 'w');
  const blackStats = summarizeSide(analyzedMoves, 'b');

  return {
    id: parsed.id,
    source: parsed.source,
    whiteUsername: parsed.whiteUsername,
    blackUsername: parsed.blackUsername,
    whiteElo: parsed.whiteElo,
    blackElo: parsed.blackElo,
    playerColor: parsed.playerColor,
    result: parsed.result,
    resultLabel: parsed.resultLabel,
    endReason: parsed.endReason,
    openingEco: opening.eco,
    openingName: opening.name,
    pgn: parsed.pgn,
    moves: analyzedMoves,
    decisiveMoments,
    whiteStats,
    blackStats,
    analyzedAtMs: Date.now(),
  };
}

export function getMoveVariationOnDemand(move: AnalyzedMove): string[] {
  if (move.bestPvSan.length > 1) return move.bestPvSan;
  const deep = searchPositionWithPv(
    move.fenBefore,
    { maxDepth: 3, budgetMs: 24, quiescencePlies: 3 },
    4
  );
  if (deep && deep.pv.length > 0) {
    const line = pvUciToSan(move.fenBefore, deep.pv);
    if (line.length > 0) {
      move.bestPvSan = line;
      return line;
    }
  }
  return move.bestPvSan;
}

export function analysisToSavedReview(analysis: FullGameAnalysis): SavedGameReview {
  const mySide = analysis.playerColor === 'w' ? analysis.whiteStats : analysis.blackStats;
  return {
    id: analysis.id,
    whiteUsername: analysis.whiteUsername.slice(0, 32),
    blackUsername: analysis.blackUsername.slice(0, 32),
    playerColor: analysis.playerColor,
    result: analysis.result,
    accuracyPct: mySide.accuracyPct,
    openingName: analysis.openingName.slice(0, 80),
    openingAcc: mySide.openingAcc,
    middlegameAcc: mySide.middlegameAcc,
    endgameAcc: mySide.endgameAcc,
    brilliantCount: mySide.brilliant,
    greatCount: mySide.great,
    goodCount: mySide.good,
    inaccuracyCount: mySide.inaccuracy,
    mistakeCount: mySide.mistake,
    blunderCount: mySide.blunder,
    missedWinCount: mySide.missedWin,
    movesCount: analysis.moves.length,
    source: analysis.source,
    pgn: analysis.pgn.slice(0, 8000),
    createdAtMs: analysis.analyzedAtMs,
  };
}

export function evaluateStudentMoveOnPosition(
  fenBefore: string,
  from: string,
  to: string,
  promotion: 'q' | 'r' | 'b' | 'n' | undefined,
  engineBestSan: string,
  engineBestEvalWhiteCp: number
): StudentAttemptEvaluation | null {
  let chess: Chess;
  try {
    chess = new Chess(fenBefore);
  } catch {
    return null;
  }
  const moverColor = chess.turn();
  const moverSign = moverColor === 'w' ? 1 : -1;

  let moveRes: Move;
  try {
    moveRes = chess.move({ from, to, promotion: promotion || 'q' });
  } catch {
    return null;
  }

  const afterFen = chess.fen();
  const isMate = chess.isCheckmate();
  const isDraw = chess.isDraw();
  const afterRes = isMate || isDraw
    ? null
    : searchPositionWithPv(afterFen, { maxDepth: 4, budgetMs: 55, quiescencePlies: 4 }, 4);

  const studentEvalWhiteCp = isMate
    ? moverColor === 'w'
      ? 30000
      : -30000
    : isDraw
      ? 0
      : (afterRes?.scoreCpWhite ?? 0);

  const bestMoverCp = engineBestEvalWhiteCp * moverSign;
  const studentMoverCp = studentEvalWhiteCp * moverSign;
  const cpLoss = isMate || moveRes.san === engineBestSan
    ? 0
    : Math.max(0, Math.round(bestMoverCp - studentMoverCp));

  const refutationLineSan = afterRes ? pvUciToSan(afterFen, afterRes.pv) : [];

  let verdict: StudentAttemptEvaluation['verdict'] = 'inaccurate';
  if (moveRes.san === engineBestSan || isMate) {
    verdict = 'exact_best';
  } else if (cpLoss <= 40) {
    verdict = 'strong_alternative';
  } else if (cpLoss >= 200 || (afterRes?.mateIn && afterRes.mateIn * moverSign < 0)) {
    verdict = 'blunder';
  }

  return {
    san: moveRes.san,
    from: moveRes.from,
    to: moveRes.to,
    isBest: moveRes.san === engineBestSan || isMate,
    cpLossVsBest: cpLoss,
    evalWhiteCp: studentEvalWhiteCp,
    mateIn: afterRes?.mateIn,
    refutationLineSan,
    verdict,
  };
}
