'use client';

import React from 'react';
import { Bot, Clock, User } from 'lucide-react';
import { BOT_DEFINITIONS, type GamePlayerInfo, type PieceColor, type TimeControlId } from '@/lib/types';
import { countryCodeToFlag } from '@/lib/world-languages';
import type { UiDictionary } from '@/lib/i18n';
import { ChessPiece } from './ChessPiece';

interface PlayerBarProps {
  player: GamePlayerInfo;
  color: PieceColor;
  timeMs: number;
  timeControl: TimeControlId;
  isTurn: boolean;
  isGameActive: boolean;
  isSelf: boolean;
  capturedPieces: Array<'p' | 'n' | 'b' | 'r' | 'q'>;
  materialAdvantage: number;
  dict?: UiDictionary;
}

function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (clamped < 10000 && clamped > 0) {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function PlayerBar({
  player,
  color,
  timeMs,
  timeControl,
  isTurn,
  isGameActive,
  isSelf,
  capturedPieces,
  materialAdvantage,
  dict,
}: PlayerBarProps) {
  const isLowTime = timeControl !== 'unlimited' && timeMs > 0 && timeMs <= 20000;
  const botDef = player.isBot && player.botId ? BOT_DEFINITIONS[player.botId] : null;
  const capturedColor: PieceColor = color === 'w' ? 'b' : 'w';
  const activeTurn = isGameActive && isTurn;

  const flagBadge = botDef
    ? botDef.badgeEmoji
    : countryCodeToFlag(player.country) || '';

  const colorLabel =
    color === 'w' ? (dict?.colorWhite ?? 'White') : (dict?.colorBlack ?? 'Black');

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-10 h-10 rounded bg-[#262421] border border-[#3C3A36] shrink-0 flex items-center justify-center p-1.5">
          {botDef ? (
            <ChessPiece type={botDef.pieceType} color={color} />
          ) : player.isBot ? (
            <Bot className="w-5 h-5 text-[#81B64C]" />
          ) : (
            <User className="w-5 h-5 text-[#BABABA]" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm leading-tight">
            {flagBadge && (
              <span className="text-base leading-none shrink-0" aria-hidden="true">
                {flagBadge}
              </span>
            )}
            <span className="font-bold text-white truncate">{player.username}</span>
            <span className="text-[#9E9D9A] font-mono-tabular text-xs shrink-0">
              ({player.elo})
            </span>
            {isSelf && (
              <span className="text-[11px] text-[#9E9D9A] shrink-0">
                · {dict?.youTag ?? 'You'}
              </span>
            )}
            {activeTurn && (
              <span className="text-[11px] font-semibold text-[#81B64C] shrink-0">
                · {isSelf ? (dict?.yourTurn ?? 'Your turn') : (dict?.turnTag ?? 'Turn')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1 min-h-[16px]">
            {capturedPieces.length > 0 ? (
              <div className="flex items-center -space-x-1">
                {capturedPieces.slice(0, 10).map((p, idx) => (
                  <div key={`${p}-${idx}`} className="w-4 h-4">
                    <ChessPiece type={p} color={capturedColor} />
                  </div>
                ))}
                {materialAdvantage > 0 && (
                  <span className="pl-2 text-xs font-mono-tabular text-[#BABABA]">
                    +{materialAdvantage}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-[#8B8987]">{colorLabel}</span>
            )}
          </div>
        </div>
      </div>

      {timeControl === 'unlimited' ? (
        <div className="flex items-center gap-1.5 text-xs text-[#9E9D9A] font-mono-tabular shrink-0 px-3 py-2 rounded bg-[#262421] border border-[#3C3A36]">
          <Clock className="w-3.5 h-3.5" />
          <span>∞</span>
        </div>
      ) : (
        <div
          className={`min-w-[88px] text-right px-3 py-1.5 rounded font-mono-tabular text-lg font-bold tracking-tight shrink-0 transition-colors ${
            activeTurn
              ? isLowTime
                ? 'bg-[#CA3431] text-white'
                : 'bg-white text-[#262421]'
              : 'bg-[#262421] text-[#9E9D9A]'
          }`}
        >
          {formatClock(timeMs)}
        </div>
      )}
    </div>
  );
}
