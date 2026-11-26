'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  BookOpen,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FileUp,
  GraduationCap,
  HelpCircle,
  Loader2,
  MessageSquare,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
} from 'lucide-react';
import type { GameMove, GameState, MoveQuality, PieceColor, SavedGameReview } from '@/lib/types';
import {
  analysisToSavedReview,
  analyzeFullGameWithEngine,
  evaluateStudentMoveOnPosition,
  gameStateToParsedInput,
  getMoveVariationOnDemand,
  parsePgnForAnalysis,
  type AnalyzedMove,
  type CoachMoveClass,
  type FullGameAnalysis,
  type ParsedGameInput,
  type StudentAttemptEvaluation,
} from '@/lib/game-analyzer';
import {
  generateOpeningDebrief,
  generateStudentMoveFeedback,
  handleDeterministicCoachQuestion,
  type CoachNarrativeResponse,
} from '@/lib/coach-engine';
import { soundFX } from '@/lib/sound';
import { ChessBoard, type BoardArrow } from './ChessBoard';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const SAMPLE_PGN = `[Event "Partita Italiana - Esempio Didattico"]
[White "Giocatore"]
[Black "Avversario"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Nxc3 9. bxc3 Bxc3 10. Qb3 Bxa1 11. Bxf7+ Kf8 12. Bg5 Ne7 13. Ne5 d5 14. Qf3 Bf5 15. Bxe7+ Qxe7 16. Qxf5 Qf6 17. Nd7+ Kxf7 18. Nxf6 gxf6 19. Qxd5+ Kg6 20. Rxa1 c6 0-1`;

interface CoachChatEntry {
  id: string;
  role: 'coach' | 'student';
  text: string;
  suggestedReplies?: string[];
  focusPly?: number;
}

interface VariationPreviewState {
  basePly: number;
  label: string;
  sans: string[];
  fens: string[];
  movesMeta: Array<{ from: string; to: string }>;
  stepIndex: number; // 0 = base position, 1..N = after move stepIndex-1
}

export interface CoachReviewStudioProps {
  myUsername: string;
  myElo: number;
  lang: string;
  initialGame?: GameState | null;
  initialPgn?: { pgn: string; playerColor: PieceColor; id?: string } | null;
  savedReviews: SavedGameReview[];
  onSaveReview: (review: SavedGameReview) => void;
  onBackToLobby: () => void;
  onBackToGame?: () => void;
  onRequestOpenStats: () => void;
}

function formatEvalStr(cpWhite: number, mateIn?: number): string {
  if (typeof mateIn === 'number' && mateIn !== 0) {
    return mateIn > 0 ? `M${mateIn}` : `-M${Math.abs(mateIn)}`;
  }
  const pawns = cpWhite / 100;
  return pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
}

function evalToWhiteBarPct(cpWhite: number, mateIn?: number): number {
  if (typeof mateIn === 'number' && mateIn !== 0) {
    return mateIn > 0 ? 96 : 4;
  }
  const clamped = Math.max(-900, Math.min(900, cpWhite));
  const sigmoid = 1 / (1 + Math.exp(-clamped / 240));
  return Math.max(5, Math.min(95, Math.round(sigmoid * 100)));
}

function mapClassToBoardQuality(cls: CoachMoveClass): MoveQuality {
  if (cls === 'inaccuracy') return 'neutral';
  if (cls === 'missed_win') return 'mistake';
  return cls;
}

const CLASS_META: Record<
  CoachMoveClass,
  { symbol: string; label: string; colorClass: string; badgeBg: string }
> = {
  book: {
    symbol: 'B',
    label: 'Teoria',
    colorClass: 'text-[#D2B088]',
    badgeBg: 'bg-[#A88865]',
  },
  brilliant: {
    symbol: '!!',
    label: 'Brillante',
    colorClass: 'text-[#26D0C9]',
    badgeBg: 'bg-[#1BACA6]',
  },
  great: {
    symbol: '!',
    label: 'Ottima',
    colorClass: 'text-[#7AB3E0]',
    badgeBg: 'bg-[#5C8BB0]',
  },
  good: {
    symbol: '✓',
    label: 'Buona',
    colorClass: 'text-[#9ED16A]',
    badgeBg: 'bg-[#81B64C]',
  },
  inaccuracy: {
    symbol: '?!',
    label: 'Imprecisione',
    colorClass: 'text-[#E7C666]',
    badgeBg: 'bg-[#B69330]',
  },
  mistake: {
    symbol: '?',
    label: 'Errore',
    colorClass: 'text-[#F5A84B]',
    badgeBg: 'bg-[#E6912C]',
  },
  blunder: {
    symbol: '??',
    label: 'Blunder',
    colorClass: 'text-[#F16562]',
    badgeBg: 'bg-[#CA3431]',
  },
  missed_win: {
    symbol: '✕',
    label: 'Vittoria mancata',
    colorClass: 'text-[#F59E0B]',
    badgeBg: 'bg-[#D97706]',
  },
};

function renderFormattedCoachText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-extrabold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function playSoundForSan(san: string, captured?: string) {
  if (san.includes('#')) {
    soundFX.playGameOver(true);
  } else if (san.includes('+')) {
    soundFX.playCheck(Boolean(captured));
  } else if (san === 'O-O' || san === 'O-O-O') {
    soundFX.playCastle();
  } else if (san.includes('=')) {
    soundFX.playPromote();
  } else if (captured) {
    soundFX.playCapture();
  } else {
    soundFX.playMove();
  }
}

export function CoachReviewStudio({
  myUsername,
  myElo,
  lang,
  initialGame,
  initialPgn,
  savedReviews,
  onSaveReview,
  onBackToLobby,
  onBackToGame,
  onRequestOpenStats,
}: CoachReviewStudioProps) {
  const [pgnDraft, setPgnDraft] = useState('');
  const [pgnColor, setPgnColor] = useState<PieceColor>('w');
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [showImportPanel, setShowImportPanel] = useState<boolean>(
    !initialGame && !initialPgn
  );

  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [analysis, setAnalysis] = useState<FullGameAnalysis | null>(null);

  const [focusedPly, setFocusedPly] = useState<number>(0);
  const [boardState, setBoardState] = useState<'before_move' | 'after_move'>('after_move');
  const [showBestArrow, setShowBestArrow] = useState<boolean>(true);
  const [quizTargetPly, setQuizTargetPly] = useState<number>(-1);
  const [lastStudentAttempt, setLastStudentAttempt] = useState<StudentAttemptEvaluation | null>(null);
  const [flipped, setFlipped] = useState(false);

  const [variation, setVariation] = useState<VariationPreviewState | null>(null);
  const [rightTab, setRightTab] = useState<'coach' | 'moves' | 'summary'>('coach');

  const [chatEntries, setChatEntries] = useState<CoachChatEntry[]>([]);
  const [chatInput, setChatInput] = useState('');

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const activeRunIdRef = useRef<number>(0);
  const autoLaunchedKeyRef = useRef<string>('');
  const onSaveReviewRef = useRef(onSaveReview);

  useEffect(() => {
    onSaveReviewRef.current = onSaveReview;
  }, [onSaveReview]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatEntries]);

  const applyCoachResponse = useCallback(
    (
      targetAnalysis: FullGameAnalysis,
      data: CoachNarrativeResponse,
      options?: { preserveAttempt?: boolean }
    ) => {
      const nextEntry: CoachChatEntry = {
        id: `coach_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        role: 'coach',
        text: data.message,
        suggestedReplies: data.suggestedReplies,
        focusPly: data.focusPly >= 0 ? data.focusPly : undefined,
      };
      setChatEntries((prev) => [...prev, nextEntry]);

      if (
        typeof data.focusPly === 'number' &&
        data.focusPly >= 0 &&
        data.focusPly < targetAnalysis.moves.length
      ) {
        setVariation(null);
        if (!options?.preserveAttempt) {
          setLastStudentAttempt(null);
        }
        setFocusedPly(data.focusPly);
        setBoardState(data.boardState === 'before_move' ? 'before_move' : 'after_move');
      }
      setShowBestArrow(Boolean(data.showBestArrow));
      if (
        typeof data.quizTargetPly === 'number' &&
        data.quizTargetPly >= 0 &&
        data.quizTargetPly < targetAnalysis.moves.length
      ) {
        setQuizTargetPly(data.quizTargetPly);
        setBoardState('before_move');
        setShowBestArrow(false);
      } else {
        setQuizTargetPly(-1);
      }
    },
    []
  );

  const runAnalysisPipeline = useCallback(
    async (parsed: ParsedGameInput) => {
      const runId = ++activeRunIdRef.current;
      setShowImportPanel(false);
      setAnalyzing(true);
      setProgress({ done: 0, total: parsed.rawMoves.length });
      setAnalysis(null);
      setChatEntries([]);
      setVariation(null);
      setLastStudentAttempt(null);
      setQuizTargetPly(-1);
      setRightTab('coach');

      try {
        const result = await analyzeFullGameWithEngine(parsed, (done, total) => {
          if (activeRunIdRef.current !== runId) return;
          setProgress({ done, total });
        });
        if (activeRunIdRef.current !== runId) return;

        setAnalysis(result);
        setAnalyzing(false);

        onSaveReviewRef.current(analysisToSavedReview(result));

        const debrief = generateOpeningDebrief(result, myElo);
        applyCoachResponse(result, debrief);
      } catch (err: unknown) {
        if (activeRunIdRef.current !== runId) return;
        setAnalyzing(false);
        setPgnError(err instanceof Error ? err.message : 'Errore durante analisi partita.');
        setShowImportPanel(true);
      }
    },
    [applyCoachResponse, myElo]
  );

  useEffect(() => {
    if (initialGame && initialGame.moves.length > 0) {
      const key = `game:${initialGame.id}:${initialGame.moves.length}`;
      if (autoLaunchedKeyRef.current === key) return;
      try {
        const parsed = gameStateToParsedInput(initialGame, myUsername);
        const timer = setTimeout(() => {
          if (autoLaunchedKeyRef.current === key) return;
          autoLaunchedKeyRef.current = key;
          void runAnalysisPipeline(parsed);
        }, 0);
        return () => clearTimeout(timer);
      } catch (err) {
        console.error('[BioChess][Coach] Failed preparing game for analysis:', err);
        setPgnError(err instanceof Error ? err.message : 'Errore durante la lettura della partita.');
        setShowImportPanel(true);
        return;
      }
    }

    if (initialPgn && initialPgn.pgn.trim()) {
      const key = `pgn:${initialPgn.id || initialPgn.pgn.slice(0, 48)}:${initialPgn.playerColor}`;
      if (autoLaunchedKeyRef.current === key) return;
      let res: ReturnType<typeof parsePgnForAnalysis>;
      try {
        res = parsePgnForAnalysis(initialPgn.pgn, initialPgn.playerColor, myUsername);
      } catch (err) {
        console.error('[BioChess][Coach] Failed parsing PGN in CoachReviewStudio:', err);
        res = {
          ok: false,
          error: 'PGN non valido o illeggibile. Impossibile avviare la revisione.',
        };
      }
      const timer = setTimeout(() => {
        if (autoLaunchedKeyRef.current === key) return;
        autoLaunchedKeyRef.current = key;
        if (res.ok) {
          void runAnalysisPipeline(res.parsed);
        } else {
          setPgnError(res.error);
          setShowImportPanel(true);
        }
      }, 0);
      return () => clearTimeout(timer);
    }

    if (initialGame && initialGame.moves.length === 0) {
      const timer = setTimeout(() => {
        setShowImportPanel(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialGame, initialPgn, myUsername, runAnalysisPipeline]);

  function handleAnalyzePgnSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setPgnError(null);
    const res = parsePgnForAnalysis(pgnDraft, pgnColor, myUsername);
    if (!res.ok) {
      setPgnError(res.error);
      return;
    }
    void runAnalysisPipeline(res.parsed);
  }

  function handleUploadPgnFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPgnDraft(reader.result);
        setPgnError(null);
      }
    };
    reader.readAsText(file);
  }

  function handleReopenSavedReview(rev: SavedGameReview) {
    setPgnError(null);
    const res = parsePgnForAnalysis(rev.pgn, rev.playerColor, myUsername);
    if (!res.ok) {
      setPgnError(res.error);
      return;
    }
    res.parsed.id = rev.id;
    void runAnalysisPipeline(res.parsed);
  }

  const focusedMove: AnalyzedMove | null = useMemo(() => {
    if (!analysis || focusedPly < 0 || focusedPly >= analysis.moves.length) return null;
    return analysis.moves[focusedPly];
  }, [analysis, focusedPly]);

  const gameMovesForBoard: GameMove[] | undefined = useMemo(() => {
    if (!analysis || variation || lastStudentAttempt) return undefined;
    return analysis.moves.map((m) => ({
      san: m.san,
      from: m.from,
      to: m.to,
      fen: m.fenAfter,
      color: m.color,
      captured: m.captured,
      promotion: m.promotion,
      quality: mapClassToBoardQuality(m.classification),
      cpLoss: m.cpLoss,
      timestamp: analysis.analyzedAtMs,
    }));
  }, [analysis, variation, lastStudentAttempt]);

  const boardView = useMemo(() => {
    if (variation) {
      const fen = variation.fens[variation.stepIndex] || variation.fens[0];
      const meta =
        variation.stepIndex > 0 ? variation.movesMeta[variation.stepIndex - 1] : null;
      return {
        fen,
        activeMoveCount: undefined as number | undefined,
        lastMove: meta ? { from: meta.from, to: meta.to } : null,
        arrows: [] as BoardArrow[],
      };
    }

    if (lastStudentAttempt && focusedMove) {
      let attemptFen = focusedMove.fenBefore;
      try {
        const ch = new Chess(focusedMove.fenBefore);
        ch.move({
          from: lastStudentAttempt.from,
          to: lastStudentAttempt.to,
          promotion: 'q',
        });
        attemptFen = ch.fen();
      } catch {
        // fallback handled below
      }
      const arrows: BoardArrow[] = [];
      if (showBestArrow && focusedMove.bestMoveFrom !== lastStudentAttempt.from) {
        arrows.push({
          from: focusedMove.bestMoveFrom,
          to: focusedMove.bestMoveTo,
          color: 'green',
        });
      } else if (showBestArrow && focusedMove.bestMoveTo !== lastStudentAttempt.to) {
        arrows.push({
          from: focusedMove.bestMoveFrom,
          to: focusedMove.bestMoveTo,
          color: 'green',
        });
      }
      if (!lastStudentAttempt.isBest && lastStudentAttempt.verdict !== 'strong_alternative') {
        arrows.push({
          from: lastStudentAttempt.from,
          to: lastStudentAttempt.to,
          color: 'red',
        });
      }
      return {
        fen: attemptFen,
        activeMoveCount: undefined,
        lastMove: {
          from: lastStudentAttempt.from,
          to: lastStudentAttempt.to,
          quality:
            lastStudentAttempt.verdict === 'exact_best'
              ? ('great' as MoveQuality)
              : lastStudentAttempt.verdict === 'strong_alternative'
                ? ('good' as MoveQuality)
                : lastStudentAttempt.verdict === 'blunder'
                  ? ('blunder' as MoveQuality)
                  : ('mistake' as MoveQuality),
        },
        arrows,
      };
    }

    if (!analysis || !focusedMove) {
      return {
        fen: START_FEN,
        activeMoveCount: 0,
        lastMove: null,
        arrows: [] as BoardArrow[],
      };
    }

    const isQuizHere = quizTargetPly === focusedMove.ply;
    const effectiveState = isQuizHere ? 'before_move' : boardState;

    if (effectiveState === 'before_move') {
      const prevMove = focusedMove.ply > 0 ? analysis.moves[focusedMove.ply - 1] : null;
      const arrows: BoardArrow[] = [];
      if (!isQuizHere && showBestArrow) {
        arrows.push({
          from: focusedMove.bestMoveFrom,
          to: focusedMove.bestMoveTo,
          color: 'green',
        });
        if (
          focusedMove.bestMoveSan !== focusedMove.san &&
          (focusedMove.classification === 'mistake' ||
            focusedMove.classification === 'blunder' ||
            focusedMove.classification === 'missed_win')
        ) {
          arrows.push({
            from: focusedMove.from,
            to: focusedMove.to,
            color: 'red',
          });
        }
      }
      return {
        fen: focusedMove.fenBefore,
        activeMoveCount: focusedMove.ply,
        lastMove: prevMove ? { from: prevMove.from, to: prevMove.to } : null,
        arrows,
      };
    }

    const arrows: BoardArrow[] = [];
    if (
      showBestArrow &&
      focusedMove.bestMoveSan !== focusedMove.san &&
      (focusedMove.classification === 'mistake' ||
        focusedMove.classification === 'blunder' ||
        focusedMove.classification === 'missed_win')
    ) {
      arrows.push({
        from: focusedMove.bestMoveFrom,
        to: focusedMove.bestMoveTo,
        color: 'green',
      });
    }

    return {
      fen: focusedMove.fenAfter,
      activeMoveCount: focusedMove.ply + 1,
      lastMove: {
        from: focusedMove.from,
        to: focusedMove.to,
        quality: mapClassToBoardQuality(focusedMove.classification),
      },
      arrows,
    };
  }, [analysis, focusedMove, boardState, showBestArrow, quizTargetPly, variation, lastStudentAttempt]);

  const evalSnapshot = useMemo(() => {
    if (!focusedMove) return { label: '0.0', whitePct: 50 };
    if (lastStudentAttempt) {
      return {
        label: formatEvalStr(lastStudentAttempt.evalWhiteCp, lastStudentAttempt.mateIn),
        whitePct: evalToWhiteBarPct(lastStudentAttempt.evalWhiteCp, lastStudentAttempt.mateIn),
      };
    }
    const isBefore = boardState === 'before_move' || quizTargetPly === focusedMove.ply;
    const cp = isBefore ? focusedMove.evalBeforeWhiteCp : focusedMove.evalAfterWhiteCp;
    const mate = isBefore ? focusedMove.mateBefore : focusedMove.mateAfter;
    return {
      label: formatEvalStr(cp, mate),
      whitePct: evalToWhiteBarPct(cp, mate),
    };
  }, [focusedMove, boardState, quizTargetPly, lastStudentAttempt]);

  const isQuizActive = Boolean(
    analysis &&
      focusedMove &&
      quizTargetPly === focusedMove.ply &&
      !variation
  );

  function jumpToPly(ply: number, mode: 'before_move' | 'after_move' = 'after_move') {
    if (!analysis || analysis.moves.length === 0) return;
    const clamped = Math.max(0, Math.min(analysis.moves.length - 1, ply));
    setVariation(null);
    setLastStudentAttempt(null);
    setQuizTargetPly(-1);
    setFocusedPly(clamped);
    setBoardState(mode);
    setShowBestArrow(true);
    const m = analysis.moves[clamped];
    if (m && mode === 'after_move') {
      playSoundForSan(m.san, m.captured);
    }
  }

  function startBestVariationPreview(move: AnalyzedMove) {
    let ch: Chess;
    try {
      ch = new Chess(move.fenBefore);
    } catch {
      return;
    }
    const fens: string[] = [move.fenBefore];
    const sans: string[] = [];
    const movesMeta: Array<{ from: string; to: string }> = [];

    const computed = getMoveVariationOnDemand(move);
    const line = computed.length > 0 ? computed : [move.bestMoveSan];
    for (const san of line.slice(0, 6)) {
      try {
        const res = ch.move(san);
        if (!res) break;
        sans.push(res.san);
        fens.push(ch.fen());
        movesMeta.push({ from: res.from, to: res.to });
      } catch {
        break;
      }
    }

    if (sans.length === 0) return;
    setQuizTargetPly(-1);
    setLastStudentAttempt(null);
    setVariation({
      basePly: move.ply,
      label: `Variante migliore da ${move.moveNumber}${move.color === 'w' ? '.' : '...'}`,
      sans,
      fens,
      movesMeta,
      stepIndex: 1,
    });
    playSoundForSan(sans[0]);
  }

  function stepVariation(delta: number) {
    if (!variation) return;
    const next = Math.max(0, Math.min(variation.sans.length, variation.stepIndex + delta));
    setVariation({ ...variation, stepIndex: next });
    if (next > 0 && delta > 0) {
      playSoundForSan(variation.sans[next - 1]);
    }
  }

  function handleStudentQuizMove(
    from: string,
    to: string,
    promotion?: 'q' | 'r' | 'b' | 'n'
  ) {
    if (!analysis || !focusedMove || !isQuizActive) return;
    const evaluation = evaluateStudentMoveOnPosition(
      focusedMove.fenBefore,
      from,
      to,
      promotion,
      focusedMove.bestMoveSan,
      focusedMove.evalBeforeWhiteCp
    );
    if (!evaluation) return;

    playSoundForSan(evaluation.san);
    setLastStudentAttempt(evaluation);

    const userMsg: CoachChatEntry = {
      id: `student_${Date.now()}`,
      role: 'student',
      text: `Provo ${focusedMove.moveNumber}${focusedMove.color === 'w' ? '.' : '...'} ${evaluation.san}`,
    };
    setChatEntries((prev) => [...prev, userMsg]);

    const feedback = generateStudentMoveFeedback(focusedMove, evaluation, analysis, myElo);
    applyCoachResponse(analysis, feedback, { preserveAttempt: true });
  }

  function handleSendChat(rawText: string) {
    if (!analysis) return;
    const clean = rawText.trim();
    if (!clean) return;
    setChatInput('');

    const studentEntry: CoachChatEntry = {
      id: `student_${Date.now()}`,
      role: 'student',
      text: clean,
    };
    setChatEntries((prev) => [...prev, studentEntry]);

    const lower = clean.toLowerCase();
    if (lower.startsWith('mostra variante') && focusedMove) {
      startBestVariationPreview(focusedMove);
      const line = getMoveVariationOnDemand(focusedMove);
      const pvText = line.length > 0 ? line.join(' ') : focusedMove.bestMoveSan;
      setChatEntries((prev) => [
        ...prev,
        {
          id: `coach_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          role: 'coach',
          text: `Ecco sulla scacchiera la variante migliore da ${focusedMove.moveNumber}${focusedMove.color === 'w' ? '.' : '...'}: **${pvText}**. Usa le frecce sotto la scacchiera per scorrerla mossa per mossa.`,
          suggestedReplies: ['Prossimo momento decisivo', 'Punti di forza e debolezza'],
          focusPly: focusedMove.ply,
        },
      ]);
      return;
    }

    const reply = handleDeterministicCoachQuestion({
      question: clean,
      analysis,
      focusedPly,
      quizTargetPly,
      playerElo: myElo,
    });
    applyCoachResponse(analysis, reply);
  }

  function handleAskCoachAboutFocusedMove() {
    if (!analysis || !focusedMove) return;
    setRightTab('coach');
    handleSendChat(
      `Spiegami la mossa ${focusedMove.moveNumber}${focusedMove.color === 'w' ? '.' : '...'} ${focusedMove.san}`
    );
  }

  const movePairs = useMemo(() => {
    if (!analysis) return [];
    const pairs: Array<{ moveNumber: number; white?: AnalyzedMove; black?: AnalyzedMove }> = [];
    for (let i = 0; i < analysis.moves.length; i += 2) {
      pairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: analysis.moves[i],
        black: analysis.moves[i + 1],
      });
    }
    return pairs;
  }, [analysis]);

  const orientation: PieceColor = analysis
    ? flipped
      ? analysis.playerColor === 'w'
        ? 'b'
        : 'w'
      : analysis.playerColor
    : flipped
      ? 'b'
      : 'w';

  const topColor: PieceColor = orientation === 'w' ? 'b' : 'w';
  const bottomColor: PieceColor = orientation;

  // Render Import / PGN Launcher View
  if (showImportPanel && !analyzing) {
    return (
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={analysis ? () => setShowImportPanel(false) : onBackToLobby}
              className="px-3 py-1.5 rounded bg-[#262421] hover:bg-[#3C3A36] border border-[#3C3A36] text-xs font-bold text-[#DAD9D7] inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{analysis ? 'Torna alla Revisione' : 'Lobby'}</span>
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#81B64C]" />
                <span>Game Review Coach</span>
              </h1>
              <p className="text-xs text-[#9E9D9A]">
                Analisi completa mossa per mossa con motore scacchistico e spiegazione interattiva in stile Chess.com.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRequestOpenStats}
            className="px-3.5 py-2 rounded bg-[#262421] hover:bg-[#3C3A36] border border-[#3C3A36] text-xs font-bold text-[#DAD9D7] inline-flex items-center gap-1.5"
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#81B64C]" />
            <span>Statistiche Personali</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: PGN Import Form */}
          <form
            onSubmit={handleAnalyzePgnSubmit}
            className="lg:col-span-7 bg-[#262421] border border-[#3C3A36] rounded-md p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-white">Importa una partita tramite PGN</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPgnDraft(SAMPLE_PGN);
                    setPgnColor('w');
                    setPgnError(null);
                  }}
                  className="px-2.5 py-1 rounded bg-[#302E2B] hover:bg-[#3C3A36] text-[11px] font-bold text-[#DAD9D7] inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-[#81B64C]" />
                  <span>Carica esempio</span>
                </button>
                <label className="cursor-pointer px-2.5 py-1 rounded bg-[#302E2B] hover:bg-[#3C3A36] text-[11px] font-bold text-[#DAD9D7] inline-flex items-center gap-1">
                  <FileUp className="w-3 h-3 text-[#81B64C]" />
                  <span>File .pgn</span>
                  <input
                    type="file"
                    accept=".pgn,.txt"
                    onChange={handleUploadPgnFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <textarea
              value={pgnDraft}
              onChange={(e) => setPgnDraft(e.target.value)}
              rows={9}
              placeholder={'Incolla qui il testo PGN della partita...\nEs: 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 ...'}
              className="w-full rounded bg-[#21201D] border border-[#3C3A36] focus:border-[#81B64C] outline-none p-3 text-xs font-mono-tabular text-[#F3F3F2] placeholder:text-[#787672]"
            />

            {pgnError && (
              <p className="text-xs text-red-200 bg-red-950/60 border border-red-500/40 rounded px-3 py-2">
                {pgnError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#9E9D9A] font-semibold">Analizza dal lato:</span>
                <button
                  type="button"
                  onClick={() => setPgnColor('w')}
                  className={`px-3 py-1.5 rounded font-bold border ${
                    pgnColor === 'w'
                      ? 'bg-[#F3F3F2] text-[#21201D] border-[#F3F3F2]'
                      : 'bg-[#21201D] text-[#BABABA] border-[#3C3A36]'
                  }`}
                >
                  Bianco
                </button>
                <button
                  type="button"
                  onClick={() => setPgnColor('b')}
                  className={`px-3 py-1.5 rounded font-bold border ${
                    pgnColor === 'b'
                      ? 'bg-[#1B1917] text-white border-[#81B64C]'
                      : 'bg-[#21201D] text-[#BABABA] border-[#3C3A36]'
                  }`}
                >
                  Nero
                </button>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded bg-[#81B64C] hover:bg-[#95C85E] text-white text-xs font-extrabold border-b-2 border-[#5D8A32] inline-flex items-center gap-2"
              >
                <GraduationCap className="w-4 h-4" />
                <span>Avvia Revisione Coach</span>
              </button>
            </div>
          </form>

          {/* Right: Recent Saved Analyses */}
          <div className="lg:col-span-5 bg-[#262421] border border-[#3C3A36] rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-[#21201D] border-b border-[#3C3A36] flex items-center justify-between">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#BABABA]">
                Partite Analizzate di Recente
              </h2>
              <span className="text-xs font-mono-tabular text-[#9E9D9A]">
                {savedReviews.length}
              </span>
            </div>

            <div className="divide-y divide-[#33302C] max-h-[380px] overflow-y-auto">
              {savedReviews.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#8B8987] space-y-2">
                  <p>Nessuna partita ancora analizzata.</p>
                  <p>Gioca una partita o importa un PGN a sinistra per iniziare la tua sessione con il Coach.</p>
                </div>
              ) : (
                savedReviews.map((rev) => (
                  <button
                    key={rev.id}
                    type="button"
                    onClick={() => handleReopenSavedReview(rev)}
                    className="w-full text-left px-4 py-3 hover:bg-[#2F2C28] transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {rev.whiteUsername} vs {rev.blackUsername}
                      </p>
                      <p className="text-[11px] text-[#9E9D9A] truncate mt-0.5">
                        {rev.openingName} · {rev.movesCount} mosse
                      </p>
                    </div>
                    <div className="text-right shrink-0 font-mono-tabular">
                      <p className="text-xs font-extrabold text-[#81B64C]">{rev.accuracyPct}%</p>
                      <p className="text-[10px] text-[#9E9D9A]">
                        {rev.result === 'win' ? 'Vinta' : rev.result === 'loss' ? 'Persa' : 'Patta'}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Analyzing Splash
  if (analyzing || !analysis) {
    const pct =
      progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 8;
    return (
      <div className="max-w-[720px] mx-auto px-4 py-14">
        <div className="bg-[#262421] border border-[#3C3A36] rounded-md p-6 space-y-4 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-[#21201D] border border-[#81B64C]/50 mx-auto">
            <Loader2 className="w-6 h-6 text-[#81B64C] animate-spin" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">
              Analisi tattica e strategica della partita in corso...
            </h2>
            <p className="text-xs text-[#9E9D9A] mt-1">
              Il motore sta valutando tutte le mosse di entrambi i giocatori per preparare la revisione con il Coach.
            </p>
          </div>
          <div className="w-full h-2.5 bg-[#21201D] rounded overflow-hidden border border-[#3C3A36]">
            <div
              className="h-full bg-[#81B64C] transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs font-mono-tabular text-[#BABABA]">
            Mossa {progress.done} di {progress.total || '?'} ({pct}%)
          </p>
          <button
            type="button"
            onClick={() => {
              activeRunIdRef.current += 1;
              setAnalyzing(false);
              setShowImportPanel(true);
            }}
            className="px-3 py-1.5 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#3C3A36] text-[11px] font-bold text-[#DAD9D7]"
          >
            Annulla · Importa PGN
          </button>
        </div>
      </div>
    );
  }

  const topUsername = topColor === 'w' ? analysis.whiteUsername : analysis.blackUsername;
  const bottomUsername = bottomColor === 'w' ? analysis.whiteUsername : analysis.blackUsername;
  const topStats = topColor === 'w' ? analysis.whiteStats : analysis.blackStats;
  const bottomStats = bottomColor === 'w' ? analysis.whiteStats : analysis.blackStats;
  const mySideStats =
    analysis.playerColor === 'w' ? analysis.whiteStats : analysis.blackStats;
  const oppSideStats =
    analysis.playerColor === 'w' ? analysis.blackStats : analysis.whiteStats;

  return (
    <div className="max-w-[1220px] mx-auto px-4 sm:px-6 py-4 sm:py-5">
      {/* Studio Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBackToLobby}
            className="px-3 py-1.5 rounded bg-[#262421] hover:bg-[#3C3A36] border border-[#3C3A36] text-xs font-bold text-[#DAD9D7] inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Lobby</span>
          </button>
          {onBackToGame && (
            <button
              type="button"
              onClick={onBackToGame}
              className="px-3 py-1.5 rounded bg-[#262421] hover:bg-[#3C3A36] border border-[#3C3A36] text-xs font-bold text-[#DAD9D7]"
            >
              Torna alla partita
            </button>
          )}
          <span className="text-xs text-[#9E9D9A] font-medium pl-1">
            {analysis.openingEco} · {analysis.openingName} · {analysis.resultLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImportPanel(true)}
            className="px-3 py-1.5 rounded bg-[#262421] hover:bg-[#3C3A36] border border-[#3C3A36] text-xs font-bold text-[#DAD9D7] inline-flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 text-[#81B64C]" />
            <span>Importa PGN</span>
          </button>
          <button
            type="button"
            onClick={onRequestOpenStats}
            className="px-3 py-1.5 rounded bg-[#262421] hover:bg-[#3C3A36] border border-[#3C3A36] text-xs font-bold text-[#DAD9D7] inline-flex items-center gap-1.5"
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#81B64C]" />
            <span>Statistiche</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Eval Bar + Board + Controls */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full max-w-[632px] flex items-stretch gap-2.5">
            {/* Vertical Engine Eval Bar */}
            <div className="w-6 shrink-0 flex flex-col justify-between bg-[#1B1917] border border-[#3C3A36] rounded overflow-hidden my-9 relative">
              <div
                className="w-full bg-[#F3F3F2] transition-all duration-300"
                style={{
                  height: `${
                    orientation === 'w' ? 100 - evalSnapshot.whitePct : evalSnapshot.whitePct
                  }%`,
                  backgroundColor: orientation === 'w' ? '#1B1917' : '#F3F3F2',
                }}
              />
              <div
                className="w-full transition-all duration-300 flex-1"
                style={{
                  backgroundColor: orientation === 'w' ? '#F3F3F2' : '#1B1917',
                }}
              />
              <span
                className={`absolute left-0 right-0 text-center text-[9px] font-extrabold font-mono-tabular px-0.5 leading-tight ${
                  evalSnapshot.whitePct >= 50
                    ? orientation === 'w'
                      ? 'bottom-1 text-[#21201D]'
                      : 'top-1 text-[#21201D]'
                    : orientation === 'w'
                      ? 'top-1 text-[#F3F3F2]'
                      : 'bottom-1 text-[#F3F3F2]'
                }`}
              >
                {evalSnapshot.label}
              </span>
            </div>

            {/* Board Column */}
            <div className="flex-1 min-w-0">
              {/* Top Player Row */}
              <div className="flex items-center justify-between py-1.5 px-1 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-3.5 h-3.5 rounded-sm border border-[#4A4742] shrink-0 ${
                      topColor === 'w' ? 'bg-[#F3F3F2]' : 'bg-[#1B1917]'
                    }`}
                  />
                  <span className="font-bold text-white truncate">{topUsername}</span>
                  {topColor === analysis.playerColor && (
                    <span className="text-[10px] font-bold text-[#81B64C]">(Tu)</span>
                  )}
                </div>
                <span className="font-mono-tabular text-xs font-extrabold text-[#DAD9D7]">
                  Precisione {topStats.accuracyPct}%
                </span>
              </div>

              <ChessBoard
                fen={boardView.fen}
                moves={gameMovesForBoard}
                activeMoveCount={boardView.activeMoveCount}
                orientation={orientation}
                canInteract={isQuizActive}
                playerColor={isQuizActive && focusedMove ? focusedMove.color : null}
                lastMove={boardView.lastMove}
                arrows={boardView.arrows}
                onMove={handleStudentQuizMove}
              />

              {/* Bottom Player Row */}
              <div className="flex items-center justify-between py-1.5 px-1 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-3.5 h-3.5 rounded-sm border border-[#4A4742] shrink-0 ${
                      bottomColor === 'w' ? 'bg-[#F3F3F2]' : 'bg-[#1B1917]'
                    }`}
                  />
                  <span className="font-bold text-white truncate">{bottomUsername}</span>
                  {bottomColor === analysis.playerColor && (
                    <span className="text-[10px] font-bold text-[#81B64C]">(Tu)</span>
                  )}
                </div>
                <span className="font-mono-tabular text-xs font-extrabold text-[#81B64C]">
                  Precisione {bottomStats.accuracyPct}%
                </span>
              </div>
            </div>
          </div>

          {/* Variation Stepper OR Standard Move Navigation Controls */}
          <div className="w-full max-w-[632px] mt-2 bg-[#262421] border border-[#3C3A36] rounded px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            {variation ? (
              <>
                <div className="flex items-center gap-2 text-xs min-w-0">
                  <span className="font-bold text-[#81B64C] shrink-0">{variation.label}</span>
                  <span className="font-mono-tabular text-[#DAD9D7] truncate">
                    {variation.sans.map((s, idx) => (
                      <button
                        key={`${s}-${idx}`}
                        type="button"
                        onClick={() => {
                          setVariation({ ...variation, stepIndex: idx + 1 });
                          playSoundForSan(s);
                        }}
                        className={`px-1.5 py-0.5 rounded mr-1 ${
                          variation.stepIndex === idx + 1
                            ? 'bg-[#81B64C] text-white font-bold'
                            : 'hover:bg-[#3C3A36]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => stepVariation(-1)}
                    disabled={variation.stepIndex === 0}
                    className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepVariation(1)}
                    disabled={variation.stepIndex >= variation.sans.length}
                    className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setVariation(null)}
                    className="px-2.5 py-1 rounded bg-[#3C3A36] hover:bg-[#4B4843] text-[11px] font-bold text-white"
                  >
                    Esci variante
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => jumpToPly(0, 'before_move')}
                    aria-label="Inizio"
                    className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36]"
                  >
                    <ChevronFirst className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (boardState === 'after_move') {
                        jumpToPly(focusedPly, 'before_move');
                      } else {
                        jumpToPly(focusedPly - 1, 'after_move');
                      }
                    }}
                    disabled={focusedPly === 0 && boardState === 'before_move'}
                    aria-label="Indietro"
                    className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (boardState === 'before_move') {
                        jumpToPly(focusedPly, 'after_move');
                      } else {
                        jumpToPly(focusedPly + 1, 'after_move');
                      }
                    }}
                    disabled={
                      focusedPly >= analysis.moves.length - 1 && boardState === 'after_move'
                    }
                    aria-label="Avanti"
                    className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToPly(analysis.moves.length - 1, 'after_move')}
                    aria-label="Fine"
                    className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36]"
                  >
                    <ChevronLast className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipped((f) => !f)}
                    aria-label="Capovolgi"
                    className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36]"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {focusedMove && focusedMove.bestMoveSan !== focusedMove.san && !isQuizActive && (
                    <button
                      type="button"
                      onClick={() => startBestVariationPreview(focusedMove)}
                      className="px-2.5 py-1 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#81B64C]/50 text-[11px] font-bold text-[#81B64C] inline-flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>Mostra variante ({focusedMove.bestMoveSan})</span>
                    </button>
                  )}
                  {focusedMove && (
                    <button
                      type="button"
                      onClick={handleAskCoachAboutFocusedMove}
                      className="px-2.5 py-1 rounded bg-[#81B64C] hover:bg-[#95C85E] text-[11px] font-extrabold text-white inline-flex items-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Chiedi al Coach</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Tabbed Interactive Coach + Move List + Summary */}
        <div className="lg:col-span-5 bg-[#262421] border border-[#3C3A36] rounded-md overflow-hidden flex flex-col h-[660px]">
          {/* Studio Tab Selector */}
          <div className="grid grid-cols-3 bg-[#21201D] border-b border-[#3C3A36] text-xs font-extrabold">
            <button
              type="button"
              onClick={() => setRightTab('coach')}
              className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                rightTab === 'coach'
                  ? 'border-[#81B64C] text-white bg-[#262421]'
                  : 'border-transparent text-[#9E9D9A] hover:text-white'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 text-[#81B64C]" />
              <span>Coach</span>
            </button>
            <button
              type="button"
              onClick={() => setRightTab('moves')}
              className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                rightTab === 'moves'
                  ? 'border-[#81B64C] text-white bg-[#262421]'
                  : 'border-transparent text-[#9E9D9A] hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-[#D2B088]" />
              <span>Mosse ({analysis.moves.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setRightTab('summary')}
              className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                rightTab === 'summary'
                  ? 'border-[#81B64C] text-white bg-[#262421]'
                  : 'border-transparent text-[#9E9D9A] hover:text-white'
              }`}
            >
              <Target className="w-3.5 h-3.5 text-[#E6912C]" />
              <span>Riepilogo</span>
            </button>
          </div>

          {/* TAB 1: CONVERSATIONAL AI COACH */}
          {rightTab === 'coach' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Focused Move Engine Banner */}
              {focusedMove && (
                <div className="px-3.5 py-2.5 bg-[#21201D] border-b border-[#3C3A36] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] font-extrabold text-white shrink-0 ${
                        CLASS_META[focusedMove.classification].badgeBg
                      }`}
                    >
                      {CLASS_META[focusedMove.classification].symbol}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        <span className="font-mono-tabular mr-1.5">
                          {focusedMove.moveNumber}
                          {focusedMove.color === 'w' ? '.' : '...'} {focusedMove.san}
                        </span>
                        <span className={CLASS_META[focusedMove.classification].colorClass}>
                          {CLASS_META[focusedMove.classification].label}
                        </span>
                      </p>
                      <p className="text-[11px] text-[#9E9D9A] truncate">
                        {isQuizActive
                          ? 'Trova la mossa migliore sulla scacchiera!'
                          : focusedMove.bestMoveSan !== focusedMove.san
                            ? `Migliore: ${focusedMove.bestMoveSan} (${focusedMove.bestPvSan.slice(0, 3).join(' ')})`
                            : focusedMove.tacticalNote}
                      </p>
                    </div>
                  </div>
                  {!isQuizActive && focusedMove.cpLoss > 0 && (
                    <span className="text-[11px] font-mono-tabular text-[#9E9D9A] shrink-0">
                      -{(focusedMove.cpLoss / 100).toFixed(1)}
                    </span>
                  )}
                </div>
              )}

              {/* Interactive Quiz Guidance Strip */}
              {isQuizActive && focusedMove && (
                <div className="px-3.5 py-2 bg-[#2B3424] border-b border-[#81B64C]/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-[#E8F3DC] font-semibold">
                    <HelpCircle className="w-4 h-4 text-[#81B64C] shrink-0" />
                    <span>Muovi un pezzo sulla scacchiera per rispondere al Coach</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendChat('Mostrami la soluzione migliore e spiegami perché.')}
                    className="px-2 py-1 rounded bg-[#21201D] hover:bg-[#3C3A36] text-[11px] font-bold text-[#81B64C] shrink-0"
                  >
                    Mostra soluzione
                  </button>
                </div>
              )}

              {/* Chat Conversation Stream */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {chatEntries.map((entry) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14 }}
                    className={`flex flex-col ${
                      entry.role === 'student' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[92%] rounded-md px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                        entry.role === 'student'
                          ? 'bg-[#81B64C] text-white font-semibold'
                          : 'bg-[#21201D] border border-[#3C3A36] text-[#EAE9E7]'
                      }`}
                    >
                      {entry.role === 'coach' && (
                        <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] font-extrabold text-[#81B64C]">
                          <span className="inline-flex items-center gap-1">
                            <GraduationCap className="w-3.5 h-3.5" />
                            Coach
                          </span>
                          {typeof entry.focusPly === 'number' &&
                            analysis.moves[entry.focusPly] && (
                              <button
                                type="button"
                                onClick={() =>
                                  jumpToPly(entry.focusPly!, 'before_move')
                                }
                                className="text-[10px] font-mono-tabular text-[#BABABA] hover:text-white underline"
                              >
                                Posizione {analysis.moves[entry.focusPly].moveNumber}
                                {analysis.moves[entry.focusPly].color === 'w' ? '.' : '...'}
                              </button>
                            )}
                        </div>
                      )}
                      {entry.role === 'coach'
                        ? renderFormattedCoachText(entry.text)
                        : entry.text}
                    </div>

                    {entry.role === 'coach' &&
                      entry.suggestedReplies &&
                      entry.suggestedReplies.length > 0 &&
                      entry.id === chatEntries[chatEntries.length - 1]?.id && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {entry.suggestedReplies.map((reply) => (
                            <button
                              key={reply}
                              type="button"
                              onClick={() => handleSendChat(reply)}
                              className="px-2.5 py-1 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#45433E] text-[11px] font-semibold text-[#DAD9D7] text-left transition-colors"
                            >
                              {reply}
                            </button>
                          ))}
                        </div>
                      )}
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChat(chatInput);
                }}
                className="p-2.5 bg-[#21201D] border-t border-[#3C3A36] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Rispondi o fai una domanda al Coach..."
                  className="flex-1 bg-[#302E2B] border border-[#3C3A36] focus:border-[#81B64C] outline-none rounded px-3 py-2 text-xs text-white placeholder:text-[#787672]"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="px-3 py-2 rounded bg-[#81B64C] hover:bg-[#95C85E] disabled:opacity-40 text-white"
                  aria-label="Invia"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: MOVE-BY-MOVE ANALYSIS & DECISIVE MOMENTS */}
          {rightTab === 'moves' && (
            <div className="flex-1 overflow-y-auto flex flex-col">
              {/* Decisive Moments Strip */}
              {analysis.decisiveMoments.length > 0 && (
                <div className="p-3 bg-[#21201D] border-b border-[#3C3A36] space-y-2">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[#9E9D9A]">
                    Momenti Decisivi ({analysis.decisiveMoments.length})
                  </h3>
                  <div className="space-y-1.5">
                    {analysis.decisiveMoments.map((m) => {
                      const meta = CLASS_META[m.classification];
                      return (
                        <button
                          key={m.ply}
                          type="button"
                          onClick={() => jumpToPly(m.ply, 'after_move')}
                          className={`w-full text-left px-2.5 py-2 rounded border transition-colors flex items-start justify-between gap-2 ${
                            focusedPly === m.ply
                              ? 'bg-[#34312C] border-[#81B64C]/60'
                              : 'bg-[#262421] border-[#3C3A36] hover:bg-[#2F2C28]'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white">
                              <span className="font-mono-tabular mr-1.5">
                                {m.moveNumber}
                                {m.color === 'w' ? '.' : '...'} {m.san}
                              </span>
                              <span className={meta.colorClass}>{meta.label}</span>
                            </p>
                            <p className="text-[11px] text-[#9E9D9A] line-clamp-2 mt-0.5">
                              {m.tacticalNote}
                            </p>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold text-white shrink-0 ${meta.badgeBg}`}
                          >
                            {meta.symbol}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dual-Player Full Move List */}
              <div className="divide-y divide-[#2F2D29] font-mono-tabular text-xs">
                {movePairs.map((pair, rIdx) => (
                  <div
                    key={pair.moveNumber}
                    className={`grid grid-cols-12 items-center px-3 py-1.5 ${
                      rIdx % 2 === 0 ? 'bg-[#262421]' : 'bg-[#2A2825]'
                    }`}
                  >
                    <span className="col-span-2 text-[#8B8987]">{pair.moveNumber}.</span>
                    {pair.white && (
                      <button
                        type="button"
                        onClick={() => jumpToPly(pair.white!.ply, 'after_move')}
                        className={`col-span-5 text-left px-2 py-1 rounded flex items-center justify-between gap-1 ${
                          focusedPly === pair.white.ply
                            ? 'bg-[#48453F] text-white font-bold'
                            : 'text-[#DAD9D7] hover:bg-[#383530]'
                        }`}
                      >
                        <span className="truncate">{pair.white.san}</span>
                        <span
                          className={`text-[10px] font-extrabold ${
                            CLASS_META[pair.white.classification].colorClass
                          }`}
                        >
                          {CLASS_META[pair.white.classification].symbol}
                        </span>
                      </button>
                    )}
                    {pair.black && (
                      <button
                        type="button"
                        onClick={() => jumpToPly(pair.black!.ply, 'after_move')}
                        className={`col-span-5 text-left px-2 py-1 rounded flex items-center justify-between gap-1 ${
                          focusedPly === pair.black.ply
                            ? 'bg-[#48453F] text-white font-bold'
                            : 'text-[#DAD9D7] hover:bg-[#383530]'
                        }`}
                      >
                        <span className="truncate">{pair.black.san}</span>
                        <span
                          className={`text-[10px] font-extrabold ${
                            CLASS_META[pair.black.classification].colorClass
                          }`}
                        >
                          {CLASS_META[pair.black.classification].symbol}
                        </span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: DUAL ACCURACY & PHASE SUMMARY */}
          {rightTab === 'summary' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Dual Accuracy Comparison */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#21201D] border border-[#81B64C]/50 rounded p-3.5 text-center">
                  <p className="text-[11px] font-bold text-[#9E9D9A] truncate">
                    Tu ({analysis.playerColor === 'w' ? analysis.whiteUsername : analysis.blackUsername})
                  </p>
                  <p className="text-2xl font-extrabold text-[#81B64C] font-mono-tabular mt-1">
                    {mySideStats.accuracyPct}%
                  </p>
                </div>
                <div className="bg-[#21201D] border border-[#3C3A36] rounded p-3.5 text-center">
                  <p className="text-[11px] font-bold text-[#9E9D9A] truncate">
                    {analysis.playerColor === 'w' ? analysis.blackUsername : analysis.whiteUsername}
                  </p>
                  <p className="text-2xl font-extrabold text-[#F3F3F2] font-mono-tabular mt-1">
                    {oppSideStats.accuracyPct}%
                  </p>
                </div>
              </div>

              {/* Phase Breakdown */}
              <div className="bg-[#21201D] border border-[#3C3A36] rounded p-3.5 space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#BABABA]">
                  Precisione per Fase (Tu)
                </h3>
                {(
                  [
                    ['Apertura', mySideStats.openingAcc],
                    ['Mediogioco', mySideStats.middlegameAcc],
                    ['Finale', mySideStats.endgameAcc],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#DAD9D7] font-semibold">{label}</span>
                      <span className="font-mono-tabular font-bold text-white">{val}%</span>
                    </div>
                    <div className="h-1.5 bg-[#302E2B] rounded overflow-hidden">
                      <div
                        className="h-full bg-[#81B64C]"
                        style={{ width: `${val}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Classification Breakdown Both Sides */}
              <div className="bg-[#21201D] border border-[#3C3A36] rounded overflow-hidden">
                <div className="grid grid-cols-3 px-3.5 py-2 border-b border-[#3C3A36] text-[11px] font-extrabold text-[#9E9D9A]">
                  <span>Categoria</span>
                  <span className="text-center">Bianco</span>
                  <span className="text-center">Nero</span>
                </div>
                <div className="divide-y divide-[#2E2C28] text-xs font-mono-tabular">
                  {(
                    [
                      ['Brillanti (!!)', 'brilliant', analysis.whiteStats.brilliant, analysis.blackStats.brilliant],
                      ['Ottime (!)', 'great', analysis.whiteStats.great, analysis.blackStats.great],
                      ['Buone (✓)', 'good', analysis.whiteStats.good, analysis.blackStats.good],
                      ['Teoria (B)', 'book', analysis.whiteStats.book, analysis.blackStats.book],
                      ['Imprecisioni (?!) ', 'inaccuracy', analysis.whiteStats.inaccuracy, analysis.blackStats.inaccuracy],
                      ['Errori (?)', 'mistake', analysis.whiteStats.mistake, analysis.blackStats.mistake],
                      ['Blunder (??)', 'blunder', analysis.whiteStats.blunder, analysis.blackStats.blunder],
                      ...(analysis.whiteStats.missedWin > 0 || analysis.blackStats.missedWin > 0
                        ? ([
                            [
                              'Vittorie mancate (✕)',
                              'missed_win',
                              analysis.whiteStats.missedWin,
                              analysis.blackStats.missedWin,
                            ],
                          ] as Array<[string, CoachMoveClass, number, number]>)
                        : []),
                    ] as Array<[string, CoachMoveClass, number, number]>
                  ).map(([label, cls, wVal, bVal]) => (
                    <div key={label} className="grid grid-cols-3 px-3.5 py-2 items-center">
                      <span className={`font-sans font-semibold ${CLASS_META[cls].colorClass}`}>
                        {label}
                      </span>
                      <span className="text-center font-bold text-white">{wVal}</span>
                      <span className="text-center font-bold text-white">{bVal}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={onRequestOpenStats}
                className="w-full py-2.5 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#3C3A36] text-xs font-bold text-white inline-flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-4 h-4 text-[#81B64C]" />
                <span>Apri Statistiche e Progressi Personali</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
