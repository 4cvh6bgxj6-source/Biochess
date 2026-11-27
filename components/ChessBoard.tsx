'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import { motion } from 'motion/react';
import { getBoardTheme, type BoardThemeId, type PieceSetId } from '@/lib/board-themes';
import type { GameMove, MoveQuality, PieceColor } from '@/lib/types';
import { soundFX } from '@/lib/sound';
import { useBoardStyle } from './BoardThemeContext';
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

export interface PremoveItem {
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

interface ChessBoardProps {
  fen: string;
  moves?: GameMove[];
  activeMoveCount?: number;
  orientation: PieceColor;
  canInteract: boolean;
  canPremove?: boolean;
  playerColor: PieceColor | null;
  premoves?: PremoveItem[];
  onPremovesChange?: (premoves: PremoveItem[]) => void;
  lastMove?: { from: string; to: string; quality?: MoveQuality } | null;
  arrowMode?: boolean;
  arrows?: BoardArrow[];
  highlights?: BoardHighlight[];
  onArrowsChange?: (arrows: BoardArrow[]) => void;
  onHighlightsChange?: (highlights: BoardHighlight[]) => void;
  onMove: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => void;
  boardThemeId?: BoardThemeId;
  pieceSetId?: PieceSetId;
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

function boardFallbackPieces(chess: Chess): TrackedPiece[] {
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

function trackPiecesFromMoves(
  chess: Chess,
  moves?: GameMove[],
  activeMoveCount?: number
): TrackedPiece[] {
  if (!moves) {
    return boardFallbackPieces(chess);
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

  // Verify tracked map matches authoritative FEN board (guards against optimistic/Firestore moves subcollection lag)
  const board = chess.board();
  let pieceCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sqPiece = board[r][c];
      const sqName = `${FILES[c]}${8 - r}`;
      const tracked = map.get(sqName);
      if (sqPiece) {
        pieceCount++;
        if (!tracked || tracked.color !== sqPiece.color || tracked.type !== sqPiece.type) {
          return boardFallbackPieces(chess);
        }
      } else if (tracked) {
        return boardFallbackPieces(chess);
      }
    }
  }
  if (pieceCount !== map.size) {
    return boardFallbackPieces(chess);
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

type BoardCellPiece = { type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'; color: PieceColor } | null;

function squareToRowCol(square: string): { row: number; col: number } | null {
  if (square.length !== 2) return null;
  const col = FILES.indexOf(square[0]);
  const rank = parseInt(square[1], 10);
  if (col < 0 || Number.isNaN(rank) || rank < 1 || rank > 8) return null;
  return { row: 8 - rank, col };
}

function rowColToSquare(row: number, col: number): string | null {
  if (row < 0 || row > 7 || col < 0 || col > 7) return null;
  return `${FILES[col]}${8 - row}`;
}

function buildProjectedPremoveState(
  rawBoard: ReturnType<Chess['board']>,
  premoves: PremoveItem[],
  playerColor: PieceColor | null
) {
  const projected: BoardCellPiece[][] = rawBoard.map((row) =>
    row.map((cell) =>
      cell ? { type: cell.type as 'p' | 'n' | 'b' | 'r' | 'q' | 'k', color: cell.color } : null
    )
  );
  const premoveSquares = new Set<string>();
  const movedRealOriginals = new Set<string>();
  const premovedDestPieces = new Map<string, { type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'; color: PieceColor }>();

  if (!playerColor || premoves.length === 0) {
    return { projected, premoveSquares, movedRealOriginals, premovedDestPieces };
  }

  for (const pm of premoves) {
    const fromRC = squareToRowCol(pm.from);
    const toRC = squareToRowCol(pm.to);
    if (!fromRC || !toRC) break;
    const piece = projected[fromRC.row]?.[fromRC.col];
    if (!piece || piece.color !== playerColor) break;

    if (!premovedDestPieces.has(pm.from)) {
      movedRealOriginals.add(pm.from);
    } else {
      premovedDestPieces.delete(pm.from);
    }

    projected[fromRC.row][fromRC.col] = null;

    // En passant premove heuristic
    if (piece.type === 'p' && fromRC.col !== toRC.col && !projected[toRC.row][toRC.col]) {
      projected[fromRC.row][toRC.col] = null;
    }

    const nextPiece = {
      type: (pm.promotion || piece.type) as 'p' | 'n' | 'b' | 'r' | 'q' | 'k',
      color: piece.color,
    };
    projected[toRC.row][toRC.col] = nextPiece;
    premovedDestPieces.set(pm.to, nextPiece);

    if (piece.type === 'k') {
      const moveRook = (rFromSq: string, rToSq: string) => {
        const rf = squareToRowCol(rFromSq);
        const rt = squareToRowCol(rToSq);
        if (!rf || !rt) return;
        const rook = projected[rf.row]?.[rf.col];
        if (rook && rook.type === 'r' && rook.color === piece.color) {
          if (!premovedDestPieces.has(rFromSq)) {
            movedRealOriginals.add(rFromSq);
          } else {
            premovedDestPieces.delete(rFromSq);
          }
          projected[rf.row][rf.col] = null;
          projected[rt.row][rt.col] = rook;
          premovedDestPieces.set(rToSq, rook);
        }
      };
      if (pm.from === 'e1' && pm.to === 'g1') moveRook('h1', 'f1');
      else if (pm.from === 'e1' && pm.to === 'c1') moveRook('a1', 'd1');
      else if (pm.from === 'e8' && pm.to === 'g8') moveRook('h8', 'f8');
      else if (pm.from === 'e8' && pm.to === 'c8') moveRook('a8', 'd8');
    }

    premoveSquares.add(pm.from);
    premoveSquares.add(pm.to);
  }

  return { projected, premoveSquares, movedRealOriginals, premovedDestPieces };
}

function getPseudoLegalPremoveTargets(
  projected: BoardCellPiece[][],
  fromSquare: string,
  playerColor: PieceColor,
  chess: Chess
): Map<string, boolean> {
  const targets = new Map<string, boolean>();
  const rc = squareToRowCol(fromSquare);
  if (!rc) return targets;
  const piece = projected[rc.row]?.[rc.col];
  if (!piece || piece.color !== playerColor) return targets;

  const addSquare = (r: number, c: number) => {
    const sq = rowColToSquare(r, c);
    if (!sq || sq === fromSquare) return;
    const occ = projected[r]?.[c];
    targets.set(sq, Boolean(occ && occ.color !== playerColor));
  };

  const addRay = (dr: number, dc: number) => {
    for (let step = 1; step < 8; step++) {
      const nr = rc.row + dr * step;
      const nc = rc.col + dc * step;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
      addSquare(nr, nc);
    }
  };

  if (piece.type === 'p') {
    const dir = piece.color === 'w' ? -1 : 1;
    addSquare(rc.row + dir, rc.col);
    const isStartRank =
      (piece.color === 'w' && rc.row === 6) || (piece.color === 'b' && rc.row === 1);
    if (isStartRank) {
      addSquare(rc.row + dir * 2, rc.col);
    }
    addSquare(rc.row + dir, rc.col - 1);
    addSquare(rc.row + dir, rc.col + 1);
  } else if (piece.type === 'n') {
    const jumps = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (const [dr, dc] of jumps) {
      addSquare(rc.row + dr, rc.col + dc);
    }
  } else if (piece.type === 'b') {
    addRay(-1, -1);
    addRay(-1, 1);
    addRay(1, -1);
    addRay(1, 1);
  } else if (piece.type === 'r') {
    addRay(-1, 0);
    addRay(1, 0);
    addRay(0, -1);
    addRay(0, 1);
  } else if (piece.type === 'q') {
    addRay(-1, -1);
    addRay(-1, 1);
    addRay(1, -1);
    addRay(1, 1);
    addRay(-1, 0);
    addRay(1, 0);
    addRay(0, -1);
    addRay(0, 1);
  } else if (piece.type === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        addSquare(rc.row + dr, rc.col + dc);
      }
    }
    const rights = chess.getCastlingRights(playerColor);
    if (playerColor === 'w' && fromSquare === 'e1') {
      const h1 = projected[7]?.[7];
      const a1 = projected[7]?.[0];
      if (rights.k && h1?.type === 'r' && h1.color === 'w') targets.set('g1', false);
      if (rights.q && a1?.type === 'r' && a1.color === 'w') targets.set('c1', false);
    } else if (playerColor === 'b' && fromSquare === 'e8') {
      const h8 = projected[0]?.[7];
      const a8 = projected[0]?.[0];
      if (rights.k && h8?.type === 'r' && h8.color === 'b') targets.set('g8', false);
      if (rights.q && a8?.type === 'r' && a8.color === 'b') targets.set('c8', false);
    }
  }

  return targets;
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
  canPremove = false,
  playerColor,
  premoves: controlledPremoves,
  onPremovesChange,
  lastMove,
  arrowMode = false,
  arrows: controlledArrows,
  highlights: controlledHighlights,
  onArrowsChange,
  onHighlightsChange,
  onMove,
  boardThemeId: boardThemeOverride,
  pieceSetId: pieceSetOverride,
}: ChessBoardProps) {
  const { boardTheme: ctxBoardTheme } = useBoardStyle();
  const boardTheme = boardThemeOverride ? getBoardTheme(boardThemeOverride) : ctxBoardTheme;
  const boardRef = useRef<HTMLDivElement>(null);
  const justDrewRef = useRef(false);
  const justHandledPointerUpRef = useRef(false);
  const markPointerUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTapMoveRef = useRef<{ from: string; to: string; pointerId: number } | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [pointerDrag, setPointerDrag] = useState<{
    from: string;
    pieceType: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
    pieceColor: PieceColor;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    hoverSquare: string | null;
    active: boolean;
    pointerId: number;
  } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
    color: PieceColor;
    isPremove?: boolean;
  } | null>(null);

  const [internalArrows, setInternalArrows] = useState<BoardArrow[]>([]);
  const [internalHighlights, setInternalHighlights] = useState<BoardHighlight[]>([]);
  const [internalPremoves, setInternalPremoves] = useState<PremoveItem[]>([]);
  const arrows = controlledArrows ?? internalArrows;
  const highlights = controlledHighlights ?? internalHighlights;
  const premoves = controlledPremoves ?? internalPremoves;

  const setArrows = (next: BoardArrow[]) => {
    if (onArrowsChange) onArrowsChange(next);
    else setInternalArrows(next);
  };

  const setHighlights = (next: BoardHighlight[]) => {
    if (onHighlightsChange) onHighlightsChange(next);
    else setInternalHighlights(next);
  };

  const setPremoves = (next: PremoveItem[]) => {
    if (onPremovesChange) onPremovesChange(next);
    else setInternalPremoves(next);
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

  const premoveModeActive = !canInteract && canPremove && playerColor !== null;

  const premoveProjected = useMemo(
    () =>
      buildProjectedPremoveState(
        board,
        premoveModeActive ? premoves : [],
        playerColor
      ),
    [board, premoves, premoveModeActive, playerColor]
  );

  useEffect(() => {
    pendingTapMoveRef.current = null;
    const t = setTimeout(() => {
      setSelectedSquare((prev) => {
        if (!prev) return null;
        const rc = squareToRowCol(prev);
        if (!rc) return null;
        if (canInteract) {
          const p = board[rc.row]?.[rc.col];
          if (p && (!playerColor || p.color === playerColor) && p.color === chess.turn()) {
            return prev;
          }
          return null;
        }
        if (premoveModeActive && playerColor) {
          const p = premoveProjected.projected[rc.row]?.[rc.col];
          if (p && p.color === playerColor) {
            return prev;
          }
        }
        return null;
      });
      setPointerDrag((prev) => {
        if (!prev) {
          setDragFrom(null);
          return null;
        }
        const rc = squareToRowCol(prev.from);
        if (!rc) {
          setDragFrom(null);
          return null;
        }
        const stillOwnPiece = canInteract
          ? (() => {
              const p = board[rc.row]?.[rc.col];
              return Boolean(
                p &&
                  p.type === prev.pieceType &&
                  p.color === prev.pieceColor &&
                  (!playerColor || p.color === playerColor) &&
                  p.color === chess.turn()
              );
            })()
          : premoveModeActive && playerColor
            ? (() => {
                const p = premoveProjected.projected[rc.row]?.[rc.col];
                return Boolean(
                  p && p.type === prev.pieceType && p.color === prev.pieceColor && p.color === playerColor
                );
              })()
            : false;
        if (!stillOwnPiece) {
          setDragFrom(null);
          return null;
        }
        return prev;
      });
    }, 0);
    return () => clearTimeout(t);
  }, [fen, board, chess, canInteract, premoveModeActive, playerColor, premoveProjected.projected]);

  useEffect(() => {
    if (premoves.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onPremovesChange) onPremovesChange([]);
        else setInternalPremoves([]);
        setSelectedSquare(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [premoves.length, onPremovesChange]);

  const legalTargets = useMemo(() => {
    const activeSquare = selectedSquare || dragFrom;
    if (!activeSquare || arrowMode) return new Map<string, boolean>();
    if (canInteract) {
      const legal = chess.moves({ square: activeSquare as Square, verbose: true });
      const map = new Map<string, boolean>();
      for (const m of legal) {
        map.set(m.to, Boolean(m.captured));
      }
      return map;
    }
    if (premoveModeActive && playerColor) {
      return getPseudoLegalPremoveTargets(
        premoveProjected.projected,
        activeSquare,
        playerColor,
        chess
      );
    }
    return new Map<string, boolean>();
  }, [
    chess,
    selectedSquare,
    dragFrom,
    canInteract,
    premoveModeActive,
    playerColor,
    premoveProjected.projected,
    arrowMode,
  ]);

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

  function cancelAllPremoves() {
    if (premoves.length > 0) {
      setPremoves([]);
    }
    setPendingPromotion((prev) => (prev?.isPremove ? null : prev));
  }

  function attemptMove(from: string, to: string) {
    if (arrowMode) return;

    if (canInteract) {
      const legal = chess.moves({ square: from as Square, verbose: true });
      const matching = legal.filter((m) => m.to === to);
      if (matching.length === 0) return;

      const isPromotion = matching.some((m) => Boolean(m.promotion));
      if (isPromotion) {
        setPendingPromotion({ from, to, color: playerColor || chess.turn(), isPremove: false });
        setSelectedSquare(null);
        setDragFrom(null);
        setPointerDrag(null);
        return;
      }

      clearAnnotations();
      setSelectedSquare(null);
      setDragFrom(null);
      setPointerDrag(null);
      onMove(from, to);
      return;
    }

    if (premoveModeActive && playerColor) {
      const rc = squareToRowCol(from);
      const piece = rc ? premoveProjected.projected[rc.row]?.[rc.col] : null;
      if (!piece || piece.color !== playerColor) return;
      const targets = getPseudoLegalPremoveTargets(
        premoveProjected.projected,
        from,
        playerColor,
        chess
      );
      if (!targets.has(to)) return;

      const isPromotion =
        piece.type === 'p' &&
        ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));

      if (isPromotion) {
        setPendingPromotion({ from, to, color: playerColor, isPremove: true });
        setSelectedSquare(null);
        setDragFrom(null);
        setPointerDrag(null);
        return;
      }

      clearAnnotations();
      setSelectedSquare(null);
      setDragFrom(null);
      setPointerDrag(null);
      if (premoves.length < 5) {
        setPremoves([...premoves, { from, to }]);
        soundFX.playPremove();
      }
    }
  }

  function getEffectivePieceAt(square: string): BoardCellPiece {
    const rc = squareToRowCol(square);
    if (!rc) return null;
    if (premoveModeActive) {
      return premoveProjected.projected[rc.row]?.[rc.col] || null;
    }
    const p = board[rc.row]?.[rc.col];
    return p ? { type: p.type, color: p.color } : null;
  }

  function handleSquareClick(square: string) {
    if (justHandledPointerUpRef.current) {
      justHandledPointerUpRef.current = false;
      return;
    }
    if (justDrewRef.current) {
      justDrewRef.current = false;
      return;
    }
    if (arrowMode) return;

    if (!canInteract && !premoveModeActive) {
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

    const effPiece = getEffectivePieceAt(square);
    const canSelectPiece = canInteract
      ? Boolean(effPiece && (!playerColor || effPiece.color === playerColor) && effPiece.color === chess.turn())
      : Boolean(effPiece && playerColor && effPiece.color === playerColor);

    if (canSelectPiece) {
      setSelectedSquare(square);
    } else {
      clearAnnotations();
      setSelectedSquare(null);
      if (premoveModeActive) {
        cancelAllPremoves();
      }
    }
  }

  function getMovablePieceAt(square: string): { type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'; color: PieceColor } | null {
    if (arrowMode) return null;
    const rc = squareToRowCol(square);
    if (!rc) return null;
    if (canInteract) {
      const p = board[rc.row]?.[rc.col];
      if (p && (!playerColor || p.color === playerColor) && p.color === chess.turn()) {
        return { type: p.type, color: p.color };
      }
      return null;
    }
    if (premoveModeActive && playerColor) {
      const p = premoveProjected.projected[rc.row]?.[rc.col];
      if (p && p.color === playerColor) {
        return { type: p.type, color: p.color };
      }
    }
    return null;
  }

  function markPointerUpHandled() {
    justHandledPointerUpRef.current = true;
    if (markPointerUpTimeoutRef.current) {
      clearTimeout(markPointerUpTimeoutRef.current);
    }
    markPointerUpTimeoutRef.current = setTimeout(() => {
      justHandledPointerUpRef.current = false;
      markPointerUpTimeoutRef.current = null;
    }, 120);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    justDrewRef.current = false;
    justHandledPointerUpRef.current = false;
    if (markPointerUpTimeoutRef.current) {
      clearTimeout(markPointerUpTimeoutRef.current);
      markPointerUpTimeoutRef.current = null;
    }
    pendingTapMoveRef.current = null;
    soundFX.unlock();
    const sq = getSquareFromClientPos(e.clientX, e.clientY);
    if (!sq) return;

    // Right-click cancels active premoves first (Chess.com behavior), otherwise draws arrows/highlights
    if (e.button === 2) {
      e.preventDefault();
      if (premoveModeActive && premoves.length > 0) {
        cancelAllPremoves();
        setSelectedSquare(null);
        markPointerUpHandled();
        return;
      }
      setDrawingState({ from: sq, to: sq, color: pickArrowColor(e), button: 2 });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 0 || e.pointerType !== 'mouse') {
      if (arrowMode) {
        e.preventDefault();
        setDrawingState({ from: sq, to: sq, color: pickArrowColor(e), button: 0 });
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      if ((canInteract || premoveModeActive) && selectedSquare && legalTargets.has(sq)) {
        pendingTapMoveRef.current = { from: selectedSquare, to: sq, pointerId: e.pointerId };
        return;
      }

      const movable = getMovablePieceAt(sq);
      if (movable && boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        e.currentTarget.setPointerCapture(e.pointerId);
        setPointerDrag({
          from: sq,
          pieceType: movable.type,
          pieceColor: movable.color,
          startX: e.clientX,
          startY: e.clientY,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          hoverSquare: sq,
          active: false,
          pointerId: e.pointerId,
        });
        return;
      }

      if (e.pointerType === 'mouse') {
        setDrawingState({ from: sq, to: sq, color: pickArrowColor(e), button: 0 });
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerDrag && e.pointerId === pointerDrag.pointerId) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dist = Math.hypot(e.clientX - pointerDrag.startX, e.clientY - pointerDrag.startY);
      const active = pointerDrag.active || dist > 6;
      if (active && !pointerDrag.active) {
        setSelectedSquare(pointerDrag.from);
        setDragFrom(pointerDrag.from);
      }
      const hoverSquare = getSquareFromClientPos(e.clientX, e.clientY);
      setPointerDrag({
        ...pointerDrag,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        hoverSquare,
        active,
      });
      return;
    }

    if (!drawingState) return;
    const sq = getSquareFromClientPos(e.clientX, e.clientY);
    if (sq && sq !== drawingState.to) {
      setDrawingState({ ...drawingState, to: sq });
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerDrag && e.pointerId === pointerDrag.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      markPointerUpHandled();
      const dropSq = getSquareFromClientPos(e.clientX, e.clientY);

      if (pointerDrag.active) {
        if (dropSq && dropSq !== pointerDrag.from) {
          if (canInteract) {
            const legal = chess.moves({ square: pointerDrag.from as Square, verbose: true });
            if (legal.some((m) => m.to === dropSq)) {
              attemptMove(pointerDrag.from, dropSq);
              return;
            }
          } else if (premoveModeActive && playerColor) {
            const targets = getPseudoLegalPremoveTargets(
              premoveProjected.projected,
              pointerDrag.from,
              playerColor,
              chess
            );
            if (targets.has(dropSq)) {
              attemptMove(pointerDrag.from, dropSq);
              return;
            }
          }
        }
        setDragFrom(null);
        setPointerDrag(null);
        return;
      }

      // Crisp tap (< 6px drag)
      const tappedSq = pointerDrag.from;
      setDragFrom(null);
      setPointerDrag(null);
      if (selectedSquare === tappedSq) {
        setSelectedSquare(null);
      } else {
        setSelectedSquare(tappedSq);
      }
      return;
    }

    if (pendingTapMoveRef.current && e.pointerId === pendingTapMoveRef.current.pointerId) {
      const pending = pendingTapMoveRef.current;
      pendingTapMoveRef.current = null;
      const upSq = getSquareFromClientPos(e.clientX, e.clientY);
      if (upSq === pending.to) {
        markPointerUpHandled();
        attemptMove(pending.from, pending.to);
        return;
      }
    }

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
    } else if (drawingState.button === 0 && drawingState.from === endSq && premoveModeActive && premoves.length > 0) {
      // Left-clicking an empty/opponent square cancels active premoves
      justDrewRef.current = true;
      cancelAllPremoves();
      setSelectedSquare(null);
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
      onPointerCancel={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        pendingTapMoveRef.current = null;
        setDrawingState(null);
        setPointerDrag(null);
        setDragFrom(null);
      }}
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
            const isDragHoverTarget = Boolean(
              pointerDrag?.active && pointerDrag.hoverSquare === square && isLegalTarget
            );
            const isPremoveSquare = premoveProjected.premoveSquares.has(square);
            const userHighlight = highlights.find((h) => h.square === square);

            const showRankLabel = fIdx === 0;
            const showFileLabel = rIdx === 7;

            const squareColor =
              isSelected || isLastMove
                ? isLight
                  ? boardTheme.highlightLight
                  : boardTheme.highlightDark
                : isLight
                  ? boardTheme.light
                  : boardTheme.dark;

            const squareTexture =
              !isSelected && !isLastMove
                ? isLight
                  ? boardTheme.lightTexture
                  : boardTheme.darkTexture
                : undefined;

            const coordColor = isLight ? boardTheme.dark : boardTheme.light;

            return (
              <button
                key={square}
                type="button"
                aria-label={`Casella ${square}${piece ? ` (${piece.type})` : ''}`}
                onClick={() => handleSquareClick(square)}
                style={{
                  backgroundColor: squareColor,
                  backgroundImage: squareTexture,
                  backgroundSize: boardTheme.id === 'sand' ? '12px 12px' : undefined,
                }}
                className={`relative flex items-center justify-center w-full h-full p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#81B64C] ${
                  isDragHoverTarget ? 'ring-2 sm:ring-3 ring-inset ring-white/75' : ''
                }`}
              >
                {userHighlight && (
                  <span
                    className={`absolute inset-0 pointer-events-none ${HIGHLIGHT_RGBA[userHighlight.color]}`}
                    aria-hidden="true"
                  />
                )}

                {isPremoveSquare && (
                  <span
                    className="absolute inset-0 pointer-events-none bg-[#EB6150]/65"
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
                    style={{ color: coordColor }}
                    className="absolute top-0.5 left-1 text-[11px] font-bold leading-none pointer-events-none"
                  >
                    {rank}
                  </span>
                )}

                {showFileLabel && (
                  <span
                    style={{ color: coordColor }}
                    className="absolute bottom-0.5 right-1 text-[11px] font-bold leading-none pointer-events-none"
                  >
                    {file}
                  </span>
                )}

                {isLastMoveDest && lastMove?.quality && (
                  <span className="absolute top-0.5 right-0.5 z-30 pointer-events-none">
                    <MoveQualityBadge quality={lastMove.quality} size="board" />
                  </span>
                )}

                {isLegalTarget && !isCaptureTarget && (
                  <span
                    className={`absolute z-20 w-[30%] h-[30%] rounded-full pointer-events-none ${
                      premoveModeActive ? 'bg-[#EB6150]/60' : 'bg-black/18'
                    }`}
                    aria-hidden="true"
                  />
                )}

                {isLegalTarget && isCaptureTarget && (
                  <span
                    className={`absolute z-20 inset-[6%] rounded-full border-[5px] pointer-events-none ${
                      premoveModeActive ? 'border-[#EB6150]/70' : 'border-black/20'
                    }`}
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
          const isVacatedByPremove =
            premoveModeActive && premoveProjected.movedRealOriginals.has(p.square);
          const canDragPiece =
            !arrowMode &&
            (canInteract
              ? (!playerColor || p.color === playerColor) && p.color === chess.turn()
              : premoveModeActive && !isVacatedByPremove && p.color === playerColor);
          const isBeingDragged = Boolean(pointerDrag?.active && pointerDrag.from === p.square);

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
              className={`absolute top-0 left-0 w-[12.5%] h-[12.5%] p-[1%] ${
                isBeingDragged ? 'opacity-0' : isVacatedByPremove ? 'opacity-35' : ''
              }`}
            >
              <div
                onClick={() => handleSquareClick(p.square)}
                className={`w-full h-full flex items-center justify-center ${
                  arrowMode ? 'pointer-events-none cursor-crosshair' : 'pointer-events-auto'
                } ${
                  canDragPiece
                    ? 'cursor-grab active:cursor-grabbing'
                    : (canInteract || premoveModeActive) && !arrowMode
                      ? 'cursor-pointer'
                      : 'cursor-default'
                }`}
              >
                <ChessPiece type={p.type} color={p.color} pieceSet={pieceSetOverride} />
              </div>
            </motion.div>
          );
        })}

        {/* Projected Premove Destination Ghost Pieces */}
        {premoveModeActive &&
          Array.from(premoveProjected.premovedDestPieces.entries()).map(([sq, gp]) => {
            const { row, col } = squareToGridCoords(sq, orientation);
            const isBeingDragged = Boolean(pointerDrag?.active && pointerDrag.from === sq);
            return (
              <div
                key={`premove-ghost-${sq}`}
                style={{
                  transform: `translate(${col * 100}%, ${row * 100}%)`,
                }}
                className={`absolute top-0 left-0 w-[12.5%] h-[12.5%] p-[1%] z-[15] pointer-events-none ${
                  isBeingDragged ? 'opacity-0' : 'opacity-90'
                }`}
              >
                <div className="w-full h-full flex items-center justify-center pointer-events-none">
                  <ChessPiece type={gp.type} color={gp.color} pieceSet={pieceSetOverride} />
                </div>
              </div>
            );
          })}
      </div>

      {/* Unified Floating Dragged Piece (Desktop Mouse + Mobile Touch) */}
      {pointerDrag?.active && (
        <div
          style={{
            left: `${pointerDrag.offsetX}px`,
            top: `${pointerDrag.offsetY}px`,
            transform: 'translate(-50%, -58%) scale(1.12)',
          }}
          className="absolute w-[12.5%] h-[12.5%] pointer-events-none z-30 drop-shadow-xl"
          aria-hidden="true"
        >
          <ChessPiece
            type={pointerDrag.pieceType}
            color={pointerDrag.pieceColor}
            pieceSet={pieceSetOverride}
          />
        </div>
      )}

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
                    if (pendingPromotion.isPremove && !canInteract) {
                      if (premoveModeActive && premoves.length < 5) {
                        setPremoves([
                          ...premoves,
                          {
                            from: pendingPromotion.from,
                            to: pendingPromotion.to,
                            promotion: promo,
                          },
                        ]);
                        soundFX.playPremove();
                      }
                    } else if (canInteract) {
                      const legal = chess.moves({
                        square: pendingPromotion.from as Square,
                        verbose: true,
                      });
                      if (legal.some((m) => m.to === pendingPromotion.to && m.promotion === promo)) {
                        onMove(pendingPromotion.from, pendingPromotion.to, promo);
                      }
                    }
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
                  <ChessPiece type={promo} color={pendingPromotion.color} pieceSet={pieceSetOverride} />
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
