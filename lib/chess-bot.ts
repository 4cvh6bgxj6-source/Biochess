import { Chess } from 'chess.js';
import type { Move, PieceSymbol } from 'chess.js';
import type { BotId, MoveQuality, PieceColor } from './types.ts';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 27, 27, 10, 5, 5],
  [0, 0, 0, 24, 24, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -22, -22, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 12, 16, 16, 12, 0, -30],
  [-30, 5, 16, 20, 20, 16, 5, -30],
  [-30, 0, 16, 20, 20, 16, 0, -30],
  [-30, 5, 12, 16, 16, 12, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 8, 12, 12, 8, 0, -10],
  [-10, 6, 6, 12, 12, 6, 6, -10],
  [-10, 0, 12, 12, 12, 12, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 6, 0, 0, 0, 0, 6, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [8, 12, 12, 12, 12, 12, 12, 8],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 6, 6, 0, 0, 0],
];

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING_MID_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

function getPstValue(piece: PieceSymbol, row: number, col: number, color: PieceColor): number {
  const r = color === 'w' ? row : 7 - row;
  switch (piece) {
    case 'p':
      return PAWN_PST[r][col];
    case 'n':
      return KNIGHT_PST[r][col];
    case 'b':
      return BISHOP_PST[r][col];
    case 'r':
      return ROOK_PST[r][col];
    case 'q':
      return QUEEN_PST[r][col];
    case 'k':
      return KING_MID_PST[r][col];
  }
}

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

// Fast leaf evaluator: zero internal chess.moves() calls!
function evaluateStatic(chess: Chess, perspective: PieceColor): number {
  const board = chess.board();
  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = board[row][col];
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type] + getPstValue(sq.type, row, col, sq.color);
      if (sq.color === perspective) {
        score += val;
      } else {
        score -= val;
      }
    }
  }

  if (chess.inCheck()) {
    score += chess.turn() === perspective ? -28 : 28;
  }

  return score;
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

// Fast 1-ply capture resolution (no full move generation loop at leaf!)
function fastQuiescence(
  chess: Chess,
  alpha: number,
  beta: number,
  maximizing: boolean,
  perspective: PieceColor,
  qDepth: number
): number {
  const standPat = evaluateStatic(chess, perspective);
  if (qDepth <= 0) return standPat;

  if (maximizing) {
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;

    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) {
      return chess.inCheck() ? -99999 : 0;
    }

    const captures = orderMoves(moves.filter((m) => Boolean(m.captured || m.promotion))).slice(0, 6);
    for (const move of captures) {
      chess.move(move);
      const score = fastQuiescence(chess, alpha, beta, false, perspective, qDepth - 1);
      chess.undo();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  } else {
    if (standPat <= alpha) return alpha;
    if (beta > standPat) beta = standPat;

    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) {
      return chess.inCheck() ? 99999 : 0;
    }

    const captures = orderMoves(moves.filter((m) => Boolean(m.captured || m.promotion))).slice(0, 6);
    for (const move of captures) {
      chess.move(move);
      const score = fastQuiescence(chess, alpha, beta, true, perspective, qDepth - 1);
      chess.undo();
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
    return beta;
  }
}

function alphaBeta(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  perspective: PieceColor,
  useQuiescence: boolean,
  deadline: number
): number {
  if (depth === 0) {
    return useQuiescence
      ? fastQuiescence(chess, alpha, beta, maximizing, perspective, 1)
      : evaluateStatic(chess, perspective);
  }

  const moves = orderMoves(chess.moves({ verbose: true }));
  if (moves.length === 0) {
    if (!chess.inCheck()) return 0;
    return chess.turn() === perspective ? -99999 - depth : 99999 + depth;
  }

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      if (Date.now() > deadline) break;
      chess.move(move);
      const val = alphaBeta(
        chess,
        depth - 1,
        alpha,
        beta,
        false,
        perspective,
        useQuiescence,
        deadline
      );
      chess.undo();
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
    }
    return best === -Infinity ? evaluateStatic(chess, perspective) : best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      if (Date.now() > deadline) break;
      chess.move(move);
      const val = alphaBeta(
        chess,
        depth - 1,
        alpha,
        beta,
        true,
        perspective,
        useQuiescence,
        deadline
      );
      chess.undo();
      if (val < best) best = val;
      if (val < beta) beta = val;
      if (beta <= alpha) break;
    }
    return best === Infinity ? evaluateStatic(chess, perspective) : best;
  }
}

/**
 * Fast, lag-free move evaluator (< 15ms per move):
 * 1. Fast 1-ply scan across legal moves using static eval + best immediate capture reply.
 * 2. Deep verification on top 5 candidate moves + the played move.
 */
export function evaluatePlayedMove(
  fenBefore: string,
  from: string,
  to: string,
  promotion?: 'q' | 'r' | 'b' | 'n',
  lastMove?: { to: string; captured?: string }
): { quality: MoveQuality; cpLoss: number } {
  const chess = new Chess(fenBefore);
  const perspective = chess.turn();
  const legalMoves = orderMoves(chess.moves({ verbose: true }));

  if (legalMoves.length === 0) {
    return { quality: 'neutral', cpLoss: 0 };
  }
  if (legalMoves.length === 1) {
    return { quality: 'good', cpLoss: 0 };
  }

  const materialBefore = getMaterialBalance(chess, perspective);
  const deadline = Date.now() + 120;

  // Step 1: Ultra-fast 1-ply + immediate-capture-exchange scan (< 4ms)
  const fastScores: Array<{
    move: Move;
    fastScore: number;
    immediateNetCapture: number;
  }> = [];

  for (const move of legalMoves) {
    chess.move(move);
    let fastScore: number;
    let worstOppCapture = 0;

    if (chess.isCheckmate()) {
      fastScore = 99999;
    } else {
      const oppReplies = chess.moves({ verbose: true });
      if (oppReplies.length === 0) {
        fastScore = 0; // stalemate
      } else {
        for (const r of oppReplies) {
          if (r.captured && PIECE_VALUES[r.captured] > worstOppCapture) {
            worstOppCapture = PIECE_VALUES[r.captured];
          }
        }
        fastScore = evaluateStatic(chess, perspective) - worstOppCapture * 0.85;
      }
    }

    const materialAfter = getMaterialBalance(chess, perspective);
    const immediateNetCapture = materialAfter - materialBefore - worstOppCapture;

    chess.undo();
    fastScores.push({ move, fastScore, immediateNetCapture });
  }

  fastScores.sort((a, b) => b.fastScore - a.fastScore);

  const targetPromo = promotion || 'q';
  const playedFast = fastScores.find(
    (e) =>
      e.move.from === from &&
      e.move.to === to &&
      (!e.move.promotion || e.move.promotion === targetPromo)
  );

  if (!playedFast) {
    return { quality: 'neutral', cpLoss: 0 };
  }

  // Step 2: Refine playedFast + top checks + top fastScores (max 6 candidates)
  const candidates: typeof fastScores = [playedFast];
  for (const entry of fastScores) {
    if (candidates.length >= 6) break;
    if (
      (entry.move.san.includes('+') || entry.move.san.includes('#')) &&
      !candidates.includes(entry)
    ) {
      candidates.push(entry);
    }
  }
  for (const entry of fastScores) {
    if (candidates.length >= 6) break;
    if (!candidates.includes(entry)) {
      candidates.push(entry);
    }
  }

  const refined = candidates.map((entry) => {
    chess.move(entry.move);
    let score: number;
    if (chess.isCheckmate()) {
      score = 99999;
    } else {
      score = alphaBeta(chess, 1, -Infinity, Infinity, false, perspective, true, deadline);
    }
    chess.undo();
    return {
      move: entry.move,
      score,
      immediateNetCapture: entry.immediateNetCapture,
    };
  });

  refined.sort((a, b) => b.score - a.score);

  const bestScore = refined[0].score;
  const secondBestScore = refined[1]?.score ?? bestScore;

  const playedRefined = refined.find(
    (e) =>
      e.move.from === from &&
      e.move.to === to &&
      (!e.move.promotion || e.move.promotion === targetPromo)
  );

  const playedScore = playedRefined ? playedRefined.score : playedFast.fastScore;
  const cpLoss = Math.max(0, Math.round(bestScore - playedScore));
  const moveNumber = chess.moveNumber();

  if (
    cpLoss >= 260 ||
    (playedScore <= -50000 && bestScore > -50000) ||
    (bestScore >= 90000 && playedScore < 500)
  ) {
    return { quality: 'blunder', cpLoss };
  }

  // Opening learning phase before move 4 (moves 1, 2, 3)
  if (moveNumber < 4 && playedScore < 90000) {
    return { quality: 'book', cpLoss };
  }

  if (cpLoss >= 100) {
    return { quality: 'mistake', cpLoss };
  }

  const isMaterialSacrifice =
    playedFast.immediateNetCapture <= -180 && PIECE_VALUES[playedFast.move.piece] >= 300;
  if (
    cpLoss <= 25 &&
    isMaterialSacrifice &&
    (playedScore >= 120 || playedScore >= 90000) &&
    bestScore - secondBestScore >= 70
  ) {
    return { quality: 'brilliant', cpLoss };
  }

  const gap = bestScore - secondBestScore;
  const isCapture = Boolean(playedFast.move.captured);
  const givesCheck =
    playedFast.move.san.includes('+') || playedFast.move.san.includes('#');
  const isImmediateRecapture = Boolean(
    lastMove?.captured && playedFast.move.captured && playedFast.move.to === lastMove.to
  );
  const isObviousFreeCapture =
    isCapture &&
    !givesCheck &&
    playedFast.immediateNetCapture >= 100 &&
    secondBestScore > -120 &&
    playedScore < 90000;

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

export function chooseBotMove(fen: string, botId: BotId): Move | null {
  const chess = new Chess(fen);
  const legalMoves = orderMoves(chess.moves({ verbose: true }));
  if (legalMoves.length === 0) return null;

  const perspective = chess.turn();
  const depth = botId === 'knight' ? 1 : 2;
  const useQuiescence = botId === 'king';
  const deadline = Date.now() + (botId === 'king' ? 140 : 60);

  const scored: Array<{ move: Move; score: number }> = [];

  for (const move of legalMoves) {
    chess.move(move);
    if (chess.isCheckmate()) {
      chess.undo();
      return move;
    }
    const rawScore = alphaBeta(
      chess,
      depth - 1,
      -Infinity,
      Infinity,
      false,
      perspective,
      useQuiescence,
      deadline
    );
    chess.undo();

    const jitter =
      botId === 'knight'
        ? (Math.random() - 0.5) * 90
        : botId === 'bishop'
          ? (Math.random() - 0.5) * 14
          : (Math.random() - 0.5) * 4;

    scored.push({ move, score: rawScore + jitter });
  }

  scored.sort((a, b) => b.score - a.score);

  if (botId === 'knight' && scored.length > 2 && Math.random() < 0.35) {
    const idx = Math.floor(Math.random() * Math.min(3, scored.length));
    return scored[idx].move;
  }

  return scored[0].move;
}

export function getBotGreeting(botId: BotId, opponentUsername: string): string {
  switch (botId) {
    case 'knight':
      return `Glhf ${opponentUsername}!`;
    case 'bishop':
      return `Buona partita, ${opponentUsername}.`;
    case 'king':
      return `Tocca a te, ${opponentUsername}.`;
  }
}

export function getBotQualityReaction(botId: BotId, quality: MoveQuality): string | null {
  if (quality === 'blunder') {
    if (botId === 'knight') return 'Ops! Blunder (??)';
    if (botId === 'bishop') return 'Ahi, blunder (??).';
    return 'Errore grave (??).';
  }
  if (quality === 'brilliant') {
    if (botId === 'knight') return 'Che mossa!!';
    if (botId === 'bishop') return 'Brillante (!!)';
    return 'Sacrificio preciso (!!).';
  }
  if (quality === 'great') {
    if (botId === 'knight') return 'Gran mossa!';
    if (botId === 'bishop') return 'Trovata unica (!)';
    return 'Esatta (!).';
  }
  return null;
}

export function getBotMoveComment(
  botId: BotId,
  event: 'capture_queen' | 'check_given' | 'bot_checked' | 'checkmate_win' | 'checkmate_loss'
): string | null {
  if (event === 'capture_queen') {
    return 'Presa la Donna!';
  }
  if (event === 'check_given') {
    return 'Scacco!';
  }
  if (event === 'bot_checked') {
    return botId === 'knight' ? 'Bel scacco!' : 'Scacco...';
  }
  if (event === 'checkmate_win') {
    return 'Scacco matto! Gg.';
  }
  if (event === 'checkmate_loss') {
    return 'Gg! Ben giocato.';
  }
  return null;
}

export function getBotChatReply(
  botId: BotId,
  playerText: string,
  fen: string,
  botColor: PieceColor,
  movesCount: number
): string {
  const lower = playerText.toLowerCase().trim();
  const chess = new Chess(fen);
  const matBalance = getMaterialBalance(chess, botColor);

  if (/ciao|salve|hey|ehi|buongiorno|buonasera|buona partita|gl|hf/.test(lower)) {
    return botId === 'knight' ? 'Ciao! Buona partita!' : 'Buona partita!';
  }

  if (/gg|bella|bravo|brava|forte|grazie|complimenti/.test(lower)) {
    return botId === 'king' ? 'Gg.' : 'Grazie! Gg!';
  }

  if (/patta|pareggio/.test(lower)) {
    return 'Usa il tasto Patta.';
  }

  if (/blunder|errore|noo|ops|cazz|cavolo/.test(lower)) {
    return matBalance > 150 ? 'Capita!' : 'Succede a tutti.';
  }

  const knightShort = ['Vediamo!', 'Tocca a te.', 'Occhio ai cavalli!', 'Bella sfida!'];
  const bishopShort = ['Mh, interessante.', 'Vediamo il seguito.', 'Buon ritmo.', 'Gioco aperto.'];
  const kingShort = ['Vedremo.', 'Calcola bene.', 'Mossa interessante.', 'Avanti.'];

  const pool = botId === 'knight' ? knightShort : botId === 'bishop' ? bishopShort : kingShort;
  return pool[(movesCount + lower.length) % pool.length];
}
