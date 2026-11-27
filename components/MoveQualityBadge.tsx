'use client';

import React from 'react';
import { BookOpen, Crown } from 'lucide-react';
import { getLocalizedMoveQualityText } from '@/lib/i18n';
import type { MoveQuality } from '@/lib/types';

export const QUALITY_META: Record<
  MoveQuality,
  {
    symbol: string;
    title: string;
    subtitle: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
  }
> = {
  book: {
    symbol: 'B',
    title: 'Opening',
    subtitle: 'Opening theory move',
    bgClass: 'bg-[#A88865]',
    textClass: 'text-[#D2B088]',
    borderClass: 'border-[#A88865]/45',
  },
  brilliant: {
    symbol: '!!',
    title: 'Brilliant',
    subtitle: 'Winning sacrifice or brilliant combination',
    bgClass: 'bg-[#1BACA6]',
    textClass: 'text-[#26D0C9]',
    borderClass: 'border-[#1BACA6]/45',
  },
  great: {
    symbol: '!',
    title: 'Great',
    subtitle: 'Only strong move in a critical position',
    bgClass: 'bg-[#5C8BB0]',
    textClass: 'text-[#7AB3E0]',
    borderClass: 'border-[#5C8BB0]/45',
  },
  good: {
    symbol: 'C',
    title: 'Good',
    subtitle: 'Solid move aligned with the engine',
    bgClass: 'bg-[#81B64C]',
    textClass: 'text-[#9ED16A]',
    borderClass: 'border-[#81B64C]/45',
  },
  neutral: {
    symbol: '?!',
    title: 'Inaccuracy',
    subtitle: 'Slightly weaker than the best move',
    bgClass: 'bg-[#C99D28]',
    textClass: 'text-[#E7C666]',
    borderClass: 'border-[#C99D28]/45',
  },
  mistake: {
    symbol: '?',
    title: 'Mistake',
    subtitle: 'This gives away a noticeable advantage',
    bgClass: 'bg-[#E6912C]',
    textClass: 'text-[#F5A84B]',
    borderClass: 'border-[#E6912C]/45',
  },
  blunder: {
    symbol: '??',
    title: 'Blunder',
    subtitle: 'Critical mistake that changes the game',
    bgClass: 'bg-[#CA3431]',
    textClass: 'text-[#F16562]',
    borderClass: 'border-[#CA3431]/50',
  },
};

export function getQualityMeta(quality: MoveQuality, lang?: string) {
  const base = QUALITY_META[quality];
  const loc = getLocalizedMoveQualityText(quality, lang);
  return {
    ...base,
    title: loc.title,
    subtitle: loc.subtitle,
  };
}

interface MoveQualityBadgeProps {
  quality?: MoveQuality;
  size?: 'sm' | 'board';
  lang?: string;
}

export function MoveQualityBadge({ quality, size = 'sm', lang }: MoveQualityBadgeProps) {
  if (!quality || !(quality in QUALITY_META)) return null;
  const meta = getQualityMeta(quality, lang);

  const sizeClasses =
    size === 'board'
      ? 'w-5 h-5 text-[11px] shadow-md ring-2 ring-[#262421]'
      : 'w-4 h-4 text-[10px]';

  return (
    <span
      title={`${meta.title}: ${meta.subtitle}`}
      className={`inline-flex items-center justify-center rounded-full font-extrabold text-white shrink-0 leading-none ${meta.bgClass} ${sizeClasses}`}
    >
      {quality === 'good' ? (
        <Crown className={size === 'board' ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
      ) : quality === 'book' ? (
        <BookOpen className={size === 'board' ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
      ) : (
        meta.symbol
      )}
    </span>
  );
}
