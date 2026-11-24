import { Chess } from 'chess.js';
import type { Move, PieceSymbol } from 'chess.js';
import type { BotId, GameMove, MoveQuality, PieceColor } from './types';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
        fastScore = 0;
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

  // Training Dummy: passive non-aggressive target so the player can practice tactics/mate freely
  if (botId === 'dummy') {
    const quietMoves = legalMoves.filter((m) => !m.captured && !m.san.includes('#') && !m.san.includes('+'));
    const pool = quietMoves.length > 0 ? quietMoves : legalMoves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const perspective = chess.turn();
  const depth =
    botId === 'knight'
      ? 1
      : botId === 'bishop' || botId === 'king' || botId === 'alien'
        ? 2
        : 3;
  const useQuiescence =
    botId === 'king' ||
    botId === 'master' ||
    botId === 'alien' ||
    botId === 'gothamchess' ||
    botId === 'mittens';
  const budgetMs =
    botId === 'mittens'
      ? 340
      : botId === 'master'
        ? 260
        : botId === 'gothamchess'
          ? 220
          : botId === 'alien'
            ? 160
            : botId === 'king'
              ? 140
              : 60;
  const deadline = Date.now() + budgetMs;

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
          : botId === 'king'
            ? (Math.random() - 0.5) * 4
            : botId === 'alien'
              ? (Math.random() - 0.5) * 3
              : botId === 'gothamchess'
                ? (Math.random() - 0.5) * 2
                : 0; // master & mittens: zero jitter

    // GothamChess loves active rook moves & checks
    const styleBonus =
      botId === 'gothamchess' && move.piece === 'r' ? 8 : 0;

    scored.push({ move, score: rawScore + jitter + styleBonus });
  }

  scored.sort((a, b) => b.score - a.score);

  if (botId === 'knight' && scored.length > 2 && Math.random() < 0.35) {
    const idx = Math.floor(Math.random() * Math.min(3, scored.length));
    return scored[idx].move;
  }

  return scored[0].move;
}

export interface PostGameReviewData {
  accuracyPct: number;
  bestMoveByPly: Record<number, string>;
}

/**
 * Computes post-game accuracy and best-move suggestions (used exclusively after Coach/Dummy games).
 */
export function computePostGameReview(
  moves: GameMove[],
  playerColor: PieceColor
): PostGameReviewData {
  const bestMoveByPly: Record<number, string> = {};
  const playerLosses: number[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (move.color !== playerColor) continue;
    const loss = typeof move.cpLoss === 'number' ? Math.min(600, move.cpLoss) : 0;
    playerLosses.push(loss);

    if (move.quality === 'mistake' || move.quality === 'blunder' || move.quality === 'neutral') {
      const fenBefore = i === 0 ? START_FEN : moves[i - 1]?.fen || START_FEN;
      try {
        const best = chooseBotMove(fenBefore, 'king');
        if (best && best.san !== move.san) {
          bestMoveByPly[i] = best.san;
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

export function getBotGreeting(botId: BotId, opponentUsername: string): string {
  switch (botId) {
    case 'knight':
      return `Ciao ${opponentUsername}! Pronto a salvare la tua serie su Duolingo? Buona partita!`;
    case 'bishop':
      return `Ciao ${opponentUsername}, buona partita sotto la Luna!`;
    case 'king':
      return `Ehilà ${opponentUsername}! Sono Martin, giochiamo una bella partita!`;
    case 'master':
      return `${opponentUsername}. Mostra il tuo miglior gioco.`;
    case 'dummy':
      return `Modalità Dummy attiva, ${opponentUsername}! Muovi tu sia i tuoi pezzi che il Dummy e guarda la revisione a fine partita.`;
    case 'alien':
      return `Saluti dal cosmo, ${opponentUsername}. Analizzeremo i tuoi piani a fine partita.`;
    case 'gothamchess':
      return `Ehi ${opponentUsername}! Pronto per THE ROOOOK? A fine partita facciamo la revisione insieme!`;
    case 'mittens':
      return `Miao, ${opponentUsername}... Giochiamo. Alla fine vedremo quanti errori hai fatto.`;
  }
}

export function getBotQualityReaction(botId: BotId, quality: MoveQuality): string | null {
  if (quality === 'blunder') {
    if (botId === 'knight') return 'Ops! Hai perso una vita (??)';
    if (botId === 'bishop') return 'Ahi, blunder (??).';
    if (botId === 'king') return 'Ehi, sicurezza dei pezzi! Blunder (??).';
    if (botId === 'master') return 'Errore decisivo.';
    if (botId === 'dummy') return 'Occhio! Controlliamo questa mossa nella revisione finale.';
    if (botId === 'alien') return 'Anomalia tattica rilevata... ne riparliamo a fine partita.';
    if (botId === 'gothamchess') return 'OH NO! Che stai facendo?! La rivediamo alla fine!';
    return 'Miao... grazie del regalo.';
  }
  if (quality === 'brilliant') {
    if (botId === 'knight') return 'Che mossa da 100 XP!!';
    if (botId === 'bishop') return 'Brillante (!!)';
    if (botId === 'king') return 'Sacrificio preciso (!!).';
    if (botId === 'master') return 'Mossa notevole.';
    if (botId === 'dummy') return 'Mossa fantastica!!';
    if (botId === 'alien') return 'Calcolo superiore!';
    if (botId === 'gothamchess') return 'SACRIFICA TUTTO!! Che mossa!!';
    return 'Miao?! Interessante...';
  }
  if (quality === 'great') {
    if (botId === 'knight') return 'Ottima mossa!';
    if (botId === 'bishop') return 'Trovata unica (!)';
    if (botId === 'king') return 'Esatta (!).';
    if (botId === 'master') return 'Precisa.';
    if (botId === 'dummy') return 'Ottima trovata!';
    if (botId === 'alien') return 'Precisione orbitale.';
    if (botId === 'gothamchess') return 'Trovata unica! Bellissima!';
    return 'Miao... non male.';
  }
  return null;
}

export function getBotMoveComment(
  botId: BotId,
  event: 'capture_queen' | 'check_given' | 'bot_checked' | 'checkmate_win' | 'checkmate_loss'
): string | null {
  if (event === 'capture_queen') {
    if (botId === 'gothamchess') return 'PRESO LA DONNA!';
    if (botId === 'mittens') return 'Miao... la tua Donna è mia.';
    if (botId === 'master') return 'La Donna cade.';
    return 'Presa la Donna!';
  }
  if (event === 'check_given') {
    if (botId === 'mittens') return 'Scacco... miao.';
    return 'Scacco!';
  }
  if (event === 'bot_checked') {
    if (botId === 'knight') return 'Bel scacco!';
    if (botId === 'gothamchess') return 'Scacco eh? Vediamo!';
    return 'Scacco...';
  }
  if (event === 'checkmate_win') {
    if (botId === 'mittens') return 'Scacco matto. Miao. Ora guarda la revisione!';
    if (botId === 'gothamchess') return 'SCACCO MATTO! Gg! Apri la revisione qui sopra!';
    if (botId === 'alien') return 'Scacco matto. Guarda la revisione finale per migliorare.';
    if (botId === 'master') return 'Scacco matto. Partita conclusa.';
    return 'Scacco matto! Gg.';
  }
  if (event === 'checkmate_loss') {
    if (botId === 'dummy') return 'Grande matto! Ottimo allenamento, guarda la revisione.';
    if (botId === 'gothamchess') return 'GG! Mi hai incastrato! Ottima partita!';
    if (botId === 'mittens') return 'Miao... ben giocato, umano.';
    if (botId === 'master') return 'Ben giocato. Hai trovato la vittoria.';
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

  if (/ciao|salve|hey|ehi|buongiorno|buonasera|buona partita|gl|hf|hello|hi/.test(lower)) {
    if (botId === 'gothamchess') return 'Ciao! Pronto a sacrificare THE ROOOOK?';
    if (botId === 'mittens') return 'Miao. Buona fortuna... ne avrai bisogno.';
    if (botId === 'alien') return 'Saluti! Sviluppa i pezzi leggeri e arrocca presto.';
    if (botId === 'dummy') return 'Ciao! Sono qui per farti allenare in tranquillità.';
    if (botId === 'master') return 'Concentrati sulla scacchiera.';
    if (botId === 'king') return 'Ciao! I miei figli tifano per me oggi!';
    if (botId === 'bishop') return 'Ciao! Buona partita!';
    return 'Ciao! Non dimenticare la tua lezione di oggi!';
  }

  if (/gg|bella|bravo|brava|forte|grazie|complimenti/.test(lower)) {
    if (botId === 'gothamchess') return 'GG! A fine partita controlliamo la revisione!';
    if (botId === 'mittens') return 'Miao.';
    if (botId === 'master') return 'Gg.';
    return botId === 'king' ? 'Gg, bella sfida!' : 'Grazie! Gg!';
  }

  if (/patta|pareggio|draw/.test(lower)) {
    return 'Usa il tasto Patta.';
  }

  if (/blunder|errore|noo|ops|cazz|cavolo/.test(lower)) {
    if (botId === 'gothamchess') return 'Succede anche ai GM! Lo vediamo nella revisione finale!';
    return matBalance > 150 ? 'Capita!' : 'Succede a tutti.';
  }

  if (botId === 'dummy') {
    const dummyTips = [
      'Prova a controllare le case centrali e4, d4, e5, d5!',
      'Cerca forchette, inchiodature o pezzi indifesi!',
      'Ricorda di arroccare per mettere al sicuro il tuo Re.',
      'Quando finiamo vedrai tutta la revisione delle mosse!',
    ];
    return dummyTips[(movesCount + lower.length) % dummyTips.length];
  }

  if (botId === 'alien') {
    const alienShort = ['Piano interessante.', 'Sonda il lato di Re.', 'Calcola gli scambi.', 'Avanti, terrestre.'];
    return alienShort[(movesCount + lower.length) % alienShort.length];
  }

  if (botId === 'gothamchess') {
    const gothamShort = ['THE ROOOOK!', 'Controlla le minacce!', 'Sviluppa tutti i pezzi!', 'Interessante... vediamo!'];
    return gothamShort[(movesCount + lower.length) % gothamShort.length];
  }

  if (botId === 'mittens') {
    const mittensShort = ['Miao...', 'Ho già calcolato tutto.', 'Bel tentativo.', 'Continua pure, umano.'];
    return mittensShort[(movesCount + lower.length) % mittensShort.length];
  }

  if (botId === 'master') {
    const masterShort = ['Mossa solida.', 'Calcola più a fondo.', 'Ogni debolezza conta.', 'Avanti.'];
    return masterShort[(movesCount + lower.length) % masterShort.length];
  }

  const duolingoShort = ['Non perdere la serie!', 'Ottimo allenamento!', 'Tocca a te!', 'Continua così!'];
  const lunaShort = ['Mh, interessante.', 'Vediamo il seguito.', 'Buon ritmo.', 'Gioco aperto.'];
  const martinShort = ['Bella mossa!', 'Calcola bene.', 'Mi piace questa posizione.', 'Avanti!'];

  const pool = botId === 'knight' ? duolingoShort : botId === 'bishop' ? lunaShort : martinShort;
  return pool[(movesCount + lower.length) % pool.length];
}
