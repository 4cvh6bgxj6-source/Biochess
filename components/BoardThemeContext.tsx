'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getBoardTheme,
  getPieceSet,
  type BoardThemeDef,
  type BoardThemeId,
  type PieceSetDef,
  type PieceSetId,
} from '@/lib/board-themes';

const BOARD_THEME_KEY = 'biochess_board_theme_v1';
const PIECE_SET_KEY = 'biochess_piece_set_v1';

interface BoardThemeContextValue {
  boardThemeId: BoardThemeId;
  pieceSetId: PieceSetId;
  boardTheme: BoardThemeDef;
  pieceSet: PieceSetDef;
  setBoardThemeId: (id: BoardThemeId) => void;
  setPieceSetId: (id: PieceSetId) => void;
}

const BoardThemeContext = createContext<BoardThemeContextValue>({
  boardThemeId: 'green',
  pieceSetId: 'neo',
  boardTheme: getBoardTheme('green'),
  pieceSet: getPieceSet('neo'),
  setBoardThemeId: () => {},
  setPieceSetId: () => {},
});

export function BoardThemeProvider({ children }: { children: React.ReactNode }) {
  const [boardThemeId, setBoardThemeState] = useState<BoardThemeId>('green');
  const [pieceSetId, setPieceSetState] = useState<PieceSetId>('neo');

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const savedBoard = window.localStorage.getItem(BOARD_THEME_KEY);
        if (savedBoard) {
          setBoardThemeState(getBoardTheme(savedBoard).id);
        }
        const savedPieces = window.localStorage.getItem(PIECE_SET_KEY);
        if (savedPieces) {
          setPieceSetState(getPieceSet(savedPieces).id);
        }
      } catch {
        // ignore storage errors
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const setBoardThemeId = useCallback((id: BoardThemeId) => {
    setBoardThemeState(id);
    try {
      window.localStorage.setItem(BOARD_THEME_KEY, id);
    } catch {
      // ignore storage errors
    }
  }, []);

  const setPieceSetId = useCallback((id: PieceSetId) => {
    setPieceSetState(id);
    try {
      window.localStorage.setItem(PIECE_SET_KEY, id);
    } catch {
      // ignore storage errors
    }
  }, []);

  const value = useMemo<BoardThemeContextValue>(
    () => ({
      boardThemeId,
      pieceSetId,
      boardTheme: getBoardTheme(boardThemeId),
      pieceSet: getPieceSet(pieceSetId),
      setBoardThemeId,
      setPieceSetId,
    }),
    [boardThemeId, pieceSetId, setBoardThemeId, setPieceSetId]
  );

  return <BoardThemeContext.Provider value={value}>{children}</BoardThemeContext.Provider>;
}

export function useBoardStyle() {
  return useContext(BoardThemeContext);
}
