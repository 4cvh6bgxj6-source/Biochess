'use client';

import React, { useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Swords,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  BOT_DEFINITIONS,
  TIME_CONTROLS,
  type BotId,
  type Challenge,
  type ColorPref,
  type PlayerSummary,
  type RecentMatchSummary,
  type TimeControlId,
} from '@/lib/types';
import { ChessBoard } from './ChessBoard';
import { ChessPiece } from './ChessPiece';
import { MoveQualityBadge } from './MoveQualityBadge';

export type LobbyTab = 'challenge' | 'bots' | 'leaderboard';

interface LobbyViewProps {
  myProfile: PlayerSummary;
  activeTab: LobbyTab;
  onTabChange: (tab: LobbyTab) => void;
  onlinePlayers: PlayerSummary[];
  leaderboard: PlayerSummary[];
  recentMatches: RecentMatchSummary[];
  incomingChallenges: Challenge[];
  outgoingChallenges: Challenge[];
  challengeError: string | null;
  onSendChallenge: (toUsername: string, timeControl: TimeControlId, colorPref: ColorPref) => void;
  onCancelChallenge: (challengeId: string) => void;
  onRespondChallenge: (challengeId: string, accept: boolean) => void;
  onStartBotGame: (botId: BotId, timeControl: TimeControlId, colorPref: ColorPref) => void;
  initialTargetUsername?: string;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const TIME_OPTIONS: TimeControlId[] = ['blitz_3_2', 'blitz_5_0', 'rapid_10_0', 'unlimited'];
const COLOR_OPTIONS: Array<{ id: ColorPref; label: string }> = [
  { id: 'w', label: 'Bianco' },
  { id: 'random', label: 'Casuale' },
  { id: 'b', label: 'Nero' },
];

export function LobbyView({
  myProfile,
  activeTab,
  onTabChange,
  onlinePlayers,
  leaderboard,
  recentMatches,
  incomingChallenges,
  outgoingChallenges,
  challengeError,
  onSendChallenge,
  onCancelChallenge,
  onRespondChallenge,
  onStartBotGame,
  initialTargetUsername = '',
}: LobbyViewProps) {
  const [targetUsername, setTargetUsername] = useState(initialTargetUsername);
  const [timeControl, setTimeControl] = useState<TimeControlId>('blitz_5_0');
  const [colorPref, setColorPref] = useState<ColorPref>('random');
  const [selectedBot, setSelectedBot] = useState<BotId>('knight');
  const [copiedLink, setCopiedLink] = useState(false);

  function handleChallengeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = targetUsername.trim();
    if (!trimmed) return;
    onSendChallenge(trimmed, timeControl, colorPref);
  }

  function handleCopyInviteLink() {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('sfida', myProfile.username);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  }

  const previewOpponentLabel =
    activeTab === 'bots'
      ? `${BOT_DEFINITIONS[selectedBot].name} (${BOT_DEFINITIONS[selectedBot].elo})`
      : targetUsername.trim()
        ? targetUsername.trim()
        : 'Avversario';

  const boardOrientation = colorPref === 'b' ? 'b' : 'w';

  return (
    <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
      {/* Incoming challenges banner */}
      {incomingChallenges.length > 0 && (
        <div className="mb-4 space-y-2">
          {incomingChallenges.map((ch) => (
            <div
              key={ch.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-[#262421] border border-[#81B64C] rounded px-4 py-3"
            >
              <div className="text-sm">
                <span className="font-bold text-white">{ch.from}</span>
                <span className="text-[#BABABA]">
                  {' '}
                  ({ch.fromElo}) ti sfida · {TIME_CONTROLS[ch.timeControl].label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRespondChallenge(ch.id, true)}
                  className="px-4 py-1.5 rounded bg-[#81B64C] hover:bg-[#95C85E] text-white text-xs font-bold border-b-2 border-[#5D8A32] inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accetta</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRespondChallenge(ch.id, false)}
                  className="px-3 py-1.5 rounded bg-[#3C3A36] hover:bg-[#4B4843] text-[#E5E4E2] text-xs font-semibold inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Rifiuta</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chess.com 2-Column Play Arena: Left = Board, Right = Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Chessboard Preview */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full max-w-[600px]">
            {/* Top Opponent Preview Bar */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded bg-[#262421] border border-[#3C3A36] flex items-center justify-center p-1.5">
                  {activeTab === 'bots' ? (
                    <ChessPiece type={BOT_DEFINITIONS[selectedBot].pieceType} color="b" />
                  ) : (
                    <User className="w-4 h-4 text-[#9E9D9A]" />
                  )}
                </div>
                <span className="text-sm font-bold text-[#E5E4E2]">{previewOpponentLabel}</span>
              </div>
              <div className="px-3 py-1 rounded bg-[#262421] font-mono-tabular text-sm font-bold text-[#9E9D9A]">
                {TIME_CONTROLS[timeControl].shortLabel}
              </div>
            </div>

            <ChessBoard
              fen={START_FEN}
              orientation={boardOrientation}
              canInteract={false}
              playerColor={null}
              onMove={() => {}}
            />

            {/* Bottom Self Player Bar */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded bg-[#262421] border border-[#3C3A36] flex items-center justify-center">
                  <User className="w-4 h-4 text-[#81B64C]" />
                </div>
                <span className="text-sm font-bold text-white">
                  {myProfile.username}{' '}
                  <span className="text-[#9E9D9A] font-mono-tabular font-normal">
                    ({myProfile.elo})
                  </span>
                </span>
              </div>
              <div className="px-3 py-1 rounded bg-[#262421] font-mono-tabular text-sm font-bold text-[#9E9D9A]">
                {myProfile.wins}V · {myProfile.draws}P · {myProfile.losses}S
              </div>
            </div>
          </div>
        </div>

        {/* Right: Chess.com Unified Side Panel */}
        <div className="lg:col-span-5 bg-[#262421] border border-[#3C3A36] rounded-md overflow-hidden flex flex-col">
          {/* Panel Tabs */}
          <div className="grid grid-cols-3 bg-[#21201D] border-b border-[#3C3A36]">
            <button
              type="button"
              onClick={() => onTabChange('challenge')}
              className={`py-3 text-xs font-bold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'challenge'
                  ? 'border-[#81B64C] text-white bg-[#262421]'
                  : 'border-transparent text-[#9E9D9A] hover:text-white'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Sfida</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('bots')}
              className={`py-3 text-xs font-bold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'bots'
                  ? 'border-[#81B64C] text-white bg-[#262421]'
                  : 'border-transparent text-[#9E9D9A] hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Bot</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('leaderboard')}
              className={`py-3 text-xs font-bold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'leaderboard'
                  ? 'border-[#81B64C] text-white bg-[#262421]'
                  : 'border-transparent text-[#9E9D9A] hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Classifica</span>
            </button>
          </div>

          <div className="p-5 space-y-5">
            {activeTab === 'challenge' && (
              <>
                <form onSubmit={handleChallengeSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="opponent-username"
                      className="block text-xs font-bold text-[#C3C2C0] mb-1.5"
                    >
                      Username avversario
                    </label>
                    <input
                      id="opponent-username"
                      type="text"
                      value={targetUsername}
                      onChange={(e) => setTargetUsername(e.target.value)}
                      placeholder="Scrivi username (es. marco94)"
                      maxLength={20}
                      className="w-full bg-[#302E2B] border border-[#45433E] rounded px-3 py-2.5 text-sm text-white placeholder:text-[#7E7D7A] focus:outline-none focus:border-[#81B64C]"
                    />
                  </div>

                  {/* Time control selector */}
                  <div>
                    <span className="block text-xs font-bold text-[#C3C2C0] mb-1.5">
                      Cadenza di gioco
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {TIME_OPTIONS.map((tcId) => (
                        <button
                          key={tcId}
                          type="button"
                          onClick={() => setTimeControl(tcId)}
                          className={`py-2 text-xs font-bold rounded border transition-colors whitespace-nowrap ${
                            timeControl === tcId
                              ? 'bg-[#3C3A36] border-[#81B64C] text-white'
                              : 'bg-[#302E2B] border-[#3C3A36] text-[#BABABA] hover:text-white'
                          }`}
                        >
                          {TIME_CONTROLS[tcId].shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color selector */}
                  <div>
                    <span className="block text-xs font-bold text-[#C3C2C0] mb-1.5">
                      Gioca con
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {COLOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setColorPref(opt.id)}
                          className={`py-2 text-xs font-bold rounded border transition-colors whitespace-nowrap ${
                            colorPref === opt.id
                              ? 'bg-[#3C3A36] border-[#81B64C] text-white'
                              : 'bg-[#302E2B] border-[#3C3A36] text-[#BABABA] hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {challengeError && (
                    <p className="text-xs text-red-200 bg-red-950/60 border border-red-500/40 rounded px-3 py-2">
                      {challengeError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!targetUsername.trim()}
                    className="w-full py-3 rounded bg-[#81B64C] hover:bg-[#95C85E] disabled:opacity-45 disabled:pointer-events-none text-white text-base font-extrabold border-b-4 border-[#5D8A32] transition-colors"
                  >
                    Gioca
                  </button>
                </form>

                {outgoingChallenges.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[#3C3A36]">
                    {outgoingChallenges.map((ch) => (
                      <div
                        key={ch.id}
                        className="flex items-center justify-between gap-2 bg-[#21201D] rounded px-3 py-2 text-xs"
                      >
                        <span className="text-[#DAD9D7] truncate">
                          Sfida a <strong className="text-white">{ch.to}</strong> ·{' '}
                          {ch.targetOnline ? 'In attesa...' : 'In coda'}
                        </span>
                        <button
                          type="button"
                          onClick={() => onCancelChallenge(ch.id)}
                          className="text-[#9E9D9A] hover:text-red-300 font-semibold shrink-0"
                        >
                          Annulla
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-[#3C3A36] text-xs">
                  <span className="text-[#9E9D9A] inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>Giocatori online ({onlinePlayers.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="text-[#81B64C] hover:underline font-semibold inline-flex items-center gap-1"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Link copiato' : 'Link invito'}</span>
                  </button>
                </div>

                <div className="max-h-[180px] overflow-y-auto divide-y divide-[#32302C] bg-[#21201D] rounded border border-[#3C3A36]">
                  {onlinePlayers.length === 0 ? (
                    <p className="text-xs text-[#8B8987] text-center py-5 px-3">
                      Nessun altro giocatore online ora. Scrivi un username sopra o sfida un Bot.
                    </p>
                  ) : (
                    onlinePlayers.map((p) => (
                      <div
                        key={p.username}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-white truncate block">
                            {p.username}
                          </span>
                          <span className="text-[#9E9D9A] font-mono-tabular">
                            {p.elo} ELO ·{' '}
                            {p.status === 'online' ? 'Disponibile' : 'In partita'}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={p.status !== 'online'}
                          onClick={() => onSendChallenge(p.username, timeControl, colorPref)}
                          className="px-3 py-1.5 rounded bg-[#3C3A36] hover:bg-[#81B64C] disabled:opacity-40 text-white font-bold transition-colors shrink-0"
                        >
                          Sfida
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeTab === 'bots' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  {(['knight', 'bishop', 'king'] as BotId[]).map((botId) => {
                    const bot = BOT_DEFINITIONS[botId];
                    const active = selectedBot === bot.id;
                    return (
                      <button
                        key={bot.id}
                        type="button"
                        onClick={() => setSelectedBot(bot.id)}
                        className={`w-full text-left p-3 rounded border flex items-center gap-3 transition-colors ${
                          active
                            ? 'bg-[#302E2B] border-[#81B64C]'
                            : 'bg-[#21201D] border-[#3C3A36] hover:border-[#57544E]'
                        }`}
                      >
                        <div className="w-11 h-11 rounded bg-[#262421] border border-[#3C3A36] p-1.5 shrink-0">
                          <ChessPiece type={bot.pieceType} color="w" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-white">{bot.name}</span>
                            <span className="text-xs font-mono-tabular font-bold text-[#81B64C]">
                              {bot.elo}
                            </span>
                          </div>
                          <p className="text-xs text-[#9E9D9A] mt-0.5 line-clamp-1">
                            {bot.tierLabel} · {bot.styleDescription}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <span className="block text-xs font-bold text-[#C3C2C0] mb-1.5">Cadenza</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {TIME_OPTIONS.map((tcId) => (
                      <button
                        key={tcId}
                        type="button"
                        onClick={() => setTimeControl(tcId)}
                        className={`py-2 text-xs font-bold rounded border transition-colors whitespace-nowrap ${
                          timeControl === tcId
                            ? 'bg-[#3C3A36] border-[#81B64C] text-white'
                            : 'bg-[#302E2B] border-[#3C3A36] text-[#BABABA] hover:text-white'
                        }`}
                      >
                        {TIME_CONTROLS[tcId].shortLabel}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-bold text-[#C3C2C0] mb-1.5">Colore</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setColorPref(opt.id)}
                        className={`py-2 text-xs font-bold rounded border transition-colors whitespace-nowrap ${
                          colorPref === opt.id
                            ? 'bg-[#3C3A36] border-[#81B64C] text-white'
                            : 'bg-[#302E2B] border-[#3C3A36] text-[#BABABA] hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartBotGame(selectedBot, timeControl, colorPref)}
                  className="w-full py-3 rounded bg-[#81B64C] hover:bg-[#95C85E] text-white text-base font-extrabold border-b-4 border-[#5D8A32] transition-colors"
                >
                  Gioca contro {BOT_DEFINITIONS[selectedBot].name}
                </button>
              </div>
            )}

            {activeTab === 'leaderboard' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-[#C3C2C0] mb-2">Classifica BioChess</h3>
                  <div className="max-h-[200px] overflow-y-auto bg-[#21201D] rounded border border-[#3C3A36] divide-y divide-[#32302C]">
                    {leaderboard.length === 0 ? (
                      <p className="text-xs text-[#8B8987] text-center py-6">
                        Nessun giocatore ancora.
                      </p>
                    ) : (
                      leaderboard.map((p, idx) => (
                        <div
                          key={p.username}
                          className="px-3 py-2 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono-tabular text-[#8B8987] w-4">{idx + 1}.</span>
                            <span className="font-bold text-white truncate">{p.username}</span>
                          </div>
                          <span className="font-mono-tabular text-[#81B64C] font-bold">
                            {p.elo}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-[#C3C2C0] mb-2">Ultime Partite</h3>
                  <div className="max-h-[190px] overflow-y-auto bg-[#21201D] rounded border border-[#3C3A36] divide-y divide-[#32302C]">
                    {recentMatches.length === 0 ? (
                      <p className="text-xs text-[#8B8987] text-center py-6">
                        Nessuna partita conclusa ancora.
                      </p>
                    ) : (
                      recentMatches.map((m) => (
                        <div
                          key={m.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="text-white truncate">
                              {m.white} <span className="text-[#8B8987]">vs</span> {m.black}
                            </p>
                            <p className="text-[11px] text-[#9E9D9A] truncate">{m.endReason}</p>
                          </div>
                          <span className="font-mono-tabular font-bold text-[#DAD9D7] shrink-0">
                            {m.winner === 'w' ? '1-0' : m.winner === 'b' ? '0-1' : '½-½'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Compact evaluation legend at panel bottom */}
            <div className="pt-3 border-t border-[#3C3A36] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9E9D9A]">
              <span className="inline-flex items-center gap-1">
                <MoveQualityBadge quality="brilliant" size="sm" />
                <span>Brilliant</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <MoveQualityBadge quality="great" size="sm" />
                <span>Great</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <MoveQualityBadge quality="good" size="sm" />
                <span>Buona</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <MoveQualityBadge quality="mistake" size="sm" />
                <span>Mistake</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <MoveQualityBadge quality="blunder" size="sm" />
                <span>Blunder</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
