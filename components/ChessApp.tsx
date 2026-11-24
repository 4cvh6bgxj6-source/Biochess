'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { Chess } from 'chess.js';
import { Bot, LogOut, Swords, Trophy } from 'lucide-react';
import type {
  BotId,
  Challenge,
  ClientEvent,
  ColorPref,
  GameState,
  PlayerSummary,
  RecentMatchSummary,
  ServerEvent,
  TimeControlId,
} from '@/lib/types';
import { BIOCHESS_LOGO } from '@/lib/brand';
import { soundFX } from '@/lib/sound';
import { UsernameGateModal } from './UsernameGateModal';
import { LobbyView, type LobbyTab } from './LobbyView';
import { GameWorkspace } from './GameWorkspace';
import { IncomingChallengeToast } from './IncomingChallengeToast';

export function ChessApp() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeGameIdRef = useRef<string | null>(null);
  const myUsernameRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const transportModeRef = useRef<'ws' | 'http'>('ws');
  const rpcInFlightCountRef = useRef(0);
  const poll401CountRef = useRef(0);

  const [wsReady, setWsReady] = useState(false);
  const [transportMode, setTransportMode] = useState<'ws' | 'http'>('ws');
  const [connecting, setConnecting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);

  const [profile, setProfile] = useState<PlayerSummary | null>(null);
  const [onlinePlayers, setOnlinePlayers] = useState<PlayerSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<PlayerSummary[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatchSummary[]>([]);
  const [incomingChallenges, setIncomingChallenges] = useState<Challenge[]>([]);
  const [outgoingChallenges, setOutgoingChallenges] = useState<Challenge[]>([]);

  const [activeGame, setActiveGame] = useState<GameState | null>(null);
  const [viewMode, setViewMode] = useState<'lobby' | 'game'>('lobby');
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>('challenge');
  const [whiteTimeMs, setWhiteTimeMs] = useState(0);
  const [blackTimeMs, setBlackTimeMs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [inviteTarget, setInviteTarget] = useState('');

  useEffect(() => {
    activeGameIdRef.current = activeGame?.id || null;
  }, [activeGame?.id]);

  useEffect(() => {
    myUsernameRef.current = profile?.username || null;
  }, [profile?.username]);

  const handleServerEventRef = useRef<(evt: ServerEvent) => void>(() => {});

  const sendWs = useCallback((event: ClientEvent) => {
    const ws = wsRef.current;
    if (transportModeRef.current === 'ws' && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (myUsernameRef.current && sessionTokenRef.current) {
      headers.Authorization = `Bearer ${sessionTokenRef.current}`;
      headers['x-biochess-user'] = myUsernameRef.current;
    }

    rpcInFlightCountRef.current += 1;
    fetch('/api/rpc', {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    })
      .then(async (res) => {
        if (!res.ok && res.status !== 401) {
          setConnecting(false);
          return;
        }
        if (res.ok) {
          poll401CountRef.current = 0;
        }
        const data = (await res.json()) as { events?: ServerEvent[] };
        if (Array.isArray(data.events)) {
          for (const evt of data.events) {
            handleServerEventRef.current(evt);
          }
        }
      })
      .catch(() => {
        setConnecting(false);
      })
      .finally(() => {
        rpcInFlightCountRef.current = Math.max(0, rpcInFlightCountRef.current - 1);
      });
  }, []);

  const handleServerEvent = useCallback((evt: ServerEvent) => {
    if (evt.type === 'auth:ok') {
      poll401CountRef.current = 0;
      setConnecting(false);
      setAuthError(null);
      setProfile(evt.profile);
      myUsernameRef.current = evt.profile.username;
      sessionTokenRef.current = evt.token;
      if (evt.activeGame) {
        setActiveGame(evt.activeGame);
        setWhiteTimeMs(evt.activeGame.whiteTimeMs);
        setBlackTimeMs(evt.activeGame.blackTimeMs);
        setViewMode('game');
      }
      sendWs({ type: 'lobby:refresh' });
      return;
    }

    if (evt.type === 'auth:error') {
      setConnecting(false);
      setAuthError(evt.message);
      setProfile(null);
      sessionTokenRef.current = null;
      return;
    }

    if (evt.type === 'lobby:state') {
      setOnlinePlayers(evt.onlinePlayers);
      setLeaderboard(evt.leaderboard);
      setRecentMatches(evt.recentMatches);
      setIncomingChallenges(evt.incomingChallenges);
      setOutgoingChallenges(evt.outgoingChallenges);
      return;
    }

    if (evt.type === 'challenge:sent') {
      setChallengeError(null);
      setOutgoingChallenges((prev) =>
        prev.some((c) => c.id === evt.challenge.id) ? prev : [evt.challenge, ...prev]
      );
      return;
    }

    if (evt.type === 'challenge:received') {
      soundFX.playChallenge();
      setIncomingChallenges((prev) =>
        prev.some((c) => c.id === evt.challenge.id) ? prev : [evt.challenge, ...prev]
      );
      return;
    }

    if (evt.type === 'challenge:removed') {
      setIncomingChallenges((prev) => prev.filter((c) => c.id !== evt.challengeId));
      setOutgoingChallenges((prev) => prev.filter((c) => c.id !== evt.challengeId));
      if (evt.reason) {
        setChallengeError(evt.reason);
      }
      return;
    }

    if (evt.type === 'challenge:error') {
      setChallengeError(evt.message);
      return;
    }

    if (evt.type === 'game:started') {
      setGameError(null);
      setChallengeError(null);
      setActiveGame(evt.game);
      setWhiteTimeMs(evt.game.whiteTimeMs);
      setBlackTimeMs(evt.game.blackTimeMs);
      setViewMode('game');
      soundFX.playChallenge();
      return;
    }

    if (evt.type === 'game:updated') {
      setGameError(null);
      setActiveGame((prev) => {
        if (prev && prev.id === evt.game.id && evt.game.moves.length > prev.moves.length) {
          const lastMove = evt.game.moves[evt.game.moves.length - 1];
          if (evt.game.status !== 'active') {
            soundFX.playGameOver();
          } else if (lastMove?.san.includes('+') || lastMove?.san.includes('#')) {
            soundFX.playCheck();
          } else if (lastMove?.captured) {
            soundFX.playCapture();
          } else {
            soundFX.playMove();
          }
        } else if (prev && prev.status === 'active' && evt.game.status !== 'active') {
          soundFX.playGameOver();
        }
        return evt.game;
      });
      setWhiteTimeMs(evt.game.whiteTimeMs);
      setBlackTimeMs(evt.game.blackTimeMs);
      return;
    }

    if (evt.type === 'game:chat_message') {
      setActiveGame((prev) => {
        if (!prev || prev.id !== evt.gameId) return prev;
        if (prev.chat.some((m) => m.id === evt.message.id)) return prev;
        if (
          evt.message.kind !== 'system' &&
          evt.message.sender.toLowerCase() !== (myUsernameRef.current || '').toLowerCase()
        ) {
          soundFX.playChat();
        }
        return {
          ...prev,
          chat: [...prev.chat, evt.message],
        };
      });
      return;
    }

    if (evt.type === 'clock:sync') {
      if (activeGameIdRef.current === evt.gameId) {
        setWhiteTimeMs(evt.whiteTimeMs);
        setBlackTimeMs(evt.blackTimeMs);
      }
      return;
    }

    if (evt.type === 'game:error') {
      setGameError(evt.message);
      setTimeout(() => setGameError(null), 3000);
    }
  }, [sendWs]);

  useEffect(() => {
    handleServerEventRef.current = handleServerEvent;
  }, [handleServerEvent]);

  useEffect(() => {
    let unmounted = false;
    let switchedToHttp = false;
    let fallbackTimer: NodeJS.Timeout | null = null;

    const params = new URLSearchParams(window.location.search);
    const sfida = params.get('sfida');
    if (sfida) {
      queueMicrotask(() => {
        if (!unmounted) setInviteTarget(sfida);
      });
    }

    async function activateHttpFallback() {
      if (unmounted) return;
      switchedToHttp = true;
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
      try {
        const res = await fetch('/api/rpc?ping=1', { cache: 'no-store' });
        if (!unmounted && res.ok) {
          transportModeRef.current = 'http';
          setTransportMode('http');
          setWsReady(true);
          return;
        }
      } catch {
        // retry shortly
      }
      if (!unmounted) {
        reconnectTimerRef.current = setTimeout(activateHttpFallback, 1200);
      }
    }

    function connectWs() {
      if (unmounted) return;
      let ws: WebSocket;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      } catch {
        void activateHttpFallback();
        return;
      }

      wsRef.current = ws;
      let opened = false;

      // If WebSocket doesn't open within 600ms (e.g. blocked or unsupported on Vercel), switch cleanly to HTTP
      fallbackTimer = setTimeout(() => {
        if (!opened && !unmounted) {
          void activateHttpFallback();
        }
      }, 600);

      ws.onopen = () => {
        opened = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (unmounted || switchedToHttp) {
          ws.close();
          return;
        }
        transportModeRef.current = 'ws';
        setTransportMode('ws');
        setWsReady(true);

        const savedUser = myUsernameRef.current;
        const savedToken = sessionTokenRef.current;
        if (savedUser && savedToken) {
          setConnecting(true);
          ws.send(
            JSON.stringify({
              type: 'auth:resume',
              username: savedUser,
              token: savedToken,
            } satisfies ClientEvent)
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as ServerEvent;
          handleServerEventRef.current(parsed);
        } catch {
          // ignore malformed payload
        }
      };

      ws.onerror = () => {
        if (!opened && !unmounted) {
          void activateHttpFallback();
        }
      };

      ws.onclose = () => {
        if (unmounted || switchedToHttp) return;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        void activateHttpFallback();
      };
    }

    connectWs();

    return () => {
      unmounted = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Poll server events sequentially on the unified /api/rpc endpoint when running in HTTP fallback mode.
  // Active bot games receive all bot moves and chat synchronously via POST /api/rpc, so no polling is needed during bot play.
  useEffect(() => {
    if (transportMode !== 'http' || !profile) return;
    if (activeGame?.status === 'active' && activeGame.isBotGame) return;

    let cancelled = false;
    let pollTimer: NodeJS.Timeout | null = null;
    const pollMs = activeGame?.status === 'active' ? 500 : 1500;

    async function runPoll() {
      if (cancelled) return;
      if (
        rpcInFlightCountRef.current === 0 &&
        myUsernameRef.current &&
        sessionTokenRef.current
      ) {
        try {
          const res = await fetch('/api/rpc', {
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${sessionTokenRef.current}`,
              'x-biochess-user': myUsernameRef.current,
            },
          });
          if (res.ok) {
            poll401CountRef.current = 0;
            const data = (await res.json()) as { events?: ServerEvent[] };
            if (!cancelled && Array.isArray(data.events)) {
              for (const evt of data.events) {
                handleServerEventRef.current(evt);
              }
            }
          } else if (res.status === 401) {
            poll401CountRef.current += 1;
            if (poll401CountRef.current >= 4) {
              const data = (await res.json()) as { events?: ServerEvent[] };
              if (!cancelled && Array.isArray(data.events)) {
                for (const evt of data.events) {
                  handleServerEventRef.current(evt);
                }
              }
            }
          }
        } catch {
          // ignore transient network blip
        }
      }
      if (!cancelled) {
        pollTimer = setTimeout(runPoll, pollMs);
      }
    }

    pollTimer = setTimeout(runPoll, pollMs);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [transportMode, profile, activeGame?.status, activeGame?.isBotGame]);

  useEffect(() => {
    if (
      !activeGame ||
      activeGame.status !== 'active' ||
      activeGame.timeControl === 'unlimited' ||
      activeGame.moves.length < 1
    ) {
      return;
    }

    const interval = setInterval(() => {
      if (activeGame.turn === 'w') {
        setWhiteTimeMs((t) => Math.max(0, t - 200));
      } else {
        setBlackTimeMs((t) => Math.max(0, t - 200));
      }
    }, 200);

    return () => clearInterval(interval);
  }, [activeGame]);

  function handleLogin(username: string, password: string) {
    setAuthError(null);
    setConnecting(true);
    sendWs({ type: 'auth:login', username, password });
  }

  function handleRegister(username: string, password: string) {
    setAuthError(null);
    setConnecting(true);
    sendWs({ type: 'auth:register', username, password });
  }

  function handleLogout() {
    sendWs({ type: 'auth:logout' });
    sessionTokenRef.current = null;
    myUsernameRef.current = null;
    setProfile(null);
    setActiveGame(null);
    setViewMode('lobby');
  }

  function handleToggleMute() {
    const next = !muted;
    setMuted(next);
    soundFX.setMuted(next);
  }

  function handlePlayerMove(from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') {
    if (!activeGame || activeGame.status !== 'active') return;
    try {
      const chess = new Chess(activeGame.fen);
      const movingColor = chess.turn();
      const moveRes = chess.move({ from, to, promotion: promotion || 'q' });
      if (moveRes) {
        if (chess.isCheckmate() || chess.isDraw()) {
          soundFX.playGameOver();
        } else if (chess.inCheck()) {
          soundFX.playCheck();
        } else if (moveRes.captured) {
          soundFX.playCapture();
        } else {
          soundFX.playMove();
        }
        setActiveGame((prev) => {
          if (!prev || prev.id !== activeGame.id) return prev;
          return {
            ...prev,
            fen: chess.fen(),
            turn: chess.turn(),
            moves: [
              ...prev.moves,
              {
                san: moveRes.san,
                from: moveRes.from,
                to: moveRes.to,
                fen: chess.fen(),
                color: movingColor,
                captured: moveRes.captured,
                promotion: moveRes.promotion,
                timestamp: Date.now(),
              },
            ],
          };
        });
      }
    } catch {
      // let server validate if anything unexpected
    }

    sendWs({
      type: 'game:move',
      gameId: activeGame.id,
      from,
      to,
      promotion,
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#302E2B] text-[#F3F3F2]">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-[#3C3A36] bg-[#262421]">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: BioChess Emblem + Wordmark */}
          <button
            type="button"
            onClick={() => setViewMode('lobby')}
            className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            <span className="relative w-9 h-9 rounded overflow-hidden border border-[#3C3A36] bg-[#0F1419] shrink-0">
              <Image
                src={BIOCHESS_LOGO}
                alt="BioChess"
                fill
                sizes="36px"
                className="object-cover"
                referrerPolicy="no-referrer"
              />
            </span>
            <span>BioChess</span>
          </button>

          {/* Zone 2: Clean Chess.com-style single-line navigation links */}
          {profile && (
            <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-[#BABABA]">
              <button
                type="button"
                onClick={() => {
                  setLobbyTab('challenge');
                  setViewMode('lobby');
                }}
                className={`inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'lobby' && lobbyTab === 'challenge' ? 'text-white' : ''
                }`}
              >
                <Swords className="w-4 h-4 text-[#81B64C]" />
                <span>Gioca</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLobbyTab('bots');
                  setViewMode('lobby');
                }}
                className={`inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'lobby' && lobbyTab === 'bots' ? 'text-white' : ''
                }`}
              >
                <Bot className="w-4 h-4 text-[#81B64C]" />
                <span>Bot</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLobbyTab('leaderboard');
                  setViewMode('lobby');
                }}
                className={`inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'lobby' && lobbyTab === 'leaderboard' ? 'text-white' : ''
                }`}
              >
                <Trophy className="w-4 h-4 text-[#E6912C]" />
                <span>Classifica</span>
              </button>
              {activeGame && (
                <button
                  type="button"
                  onClick={() => setViewMode('game')}
                  className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'game' ? 'text-[#81B64C]' : ''
                  }`}
                >
                  Partita
                </button>
              )}
            </nav>
          )}

          {/* Zone 3: 1 primary user action */}
          <div className="flex items-center gap-3 shrink-0">
            {profile ? (
              activeGame && activeGame.status === 'active' && viewMode === 'lobby' ? (
                <button
                  type="button"
                  onClick={() => setViewMode('game')}
                  className="px-3.5 py-1.5 rounded bg-[#81B64C] hover:bg-[#95C85E] text-white text-xs font-bold border-b-2 border-[#5D8A32] whitespace-nowrap shrink-0"
                >
                  Torna in partita
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#3C3A36] text-[#E5E4E2] text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <span className="max-w-[120px] truncate">{profile.username}</span>
                  <LogOut className="w-3.5 h-3.5 text-[#9E9D9A]" />
                </button>
              )
            ) : (
              <span className="text-xs font-semibold text-[#9E9D9A] whitespace-nowrap shrink-0">
                {wsReady ? 'Connesso' : 'Connessione...'}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {!profile ? (
          <UsernameGateModal
            error={authError}
            connecting={connecting || !wsReady}
            onLogin={handleLogin}
            onRegister={handleRegister}
            onClearError={() => setAuthError(null)}
          />
        ) : (
          <AnimatePresence mode="wait">
            {viewMode === 'game' && activeGame ? (
              <motion.div
                key={`game-${activeGame.id}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
              >
                {gameError && (
                  <div className="max-w-[1160px] mx-auto px-4 sm:px-6 pt-3">
                    <p className="text-xs text-red-200 bg-red-950/70 border border-red-500/40 rounded px-3 py-2">
                      {gameError}
                    </p>
                  </div>
                )}
                <GameWorkspace
                  game={activeGame}
                  myUsername={profile.username}
                  whiteTimeMs={whiteTimeMs}
                  blackTimeMs={blackTimeMs}
                  muted={muted}
                  onToggleMute={handleToggleMute}
                  onMove={handlePlayerMove}
                  onSendChat={(text) =>
                    sendWs({ type: 'game:chat', gameId: activeGame.id, text })
                  }
                  onResign={() => sendWs({ type: 'game:resign', gameId: activeGame.id })}
                  onOfferDraw={() => sendWs({ type: 'game:offer_draw', gameId: activeGame.id })}
                  onRespondDraw={(accept) =>
                    sendWs({ type: 'game:respond_draw', gameId: activeGame.id, accept })
                  }
                  onRematch={() => sendWs({ type: 'game:rematch', gameId: activeGame.id })}
                  onBackToLobby={() => {
                    if (activeGame.status !== 'active') {
                      sendWs({ type: 'game:leave_view' });
                      setActiveGame(null);
                    }
                    setViewMode('lobby');
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="lobby"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
              >
                <LobbyView
                  myProfile={profile}
                  activeTab={lobbyTab}
                  onTabChange={setLobbyTab}
                  onlinePlayers={onlinePlayers}
                  leaderboard={leaderboard}
                  recentMatches={recentMatches}
                  incomingChallenges={incomingChallenges}
                  outgoingChallenges={outgoingChallenges}
                  challengeError={challengeError}
                  initialTargetUsername={inviteTarget}
                  onSendChallenge={(toUsername, timeControl, colorPref) => {
                    setChallengeError(null);
                    sendWs({
                      type: 'challenge:send',
                      toUsername,
                      timeControl,
                      colorPref,
                    });
                  }}
                  onCancelChallenge={(challengeId) =>
                    sendWs({ type: 'challenge:cancel', challengeId })
                  }
                  onRespondChallenge={(challengeId, accept) =>
                    sendWs({ type: 'challenge:respond', challengeId, accept })
                  }
                  onStartBotGame={(
                    botId: BotId,
                    timeControl: TimeControlId,
                    colorPref: ColorPref
                  ) => {
                    sendWs({ type: 'bot:start', botId, timeControl, colorPref });
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {profile && incomingChallenges.length > 0 && viewMode === 'game' && (
        <IncomingChallengeToast
          challenge={incomingChallenges[0]}
          onAccept={() =>
            sendWs({
              type: 'challenge:respond',
              challengeId: incomingChallenges[0].id,
              accept: true,
            })
          }
          onDecline={() =>
            sendWs({
              type: 'challenge:respond',
              challengeId: incomingChallenges[0].id,
              accept: false,
            })
          }
        />
      )}
    </div>
  );
}
