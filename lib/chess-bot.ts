import { Chess } from 'chess.js';
import type { Move, PieceSymbol } from 'chess.js';
import type { BotId, GameMove, MoveQuality, PieceColor } from './types';
import { pickBookMoveSan, searchBestMoves, type SearchConfig } from './fast-chess-engine';
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

export function evaluatePlayedMove(
  fenBefore: string,
  from: string,
  to: string,
  promotion?: 'q' | 'r' | 'b' | 'n',
  lastMove?: { to: string; captured?: string }
): { quality: MoveQuality; cpLoss: number } {
  const chess = new Chess(fenBefore);
  const legalMoves = chess.moves({ verbose: true });

  if (legalMoves.length === 0) {
    return { quality: 'neutral', cpLoss: 0 };
  }
  if (legalMoves.length === 1) {
    return { quality: 'good', cpLoss: 0 };
  }

  const targetPromo = promotion || 'q';
  const playedMoveObj = legalMoves.find(
    (m) => m.from === from && m.to === to && (!m.promotion || m.promotion === targetPromo)
  );
  if (!playedMoveObj) {
    return { quality: 'neutral', cpLoss: 0 };
  }

  chess.move(playedMoveObj);
  const isCheckmatePlayed = chess.isCheckmate();
  chess.undo();

  if (isCheckmatePlayed) {
    return { quality: 'great', cpLoss: 0 };
  }

  // Use high-speed 0x88 Depth-3 search with quiescence for fast & accurate move grading
  const searchRes = searchBestMoves(fenBefore, {
    maxDepth: 3,
    budgetMs: 65,
    quiescencePlies: 4,
  });

  if (!searchRes || searchRes.ranked.length === 0) {
    return { quality: 'good', cpLoss: 0 };
  }

  const bestScore = searchRes.ranked[0].scoreCp;
  const secondBestScore = searchRes.ranked[1]?.scoreCp ?? bestScore;

  const playedEntry = searchRes.ranked.find(
    (e) =>
      e.from === from &&
      e.to === to &&
      (!e.promo || e.promo === targetPromo)
  );

  const playedScore = playedEntry ? playedEntry.scoreCp : bestScore - 120;
  const cpLoss = Math.max(0, Math.round(bestScore - playedScore));
  const moveNumber = chess.moveNumber();

  if (
    cpLoss >= 250 ||
    (playedScore <= -20000 && bestScore > -20000) ||
    (bestScore >= 25000 && playedScore < 500)
  ) {
    return { quality: 'blunder', cpLoss };
  }

  if (moveNumber < 4 && playedScore < 25000 && cpLoss <= 80) {
    return { quality: 'book', cpLoss };
  }

  if (cpLoss >= 100) {
    return { quality: 'mistake', cpLoss };
  }

  // Check Brilliant (!!): genuine SEE sacrifice + verified depth-5 soundness + not already winning without it
  if (
    cpLoss <= 30 &&
    (playedScore >= 50 || playedScore >= 25000) &&
    secondBestScore < 750 &&
    detectGenuineSacrifice(fenBefore, from, to, promotion)
  ) {
    const verifyRes = searchBestMoves(fenBefore, {
      maxDepth: 5,
      budgetMs: 110,
      quiescencePlies: 6,
    });
    if (verifyRes && verifyRes.ranked.length > 0) {
      const vBest = verifyRes.ranked[0].scoreCp;
      const vSecond = verifyRes.ranked[1]?.scoreCp ?? vBest;
      const vPlayedEntry = verifyRes.ranked.find(
        (e) =>
          e.from === from &&
          e.to === to &&
          (!e.promo || e.promo === targetPromo)
      );
      const vPlayed = vPlayedEntry ? vPlayedEntry.scoreCp : vBest - 120;
      const vCpLoss = Math.max(0, Math.round(vBest - vPlayed));

      if (
        vCpLoss <= 15 &&
        (vPlayed >= 80 || vPlayed >= 25000) &&
        vSecond < 750 &&
        vBest - vSecond >= 85
      ) {
        return { quality: 'brilliant', cpLoss: vCpLoss };
      }
      if (vCpLoss >= 250) {
        return { quality: 'blunder', cpLoss: vCpLoss };
      }
      if (vCpLoss >= 100) {
        return { quality: 'mistake', cpLoss: vCpLoss };
      }
    }
  }

  const gap = bestScore - secondBestScore;
  const isCapture = Boolean(playedMoveObj.captured);
  const givesCheck =
    playedMoveObj.san.includes('+') || playedMoveObj.san.includes('#');
  const isImmediateRecapture = Boolean(
    lastMove?.captured && playedMoveObj.captured && playedMoveObj.to === lastMove.to
  );

  // Check if this is an obvious free capture using accurate board state rather than naive max capture
  const capVal = playedMoveObj.captured ? PIECE_VALUES[playedMoveObj.captured] : 0;
  let isObviousFreeCapture = false;
  if (isCapture && !givesCheck && capVal >= 100 && secondBestScore > -120 && playedScore < 25000) {
    chess.move(playedMoveObj);
    const { r, c } = algebraicToRC(to);
    const seeLoss = computeSeeGainOnSquare(chess.board(), r, c, chess.turn());
    chess.undo();
    if (capVal - seeLoss >= 100) {
      isObviousFreeCapture = true;
    }
  }

  if (
    cpLoss <= 15 &&
    gap >= 65 &&
    playedScore >= -60 &&
    !isImmediateRecapture &&
    !isObviousFreeCapture
  ) {
    return { quality: 'great', cpLoss };
  }

  if (cpLoss <= 45) {
    return { quality: 'good', cpLoss };
  }

  return { quality: 'neutral', cpLoss };
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
    maxDepth: 4,
    budgetMs: 65,
    quiescencePlies: 4,
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
  const rawAcc = 100 * Math.exp(-avgLoss / 180);
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
