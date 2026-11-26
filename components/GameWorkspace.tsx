'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Flag,
  GraduationCap,
  Handshake,
  RotateCcw,
  RefreshCw,
  Target,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  TIME_CONTROLS,
  type GameMove,
  type GameState,
  type MoveQuality,
  type PieceColor,
} from '@/lib/types';
import { computePostGameReview } from '@/lib/chess-bot';
import { soundFX } from '@/lib/sound';
import type { UiDictionary } from '@/lib/i18n';
import { ChessBoard, type BoardArrow, type BoardHighlight } from './ChessBoard';
import { PlayerBar } from './PlayerBar';
import { MatchChat } from './MatchChat';
import { MoveQualityBadge, QUALITY_META } from './MoveQualityBadge';

interface GameWorkspaceProps {
  game: GameState;
  myUsername: string;
  dict: UiDictionary;
  whiteTimeMs: number;
  blackTimeMs: number;
  muted: boolean;
  onToggleMute: () => void;
  onMove: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => void;
  onSendChat: (text: string) => void;
  onResign: () => void;
  onOfferDraw: () => void;
  onRespondDraw: (accept: boolean) => void;
  onRematch: () => void;
  onBackToLobby: () => void;
  onOpenCoachStudio?: () => void;
}

const PIECE_SCORE: Record<'p' | 'n' | 'b' | 'r' | 'q', number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

function computeCaptured(moves: GameState['moves']) {
  const capturedByWhite: Array<'p' | 'n' | 'b' | 'r' | 'q'> = [];
  const capturedByBlack: Array<'p' | 'n' | 'b' | 'r' | 'q'> = [];
  let whitePts = 0;
  let blackPts = 0;

  for (const m of moves) {
    if (!m.captured) continue;
    const cap = m.captured as 'p' | 'n' | 'b' | 'r' | 'q';
    if (!PIECE_SCORE[cap]) continue;
    if (m.color === 'w') {
      capturedByWhite.push(cap);
      whitePts += PIECE_SCORE[cap];
    } else {
      capturedByBlack.push(cap);
      blackPts += PIECE_SCORE[cap];
    }
  }

  return {
    capturedByWhite,
    capturedByBlack,
    whiteAdv: Math.max(0, whitePts - blackPts),
    blackAdv: Math.max(0, blackPts - whitePts),
  };
}

export function GameWorkspace({
  game,
  myUsername,
  dict,
  whiteTimeMs,
  blackTimeMs,
  muted,
  onToggleMute,
  onMove,
  onSendChat,
  onResign,
  onOfferDraw,
  onRespondDraw,
  onRematch,
  onBackToLobby,
  onOpenCoachStudio,
}: GameWorkspaceProps) {
  const myColor: PieceColor =
    !game.white.isBot && game.white.username.toLowerCase() === myUsername.toLowerCase()
      ? 'w'
      : 'b';

  const [flipped, setFlipped] = useState(false);
  const [viewMoveIndex, setViewMoveIndex] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [arrowMode, setArrowMode] = useState(false);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [highlights, setHighlights] = useState<BoardHighlight[]>([]);

  const orientation: PieceColor = flipped ? (myColor === 'w' ? 'b' : 'w') : myColor;
  const isActive = game.status === 'active';

  // Bot matches: live move analysis immediately during the game + at game end.
  // Online PvP matches: NO live hints/badges during play; full review unlocks at the end.
  const showMoveAnalysis = Boolean(game.isBotGame) || !isActive;

  const isInspectingHistory =
    viewMoveIndex !== null && viewMoveIndex < game.moves.length - 1;

  const displayFen = useMemo(() => {
    if (viewMoveIndex === null) return game.fen;
    if (viewMoveIndex < 0) {
      return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    }
    return game.moves[viewMoveIndex]?.fen || game.fen;
  }, [game.fen, game.moves, viewMoveIndex]);

  const activeMoveIndex = viewMoveIndex === null ? game.moves.length - 1 : viewMoveIndex;
  const inspectedMove: GameMove | null =
    activeMoveIndex >= 0 && game.moves[activeMoveIndex] ? game.moves[activeMoveIndex] : null;

  const lastMoveHighlight = useMemo(() => {
    if (!inspectedMove) return null;
    return {
      from: inspectedMove.from,
      to: inspectedMove.to,
      quality: showMoveAnalysis ? inspectedMove.quality : undefined,
    };
  }, [inspectedMove, showMoveAnalysis]);

  const material = useMemo(() => computeCaptured(game.moves), [game.moves]);

  const myQualityCounts = useMemo(() => {
    const counts: Record<Exclude<MoveQuality, 'neutral'>, number> = {
      book: 0,
      brilliant: 0,
      great: 0,
      good: 0,
      mistake: 0,
      blunder: 0,
    };
    if (!showMoveAnalysis) return counts;
    for (const m of game.moves) {
      if (m.color !== myColor) continue;
      if (m.quality && m.quality !== 'neutral' && m.quality in counts) {
        counts[m.quality] += 1;
      }
    }
    return counts;
  }, [game.moves, myColor, showMoveAnalysis]);

  const reviewData = useMemo(() => {
    if (!showMoveAnalysis) return null;
    return computePostGameReview(game.moves, myColor);
  }, [showMoveAnalysis, game.moves, myColor]);

  const errorMoveIndices = useMemo(() => {
    if (!showMoveAnalysis) return [] as number[];
    const idxs: number[] = [];
    for (let i = 0; i < game.moves.length; i++) {
      const m = game.moves[i];
      if (m.color === myColor && (m.quality === 'mistake' || m.quality === 'blunder')) {
        idxs.push(i);
      }
    }
    return idxs;
  }, [game.moves, myColor, showMoveAnalysis]);

  function playMoveHistorySound(idx: number) {
    const move = game.moves[idx];
    if (!move) return;
    if (move.san.includes('+') || move.san.includes('#')) {
      soundFX.playCheck(Boolean(move.captured));
    } else if (move.san === 'O-O' || move.san === 'O-O-O') {
      soundFX.playCastle();
    } else if (move.promotion) {
      soundFX.playPromote();
    } else if (move.captured) {
      soundFX.playCapture();
    } else {
      soundFX.playMove();
    }
  }

  function handleSelectMoveIndex(targetIdx: number) {
    playMoveHistorySound(targetIdx);
    setViewMoveIndex(targetIdx === game.moves.length - 1 ? null : targetIdx);
  }

  function handleJumpToNextError() {
    if (errorMoveIndices.length === 0) return;
    const nextIdx = errorMoveIndices.find((idx) => idx > activeMoveIndex);
    const target = nextIdx !== undefined ? nextIdx : errorMoveIndices[0];
    handleSelectMoveIndex(target);
  }

  const topColor: PieceColor = orientation === 'w' ? 'b' : 'w';
  const bottomColor: PieceColor = orientation;

  const topPlayer = topColor === 'w' ? game.white : game.black;
  const bottomPlayer = bottomColor === 'w' ? game.white : game.black;

  const opponent = myColor === 'w' ? game.black : game.white;
  const isDummyTraining = Boolean(game.isBotGame && game.botId === 'dummy');
  const canMoveNow =
    isActive && !isInspectingHistory && (isDummyTraining || game.turn === myColor);
  const incomingDrawOffer = isActive && game.drawOfferBy !== null && game.drawOfferBy !== myColor;

  const movePairs = useMemo(() => {
    const pairs: Array<{
      moveNumber: number;
      white?: { move: GameMove; idx: number };
      black?: { move: GameMove; idx: number };
    }> = [];
    for (let i = 0; i < game.moves.length; i += 2) {
      pairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: { move: game.moves[i], idx: i },
        black: game.moves[i + 1] ? { move: game.moves[i + 1], idx: i + 1 } : undefined,
      });
    }
    return pairs;
  }, [game.moves]);

  const winnerLabel = useMemo(() => {
    if (game.status === 'active') return '';
    if (isDummyTraining && game.status === 'resigned') return dict.trainingComplete;
    if (game.winner === 'draw') return dict.drawResult;
    if (game.winner === myColor) return dict.youWon;
    return dict.defeat;
  }, [game.status, game.winner, myColor, dict, isDummyTraining]);

  function handleStartReview() {
    if (game.moves.length === 0) return;
    if (errorMoveIndices.length > 0) {
      const firstErr = errorMoveIndices[0];
      handleSelectMoveIndex(firstErr);
      return;
    }
    const firstMyMove = game.moves.findIndex((m) => m.color === myColor);
    const target = firstMyMove >= 0 ? firstMyMove : 0;
    handleSelectMoveIndex(target);
  }

  const inspectedMeta =
    showMoveAnalysis &&
    inspectedMove?.quality &&
    inspectedMove.quality !== 'neutral' &&
    inspectedMove.quality in QUALITY_META
      ? QUALITY_META[inspectedMove.quality]
      : null;

  const bestMoveHint =
    showMoveAnalysis && reviewData && activeMoveIndex >= 0
      ? reviewData.bestMoveByPly[activeMoveIndex]
      : undefined;

  return (
    <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Board + Player Bars */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full max-w-[600px]">
            <PlayerBar
              player={topPlayer}
              color={topColor}
              timeMs={topColor === 'w' ? whiteTimeMs : blackTimeMs}
              timeControl={game.timeControl}
              isTurn={game.turn === topColor}
              isGameActive={isActive}
              isSelf={topColor === myColor}
              capturedPieces={topColor === 'w' ? material.capturedByWhite : material.capturedByBlack}
              materialAdvantage={topColor === 'w' ? material.whiteAdv : material.blackAdv}
              dict={dict}
            />

            <ChessBoard
              fen={displayFen}
              moves={game.moves}
              activeMoveCount={activeMoveIndex + 1}
              orientation={orientation}
              canInteract={canMoveNow}
              playerColor={isDummyTraining ? null : myColor}
              lastMove={lastMoveHighlight}
              arrowMode={arrowMode}
              arrows={arrows}
              highlights={highlights}
              onArrowsChange={setArrows}
              onHighlightsChange={setHighlights}
              onMove={(from, to, promo) => {
                setViewMoveIndex(null);
                onMove(from, to, promo);
              }}
            />

            <PlayerBar
              player={bottomPlayer}
              color={bottomColor}
              timeMs={bottomColor === 'w' ? whiteTimeMs : blackTimeMs}
              timeControl={game.timeControl}
              isTurn={game.turn === bottomColor}
              isGameActive={isActive}
              isSelf={bottomColor === myColor}
              capturedPieces={
                bottomColor === 'w' ? material.capturedByWhite : material.capturedByBlack
              }
              materialAdvantage={bottomColor === 'w' ? material.whiteAdv : material.blackAdv}
              dict={dict}
            />
          </div>
        </div>

        {/* Right: Unified Chess.com Game Panel */}
        <div className="lg:col-span-5 bg-[#262421] border border-[#3C3A36] rounded-md overflow-hidden flex flex-col">
          {/* Top Bar inside panel */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#21201D] border-b border-[#3C3A36]">
            <button
              type="button"
              onClick={onBackToLobby}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#BABABA] hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{dict.lobby}</span>
            </button>
            <span className="text-xs font-semibold text-[#9E9D9A]">
              {TIME_CONTROLS[game.timeControl]?.label ?? game.timeControl} · {game.moves.length} {dict.movesWord}
            </span>
          </div>

          {/* Game Over Summary */}
          {!isActive && (
            <div className="p-4 bg-[#2E2B27] border-b border-[#3C3A36]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold text-white">{winnerLabel}</h2>
                {reviewData && (
                  <span className="px-2.5 py-1 rounded bg-[#21201D] border border-[#81B64C]/50 text-xs font-bold text-[#81B64C] font-mono-tabular shrink-0">
                    {dict.accuracyLabel}: {reviewData.accuracyPct}%
                  </span>
                )}
              </div>
              <p className="text-xs text-[#C3C2C0] mt-0.5">{game.endReason}</p>

              {/* Post-Game Review Summary (Bot & Online PvP matches) */}
              <div className="mt-3 p-3 rounded bg-[#21201D] border border-[#81B64C]/55 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-white inline-flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-[#81B64C]" />
                    <span>{dict.reviewTitle}</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {game.moves.length > 0 && onOpenCoachStudio && (
                      <button
                        type="button"
                        onClick={onOpenCoachStudio}
                        className="px-2.5 py-1 rounded bg-[#81B64C] hover:bg-[#95C85E] text-[11px] font-extrabold text-white inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <GraduationCap className="w-3 h-3" />
                        <span>{dict.analyzeWithCoach}</span>
                      </button>
                    )}
                    {game.moves.length > 0 && (
                      <button
                        type="button"
                        onClick={handleStartReview}
                        className="px-2.5 py-1 rounded bg-[#3C3A36] hover:bg-[#4B4843] text-[11px] font-bold text-[#DAD9D7] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <GraduationCap className="w-3 h-3" />
                        <span>{dict.startReviewBtn}</span>
                      </button>
                    )}
                    {errorMoveIndices.length > 0 && (
                      <button
                        type="button"
                        onClick={handleJumpToNextError}
                        className="px-2.5 py-1 rounded bg-[#3C3A36] hover:bg-[#4B4843] text-[11px] font-bold text-[#F5A84B] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Target className="w-3 h-3" />
                        <span>{dict.nextErrorBtn}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs font-mono-tabular">
                  <span className="text-[#D2B088] inline-flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {myQualityCounts.book}
                  </span>
                  <span className="text-[#26D0C9]">!! {myQualityCounts.brilliant}</span>
                  <span className="text-[#7AB3E0]">! {myQualityCounts.great}</span>
                  <span className="text-[#9ED16A]">Buone {myQualityCounts.good}</span>
                  <span className="text-[#F5A84B]">? {myQualityCounts.mistake}</span>
                  <span className="text-[#F16562]">?? {myQualityCounts.blunder}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3.5">
                <button
                  type="button"
                  onClick={onRematch}
                  disabled={game.rematchRequestedBy === myColor}
                  className="px-4 py-2 rounded bg-[#81B64C] hover:bg-[#95C85E] disabled:opacity-50 text-white text-xs font-bold border-b-2 border-[#5D8A32] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    {game.rematchRequestedBy === myColor
                      ? dict.waitingRematch
                      : game.rematchRequestedBy
                        ? dict.acceptRematch
                        : dict.rematch}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onBackToLobby}
                  className="px-3.5 py-2 rounded bg-[#3C3A36] hover:bg-[#4B4843] text-[#E5E4E2] text-xs font-bold whitespace-nowrap"
                >
                  {dict.newGame}
                </button>
              </div>
            </div>
          )}

          {/* Incoming Draw Offer */}
          {incomingDrawOffer && (
            <div className="px-3.5 py-2.5 bg-[#2E2B27] border-b border-[#3C3A36] flex items-center justify-between gap-2">
              <span className="text-xs text-white font-semibold">
                {opponent.username} {dict.drawOfferText}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onRespondDraw(true)}
                  className="px-2.5 py-1 rounded bg-[#81B64C] text-white text-xs font-bold"
                >
                  {dict.accept}
                </button>
                <button
                  type="button"
                  onClick={() => onRespondDraw(false)}
                  className="px-2.5 py-1 rounded bg-[#3C3A36] text-[#DAD9D7] text-xs font-semibold"
                >
                  {dict.no}
                </button>
              </div>
            </div>
          )}

          {/* Move Evaluation Bar: Live during Bot matches, Post-Game only during Online PvP */}
          {showMoveAnalysis && inspectedMove && (
            <div className="px-3.5 py-2 bg-[#21201D] border-b border-[#3C3A36] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {inspectedMove.quality && inspectedMove.quality !== 'neutral' && (
                  <MoveQualityBadge quality={inspectedMove.quality} size="board" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    <span className="font-mono-tabular mr-1.5">{inspectedMove.san}</span>
                    {inspectedMeta ? (
                      <span className={inspectedMeta.textClass}>{inspectedMeta.title}</span>
                    ) : (
                      <span className="text-[#9E9D9A]">Imprecisione</span>
                    )}
                  </p>
                  <p className="text-[11px] text-[#9E9D9A] truncate">
                    {bestMoveHint ? (
                      <span className="text-[#81B64C] font-semibold">
                        {dict.reviewHintPrefix}{' '}
                        <span className="font-mono-tabular">{bestMoveHint}</span>
                      </span>
                    ) : inspectedMeta ? (
                      inspectedMeta.subtitle
                    ) : (
                      'Leggermente inferiore alla migliore'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isActive && game.isBotGame && reviewData && (
                  <span className="px-2 py-0.5 rounded bg-[#262421] border border-[#81B64C]/40 text-[10px] font-bold text-[#81B64C] font-mono-tabular">
                    {reviewData.accuracyPct}%
                  </span>
                )}
                {inspectedMove.quality !== 'book' &&
                  typeof inspectedMove.cpLoss === 'number' &&
                  inspectedMove.cpLoss > 0 && (
                    <span className="text-[11px] font-mono-tabular text-[#9E9D9A]">
                      -{(inspectedMove.cpLoss / 100).toFixed(1)}
                    </span>
                  )}
              </div>
            </div>
          )}

          {/* Chess.com 2-Column Alternating Move List */}
          <div className="h-[170px] overflow-y-auto font-mono-tabular text-xs">
            {movePairs.length === 0 ? (
              <p className="text-[#8B8987] text-center py-10 font-sans">
                {dict.makeFirstMove}
              </p>
            ) : (
              <div>
                {movePairs.map((pair, rIdx) => (
                  <div
                    key={pair.moveNumber}
                    className={`grid grid-cols-12 items-center px-3 py-1 ${
                      rIdx % 2 === 0 ? 'bg-[#262421]' : 'bg-[#2B2926]'
                    }`}
                  >
                    <span className="col-span-2 text-[#8B8987]">{pair.moveNumber}.</span>
                    {pair.white && (
                      <button
                        type="button"
                        onClick={() => handleSelectMoveIndex(pair.white!.idx)}
                        className={`col-span-5 text-left px-2 py-0.5 rounded inline-flex items-center justify-between gap-1 ${
                          (viewMoveIndex === null && pair.white.idx === game.moves.length - 1) ||
                          viewMoveIndex === pair.white.idx
                            ? 'bg-[#48453F] text-white font-bold'
                            : 'text-[#DAD9D7] hover:bg-[#383530]'
                        }`}
                      >
                        <span className="truncate">{pair.white.move.san}</span>
                        {showMoveAnalysis && (
                          <MoveQualityBadge quality={pair.white.move.quality} size="sm" />
                        )}
                      </button>
                    )}
                    {pair.black && (
                      <button
                        type="button"
                        onClick={() => handleSelectMoveIndex(pair.black!.idx)}
                        className={`col-span-5 text-left px-2 py-0.5 rounded inline-flex items-center justify-between gap-1 ${
                          (viewMoveIndex === null && pair.black.idx === game.moves.length - 1) ||
                          viewMoveIndex === pair.black.idx
                            ? 'bg-[#48453F] text-white font-bold'
                            : 'text-[#DAD9D7] hover:bg-[#383530]'
                        }`}
                      >
                        <span className="truncate">{pair.black.move.san}</span>
                        {showMoveAnalysis && (
                          <MoveQualityBadge quality={pair.black.move.quality} size="sm" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isInspectingHistory && (
            <div className="px-3 py-1.5 bg-[#383530] border-t border-[#45433E] flex items-center justify-between text-xs text-[#F5F682]">
              <span>...</span>
              <button
                type="button"
                onClick={() => setViewMoveIndex(null)}
                className="underline font-bold"
              >
                Live
              </button>
            </div>
          )}

          {/* Controls + History Nav */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#21201D] border-t border-[#3C3A36]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMoveIndex(-1)}
                disabled={game.moves.length === 0}
                aria-label="Inizio"
                className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
              >
                <ChevronFirst className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const curr = viewMoveIndex === null ? game.moves.length - 1 : viewMoveIndex;
                  const target = Math.max(-1, curr - 1);
                  if (target >= 0) playMoveHistorySound(target);
                  setViewMoveIndex(target);
                }}
                disabled={game.moves.length === 0 || viewMoveIndex === -1}
                aria-label="Indietro"
                className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (viewMoveIndex === null) return;
                  const next = viewMoveIndex + 1;
                  if (next >= 0 && next < game.moves.length) {
                    playMoveHistorySound(next);
                  }
                  setViewMoveIndex(next >= game.moves.length - 1 ? null : next);
                }}
                disabled={viewMoveIndex === null}
                aria-label="Avanti"
                className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (game.moves.length > 0) {
                    playMoveHistorySound(game.moves.length - 1);
                  }
                  setViewMoveIndex(null);
                }}
                disabled={viewMoveIndex === null}
                aria-label="Fine"
                className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
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
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'Attiva audio' : 'Disattiva audio'}
                className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36]"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setArrowMode((m) => !m)}
                title="Attiva frecce con il tasto sinistro"
                className={`px-2 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                  arrowMode
                    ? 'bg-[#FFAA00] text-[#21201D]'
                    : 'text-[#BABABA] hover:text-white hover:bg-[#3C3A36]'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>{dict.arrowsBtn}</span>
              </button>
              {(arrows.length > 0 || highlights.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setArrows([]);
                    setHighlights([]);
                  }}
                  aria-label="Cancella frecce"
                  title="Cancella frecce"
                  className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36]"
                >
                  <Eraser className="w-4 h-4" />
                </button>
              )}
            </div>

            {isActive && (
              <div className="flex items-center gap-1.5">
                {isDummyTraining ? (
                  <button
                    type="button"
                    onClick={onResign}
                    className="px-3 py-1.5 rounded bg-[#81B64C] hover:bg-[#95C85E] text-xs text-white font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>{dict.finishAndReviewBtn}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onOfferDraw}
                      disabled={game.drawOfferBy === myColor}
                      className="px-2.5 py-1.5 rounded bg-[#302E2B] hover:bg-[#3C3A36] disabled:opacity-40 text-xs text-[#DAD9D7] font-semibold inline-flex items-center gap-1"
                    >
                      <Handshake className="w-3.5 h-3.5" />
                      <span>{dict.drawBtn}</span>
                    </button>

                    {!confirmResign ? (
                      <button
                        type="button"
                        onClick={() => setConfirmResign(true)}
                        className="px-2.5 py-1.5 rounded bg-[#302E2B] hover:bg-[#CA3431] text-xs text-[#DAD9D7] hover:text-white font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        <span>{dict.resign}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmResign(false);
                            onResign();
                          }}
                          className="px-2.5 py-1.5 rounded bg-[#CA3431] text-xs text-white font-bold"
                        >
                          {dict.confirm}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResign(false)}
                          className="px-2 py-1.5 rounded bg-[#3C3A36] text-xs text-[#DAD9D7]"
                        >
                          {dict.no}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Integrated Match Chat */}
          <MatchChat
            messages={game.chat}
            myUsername={myUsername}
            opponentUsername={opponent.username}
            isBotGame={game.isBotGame}
            onSend={onSendChat}
          />
        </div>
      </div>
    </div>
  );
}
