'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { Bot, LogOut, Swords, Trophy } from 'lucide-react';
import type {
  BotId,
  Challenge,
  ChatMessage,
  ColorPref,
  GameMove,
  GameState,
  PieceColor,
  PlayerSummary,
  RecentMatchSummary,
  TimeControlId,
} from '@/lib/types';
import { BIOCHESS_LOGO } from '@/lib/brand';
import { soundFX } from '@/lib/sound';
import { auth, googleProvider } from '@/lib/firebase';
import {
  assembleGameState,
  cancelPendingChallenge,
  claimTimeoutInFirestore,
  createBotGameInFirestore,
  offerDrawInFirestore,
  registerBioChessUsername,
  requestOrAcceptRematchInFirestore,
  resignGameInFirestore,
  respondDrawInFirestore,
  respondToChallenge,
  runBotTurnInFirestore,
  sendChallengeToUser,
  sendPlayerChatAndMaybeBotReply,
  setPresence,
  settleMyEloForGame,
  subscribeChallenges,
  subscribeGameRoom,
  subscribeLeaderboard,
  subscribeMyGames,
  subscribeMyProfile,
  subscribeOnlinePlayers,
  subscribeRecentMatches,
  submitMoveToFirestore,
  type GameDocSnapshot,
} from '@/lib/firestore-chess';
import { UsernameGateModal } from './UsernameGateModal';
import { LobbyView, type LobbyTab } from './LobbyView';
import { GameWorkspace } from './GameWorkspace';
import { IncomingChallengeToast } from './IncomingChallengeToast';

export function ChessApp() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loadedProfileUid, setLoadedProfileUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerSummary | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [runtimeFatalError, setRuntimeFatalError] = useState<Error | null>(null);

  const [onlinePlayers, setOnlinePlayers] = useState<PlayerSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<PlayerSummary[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatchSummary[]>([]);
  const [incomingChallenges, setIncomingChallenges] = useState<Challenge[]>([]);
  const [outgoingChallenges, setOutgoingChallenges] = useState<Challenge[]>([]);

  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGameDoc, setActiveGameDoc] = useState<GameDocSnapshot | null>(null);
  const [activeMoves, setActiveMoves] = useState<GameMove[]>([]);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);

  const [viewMode, setViewMode] = useState<'lobby' | 'game'>('lobby');
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>('challenge');
  const [liveClock, setLiveClock] = useState<{ gameId: string; w: number; b: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [inviteTarget, setInviteTarget] = useState('');

  const settlingGameIdsRef = useRef<Set<string>>(new Set());
  const botTurnKeyRef = useRef<string>('');
  const humanMoveMetaRef = useRef<{
    gameId: string;
    ply: number;
    quality: GameMove['quality'];
    captured?: string;
    inCheck: boolean;
  } | null>(null);
  const timeoutClaimedIdRef = useRef<string | null>(null);
  const prevMovesCountRef = useRef<Record<string, number>>({});
  const prevGameStatusRef = useRef<Record<string, string>>({});
  const prevChatCountRef = useRef<Record<string, number>>({});
  const prevIncomingChallengeIdsRef = useRef<Set<string>>(new Set());

  if (runtimeFatalError) {
    throw runtimeFatalError;
  }

  const handleListenerError = useCallback((err: Error) => {
    setRuntimeFatalError(err);
  }, []);

  const profileLoaded = Boolean(authUser && loadedProfileUid === authUser.uid);
  const hasProfile = Boolean(profile);
  const profileUsername = profile?.username || '';

  // Parse invite link ?sfida=username
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sfida = params.get('sfida');
    if (sfida) {
      queueMicrotask(() => setInviteTarget(sfida));
    }
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setLoadedProfileUid(null);
        setActiveGameId(null);
        setActiveGameDoc(null);
        setActiveMoves([]);
        setActiveMessages([]);
        setOnlinePlayers([]);
        setLeaderboard([]);
        setRecentMatches([]);
        setIncomingChallenges([]);
        setOutgoingChallenges([]);
        setViewMode('lobby');
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to own profile once signed in
  useEffect(() => {
    if (!authReady || !authUser) return;
    const uid = authUser.uid;
    const unsub = subscribeMyProfile(
      uid,
      (prof) => {
        setProfile(prof);
        setLoadedProfileUid(uid);
      },
      handleListenerError
    );
    return () => unsub();
  }, [authReady, authUser, handleListenerError]);

  // Set online presence and clean offline transition on page unload
  useEffect(() => {
    if (!authUser || !hasProfile) return;
    const uid = authUser.uid;
    void setPresence(uid, true, activeGameId || '').catch((err: Error) =>
      setRuntimeFatalError(err)
    );

    const handlePageHide = () => {
      void setPresence(uid, false).catch(() => {});
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [authUser, hasProfile, activeGameId]);

  // Subscribe to Lobby & My Games ONLY when profile exists
  useEffect(() => {
    if (!authReady || !authUser || !hasProfile) return;
    const uid = authUser.uid;

    const unsubOnline = subscribeOnlinePlayers(uid, setOnlinePlayers, handleListenerError);
    const unsubBoard = subscribeLeaderboard(setLeaderboard, handleListenerError);
    const unsubRecent = subscribeRecentMatches(setRecentMatches, handleListenerError);
    const unsubChallenges = subscribeChallenges(
      uid,
      (inc) => {
        for (const ch of inc) {
          if (!prevIncomingChallengeIdsRef.current.has(ch.id)) {
            soundFX.playChallenge();
          }
        }
        prevIncomingChallengeIdsRef.current = new Set(inc.map((c) => c.id));
        setIncomingChallenges(inc);
      },
      setOutgoingChallenges,
      handleListenerError
    );

    const unsubMyGames = subscribeMyGames(
      uid,
      (latestActive, unappliedFinished) => {
        if (latestActive) {
          setActiveGameId((curr) => {
            if (curr !== latestActive.id) {
              soundFX.playChallenge();
              setViewMode('game');
            }
            return latestActive.id;
          });
        }

        for (const finGame of unappliedFinished) {
          if (!settlingGameIdsRef.current.has(finGame.id)) {
            settlingGameIdsRef.current.add(finGame.id);
            void settleMyEloForGame(uid, finGame).catch((err: Error) =>
              setRuntimeFatalError(err)
            );
          }
        }
      },
      handleListenerError
    );

    return () => {
      unsubOnline();
      unsubBoard();
      unsubRecent();
      unsubChallenges();
      unsubMyGames();
    };
  }, [authReady, authUser, hasProfile, handleListenerError]);

  // Subscribe to active game room (game doc + moves + chat)
  useEffect(() => {
    if (!authReady || !authUser || !hasProfile || !activeGameId) {
      return;
    }

    const unsub = subscribeGameRoom(
      activeGameId,
      (docSnap) => {
        setActiveGameDoc(docSnap);
        if (docSnap?.rematchGameId && docSnap.rematchGameId !== activeGameId) {
          setActiveGameId(docSnap.rematchGameId);
          setViewMode('game');
          soundFX.playChallenge();
        }
      },
      setActiveMoves,
      setActiveMessages,
      handleListenerError
    );

    return () => unsub();
  }, [authReady, authUser, hasProfile, activeGameId, handleListenerError]);

  const activeGame: GameState | null = useMemo(() => {
    if (!activeGameId || !activeGameDoc || activeGameDoc.id !== activeGameId) return null;
    return assembleGameState(activeGameDoc, activeMoves, activeMessages);
  }, [activeGameId, activeGameDoc, activeMoves, activeMessages]);

  // Audio FX for moves, game end, and opponent chat messages
  useEffect(() => {
    if (!activeGame) return;
    const gId = activeGame.id;
    const prevCount = prevMovesCountRef.current[gId] ?? activeGame.moves.length;
    const prevStatus = prevGameStatusRef.current[gId] ?? activeGame.status;

    if (activeGame.moves.length > prevCount) {
      const lastMove = activeGame.moves[activeGame.moves.length - 1];
      if (activeGame.status !== 'active') {
        soundFX.playGameOver();
      } else if (lastMove?.san.includes('+') || lastMove?.san.includes('#')) {
        soundFX.playCheck();
      } else if (lastMove?.captured) {
        soundFX.playCapture();
      } else {
        soundFX.playMove();
      }
    } else if (prevStatus === 'active' && activeGame.status !== 'active') {
      soundFX.playGameOver();
    }

    prevMovesCountRef.current[gId] = activeGame.moves.length;
    prevGameStatusRef.current[gId] = activeGame.status;

    const prevChat = prevChatCountRef.current[gId] ?? activeGame.chat.length;
    if (activeGame.chat.length > prevChat) {
      const newest = activeGame.chat[activeGame.chat.length - 1];
      if (
        newest &&
        newest.kind !== 'system' &&
        newest.sender.toLowerCase() !== profileUsername.toLowerCase()
      ) {
        soundFX.playChat();
      }
    }
    prevChatCountRef.current[gId] = activeGame.chat.length;
  }, [activeGame, profileUsername]);

  const isClockRunning = Boolean(
    activeGame &&
      activeGame.status === 'active' &&
      activeGame.timeControl !== 'unlimited' &&
      activeGame.moves.length >= 1
  );

  const whiteTimeMs =
    isClockRunning && liveClock && activeGame && liveClock.gameId === activeGame.id
      ? liveClock.w
      : (activeGame?.whiteTimeMs ?? 0);

  const blackTimeMs =
    isClockRunning && liveClock && activeGame && liveClock.gameId === activeGame.id
      ? liveClock.b
      : (activeGame?.blackTimeMs ?? 0);

  // Live clock synchronization (drift-free using lastMoveAt) + timeout detection
  useEffect(() => {
    if (!activeGame || !isClockRunning) return;

    const tick = () => {
      const elapsed = Math.max(0, Date.now() - activeGame.lastMoveAt);
      const nextW =
        activeGame.turn === 'w' ? Math.max(0, activeGame.whiteTimeMs - elapsed) : activeGame.whiteTimeMs;
      const nextB =
        activeGame.turn === 'b' ? Math.max(0, activeGame.blackTimeMs - elapsed) : activeGame.blackTimeMs;
      setLiveClock({ gameId: activeGame.id, w: nextW, b: nextB });

      if (authUser && (nextW <= 0 || nextB <= 0) && timeoutClaimedIdRef.current !== activeGame.id) {
        timeoutClaimedIdRef.current = activeGame.id;
        const timedOut: PieceColor = nextW <= 0 ? 'w' : 'b';
        void claimTimeoutInFirestore(activeGame, timedOut, authUser.uid).catch((err: Error) =>
          setRuntimeFatalError(err)
        );
      }
    };

    const initTimer = setTimeout(tick, 0);
    const interval = setInterval(tick, 200);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [activeGame, isClockRunning, authUser]);

  // Bot turn scheduler (runs smoothly after 280ms when it is the Bot's turn)
  useEffect(() => {
    if (!authUser || !activeGame) return;
    if (activeGame.status !== 'active' || !activeGame.isBotGame || !activeGame.botId) return;
    if (activeGameDoc && activeGame.moves.length < activeGameDoc.movesCount) return;

    const botTurn =
      (activeGame.white.isBot && activeGame.turn === 'w') ||
      (activeGame.black.isBot && activeGame.turn === 'b');
    if (!botTurn) return;

    const turnKey = `${activeGame.id}:${activeGame.moves.length}`;
    if (botTurnKeyRef.current === turnKey) return;
    botTurnKeyRef.current = turnKey;

    const meta =
      humanMoveMetaRef.current &&
      humanMoveMetaRef.current.gameId === activeGame.id &&
      humanMoveMetaRef.current.ply === activeGame.moves.length
        ? humanMoveMetaRef.current
        : undefined;

    const timer = setTimeout(() => {
      void runBotTurnInFirestore({
        game: activeGame,
        uid: authUser.uid,
        liveWhiteMs: whiteTimeMs,
        liveBlackMs: blackTimeMs,
        humanLastMoveMeta: meta,
      }).catch((err: Error) => setRuntimeFatalError(err));
    }, 280);

    return () => clearTimeout(timer);
  }, [authUser, activeGame, activeGameDoc, whiteTimeMs, blackTimeMs]);

  async function handleGoogleSignIn() {
    setAuthError(null);
    setConnecting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError('Accesso con Google non riuscito. Riprova.');
      }
    } finally {
      setConnecting(false);
    }
  }

  async function handleCreateProfile(username: string) {
    if (!authUser) return;
    setAuthError(null);
    setConnecting(true);
    try {
      const res = await registerBioChessUsername(authUser.uid, username);
      if (!res.ok) {
        setAuthError(res.error);
      } else {
        setProfile(res.profile);
      }
    } catch (err) {
      setRuntimeFatalError(err as Error);
    } finally {
      setConnecting(false);
    }
  }

  async function handleLogout() {
    if (authUser && profile) {
      try {
        await setPresence(authUser.uid, false);
      } catch {
        // ignore cleanup failure on logout
      }
    }
    await signOut(auth);
    setProfile(null);
    setActiveGameId(null);
    setViewMode('lobby');
  }

  function handleToggleMute() {
    const next = !muted;
    setMuted(next);
    soundFX.setMuted(next);
  }

  async function handlePlayerMove(
    from: string,
    to: string,
    promotion?: 'q' | 'r' | 'b' | 'n'
  ) {
    if (!authUser || !activeGame || activeGame.status !== 'active') return;
    try {
      const res = await submitMoveToFirestore({
        game: activeGame,
        uid: authUser.uid,
        from,
        to,
        promotion,
        liveWhiteMs: whiteTimeMs,
        liveBlackMs: blackTimeMs,
      });
      if (!res.ok) {
        setGameError(res.error);
        setTimeout(() => setGameError(null), 3000);
        return;
      }
      if (activeGame.isBotGame) {
        humanMoveMetaRef.current = {
          gameId: activeGame.id,
          ply: activeGame.moves.length + 1,
          quality: res.quality,
          captured: res.captured,
          inCheck: res.inCheck,
        };
      }
    } catch (err) {
      setRuntimeFatalError(err as Error);
    }
  }

  const needsUsernameChoice = Boolean(authReady && authUser && profileLoaded && !profile);

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
                  onClick={() => void handleLogout()}
                  className="px-3 py-1.5 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#3C3A36] text-[#E5E4E2] text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <span className="max-w-[120px] truncate">{profile.username}</span>
                  <LogOut className="w-3.5 h-3.5 text-[#9E9D9A]" />
                </button>
              )
            ) : (
              <span className="text-xs font-semibold text-[#9E9D9A] whitespace-nowrap shrink-0">
                {authReady ? 'Pronto' : 'Connessione...'}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {!profile ? (
          <UsernameGateModal
            step={needsUsernameChoice ? 'choose_username' : 'google'}
            error={authError}
            connecting={
              !authReady ||
              connecting ||
              Boolean(authUser && !profileLoaded)
            }
            onGoogleSignIn={() => void handleGoogleSignIn()}
            onCreateProfile={(u) => void handleCreateProfile(u)}
            onSwitchGoogleAccount={() => void handleLogout()}
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
                  onMove={(from, to, promo) => void handlePlayerMove(from, to, promo)}
                  onSendChat={(text) => {
                    if (!authUser) return;
                    void sendPlayerChatAndMaybeBotReply(
                      activeGame,
                      authUser.uid,
                      profile.username,
                      text
                    ).catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onResign={() => {
                    if (!authUser) return;
                    const myColor: PieceColor =
                      !activeGame.white.isBot && activeGame.white.uid === authUser.uid ? 'w' : 'b';
                    void resignGameInFirestore(
                      activeGame,
                      myColor,
                      profile.username,
                      authUser.uid
                    ).catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onOfferDraw={() => {
                    if (!authUser) return;
                    const myColor: PieceColor =
                      !activeGame.white.isBot && activeGame.white.uid === authUser.uid ? 'w' : 'b';
                    void offerDrawInFirestore(
                      activeGame,
                      myColor,
                      profile.username,
                      authUser.uid
                    ).catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onRespondDraw={(accept) => {
                    if (!authUser) return;
                    void respondDrawInFirestore(
                      activeGame,
                      accept,
                      profile.username,
                      authUser.uid
                    ).catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onRematch={() => {
                    if (!authUser) return;
                    const myColor: PieceColor =
                      !activeGame.white.isBot && activeGame.white.uid === authUser.uid ? 'w' : 'b';
                    void requestOrAcceptRematchInFirestore(activeGame, myColor, authUser.uid)
                      .then((newId) => {
                        if (newId) {
                          setActiveGameId(newId);
                          setViewMode('game');
                          soundFX.playChallenge();
                        }
                      })
                      .catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onBackToLobby={() => {
                    if (activeGame.status !== 'active') {
                      setActiveGameId(null);
                      if (authUser) {
                        void setPresence(authUser.uid, true, '').catch(() => {});
                      }
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
                    if (!authUser) return;
                    setChallengeError(null);
                    void sendChallengeToUser(
                      profile,
                      authUser.uid,
                      toUsername,
                      timeControl,
                      colorPref
                    )
                      .then((res) => {
                        if (!res.ok) setChallengeError(res.error);
                      })
                      .catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onCancelChallenge={(challengeId) => {
                    void cancelPendingChallenge(challengeId).catch((err: Error) =>
                      setRuntimeFatalError(err)
                    );
                  }}
                  onRespondChallenge={(challengeId, accept) => {
                    if (!authUser) return;
                    setChallengeError(null);
                    void respondToChallenge(challengeId, accept, authUser.uid)
                      .then((res) => {
                        if (!res.ok) {
                          setChallengeError(res.error);
                        } else if (res.gameId) {
                          setActiveGameId(res.gameId);
                          setViewMode('game');
                          soundFX.playChallenge();
                        }
                      })
                      .catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onStartBotGame={(
                    botId: BotId,
                    timeControl: TimeControlId,
                    colorPref: ColorPref
                  ) => {
                    if (!authUser) return;
                    void createBotGameInFirestore(
                      profile,
                      authUser.uid,
                      botId,
                      timeControl,
                      colorPref
                    )
                      .then((gameId) => {
                        setActiveGameId(gameId);
                        setViewMode('game');
                        soundFX.playChallenge();
                      })
                      .catch((err: Error) => setRuntimeFatalError(err));
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
          onAccept={() => {
            if (!authUser) return;
            void respondToChallenge(incomingChallenges[0].id, true, authUser.uid)
              .then((res) => {
                if (res.ok && res.gameId) {
                  setActiveGameId(res.gameId);
                  setViewMode('game');
                  soundFX.playChallenge();
                }
              })
              .catch((err: Error) => setRuntimeFatalError(err));
          }}
          onDecline={() => {
            if (!authUser) return;
            void respondToChallenge(incomingChallenges[0].id, false, authUser.uid).catch(
              (err: Error) => setRuntimeFatalError(err)
            );
          }}
        />
      )}
    </div>
  );
}
