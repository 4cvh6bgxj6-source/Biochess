'use client';

import React from 'react';
import { Check, Swords, X } from 'lucide-react';
import { TIME_CONTROLS, type Challenge } from '@/lib/types';
import { countryCodeToFlag } from '@/lib/world-languages';
import type { UiDictionary } from '@/lib/i18n';

interface IncomingChallengeToastProps {
  challenge: Challenge;
  dict?: UiDictionary;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingChallengeToast({
  challenge,
  dict,
  onAccept,
  onDecline,
}: IncomingChallengeToastProps) {
  const flag = countryCodeToFlag(challenge.fromCountry);

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm bg-[#262421] border border-[#81B64C] rounded-md p-4 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded bg-[#302E2B] border border-[#3C3A36] flex items-center justify-center shrink-0 text-[#81B64C]">
          <Swords className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
            {flag && (
              <span className="text-base leading-none shrink-0" aria-hidden="true">
                {flag}
              </span>
            )}
            <span className="truncate">{challenge.from} ti sfida</span>
          </p>
          <p className="text-xs text-[#BABABA] mt-0.5">
            {challenge.fromElo} ELO · {TIME_CONTROLS[challenge.timeControl].label}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={onAccept}
              className="px-3.5 py-1.5 rounded bg-[#81B64C] hover:bg-[#95C85E] text-white text-xs font-bold border-b-2 border-[#5D8A32] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{dict?.accept ?? 'Accetta'}</span>
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="px-3 py-1.5 rounded bg-[#3C3A36] hover:bg-[#4B4843] text-[#E5E4E2] text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              <span>{dict?.decline ?? 'Rifiuta'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
