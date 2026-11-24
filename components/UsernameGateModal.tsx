'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { LogIn, UserCheck } from 'lucide-react';
import { BIOCHESS_LOGO } from '@/lib/brand';

interface UsernameGateModalProps {
  step: 'google' | 'choose_username';
  error: string | null;
  connecting: boolean;
  onGoogleSignIn: () => void;
  onCreateProfile: (username: string) => void;
  onSwitchGoogleAccount: () => void;
  onClearError: () => void;
}

export function UsernameGateModal({
  step,
  error,
  connecting,
  onGoogleSignIn,
  onCreateProfile,
  onSwitchGoogleAccount,
  onClearError,
}: UsernameGateModalProps) {
  const [username, setUsername] = useState('');

  function handleSubmitUsername(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 2 || connecting) return;
    onCreateProfile(trimmed);
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-8 bg-[#302E2B]">
      <div className="w-full max-w-md bg-[#262421] border border-[#3C3A36] rounded-lg p-7 sm:p-8 shadow-2xl flex flex-col items-center">
        {/* Large Official BioChess Logo */}
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-xl overflow-hidden border border-[#3C3A36] bg-[#0F1419] shadow-lg mb-5">
          <Image
            src={BIOCHESS_LOGO}
            alt="Logo ufficiale BioChess"
            fill
            priority
            sizes="(max-width: 640px) 192px, 224px"
            className="object-cover"
            referrerPolicy="no-referrer"
          />
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-white text-center">
          BioChess
        </h1>

        {step === 'google' ? (
          <>
            <p className="text-sm text-[#BABABA] text-center mt-2 leading-relaxed">
              Accedi con Google per sfidare amici online in tempo reale, salvare il tuo punteggio ELO e giocare contro i bot.
            </p>

            {error && (
              <p className="w-full mt-4 text-xs text-red-200 bg-red-950/60 border border-red-500/40 rounded px-3 py-2 text-center">
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={connecting}
              onClick={onGoogleSignIn}
              className="w-full mt-6 py-3 px-4 rounded-md bg-[#81B64C] hover:bg-[#95C85E] active:translate-y-0.5 disabled:opacity-45 disabled:pointer-events-none text-white text-base font-bold border-b-4 border-[#5D8A32] transition-colors inline-flex items-center justify-center gap-2.5"
            >
              <LogIn className="w-5 h-5" />
              <span>{connecting ? 'Connessione...' : 'Accedi con Google'}</span>
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-[#BABABA] text-center mt-2">
              Scegli il tuo username pubblico BioChess per iniziare da 300 ELO.
            </p>

            <form onSubmit={handleSubmitUsername} className="w-full mt-5 space-y-4">
              <div>
                <label
                  htmlFor="auth-username"
                  className="block text-xs font-semibold text-[#C3C2C0] mb-1.5"
                >
                  Username (2-20 caratteri, lettere, numeri o _)
                </label>
                <input
                  id="auth-username"
                  type="text"
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) onClearError();
                  }}
                  placeholder="es. marco94"
                  maxLength={20}
                  className="w-full bg-[#302E2B] border border-[#45433E] rounded px-3.5 py-2.5 text-sm text-white placeholder:text-[#7E7D7A] focus:outline-none focus:border-[#81B64C]"
                />
              </div>

              {error && (
                <p className="text-xs text-red-200 bg-red-950/60 border border-red-500/40 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={connecting || username.trim().length < 2}
                className="w-full py-3 px-4 rounded-md bg-[#81B64C] hover:bg-[#95C85E] active:translate-y-0.5 disabled:opacity-45 disabled:pointer-events-none text-white text-base font-bold border-b-4 border-[#5D8A32] transition-colors inline-flex items-center justify-center gap-2"
              >
                <UserCheck className="w-5 h-5" />
                <span>{connecting ? 'Creazione profilo...' : 'Inizia a giocare'}</span>
              </button>

              <button
                type="button"
                onClick={onSwitchGoogleAccount}
                className="w-full py-2 text-xs text-[#9E9D9A] hover:text-white transition-colors"
              >
                Usa un altro account Google
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
