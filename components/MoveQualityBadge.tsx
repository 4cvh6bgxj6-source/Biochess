'use client';

import React from 'react';
import { BookOpen, Crown } from 'lucide-react';
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
    title: 'Apprendimento',
    subtitle: 'Mossa di apertura iniziale',
    bgClass: 'bg-[#A88865]',
    textClass: 'text-[#D2B088]',
    borderClass: 'border-[#A88865]/45',
  },
  brilliant: {
    symbol: '!!',
    title: 'Brilliant',
    subtitle: 'Sacrificio vincente o combinazione brillante',
    bgClass: 'bg-[#1BACA6]',
    textClass: 'text-[#26D0C9]',
    borderClass: 'border-[#1BACA6]/45',
  },
  great: {
    symbol: '!',
    title: 'Great',
    subtitle: 'Unica mossa vincente in posizione critica',
    bgClass: 'bg-[#5C8BB0]',
    textClass: 'text-[#7AB3E0]',
    borderClass: 'border-[#5C8BB0]/45',
  },
  good: {
    symbol: 'C',
    title: 'Buona mossa',
    subtitle: 'Mossa solida in linea con il motore',
    bgClass: 'bg-[#81B64C]',
    textClass: 'text-[#9ED16A]',
    borderClass: 'border-[#81B64C]/45',
  },
  neutral: {
    symbol: '?!',
    title: 'Imprecisione',
    subtitle: 'Leggermente inferiore alla migliore',
    bgClass: 'bg-[#C99D28]',
    textClass: 'text-[#E7C666]',
    borderClass: 'border-[#C99D28]/45',
  },
  mistake: {
    symbol: '?',
    title: 'Mistake',
    subtitle: 'Che mossa stai cercando di fare?',
    bgClass: 'bg-[#E6912C]',
    textClass: 'text-[#F5A84B]',
    borderClass: 'border-[#E6912C]/45',
  },
  blunder: {
    symbol: '??',
    title: 'Blunder',
    subtitle: 'Errore grave al 100%',
    bgClass: 'bg-[#CA3431]',
    textClass: 'text-[#F16562]',
    borderClass: 'border-[#CA3431]/50',
  },
};

interface MoveQualityBadgeProps {
  quality?: MoveQuality;
  size?: 'sm' | 'board';
}

export function MoveQualityBadge({ quality, size = 'sm' }: MoveQualityBadgeProps) {
  if (!quality) return null;
  const meta = QUALITY_META[quality];
  if (!meta) return null;

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
