'use client';

import React, { useId } from 'react';
import { getPieceSet, type PieceSetId } from '@/lib/board-themes';
import type { PieceColor } from '@/lib/types';
import { useBoardStyle } from './BoardThemeContext';

interface ChessPieceProps {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: PieceColor;
  className?: string;
  pieceSet?: PieceSetId;
}

export function ChessPiece({
  type,
  color,
  className = 'w-full h-full',
  pieceSet: pieceSetOverride,
}: ChessPieceProps) {
  const { pieceSet: activeSet } = useBoardStyle();
  const styleDef = pieceSetOverride ? getPieceSet(pieceSetOverride) : activeSet;
  const uid = useId().replace(/:/g, '');
  const gradId = `pg-${styleDef.id}-${color}-${uid}`;
  const sheenId = `ps-${styleDef.id}-${color}-${uid}`;

  const isWhite = color === 'w';
  const fillPrimary = isWhite ? styleDef.whiteFill : styleDef.blackFill;
  const fillSecondary = isWhite ? styleDef.whiteFillAlt : styleDef.blackFillAlt;
  const stroke = isWhite ? styleDef.whiteStroke : styleDef.blackStroke;
  const detailStroke = isWhite ? styleDef.whiteDetail : styleDef.blackDetail;
  const sw = styleDef.strokeWidth;
  const fillPaint = `url(#${gradId})`;

  return (
    <svg
      viewBox="0 0 45 45"
      className={`select-none pointer-events-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)] ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="15%" y1="8%" x2="85%" y2="96%">
          <stop offset="0%" stopColor={fillPrimary} />
          <stop offset="62%" stopColor={fillPrimary} />
          <stop offset="100%" stopColor={fillSecondary} />
        </linearGradient>
        <linearGradient id={sheenId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={isWhite ? 0.55 : 0.25} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </linearGradient>
      </defs>

      {styleDef.id === 'neo' && (
        <NeoPiece
          type={type}
          isWhite={isWhite}
          fill={fillPaint}
          stroke={stroke}
          detail={detailStroke}
          sw={sw}
        />
      )}

      {styleDef.id === 'classic' && (
        <ClassicPiece
          type={type}
          isWhite={isWhite}
          fill={fillPaint}
          stroke={stroke}
          detail={detailStroke}
          sw={sw}
        />
      )}

      {styleDef.id === 'alpha' && (
        <AlphaPiece
          type={type}
          isWhite={isWhite}
          fill={fillPaint}
          stroke={stroke}
          detail={detailStroke}
          sw={sw}
        />
      )}

      {styleDef.id === 'wood' && (
        <WoodPiece
          type={type}
          isWhite={isWhite}
          fill={fillPaint}
          stroke={stroke}
          detail={detailStroke}
          sw={sw}
        />
      )}

      {styleDef.id === 'icy' && (
        <IcyPiece
          type={type}
          isWhite={isWhite}
          fill={fillPaint}
          sheen={`url(#${sheenId})`}
          stroke={stroke}
          detail={detailStroke}
          sw={sw}
        />
      )}

      {styleDef.id === 'metal' && (
        <MetalPiece
          type={type}
          isWhite={isWhite}
          fill={fillPaint}
          sheen={`url(#${sheenId})`}
          stroke={stroke}
          detail={detailStroke}
          sw={sw}
        />
      )}
    </svg>
  );
}

interface VariantProps {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  isWhite: boolean;
  fill: string;
  sheen?: string;
  stroke: string;
  detail: string;
  sw: number;
}

/* ============================================================================
 * 1. NEO (Chess.com Signature Modern Smooth Vector)
 * Smooth curves, soft collar, wide rounded pedestal, crisp minimal lines
 * ============================================================================ */
function NeoPiece({ type, isWhite, fill, stroke, detail, sw }: VariantProps) {
  if (type === 'p') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22.5 8.5a4.7 4.7 0 0 0-3.1 8.23c-1.8 1.25-2.6 3.1-2.1 5.07.35 1.38 1.35 2.4 2.45 3.12-4.2 1.85-7.25 6.05-7.75 11.78-.12 1.38.92 2.55 2.3 2.55h16.4c1.38 0 2.42-1.17 2.3-2.55-.5-5.73-3.55-9.93-7.75-11.78 1.1-.72 2.1-1.74 2.45-3.12.5-1.97-.3-3.82-2.1-5.07a4.7 4.7 0 0 0-3.1-8.23z" />
        <path d="M13.5 36.2h18" stroke={detail} strokeWidth={1} opacity={isWhite ? 0.35 : 0.45} fill="none" />
      </g>
    );
  }
  if (type === 'r') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.5 9h4.2v3.2h4.1V9h5.4v3.2h4.1V9h4.2v6.2c0 1.2-.8 2.2-2 2.6l-1 10.7 2.5 3.3v2.7c0 1.1-.9 2-2 2H14c-1.1 0-2-.9-2-2v-2.7l2.5-3.3-1-10.7c-1.2-.4-2-1.4-2-2.6V9z" />
        <rect x="10" y="36" width="25" height="3.5" rx="1.6" />
        <path d="M14.5 18h16M14 29h17" stroke={detail} strokeWidth={1} opacity={isWhite ? 0.35 : 0.55} fill="none" />
      </g>
    );
  }
  if (type === 'n') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8.5c2.2 0 3.7 1.8 3.7 1.8 6.8 1.3 12.8 7.5 12.8 18.7 0 3.5-.7 6.5-1.3 8.5H12.5c-.4-4.2 1.8-8.2 5.4-10.6 2.8-1.9 4.5-3.9 4.7-6.2-2.7 2.1-6.5 4.7-9.6 5.2-2.1.3-4.1-.8-4.5-2.6-.4-1.8 1.4-3.7 2.8-5.1 1.6-1.6 3.5-4.3 4.8-6.4 0 0 .3-2.5 1.8-2.5 1.1 0 1.9 1.3 1.9 1.3s.6-2.1 1.2-2.1z" />
        <rect x="10.5" y="36.2" width="25.5" height="3.3" rx="1.6" />
        <circle cx="15.4" cy="16.2" r="1.15" fill={detail} stroke="none" />
      </g>
    );
  }
  if (type === 'b') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="22.5" cy="7.5" r="2.4" />
        <path d="M22.5 10c-6.8 3.4-8.5 11.2-5 16.3-1.4 1.1-2 2.7-1.6 4.4h13.2c.4-1.7-.2-3.3-1.6-4.4 3.5-5.1 1.8-12.9-5-16.3z" />
        <path d="M19.2 18.8l6.4-4.2" stroke={detail} strokeWidth={1.6} fill="none" />
        <path d="M9.5 36.2c3.5-1.8 8.2-.4 13-2.3 4.8 1.9 9.5.5 13 2.3.8.5.7 2-.4 2.4-3.8-1.4-8.5.2-12.6-1.4-4.1 1.6-8.8 0-12.6 1.4-1.1-.4-1.2-1.9-.4-2.4z" />
        <path d="M15.8 30.7h13.4c.6 1.4.4 2.5-.4 3.1-3.8 1.4-8.8 1.4-12.6 0-.8-.6-1-1.7-.4-3.1z" />
      </g>
    );
  }
  if (type === 'q') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6.5" cy="13.2" r="2.1" />
        <circle cx="14" cy="9.6" r="2.1" />
        <circle cx="22.5" cy="7.8" r="2.2" />
        <circle cx="31" cy="9.6" r="2.1" />
        <circle cx="38.5" cy="13.2" r="2.1" />
        <path d="M7.6 15.2l4.8 14.3h20.2l4.8-14.3-7.6 9.5-7.3-14.5-7.3 14.5-7.6-9.5z" />
        <path d="M12.4 29.5c-.8 2.2-.8 5 .6 7.5 5.8 1.8 13.2 1.8 19 0 1.4-2.5 1.4-5.3.6-7.5H12.4z" />
        <path d="M12.5 33.4c6.2-1.2 13.8-1.2 20 0" stroke={detail} strokeWidth={1.1} opacity={isWhite ? 0.35 : 0.65} fill="none" />
      </g>
    );
  }
  return (
    <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 5.5h3v3h3v2.8h-3v2.5h-3v-2.5h-3V8.5h3v-3z" />
      <path d="M22.5 13.8c-3.8-2.8-12.5-2.6-14 3.8-1.3 5.3 4.2 9.2 4.2 13.4v5.7c5.8 2.3 13.8 2.3 19.6 0V31c0-4.2 5.5-8.1 4.2-13.4-1.5-6.4-10.2-6.6-14-3.8z" />
      <path d="M22.5 13.8v11" stroke={detail} strokeWidth={1.2} opacity={isWhite ? 0.35 : 0.65} fill="none" />
      <path d="M12.7 32.5c5.8-2.1 13.8-2.1 19.6 0" stroke={detail} strokeWidth={1.15} opacity={isWhite ? 0.4 : 0.75} fill="none" />
    </g>
  );
}

/* ============================================================================
 * 2. CLASSIC (Traditional Ornate Woodcut Staunton)
 * ============================================================================ */
function ClassicPiece({ type, isWhite, fill, stroke, detail, sw }: VariantProps) {
  if (type === 'p') {
    return (
      <path
        d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    );
  }
  if (type === 'r') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
        <path d="M34 14l-3 3H14l-3-3" />
        <path d="M31 17v12.5H14V17" />
        <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
        <g stroke={detail} strokeWidth={1} fill="none" opacity={isWhite ? 0.6 : 0.9}>
          <path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" />
        </g>
      </g>
    );
  }
  if (type === 'n') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
        <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
        <circle cx="15" cy="15.5" r="0.95" fill={detail} stroke="none" />
        <path d="M9.5 25.5a0.5 0.5 0 1 1-1 0 0.5 0.5 0 1 1 1 0z" fill={detail} stroke="none" />
        {!isWhite && (
          <path
            d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z"
            fill={detail}
            stroke="none"
            opacity="0.35"
          />
        )}
      </g>
    );
  }
  if (type === 'b') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
        <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
        <circle cx="22.5" cy="8" r="2.5" />
        <g stroke={detail} strokeWidth={1.2} fill="none">
          <path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" />
        </g>
      </g>
    );
  }
  if (type === 'q') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="14" cy="9" r="2.5" />
        <circle cx="22.5" cy="8" r="2.5" />
        <circle cx="31" cy="9" r="2.5" />
        <circle cx="39" cy="12" r="2.5" />
        <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" />
        <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
        <g stroke={detail} strokeWidth={1.1} fill="none" opacity={isWhite ? 0.6 : 0.95}>
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" />
        </g>
      </g>
    );
  }
  return (
    <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22.5 11.63V6M20 8h5" />
      <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
      <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" />
      <g stroke={detail} strokeWidth={1.1} fill="none" opacity={isWhite ? 0.6 : 0.95}>
        <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" />
      </g>
    </g>
  );
}

/* ============================================================================
 * 3. ALPHA (Chess.com Bold Geometric Flat Tournament Style)
 * Chunky proportions, sharp angular cuts, flat architectural bases
 * ============================================================================ */
function AlphaPiece({ type, fill, stroke, detail, sw }: VariantProps) {
  if (type === 'p') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="square" strokeLinejoin="miter">
        <circle cx="22.5" cy="13.5" r="4.8" />
        <rect x="16.5" y="18.3" width="12" height="3.2" rx="1.2" />
        <path d="M18.5 21.5L14 35h17l-4.5-13.5z" />
        <rect x="10.5" y="35" width="24" height="4.5" rx="0.8" />
      </g>
    );
  }
  if (type === 'r') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="square" strokeLinejoin="miter">
        <path d="M11 8h5v4h4V8h5v4h4V8h5v8l-3 2v12l3 3.5V39H11v-5.5L14 30V18l-3-2V8z" />
        <path d="M14 18h17M14 30h17M11 35h23" stroke={detail} strokeWidth={1.2} fill="none" />
      </g>
    );
  }
  if (type === 'n') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.5 7.5l3 3.2c7.5 1.5 13 8.5 12.5 23.8H14.5c0-6.5 6.5-8.5 8-14-3 1.8-6.8 3.6-10.2 3.2-1.8-.2-3.5-1.5-3.8-3.4-.3-1.8 1.2-3.6 3.5-5.6 1.5-1.3 2.5-3.2 3-5.2l2.2 1.8 2.3-3.8z" />
        <rect x="11" y="34.5" width="26" height="4.8" rx="0.8" />
        <polygon points="15.5,14.5 17.8,14.2 16.4,16.4" fill={detail} stroke="none" />
      </g>
    );
  }
  if (type === 'b') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="22.5" cy="7.2" r="2.2" />
        <path d="M22.5 9.8c-6.4 4.2-7.5 12.4-3.8 17.7h7.6c3.7-5.3 2.6-13.5-3.8-17.7z" />
        <path d="M25.8 14.5l-5.6 5.6" stroke={detail} strokeWidth={2.1} fill="none" />
        <rect x="14.5" y="27.5" width="16" height="3.2" rx="1" />
        <path d="M15.5 30.7L11 35.5h23l-4.5-4.8z" />
        <rect x="9.5" y="35.5" width="26" height="4" rx="0.8" />
      </g>
    );
  }
  if (type === 'q') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="11.5" r="2" />
        <circle cx="14.5" cy="8.5" r="2" />
        <circle cx="22.5" cy="7.5" r="2.1" />
        <circle cx="30.5" cy="8.5" r="2" />
        <circle cx="38" cy="11.5" r="2" />
        <path d="M8 13.5l5.5 17.5h18l5.5-17.5-7 9.5-7.5-13.5L15 23l-7-9.5z" />
        <rect x="12" y="31" width="21" height="3.5" />
        <rect x="10.5" y="34.5" width="24" height="4.8" rx="0.8" />
      </g>
    );
  }
  return (
    <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="square" strokeLinejoin="miter">
      <path d="M20.5 5.5h4v3.5h3.5v3.5h-3.5V15h-4v-2.5H17V9h3.5V5.5z" />
      <path d="M10.5 19c0-4 5.5-5.5 12-3 6.5-2.5 12-1 12 3 0 4.5-3 7.5-4 12H14.5c-1-4.5-4-7.5-4-12z" />
      <rect x="12.5" y="31" width="20" height="3.5" />
      <rect x="10.5" y="34.5" width="24" height="4.8" rx="0.8" />
      <path d="M22.5 16v15" stroke={detail} strokeWidth={1.3} fill="none" />
    </g>
  );
}

/* ============================================================================
 * 4. WOOD (Turned Carved Wooden Staunton with Double Pedestal & Lathe Collars)
 * ============================================================================ */
function WoodPiece({ type, fill, stroke, detail, sw }: VariantProps) {
  if (type === 'p') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="22.5" cy="12" r="4.2" />
        <ellipse cx="22.5" cy="17.3" rx="6.5" ry="1.8" />
        <path d="M18 19c-.3 4.8-2.8 9.2-5 13h19c-2.2-3.8-4.7-8.2-5-13H18z" />
        <rect x="11" y="32" width="23" height="3.5" rx="1.4" />
        <rect x="9.5" y="35.5" width="26" height="4" rx="1.6" />
        <path d="M19.5 22c-.5 3.5-1.5 6.5-2.5 9" stroke={detail} strokeWidth={0.9} opacity={0.55} fill="none" />
      </g>
    );
  }
  if (type === 'r') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 8.5h4.5v2.8h4.5V8.5h5v2.8h4.5V8.5H34v6.2l-3.2 2.5h-16.6L11 14.7V8.5z" />
        <path d="M14.5 17.2v14.8h16V17.2" />
        <rect x="11.5" y="32" width="22" height="3.5" rx="1.3" />
        <rect x="9.5" y="35.5" width="26" height="4" rx="1.5" />
        <path d="M14.5 20.5h16M14.5 28.5h16M18 21.5v6.5" stroke={detail} strokeWidth={1} opacity={0.6} fill="none" />
      </g>
    );
  }
  if (type === 'n') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.5 8.5c9.8 1 15.2 7.8 14.2 23.5H15c.2-6.8 6.5-6.8 7-15.5-2.5 2.5-5.8 5.2-9 5.5-2 .2-3.5-1.2-3.5-3.2 0-2.5 3.8-7.2 5.2-9.5l2.2-2.2 2.6 2.7s.9-1.5 2-1.3z" />
        <rect x="12" y="32" width="23" height="3.5" rx="1.3" />
        <rect x="10" y="35.5" width="26.5" height="4" rx="1.5" />
        <circle cx="15.5" cy="14.8" r="1" fill={detail} stroke="none" />
        <path d="M27.5 13.5c3.5 3 5.2 8.2 5 16" stroke={detail} strokeWidth={1.1} opacity={0.55} fill="none" />
      </g>
    );
  }
  if (type === 'b') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="22.5" cy="7.2" r="2.3" />
        <path d="M22.5 9.8c-8 3.6-8.5 12-4.5 17h9c4-5 3.5-13.4-4.5-17z" />
        <ellipse cx="22.5" cy="28" rx="7.2" ry="1.8" />
        <path d="M16.5 29.8L13 33h19l-3.5-3.2z" />
        <rect x="10" y="33" width="25" height="3.2" rx="1.2" />
        <rect x="9" y="36.2" width="27" height="3.5" rx="1.5" />
        <path d="M20 18.5h5M22.5 16v5" stroke={detail} strokeWidth={1.2} opacity={0.75} fill="none" />
      </g>
    );
  }
  if (type === 'q') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6.8" cy="12" r="2.1" />
        <circle cx="14.2" cy="8.8" r="2.1" />
        <circle cx="22.5" cy="7.5" r="2.2" />
        <circle cx="30.8" cy="8.8" r="2.1" />
        <circle cx="38.2" cy="12" r="2.1" />
        <path d="M8 14l4.5 14h20l4.5-14-7.2 9.5-7.3-13.8-7.3 13.8L8 14z" />
        <ellipse cx="22.5" cy="29.5" rx="10.8" ry="2" />
        <rect x="11.5" y="31.8" width="22" height="3.5" rx="1.3" />
        <rect x="9.5" y="35.3" width="26" height="4.2" rx="1.5" />
      </g>
    );
  }
  return (
    <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.2 5.5h2.6v2.6h2.6v2.4h-2.6v2.5h-2.6v-2.5h-2.6V8.1h2.6V5.5z" />
      <path d="M11 19.5c-1.5-5.8 6-8 11.5-4 5.5-4 13-1.8 11.5 4-1 3.8-3 6.5-3.5 10.5H14.5c-.5-4-2.5-6.7-3.5-10.5z" />
      <ellipse cx="22.5" cy="30.5" rx="10" ry="1.9" />
      <rect x="11.5" y="32.4" width="22" height="3.3" rx="1.2" />
      <rect x="9.5" y="35.7" width="26" height="4" rx="1.5" />
      <path d="M22.5 15.5v14.5" stroke={detail} strokeWidth={1.1} opacity={0.65} fill="none" />
    </g>
  );
}

/* ============================================================================
 * 5. ICY (Faceted Crystalline / Gem-Cut Polygon Silhouettes)
 * Sharp crystal facets, diamond heads, jagged crystal spires
 * ============================================================================ */
function IcyPiece({ type, fill, sheen, stroke, detail, sw }: VariantProps) {
  if (type === 'p') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
        <polygon points="22.5,8 27,12.5 25,17 20,17 18,12.5" />
        <polygon points="18.5,17.5 26.5,17.5 31,34 14,34" />
        <polygon points="11.5,34 33.5,34 35,39.5 10,39.5" />
        <polygon points="22.5,8 27,12.5 22.5,17" fill={sheen} stroke="none" />
        <line x1="22.5" y1="17.5" x2="22.5" y2="34" stroke={detail} strokeWidth={1} opacity={0.7} />
      </g>
    );
  }
  if (type === 'r') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
        <polygon points="10.5,10 14,7.5 17,11.5 20.5,8 24.5,8 28,11.5 31,7.5 34.5,10 33.5,17 30.5,19 32.5,34 12.5,34 14.5,19 11.5,17" />
        <polygon points="10,34 35,34 36.5,39.5 8.5,39.5" />
        <polyline points="14.5,19 22.5,22 30.5,19" fill="none" stroke={detail} strokeWidth={1} />
        <line x1="22.5" y1="22" x2="22.5" y2="34" stroke={detail} strokeWidth={1} />
      </g>
    );
  }
  if (type === 'n') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
        <polygon points="21.5,7.5 25.5,10 33,14.5 36,24 34,34 13.5,34 18.5,24 22,19 13,22.5 8.5,19.5 13.5,12 18.5,8" />
        <polygon points="11,34 36,34 37.5,39.5 9.5,39.5" />
        <polyline points="22,19 26.5,15.5 32.5,23" fill="none" stroke={detail} strokeWidth={1.1} />
        <polygon points="14,14.5 16.5,13.5 15.8,16" fill={detail} stroke="none" />
      </g>
    );
  }
  if (type === 'b') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
        <polygon points="22.5,5.5 25,8.5 22.5,11 20,8.5" />
        <polygon points="22.5,11 30.5,20 27.5,30 17.5,30 14.5,20" />
        <polygon points="15,30 30,30 33,34.5 12,34.5" />
        <polygon points="9.5,34.5 35.5,34.5 37,39.5 8,39.5" />
        <polyline points="22.5,11 22.5,30 14.5,20 22.5,21.5 30.5,20" fill="none" stroke={detail} strokeWidth={1} />
      </g>
    );
  }
  if (type === 'q') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
        <polygon points="6.5,11 13.5,20.5 14,7.5 20,19.5 22.5,6.5 25,19.5 31,7.5 31.5,20.5 38.5,11 33,33.5 12,33.5" />
        <polygon points="10,33.5 35,33.5 36.5,39.5 8.5,39.5" />
        <polyline points="13.5,20.5 22.5,24 31.5,20.5" fill="none" stroke={detail} strokeWidth={1.1} />
        <line x1="22.5" y1="24" x2="22.5" y2="33.5" stroke={detail} strokeWidth={1} />
      </g>
    );
  }
  return (
    <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
      <polygon points="22.5,5 25,8 28.5,9.5 25,11 22.5,14 20,11 16.5,9.5 20,8" />
      <polygon points="22.5,14 35.5,18 33.5,29 31.5,33.5 13.5,33.5 11.5,29 9.5,18" />
      <polygon points="10,33.5 35,33.5 36.5,39.5 8.5,39.5" />
      <polyline points="9.5,18 22.5,22 35.5,18" fill="none" stroke={detail} strokeWidth={1.1} />
      <line x1="22.5" y1="14" x2="22.5" y2="33.5" stroke={detail} strokeWidth={1.1} />
    </g>
  );
}

/* ============================================================================
 * 6. METAL (Futuristic / Tournament Machined Steel Silhouettes)
 * Chamfered armor plates, visor knight, sleek horizontal grooved collars
 * ============================================================================ */
function MetalPiece({ type, fill, sheen, stroke, detail, sw }: VariantProps) {
  if (type === 'p') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18.5 11.5l4-3.5 4 3.5-1.2 4.5h-5.6l-1.2-4.5z" />
        <path d="M16 17.5h13l3 16.5H13l3-16.5z" />
        <path d="M10.5 34h24l1.5 2.5-1.5 3h-24l-1.5-3 1.5-2.5z" />
        <path d="M16.5 21h12M15.2 26h14.6" stroke={detail} strokeWidth={1} opacity={0.65} fill="none" />
      </g>
    );
  }
  if (type === 'r') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 8.5h4.5v3h4.5v-3h5v3h4.5v-3H34v7l-2.5 2v16.5H13.5V17.5L11 15.5v-7z" />
        <path d="M10 34h25l1.5 2.5-1.5 3H10l-1.5-3L10 34z" />
        <path d="M14 19h17M14 24h17M14 29h17" stroke={detail} strokeWidth={1.05} opacity={0.6} fill="none" />
      </g>
    );
  }
  if (type === 'n') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.5 7.5l3.5 2.5c8 1.5 13 8.5 12 24H13.5c0-6 4.5-9.5 8-13.5l-9.5 2.5-3-3.5 4.5-6.5 3.5-4.5 2.5-1z" />
        <path d="M10 34h26.5l1.5 2.5-1.5 3H10l-1.5-3L10 34z" />
        <path d="M13 15.5l6.5-1.5" stroke={detail} strokeWidth={1.8} />
        <path d="M27.5 13c3.5 3.5 4.5 9.5 4.5 18" stroke={detail} strokeWidth={1.1} opacity={0.6} fill="none" />
      </g>
    );
  }
  if (type === 'b') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <rect x="20.7" y="5.5" width="3.6" height="3.6" transform="rotate(45 22.5 7.3)" />
        <path d="M22.5 10c-6 3.5-8 10.5-5 16.5l-3 7.5h16l-3-7.5c3-6 1-13-5-16.5z" />
        <path d="M10 34h25l1.5 2.5-1.5 3H10l-1.5-3L10 34z" />
        <path d="M18 22.5h9M22.5 15.5v11" stroke={detail} strokeWidth={1.2} opacity={0.75} fill="none" />
      </g>
    );
  }
  if (type === 'q') {
    return (
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 11l5.5 15h20L38 11l-7.5 9.5L22.5 7l-8 13.5L7 11z" />
        <rect x="12" y="26" width="21" height="8" />
        <path d="M10 34h25l1.5 2.5-1.5 3H10l-1.5-3L10 34z" />
        <path d="M12.5 30h20" stroke={detail} strokeWidth={1.2} opacity={0.75} fill="none" />
        <polygon points="12.5,26 22.5,26 22.5,34 12.5,34" fill={sheen} stroke="none" />
      </g>
    );
  }
  return (
    <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 5.5h3v3h3v2.6h-3v2.4h-3v-2.4h-3V8.5h3v-3z" />
      <path d="M10 18.5c2-4.5 7-5 12.5-2.5 5.5-2.5 10.5-2 12.5 2.5L32 34H13L10 18.5z" />
      <path d="M10 34h25l1.5 2.5-1.5 3H10l-1.5-3L10 34z" />
      <path d="M12.5 26h20M13 30h19M22.5 16v18" stroke={detail} strokeWidth={1.1} opacity={0.7} fill="none" />
    </g>
  );
}
