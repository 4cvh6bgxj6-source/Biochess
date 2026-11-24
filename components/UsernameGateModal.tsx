'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';
import { BIOCHESS_LOGO } from '@/lib/brand';

type AuthMode = 'login' | 'signin';

interface UsernameGateModalProps {
  error: string | null;
  connecting: boolean;
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string) => void;
  onClearError: () => void;
}

export function UsernameGateModal({
  error,
  connecting,
  onLogin,
  onRegister,
  onClearError,
}: UsernameGateModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function switchMode(nextMode: AuthMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    onClearError();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) return;
    if (mode === 'login') {
      onLogin(trimmedUser, password);
    } else {
      onRegister(trimmedUser, password);
    }
  }

  const canSubmit =
    !connecting &&
    username.trim().length >= 2 &&
    (mode === 'login' ? password.length >= 1 : password.length >= 4);

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
        <p className="text-sm text-[#BABABA] text-center mt-1.5">
          {mode === 'login'
            ? 'Accedi al tuo account con username e password'
            : 'Crea un nuovo profilo con username e password'}
        </p>

        {/* Log in / Sign in Mode Switcher */}
        <div className="w-full grid grid-cols-2 gap-1.5 bg-[#1E1C1A] p-1 rounded-md border border-[#3C3A36] mt-5">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`py-2 rounded text-sm font-bold transition-colors ${
              mode === 'login'
                ? 'bg-[#3C3A36] text-white shadow'
                : 'text-[#9E9D9A] hover:text-white'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`py-2 rounded text-sm font-bold transition-colors ${
              mode === 'signin'
                ? 'bg-[#3C3A36] text-white shadow'
                : 'text-[#9E9D9A] hover:text-white'
            }`}
          >
            Sign in
          </button>
        </div>

        <form onSubmit={handleSubmit} className="w-full mt-5 space-y-4">
          <div>
            <label
              htmlFor="auth-username"
              className="block text-xs font-semibold text-[#C3C2C0] mb-1.5"
            >
              Username
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

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-semibold text-[#C3C2C0] mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) onClearError();
                }}
                placeholder={mode === 'signin' ? 'Minimo 4 caratteri' : 'Inserisci la password'}
                maxLength={128}
                className="w-full bg-[#302E2B] border border-[#45433E] rounded pl-3.5 pr-10 py-2.5 text-sm text-white placeholder:text-[#7E7D7A] focus:outline-none focus:border-[#81B64C]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9E9D9A] hover:text-white p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-200 bg-red-950/60 border border-red-500/40 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 px-4 rounded-md bg-[#81B64C] hover:bg-[#95C85E] active:translate-y-0.5 disabled:opacity-45 disabled:pointer-events-none text-white text-base font-bold border-b-4 border-[#5D8A32] transition-colors"
          >
            {connecting
              ? 'Verifica in corso...'
              : mode === 'login'
                ? 'Log in'
                : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
