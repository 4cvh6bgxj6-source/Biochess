'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import { motion } from 'motion/react';
import type { GameMove, MoveQuality, PieceColor } from '@/lib/types';
import { ChessPiece } from './ChessPiece';
import { MoveQualityBadge } from './MoveQualityBadge';

export type ArrowColor = 'orange' | 'green' | 'blue' | 'red';

export interface BoardArrow {
  from: string;
  to: string;
  color: ArrowColor;
}

export interface BoardHighlight {
  square: string;
  color: ArrowColor;
}

interface ChessBoardProps {
  fen: string;
  moves?: GameMove[];
  activeMoveCount?: number;
  orientation: PieceColor;
  canInteract: boolean;
  playerColor: PieceColor | null;
  lastMove?: { from: string; to: string; quality?: MoveQuality } | null;
  arrowMode?: boolean;
  arrows?: BoardArrow[];
  highlights?: BoardHighlight[];
  onArrowsChange?: (arrows: BoardArrow[]) => void;
  onHighlightsChange?: (highlights: BoardHighlight[]) => void;
  onMove: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => void;
}

interface TrackedPiece {
  id: string;
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: PieceColor;
  square: string;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const ARROW_RGBA: Record<ArrowColor, string> = {
  orange: 'rgba(255, 170, 0, 0.85)',
  green: 'rgba(129, 182, 76, 0.88)',
  blue: 'rgba(92, 139, 176, 0.88)',
  red: 'rgba(235, 97, 80, 0.88)',
};

const HIGHLIGHT_RGBA: Record<ArrowColor, string> = {
  orange: 'bg-[#EB6150]/75',
  green: 'bg-[#81B64C]/70',
  blue: 'bg-[#5C8BB0]/75',
  red: 'bg-[#EB6150]/80',
};

function buildInitialPieces(): Map<string, TrackedPiece> {
  const map = new Map<string, TrackedPiece>();
  const backRank: Array<'r' | 'n' | 'b' | 'q' | 'k' | 'b' | 'n' | 'r'> = [
    'r',
    'n',
    'b',
    'q',
    'k',
    'b',
    'n',
    'r',
  ];
  for (let i = 0; i < 8; i++) {
    const f = FILES[i];
    map.set(`${f}1`, { id: `w_${backRank[i]}_${f}1`, type: backRank[i], color: 'w', square: `${f}1` });
    map.set(`${f}2`, { id: `w_p_${f}2`, type: 'p', color: 'w', square: `${f}2` });
    map.set(`${f}7`, { id: `b_p_${f}7`, type: 'p', color: 'b', square: `${f}7` });
    map.set(`${f}8`, { id: `b_${backRank[i]}_${f}8`, type: backRank[i], color: 'b', square: `${f}8` });
  }
  return map;
}

function trackPiecesFromMoves(
  chess: Chess,
  moves?: GameMove[],
  activeMoveCount?: number
): TrackedPiece[] {
  if (!moves) {
    const list: TrackedPiece[] = [];
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = board[r][c];
        if (!sq) continue;
        const square = `${FILES[c]}${8 - r}`;
        list.push({ id: `${sq.color}_${sq.type}_${square}`, type: sq.type, color: sq.color, square });
      }
    }
    return list;
  }

  const limit = typeof activeMoveCount === 'number' ? activeMoveCount : moves.length;
  const map = buildInitialPieces();

  for (let i = 0; i < limit; i++) {
    const m = moves[i];
    if (!m) break;
    const moving = map.get(m.from);
    if (!moving) continue;

    if (moving.type === 'p' && m.from[0] !== m.to[0] && !map.has(m.to)) {
      map.delete(`${m.to[0]}${m.from[1]}`);
    }

    map.delete(m.from);
    map.delete(m.to);
    map.set(m.to, {
      ...moving,
      type: (m.promotion as PieceSymbol | undefined) || moving.type,
      square: m.to,
    });

    if (moving.type === 'k') {
      if (m.from === 'e1' && m.to === 'g1') {
        const rook = map.get('h1');
        if (rook) {
          map.delete('h1');
          map.set('f1', { ...rook, square: 'f1' });
        }
      } else if (m.from === 'e1' && m.to === 'c1') {
        const rook = map.get('a1');
        if (rook) {
          map.delete('a1');
          map.set('d1', { ...rook, square: 'd1' });
        }
      } else if (m.from === 'e8' && m.to === 'g8') {
        const rook = map.get('h8');
        if (rook) {
          map.delete('h8');
          map.set('f8', { ...rook, square: 'f8' });
        }
      } else if (m.from === 'e8' && m.to === 'c8') {
        const rook = map.get('a8');
        if (rook) {
          map.delete('a8');
          map.set('d8', { ...rook, square: 'd8' });
        }
      }
    }
  }

  return Array.from(map.values());
}

function squareToGridCoords(square: string, orientation: PieceColor): { row: number; col: number } {
  const fileIdx = FILES.indexOf(square[0]);
  const rankNum = parseInt(square[1], 10);
  const row = orientation === 'w' ? 8 - rankNum : rankNum - 1;
  const col = orientation === 'w' ? fileIdx : 7 - fileIdx;
  return { row, col };
}

function coordsToSquare(row: number, col: number, orientation: PieceColor): string | null {
  if (row < 0 || row > 7 || col < 0 || col > 7) return null;
  const fileIdx = orientation === 'w' ? col : 7 - col;
  const rankNum = orientation === 'w' ? 8 - row : row + 1;
  return `${FILES[fileIdx]}${rankNum}`;
}

function pickArrowColor(e: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean }): ArrowColor {
  if (e.shiftKey) return 'green';
  if (e.altKey) return 'blue';
  if (e.ctrlKey) return 'red';
  return 'orange';
}

function ArrowShape({
  arrow,
  orientation,
  isPreview,
}: {
  arrow: BoardArrow;
  orientation: PieceColor;
  isPreview?: boolean;
}) {
  const fromCoords = squareToGridCoords(arrow.from, orientation);
  const toCoords = squareToGridCoords(arrow.to, orientation);

  const x1 = fromCoords.col * 100 + 50;
  const y1 = fromCoords.row * 100 + 50;
  const x2 = toCoords.col * 100 + 50;
  const y2 = toCoords.row * 100 + 50;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  const color = ARROW_RGBA[arrow.color];
  const opacity = isPreview ? 0.65 : 1;

  // Knight L-shaped Chess.com arrow
  const isKnightMove =
    (absDx === 100 && absDy === 200) || (absDx === 200 && absDy === 100);

  if (isKnightMove) {
    const cornerX = absDy === 200 ? x1 : x2;
    const cornerY = absDy === 200 ? y2 : y1;

    const firstDx = cornerX - x1;
    const firstDy = cornerY - y1;
    const firstLen = Math.hypot(firstDx, firstDy) || 1;
    const startX = x1 + (firstDx / firstLen) * 18;
    const startY = y1 + (firstDy / firstLen) * 18;

    const secondDx = x2 - cornerX;
    const secondDy = y2 - cornerY;
    const secondLen = Math.hypot(secondDx, secondDy) || 1;
    const ux = secondDx / secondLen;
    const uy = secondDy / secondLen;

    const tipX = x2 - ux * 10;
    const tipY = y2 - uy * 10;
    const shaftEndX = tipX - ux * 28;
    const shaftEndY = tipY - uy * 28;

    const perpX = -uy;
    const perpY = ux;
    const headBaseX = tipX - ux * 32;
    const headBaseY = tipY - uy * 32;

    const p1 = `${tipX},${tipY}`;
    const p2 = `${headBaseX + perpX * 22},${headBaseY + perpY * 22}`;
    const p3 = `${headBaseX - perpX * 22},${headBaseY - perpY * 22}`;

    return (
      <g opacity={opacity}>
        <polyline
          points={`${startX},${startY} ${cornerX},${cornerY} ${shaftEndX},${shaftEndY}`}
          fill="none"
          stroke={color}
          strokeWidth="19"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points={`${p1} ${p2} ${p3}`} fill={color} />
      </g>
    );
  }

  const len = Math.hypot(dx, dy);
  if (len < 10) return null;

  const ux = dx / len;
  const uy = dy / len;
  const perpX = -uy;
  const perpY = ux;

  const startX = x1 + ux * 18;
  const startY = y1 + uy * 18;
  const tipX = x2 - ux * 10;
  const tipY = y2 - uy * 10;
  const shaftEndX = tipX - ux * 28;
  const shaftEndY = tipY - uy * 28;
  const headBaseX = tipX - ux * 32;
  const headBaseY = tipY - uy * 32;

  const p1 = `${tipX},${tipY}`;
  const p2 = `${headBaseX + perpX * 22},${headBaseY + perpY * 22}`;
  const p3 = `${headBaseX - perpX * 22},${headBaseY - perpY * 22}`;

  return (
    <g opacity={opacity}>
      <line
        x1={startX}
        y1={startY}
        x2={shaftEndX}
        y2={shaftEndY}
        stroke={color}
        strokeWidth="19"
        strokeLinecap="round"
      />
      <polygon points={`${p1} ${p2} ${p3}`} fill={color} />
    </g>
  );
}

export function ChessBoard({
  fen,
  moves,
  activeMoveCount,
  orientation,
  canInteract,
  playerColor,
  lastMove,
  arrowMode = false,
  arrows: controlledArrows,
  highlights: controlledHighlights,
  onArrowsChange,
  onHighlightsChange,
  onMove,
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const justDrewRef = useRef(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
    color: PieceColor;
  } | null>(null);

  const [internalArrows, setInternalArrows] = useState<BoardArrow[]>([]);
  const [internalHighlights, setInternalHighlights] = useState<BoardHighlight[]>([]);
  const arrows = controlledArrows ?? internalArrows;
  const highlights = controlledHighlights ?? internalHighlights;

  const setArrows = (next: BoardArrow[]) => {
    if (onArrowsChange) onArrowsChange(next);
    else setInternalArrows(next);
  };

  const setHighlights = (next: BoardHighlight[]) => {
    if (onHighlightsChange) onHighlightsChange(next);
    else setInternalHighlights(next);
  };

  const [drawingState, setDrawingState] = useState<{
    from: string;
    to: string;
    color: ArrowColor;
    button: number;
  } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const board = chess.board();
  const inCheckColor = chess.inCheck() ? chess.turn() : null;

  const trackedPieces = useMemo(
    () => trackPiecesFromMoves(chess, moves, activeMoveCount),
    [chess, moves, activeMoveCount]
  );

  const legalTargets = useMemo(() => {
    const activeSquare = selectedSquare || dragFrom;
    if (!activeSquare || !canInteract || arrowMode) return new Map<string, boolean>();
    const legal = chess.moves({ square: activeSquare as Square, verbose: true });
    const map = new Map<string, boolean>();
    for (const m of legal) {
      map.set(m.to, Boolean(m.captured));
    }
    return map;
  }, [chess, selectedSquare, dragFrom, canInteract, arrowMode]);

  const orderedRanks = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const orderedFiles = orientation === 'w' ? FILES : [...FILES].reverse();

  function getSquareFromClientPos(clientX: number, clientY: number): string | null {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    return coordsToSquare(row, col, orientation);
  }

  function toggleArrow(from: string, to: string, color: ArrowColor) {
    const existsIdx = arrows.findIndex((a) => a.from === from && a.to === to);
    if (existsIdx >= 0) {
      if (arrows[existsIdx].color === color) {
        setArrows(arrows.filter((_, idx) => idx !== existsIdx));
      } else {
        setArrows(arrows.map((a, idx) => (idx === existsIdx ? { ...a, color } : a)));
      }
    } else {
      setArrows([...arrows, { from, to, color }]);
    }
  }

  function toggleHighlight(square: string, color: ArrowColor) {
    const existsIdx = highlights.findIndex((h) => h.square === square);
    if (existsIdx >= 0) {
      if (highlights[existsIdx].color === color) {
        setHighlights(highlights.filter((_, idx) => idx !== existsIdx));
      } else {
        setHighlights(highlights.map((h, idx) => (idx === existsIdx ? { ...h, color } : h)));
      }
    } else {
      setHighlights([...highlights, { square, color }]);
    }
  }

  function clearAnnotations() {
    if (arrows.length > 0) setArrows([]);
    if (highlights.length > 0) setHighlights([]);
  }

  function attemptMove(from: string, to: string) {
    if (!canInteract || arrowMode) return;
    const legal = chess.moves({ square: from as Square, verbose: true });
    const matching = legal.filter((m) => m.to === to);
    if (matching.length === 0) return;

    const isPromotion = matching.some((m) => Boolean(m.promotion));
    if (isPromotion) {
      setPendingPromotion({ from, to, color: playerColor || chess.turn() });
      setSelectedSquare(null);
      setDragFrom(null);
      return;
    }

    clearAnnotations();
    setSelectedSquare(null);
    setDragFrom(null);
    onMove(from, to);
  }

  function handleSquareClick(square: string, pieceColor?: PieceColor) {
    if (justDrewRef.current) {
      justDrewRef.current = false;
      return;
    }
    if (arrowMode) return;

    if (!canInteract) {
      clearAnnotations();
      setSelectedSquare(null);
      return;
    }

    if (selectedSquare && legalTargets.has(square)) {
      attemptMove(selectedSquare, square);
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (pieceColor && (!playerColor || pieceColor === playerColor) && pieceColor === chess.turn()) {
      setSelectedSquare(square);
    } else {
      clearAnnotations();
      setSelectedSquare(null);
    }
  }

  function isMovablePieceAt(square: string): boolean {
    if (!canInteract || arrowMode) return false;
    const col = FILES.indexOf(square[0]);
    const row = 8 - parseInt(square[1], 10);
    const p = board[row]?.[col];
    return Boolean(p && (!playerColor || p.color === playerColor) && p.color === chess.turn());
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    justDrewRef.current = false;
    const sq = getSquareFromClientPos(e.clientX, e.clientY);
    if (!sq) return;

    // Right-click always draws arrows/highlights anywhere
    if (e.button === 2) {
      e.preventDefault();
      setDrawingState({ from: sq, to: sq, color: pickArrowColor(e), button: 2 });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Left-click draws arrows/highlights if Arrow Mode is ON,
    // OR if dragging from a square that does NOT have a movable piece (and isn't completing a selected move)
    if (e.button === 0) {
      if (arrowMode) {
        e.preventDefault();
        setDrawingState({ from: sq, to: sq, color: pickArrowColor(e), button: 0 });
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (!isMovablePieceAt(sq) && !(selectedSquare && legalTargets.has(sq))) {
        setDrawingState({ from: sq, to: sq, color: pickArrowColor(e), button: 0 });
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawingState) return;
    const sq = getSquareFromClientPos(e.clientX, e.clientY);
    if (sq && sq !== drawingState.to) {
      setDrawingState({ ...drawingState, to: sq });
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawingState) return;
    const endSq = getSquareFromClientPos(e.clientX, e.clientY) || drawingState.to;

    if (drawingState.button === 2 || arrowMode) {
      if (drawingState.button === 0) {
        justDrewRef.current = true;
      }
      if (drawingState.from === endSq) {
        toggleHighlight(endSq, drawingState.color);
      } else {
        toggleArrow(drawingState.from, endSq, drawingState.color);
      }
    } else if (drawingState.button === 0 && drawingState.from !== endSq) {
      // Left-dragged from non-piece square to another square -> draw arrow!
      justDrewRef.current = true;
      toggleArrow(drawingState.from, endSq, drawingState.color);
    }

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrawingState(null);
  }

  return (
    <div
      ref={boardRef}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrawingState(null)}
      className="relative w-full max-w-[600px] aspect-square select-none rounded overflow-hidden shadow-xl touch-none"
    >
      {/* 8x8 Background Squares + Interactive Targets */}
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {orderedRanks.map((rank, rIdx) =>
          orderedFiles.map((file, fIdx) => {
            const square = `${file}${rank}`;
            const boardRow = 8 - parseInt(rank, 10);
            const boardCol = FILES.indexOf(file);
            const piece = board[boardRow]?.[boardCol] || null;
            const isLight = (boardRow + boardCol) % 2 === 0;

            const isSelected = selectedSquare === square;
            const isLastMove =
              lastMove && (lastMove.from === square || lastMove.to === square);
            const isLastMoveDest = Boolean(lastMove && lastMove.to === square);
            const isCheckKing =
              piece && piece.type === 'k' && piece.color === inCheckColor;
            const isLegalTarget = legalTargets.has(square);
            const isCaptureTarget = legalTargets.get(square) === true;
            const userHighlight = highlights.find((h) => h.square === square);

            const showRankLabel = fIdx === 0;
            const showFileLabel = rIdx === 7;

            let bgClass = isLight ? 'bg-[#EEEED2]' : 'bg-[#769656]';
            if (isSelected || isLastMove) {
              bgClass = isLight ? 'bg-[#F5F682]' : 'bg-[#BACA44]';
            }

            return (
              <button
                key={square}
                type="button"
                aria-label={`Casella ${square}${piece ? ` (${piece.type})` : ''}`}
                onClick={() => handleSquareClick(square, piece?.color)}
                onDragOver={(e) => {
                  if (canInteract && !arrowMode && dragFrom) {
                    e.preventDefault();
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom && dragFrom !== square) {
                    attemptMove(dragFrom, square);
                  }
                  setDragFrom(null);
                }}
                className={`relative flex items-center justify-center w-full h-full p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#81B64C] ${bgClass}`}
              >
                {userHighlight && (
                  <span
                    className={`absolute inset-0 pointer-events-none ${HIGHLIGHT_RGBA[userHighlight.color]}`}
                    aria-hidden="true"
                  />
                )}

                {isCheckKing && (
                  <span
                    className="absolute inset-0 bg-radial from-red-600/90 via-red-600/45 to-transparent pointer-events-none"
                    aria-hidden="true"
                  />
                )}

                {showRankLabel && (
                  <span
                    className={`absolute top-0.5 left-1 text-[11px] font-bold leading-none pointer-events-none ${
                      isLight ? 'text-[#769656]' : 'text-[#EEEED2]'
                    }`}
                  >
                    {rank}
                  </span>
                )}

                {showFileLabel && (
                  <span
                    className={`absolute bottom-0.5 right-1 text-[11px] font-bold leading-none pointer-events-none ${
                      isLight ? 'text-[#769656]' : 'text-[#EEEED2]'
                    }`}
                  >
                    {file}
                  </span>
                )}

                {isLastMoveDest && lastMove?.quality && lastMove.quality !== 'neutral' && (
                  <span className="absolute top-0.5 right-0.5 z-30 pointer-events-none">
                    <MoveQualityBadge quality={lastMove.quality} size="board" />
                  </span>
                )}

                {isLegalTarget && !isCaptureTarget && (
                  <span
                    className="absolute z-20 w-[30%] h-[30%] rounded-full bg-black/18 pointer-events-none"
                    aria-hidden="true"
                  />
                )}

                {isLegalTarget && isCaptureTarget && (
                  <span
                    className="absolute z-20 inset-[6%] rounded-full border-[5px] border-black/20 pointer-events-none"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* GPU-Accelerated Smooth-Gliding Pieces Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {trackedPieces.map((p) => {
          const { row, col } = squareToGridCoords(p.square, orientation);
          const canDragPiece =
            canInteract &&
            !arrowMode &&
            (!playerColor || p.color === playerColor) &&
            p.color === chess.turn();

          return (
            <motion.div
              key={p.id}
              initial={false}
              animate={{
                x: `${col * 100}%`,
                y: `${row * 100}%`,
              }}
              transition={{
                duration: 0.16,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="absolute top-0 left-0 w-[12.5%] h-[12.5%] p-[1%]"
            >
              <div
                draggable={canDragPiece}
                onClick={() => handleSquareClick(p.square, p.color)}
                onDragOver={(e) => {
                  if (canInteract && !arrowMode && dragFrom) {
                    e.preventDefault();
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom && dragFrom !== p.square) {
                    attemptMove(dragFrom, p.square);
                  }
                  setDragFrom(null);
                }}
                onDragStart={(e) => {
                  if (!canDragPiece) {
                    e.preventDefault();
                    return;
                  }
                  setDragFrom(p.square);
                  setSelectedSquare(p.square);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', p.square);
                }}
                onDragEnd={() => setDragFrom(null)}
                className={`w-full h-full flex items-center justify-center ${
                  arrowMode ? 'pointer-events-none cursor-crosshair' : 'pointer-events-auto'
                } ${
                  canDragPiece
                    ? 'cursor-grab active:cursor-grabbing'
                    : canInteract && !arrowMode
                      ? 'cursor-pointer'
                      : 'cursor-default'
                }`}
              >
                <ChessPiece type={p.type} color={p.color} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Chess.com-style Tactical Arrows Layer */}
      {(arrows.length > 0 || (drawingState && drawingState.from !== drawingState.to)) && (
        <svg
          viewBox="0 0 800 800"
          className="absolute inset-0 w-full h-full pointer-events-none z-[25]"
          aria-hidden="true"
        >
          {arrows.map((a) => (
            <ArrowShape
              key={`${a.from}-${a.to}-${a.color}`}
              arrow={a}
              orientation={orientation}
            />
          ))}
          {drawingState && drawingState.from !== drawingState.to && (
            <ArrowShape
              arrow={{
                from: drawingState.from,
                to: drawingState.to,
                color: drawingState.color,
              }}
              orientation={orientation}
              isPreview
            />
          )}
        </svg>
      )}

      {pendingPromotion && (
        <div className="absolute inset-0 z-30 bg-black/70 rounded flex items-center justify-center p-4">
          <div className="bg-[#262421] border border-[#3C3A36] rounded-md p-4 shadow-2xl max-w-xs w-full">
            <p className="text-sm font-semibold text-white text-center mb-3">
              Promozione pedone
            </p>
            <div className="grid grid-cols-4 gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((promo) => (
                <button
                  key={promo}
                  type="button"
                  onClick={() => {
                    onMove(pendingPromotion.from, pendingPromotion.to, promo);
                    setPendingPromotion(null);
                  }}
                  className="aspect-square rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#3C3A36] p-2 flex items-center justify-center transition-colors"
                  aria-label={`Promuovi a ${
                    promo === 'q'
                      ? 'Donna'
                      : promo === 'r'
                        ? 'Torre'
                        : promo === 'b'
                          ? 'Alfiere'
                          : 'Cavallo'
                  }`}
                >
                  <ChessPiece type={promo} color={pendingPromotion.color} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPendingPromotion(null)}
              className="mt-3 w-full py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
