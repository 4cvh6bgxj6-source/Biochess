import { Chess } from 'chess.js';
import type { Move, PieceSymbol } from 'chess.js';
import type { BotId, GameMove, MoveQuality, PieceColor } from './types';
import {
  pickBookMoveSan,
  searchBestMoves,
  searchPositionWithPv,
  type EnginePvResult,
  type SearchConfig,
} from './fast-chess-engine';
import {
  getLocalizedBotChatReply,
  getLocalizedBotGreeting,
  getLocalizedBotMoveComment,
  getLocalizedBotQualityReaction,
  type BotMoveEvent,
} from './bot-dialogue';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

export function getMaterialBalance(chess: Chess, perspective: PieceColor): number {
  const board = chess.board();
  let mat = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = board[row][col];
      if (!sq || sq.type === 'k') continue;
      const val = PIECE_VALUES[sq.type];
      mat += sq.color === perspective ? val : -val;
    }
  }
  return mat;
}

function scoreMoveOrder(move: Move): number {
  let score = 0;
  if (move.captured) {
    score += 10 * PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece];
  }
  if (move.promotion) {
    score += PIECE_VALUES[move.promotion];
  }
  if (move.san.includes('+')) {
    score += 65;
  }
  if (move.san.includes('#')) {
    score += 50000;
  }
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return moves.sort((a, b) => scoreMoveOrder(b) - scoreMoveOrder(a));
}

type BoardMatrix = ReturnType<Chess['board']>;

const SQ_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function algebraicToRC(sq: string): { r: number; c: number } {
  const c = SQ_FILES.indexOf(sq[0]);
  const r = 8 - parseInt(sq[1], 10);
  return { r, c };
}

function rcToAlgebraic(r: number, c: number): string {
  return `${SQ_FILES[c]}${8 - r}`;
}

function cloneBoardMatrix(board: BoardMatrix): BoardMatrix {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function isInsideBoard(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function hasAnyAttacker(
  board: BoardMatrix,
  tr: number,
  tc: number,
  side: PieceColor
): boolean {
  // Pawns attacking (tr, tc): White pawns attack from r+1, Black pawns from r-1
  const pawnFromR = side === 'w' ? tr + 1 : tr - 1;
  for (const dc of [-1, 1]) {
    const pc = tc + dc;
    if (isInsideBoard(pawnFromR, pc)) {
      const p = board[pawnFromR][pc];
      if (p && p.color === side && p.type === 'p') return true;
    }
  }

  // Knights
  const knightSteps = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knightSteps) {
    const nr = tr + dr;
    const nc = tc + dc;
    if (isInsideBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === side && p.type === 'n') return true;
    }
  }

  // Diagonal sliders (Bishop / Queen)
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let nr = tr + dr;
    let nc = tc + dc;
    while (isInsideBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === side && (p.type === 'b' || p.type === 'q')) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Orthogonal sliders (Rook / Queen)
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    let nr = tr + dr;
    let nc = tc + dc;
    while (isInsideBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === side && (p.type === 'r' || p.type === 'q')) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // King
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = tr + dr;
      const nc = tc + dc;
      if (isInsideBoard(nr, nc)) {
        const p = board[nr][nc];
        if (p && p.color === side && p.type === 'k') return true;
      }
    }
  }

  return false;
}

function findLeastValuableAttacker(
  board: BoardMatrix,
  tr: number,
  tc: number,
  side: PieceColor,
  allowedFromSquares?: Set<string>
): { r: number; c: number; type: PieceSymbol } | null {
  let best: { r: number; c: number; type: PieceSymbol } | null = null;
  let bestVal = Infinity;

  const consider = (r: number, c: number, type: PieceSymbol) => {
    if (allowedFromSquares && !allowedFromSquares.has(rcToAlgebraic(r, c))) return;
    const val = PIECE_VALUES[type];
    if (val < bestVal) {
      bestVal = val;
      best = { r, c, type };
    }
  };

  // Pawns
  const pawnFromR = side === 'w' ? tr + 1 : tr - 1;
  for (const dc of [-1, 1]) {
    const pc = tc + dc;
    if (isInsideBoard(pawnFromR, pc)) {
      const p = board[pawnFromR][pc];
      if (p && p.color === side && p.type === 'p') consider(pawnFromR, pc, 'p');
    }
  }

  // Knights
  const knightSteps = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knightSteps) {
    const nr = tr + dr;
    const nc = tc + dc;
    if (isInsideBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === side && p.type === 'n') consider(nr, nc, 'n');
    }
  }

  // Diagonal sliders
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let nr = tr + dr;
    let nc = tc + dc;
    while (isInsideBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === side && (p.type === 'b' || p.type === 'q')) {
          consider(nr, nc, p.type);
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Orthogonal sliders
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    let nr = tr + dr;
    let nc = tc + dc;
    while (isInsideBoard(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === side && (p.type === 'r' || p.type === 'q')) {
          consider(nr, nc, p.type);
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // King
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = tr + dr;
      const nc = tc + dc;
      if (isInsideBoard(nr, nc)) {
        const p = board[nr][nc];
        if (p && p.color === side && p.type === 'k') consider(nr, nc, 'k');
      }
    }
  }

  return best;
}

/**
 * Static Exchange Evaluation (SEE) on square (targetR, targetC):
 * Returns how many centipawns `attackerColor` nets by initiating optimal captures on that square (>= 0).
 */
function computeSeeGainOnSquare(
  sourceBoard: BoardMatrix,
  targetR: number,
  targetC: number,
  attackerColor: PieceColor,
  legalFirstFromSquares?: Set<string>
): number {
  const targetPiece = sourceBoard[targetR]?.[targetC];
  if (!targetPiece || targetPiece.color === attackerColor || targetPiece.type === 'k') {
    return 0;
  }

  const board = cloneBoardMatrix(sourceBoard);
  const firstAttacker = findLeastValuableAttacker(
    board,
    targetR,
    targetC,
    attackerColor,
    legalFirstFromSquares
  );
  if (!firstAttacker) return 0;

  const gain: number[] = [PIECE_VALUES[targetPiece.type]];
  let pieceOnTarget: PieceSymbol = firstAttacker.type;
  board[firstAttacker.r][firstAttacker.c] = null;

  let side: PieceColor = attackerColor === 'w' ? 'b' : 'w';
  for (let depth = 1; depth < 16; depth++) {
    const nextAtt = findLeastValuableAttacker(board, targetR, targetC, side);
    if (!nextAtt) break;

    if (nextAtt.type === 'k') {
      const otherSide: PieceColor = side === 'w' ? 'b' : 'w';
      if (hasAnyAttacker(board, targetR, targetC, otherSide)) {
        break;
      }
    }

    gain.push(PIECE_VALUES[pieceOnTarget] - gain[depth - 1]);
    pieceOnTarget = nextAtt.type;
    board[nextAtt.r][nextAtt.c] = null;
    side = side === 'w' ? 'b' : 'w';
  }

  for (let d = gain.length - 1; d > 0; d--) {
    gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
  }

  return Math.max(0, gain[0]);
}

/**
 * Checks whether a move genuinely sacrifices >= 180cp of material via Static Exchange Evaluation (SEE),
 * either by placing the moved piece on a square where the opponent profitably captures it,
 * or by leaving another high-value piece newly/profitably en prise.
 */
export function detectGenuineSacrifice(
  fenBefore: string,
  from: string,
  to: string,
  promotion?: 'q' | 'r' | 'b' | 'n'
): boolean {
  try {
    const chess = new Chess(fenBefore);
    if (chess.moveNumber() < 4) return false;

    const perspective = chess.turn();
    const oppColor: PieceColor = perspective === 'w' ? 'b' : 'w';
    const targetPromo = promotion || 'q';

    const legalMoves = chess.moves({ verbose: true });
    const played = legalMoves.find(
      (m) => m.from === from && m.to === to && (!m.promotion || m.promotion === targetPromo)
    );
    if (!played) return false;
    if (played.promotion || PIECE_VALUES[played.piece] < 300) return false;

    const capturedVal = played.captured ? PIECE_VALUES[played.captured] : 0;
    const boardBefore = chess.board();

    chess.move(played);
    if (chess.isCheckmate()) return false;

    const oppMoves = chess.moves({ verbose: true });
    const legalCapsByTarget = new Map<string, Set<string>>();
    for (const om of oppMoves) {
      if (!om.captured) continue;
      let set = legalCapsByTarget.get(om.to);
      if (!set) {
        set = new Set<string>();
        legalCapsByTarget.set(om.to, set);
      }
      set.add(om.from);
    }

    if (legalCapsByTarget.size === 0) return false;

    const boardAfter = chess.board();

    // 1) Direct sacrifice on destination square `to`
    const toLegalAttackers = legalCapsByTarget.get(to);
    if (toLegalAttackers) {
      const { r, c } = algebraicToRC(to);
      const seeOnTo = computeSeeGainOnSquare(boardAfter, r, c, oppColor, toLegalAttackers);
      if (capturedVal - seeOnTo <= -180) {
        return true;
      }
    }

    // 2) Counter-attack / discovered sacrifice leaving another friendly piece profitably capturable
    for (const [sq, legalFroms] of legalCapsByTarget.entries()) {
      if (sq === to) continue;
      const { r, c } = algebraicToRC(sq);
      const victim = boardAfter[r]?.[c];
      if (!victim || victim.color !== perspective || PIECE_VALUES[victim.type] < 300) {
        continue;
      }
      const seeAfter = computeSeeGainOnSquare(boardAfter, r, c, oppColor, legalFroms);
      if (capturedVal - seeAfter > -180) continue;

      const seeBefore = computeSeeGainOnSquare(boardBefore, r, c, oppColor);
      // Either this move newly exposed the piece, or deliberately left a Rook/Queen en prise for tactical compensation
      if (seeAfter > seeBefore + 140 || (seeAfter >= 450 && !played.captured)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export const UNIFIED_EVAL_CONFIG: SearchConfig = {
  maxDepth: 3,
  budgetMs: 350,
  quiescencePlies: 4,
  deterministic: true,
  maxNodes: 150000,
};

export type UnifiedMoveClass =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'missed_win';

export interface UnifiedClassifyInput {
  fenBefore: string;
  fenAfter: string;
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  captured?: string;
  san: string;
  color: PieceColor;
  plyIndex: number;
  legalMovesCount?: number;
  lastMove?: { to: string; captured?: string };
  beforeEval: EnginePvResult | null;
  afterEval: EnginePvResult | null;
  isTerminalMate: boolean;
  isTerminalDraw: boolean;
  getSecondBestEval?: () => EnginePvResult | null;
}

export interface UnifiedClassifyOutput {
  classification: UnifiedMoveClass;
  cpLoss: number;
  evalBeforeWhiteCp: number;
  evalAfterWhiteCp: number;
  evalSwingCp: number;
  bestFrom: string;
  bestTo: string;
  bestPromo?: 'n' | 'b' | 'r' | 'q';
  mateBefore?: number;
  mateAfter?: number;
}

export function classifyMoveUnified(input: UnifiedClassifyInput): UnifiedClassifyOutput {
  const {
    fenBefore,
    fenAfter,
    from,
    to,
    promotion,
    captured,
    san,
    color,
    plyIndex,
    legalMovesCount,
    lastMove,
    beforeEval,
    afterEval,
    isTerminalMate,
    isTerminalDraw,
    getSecondBestEval,
  } = input;

  const moverSign = color === 'w' ? 1 : -1;
  const evalBeforeWhiteCp = beforeEval?.scoreCpWhite ?? 0;
  const evalAfterWhiteCp = isTerminalMate
    ? color === 'w'
      ? 30000
      : -30000
    : isTerminalDraw
      ? 0
      : (afterEval?.scoreCpWhite ?? evalBeforeWhiteCp);

  const evalBeforeMoverCp = evalBeforeWhiteCp * moverSign;
  const evalAfterMoverCp = evalAfterWhiteCp * moverSign;

  const bestFrom = beforeEval?.bestFrom || from;
  const bestTo = beforeEval?.bestTo || to;
  const bestPromo = beforeEval?.bestPromo;

  const targetPromo = promotion || 'q';
  const playedWasBest =
    bestFrom === from &&
    bestTo === to &&
    (!bestPromo || bestPromo === targetPromo);

  const cpLoss =
    isTerminalMate || playedWasBest
      ? 0
      : Math.max(0, Math.round(evalBeforeMoverCp - evalAfterMoverCp));

  const evalSwingCp = Math.abs(evalAfterWhiteCp - evalBeforeWhiteCp);
  const mateBeforeForMover = beforeEval?.mateIn ? beforeEval.mateIn * moverSign : undefined;
  const mateAfterForMover = afterEval?.mateIn ? afterEval.mateIn * moverSign : undefined;

  const makeResult = (classification: UnifiedMoveClass, finalCpLoss = cpLoss): UnifiedClassifyOutput => ({
    classification,
    cpLoss: Number.isFinite(finalCpLoss) ? Math.max(0, Math.round(finalCpLoss)) : 0,
    evalBeforeWhiteCp,
    evalAfterWhiteCp,
    evalSwingCp,
    bestFrom,
    bestTo,
    bestPromo,
    mateBefore: beforeEval?.mateIn,
    mateAfter: afterEval?.mateIn,
  });

  if (isTerminalMate) {
    return makeResult('great', 0);
  }

  if (typeof legalMovesCount === 'number' && legalMovesCount <= 1) {
    return makeResult('good', 0);
  }

  const losingAlreadyToForcedMate =
    mateBeforeForMover !== undefined && mateBeforeForMover < 0 && playedWasBest;

  if (
    !losingAlreadyToForcedMate &&
    !playedWasBest &&
    ((mateAfterForMover !== undefined && mateAfterForMover < 0) ||
      (mateBeforeForMover !== undefined &&
        mateBeforeForMover > 0 &&
        (mateAfterForMover === undefined || mateAfterForMover <= 0) &&
        evalAfterMoverCp < 250) ||
      (mateBeforeForMover === undefined && cpLoss >= 250) ||
      (evalBeforeMoverCp >= 300 && evalAfterMoverCp < 50 && cpLoss >= 220))
  ) {
    return makeResult('blunder');
  }

  if (
    !playedWasBest &&
    mateBeforeForMover !== undefined &&
    mateBeforeForMover > 0 &&
    (mateAfterForMover === undefined || mateAfterForMover <= 0)
  ) {
    return makeResult('mistake');
  }

  if (plyIndex < 8 && cpLoss <= 35 && Math.abs(evalBeforeWhiteCp) < 160) {
    return makeResult('book');
  }

  if (cpLoss >= 100) {
    return makeResult('mistake');
  }

  if (cpLoss >= 45) {
    return makeResult('inaccuracy');
  }

  // Brilliant (!!): genuine SEE sacrifice + full-window depth-4 soundness & alternative gap verification
  if (
    cpLoss <= 25 &&
    (evalAfterMoverCp >= 60 || (mateAfterForMover !== undefined && mateAfterForMover > 0)) &&
    detectGenuineSacrifice(fenBefore, from, to, promotion)
  ) {
    const deepAfter = searchPositionWithPv(
      fenAfter,
      {
        maxDepth: 4,
        budgetMs: 400,
        quiescencePlies: 5,
        deterministic: true,
        maxNodes: 220000,
      },
      1
    );
    const deepSecond = searchPositionWithPv(
      fenBefore,
      {
        maxDepth: 4,
        budgetMs: 400,
        quiescencePlies: 5,
        deterministic: true,
        maxNodes: 220000,
        excludeMove: { from, to, promo: targetPromo },
      },
      1
    );

    if (deepAfter && deepSecond) {
      const vPlayed = deepAfter.scoreCpWhite * moverSign;
      const vSecond = deepSecond.scoreCpWhite * moverSign;
      const vMateForMover = deepAfter.mateIn ? deepAfter.mateIn * moverSign : undefined;
      const vCpLoss = playedWasBest ? 0 : Math.max(0, Math.round(vSecond - vPlayed));

      if (vPlayed <= -20000 || (!playedWasBest && vCpLoss >= 250)) {
        return makeResult('blunder', Math.max(cpLoss, vCpLoss));
      }
      if (!playedWasBest && vCpLoss >= 100) {
        return makeResult('mistake', Math.max(cpLoss, vCpLoss));
      }
      if (
        (vPlayed >= 80 || (vMateForMover !== undefined && vMateForMover > 0)) &&
        vSecond < 750 &&
        vPlayed - vSecond >= 85
      ) {
        return makeResult('brilliant', 0);
      }
    }
  }

  // Great (!): strictly best/near-best move that is NOT an obvious recapture/free capture and beats alternatives by >= 95cp
  const isCapture = Boolean(captured);
  const givesCheck = san.includes('+') || san.includes('#');
  const isImmediateRecapture = Boolean(
    lastMove?.captured && captured && to === lastMove.to
  );

  let isObviousFreeCapture = false;
  if (isCapture && !givesCheck && captured && evalAfterMoverCp < 25000) {
    const capVal = PIECE_VALUES[captured as PieceSymbol] || 0;
    if (capVal >= 100) {
      try {
        const afterCh = new Chess(fenAfter);
        const { r, c } = algebraicToRC(to);
        const seeLoss = computeSeeGainOnSquare(afterCh.board(), r, c, afterCh.turn());
        if (capVal - seeLoss >= 100) {
          isObviousFreeCapture = true;
        }
      } catch {
        isObviousFreeCapture = false;
      }
    }
  }

  if (
    cpLoss <= 10 &&
    plyIndex >= 8 &&
    evalAfterMoverCp >= -60 &&
    Math.abs(evalBeforeMoverCp) < 750 &&
    !isImmediateRecapture &&
    !isObviousFreeCapture
  ) {
    const secondRes = getSecondBestEval
      ? getSecondBestEval()
      : searchPositionWithPv(
          fenBefore,
          {
            ...UNIFIED_EVAL_CONFIG,
            excludeMove: { from, to, promo: targetPromo },
          },
          1
        );

    if (secondRes) {
      const secondMoverCp = secondRes.scoreCpWhite * moverSign;
      const conservativePlayedCp = Math.min(evalBeforeMoverCp, evalAfterMoverCp);
      const gap = conservativePlayedCp - secondMoverCp;
      if (gap >= 95 && secondMoverCp < 750) {
        return makeResult('great');
      }
    }
  }

  return makeResult('good');
}

export function evaluatePlayedMove(
  fenBefore: string,
  from: string,
  to: string,
  promotion?: 'q' | 'r' | 'b' | 'n',
  lastMove?: { to: string; captured?: string },
  plyIndex = 8
): { quality: MoveQuality; cpLoss: number } {
  let chess: Chess;
  try {
    chess = new Chess(fenBefore);
  } catch {
    return { quality: 'good', cpLoss: 0 };
  }

  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0 || legalMoves.length === 1) {
    return { quality: 'good', cpLoss: 0 };
  }

  const targetPromo = promotion || 'q';
  const playedMoveObj = legalMoves.find(
    (m) => m.from === from && m.to === to && (!m.promotion || m.promotion === targetPromo)
  );
  if (!playedMoveObj) {
    return { quality: 'good', cpLoss: 0 };
  }

  const movingColor = chess.turn();
  chess.move(playedMoveObj);
  const fenAfter = chess.fen();
  const isTerminalMate = chess.isCheckmate();
  const isTerminalDraw = chess.isDraw();

  if (isTerminalMate) {
    return { quality: 'great', cpLoss: 0 };
  }

  const beforeEval = searchPositionWithPv(fenBefore, UNIFIED_EVAL_CONFIG, 1);
  if (!beforeEval) {
    return { quality: 'good', cpLoss: 0 };
  }

  const playedWasBest =
    beforeEval.bestFrom === from &&
    beforeEval.bestTo === to &&
    (!beforeEval.bestPromo || beforeEval.bestPromo === targetPromo);

  const afterEval: EnginePvResult | null = isTerminalDraw
    ? {
        scoreCpWhite: 0,
        bestFrom: from,
        bestTo: to,
        pv: [],
        reachedDepth: UNIFIED_EVAL_CONFIG.maxDepth,
      }
    : playedWasBest
      ? beforeEval
      : searchPositionWithPv(fenAfter, UNIFIED_EVAL_CONFIG, 1);

  const res = classifyMoveUnified({
    fenBefore,
    fenAfter,
    from,
    to,
    promotion,
    captured: playedMoveObj.captured,
    san: playedMoveObj.san,
    color: movingColor,
    plyIndex,
    legalMovesCount: legalMoves.length,
    lastMove,
    beforeEval,
    afterEval,
    isTerminalMate,
    isTerminalDraw,
  });

  const quality: MoveQuality =
    res.classification === 'inaccuracy'
      ? 'neutral'
      : res.classification === 'missed_win'
        ? 'mistake'
        : res.classification;

  return { quality, cpLoss: res.cpLoss };
}

const BOT_SEARCH_PROFILES: Record<Exclude<BotId, 'dummy'>, SearchConfig> = {
  knight: { maxDepth: 1, budgetMs: 35, quiescencePlies: 0 },
  bishop: { maxDepth: 1, budgetMs: 55, quiescencePlies: 1 },
  king: { maxDepth: 2, budgetMs: 110, quiescencePlies: 2 },
  alien: { maxDepth: 4, budgetMs: 320, quiescencePlies: 5 },
  gothamchess: { maxDepth: 5, budgetMs: 500, quiescencePlies: 6, style: 'aggressive' },
  master: { maxDepth: 7, budgetMs: 750, quiescencePlies: 6 },
  mittens: { maxDepth: 9, budgetMs: 1050, quiescencePlies: 6 },
};

function normalizeFenKey(fen: string): string {
  const parts = fen.split(' ');
  return `${parts[0]} ${parts[1]} ${parts[2]}`;
}

function pickAlienGambitMoveSan(fen: string): string | null {
  const key = normalizeFenKey(fen);

  // Starting position (White): play 1. e4 ~70% of the time so Caro-Kann Alien Gambit can occur often
  if (key === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq') {
    return Math.random() < 0.7 ? 'e4' : null;
  }

  // Alien Gambit vs Caro-Kann: 1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Ng5 h6 6. Nxf7!!
  if (key === 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq') return 'd4';
  if (key === 'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq') return 'Nc3';
  if (key === 'rnbqkbnr/pp2pppp/2p5/8/3Pp3/2N5/PPP2PPP/R1BQKBNR w KQkq') return 'Nxe4';
  if (key === 'rnbqkb1r/pp2pppp/2p2n2/8/3PN3/8/PPP2PPP/R1BQKBNR w KQkq') {
    return Math.random() < 0.65 ? 'Ng5' : null;
  }
  if (key === 'rnbqkb1r/pp2ppp1/2p2n1p/6N1/3P4/8/PPP2PPP/R1BQKBNR w KQkq') {
    return 'Nxf7';
  }

  // As Black: occasional wild cosmic gambits (Stafford Gambit / Englund Gambit)
  if (key === 'rnbqkb1r/pppp1ppp/5n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq') {
    return Math.random() < 0.55 ? 'Nc6' : null;
  }
  if (key === 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq') {
    return Math.random() < 0.3 ? 'e5' : null;
  }

  return null;
}

export function chooseBotMove(fen: string, botId: BotId): Move | null {
  const chess = new Chess(fen);
  const legalMoves = orderMoves(chess.moves({ verbose: true }));
  if (legalMoves.length === 0) return null;

  // Training Dummy: passive non-aggressive target so the player can practice tactics/mate freely
  if (botId === 'dummy') {
    const quietMoves = legalMoves.filter((m) => !m.captured && !m.san.includes('#') && !m.san.includes('+'));
    const pool = quietMoves.length > 0 ? quietMoves : legalMoves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Witty Alien occasionally unleashes the Alien Gambit (and cosmic Black gambits)
  if (botId === 'alien') {
    const alienSan = pickAlienGambitMoveSan(fen);
    if (alienSan) {
      const alienMove = legalMoves.find((m) => m.san === alienSan);
      if (alienMove) return alienMove;
    }
  }

  // Opening book for high-ELO bots (1850+): ensures crisp master openings
  if (botId === 'alien' || botId === 'gothamchess' || botId === 'master' || botId === 'mittens') {
    const bookSan = pickBookMoveSan(fen, botId === 'gothamchess');
    if (bookSan) {
      const bookMove = legalMoves.find((m) => m.san === bookSan);
      if (bookMove) return bookMove;
    }
  }

  const profile = BOT_SEARCH_PROFILES[botId];
  const res = searchBestMoves(fen, profile);

  if (!res || res.ranked.length === 0) {
    return legalMoves[0];
  }

  const findLegal = (entry: { from: string; to: string; promo?: string }): Move | undefined =>
    legalMoves.find(
      (m) =>
        m.from === entry.from &&
        m.to === entry.to &&
        (!entry.promo || m.promotion === entry.promo)
    );

  // Beginner bots add natural human inaccuracy; 1850+ bots play pure zero-noise engine lines
  if (botId === 'knight') {
    // Duolingo (350 ELO): frequent beginner inaccuracies
    const noisy = res.ranked.map((r) => ({
      ...r,
      noisyScore: r.scoreCp + (Math.random() - 0.5) * 260,
    }));
    noisy.sort((a, b) => b.noisyScore - a.noisyScore);
    const poolSize = Math.random() < 0.4 ? Math.min(5, noisy.length) : Math.min(2, noisy.length);
    const chosen = noisy[Math.floor(Math.random() * poolSize)];
    return findLegal(chosen) ?? legalMoves[0];
  }

  if (botId === 'bishop') {
    // Luna (700 ELO): sees immediate captures, occasional positional/tactical slips
    const noisy = res.ranked.map((r) => ({
      ...r,
      noisyScore: r.scoreCp + (Math.random() - 0.5) * 90,
    }));
    noisy.sort((a, b) => b.noisyScore - a.noisyScore);
    const pickIdx = noisy.length > 1 && Math.random() < 0.2 ? 1 : 0;
    return findLegal(noisy[pickIdx]) ?? legalMoves[0];
  }

  if (botId === 'king') {
    // Martin (1100 ELO): solid beginner, tiny variance
    const noisy = res.ranked.map((r) => ({
      ...r,
      noisyScore: r.scoreCp + (Math.random() - 0.5) * 28,
    }));
    noisy.sort((a, b) => b.noisyScore - a.noisyScore);
    return findLegal(noisy[0]) ?? legalMoves[0];
  }

  // Alien (1850), GothamChess (2400), Master (2800), Mittens (3200): 100% deterministic best move found
  for (const cand of res.ranked) {
    const matched = findLegal(cand);
    if (matched) return matched;
  }

  return legalMoves[0];
}

export interface PostGameReviewData {
  accuracyPct: number;
  bestMoveByPly: Record<number, string>;
}

const bestMoveHintCache = new Map<string, string | null>();

function getCachedBestMoveSan(fenBefore: string): string | null {
  if (bestMoveHintCache.has(fenBefore)) {
    return bestMoveHintCache.get(fenBefore) ?? null;
  }
  const chess = new Chess(fenBefore);
  const legalMoves = chess.moves({ verbose: true });
  let san: string | null = null;
  const searchRes = searchBestMoves(fenBefore, {
    maxDepth: 3,
    budgetMs: 350,
    quiescencePlies: 4,
    deterministic: true,
    maxNodes: 150000,
  });
  if (searchRes) {
    const matched = legalMoves.find(
      (m) =>
        m.from === searchRes.bestFrom &&
        m.to === searchRes.bestTo &&
        (!searchRes.bestPromo || m.promotion === searchRes.bestPromo)
    );
    san = matched ? matched.san : null;
  }
  if (bestMoveHintCache.size >= 500) {
    bestMoveHintCache.clear();
  }
  bestMoveHintCache.set(fenBefore, san);
  return san;
}

/**
 * Computes move accuracy and best-move suggestions (live during bot games, post-game for online PvP).
 */
export function computePostGameReview(
  moves: GameMove[],
  playerColor: PieceColor
): PostGameReviewData {
  const bestMoveByPly: Record<number, string> = {};
  const playerLosses: number[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (move.color === playerColor) {
      const loss = typeof move.cpLoss === 'number' ? Math.min(600, move.cpLoss) : 0;
      playerLosses.push(loss);
    }

    if (move.quality === 'mistake' || move.quality === 'blunder' || move.quality === 'neutral') {
      const fenBefore = i === 0 ? START_FEN : moves[i - 1]?.fen || START_FEN;
      try {
        const bestSan = getCachedBestMoveSan(fenBefore);
        if (bestSan && bestSan !== move.san) {
          bestMoveByPly[i] = bestSan;
        }
      } catch {
        // skip best-move hint if a historical FEN is malformed
      }
    }
  }

  if (playerLosses.length === 0) {
    return { accuracyPct: 100, bestMoveByPly };
  }

  const avgLoss = playerLosses.reduce((acc, v) => acc + v, 0) / playerLosses.length;
  const rawAcc = 100 * Math.exp(-avgLoss / 175);
  const accuracyPct = Math.max(10, Math.min(99, Math.round(rawAcc)));

  return { accuracyPct, bestMoveByPly };
}

export function getBotGreeting(
  botId: BotId,
  opponentUsername: string,
  lang?: string
): string {
  return getLocalizedBotGreeting(botId, opponentUsername, lang);
}

export function getBotQualityReaction(
  botId: BotId,
  quality: MoveQuality,
  lang?: string
): string | null {
  return getLocalizedBotQualityReaction(botId, quality, lang);
}

export function getBotMoveComment(
  botId: BotId,
  event: BotMoveEvent,
  lang?: string
): string | null {
  return getLocalizedBotMoveComment(botId, event, lang);
}

export function getBotChatReply(
  botId: BotId,
  playerText: string,
  fen: string,
  botColor: PieceColor,
  movesCount: number,
  lang?: string
): string {
  const chess = new Chess(fen);
  const matBalance = getMaterialBalance(chess, botColor);
  return getLocalizedBotChatReply(botId, playerText, matBalance, botColor, movesCount, lang);
}
