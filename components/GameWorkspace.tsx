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
  Handshake,
  RotateCcw,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { GameMove, GameState, MoveQuality, PieceColor } from '@/lib/types';
import { TIME_CONTROLS } from '@/lib/types';
import { ChessBoard, type BoardArrow, type BoardHighlight } from './ChessBoard';
import { PlayerBar } from './PlayerBar';
import { MatchChat } from './MatchChat';
import { MoveQualityBadge, QUALITY_META } from './MoveQualityBadge';

interface GameWorkspaceProps {
  game: GameState;
  myUsername: string;
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
      quality: inspectedMove.quality,
    };
  }, [inspectedMove]);

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
    for (const m of game.moves) {
      if (m.color !== myColor) continue;
      if (m.quality && m.quality !== 'neutral') {
        counts[m.quality] += 1;
      }
    }
    return counts;
  }, [game.moves, myColor]);

  const topColor: PieceColor = orientation === 'w' ? 'b' : 'w';
  const bottomColor: PieceColor = orientation;

  const topPlayer = topColor === 'w' ? game.white : game.black;
  const bottomPlayer = bottomColor === 'w' ? game.white : game.black;

  const opponent = myColor === 'w' ? game.black : game.white;
  const isActive = game.status === 'active';
  const canMoveNow = isActive && !isInspectingHistory && game.turn === myColor;
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
    if (game.winner === 'draw') return 'Patta';
    if (game.winner === myColor) return 'Hai vinto!';
    return 'Sconfitta';
  }, [game.status, game.winner, myColor]);

  const inspectedMeta =
    inspectedMove?.quality && inspectedMove.quality !== 'neutral'
      ? QUALITY_META[inspectedMove.quality]
      : null;

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
            />

            <ChessBoard
              fen={displayFen}
              moves={game.moves}
              activeMoveCount={activeMoveIndex + 1}
              orientation={orientation}
              canInteract={canMoveNow}
              playerColor={myColor}
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
            />
          </div>
        </div>

        {/* Right: Unified Chess.com Game Panel (Eval, Moves, Controls, Chat) */}
        <div className="lg:col-span-5 bg-[#262421] border border-[#3C3A36] rounded-md overflow-hidden flex flex-col">
          {/* Top Bar inside panel */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#21201D] border-b border-[#3C3A36]">
            <button
              type="button"
              onClick={onBackToLobby}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#BABABA] hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Lobby</span>
            </button>
            <span className="text-xs font-semibold text-[#9E9D9A]">
              {TIME_CONTROLS[game.timeControl].label} · {game.moves.length} mosse
            </span>
          </div>

          {/* Game Over Summary */}
          {!isActive && (
            <div className="p-4 bg-[#2E2B27] border-b border-[#3C3A36]">
              <h2 className="text-lg font-extrabold text-white">{winnerLabel}</h2>
              <p className="text-xs text-[#C3C2C0] mt-0.5">{game.endReason}</p>

              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs font-mono-tabular">
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
                      ? 'Attesa rivincita...'
                      : game.rematchRequestedBy
                        ? 'Accetta rivincita'
                        : 'Rivincita'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onBackToLobby}
                  className="px-3.5 py-2 rounded bg-[#3C3A36] hover:bg-[#4B4843] text-[#E5E4E2] text-xs font-bold whitespace-nowrap"
                >
                  Nuova partita
                </button>
              </div>
            </div>
          )}

          {/* Incoming Draw Offer */}
          {incomingDrawOffer && (
            <div className="px-3.5 py-2.5 bg-[#2E2B27] border-b border-[#3C3A36] flex items-center justify-between gap-2">
              <span className="text-xs text-white font-semibold">
                {opponent.username} propone patta
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onRespondDraw(true)}
                  className="px-2.5 py-1 rounded bg-[#81B64C] text-white text-xs font-bold"
                >
                  Accetta
                </button>
                <button
                  type="button"
                  onClick={() => onRespondDraw(false)}
                  className="px-2.5 py-1 rounded bg-[#3C3A36] text-[#DAD9D7] text-xs font-semibold"
                >
                  No
                </button>
              </div>
            </div>
          )}

          {/* Real Engine Move Evaluation Bar */}
          {inspectedMove && (
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
                    {inspectedMeta ? inspectedMeta.subtitle : 'Leggermente inferiore alla migliore'}
                  </p>
                </div>
              </div>
              {inspectedMove.quality !== 'book' &&
                typeof inspectedMove.cpLoss === 'number' &&
                inspectedMove.cpLoss > 0 && (
                  <span className="text-[11px] font-mono-tabular text-[#9E9D9A] shrink-0">
                    -{(inspectedMove.cpLoss / 100).toFixed(1)}
                  </span>
                )}
            </div>
          )}

          {/* Chess.com 2-Column Alternating Move List */}
          <div className="h-[170px] overflow-y-auto font-mono-tabular text-xs">
            {movePairs.length === 0 ? (
              <p className="text-[#8B8987] text-center py-10 font-sans">
                Fai la prima mossa sulla scacchiera
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
                        onClick={() =>
                          setViewMoveIndex(
                            pair.white!.idx === game.moves.length - 1 ? null : pair.white!.idx
                          )
                        }
                        className={`col-span-5 text-left px-2 py-0.5 rounded inline-flex items-center justify-between gap-1 ${
                          (viewMoveIndex === null && pair.white.idx === game.moves.length - 1) ||
                          viewMoveIndex === pair.white.idx
                            ? 'bg-[#48453F] text-white font-bold'
                            : 'text-[#DAD9D7] hover:bg-[#383530]'
                        }`}
                      >
                        <span className="truncate">{pair.white.move.san}</span>
                        <MoveQualityBadge quality={pair.white.move.quality} size="sm" />
                      </button>
                    )}
                    {pair.black && (
                      <button
                        type="button"
                        onClick={() =>
                          setViewMoveIndex(
                            pair.black!.idx === game.moves.length - 1 ? null : pair.black!.idx
                          )
                        }
                        className={`col-span-5 text-left px-2 py-0.5 rounded inline-flex items-center justify-between gap-1 ${
                          (viewMoveIndex === null && pair.black.idx === game.moves.length - 1) ||
                          viewMoveIndex === pair.black.idx
                            ? 'bg-[#48453F] text-white font-bold'
                            : 'text-[#DAD9D7] hover:bg-[#383530]'
                        }`}
                      >
                        <span className="truncate">{pair.black.move.san}</span>
                        <MoveQualityBadge quality={pair.black.move.quality} size="sm" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isInspectingHistory && (
            <div className="px-3 py-1.5 bg-[#383530] border-t border-[#45433E] flex items-center justify-between text-xs text-[#F5F682]">
              <span>Mossa precedente</span>
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
                onClick={() =>
                  setViewMoveIndex((prev) => {
                    const curr = prev === null ? game.moves.length - 1 : prev;
                    return Math.max(-1, curr - 1);
                  })
                }
                disabled={game.moves.length === 0 || viewMoveIndex === -1}
                aria-label="Indietro"
                className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setViewMoveIndex((prev) => {
                    if (prev === null) return null;
                    const next = prev + 1;
                    return next >= game.moves.length - 1 ? null : next;
                  })
                }
                disabled={viewMoveIndex === null}
                aria-label="Avanti"
                className="p-1.5 rounded text-[#BABABA] hover:text-white hover:bg-[#3C3A36] disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMoveIndex(null)}
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
                <span>Frecce</span>
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
                <button
                  type="button"
                  onClick={onOfferDraw}
                  disabled={game.drawOfferBy === myColor}
                  className="px-2.5 py-1.5 rounded bg-[#302E2B] hover:bg-[#3C3A36] disabled:opacity-40 text-xs text-[#DAD9D7] font-semibold inline-flex items-center gap-1"
                >
                  <Handshake className="w-3.5 h-3.5" />
                  <span>Patta</span>
                </button>

                {!confirmResign ? (
                  <button
                    type="button"
                    onClick={() => setConfirmResign(true)}
                    className="px-2.5 py-1.5 rounded bg-[#302E2B] hover:bg-[#CA3431] text-xs text-[#DAD9D7] hover:text-white font-semibold inline-flex items-center gap-1 transition-colors"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Abbandona</span>
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
                      Conferma
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResign(false)}
                      className="px-2 py-1.5 rounded bg-[#3C3A36] text-xs text-[#DAD9D7]"
                    >
                      No
                    </button>
                  </div>
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
