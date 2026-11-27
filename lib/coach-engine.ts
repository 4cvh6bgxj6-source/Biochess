import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import {
  translateOpeningName,
  type AnalyzedMove,
  type CoachMoveClass,
  type FullGameAnalysis,
  type StudentAttemptEvaluation,
} from './game-analyzer';
import { normalizeUiLang, type SupportedUiLang } from './i18n';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

const PIECE_NAMES_BY_LANG: Record<SupportedUiLang, Record<PieceSymbol, string>> = {
  it: { p: 'pedone', n: 'Cavallo', b: 'Alfiere', r: 'Torre', q: 'Donna', k: 'Re' },
  en: { p: 'pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' },
  es: { p: 'peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' },
  fr: { p: 'pion', n: 'Cavalier', b: 'Fou', r: 'Tour', q: 'Dame', k: 'Roi' },
  de: { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' },
  pt: { p: 'peão', n: 'Cavalo', b: 'Bispo', r: 'Torre', q: 'Dama', k: 'Rei' },
  ru: { p: 'пешка', n: 'Конь', b: 'Слон', r: 'Ладья', q: 'Ферзь', k: 'Король' },
  zh: { p: '兵', n: '马', b: '象', r: '车', q: '后', k: '王' },
  ja: { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' },
  ko: { p: '폰', n: '나이트', b: '비숍', r: '룩', q: '퀸', k: '킹' },
  ar: { p: 'بيدق', n: 'حصان', b: 'فيل', r: 'رخ', q: 'وزير', k: 'ملك' },
};

interface CoachLangPack {
  mateWhite: (n: number) => string;
  mateBlack: (n: number) => string;
  whyExposeMate: (n: number) => string;
  whyMissedMate: (n: number) => string;
  whyHangingEasy: (piece: string, sq: string) => string;
  whyHangingPro: (piece: string, sq: string) => string;
  whyBestMate: (san: string) => string;
  whyBestForkEasy: (san: string) => string;
  whyBestForkPro: (san: string, targets: string) => string;
  whyBestAttack: (san: string, piece: string, sq: string, undef: boolean) => string;
  whyBestCapture: (san: string, piece: string) => string;
  whyBestCastle: (san: string) => string;
  whyInitiativeEasy: (pv: string) => string;
  whyInitiativePro: (pv: string) => string;
  whyCpLoss: (loss: string) => string;
  andJoin: string;
  bestPlan: (san: string, line: string, evalStr: string) => string;
  openGood: (op: string, acc: number) => string;
  openWeak: (op: string, acc: number) => string;
  winSolid: (opp: string, acc: number) => string;
  winShaky: (opp: string, myAcc: number, oppAcc: number) => string;
  lossSummary: (opp: string, acc: number, blunders: number, mistakes: number) => string;
  drawSummary: (opp: string, acc: number) => string;
  errSevere: string;
  errMissedWin: string;
  errInaccuracy: string;
  firstQuizPrompt: (verdict: string, openComment: string, moveLabel: string, errWord: string) => string;
  cleanBeginner: string;
  cleanPro: string;
  cleanNoQuiz: (verdict: string, openComment: string, cleanNote: string) => string;
  chips: {
    showSolution: string;
    whyWrong: string;
    nextDecisive: string;
    analyzeWeaknesses: string;
    bestMoveQuery: string;
    phaseSummary: string;
    nextMove: string;
    showBestVar: string;
    whyOtherWrong: string;
    strengthsWeaknesses: string;
    finalSummary: string;
    retryPos: string;
    showVarMove: (san: string) => string;
    explainThis: string;
  };
  studentExactBest: (moveLabel: string, attemptSan: string, playedSan: string, why: string, plan: string) => string;
  studentStrongAlt: (moveLabel: string, attemptSan: string, loss: string, bestSan: string, plan: string) => string;
  studentWrong: (moveLabel: string, attemptSan: string, loss: string, refSan: string, plan: string) => string;
  clsMap: Record<CoachMoveClass, string>;
  goodMoveExplain: (moveLabel: string, cls: string, note: string, evalStr: string) => string;
  solutionExplain: (moveNumColor: string, bestSan: string, playedSan: string, clsLower: string, why: string, plan: string) => string;
  mistakeExplain: (moveLabel: string, cls: string, why: string, plan: string) => string;
  retryMsg: (moveLabel: string) => string;
  bestHighlightMsg: (label: string, note: string, evalStr: string) => string;
  nextQuizMsg: (label: string) => string;
  phases: { opening: string; middlegame: string; endgame: string };
  tipBlunders: (n: number) => string;
  tipMissed: (n: number) => string;
  tipClean: (weakPhase: string) => string;
  phaseSummaryMsg: (
    totalAcc: number,
    opName: string,
    opAcc: number,
    midName: string,
    midAcc: number,
    endName: string,
    endAcc: number,
    bestName: string,
    bestVal: number,
    weakName: string,
    weakVal: number,
    tip: string
  ) => string;
}

const PACKS: Record<SupportedUiLang, CoachLangPack> = {
  it: {
    mateWhite: (n) => `Matto in ${n} per il Bianco`,
    mateBlack: (n) => `Matto in ${n} per il Nero`,
    whyExposeMate: (n) => `questa mossa espone il tuo Re e permette uno scacco matto forzato in ${n} mosse`,
    whyMissedMate: (n) => `qui avevi uno scacco matto forzato in ${n} mosse che è sfuggito`,
    whyHangingEasy: (p, sq) => `lasci il tuo ${p} in ${sq} completamente indifeso`,
    whyHangingPro: (p, sq) => `lasci il ${p} su ${sq} in presa senza difesa`,
    whyBestMate: (san) => `la mossa ${san} dava direttamente scacco matto`,
    whyBestForkEasy: (san) => `con ${san} potevi attaccare due pezzi avversari contemporaneamente`,
    whyBestForkPro: (san, t) => `${san} creava un attacco doppio decisivo (${t})`,
    whyBestAttack: (san, p, sq, u) =>
      `${san} attaccava ${u ? 'gratuitamente' : 'con tempo'} il ${p} avversario in ${sq}`,
    whyBestCapture: (san, p) => `potevi catturare un ${p} avversario con ${san}`,
    whyBestCastle: (san) => `l'arrocco (${san}) metteva subito al sicuro il Re attivando la Torre`,
    whyInitiativeEasy: (pv) => `permette all'avversario di rispondere con ${pv} prendendo l'iniziativa`,
    whyInitiativePro: (pv) => `concede controgioco immediato tramite ${pv}`,
    whyCpLoss: (loss) => `fa perdere ${loss} pedoni di valutazione rispetto alla continuazione migliore`,
    andJoin: ' e ',
    bestPlan: (san, line, ev) =>
      `La scelta migliore era **${san}** (variante: ${line}), portando la posizione a ${ev}.`,
    openGood: (op, acc) => `Hai gestito molto bene l'apertura (${op}, ${acc}% di precisione).`,
    openWeak: (op, acc) => `Nell'apertura (${op}, ${acc}%) hai già concesso qualche piccola imprecisione.`,
    winSolid: (opp, acc) =>
      `Complimenti per la vittoria contro ${opp}! Partita molto solida con il ${acc}% di precisione.`,
    winShaky: (opp, myAcc, oppAcc) =>
      `Hai vinto contro ${opp} (${myAcc}% vs ${oppAcc}%), ma ci sono comunque un paio di momenti chiave su cui possiamo lavorare per evitare rischi inutili.`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `Contro ${opp} hai chiuso al ${acc}% di precisione (${blunders} blunder, ${mistakes} errori). Vediamo subito cosa ha deciso la partita in modo sincero e pratico.`,
    drawSummary: (opp, acc) =>
      `Patta equilibrata contro ${opp} (${acc}% di precisione). Guardiamo i momenti in cui la partita poteva sbloccarsi.`,
    errSevere: 'un errore grave',
    errMissedWin: 'un’occasione vincente mancata',
    errInaccuracy: 'un momento impreciso',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} Ho fermato la scacchiera prima della tua mossa **${ml}**, che è stata ${ew}.\n\n**Secondo te, quale sarebbe stata la mossa migliore in questa posizione?** Prova a muovere il pezzo direttamente sulla scacchiera!`,
    cleanBeginner: 'Hai protetto bene i tuoi pezzi senza commettere errori gravi!',
    cleanPro: 'Partita giocata con ottimo controllo posizionale e senza errori gravi.',
    cleanNoQuiz: (v, o, cn) =>
      `${v}\n\n${o} ${cn} Puoi cliccare su qualsiasi mossa o sui momenti decisivi per esplorare le varianti del motore.`,
    chips: {
      showSolution: 'Mostrami la soluzione',
      whyWrong: 'Perché era sbagliata?',
      nextDecisive: 'Prossimo momento decisivo',
      analyzeWeaknesses: 'Analizza i miei punti deboli',
      bestMoveQuery: 'Qual è stata la mia mossa migliore?',
      phaseSummary: 'Mostra il riepilogo per fase',
      nextMove: 'Passa al prossimo momento',
      showBestVar: 'Mostra variante migliore',
      whyOtherWrong: 'Perché l’altra era sbagliata?',
      strengthsWeaknesses: 'Punti di forza e debolezza',
      finalSummary: 'Riepilogo finale',
      retryPos: 'Fammi riprovare su questa posizione',
      showVarMove: (san) => `Mostra variante ${san}`,
      explainThis: 'Spiegami questa mossa',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `Ottimo colpo! **${ml} ${aSan}** è esattamente la mossa migliore del motore.\n\nIn partita invece avevi giocato ${pSan}, che ${why}. ${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `Buona intuizione con **${ml} ${aSan}**! È una continuazione molto solida (solo -${loss} rispetto alla prima scelta del motore).\n\nLa scelta assoluta del motore era comunque **${bSan}**: ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `Attenzione: **${ml} ${aSan}** non risolve il problema della posizione (-${loss} pedoni).${
        ref ? ` L'avversario potrebbe punirla subito con **${ref}**.` : ''
      }\n\n${plan} Guarda la freccia verde sulla scacchiera e premi **"Mostra variante"** per vederne l'effetto.`,
    clsMap: {
      book: 'Mossa teorica di apertura',
      brilliant: 'Mossa Brillante (!!)',
      great: 'Mossa Ottima (!)',
      good: 'Buona mossa',
      inaccuracy: 'Imprecisione (?!) ',
      mistake: 'Errore (?)',
      blunder: 'Blunder (??)',
      missed_win: 'Vittoria mancata (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) =>
      `**${ml}** (${cls}): ${note} La valutazione della posizione dopo questa mossa è ${ev}.`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `La soluzione qui era **${mnc} ${bSan}**!\n\nIn partita **${pSan}** è stata valutata come ${clsL} perché ${why}.\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) =>
      `**${ml}** — ${cls}.\n\n**Perché crea problemi:** ${why}.\n\n**Cosa giocare invece:** ${plan}`,
    retryMsg: (ml) =>
      `Perfetto! Ho rimesso la posizione prima di **${ml}**.\n\nTrova la mossa migliore giocandola direttamente sulla scacchiera!`,
    bestHighlightMsg: (label, note, ev) =>
      `La tua mossa migliore è stata **${label}**!\n\n${note} La valutazione della posizione dopo questa giocata era **${ev}**.`,
    nextQuizMsg: (label) =>
      `Passiamo alla mossa **${label}**.\n\nQui hai perso terreno: **secondo te qual era la mossa migliore in questa posizione?** Muovila sulla scacchiera!`,
    phases: { opening: 'Apertura', middlegame: 'Mediogioco', endgame: 'Finale' },
    tipBlunders: (n) =>
      `Hai commesso ${n} blunder: prima di confermare una mossa, controlla sempre gli scacchi e le catture avversarie disponibili.`,
    tipMissed: (n) =>
      `Hai mancato ${n} occasioni chiare: quando sei in vantaggio cerca prima le mosse forzanti.`,
    tipClean: (wp) =>
      `Ottima disciplina tattica con 0 blunder! Lavora sui dettagli posizionali nel ${wp.toLowerCase()}.`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**Analisi delle tue fasi (${tot}% totale):**\n• ${opN}: **${opA}%**\n• ${midN}: **${midA}%**\n• ${endN}: **${endA}%**\n\n**Punto di forza:** ${bestN} (${bestV}%).\n**Area da allenare:** ${weakN} (${weakV}%). ${tip}`,
  },

  en: {
    mateWhite: (n) => `Mate in ${n} for White`,
    mateBlack: (n) => `Mate in ${n} for Black`,
    whyExposeMate: (n) => `this move exposes your King and allows forced checkmate in ${n} moves`,
    whyMissedMate: (n) => `you had a forced checkmate in ${n} moves here that slipped away`,
    whyHangingEasy: (p, sq) => `you leave your ${p} on ${sq} completely undefended`,
    whyHangingPro: (p, sq) => `you leave the ${p} on ${sq} hanging without defense`,
    whyBestMate: (san) => `${san} delivered immediate checkmate`,
    whyBestForkEasy: (san) => `with ${san} you could attack two enemy pieces at once`,
    whyBestForkPro: (san, t) => `${san} created a decisive double attack (${t})`,
    whyBestAttack: (san, p, sq, u) =>
      `${san} attacked the opponent's ${p} on ${sq} ${u ? 'for free' : 'with tempo'}`,
    whyBestCapture: (san, p) => `you could capture an opponent's ${p} with ${san}`,
    whyBestCastle: (san) => `castling (${san}) immediately secured your King and activated the Rook`,
    whyInitiativeEasy: (pv) => `it lets your opponent answer with ${pv} and seize the initiative`,
    whyInitiativePro: (pv) => `it concedes immediate counterplay via ${pv}`,
    whyCpLoss: (loss) => `it loses ${loss} pawns of evaluation compared to the best continuation`,
    andJoin: ' and ',
    bestPlan: (san, line, ev) =>
      `The best choice was **${san}** (line: ${line}), bringing the evaluation to ${ev}.`,
    openGood: (op, acc) => `You handled the opening very well (${op}, ${acc}% accuracy).`,
    openWeak: (op, acc) => `In the opening (${op}, ${acc}%), you already conceded some small inaccuracies.`,
    winSolid: (opp, acc) =>
      `Congrats on beating ${opp}! A very solid game with ${acc}% accuracy.`,
    winShaky: (opp, myAcc, oppAcc) =>
      `You beat ${opp} (${myAcc}% vs ${oppAcc}%), though there are a couple of key moments we can polish to avoid unnecessary risks.`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `Against ${opp}, you finished at ${acc}% accuracy (${blunders} blunders, ${mistakes} mistakes). Let's look straight at what decided the game.`,
    drawSummary: (opp, acc) =>
      `A balanced draw against ${opp} (${acc}% accuracy). Let's check the moments where the game could have swung.`,
    errSevere: 'a critical blunder',
    errMissedWin: 'a missed winning chance',
    errInaccuracy: 'an inaccurate moment',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} I paused the board before your move **${ml}**, which was ${ew}.\n\n**What do you think was the best move in this position?** Try playing it directly on the board!`,
    cleanBeginner: 'You protected your pieces well with zero major blunders!',
    cleanPro: 'Played with strong positional control and no major mistakes.',
    cleanNoQuiz: (v, o, cn) =>
      `${v}\n\n${o} ${cn} Click any move or decisive moment to explore the engine lines.`,
    chips: {
      showSolution: 'Show me the solution',
      whyWrong: 'Why was it wrong?',
      nextDecisive: 'Next decisive moment',
      analyzeWeaknesses: 'Analyze my weaknesses',
      bestMoveQuery: 'What was my best move?',
      phaseSummary: 'Show phase breakdown',
      nextMove: 'Go to next moment',
      showBestVar: 'Show best line',
      whyOtherWrong: 'Why was the game move wrong?',
      strengthsWeaknesses: 'Strengths and weaknesses',
      finalSummary: 'Final summary',
      retryPos: 'Let me retry this position',
      showVarMove: (san) => `Show line ${san}`,
      explainThis: 'Explain this move',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `Great find! **${ml} ${aSan}** is the engine's exact top move.\n\nIn the game you played ${pSan}, which ${why}. ${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `Nice intuition with **${ml} ${aSan}**! It's a very solid continuation (only -${loss} vs the top engine line).\n\nThe engine's #1 choice was **${bSan}**: ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `Watch out: **${ml} ${aSan}** doesn't solve the position's issue (-${loss} pawns).${
        ref ? ` Your opponent can punish it right away with **${ref}**.` : ''
      }\n\n${plan} Check the green arrow on the board and click **"Show line"** to see it play out.`,
    clsMap: {
      book: 'Opening theory move',
      brilliant: 'Brilliant Move (!!)',
      great: 'Great Move (!)',
      good: 'Good move',
      inaccuracy: 'Inaccuracy (?!) ',
      mistake: 'Mistake (?)',
      blunder: 'Blunder (??)',
      missed_win: 'Missed Win (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) =>
      `**${ml}** (${cls}): ${note} The evaluation after this move is ${ev}.`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `The solution here was **${mnc} ${bSan}**!\n\nIn the game **${pSan}** was rated as ${clsL} because ${why}.\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) =>
      `**${ml}** — ${cls}.\n\n**Why it causes trouble:** ${why}.\n\n**What to play instead:** ${plan}`,
    retryMsg: (ml) =>
      `Got it! I reset the board right before **${ml}**.\n\nFind the best move by playing it directly on the board!`,
    bestHighlightMsg: (label, note, ev) =>
      `Your best move was **${label}**!\n\n${note} The position evaluation after this move was **${ev}**.`,
    nextQuizMsg: (label) =>
      `Let's jump to **${label}**.\n\nYou lost ground here: **what do you think was the best move?** Play it on the board!`,
    phases: { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' },
    tipBlunders: (n) =>
      `You made ${n} blunder(s): before confirming a move, always check your opponent's checks and captures.`,
    tipMissed: (n) =>
      `You missed ${n} clear winning chances: when ahead, look for forcing moves first.`,
    tipClean: (wp) =>
      `Great tactical discipline with 0 blunders! Focus on positional details in the ${wp.toLowerCase()}.`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**Your Phase Breakdown (${tot}% overall):**\n• ${opN}: **${opA}%**\n• ${midN}: **${midA}%**\n• ${endN}: **${endA}%**\n\n**Strength:** ${bestN} (${bestV}%).\n**Area to train:** ${weakN} (${weakV}%). ${tip}`,
  },

  es: {
    mateWhite: (n) => `Mate en ${n} para Blancas`,
    mateBlack: (n) => `Mate en ${n} para Negras`,
    whyExposeMate: (n) => `esta jugada expone a tu Rey y permite mate forzado en ${n} jugadas`,
    whyMissedMate: (n) => `tenías mate forzado en ${n} jugadas y se escapó`,
    whyHangingEasy: (p, sq) => `dejas tu ${p} en ${sq} sin defensa`,
    whyHangingPro: (p, sq) => `dejas el ${p} en ${sq} colgado sin protección`,
    whyBestMate: (san) => `la jugada ${san} daba jaque mate directo`,
    whyBestForkEasy: (san) => `con ${san} atacabas dos piezas rivales a la vez`,
    whyBestForkPro: (san, t) => `${san} creaba un ataque doble decisivo (${t})`,
    whyBestAttack: (san, p, sq, u) =>
      `${san} atacaba ${u ? 'gratis' : 'con tiempo'} al ${p} rival en ${sq}`,
    whyBestCapture: (san, p) => `podías capturar un ${p} rival con ${san}`,
    whyBestCastle: (san) => `el enroque (${san}) ponía al Rey a salvo y activaba la Torre`,
    whyInitiativeEasy: (pv) => `permite al rival responder con ${pv} y tomar la iniciativa`,
    whyInitiativePro: (pv) => `concede contrajuego inmediato con ${pv}`,
    whyCpLoss: (loss) => `pierde ${loss} peones de valoración respecto a la mejor línea`,
    andJoin: ' y ',
    bestPlan: (san, line, ev) =>
      `La mejor elección era **${san}** (variante: ${line}), dejando la valoración en ${ev}.`,
    openGood: (op, acc) => `Manejaste muy bien la apertura (${op}, ${acc}% de precisión).`,
    openWeak: (op, acc) => `En la apertura (${op}, ${acc}%) cediste algunas imprecisiones.`,
    winSolid: (opp, acc) => `¡Felicidades por ganar a ${opp}! Partida muy sólida con ${acc}% de precisión.`,
    winShaky: (opp, myAcc, oppAcc) =>
      `Ganaste contra ${opp} (${myAcc}% vs ${oppAcc}%), pero hay un par de momentos clave que podemos pulir.`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `Contra ${opp} cerraste con ${acc}% de precisión (${blunders} errores graves, ${mistakes} errores). Veamos qué decidió la partida.`,
    drawSummary: (opp, acc) =>
      `Tablas equilibradas contra ${opp} (${acc}% de precisión). Revisemos los momentos decisivos.`,
    errSevere: 'un error grave',
    errMissedWin: 'una ocasión ganadora perdida',
    errInaccuracy: 'un momento impreciso',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} Detuve el tablero antes de tu jugada **${ml}**, que fue ${ew}.\n\n**¿Cuál crees que era la mejor jugada aquí?** ¡Juega directamente en el tablero!`,
    cleanBeginner: '¡Protegiste bien tus piezas sin errores graves!',
    cleanPro: 'Partida con gran control posicional y sin errores graves.',
    cleanNoQuiz: (v, o, cn) =>
      `${v}\n\n${o} ${cn} Haz clic en cualquier jugada o momento clave para ver las líneas del motor.`,
    chips: {
      showSolution: 'Muéstrame la solución',
      whyWrong: '¿Por qué estaba mal?',
      nextDecisive: 'Siguiente momento decisivo',
      analyzeWeaknesses: 'Analiza mis puntos débiles',
      bestMoveQuery: '¿Cuál fue mi mejor jugada?',
      phaseSummary: 'Resumen por fases',
      nextMove: 'Ir al siguiente momento',
      showBestVar: 'Mostrar mejor variante',
      whyOtherWrong: '¿Por qué la otra estaba mal?',
      strengthsWeaknesses: 'Puntos fuertes y débiles',
      finalSummary: 'Resumen final',
      retryPos: 'Reintentar esta posición',
      showVarMove: (san) => `Mostrar variante ${san}`,
      explainThis: 'Explícame esta jugada',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `¡Excelente jugada! **${ml} ${aSan}** es exactamente la mejor jugada del motor.\n\nEn la partida jugaste ${pSan}, que ${why}. ${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `¡Buena idea con **${ml} ${aSan}**! Es una continuación sólida (solo -${loss} respecto al motor).\n\nLa primera opción del motor era **${bSan}**: ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `Cuidado: **${ml} ${aSan}** no resuelve el problema (-${loss} peones).${
        ref ? ` El rival puede castigarla con **${ref}**.` : ''
      }\n\n${plan} Mira la flecha verde y pulsa **"Mostrar variante"** para verlo.`,
    clsMap: {
      book: 'Jugada teórica de apertura',
      brilliant: 'Jugada Brillante (!!)',
      great: 'Gran Jugada (!)',
      good: 'Buena jugada',
      inaccuracy: 'Imprecisión (?!) ',
      mistake: 'Error (?)',
      blunder: 'Error grave (??)',
      missed_win: 'Victoria perdida (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) =>
      `**${ml}** (${cls}): ${note} La valoración tras esta jugada es ${ev}.`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `¡La solución era **${mnc} ${bSan}**!\n\nEn la partida **${pSan}** fue ${clsL} porque ${why}.\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) =>
      `**${ml}** — ${cls}.\n\n**Por qué da problemas:** ${why}.\n\n**Qué jugar en su lugar:** ${plan}`,
    retryMsg: (ml) =>
      `¡Listo! Reinicié el tablero justo antes de **${ml}**.\n\n¡Encuentra la mejor jugada moviendo en el tablero!`,
    bestHighlightMsg: (label, note, ev) =>
      `¡Tu mejor jugada fue **${label}**!\n\n${note} La valoración tras esta jugada fue **${ev}**.`,
    nextQuizMsg: (label) =>
      `Pasemos a **${label}**.\n\nAquí perdiste ventaja: **¿cuál era la mejor jugada?** ¡Muévela en el tablero!`,
    phases: { opening: 'Apertura', middlegame: 'Medio juego', endgame: 'Final' },
    tipBlunders: (n) =>
      `Cometiste ${n} errores graves: revisa siempre jaques y capturas del rival antes de jugar.`,
    tipMissed: (n) =>
      `Dejaste pasar ${n} ocasiones claras: busca primero jugadas forzadas cuando tengas ventaja.`,
    tipClean: (wp) =>
      `¡Gran disciplina táctica con 0 errores graves! Trabaja los detalles del ${wp.toLowerCase()}.`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**Análisis por fases (${tot}% total):**\n• ${opN}: **${opA}%**\n• ${midN}: **${midA}%**\n• ${endN}: **${endA}%**\n\n**Punto fuerte:** ${bestN} (${bestV}%).\n**Área a mejorar:** ${weakN} (${weakV}%). ${tip}`,
  },

  fr: {
    mateWhite: (n) => `Mat en ${n} pour les Blancs`,
    mateBlack: (n) => `Mat en ${n} pour les Noirs`,
    whyExposeMate: (n) => `ce coup expose votre Roi et permet un mat forcé en ${n} coups`,
    whyMissedMate: (n) => `vous aviez un mat forcé en ${n} coups qui vous a échappé`,
    whyHangingEasy: (p, sq) => `vous laissez votre ${p} en ${sq} sans défense`,
    whyHangingPro: (p, sq) => `vous laissez le ${p} en ${sq} en prise sans protection`,
    whyBestMate: (san) => `le coup ${san} donnait échec et mat directement`,
    whyBestForkEasy: (san) => `avec ${san}, vous attaquiez deux pièces adverses à la fois`,
    whyBestForkPro: (san, t) => `${san} créait une fourchette décisive (${t})`,
    whyBestAttack: (san, p, sq, u) =>
      `${san} attaquait ${u ? 'gratuitement' : 'avec gain de temps'} le ${p} adverse en ${sq}`,
    whyBestCapture: (san, p) => `vous pouviez capturer un ${p} adverse avec ${san}`,
    whyBestCastle: (san) => `le roque (${san}) sécurisait le Roi et activait la Tour`,
    whyInitiativeEasy: (pv) => `laisse l'adversaire répondre par ${pv} et prendre l'initiative`,
    whyInitiativePro: (pv) => `concède un contre-jeu immédiat via ${pv}`,
    whyCpLoss: (loss) => `fait perdre ${loss} pions d'évaluation par rapport au meilleur coup`,
    andJoin: ' et ',
    bestPlan: (san, line, ev) =>
      `Le meilleur choix était **${san}** (variante : ${line}), portant l'évaluation à ${ev}.`,
    openGood: (op, acc) => `Vous avez très bien géré l'ouverture (${op}, ${acc}% de précision).`,
    openWeak: (op, acc) => `Dans l'ouverture (${op}, ${acc}%), quelques imprécisions ont été commises.`,
    winSolid: (opp, acc) => `Bravo pour votre victoire contre ${opp} ! Partie solide à ${acc}% de précision.`,
    winShaky: (opp, myAcc, oppAcc) =>
      `Victoire contre ${opp} (${myAcc}% vs ${oppAcc}%), avec quelques moments clés à peaufiner.`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `Face à ${opp}, vous terminez à ${acc}% (${blunders} gaffes, ${mistakes} erreurs). Voyons ce qui a fait basculer la partie.`,
    drawSummary: (opp, acc) =>
      `Nulle équilibrée contre ${opp} (${acc}% de précision). Regardons les moments décisifs.`,
    errSevere: 'une gaffe grave',
    errMissedWin: 'une occasion de gain manquée',
    errInaccuracy: 'un coup imprécis',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} J'ai arrêté l'échiquier avant votre coup **${ml}**, qui était ${ew}.\n\n**Quel était le meilleur coup ici selon vous ?** Jouez-le directement sur l'échiquier !`,
    cleanBeginner: 'Vous avez bien protégé vos pièces sans gaffe majeure !',
    cleanPro: 'Partie jouée avec un excellent contrôle positionnel et sans gaffe.',
    cleanNoQuiz: (v, o, cn) =>
      `${v}\n\n${o} ${cn} Cliquez sur n'importe quel coup ou moment clé pour explorer les variantes.`,
    chips: {
      showSolution: 'Montre-moi la solution',
      whyWrong: 'Pourquoi était-ce mauvais ?',
      nextDecisive: 'Moment décisif suivant',
      analyzeWeaknesses: 'Analyser mes points faibles',
      bestMoveQuery: 'Quel a été mon meilleur coup ?',
      phaseSummary: 'Résumé par phase',
      nextMove: 'Passer au moment suivant',
      showBestVar: 'Voir la meilleure variante',
      whyOtherWrong: 'Pourquoi l’autre coup était mauvais ?',
      strengthsWeaknesses: 'Points forts et faibles',
      finalSummary: 'Résumé final',
      retryPos: 'Réessayer cette position',
      showVarMove: (san) => `Voir variante ${san}`,
      explainThis: 'Explique ce coup',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `Super coup ! **${ml} ${aSan}** est exactement le meilleur coup du moteur.\n\nDans la partie vous avez joué ${pSan}, qui ${why}. ${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `Bonne intuition avec **${ml} ${aSan}** ! Coup très solide (seulement -${loss} par rapport au moteur).\n\nLe choix #1 du moteur était **${bSan}** : ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `Attention : **${ml} ${aSan}** ne résout pas le problème (-${loss} pions).${
        ref ? ` L'adversaire peut punir avec **${ref}**.` : ''
      }\n\n${plan} Regardez la flèche verte et cliquez sur **"Voir variante"**.`,
    clsMap: {
      book: 'Coup théorique',
      brilliant: 'Coup Brillant (!!)',
      great: 'Très Bon Coup (!)',
      good: 'Bon coup',
      inaccuracy: 'Imprécision (?!) ',
      mistake: 'Erreur (?)',
      blunder: 'Gaffe (??)',
      missed_win: 'Gain manqué (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) =>
      `**${ml}** (${cls}) : ${note} Évaluation après ce coup : ${ev}.`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `La solution était **${mnc} ${bSan}** !\n\nDans la partie, **${pSan}** a été classé ${clsL} car ${why}.\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) =>
      `**${ml}** — ${cls}.\n\n**Pourquoi c'est risqué :** ${why}.\n\n**Quoi jouer à la place :** ${plan}`,
    retryMsg: (ml) =>
      `Parfait ! Position replacée juste avant **${ml}**.\n\nTrouvez le meilleur coup directement sur l'échiquier !`,
    bestHighlightMsg: (label, note, ev) =>
      `Votre meilleur coup était **${label}** !\n\n${note} L'évaluation après ce coup était **${ev}**.`,
    nextQuizMsg: (label) =>
      `Passons au coup **${label}**.\n\nVous avez cédé du terrain ici : **quel était le meilleur coup ?** Jouez-le sur l'échiquier !`,
    phases: { opening: 'Ouverture', middlegame: 'Milieu de jeu', endgame: 'Finale' },
    tipBlunders: (n) =>
      `Vous avez commis ${n} gaffe(s) : vérifiez toujours les échecs et prises adverses avant de jouer.`,
    tipMissed: (n) =>
      `Vous avez manqué ${n} occasions nettes : cherchez d'abord les coups forcés quand vous menez.`,
    tipClean: (wp) =>
      `Excellente discipline tactique avec 0 gaffe ! Travaillez les détails en ${wp.toLowerCase()}.`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**Analyse par phase (${tot}% global) :**\n• ${opN} : **${opA}%**\n• ${midN} : **${midA}%**\n• ${endN} : **${endA}%**\n\n**Point fort :** ${bestN} (${bestV}%).\n**À travailler :** ${weakN} (${weakV}%). ${tip}`,
  },

  de: {
    mateWhite: (n) => `Matt in ${n} für Weiß`,
    mateBlack: (n) => `Matt in ${n} für Schwarz`,
    whyExposeMate: (n) => `dieser Zug entblößt deinen König und erlaubt ein erzwungenes Matt in ${n} Zügen`,
    whyMissedMate: (n) => `hier hattest du ein erzwungenes Matt in ${n} Zügen`,
    whyHangingEasy: (p, sq) => `dein ${p} auf ${sq} steht völlig ungedeckt`,
    whyHangingPro: (p, sq) => `dein ${p} auf ${sq} hängt ohne Verteidigung`,
    whyBestMate: (san) => `der Zug ${san} setzte direkt Schachmatt`,
    whyBestForkEasy: (san) => `mit ${san} konntest du zwei gegnerische Figuren gleichzeitig angreifen`,
    whyBestForkPro: (san, t) => `${san} schuf einen entscheidenden Doppelangriff (${t})`,
    whyBestAttack: (san, p, sq, u) =>
      `${san} griff den gegnerischen ${p} auf ${sq} ${u ? 'kostenlos' : 'mit Tempo'} an`,
    whyBestCapture: (san, p) => `du konntest mit ${san} einen gegnerischen ${p} schlagen`,
    whyBestCastle: (san) => `die Rochade (${san}) brachte den König in Sicherheit und aktivierte den Turm`,
    whyInitiativeEasy: (pv) => `erlaubt dem Gegner mit ${pv} die Initiative zu übernehmen`,
    whyInitiativePro: (pv) => `gewährt sofortiges Gegenspiel durch ${pv}`,
    whyCpLoss: (loss) => `verliert ${loss} Bauern Bewertung gegenüber dem besten Zug`,
    andJoin: ' und ',
    bestPlan: (san, line, ev) =>
      `Die beste Wahl war **${san}** (Variante: ${line}), mit Bewertung ${ev}.`,
    openGood: (op, acc) => `Du hast die Eröffnung sehr gut gespielt (${op}, ${acc}% Genauigkeit).`,
    openWeak: (op, acc) => `In der Eröffnung (${op}, ${acc}%) gab es schon kleine Ungenauigkeiten.`,
    winSolid: (opp, acc) => `Glückwunsch zum Sieg gegen ${opp}! Sehr solide Partie mit ${acc}% Genauigkeit.`,
    winShaky: (opp, myAcc, oppAcc) =>
      `Du hast gegen ${opp} gewonnen (${myAcc}% vs ${oppAcc}%), aber es gab ein paar kritische Momente.`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `Gegen ${opp} lagst du bei ${acc}% Genauigkeit (${blunders} Patzer, ${mistakes} Fehler). Schauen wir auf die entscheidenden Momente.`,
    drawSummary: (opp, acc) =>
      `Ausgeglichenes Remis gegen ${opp} (${acc}% Genauigkeit). Sehen wir uns die Schlüsselmomente an.`,
    errSevere: 'ein schwerer Patzer',
    errMissedWin: 'eine verpasste Gewinnchance',
    errInaccuracy: 'eine Ungenauigkeit',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} Ich habe vor deinem Zug **${ml}** gestoppt, der ${ew} war.\n\n**Was war hier deiner Meinung nach der beste Zug?** Ziehe direkt auf dem Brett!`,
    cleanBeginner: 'Du hast deine Figuren gut geschützt und keine groben Patzer gemacht!',
    cleanPro: 'Sehr solide positionelle Partie ohne grobe Fehler.',
    cleanNoQuiz: (v, o, cn) =>
      `${v}\n\n${o} ${cn} Klicke auf einen beliebigen Zug oder Moment für Engine-Varianten.`,
    chips: {
      showSolution: 'Lösung zeigen',
      whyWrong: 'Warum war das falsch?',
      nextDecisive: 'Nächster Schlüsselmoment',
      analyzeWeaknesses: 'Meine Schwächen analysieren',
      bestMoveQuery: 'Was war mein bester Zug?',
      phaseSummary: 'Phasenübersicht zeigen',
      nextMove: 'Zum nächsten Moment',
      showBestVar: 'Beste Variante zeigen',
      whyOtherWrong: 'Warum war mein Zug falsch?',
      strengthsWeaknesses: 'Stärken und Schwächen',
      finalSummary: 'Zusammenfassung',
      retryPos: 'Position erneut versuchen',
      showVarMove: (san) => `Variante ${san} zeigen`,
      explainThis: 'Zug erklären',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `Stark gefunden! **${ml} ${aSan}** ist exakt der beste Zug der Engine.\n\nIn der Partie spieltest du ${pSan}, was ${why}. ${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `Gute Idee mit **${ml} ${aSan}**! Eine sehr solide Fortsetzung (nur -${loss} hinter der Engine-Wahl).\n\nTop-Zug der Engine war **${bSan}**: ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `Achtung: **${ml} ${aSan}** löst das Problem nicht (-${loss} Bauern).${
        ref ? ` Der Gegner kann dies mit **${ref}** bestrafen.` : ''
      }\n\n${plan} Sieh dir den grünen Pfeil an und klicke auf **"Variante zeigen"**.`,
    clsMap: {
      book: 'Theoriezug',
      brilliant: 'Brillanter Zug (!!)',
      great: 'Starker Zug (!)',
      good: 'Guter Zug',
      inaccuracy: 'Ungenauigkeit (?!) ',
      mistake: 'Fehler (?)',
      blunder: 'Patzer (??)',
      missed_win: 'Verpasster Gewinn (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) =>
      `**${ml}** (${cls}): ${note} Bewertung nach diesem Zug: ${ev}.`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `Die Lösung war **${mnc} ${bSan}**!\n\nIn der Partie wurde **${pSan}** als ${clsL} bewertet, weil ${why}.\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) =>
      `**${ml}** — ${cls}.\n\n**Warum problematisch:** ${why}.\n\n**Besser stattdessen:** ${plan}`,
    retryMsg: (ml) =>
      `Alles klar! Stellung vor **${ml}** wiederhergestellt.\n\nFinde den besten Zug direkt auf dem Brett!`,
    bestHighlightMsg: (label, note, ev) =>
      `Dein bester Zug war **${label}**!\n\n${note} Stellung danach: **${ev}**.`,
    nextQuizMsg: (label) =>
      `Weiter zu **${label}**.\n\nHier ging Vorteil verloren: **Was war der beste Zug?** Spiele ihn auf dem Brett!`,
    phases: { opening: 'Eröffnung', middlegame: 'Mittelspiel', endgame: 'Endspiel' },
    tipBlunders: (n) =>
      `Du hattest ${n} Patzer: prüfe vor jedem Zug Schachs und Schlagzüge des Gegners.`,
    tipMissed: (n) =>
      `Du hast ${n} klare Gewinnchancen ausgelassen: suche bei Vorteil zuerst nach forcierten Zügen.`,
    tipClean: (wp) =>
      `Starke Disziplin mit 0 Patzern! Feile noch an Details im ${wp}.`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**Phasenanalyse (${tot}% gesamt):**\n• ${opN}: **${opA}%**\n• ${midN}: **${midA}%**\n• ${endN}: **${endA}%**\n\n**Stärke:** ${bestN} (${bestV}%).\n**Trainingsfokus:** ${weakN} (${weakV}%). ${tip}`,
  },

  pt: {
    mateWhite: (n) => `Mate em ${n} para Brancas`,
    mateBlack: (n) => `Mate em ${n} para Pretas`,
    whyExposeMate: (n) => `este lance expõe seu Rei e permite xeque-mate forçado em ${n} lances`,
    whyMissedMate: (n) => `havia xeque-mate forçado em ${n} lances aqui que escapou`,
    whyHangingEasy: (p, sq) => `você deixa seu ${p} em ${sq} sem defesa`,
    whyHangingPro: (p, sq) => `você deixa o ${p} em ${sq} solto sem proteção`,
    whyBestMate: (san) => `o lance ${san} dava xeque-mate direto`,
    whyBestForkEasy: (san) => `com ${san} você atacava duas peças adversárias ao mesmo tempo`,
    whyBestForkPro: (san, t) => `${san} criava um ataque duplo decisivo (${t})`,
    whyBestAttack: (san, p, sq, u) =>
      `${san} atacava ${u ? 'de graça' : 'com tempo'} o ${p} adversário em ${sq}`,
    whyBestCapture: (san, p) => `você podia capturar um ${p} adversário com ${san}`,
    whyBestCastle: (san) => `o roque (${san}) protegia o Rei e ativava a Torre`,
    whyInitiativeEasy: (pv) => `permite ao oponente responder com ${pv} e tomar a iniciativa`,
    whyInitiativePro: (pv) => `concede contrajogo imediato com ${pv}`,
    whyCpLoss: (loss) => `perde ${loss} peões de avaliação em relação à melhor linha`,
    andJoin: ' e ',
    bestPlan: (san, line, ev) =>
      `A melhor escolha era **${san}** (variante: ${line}), levando a avaliação para ${ev}.`,
    openGood: (op, acc) => `Você jogou muito bem a abertura (${op}, ${acc}% de precisão).`,
    openWeak: (op, acc) => `Na abertura (${op}, ${acc}%), você cedeu algumas imprecisões.`,
    winSolid: (opp, acc) => `Parabéns pela vitória contra ${opp}! Partida sólida com ${acc}% de precisão.`,
    winShaky: (opp, myAcc, oppAcc) =>
      `Você venceu ${opp} (${myAcc}% vs ${oppAcc}%), mas há momentos-chave que podemos melhorar.`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `Contra ${opp}, você terminou com ${acc}% de precisão (${blunders} erros graves, ${mistakes} erros). Veja o que decidiu a partida.`,
    drawSummary: (opp, acc) =>
      `Empate equilibrado contra ${opp} (${acc}% de precisão). Vamos ver os momentos decisivos.`,
    errSevere: 'um erro grave',
    errMissedWin: 'uma chance clara de vitória perdida',
    errInaccuracy: 'uma imprecisão',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} Parei o tabuleiro antes do seu lance **${ml}**, que foi ${ew}.\n\n**Qual seria o melhor lance nesta posição?** Jogue diretamente no tabuleiro!`,
    cleanBeginner: 'Você protegeu bem suas peças sem erros graves!',
    cleanPro: 'Partida com ótimo controle posicional e sem erros graves.',
    cleanNoQuiz: (v, o, cn) =>
      `${v}\n\n${o} ${cn} Clique em qualquer lance ou momento para explorar as variantes.`,
    chips: {
      showSolution: 'Mostrar solução',
      whyWrong: 'Por que estava errado?',
      nextDecisive: 'Próximo momento decisivo',
      analyzeWeaknesses: 'Analisar pontos fracos',
      bestMoveQuery: 'Qual foi meu melhor lance?',
      phaseSummary: 'Resumo por fase',
      nextMove: 'Próximo momento',
      showBestVar: 'Ver melhor variante',
      whyOtherWrong: 'Por que o outro estava errado?',
      strengthsWeaknesses: 'Pontos fortes e fracos',
      finalSummary: 'Resumo final',
      retryPos: 'Tentar esta posição novamente',
      showVarMove: (san) => `Ver variante ${san}`,
      explainThis: 'Explicar este lance',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `Belo lance! **${ml} ${aSan}** é exatamente o melhor lance do motor.\n\nNa partida você jogou ${pSan}, que ${why}. ${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `Boa intuição com **${ml} ${aSan}**! Continuação sólida (apenas -${loss} em relação ao motor).\n\nA escolha #1 era **${bSan}**: ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `Cuidado: **${ml} ${aSan}** não resolve o problema (-${loss} peões).${
        ref ? ` O adversário pode punir com **${ref}**.` : ''
      }\n\n${plan} Veja a seta verde e clique em **"Ver variante"**.`,
    clsMap: {
      book: 'Lance teórico',
      brilliant: 'Lance Brilhante (!!)',
      great: 'Ótimo Lance (!)',
      good: 'Bom lance',
      inaccuracy: 'Imprecisão (?!) ',
      mistake: 'Erro (?)',
      blunder: 'Erro grave (??)',
      missed_win: 'Vitória perdida (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) =>
      `**${ml}** (${cls}): ${note} Avaliação após este lance: ${ev}.`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `A solução era **${mnc} ${bSan}**!\n\nNa partida **${pSan}** foi ${clsL} porque ${why}.\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) =>
      `**${ml}** — ${cls}.\n\n**Por que cria problemas:** ${why}.\n\n**O que jogar:** ${plan}`,
    retryMsg: (ml) =>
      `Perfeito! Reposicionei antes de **${ml}**.\n\nEncontre o melhor lance no tabuleiro!`,
    bestHighlightMsg: (label, note, ev) =>
      `Seu melhor lance foi **${label}**!\n\n${note} Avaliação após o lance: **${ev}**.`,
    nextQuizMsg: (label) =>
      `Vamos para **${label}**.\n\nAqui você perdeu vantagem: **qual era o melhor lance?** Mova no tabuleiro!`,
    phases: { opening: 'Abertura', middlegame: 'Meio-jogo', endgame: 'Final' },
    tipBlunders: (n) =>
      `Você cometeu ${n} erro(s) grave(s): verifique sempre xeques e capturas adversárias.`,
    tipMissed: (n) =>
      `Você perdeu ${n} chances claras: procure lances forçados quando estiver em vantagem.`,
    tipClean: (wp) =>
      `Ótima disciplina tática com 0 erros graves! Refine os detalhes no ${wp.toLowerCase()}.`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**Análise por fase (${tot}% total):**\n• ${opN}: **${opA}%**\n• ${midN}: **${midA}%**\n• ${endN}: **${endA}%**\n\n**Ponto forte:** ${bestN} (${bestV}%).\n**Área a treinar:** ${weakN} (${weakV}%). ${tip}`,
  },

  ru: {
    mateWhite: (n) => `Мат в ${n} (белые)`,
    mateBlack: (n) => `Мат в ${n} (чёрные)`,
    whyExposeMate: (n) => `ход ослабляет короля и допускает мат в ${n} ходов`,
    whyMissedMate: (n) => `здесь был форсированный мат в ${n} ходов`,
    whyHangingEasy: (p, sq) => `фигура (${p}) на ${sq} остаётся без защиты`,
    whyHangingPro: (p, sq) => `${p} на ${sq} остаётся под боем без защиты`,
    whyBestMate: (san) => `ход ${san} сразу ставил мат`,
    whyBestForkEasy: (san) => `ход ${san} создавал двойной удар`,
    whyBestForkPro: (san, t) => `${san} создавал решающую вилку (${t})`,
    whyBestAttack: (san, p, sq, u) => `${san} атаковал ${p} на ${sq} ${u ? 'бесплатно' : 'с темпом'}`,
    whyBestCapture: (san, p) => `можно было забрать ${p} ходом ${san}`,
    whyBestCastle: (san) => `рокировка (${san}) укрывала короля и вводила ладью`,
    whyInitiativeEasy: (pv) => `позволяет сопернику ответить ${pv} и перехватить инициативу`,
    whyInitiativePro: (pv) => `даёт контригру после ${pv}`,
    whyCpLoss: (loss) => `теряет ${loss} пешки по оценке движка`,
    andJoin: ' и ',
    bestPlan: (san, line, ev) => `Лучшим ходом было **${san}** (${line}), оценка ${ev}.`,
    openGood: (op, acc) => `Отличный дебют (${op}, точность ${acc}%).`,
    openWeak: (op, acc) => `В дебюте (${op}, ${acc}%) были небольшие неточности.`,
    winSolid: (opp, acc) => `Поздравляем с победой над ${opp}! Уверенная партия (${acc}%).`,
    winShaky: (opp, myAcc, oppAcc) => `Победа над ${opp} (${myAcc}% против ${oppAcc}%), но есть важные моменты.`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `Против ${opp}: точность ${acc}% (зевков: ${blunders}, ошибок: ${mistakes}). Разберём ключевые моменты.`,
    drawSummary: (opp, acc) => `Ничья с ${opp} (точность ${acc}%). Посмотрим решающие позиции.`,
    errSevere: 'грубый зевок',
    errMissedWin: 'упущенный выигрыш',
    errInaccuracy: 'неточность',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} Я остановил партию перед вашим ходом **${ml}** (${ew}).\n\n**Какой ход был лучшим в этой позиции?** Сделайте его на доске!`,
    cleanBeginner: 'Вы надёжно защищали фигуры и избежали грубых зевков!',
    cleanPro: 'Сильная позиционная партия без грубых ошибок.',
    cleanNoQuiz: (v, o, cn) => `${v}\n\n${o} ${cn} Нажмите на любой ход, чтобы изучить варианты движка.`,
    chips: {
      showSolution: 'Показать решение',
      whyWrong: 'Почему это ошибка?',
      nextDecisive: 'Следующий ключевой момент',
      analyzeWeaknesses: 'Разобрать слабые стороны',
      bestMoveQuery: 'Какой ход был лучшим в партии?',
      phaseSummary: 'Сводка по фазам',
      nextMove: 'К следующему моменту',
      showBestVar: 'Показать лучший вариант',
      whyOtherWrong: 'Почему прошлый ход был плохим?',
      strengthsWeaknesses: 'Сильные и слабые стороны',
      finalSummary: 'Итоги',
      retryPos: 'Попробовать снова',
      showVarMove: (san) => `Вариант ${san}`,
      explainThis: 'Объяснить этот ход',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `Отлично! **${ml} ${aSan}** — лучший ход движка.\n\nВ партии было сыграно ${pSan}, что ${why}. ${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `Хороший выбор: **${ml} ${aSan}** (всего -${loss}).\n\nГлавный ход движка — **${bSan}**: ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `Осторожно: **${ml} ${aSan}** не решает задачу (-${loss} пеш.).${
        ref ? ` Соперник отвечает **${ref}**.` : ''
      }\n\n${plan}`,
    clsMap: {
      book: 'Дебютная теория',
      brilliant: 'Блестящий ход (!!)',
      great: 'Отличный ход (!)',
      good: 'Хороший ход',
      inaccuracy: 'Неточность (?!) ',
      mistake: 'Ошибка (?)',
      blunder: 'Зевок (??)',
      missed_win: 'Упущенный выигрыш (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) => `**${ml}** (${cls}): ${note} Оценка: ${ev}.`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `Решение — **${mnc} ${bSan}**!\n\nВ партии **${pSan}** (${clsL}): ${why}.\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) => `**${ml}** — ${cls}.\n\n**Проблема:** ${why}.\n\n**Лучше:** ${plan}`,
    retryMsg: (ml) => `Позиция перед **${ml}** восстановлена. Найдите лучший ход на доске!`,
    bestHighlightMsg: (label, note, ev) => `Ваш лучший ход: **${label}**! ${note} Оценка: **${ev}**.`,
    nextQuizMsg: (label) => `Переходим к **${label}**. Найдите сильнейший ход на доске!`,
    phases: { opening: 'Дебют', middlegame: 'Миттельшпиль', endgame: 'Эндшпиль' },
    tipBlunders: (n) => `Зевков: ${n}. Перед ходом проверяйте шахи и взятия соперника.`,
    tipMissed: (n) => `Упущено шансов: ${n}. При перевесе ищите форсированные ходы.`,
    tipClean: (wp) => `Отличная тактическая дисциплина (0 зевков)! Поработайте над фазой: ${wp}.`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**Точность по фазам (${tot}%):**\n• ${opN}: **${opA}%**\n• ${midN}: **${midA}%**\n• ${endN}: **${endA}%**\n\n**Сильная фаза:** ${bestN} (${bestV}%).\n**Зона роста:** ${weakN} (${weakV}%). ${tip}`,
  },

  zh: {
    mateWhite: (n) => `白棋 ${n} 步杀`,
    mateBlack: (n) => `黑棋 ${n} 步杀`,
    whyExposeMate: (n) => `此着暴露己方王，允许对手 ${n} 步强制将杀`,
    whyMissedMate: (n) => `此处有 ${n} 步强制将杀机会被错过了`,
    whyHangingEasy: (p, sq) => `${sq} 格的${p}处于无保护状态`,
    whyHangingPro: (p, sq) => `${sq} 格的${p}悬空无援`,
    whyBestMate: (san) => `${san} 可直接将杀`,
    whyBestForkEasy: (san) => `${san} 可同时攻击对方两个棋子`,
    whyBestForkPro: (san, t) => `${san} 制造决定性双重攻击（${t}）`,
    whyBestAttack: (san, p, sq, u) => `${san} 攻击了 ${sq} 格的对方${p}`,
    whyBestCapture: (san, p) => `可以用 ${san} 吃掉对方${p}`,
    whyBestCastle: (san) => `易位（${san}）可立即保护王并出车`,
    whyInitiativeEasy: (pv) => `允许对手走出 ${pv} 夺取主动权`,
    whyInitiativePro: (pv) => `让对手通过 ${pv} 获得反击`,
    whyCpLoss: (loss) => `相比最佳着法损失 ${loss} 兵评估`,
    andJoin: '，且',
    bestPlan: (san, line, ev) => `最佳选择是 **${san}**（变化：${line}），评估为 ${ev}。`,
    openGood: (op, acc) => `开局处理非常稳健（${op}，精准度 ${acc}%）。`,
    openWeak: (op, acc) => `开局阶段（${op}，${acc}%）出现了一些小失误。`,
    winSolid: (opp, acc) => `恭喜战胜 ${opp}！对局非常稳健，精准度 ${acc}%。`,
    winShaky: (opp, myAcc, oppAcc) => `你战胜了 ${opp}（${myAcc}% 对 ${oppAcc}%），但仍有几个关键回合可以改进。`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `对阵 ${opp} 的精准度为 ${acc}%（${blunders} 个漏着，${mistakes} 个失误）。让我们看看胜负关键。`,
    drawSummary: (opp, acc) => `与 ${opp} 战成和棋（精准度 ${acc}%）。一起来看看关键时刻。`,
    errSevere: '严重漏着',
    errMissedWin: '错失胜机',
    errInaccuracy: '不够精确的着法',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} 我将棋盘停在你的 **${ml}** 之前（这是一步${ew}）。\n\n**你认为这里最好的着法是什么？** 直接在棋盘上走出来吧！`,
    cleanBeginner: '你很好地保护了棋子，没有严重漏着！',
    cleanPro: '整局掌控力出色，没有严重失误。',
    cleanNoQuiz: (v, o, cn) => `${v}\n\n${o} ${cn} 点击任意着法或关键时刻查看引擎变化。`,
    chips: {
      showSolution: '显示正解',
      whyWrong: '为什么不好？',
      nextDecisive: '下一个关键时刻',
      analyzeWeaknesses: '分析我的弱点',
      bestMoveQuery: '我最好的一步是哪步？',
      phaseSummary: '显示各阶段总结',
      nextMove: '前往下一关键时刻',
      showBestVar: '查看最佳变例',
      whyOtherWrong: '原着法为什么不好？',
      strengthsWeaknesses: '优势与弱点',
      finalSummary: '最终总结',
      retryPos: '再试一次这步',
      showVarMove: (san) => `查看变例 ${san}`,
      explainThis: '解释这一步',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `太棒了！**${ml} ${aSan}** 正是引擎的最佳着法。\n\n实战中你走了 ${pSan}，${why}。${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `不错的直觉！**${ml} ${aSan}** 非常稳健（仅比首选少 -${loss}）。\n\n引擎第一选择是 **${bSan}**：${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `注意：**${ml} ${aSan}** 没能解决局面问题（-${loss} 兵）。${
        ref ? ` 对手可用 **${ref}** 惩罚。` : ''
      }\n\n${plan}`,
    clsMap: {
      book: '开局定式',
      brilliant: '妙手 (!!)',
      great: '佳着 (!)',
      good: '好棋',
      inaccuracy: '不精确 (?!) ',
      mistake: '失误 (?)',
      blunder: '漏着 (??)',
      missed_win: '错失胜机 (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) => `**${ml}**（${cls}）：${note} 评估：${ev}。`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `正解是 **${mnc} ${bSan}**！\n\n实战 **${pSan}** 为${clsL}，因为${why}。\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) => `**${ml}** — ${cls}。\n\n**问题所在：** ${why}。\n\n**更好选择：** ${plan}`,
    retryMsg: (ml) => `已重置到 **${ml}** 之前的局面。请在棋盘上走出最佳着法！`,
    bestHighlightMsg: (label, note, ev) => `你最佳的一步是 **${label}**！${note} 局面评估：**${ev}**。`,
    nextQuizMsg: (label) => `来到 **${label}**。这里最好的着法是什么？请在棋盘上尝试！`,
    phases: { opening: '开局', middlegame: '中局', endgame: '残局' },
    tipBlunders: (n) => `共有 ${n} 次漏着：落子前先检查对方的将军与吃子手段。`,
    tipMissed: (n) => `错过了 ${n} 次清晰胜机：占优时优先寻找强制着法。`,
    tipClean: (wp) => `战术纪律极佳，0 漏着！可重点打磨${wp}细节。`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**阶段精准度分析（总计 ${tot}%）：**\n• ${opN}：**${opA}%**\n• ${midN}：**${midA}%**\n• ${endN}：**${endA}%**\n\n**优势阶段：** ${bestN}（${bestV}%）。\n**待加强：** ${weakN}（${weakV}%）。${tip}`,
  },

  ja: {
    mateWhite: (n) => `白の${n}手詰め`,
    mateBlack: (n) => `黒の${n}手詰め`,
    whyExposeMate: (n) => `キングが危険になり、${n}手詰めを許してしまいます`,
    whyMissedMate: (n) => `ここに${n}手詰めの勝ち筋がありました`,
    whyHangingEasy: (p, sq) => `${sq}の${p}が守られていません`,
    whyHangingPro: (p, sq) => `${sq}の${p}がタダ取りになります`,
    whyBestMate: (san) => `${san}で即座にチェックメイトでした`,
    whyBestForkEasy: (san) => `${san}で相手の2つの駒を同時に攻撃できました`,
    whyBestForkPro: (san, t) => `${san}が決定的な両取り（${t}）を作りました`,
    whyBestAttack: (san, p, sq) => `${san}で${sq}の相手の${p}を攻撃できました`,
    whyBestCapture: (san, p) => `${san}で相手の${p}を取れました`,
    whyBestCastle: (san) => `キャスリング（${san}）で玉を安全にしつつルークを活用できました`,
    whyInitiativeEasy: (pv) => `相手に${pv}で主導権を渡してしまいます`,
    whyInitiativePro: (pv) => `${pv}で反撃を許します`,
    whyCpLoss: (loss) => `最善手に比べて評価値を${loss}ポーン失います`,
    andJoin: '、さらに',
    bestPlan: (san, line, ev) => `最善は **${san}**（手順: ${line}）、評価値は ${ev} でした。`,
    openGood: (op, acc) => `序盤を非常に上手く指しました（${op}、正確度 ${acc}%）。`,
    openWeak: (op, acc) => `序盤（${op}、${acc}%）で小さな疑問手がありました。`,
    winSolid: (opp, acc) => `${opp} への勝利おめでとうございます！正確度 ${acc}% の堅実な内容です。`,
    winShaky: (opp, myAcc, oppAcc) => `${opp} に勝ちました（${myAcc}% 対 ${oppAcc}%）が、見直せる重要局面があります。`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `${opp} 戦は正確度 ${acc}%（大悪手 ${blunders}、悪手 ${mistakes}）。勝敗を分けた手を見てみましょう。`,
    drawSummary: (opp, acc) => `${opp} と引き分けました（正確度 ${acc}%）。重要局面を確認しましょう。`,
    errSevere: '大悪手',
    errMissedWin: '勝ち逃し',
    errInaccuracy: '疑問手',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} あなたの **${ml}**（${ew}）の直前で盤面を止めました。\n\n**この局面の最善手はどれでしょう？** 盤上で指してみてください！`,
    cleanBeginner: '大悪手を出さず、駒をしっかり守れました！',
    cleanPro: '大悪手のない高い位置感覚での対局でした。',
    cleanNoQuiz: (v, o, cn) => `${v}\n\n${o} ${cn} 棋譜の手をクリックして変化を確認できます。`,
    chips: {
      showSolution: '正解を見る',
      whyWrong: 'なぜ悪かったのですか？',
      nextDecisive: '次の重要局面',
      analyzeWeaknesses: '弱点を分析する',
      bestMoveQuery: '一番良かった手は？',
      phaseSummary: 'フェーズ別要約',
      nextMove: '次の局面へ',
      showBestVar: '最善変化を見る',
      whyOtherWrong: 'なぜその手は悪かった？',
      strengthsWeaknesses: '強みと弱点',
      finalSummary: '最終まとめ',
      retryPos: 'この局面をやり直す',
      showVarMove: (san) => `変化 ${san} を見る`,
      explainThis: 'この手を解説',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `素晴らしい！ **${ml} ${aSan}** がエンジンの最善手です。\n\n実戦の ${pSan} は${why}。${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `良い読みです！ **${ml} ${aSan}** は堅実な手です（最善と -${loss} 差）。\n\nエンジンの第1候補は **${bSan}**: ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `注意：**${ml} ${aSan}** では解決しません（-${loss} ポーン）。${
        ref ? ` 相手は **${ref}** と反撃できます。` : ''
      }\n\n${plan}`,
    clsMap: {
      book: '定跡手',
      brilliant: '妙手 (!!)',
      great: '好手 (!)',
      good: '良手',
      inaccuracy: '疑問手 (?!) ',
      mistake: '悪手 (?)',
      blunder: '大悪手 (??)',
      missed_win: '勝ち逃し (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) => `**${ml}**（${cls}）: ${note} 評価値: ${ev}。`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `正解は **${mnc} ${bSan}** でした！\n\n実戦の **${pSan}**（${clsL}）は${why}。\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) => `**${ml}** — ${cls}。\n\n**問題点:** ${why}。\n\n**代案:** ${plan}`,
    retryMsg: (ml) => `**${ml}** の直前に戻しました。盤上で最善手を見つけてください！`,
    bestHighlightMsg: (label, note, ev) => `最善手は **${label}** でした！ ${note} 評価値: **${ev}**。`,
    nextQuizMsg: (label) => `**${label}** の局面です。最善手を盤上で指してください！`,
    phases: { opening: '序盤', middlegame: '中盤', endgame: '終盤' },
    tipBlunders: (n) => `大悪手 ${n} 回：指す前に相手の王手と駒取りを確認しましょう。`,
    tipMissed: (n) => `勝ち逃し ${n} 回：優位なときは強制手から探しましょう。`,
    tipClean: (wp) => `大悪手ゼロの素晴らしい規律です！${wp}の精度をさらに磨きましょう。`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**フェーズ別正確度（全体 ${tot}%）:**\n• ${opN}: **${opA}%**\n• ${midN}: **${midA}%**\n• ${endN}: **${endA}%**\n\n**強み:** ${bestN}（${bestV}%）\n**改善点:** ${weakN}（${weakV}%）。${tip}`,
  },

  ko: {
    mateWhite: (n) => `백 ${n}수 메이트`,
    mateBlack: (n) => `흑 ${n}수 메이트`,
    whyExposeMate: (n) => `킹이 노출되어 ${n}수 만에 강제 체크메이트를 허용합니다`,
    whyMissedMate: (n) => `여기에 ${n}수 강제 체크메이트 기회가 있었습니다`,
    whyHangingEasy: (p, sq) => `${sq}의 ${p}이 방어 없이 놓여 있습니다`,
    whyHangingPro: (p, sq) => `${sq}의 ${p}이 무방비로 공격받습니다`,
    whyBestMate: (san) => `${san} 수로 즉시 체크메이트였습니다`,
    whyBestForkEasy: (san) => `${san} 수로 두 기물을 동시에 공격할 수 있었습니다`,
    whyBestForkPro: (san, t) => `${san} 수로 결정적인 양수걸이(${t})를 만들 수 있었습니다`,
    whyBestAttack: (san, p, sq) => `${san} 수로 ${sq}의 상대 ${p}을 공격했습니다`,
    whyBestCapture: (san, p) => `${san} 수로 상대 ${p}을 잡을 수 있었습니다`,
    whyBestCastle: (san) => `캐슬링(${san})으로 킹을 보호하고 룩을 활성화할 수 있었습니다`,
    whyInitiativeEasy: (pv) => `상대에게 ${pv} 응수로 주도권을 내줍니다`,
    whyInitiativePro: (pv) => `${pv} 수순으로 즉시 반격을 허용합니다`,
    whyCpLoss: (loss) => `최선 수 대비 ${loss}폰 평가 손실이 발생합니다`,
    andJoin: ' 또한 ',
    bestPlan: (san, line, ev) => `최선 수는 **${san}** (수순: ${line}), 평가 **${ev}**입니다.`,
    openGood: (op, acc) => `오프닝을 아주 잘 운영했습니다 (${op}, 정확도 ${acc}%).`,
    openWeak: (op, acc) => `오프닝(${op}, ${acc}%)에서 작은 부정확한 수가 있었습니다.`,
    winSolid: (opp, acc) => `${opp} 상대로 승리를 축하합니다! 정확도 ${acc}%의 탄탄한 대국입니다.`,
    winShaky: (opp, myAcc, oppAcc) => `${opp}에게 이겼지만(${myAcc}% vs ${oppAcc}%), 다듬을 핵심 장면이 있습니다.`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `${opp}전에서 정확도 ${acc}%(대실수 ${blunders}, 실수 ${mistakes})를 기록했습니다. 결정적 순간을 살펴봅시다.`,
    drawSummary: (opp, acc) => `${opp}와의 균형 잡힌 무승부(정확도 ${acc}%)입니다. 주요 국면을 확인하세요.`,
    errSevere: '치명적 대실수',
    errMissedWin: '승리 기회 놓침',
    errInaccuracy: '부정확한 수',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} **${ml}** (${ew}) 직전에 보드를 멈췄습니다.\n\n**이 국면의 최선 수는 무엇일까요?** 보드에서 직접 두어 보세요!`,
    cleanBeginner: '큰 실수 없이 기물을 잘 지켜냈습니다!',
    cleanPro: '큰 실수 없는 훌륭한 포지션 운영이었습니다.',
    cleanNoQuiz: (v, o, cn) => `${v}\n\n${o} ${cn} 원하는 수나 중요 국면을 클릭해 변화도를 확인하세요.`,
    chips: {
      showSolution: '정답 보기',
      whyWrong: '왜 잘못된 수인가요?',
      nextDecisive: '다음 중요 국면',
      analyzeWeaknesses: '약점 분석하기',
      bestMoveQuery: '내 최고의 수는 무엇이었나요?',
      phaseSummary: '단계별 요약 보기',
      nextMove: '다음 국면으로',
      showBestVar: '최선 수순 보기',
      whyOtherWrong: '원래 수가 왜 나빴나요?',
      strengthsWeaknesses: '강점과 약점',
      finalSummary: '최종 요약',
      retryPos: '이 위치 다시 풀기',
      showVarMove: (san) => `변화도 ${san} 보기`,
      explainThis: '이 수 설명하기',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `정확합니다! **${ml} ${aSan}**가 엔진의 최선 수입니다.\n\n실전의 ${pSan}는 ${why}. ${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `좋은 감각입니다! **${ml} ${aSan}**도 탄탄합니다(최선 대비 -${loss}).\n\n엔진 1순위는 **${bSan}**: ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `주의: **${ml} ${aSan}**로는 해결되지 않습니다(-${loss}폰).${
        ref ? ` 상대가 **${ref}**로 응징할 수 있습니다.` : ''
      }\n\n${plan}`,
    clsMap: {
      book: '이론 수',
      brilliant: '명수 (!!)',
      great: '호수 (!)',
      good: '좋은 수',
      inaccuracy: '부정확 (?!) ',
      mistake: '실수 (?)',
      blunder: '대실수 (??)',
      missed_win: '승리 놓침 (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) => `**${ml}** (${cls}): ${note} 평가: ${ev}.`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `정답은 **${mnc} ${bSan}**였습니다!\n\n실전 **${pSan}** (${clsL}): ${why}.\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) => `**${ml}** — ${cls}.\n\n**문제점:** ${why}.\n\n**대안:** ${plan}`,
    retryMsg: (ml) => `**${ml}** 직전으로 되돌렸습니다. 보드에서 최선 수를 찾아보세요!`,
    bestHighlightMsg: (label, note, ev) => `최고의 수는 **${label}**였습니다! ${note} 평가: **${ev}**.`,
    nextQuizMsg: (label) => `**${label}** 국면입니다. 보드에서 최선 수를 두어 보세요!`,
    phases: { opening: '오프닝', middlegame: '미들게임', endgame: '엔드게임' },
    tipBlunders: (n) => `대실수 ${n}회: 수를 두기 전 체크와 기물 잡기 가능성을 항상 확인하세요.`,
    tipMissed: (n) => `놓친 기회 ${n}회: 유리할 때는 강제 수부터 찾아보세요.`,
    tipClean: (wp) => `대실수 0회로 훌륭합니다! ${wp} 단계의 세밀함을 보강해 보세요.`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**단계별 정확도 (전체 ${tot}%):**\n• ${opN}: **${opA}%**\n• ${midN}: **${midA}%**\n• ${endN}: **${endA}%**\n\n**강점:** ${bestN} (${bestV}%).\n**보완점:** ${weakN} (${weakV}%). ${tip}`,
  },

  ar: {
    mateWhite: (n) => `كش مات في ${n} للأبيض`,
    mateBlack: (n) => `كش مات في ${n} للأسود`,
    whyExposeMate: (n) => `هذه النقلة تكشف الملك وتسمح بكش مات إجباري في ${n} نقلات`,
    whyMissedMate: (n) => `كان لديك كش مات إجباري في ${n} نقلات وضاع هنا`,
    whyHangingEasy: (p, sq) => `تترك ${p} في ${sq} بدون حماية`,
    whyHangingPro: (p, sq) => `تترك ${p} على ${sq} معرّضاً للأسر بدون دفاع`,
    whyBestMate: (san) => `النقلة ${san} كانت تعطي كش مات مباشرة`,
    whyBestForkEasy: (san) => `مع ${san} كان يمكنك مهاجمة قطعتين معاً`,
    whyBestForkPro: (san, t) => `${san} كانت تخلق شوكة حاسمة (${t})`,
    whyBestAttack: (san, p, sq) => `${san} كانت تهاجم ${p} الخصم في ${sq}`,
    whyBestCapture: (san, p) => `كان يمكنك أسر ${p} الخصم بالنقلة ${san}`,
    whyBestCastle: (san) => `التبييت (${san}) كان يؤمّن الملك ويفعّل الرخ`,
    whyInitiativeEasy: (pv) => `يسمح للخصم بالرد بـ ${pv} وأخذ المبادرة`,
    whyInitiativePro: (pv) => `يمنح الخصم لعباً مضاداً عبر ${pv}`,
    whyCpLoss: (loss) => `تفقد ${loss} بيادق في التقييم مقارنة بأفضل خط`,
    andJoin: ' و',
    bestPlan: (san, line, ev) => `أفضل خيار كان **${san}** (التفريع: ${line}) بتقييم ${ev}.`,
    openGood: (op, acc) => `أدرت الافتتاح بشكل ممتاز (${op}، دقة ${acc}%).`,
    openWeak: (op, acc) => `في الافتتاح (${op}، ${acc}%) ظهرت بعض الهفوات البسيطة.`,
    winSolid: (opp, acc) => `مبروك الفوز على ${opp}! مباراة متماسكة بدقة ${acc}%.`,
    winShaky: (opp, myAcc, oppAcc) => `فزت على ${opp} (${myAcc}% مقابل ${oppAcc}%) لكن هناك لحظات مهمة يمكن تحسينها.`,
    lossSummary: (opp, acc, blunders, mistakes) =>
      `أمام ${opp} كانت دقتك ${acc}% (${blunders} أخطاء فادحة، ${mistakes} أخطاء). لنراجع اللحظات الحاسمة.`,
    drawSummary: (opp, acc) => `تعادل متوازن أمام ${opp} (دقة ${acc}%). لنشاهد اللحظات الفاصلة.`,
    errSevere: 'خطأ فادح',
    errMissedWin: 'فرصة فوز ضائعة',
    errInaccuracy: 'عدم دقة',
    firstQuizPrompt: (v, o, ml, ew) =>
      `${v}\n\n${o} أوقفت الرقعة قبل نقلتك **${ml}** (${ew}).\n\n**ما هي أفضل نقلة هنا برأيك؟** حرّك القطعة مباشرة على الرقعة!`,
    cleanBeginner: 'حميت قطعك جيداً دون أخطاء فادحة!',
    cleanPro: 'مباراة بتحكم موضعي ممتاز وبلا أخطاء فادحة.',
    cleanNoQuiz: (v, o, cn) => `${v}\n\n${o} ${cn} انقر على أي نقلة لاستكشاف تفريعات المحرك.`,
    chips: {
      showSolution: 'أظهر الحل',
      whyWrong: 'لماذا كانت خاطئة؟',
      nextDecisive: 'اللحظة الحاسمة التالية',
      analyzeWeaknesses: 'حلّل نقاط ضعفي',
      bestMoveQuery: 'ما كانت أفضل نقلة لي؟',
      phaseSummary: 'ملخص المراحل',
      nextMove: 'الانتقال للحظة التالية',
      showBestVar: 'عرض أفضل تفريع',
      whyOtherWrong: 'لماذا كانت نقلة المباراة خاطئة؟',
      strengthsWeaknesses: 'نقاط القوة والضعف',
      finalSummary: 'الملخص النهائي',
      retryPos: 'أعد محاولة هذا الموقف',
      showVarMove: (san) => `عرض تفريع ${san}`,
      explainThis: 'اشرح هذه النقلة',
    },
    studentExactBest: (ml, aSan, pSan, why, plan) =>
      `إصابة رائعة! **${ml} ${aSan}** هي أفضل نقلة للمحرك تماماً.\n\nفي المباراة لعبت ${pSan} التي ${why}. ${plan}`,
    studentStrongAlt: (ml, aSan, loss, bSan, plan) =>
      `فكرة جميلة مع **${ml} ${aSan}**! استمرار متماسك (فارق -${loss}).\n\nالخيار الأول كان **${bSan}**: ${plan}`,
    studentWrong: (ml, aSan, loss, ref, plan) =>
      `انتبه: **${ml} ${aSan}** لا تحل المشكلة (-${loss} بيادق).${
        ref ? ` قد يعاقبها الخصم بـ **${ref}**.` : ''
      }\n\n${plan}`,
    clsMap: {
      book: 'نقلة نظرية',
      brilliant: 'نقلة بارعة (!!)',
      great: 'نقلة عظيمة (!)',
      good: 'نقلة جيدة',
      inaccuracy: 'عدم دقة (?!) ',
      mistake: 'خطأ (?)',
      blunder: 'خطأ فادح (??)',
      missed_win: 'فوز ضائع (✕)',
    },
    goodMoveExplain: (ml, cls, note, ev) => `**${ml}** (${cls}): ${note} التقييم: ${ev}.`,
    solutionExplain: (mnc, bSan, pSan, clsL, why, plan) =>
      `الحل كان **${mnc} ${bSan}**!\n\nفي المباراة كانت **${pSan}** (${clsL}) لأنها ${why}.\n\n${plan}`,
    mistakeExplain: (ml, cls, why, plan) => `**${ml}** — ${cls}.\n\n**السبب:** ${why}.\n\n**الأفضل:** ${plan}`,
    retryMsg: (ml) => `تمت إعادة الموقف قبل **${ml}**. جد أفضل نقلة على الرقعة!`,
    bestHighlightMsg: (label, note, ev) => `أفضل نقلة لك كانت **${label}**! ${note} التقييم: **${ev}**.`,
    nextQuizMsg: (label) => `ننتقل إلى **${label}**. ما هي أفضل نقلة هنا؟ جرّبها على الرقعة!`,
    phases: { opening: 'الافتتاح', middlegame: 'وسط اللعب', endgame: 'النهاية' },
    tipBlunders: (n) => `لديك ${n} أخطاء فادحة: تحقق دائماً من الكش والأسر المتاح للخصم قبل اللعب.`,
    tipMissed: (n) => `أضعت ${n} فرص فوز واضحة: ابحث أولاً عن النقلات القسرية عند التفوق.`,
    tipClean: (wp) => `انضباط تكتيكي ممتاز مع 0 أخطاء فادحة! طوّر تفاصيل ${wp}.`,
    phaseSummaryMsg: (tot, opN, opA, midN, midA, endN, endA, bestN, bestV, weakN, weakV, tip) =>
      `**تحليل المراحل (${tot}% إجمالاً):**\n• ${opN}: **${opA}%**\n• ${midN}: **${midA}%**\n• ${endN}: **${endA}%**\n\n**نقطة القوة:** ${bestN} (${bestV}%).\n**للتدريب:** ${weakN} (${weakV}%). ${tip}`,
  },
};

function getPack(lang?: string): { code: SupportedUiLang; pack: CoachLangPack; pieces: Record<PieceSymbol, string> } {
  const code = normalizeUiLang(lang);
  return {
    code,
    pack: PACKS[code] || PACKS.en,
    pieces: PIECE_NAMES_BY_LANG[code] || PIECE_NAMES_BY_LANG.en,
  };
}

function formatEvalText(cpWhite: number, mateIn?: number, lang?: string): string {
  const { pack } = getPack(lang);
  if (typeof mateIn === 'number' && mateIn !== 0) {
    return mateIn > 0 ? pack.mateWhite(mateIn) : pack.mateBlack(Math.abs(mateIn));
  }
  const pawns = cpWhite / 100;
  return pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
}

/**
 * Inspects a position after a move using chess.js to detect concrete tactical motifs.
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

function describeWhyMoveWasWrong(move: AnalyzedMove, elo: number, lang?: string): string {
  const { pack, pieces } = getPack(lang);
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
    reasons.push(pack.whyExposeMate(Math.abs(mateAfterMover)));
  } else if (mateBeforeMover !== undefined && mateBeforeMover > 0 && !mateAfterMover) {
    reasons.push(pack.whyMissedMate(mateBeforeMover));
  }

  if (playedMotifs.hangingFriendlyPieces.length > 0) {
    const h = playedMotifs.hangingFriendlyPieces[0];
    reasons.push(
      tier === 'beginner'
        ? pack.whyHangingEasy(pieces[h.piece], h.square)
        : pack.whyHangingPro(pieces[h.piece], h.square)
    );
  }

  if (bestMotifs.isCheckmate) {
    reasons.push(pack.whyBestMate(move.bestMoveSan));
  } else if (bestMotifs.attackedHighTargets.length >= 2) {
    reasons.push(
      tier === 'beginner'
        ? pack.whyBestForkEasy(move.bestMoveSan)
        : pack.whyBestForkPro(
            move.bestMoveSan,
            bestMotifs.attackedHighTargets.map((t) => `${pieces[t.piece]} ${t.square}`).join(', ')
          )
    );
  } else if (bestMotifs.attackedHighTargets.length === 1) {
    const t = bestMotifs.attackedHighTargets[0];
    reasons.push(pack.whyBestAttack(move.bestMoveSan, pieces[t.piece], t.square, t.undefended));
  } else if (bestMotifs.captured) {
    reasons.push(pack.whyBestCapture(move.bestMoveSan, pieces[bestMotifs.captured]));
  } else if (bestMotifs.isCastle) {
    reasons.push(pack.whyBestCastle(move.bestMoveSan));
  }

  if (reasons.length === 0) {
    if (move.playedPvSan.length > 0) {
      const pvShort = move.playedPvSan.slice(0, tier === 'beginner' ? 2 : 3).join(' ');
      reasons.push(
        tier === 'beginner' ? pack.whyInitiativeEasy(pvShort) : pack.whyInitiativePro(pvShort)
      );
    } else {
      reasons.push(pack.whyCpLoss((move.cpLoss / 100).toFixed(1)));
    }
  }

  return reasons.join(pack.andJoin);
}

function describeBestPlan(move: AnalyzedMove, lang?: string): string {
  const { pack } = getPack(lang);
  const bestLine = move.bestPvSan.length > 0 ? move.bestPvSan.slice(0, 4).join(' ') : move.bestMoveSan;
  return pack.bestPlan(
    move.bestMoveSan,
    bestLine,
    formatEvalText(move.evalBeforeWhiteCp, move.mateBefore, lang)
  );
}

export function generateOpeningDebrief(
  analysis: FullGameAnalysis,
  playerElo: number,
  lang?: string
): CoachNarrativeResponse {
  const { pack } = getPack(lang);
  const myStats = analysis.playerColor === 'w' ? analysis.whiteStats : analysis.blackStats;
  const oppStats = analysis.playerColor === 'w' ? analysis.blackStats : analysis.whiteStats;
  const oppName =
    analysis.playerColor === 'w' ? analysis.blackUsername : analysis.whiteUsername;
  const localizedOpening = translateOpeningName(analysis.openingName, lang);

  const myMistakesOrBlunders = analysis.decisiveMoments.filter(
    (m) =>
      m.color === analysis.playerColor &&
      (m.classification === 'blunder' ||
        m.classification === 'mistake' ||
        m.classification === 'missed_win')
  );
  const firstQuiz = myMistakesOrBlunders[0] || null;
  const firstMoment = firstQuiz || analysis.decisiveMoments[0] || analysis.moves[0];

  const openingComment =
    myStats.openingAcc >= 85
      ? pack.openGood(localizedOpening, myStats.openingAcc)
      : pack.openWeak(localizedOpening, myStats.openingAcc);

  let verdictLine = '';
  if (analysis.result === 'win') {
    verdictLine =
      myStats.blunder === 0 && myStats.mistake <= 1
        ? pack.winSolid(oppName, myStats.accuracyPct)
        : pack.winShaky(oppName, myStats.accuracyPct, oppStats.accuracyPct);
  } else if (analysis.result === 'loss') {
    verdictLine = pack.lossSummary(oppName, myStats.accuracyPct, myStats.blunder, myStats.mistake);
  } else {
    verdictLine = pack.drawSummary(oppName, myStats.accuracyPct);
  }

  if (firstQuiz) {
    const moveLabel = `${firstQuiz.moveNumber}${firstQuiz.color === 'w' ? '.' : '...'} ${firstQuiz.san}`;
    const errWord =
      firstQuiz.classification === 'blunder'
        ? pack.errSevere
        : firstQuiz.classification === 'missed_win'
          ? pack.errMissedWin
          : pack.errInaccuracy;

    return {
      message: pack.firstQuizPrompt(verdictLine, openingComment, moveLabel, errWord),
      focusPly: firstQuiz.ply,
      boardState: 'before_move',
      showBestArrow: false,
      quizTargetPly: firstQuiz.ply,
      suggestedReplies: [
        pack.chips.showSolution,
        pack.chips.whyWrong,
        pack.chips.nextDecisive,
      ],
    };
  }

  const tier = getTierTone(playerElo);
  const cleanNote = tier === 'beginner' ? pack.cleanBeginner : pack.cleanPro;

  return {
    message: pack.cleanNoQuiz(verdictLine, openingComment, cleanNote),
    focusPly: firstMoment ? firstMoment.ply : 0,
    boardState: 'after_move',
    showBestArrow: true,
    quizTargetPly: -1,
    suggestedReplies: [
      pack.chips.analyzeWeaknesses,
      pack.chips.bestMoveQuery,
      pack.chips.phaseSummary,
    ],
  };
}

export function generateStudentMoveFeedback(
  move: AnalyzedMove,
  attempt: StudentAttemptEvaluation,
  analysis: FullGameAnalysis,
  playerElo: number,
  lang?: string
): CoachNarrativeResponse {
  const { pack } = getPack(lang);
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
      ? [pack.chips.nextMove, pack.chips.showBestVar, pack.chips.whyOtherWrong]
      : [pack.chips.showBestVar, pack.chips.strengthsWeaknesses, pack.chips.finalSummary];

  if (attempt.verdict === 'exact_best') {
    return {
      message: pack.studentExactBest(
        moveLabel,
        attempt.san,
        move.san,
        describeWhyMoveWasWrong(move, playerElo, lang),
        describeBestPlan(move, lang)
      ),
      focusPly: move.ply,
      boardState: 'before_move',
      showBestArrow: true,
      quizTargetPly: -1,
      suggestedReplies: nextReplies,
    };
  }

  if (attempt.verdict === 'strong_alternative') {
    return {
      message: pack.studentStrongAlt(
        moveLabel,
        attempt.san,
        (attempt.cpLossVsBest / 100).toFixed(1),
        move.bestMoveSan,
        describeBestPlan(move, lang)
      ),
      focusPly: move.ply,
      boardState: 'before_move',
      showBestArrow: true,
      quizTargetPly: -1,
      suggestedReplies: nextReplies,
    };
  }

  const refSan =
    attempt.refutationLineSan.length > 0 ? attempt.refutationLineSan.slice(0, 3).join(' ') : '';
  const lossStr = (attempt.cpLossVsBest / 100).toFixed(1);

  return {
    message: pack.studentWrong(
      moveLabel,
      attempt.san,
      lossStr,
      refSan,
      describeBestPlan(move, lang)
    ),
    focusPly: move.ply,
    boardState: 'before_move',
    showBestArrow: true,
    quizTargetPly: -1,
    suggestedReplies: [pack.chips.retryPos, ...nextReplies.slice(0, 2)],
  };
}

export function generateMoveExplanation(
  move: AnalyzedMove,
  playerElo: number,
  analysis: FullGameAnalysis,
  mode: 'explain' | 'solution' = 'explain',
  lang?: string
): CoachNarrativeResponse {
  const { pack } = getPack(lang);
  const moveLabel = `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san}`;
  const moveNumColor = `${move.moveNumber}${move.color === 'w' ? '.' : '...'}`;
  const clsMap = pack.clsMap;

  let body = '';
  if (
    move.classification === 'brilliant' ||
    move.classification === 'great' ||
    move.classification === 'good' ||
    move.classification === 'book'
  ) {
    body = pack.goodMoveExplain(
      moveLabel,
      clsMap[move.classification],
      move.tacticalNote,
      formatEvalText(move.evalAfterWhiteCp, move.mateAfter, lang)
    );
  } else if (mode === 'solution') {
    body = pack.solutionExplain(
      moveNumColor,
      move.bestMoveSan,
      move.san,
      clsMap[move.classification].toLowerCase(),
      describeWhyMoveWasWrong(move, playerElo, lang),
      describeBestPlan(move, lang)
    );
  } else {
    body = pack.mistakeExplain(
      moveLabel,
      clsMap[move.classification],
      describeWhyMoveWasWrong(move, playerElo, lang),
      describeBestPlan(move, lang)
    );
  }

  const nextMoment = analysis.decisiveMoments.find((m) => m.ply > move.ply);
  const replies = [
    ...(move.bestPvSan.length > 0 ? [pack.chips.showVarMove(move.bestMoveSan)] : []),
    ...(nextMoment ? [pack.chips.nextDecisive] : []),
    pack.chips.strengthsWeaknesses,
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
  lang?: string;
}): CoachNarrativeResponse {
  const { question, analysis, focusedPly, quizTargetPly, playerElo, lang } = params;
  const { pack } = getPack(lang);
  const q = question.toLowerCase();
  const curMove =
    analysis.moves[Math.max(0, Math.min(analysis.moves.length - 1, focusedPly))] ||
    analysis.moves[0];

  // 1. Retry current quiz position
  if (
    q.includes('riprovar') ||
    q.includes('retry') ||
    q.includes('reintentar') ||
    q.includes('réessayer') ||
    q.includes('erneut') ||
    q.includes('tentar') ||
    q.includes('снова') ||
    q.includes('再试') ||
    q.includes('やり直') ||
    q.includes('다시') ||
    q.includes('أعد') ||
    q.includes('quiz') ||
    q.includes('indovinar')
  ) {
    const ml = `${curMove.moveNumber}${curMove.color === 'w' ? '.' : '...'} ${curMove.san}`;
    return {
      message: pack.retryMsg(ml),
      focusPly: curMove.ply,
      boardState: 'before_move',
      showBestArrow: false,
      quizTargetPly: curMove.ply,
      suggestedReplies: [pack.chips.showSolution, pack.chips.whyWrong],
    };
  }

  // 2. Game-wide best move query
  if (
    q.includes('è stata la mia') ||
    q.includes('mia mossa migliore') ||
    q.includes('was my best') ||
    q.includes('fue mi mejor') ||
    q.includes('mon meilleur coup') ||
    q.includes('mein bester zug') ||
    q.includes('meu melhor lance') ||
    q.includes('лучшим в партии') ||
    q.includes('最好的一步') ||
    q.includes('一番良かった') ||
    q.includes('최고의 수') ||
    q.includes('أفضل نقلة لي') ||
    q.includes('brillante')
  ) {
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
        message: pack.bestHighlightMsg(
          label,
          highlight.tacticalNote,
          formatEvalText(highlight.evalAfterWhiteCp, highlight.mateAfter, lang)
        ),
        focusPly: highlight.ply,
        boardState: 'after_move',
        showBestArrow: false,
        quizTargetPly: -1,
        suggestedReplies: [pack.chips.analyzeWeaknesses, pack.chips.nextDecisive],
      };
    }
  }

  // 3. Show solution to active quiz or current move
  if (
    q.includes('soluzion') ||
    q.includes('solution') ||
    q.includes('solución') ||
    q.includes('solução') ||
    q.includes('lösung') ||
    q.includes('решени') ||
    q.includes('正解') ||
    q.includes('정답') ||
    q.includes('الحل') ||
    q.includes('quale era') ||
    q.includes('qual era') ||
    q.includes('mostrami') ||
    q.includes('show me') ||
    q.includes('mossa migliore')
  ) {
    const targetPly = quizTargetPly >= 0 ? quizTargetPly : curMove.ply;
    const targetMove = analysis.moves[targetPly] || curMove;
    return generateMoveExplanation(targetMove, playerElo, analysis, 'solution', lang);
  }

  // 4. Next decisive moment
  if (
    q.includes('prossim') ||
    q.includes('next') ||
    q.includes('siguiente') ||
    q.includes('suivant') ||
    q.includes('nächst') ||
    q.includes('próximo') ||
    q.includes('следующ') ||
    q.includes('下一') ||
    q.includes('次の') ||
    q.includes('다음') ||
    q.includes('التال') ||
    q.includes('avanti') ||
    q.includes('altro momento') ||
    q.includes('altro errore')
  ) {
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
      const lbl = `${nextDecisive.moveNumber}${nextDecisive.color === 'w' ? '.' : '...'} ${nextDecisive.san}`;
      return {
        message: pack.nextQuizMsg(lbl),
        focusPly: nextDecisive.ply,
        boardState: 'before_move',
        showBestArrow: false,
        quizTargetPly: nextDecisive.ply,
        suggestedReplies: [pack.chips.showSolution, pack.chips.whyWrong],
      };
    }

    return generateMoveExplanation(nextDecisive, playerElo, analysis, 'explain', lang);
  }

  // 5. Strengths, weaknesses & phase summary
  if (
    q.includes('punt') ||
    q.includes('debol') ||
    q.includes('forza') ||
    q.includes('riepilog') ||
    q.includes('fase') ||
    q.includes('weak') ||
    q.includes('strength') ||
    q.includes('phase') ||
    q.includes('summary') ||
    q.includes('breakdown') ||
    q.includes('débil') ||
    q.includes('fuerte') ||
    q.includes('resumen') ||
    q.includes('faibl') ||
    q.includes('fort') ||
    q.includes('résumé') ||
    q.includes('schwä') ||
    q.includes('stärk') ||
    q.includes('zusammenfass') ||
    q.includes('fraco') ||
    q.includes('слаб') ||
    q.includes('сильн') ||
    q.includes('итог') ||
    q.includes('弱点') ||
    q.includes('阶段') ||
    q.includes('总结') ||
    q.includes('弱み') ||
    q.includes('強み') ||
    q.includes('要約') ||
    q.includes('약점') ||
    q.includes('강점') ||
    q.includes('요약') ||
    q.includes('ضعف') ||
    q.includes('القوة') ||
    q.includes('ملخص')
  ) {
    const myStats = analysis.playerColor === 'w' ? analysis.whiteStats : analysis.blackStats;
    const phases = [
      { name: pack.phases.opening, val: myStats.openingAcc },
      { name: pack.phases.middlegame, val: myStats.middlegameAcc },
      { name: pack.phases.endgame, val: myStats.endgameAcc },
    ].sort((a, b) => b.val - a.val);

    const bestPhase = phases[0];
    const weakPhase = phases[phases.length - 1];
    const focusTip =
      myStats.blunder > 0
        ? pack.tipBlunders(myStats.blunder)
        : myStats.missedWin > 0
          ? pack.tipMissed(myStats.missedWin)
          : pack.tipClean(weakPhase.name);

    return {
      message: pack.phaseSummaryMsg(
        myStats.accuracyPct,
        pack.phases.opening,
        myStats.openingAcc,
        pack.phases.middlegame,
        myStats.middlegameAcc,
        pack.phases.endgame,
        myStats.endgameAcc,
        bestPhase.name,
        bestPhase.val,
        weakPhase.name,
        weakPhase.val,
        focusTip
      ),
      focusPly: curMove.ply,
      boardState: 'after_move',
      showBestArrow: true,
      quizTargetPly: -1,
      suggestedReplies: [pack.chips.nextDecisive, pack.chips.explainThis],
    };
  }

  // 6. Default: explain currently inspected move
  return generateMoveExplanation(curMove, playerElo, analysis, 'explain', lang);
}
