'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Highlighter, Volume2 } from 'lucide-react';
import {
  CHESS_BOARD_THEMES,
  CHESS_PIECE_SETS,
  SOUND_PROFILE_LABELS,
} from '@/lib/board-themes';
import { soundFX } from '@/lib/sound';
import { useBoardStyle } from './BoardThemeContext';
import { ChessPiece } from './ChessPiece';

interface BoardStylePickerProps {
  label?: string;
  lang?: string;
}

const PREVIEW_PIECES: Array<{
  row: number;
  col: number;
  type: 'r' | 'n' | 'b' | 'q' | 'k' | 'p';
  color: 'w' | 'b';
}> = [
  { row: 0, col: 0, type: 'r', color: 'b' },
  { row: 0, col: 1, type: 'n', color: 'b' },
  { row: 0, col: 2, type: 'b', color: 'b' },
  { row: 0, col: 3, type: 'k', color: 'b' },
  { row: 1, col: 0, type: 'p', color: 'b' },
  { row: 1, col: 2, type: 'p', color: 'b' },
  { row: 2, col: 1, type: 'n', color: 'w' },
  { row: 2, col: 3, type: 'p', color: 'w' },
  { row: 3, col: 0, type: 'r', color: 'w' },
  { row: 3, col: 1, type: 'q', color: 'w' },
  { row: 3, col: 2, type: 'b', color: 'w' },
  { row: 3, col: 3, type: 'k', color: 'w' },
];

export function BoardStylePicker({ label = 'Stile', lang = 'it' }: BoardStylePickerProps) {
  const {
    boardThemeId,
    pieceSetId,
    soundProfileId,
    boardTheme,
    pieceSet,
    setBoardThemeId,
    setPieceSetId,
  } = useBoardStyle();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isEn = lang.toLowerCase() === 'en';
  const activeSoundName = isEn
    ? SOUND_PROFILE_LABELS[soundProfileId].en
    : SOUND_PROFILE_LABELS[soundProfileId].it;

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`px-2.5 py-1.5 rounded border text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
          open
            ? 'bg-[#3C3A36] border-[#81B64C] text-white'
            : 'bg-[#302E2B] hover:bg-[#3C3A36] border-[#3C3A36] text-[#E5E4E2]'
        }`}
      >
        <Highlighter className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
        <span>{label}</span>
        <span
          className="grid grid-cols-2 w-3.5 h-3.5 rounded-[2px] overflow-hidden border border-black/40 shrink-0"
          aria-hidden="true"
        >
          <span style={{ backgroundColor: boardTheme.light }} />
          <span style={{ backgroundColor: boardTheme.dark }} />
          <span style={{ backgroundColor: boardTheme.dark }} />
          <span style={{ backgroundColor: boardTheme.light }} />
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#9E9D9A] shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-[336px] sm:w-[392px] bg-[#21201D] border border-[#45433E] rounded-md shadow-2xl overflow-hidden">
          {/* Live 4x4 Chess.com Preview */}
          <div className="p-3 bg-[#262421] border-b border-[#3C3A36] flex items-center gap-3">
            <div className="w-24 h-24 rounded overflow-hidden border border-[#3C3A36] grid grid-cols-4 grid-rows-4 shrink-0 shadow-md">
              {[0, 1, 2, 3].map((r) =>
                [0, 1, 2, 3].map((c) => {
                  const isLight = (r + c) % 2 === 0;
                  const isHighlight = (r === 2 && c === 1) || (r === 0 && c === 0);
                  const bg = isHighlight
                    ? isLight
                      ? boardTheme.highlightLight
                      : boardTheme.highlightDark
                    : isLight
                      ? boardTheme.light
                      : boardTheme.dark;
                  const tex = !isHighlight
                    ? isLight
                      ? boardTheme.lightTexture
                      : boardTheme.darkTexture
                    : undefined;
                  const piece = PREVIEW_PIECES.find((p) => p.row === r && p.col === c);

                  return (
                    <div
                      key={`${r}-${c}`}
                      style={{
                        backgroundColor: bg,
                        backgroundImage: tex,
                      }}
                      className="flex items-center justify-center p-0.5"
                    >
                      {piece && <ChessPiece type={piece.type} color={piece.color} />}
                    </div>
                  );
                })
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-extrabold text-white">
                {isEn ? 'Board & Pieces Style' : 'Stile Scacchiera & Pezzi'}
              </p>
              <p className="text-[11px] text-[#BABABA] truncate">
                {isEn ? 'Pieces:' : 'Pezzi:'}{' '}
                <span className="font-bold text-white">{pieceSet.name}</span>
              </p>
              <p className="text-[11px] text-[#BABABA] truncate">
                {isEn ? 'Board:' : 'Scacchiera:'}{' '}
                <span className="font-bold text-white">{boardTheme.name}</span>
              </p>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <p className="text-[11px] text-[#81B64C] font-semibold truncate">
                  {isEn ? 'Sound:' : 'Suono:'} {activeSoundName}
                </p>
                <button
                  type="button"
                  onClick={() => soundFX.playCapture()}
                  title={isEn ? 'Test sound' : 'Prova suono'}
                  className="px-2 py-1 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#3C3A36] text-[10px] font-bold text-[#E5E4E2] inline-flex items-center gap-1 shrink-0"
                >
                  <Volume2 className="w-3 h-3 text-[#81B64C]" />
                  <span>{isEn ? 'Test' : 'Prova'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-3 space-y-4">
            {/* Section 1: Piece Sets */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-extrabold tracking-wide text-[#BABABA]">
                {isEn ? 'Piece Set (Pawns, Knights, Kings...)' : 'Stile Pezzi (Pedoni, Cavalli, Re...)'}
              </h3>

              <div className="grid grid-cols-3 gap-2">
                {CHESS_PIECE_SETS.map((set) => {
                  const active = set.id === pieceSetId;
                  const soundLabel = isEn
                    ? SOUND_PROFILE_LABELS[set.soundProfile].en
                    : SOUND_PROFILE_LABELS[set.soundProfile].it;
                  return (
                    <button
                      key={set.id}
                      type="button"
                      onClick={() => {
                        setPieceSetId(set.id);
                        soundFX.playMove();
                      }}
                      className={`relative rounded p-2 border transition-colors flex flex-col items-center gap-1 ${
                        active
                          ? 'bg-[#302E2B] border-[#81B64C]'
                          : 'bg-[#262421] border-[#3C3A36] hover:bg-[#2F2C28]'
                      }`}
                    >
                      <div className="w-full h-11 rounded-[3px] grid grid-cols-2 overflow-hidden border border-black/25">
                        <div
                          style={{
                            backgroundColor: boardTheme.light,
                            backgroundImage: boardTheme.lightTexture,
                          }}
                          className="flex items-center justify-center p-0.5"
                        >
                          <div className="w-8 h-8">
                            <ChessPiece type="p" color="w" pieceSet={set.id} />
                          </div>
                        </div>
                        <div
                          style={{
                            backgroundColor: boardTheme.dark,
                            backgroundImage: boardTheme.darkTexture,
                          }}
                          className="flex items-center justify-center p-0.5"
                        >
                          <div className="w-8 h-8">
                            <ChessPiece type="n" color="b" pieceSet={set.id} />
                          </div>
                        </div>
                      </div>
                      {active && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#81B64C] flex items-center justify-center shadow">
                          <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-bold truncate w-full text-center ${
                          active ? 'text-white' : 'text-[#CCCCCC]'
                        }`}
                      >
                        {set.name}
                      </span>
                      <span className="text-[9px] text-[#8B8987] truncate w-full text-center">
                        {soundLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[#33302C]" />

            {/* Section 2: Board Themes */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-extrabold tracking-wide text-[#BABABA]">
                {isEn ? 'Board Theme' : 'Tema Scacchiera'}
              </h3>

              <div className="grid grid-cols-4 gap-2">
                {CHESS_BOARD_THEMES.map((theme) => {
                  const active = theme.id === boardThemeId;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => {
                        setBoardThemeId(theme.id);
                        soundFX.playMove();
                      }}
                      className={`group rounded p-1.5 border text-left transition-colors flex flex-col items-center gap-1 ${
                        active
                          ? 'bg-[#302E2B] border-[#81B64C]'
                          : 'bg-[#262421] border-[#3C3A36] hover:bg-[#2F2C28]'
                      }`}
                    >
                      <div className="relative w-full aspect-square rounded-[3px] overflow-hidden grid grid-cols-2 grid-rows-2 border border-black/25">
                        <span
                          style={{
                            backgroundColor: theme.light,
                            backgroundImage: theme.lightTexture,
                          }}
                        />
                        <span
                          style={{
                            backgroundColor: theme.dark,
                            backgroundImage: theme.darkTexture,
                          }}
                        />
                        <span
                          style={{
                            backgroundColor: theme.dark,
                            backgroundImage: theme.darkTexture,
                          }}
                        />
                        <span
                          style={{
                            backgroundColor: theme.light,
                            backgroundImage: theme.lightTexture,
                          }}
                        />
                        {active && (
                          <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-[#81B64C] flex items-center justify-center shadow">
                            <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold truncate w-full text-center ${
                          active ? 'text-white' : 'text-[#CCCCCC]'
                        }`}
                      >
                        {theme.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
