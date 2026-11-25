'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getBoardTheme,
  getPieceSet,
  getSoundProfile,
  type BoardThemeDef,
  type BoardThemeId,
  type PieceSetDef,
  type PieceSetId,
  type SoundProfileId,
} from '@/lib/board-themes';
import { soundFX } from '@/lib/sound';

const BOARD_THEME_KEY = 'biochess_board_theme_v1';
const PIECE_SET_KEY = 'biochess_piece_set_v1';
const SOUND_PROFILE_KEY = 'biochess_sound_profile_v1';

interface BoardThemeContextValue {
  boardThemeId: BoardThemeId;
  pieceSetId: PieceSetId;
  soundProfileId: SoundProfileId;
  boardTheme: BoardThemeDef;
  pieceSet: PieceSetDef;
  setBoardThemeId: (id: BoardThemeId) => void;
  setPieceSetId: (id: PieceSetId) => void;
  setSoundProfileId: (id: SoundProfileId) => void;
}

const BoardThemeContext = createContext<BoardThemeContextValue>({
  boardThemeId: 'green',
  pieceSetId: 'neo',
  soundProfileId: 'neo',
  boardTheme: getBoardTheme('green'),
  pieceSet: getPieceSet('neo'),
  setBoardThemeId: () => {},
  setPieceSetId: () => {},
  setSoundProfileId: () => {},
});

export function BoardThemeProvider({ children }: { children: React.ReactNode }) {
  const [boardThemeId, setBoardThemeState] = useState<BoardThemeId>('green');
  const [pieceSetId, setPieceSetState] = useState<PieceSetId>('neo');
  const [soundProfileId, setSoundProfileState] = useState<SoundProfileId>('neo');

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const savedBoard = window.localStorage.getItem(BOARD_THEME_KEY);
        const resolvedBoard = savedBoard ? getBoardTheme(savedBoard) : getBoardTheme('green');
        if (savedBoard) {
          setBoardThemeState(resolvedBoard.id);
        }

        const savedPieces = window.localStorage.getItem(PIECE_SET_KEY);
        const resolvedPieces = savedPieces ? getPieceSet(savedPieces) : getPieceSet('neo');
        if (savedPieces) {
          setPieceSetState(resolvedPieces.id);
        }

        const savedSound = window.localStorage.getItem(SOUND_PROFILE_KEY);
        const resolvedSound = savedSound
          ? getSoundProfile(savedSound)
          : resolvedPieces.id !== 'neo'
            ? resolvedPieces.soundProfile
            : resolvedBoard.soundProfile;

        setSoundProfileState(resolvedSound);
        soundFX.setProfile(resolvedSound);
      } catch {
        // ignore storage errors
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const applySoundProfile = useCallback((nextSound: SoundProfileId) => {
    setSoundProfileState(nextSound);
    soundFX.setProfile(nextSound);
    try {
      window.localStorage.setItem(SOUND_PROFILE_KEY, nextSound);
    } catch {
      // ignore storage errors
    }
  }, []);

  const setBoardThemeId = useCallback(
    (id: BoardThemeId) => {
      const def = getBoardTheme(id);
      setBoardThemeState(def.id);
      try {
        window.localStorage.setItem(BOARD_THEME_KEY, def.id);
      } catch {
        // ignore storage errors
      }
      applySoundProfile(def.soundProfile);
    },
    [applySoundProfile]
  );

  const setPieceSetId = useCallback(
    (id: PieceSetId) => {
      const def = getPieceSet(id);
      setPieceSetState(def.id);
      try {
        window.localStorage.setItem(PIECE_SET_KEY, def.id);
      } catch {
        // ignore storage errors
      }
      applySoundProfile(def.soundProfile);
    },
    [applySoundProfile]
  );

  const value = useMemo<BoardThemeContextValue>(
    () => ({
      boardThemeId,
      pieceSetId,
      soundProfileId,
      boardTheme: getBoardTheme(boardThemeId),
      pieceSet: getPieceSet(pieceSetId),
      setBoardThemeId,
      setPieceSetId,
      setSoundProfileId: applySoundProfile,
    }),
    [boardThemeId, pieceSetId, soundProfileId, setBoardThemeId, setPieceSetId, applySoundProfile]
  );

  return <BoardThemeContext.Provider value={value}>{children}</BoardThemeContext.Provider>;
}

export function useBoardStyle() {
  return useContext(BoardThemeContext);
}
