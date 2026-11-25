import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import type {
  AnalyzedMove,
  CoachMoveClass,
  FullGameAnalysis,
  StudentAttemptEvaluation,
} from './game-analyzer';

const PIECE_NAMES_IT: Record<PieceSymbol, string> = {
  p: 'pedone',
  n: 'Cavallo',
  b: 'Alfiere',
  r: 'Torre',
  q: 'Donna',
  k: 'Re',
};

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

function formatEvalText(cpWhite: number, mateIn?: number): string {
  if (typeof mateIn === 'number' && mateIn !== 0) {
    return mateIn > 0 ? `Matto in ${mateIn} per il Bianco` : `Matto in ${Math.abs(mateIn)} per il Nero`;
  }
  const pawns = cpWhite / 100;
  return pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
}

/**
 * Inspects a position after a move using chess.js to detect concrete tactical motifs:
 * - undefended / hanging high-value pieces
 * - double attacks / forks
 * - checks & mate threats
 * - captures & promotions
 */
function detectPositionMotifs(
  fenBefore: string,
  from: string,
  to: string,
  promotion?: 'q' | 'r' | 'b' | 'n'
): {
  pieceMoved: PieceSymbol;
  captured?: PieceSymbol;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastle: boolean;
  isPromotion: boolean;
  attackedHighTargets: Array<{ piece: PieceSymbol; square: string; undefended: boolean }>;
  hangingFriendlyPieces: Array<{ piece: PieceSymbol; square: string }>;
} {
  const before = new Chess(fenBefore);
  let pieceMoved: PieceSymbol = 'p';
  let captured: PieceSymbol | undefined;
  let isCastle = false;
  let isPromotion = false;

  try {
    const mv = before.move({ from, to, promotion: promotion || 'q' });
    if (mv) {
      pieceMoved = mv.piece;
      captured = mv.captured;
      isCastle = mv.flags.includes('k') || mv.flags.includes('q');
      isPromotion = Boolean(mv.promotion);
    }
  } catch {
    return {
      pieceMoved: 'p',
      isCheck: false,
      isCheckmate: false,
      isCastle: false,
      isPromotion: false,
      attackedHighTargets: [],
      hangingFriendlyPieces: [],
    };
  }

  const moverColor = before.turn() === 'w' ? 'b' : 'w';
  const oppColor = before.turn();
  const isCheck = before.inCheck();
  const isCheckmate = before.isCheckmate();

  // Check opponent pieces attacked by the moved piece on `to`
  const attackedHighTargets: Array<{ piece: PieceSymbol; square: string; undefended: boolean }> = [];
  const board = before.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sqObj = board[r][c];
      if (!sqObj) continue;
      const sq = `${'abcdefgh'[c]}${8 - r}` as Square;

      if (sqObj.color === oppColor && sqObj.type !== 'k') {
        const attackers = before.attackers(sq, moverColor);
        if (attackers.includes(to as Square)) {
          const defenders = before.attackers(sq, oppColor);
          if (defenders.length === 0 || PIECE_VALUES[sqObj.type] > PIECE_VALUES[pieceMoved]) {
            attackedHighTargets.push({
              piece: sqObj.type,
              square: sq,
              undefended: defenders.length === 0,
            });
          }
        }
      }
    }
  }

  // Check our own pieces that are now attacked by opponent and undefended (or worth more)
  const hangingFriendlyPieces: Array<{ piece: PieceSymbol; square: string }> = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sqObj = board[r][c];
      if (!sqObj || sqObj.color !== moverColor || sqObj.type === 'k' || sqObj.type === 'p') continue;
      const sq = `${'abcdefgh'[c]}${8 - r}` as Square;
      const oppAttackers = before.attackers(sq, oppColor);
      if (oppAttackers.length === 0) continue;
      const friendlyDefenders = before.attackers(sq, moverColor);
      if (friendlyDefenders.length === 0) {
        hangingFriendlyPieces.push({ piece: sqObj.type, square: sq });
      }
    }
  }

  return {
    pieceMoved,
    captured,
    isCheck,
    isCheckmate,
    isCastle,
    isPromotion,
    attackedHighTargets,
    hangingFriendlyPieces,
  };
}

export interface CoachNarrativeResponse {
  message: string;
  focusPly: number;
  boardState: 'before_move' | 'after_move';
  showBestArrow: boolean;
  quizTargetPly: number;
  suggestedReplies: string[];
}

function getTierTone(elo: number): 'beginner' | 'intermediate' | 'advanced' {
  if (elo < 900) return 'beginner';
  if (elo < 1600) return 'intermediate';
  return 'advanced';
}

function describeWhyMoveWasWrong(move: AnalyzedMove, elo: number): string {
  const tier = getTierTone(elo);
  const playedMotifs = detectPositionMotifs(move.fenBefore, move.from, move.to, move.promotion);
  const bestMotifs = detectPositionMotifs(
    move.fenBefore,
    move.bestMoveFrom,
    move.bestMoveTo,
    move.bestMovePromo
  );

  const moverSign = move.color === 'w' ? 1 : -1;
  const mateAfterMover = move.mateAfter ? move.mateAfter * moverSign : undefined;
  const mateBeforeMover = move.mateBefore ? move.mateBefore * moverSign : undefined;

  const reasons: string[] = [];

  if (mateAfterMover !== undefined && mateAfterMover < 0) {
    reasons.push(
      `questa mossa espone il tuo Re e permette uno scacco matto forzato in ${Math.abs(mateAfterMover)} mosse`
    );
  } else if (mateBeforeMover !== undefined && mateBeforeMover > 0 && !mateAfterMover) {
    reasons.push(`qui avevi uno scacco matto forzato in ${mateBeforeMover} mosse che è sfuggito`);
  }

  if (playedMotifs.hangingFriendlyPieces.length > 0) {
    const h = playedMotifs.hangingFriendlyPieces[0];
    reasons.push(
      tier === 'beginner'
        ? `lasci il tuo ${PIECE_NAMES_IT[h.piece]} in ${h.square} completamente indifeso`
        : `lasci il ${PIECE_NAMES_IT[h.piece]} su ${h.square} in presa senza difesa`
    );
  }

  if (bestMotifs.isCheckmate) {
    reasons.push(`la mossa ${move.bestMoveSan} dava direttamente scacco matto`);
  } else if (bestMotifs.attackedHighTargets.length >= 2) {
    reasons.push(
      tier === 'beginner'
        ? `con ${move.bestMoveSan} potevi attaccare due pezzi avversari contemporaneamente`
        : `${move.bestMoveSan} creava un attacco doppio decisivo (${bestMotifs.attackedHighTargets
            .map((t) => `${PIECE_NAMES_IT[t.piece]} in ${t.square}`)
            .join(' e ')})`
    );
  } else if (bestMotifs.attackedHighTargets.length === 1) {
    const t = bestMotifs.attackedHighTargets[0];
    reasons.push(
      `${move.bestMoveSan} attaccava ${t.undefended ? 'gratuitamente' : 'con tempo'} il ${PIECE_NAMES_IT[t.piece]} avversario in ${t.square}`
    );
  } else if (bestMotifs.captured) {
    reasons.push(
      `potevi catturare un ${PIECE_NAMES_IT[bestMotifs.captured]} avversario con ${move.bestMoveSan}`
    );
  } else if (bestMotifs.isCastle) {
    reasons.push(`l'arrocco (${move.bestMoveSan}) metteva subito al sicuro il Re attivando la Torre`);
  }

  if (reasons.length === 0) {
    if (move.playedPvSan.length > 0) {
      reasons.push(
        tier === 'beginner'
          ? `permette all'avversario di rispondere con ${move.playedPvSan.slice(0, 2).join(' ')} prendendo l'iniziativa`
          : `concede controgioco immediato tramite ${move.playedPvSan.slice(0, 3).join(' ')}`
      );
    } else {
      reasons.push(
        `fa perdere ${(move.cpLoss / 100).toFixed(1)} pedoni di valutazione rispetto alla continuazione migliore`
      );
    }
  }

  return reasons.join(' e ');
}

function describeBestPlan(move: AnalyzedMove): string {
  const bestLine = move.bestPvSan.length > 0 ? move.bestPvSan.slice(0, 4).join(' ') : move.bestMoveSan;
  return `La scelta migliore era **${move.bestMoveSan}** (variante: ${bestLine}), portando la posizione a ${formatEvalText(move.evalBeforeWhiteCp, move.mateBefore)}.`;
}

export function generateOpeningDebrief(
  analysis: FullGameAnalysis,
  playerElo: number
): CoachNarrativeResponse {
  const myStats = analysis.playerColor === 'w' ? analysis.whiteStats : analysis.blackStats;
  const oppStats = analysis.playerColor === 'w' ? analysis.blackStats : analysis.whiteStats;
  const oppName =
    analysis.playerColor === 'w' ? analysis.blackUsername : analysis.whiteUsername;

  const myMistakesOrBlunders = analysis.decisiveMoments.filter(
    (m) =>
      m.color === analysis.playerColor &&
      (m.classification === 'blunder' ||
        m.classification === 'mistake' ||
        m.classification === 'missed_win')
  );
  const firstQuiz = myMistakesOrBlunders[0] || null;
  const firstMoment = firstQuiz || analysis.decisiveMoments[0] || analysis.moves[0];

  let openingComment = '';
  if (myStats.openingAcc >= 85) {
    openingComment = `Hai gestito molto bene l'apertura (${analysis.openingName}, ${myStats.openingAcc}% di precisione).`;
  } else {
    openingComment = `Nell'apertura (${analysis.openingName}, ${myStats.openingAcc}%) hai già concesso qualche piccola imprecisione.`;
  }

  let verdictLine = '';
  if (analysis.result === 'win') {
    verdictLine =
      myStats.blunder === 0 && myStats.mistake <= 1
        ? `Complimenti per la vittoria contro ${oppName}! Partita molto solida con il ${myStats.accuracyPct}% di precisione.`
        : `Hai vinto contro ${oppName} (${myStats.accuracyPct}% vs ${oppStats.accuracyPct}%), ma ci sono comunque un paio di momenti chiave su cui possiamo lavorare per evitare rischi inutili.`;
  } else if (analysis.result === 'loss') {
    verdictLine = `Contro ${oppName} hai chiuso al ${myStats.accuracyPct}% di precisione (${myStats.blunder} blunder, ${myStats.mistake} errori). Vediamo subito cosa ha deciso la partita in modo sincero e pratico.`;
  } else {
    verdictLine = `Patta equilibrata contro ${oppName} (${myStats.accuracyPct}% di precisione). Guardiamo i momenti in cui la partita poteva sbloccarsi.`;
  }

  if (firstQuiz) {
    const moveLabel = `${firstQuiz.moveNumber}${firstQuiz.color === 'w' ? '.' : '...'} ${firstQuiz.san}`;
    const errWord =
      firstQuiz.classification === 'blunder'
        ? 'un errore grave'
        : firstQuiz.classification === 'missed_win'
          ? 'un’occasione vincente mancata'
          : 'un momento impreciso';

    return {
      message: `${verdictLine}\n\n${openingComment} Ho fermato la scacchiera prima della tua mossa **${moveLabel}**, che è stata ${errWord}.\n\n**Secondo te, quale sarebbe stata la mossa migliore in questa posizione?** Prova a muovere il pezzo direttamente sulla scacchiera!`,
      focusPly: firstQuiz.ply,
      boardState: 'before_move',
      showBestArrow: false,
      quizTargetPly: firstQuiz.ply,
      suggestedReplies: [
        'Mostrami la soluzione',
        'Perché era sbagliata?',
        'Prossimo momento decisivo',
      ],
    };
  }

  const tier = getTierTone(playerElo);
  const cleanNote =
    tier === 'beginner'
      ? 'Hai protetto bene i tuoi pezzi senza commettere errori gravi!'
      : 'Partita giocata con ottimo controllo posizionale e senza errori gravi.';

  return {
    message: `${verdictLine}\n\n${openingComment} ${cleanNote} Puoi cliccare su qualsiasi mossa o sui momenti decisivi per esplorare le varianti del motore.`,
    focusPly: firstMoment ? firstMoment.ply : 0,
    boardState: 'after_move',
    showBestArrow: true,
    quizTargetPly: -1,
    suggestedReplies: [
      'Analizza i miei punti deboli',
      'Qual è stata la mia mossa migliore?',
      'Mostra il riepilogo per fase',
    ],
  };
}

export function generateStudentMoveFeedback(
  move: AnalyzedMove,
  attempt: StudentAttemptEvaluation,
  analysis: FullGameAnalysis,
  playerElo: number
): CoachNarrativeResponse {
  const moveLabel = `${move.moveNumber}${move.color === 'w' ? '.' : '...'}`;
  const remainingQuizzes = analysis.decisiveMoments.filter(
    (m) =>
      m.ply > move.ply &&
      m.color === analysis.playerColor &&
      (m.classification === 'blunder' ||
        m.classification === 'mistake' ||
        m.classification === 'missed_win')
  );
  const nextReplies =
    remainingQuizzes.length > 0
      ? ['Passa al prossimo momento', 'Mostra variante migliore', 'Perché l’altra era sbagliata?']
      : ['Mostra variante migliore', 'Punti di forza e debolezza', 'Riepilogo finale'];

  if (attempt.verdict === 'exact_best') {
    return {
      message: `Ottimo colpo! **${moveLabel} ${attempt.san}** è esattamente la mossa migliore del motore.\n\nIn partita invece avevi giocato ${move.san}, che ${describeWhyMoveWasWrong(move, playerElo)}. ${describeBestPlan(move)}`,
      focusPly: move.ply,
      boardState: 'before_move',
      showBestArrow: true,
      quizTargetPly: -1,
      suggestedReplies: nextReplies,
    };
  }

  if (attempt.verdict === 'strong_alternative') {
    return {
      message: `Buona intuizione con **${moveLabel} ${attempt.san}**! È una continuazione molto solida (solo -${(attempt.cpLossVsBest / 100).toFixed(1)} rispetto alla prima scelta del motore).\n\nLa scelta assoluta del motore era comunque **${move.bestMoveSan}**: ${describeBestPlan(move)}`,
      focusPly: move.ply,
      boardState: 'before_move',
      showBestArrow: true,
      quizTargetPly: -1,
      suggestedReplies: nextReplies,
    };
  }

  const refLine =
    attempt.refutationLineSan.length > 0
      ? ` L'avversario potrebbe punirla subito con **${attempt.refutationLineSan.slice(0, 3).join(' ')}**.`
      : '';
  const lossStr = (attempt.cpLossVsBest / 100).toFixed(1);

  return {
    message: `Attenzione: **${moveLabel} ${attempt.san}** non risolve il problema della posizione (-${lossStr} pedoni).${refLine}\n\n${describeBestPlan(move)} Guarda la freccia verde sulla scacchiera e premi **"Mostra variante"** per vederne l'effetto.`,
    focusPly: move.ply,
    boardState: 'before_move',
    showBestArrow: true,
    quizTargetPly: -1,
    suggestedReplies: [
      'Fammi riprovare su questa posizione',
      ...nextReplies.slice(0, 2),
    ],
  };
}

export function generateMoveExplanation(
  move: AnalyzedMove,
  playerElo: number,
  analysis: FullGameAnalysis,
  mode: 'explain' | 'solution' = 'explain'
): CoachNarrativeResponse {
  const moveLabel = `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san}`;
  const clsMap: Record<CoachMoveClass, string> = {
    book: 'Mossa teorica di apertura',
    brilliant: 'Mossa Brillante (!!)',
    great: 'Mossa Ottima (!)',
    good: 'Buona mossa',
    inaccuracy: 'Imprecisione (?!) ',
    mistake: 'Errore (?)',
    blunder: 'Blunder (??)',
    missed_win: 'Vittoria mancata (✕)',
  };

  let body = '';
  if (move.classification === 'brilliant' || move.classification === 'great' || move.classification === 'good' || move.classification === 'book') {
    body = `**${moveLabel}** (${clsMap[move.classification]}): ${move.tacticalNote} La valutazione della posizione dopo questa mossa è ${formatEvalText(move.evalAfterWhiteCp, move.mateAfter)}.`;
  } else if (mode === 'solution') {
    body = `La soluzione qui era **${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.bestMoveSan}**!\n\nIn partita **${move.san}** è stata valutata come ${clsMap[move.classification].toLowerCase()} perché ${describeWhyMoveWasWrong(move, playerElo)}.\n\n${describeBestPlan(move)}`;
  } else {
    body = `**${moveLabel}** — ${clsMap[move.classification]}.\n\n**Perché crea problemi:** ${describeWhyMoveWasWrong(move, playerElo)}.\n\n**Cosa giocare invece:** ${describeBestPlan(move)}`;
  }

  const nextMoment = analysis.decisiveMoments.find((m) => m.ply > move.ply);
  const replies = [
    ...(move.bestPvSan.length > 0 ? [`Mostra variante ${move.bestMoveSan}`] : []),
    ...(nextMoment ? ['Prossimo momento decisivo'] : []),
    'Punti di forza e debolezza',
  ];

  return {
    message: body,
    focusPly: move.ply,
    boardState: 'before_move',
    showBestArrow: true,
    quizTargetPly: -1,
    suggestedReplies: replies,
  };
}

export function handleDeterministicCoachQuestion(params: {
  question: string;
  analysis: FullGameAnalysis;
  focusedPly: number;
  quizTargetPly: number;
  playerElo: number;
}): CoachNarrativeResponse {
  const { question, analysis, focusedPly, quizTargetPly, playerElo } = params;
  const q = question.toLowerCase();
  const curMove =
    analysis.moves[Math.max(0, Math.min(analysis.moves.length - 1, focusedPly))] ||
    analysis.moves[0];

  // 1. Retry current quiz position
  if (q.includes('riprovar') || q.includes('quiz') || q.includes('indovinar')) {
    return {
      message: `Perfetto! Ho rimesso la posizione prima di **${curMove.moveNumber}${curMove.color === 'w' ? '.' : '...'} ${curMove.san}**.\n\nTrova la mossa migliore giocandola direttamente sulla scacchiera!`,
      focusPly: curMove.ply,
      boardState: 'before_move',
      showBestArrow: false,
      quizTargetPly: curMove.ply,
      suggestedReplies: ['Mostrami la soluzione', 'Perché era sbagliata?'],
    };
  }

  // 2. Game-wide best move query ("Qual è stata la mia mossa migliore?")
  if (q.includes('è stata la mia') || q.includes('mia mossa migliore') || q.includes('brillante')) {
    const myMoves = analysis.moves.filter((m) => m.color === analysis.playerColor);
    const highlight =
      myMoves.find((m) => m.classification === 'brilliant') ||
      myMoves.find((m) => m.classification === 'great') ||
      myMoves
        .filter((m) => m.classification !== 'book')
        .sort((a, b) => a.cpLoss - b.cpLoss)[0] ||
      curMove;

    if (highlight) {
      const label = `${highlight.moveNumber}${highlight.color === 'w' ? '.' : '...'} ${highlight.san}`;
      return {
        message: `La tua mossa migliore è stata **${label}**!\n\n${highlight.tacticalNote} La valutazione della posizione dopo questa giocata era **${formatEvalText(highlight.evalAfterWhiteCp, highlight.mateAfter)}**.`,
        focusPly: highlight.ply,
        boardState: 'after_move',
        showBestArrow: false,
        quizTargetPly: -1,
        suggestedReplies: ['Analizza i miei punti deboli', 'Prossimo momento decisivo'],
      };
    }
  }

  // 3. Show solution to active quiz or current move
  if (
    q.includes('soluzion') ||
    q.includes('quale era') ||
    q.includes('qual era') ||
    q.includes('mostrami') ||
    q.includes('mossa migliore')
  ) {
    const targetPly = quizTargetPly >= 0 ? quizTargetPly : curMove.ply;
    const targetMove = analysis.moves[targetPly] || curMove;
    return generateMoveExplanation(targetMove, playerElo, analysis, 'solution');
  }

  // 4. Next decisive moment (optionally triggering Teaching Quiz on student errors)
  if (q.includes('prossim') || q.includes('avanti') || q.includes('altro momento') || q.includes('altro errore')) {
    const nextDecisive =
      analysis.decisiveMoments.find((m) => m.ply > focusedPly) ||
      analysis.decisiveMoments[0] ||
      curMove;
    const isStudentError =
      nextDecisive.color === analysis.playerColor &&
      (nextDecisive.classification === 'blunder' ||
        nextDecisive.classification === 'mistake' ||
        nextDecisive.classification === 'missed_win');

    if (isStudentError) {
      return {
        message: `Passiamo alla mossa **${nextDecisive.moveNumber}${nextDecisive.color === 'w' ? '.' : '...'} ${nextDecisive.san}**.\n\nQui hai perso terreno: **secondo te qual era la mossa migliore in questa posizione?** Muovila sulla scacchiera!`,
        focusPly: nextDecisive.ply,
        boardState: 'before_move',
        showBestArrow: false,
        quizTargetPly: nextDecisive.ply,
        suggestedReplies: ['Mostrami la soluzione', 'Perché era sbagliata?'],
      };
    }

    return generateMoveExplanation(nextDecisive, playerElo, analysis, 'explain');
  }

  // 5. Strengths, weaknesses & phase summary
  if (
    q.includes('punt') ||
    q.includes('debol') ||
    q.includes('forza') ||
    q.includes('riepilog') ||
    q.includes('fase')
  ) {
    const myStats = analysis.playerColor === 'w' ? analysis.whiteStats : analysis.blackStats;
    const phases = [
      { name: 'Apertura', val: myStats.openingAcc },
      { name: 'Mediogioco', val: myStats.middlegameAcc },
      { name: 'Finale', val: myStats.endgameAcc },
    ].sort((a, b) => b.val - a.val);

    const bestPhase = phases[0];
    const weakPhase = phases[phases.length - 1];
    const focusTip =
      myStats.blunder > 0
        ? `Hai commesso ${myStats.blunder} blunder: prima di confermare una mossa, controlla sempre gli scacchi e le catture avversarie disponibili.`
        : myStats.missedWin > 0
          ? `Hai mancato ${myStats.missedWin} occasioni chiare: quando sei in vantaggio cerca prima le mosse forzanti.`
          : `Ottima disciplina tattica con 0 blunder! Lavora sui dettagli posizionali nel ${weakPhase.name.toLowerCase()}.`;

    return {
      message: `**Analisi delle tue fasi (${myStats.accuracyPct}% totale):**\n• Apertura: **${myStats.openingAcc}%**\n• Mediogioco: **${myStats.middlegameAcc}%**\n• Finale: **${myStats.endgameAcc}%**\n\n**Punto di forza:** ${bestPhase.name} (${bestPhase.val}%).\n**Area da allenare:** ${weakPhase.name} (${weakPhase.val}%). ${focusTip}`,
      focusPly: curMove.ply,
      boardState: 'after_move',
      showBestArrow: true,
      quizTargetPly: -1,
      suggestedReplies: ['Prossimo momento decisivo', 'Spiegami questa mossa'],
    };
  }

  // 6. Default: explain the currently inspected move using real engine motifs
  return generateMoveExplanation(curMove, playerElo, analysis, 'explain');
}
