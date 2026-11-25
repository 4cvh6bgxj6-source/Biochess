'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Chess } from 'chess.js';
import { AnimatePresence, motion } from 'motion/react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { Bot, GraduationCap, LogOut, Swords, TrendingUp, Trophy } from 'lucide-react';
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
  SavedGameReview,
  TimeControlId,
} from '@/lib/types';
import { BIOCHESS_LOGO } from '@/lib/brand';
import { getUiDict } from '@/lib/i18n';
import { countryCodeToFlag, type WorldLocaleOption } from '@/lib/world-languages';
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
  saveGameReviewToFirestore,
  sendChallengeToUser,
  sendPlayerChatAndMaybeBotReply,
  setPresence,
  settleMyEloForGame,
  subscribeChallenges,
  subscribeGameRoom,
  subscribeLeaderboard,
  subscribeMyGameReviews,
  subscribeMyGames,
  subscribeMyProfile,
  subscribeOnlinePlayers,
  subscribeRecentMatches,
  submitMoveToFirestore,
  updateUserLocale,
  type GameDocSnapshot,
} from '@/lib/firestore-chess';
import { UsernameGateModal } from './UsernameGateModal';
import { LobbyView, type LobbyTab } from './LobbyView';
import { GameWorkspace } from './GameWorkspace';
import { CoachReviewStudio } from './CoachReviewStudio';
import { StatsDashboard } from './StatsDashboard';
import { IncomingChallengeToast } from './IncomingChallengeToast';
import { LanguagePicker } from './LanguagePicker';

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

  const [rawOnlinePlayers, setRawOnlinePlayers] = useState<PlayerSummary[]>([]);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [presenceNowMs, setPresenceNowMs] = useState(() => Date.now());
  const [leaderboard, setLeaderboard] = useState<PlayerSummary[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatchSummary[]>([]);
  const [incomingChallenges, setIncomingChallenges] = useState<Challenge[]>([]);
  const [outgoingChallenges, setOutgoingChallenges] = useState<Challenge[]>([]);

  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGameDoc, setActiveGameDoc] = useState<GameDocSnapshot | null>(null);
  const [activeMovesState, setActiveMovesState] = useState<{
    gameId: string;
    moves: GameMove[];
  }>({ gameId: '', moves: [] });
  const [activeMessagesState, setActiveMessagesState] = useState<{
    gameId: string;
    messages: ChatMessage[];
  }>({ gameId: '', messages: [] });

  const [viewMode, setViewMode] = useState<'lobby' | 'game' | 'coach' | 'stats'>('lobby');
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>('challenge');
  const [savedReviews, setSavedReviews] = useState<SavedGameReview[]>([]);
  const [coachTargetGame, setCoachTargetGame] = useState<GameState | null>(null);
  const [coachTargetPgn, setCoachTargetPgn] = useState<{
    pgn: string;
    playerColor: PieceColor;
    id?: string;
  } | null>(null);
  const [coachSessionKey, setCoachSessionKey] = useState(0);
  const [liveClock, setLiveClock] = useState<{ gameId: string; w: number; b: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [inviteTarget, setInviteTarget] = useState('');
  const [selectedLocale, setSelectedLocale] = useState<{ lang: string; country: string }>({
    lang: 'it',
    country: 'IT',
  });

  const settlingGameIdsRef = useRef<Set<string>>(new Set());
  const botTurnKeyRef = useRef<string>('');
  const latestGameRef = useRef<GameState | null>(null);
  const liveTimesRef = useRef<{ w: number; b: number }>({ w: 0, b: 0 });
  const activeGameIdRef = useRef<string | null>(null);
  const profileActiveGameIdRef = useRef<string>('');
  const hasRestoredInitialGameRef = useRef(false);
  const knownActivePvpIdsRef = useRef<Set<string>>(new Set());
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
  const lastLocallyPlayedMoveRef = useRef<{ gameId: string; ply: number } | null>(null);
  const activeLangRef = useRef<string>('it');

  if (runtimeFatalError) {
    throw runtimeFatalError;
  }

  const handleListenerError = useCallback((err: Error) => {
    setRuntimeFatalError(err);
  }, []);

  const profileLoaded = Boolean(authUser && loadedProfileUid === authUser.uid);
  const hasProfile = Boolean(profile);
  const profileUsername = profile?.username || '';
  const activeLang = profile?.lang || selectedLocale.lang;
  const activeCountry = profile?.country || selectedLocale.country;
  const dict = useMemo(() => getUiDict(activeLang), [activeLang]);

  useEffect(() => {
    activeLangRef.current = activeLang;
  }, [activeLang]);

  // Parse invite link ?sfida=username
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sfida = params.get('sfida');
    if (sfida) {
      queueMicrotask(() => setInviteTarget(sfida));
    }
  }, []);

  // Firebase Auth listener + handle redirect fallback result
  useEffect(() => {
    void getRedirectResult(auth).catch((err: unknown) => {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code === 'auth/unauthorized-domain') {
        setAuthError(
          `Dominio "${window.location.hostname}" non autorizzato in Firebase. Aggiungilo in Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else if (code && code !== 'auth/popup-closed-by-user') {
        setAuthError(`Accesso con Google non riuscito (${code}). Riprova.`);
      }
    });

    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setLoadedProfileUid(null);
        setActiveGameId(null);
        setActiveGameDoc(null);
        setActiveMovesState({ gameId: '', moves: [] });
        setActiveMessagesState({ gameId: '', messages: [] });
        setRawOnlinePlayers([]);
        setClockOffsetMs(0);
        setLeaderboard([]);
        setRecentMatches([]);
        setIncomingChallenges([]);
        setOutgoingChallenges([]);
        setSavedReviews([]);
        setCoachTargetGame(null);
        setCoachTargetPgn(null);
        setViewMode('lobby');
        hasRestoredInitialGameRef.current = false;
        knownActivePvpIdsRef.current = new Set();
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
        if (typeof prof?.lastSeenAtMs === 'number') {
          setClockOffsetMs(prof.lastSeenAtMs - Date.now());
        }
      },
      handleListenerError
    );
    return () => unsub();
  }, [authReady, authUser, handleListenerError]);

  useEffect(() => {
    activeGameIdRef.current = activeGameId;
  }, [activeGameId]);

  useEffect(() => {
    profileActiveGameIdRef.current = profile?.activeGameId || '';
  }, [profile?.activeGameId]);

  // Set online presence with heartbeat, network/visibility listeners, and unload cleanup
  useEffect(() => {
    if (!authUser || !hasProfile) return;
    const uid = authUser.uid;

    const markOnline = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void setPresence(uid, true).catch(() => {});
    };

    const markOffline = () => {
      void setPresence(uid, false).catch(() => {});
    };

    void setPresence(uid, true).catch((err: Error) =>
      setRuntimeFatalError(err)
    );

    const heartbeat = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      markOnline();
    }, 20_000);

    const presenceTick = setInterval(() => {
      setPresenceNowMs(Date.now());
    }, 5_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setPresenceNowMs(Date.now());
        markOnline();
      }
    };

    const handleOnline = () => {
      setPresenceNowMs(Date.now());
      markOnline();
    };

    window.addEventListener('pagehide', markOffline);
    window.addEventListener('beforeunload', markOffline);
    window.addEventListener('offline', markOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(heartbeat);
      clearInterval(presenceTick);
      window.removeEventListener('pagehide', markOffline);
      window.removeEventListener('beforeunload', markOffline);
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authUser, hasProfile]);

  const onlinePlayers = useMemo(() => {
    const effectiveNow = presenceNowMs + clockOffsetMs;
    const staleThresholdMs = 55_000;
    return rawOnlinePlayers.filter(
      (p) =>
        p.status !== 'offline' &&
        typeof p.lastSeenAtMs === 'number' &&
        effectiveNow - p.lastSeenAtMs <= staleThresholdMs
    );
  }, [rawOnlinePlayers, presenceNowMs, clockOffsetMs]);

  // Subscribe to Lobby & My Games ONLY when profile exists
  useEffect(() => {
    if (!authReady || !authUser || !hasProfile) return;
    const uid = authUser.uid;

    const unsubOnline = subscribeOnlinePlayers(uid, setRawOnlinePlayers, handleListenerError);
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
      (activeGames, unappliedFinished) => {
        const activePvpGames = activeGames.filter((g) => !g.isBotGame);

        if (!hasRestoredInitialGameRef.current) {
          hasRestoredInitialGameRef.current = true;
          for (const g of activePvpGames) {
            knownActivePvpIdsRef.current.add(g.id);
          }

          if (!activeGameIdRef.current) {
            const targetActiveId = profileActiveGameIdRef.current;
            const toRestore =
              activePvpGames[0] ||
              (targetActiveId ? activeGames.find((g) => g.id === targetActiveId) : undefined);

            if (toRestore) {
              setActiveGameId(toRestore.id);
              setViewMode('game');
            }
          }
        } else {
          // Only auto-open newly started PvP matches while user is in the lobby (never hijack or restore stale bot games)
          const brandNewPvp = activePvpGames.find((g) => !knownActivePvpIdsRef.current.has(g.id));
          for (const g of activePvpGames) {
            knownActivePvpIdsRef.current.add(g.id);
          }
          if (brandNewPvp && !activeGameIdRef.current) {
            soundFX.playChallenge();
            setActiveGameId(brandNewPvp.id);
            setViewMode('game');
          }
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

    const unsubMyReviews = subscribeMyGameReviews(uid, setSavedReviews, handleListenerError);

    return () => {
      unsubOnline();
      unsubBoard();
      unsubRecent();
      unsubChallenges();
      unsubMyGames();
      unsubMyReviews();
    };
  }, [authReady, authUser, hasProfile, handleListenerError]);

  // Subscribe to active game room (game doc + moves + chat)
  useEffect(() => {
    if (!authReady || !authUser || !hasProfile || !activeGameId) {
      return;
    }

    const roomGameId = activeGameId;
    botTurnKeyRef.current = '';

    const unsub = subscribeGameRoom(
      roomGameId,
      (docSnap) => {
        setActiveGameDoc(docSnap);
        if (docSnap?.rematchGameId && docSnap.rematchGameId !== roomGameId) {
          setActiveGameId(docSnap.rematchGameId);
          setViewMode('game');
          soundFX.playChallenge();
        }
      },
      (moves) => setActiveMovesState({ gameId: roomGameId, moves }),
      (messages) => setActiveMessagesState({ gameId: roomGameId, messages }),
      handleListenerError
    );

    return () => unsub();
  }, [authReady, authUser, hasProfile, activeGameId, handleListenerError]);

  const activeGame: GameState | null = useMemo(() => {
    if (!activeGameId || !activeGameDoc || activeGameDoc.id !== activeGameId) return null;
    const moves = activeMovesState.gameId === activeGameId ? activeMovesState.moves : [];
    const messages = activeMessagesState.gameId === activeGameId ? activeMessagesState.messages : [];
    return assembleGameState(activeGameDoc, moves, messages);
  }, [activeGameId, activeGameDoc, activeMovesState, activeMessagesState]);

  // Audio FX for moves, game end, and opponent chat messages
  useEffect(() => {
    if (!activeGame) return;
    const gId = activeGame.id;
    const prevCount = prevMovesCountRef.current[gId] ?? activeGame.moves.length;
    const prevStatus = prevGameStatusRef.current[gId] ?? activeGame.status;

    if (activeGame.moves.length > prevCount) {
      const lastMove = activeGame.moves[activeGame.moves.length - 1];
      const alreadyPlayedLocally =
        lastLocallyPlayedMoveRef.current?.gameId === gId &&
        lastLocallyPlayedMoveRef.current?.ply === activeGame.moves.length;

      if (!alreadyPlayedLocally) {
        const isCapture = Boolean(lastMove?.captured);
        const isCheck = Boolean(lastMove?.san.includes('+') || lastMove?.san.includes('#'));
        const isCastle = lastMove?.san === 'O-O' || lastMove?.san === 'O-O-O';
        const isPromote = Boolean(lastMove?.promotion);

        if (activeGame.status !== 'active') {
          soundFX.playGameOver(true);
        } else if (isCheck) {
          soundFX.playCheck(isCapture);
        } else if (isCastle) {
          soundFX.playCastle();
        } else if (isPromote) {
          soundFX.playPromote();
        } else if (isCapture) {
          soundFX.playCapture();
        } else {
          soundFX.playOpponentMove();
        }
      }
    } else if (prevStatus === 'active' && activeGame.status !== 'active') {
      soundFX.playGameOver(false);
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

  useEffect(() => {
    latestGameRef.current = activeGame;
  }, [activeGame]);

  useEffect(() => {
    liveTimesRef.current = { w: whiteTimeMs, b: blackTimeMs };
  }, [whiteTimeMs, blackTimeMs]);

  const clockGameId = activeGame?.id || '';
  const clockLastMoveAt = activeGame?.lastMoveAt ?? 0;
  const clockTurn = activeGame?.turn ?? 'w';
  const clockBaseWhiteMs = activeGame?.whiteTimeMs ?? 0;
  const clockBaseBlackMs = activeGame?.blackTimeMs ?? 0;
  const authUid = authUser?.uid || '';

  // Live clock synchronization (drift-free using lastMoveAt) + timeout detection
  useEffect(() => {
    if (!clockGameId || !isClockRunning) return;

    const tick = () => {
      const elapsed = Math.max(0, Date.now() - clockLastMoveAt);
      const nextW = clockTurn === 'w' ? Math.max(0, clockBaseWhiteMs - elapsed) : clockBaseWhiteMs;
      const nextB = clockTurn === 'b' ? Math.max(0, clockBaseBlackMs - elapsed) : clockBaseBlackMs;
      setLiveClock({ gameId: clockGameId, w: nextW, b: nextB });

      const currentGame = latestGameRef.current;
      if (
        authUid &&
        currentGame &&
        currentGame.id === clockGameId &&
        (nextW <= 0 || nextB <= 0) &&
        timeoutClaimedIdRef.current !== clockGameId
      ) {
        timeoutClaimedIdRef.current = clockGameId;
        const timedOut: PieceColor = nextW <= 0 ? 'w' : 'b';
        void claimTimeoutInFirestore(currentGame, timedOut, authUid).catch((err: Error) =>
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
  }, [
    clockGameId,
    clockLastMoveAt,
    clockTurn,
    clockBaseWhiteMs,
    clockBaseBlackMs,
    isClockRunning,
    authUid,
  ]);

  const botGameId = activeGame?.id || '';
  const botGameStatus = activeGame?.status || '';
  const botGameEnabled = Boolean(
    activeGame?.isBotGame && activeGame?.botId && activeGame.botId !== 'dummy'
  );
  const botTurnNow = Boolean(
    activeGame &&
      ((activeGame.white.isBot && activeGame.turn === 'w') ||
        (activeGame.black.isBot && activeGame.turn === 'b'))
  );
  const botMovesLen = activeGame?.moves.length ?? 0;
  const docMovesCount = activeGameDoc?.movesCount ?? -1;
  const botMovesSynced = Boolean(
    botGameId &&
      activeGameDoc?.id === botGameId &&
      activeMovesState.gameId === botGameId &&
      botMovesLen === docMovesCount
  );

  // Bot turn scheduler: depends ONLY on primitive turn/sync state so clock ticks & chat never cancel the timer
  useEffect(() => {
    if (!authUid || !botGameId || botGameStatus !== 'active' || !botGameEnabled) return;
    if (!botTurnNow || !botMovesSynced) return;

    const turnKey = `${botGameId}:${botMovesLen}`;
    if (botTurnKeyRef.current === turnKey) return;

    const timer = setTimeout(() => {
      const latestGame = latestGameRef.current;
      if (
        !latestGame ||
        latestGame.id !== botGameId ||
        latestGame.status !== 'active' ||
        latestGame.moves.length !== botMovesLen
      ) {
        return;
      }
      if (botTurnKeyRef.current === turnKey) return;
      botTurnKeyRef.current = turnKey;

      const meta =
        humanMoveMetaRef.current &&
        humanMoveMetaRef.current.gameId === botGameId &&
        humanMoveMetaRef.current.ply === botMovesLen
          ? humanMoveMetaRef.current
          : undefined;

      void runBotTurnInFirestore({
        game: latestGame,
        uid: authUid,
        liveWhiteMs: liveTimesRef.current.w,
        liveBlackMs: liveTimesRef.current.b,
        humanLastMoveMeta: meta,
        lang: activeLangRef.current,
      })
        .then((submitted) => {
          if (!submitted && botTurnKeyRef.current === turnKey) {
            botTurnKeyRef.current = '';
          }
        })
        .catch((err: Error) => {
          if (botTurnKeyRef.current === turnKey) {
            botTurnKeyRef.current = '';
          }
          setRuntimeFatalError(err);
        });
    }, 280);

    return () => clearTimeout(timer);
  }, [authUid, botGameId, botGameStatus, botGameEnabled, botTurnNow, botMovesLen, botMovesSynced]);

  async function handleGoogleSignIn() {
    setAuthError(null);
    setConnecting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      if (code === 'auth/popup-blocked') {
        if (typeof window !== 'undefined' && window.self === window.top) {
          try {
            await signInWithRedirect(auth, googleProvider);
            return;
          } catch {
            // fall through to clear message
          }
        }
        setAuthError('Il browser ha bloccato il popup di Google. Consenti i popup per questo sito e riprova.');
        return;
      }
      if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setAuthError(
          `Dominio "${host}" non autorizzato su Firebase. Aggiungilo in Firebase Console → Authentication → Settings → Authorized domains.`
        );
        return;
      }
      if (code === 'auth/operation-not-allowed') {
        setAuthError('Accesso Google non abilitato su Firebase Console (Authentication → Sign-in method).');
        return;
      }
      console.error('Google Sign-In error:', code, err);
      setAuthError(
        code
          ? `Accesso con Google non riuscito (${code}). Riprova.`
          : 'Accesso con Google non riuscito. Riprova.'
      );
    } finally {
      setConnecting(false);
    }
  }

  function handleLocaleChange(opt: WorldLocaleOption) {
    setSelectedLocale({ lang: opt.lang, country: opt.country });
    if (authUser && profile) {
      setProfile((prev) => (prev ? { ...prev, lang: opt.lang, country: opt.country } : prev));
      void updateUserLocale(authUser.uid, opt.lang, opt.country).catch((err: Error) =>
        setRuntimeFatalError(err)
      );
    }
  }

  async function handleCreateProfile(username: string) {
    if (!authUser) return;
    setAuthError(null);
    setConnecting(true);
    try {
      const res = await registerBioChessUsername(
        authUser.uid,
        username,
        selectedLocale.lang,
        selectedLocale.country
      );
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
    soundFX.unlock();

    // Play the crisp wooden piece sound immediately inside the user gesture (0ms latency)
    let playedLocally = false;
    try {
      const previewChess = new Chess(activeGame.fen);
      const previewRes = previewChess.move({
        from,
        to,
        promotion: promotion || 'q',
      });
      if (previewRes) {
        playedLocally = true;
        lastLocallyPlayedMoveRef.current = {
          gameId: activeGame.id,
          ply: activeGame.moves.length + 1,
        };
        const isOver = previewChess.isGameOver();
        if (isOver) {
          soundFX.playGameOver(true);
        } else if (previewChess.inCheck()) {
          soundFX.playCheck(Boolean(previewRes.captured));
        } else if (previewRes.flags.includes('k') || previewRes.flags.includes('q')) {
          soundFX.playCastle();
        } else if (previewRes.promotion) {
          soundFX.playPromote();
        } else if (previewRes.captured) {
          soundFX.playCapture();
        } else {
          soundFX.playMove();
        }
      }
    } catch {
      // let submitMoveToFirestore report invalid moves if any
    }

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
        if (playedLocally) {
          lastLocallyPlayedMoveRef.current = null;
        }
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
      if (playedLocally) {
        lastLocallyPlayedMoveRef.current = null;
      }
      setRuntimeFatalError(err as Error);
    }
  }

  const needsUsernameChoice = Boolean(authReady && authUser && profileLoaded && !profile);

  function navigateToLobbyTab(tab?: LobbyTab) {
    if (activeGame && activeGame.status !== 'active') {
      setActiveGameId(null);
      setActiveGameDoc(null);
      setActiveMovesState({ gameId: '', moves: [] });
      setActiveMessagesState({ gameId: '', messages: [] });
      if (authUser) {
        void setPresence(authUser.uid, true, '').catch(() => {});
      }
    }
    if (tab) {
      setLobbyTab(tab);
    }
    setViewMode('lobby');
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#302E2B] text-[#F3F3F2]">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-[#3C3A36] bg-[#262421]">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: BioChess Emblem + Wordmark */}
          <button
            type="button"
            onClick={() => navigateToLobbyTab()}
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
            <nav className="hidden md:flex items-center gap-5 text-sm font-bold text-[#BABABA]">
              <button
                type="button"
                onClick={() => navigateToLobbyTab('challenge')}
                className={`inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'lobby' && lobbyTab === 'challenge' ? 'text-white' : ''
                }`}
              >
                <Swords className="w-4 h-4 text-[#81B64C]" />
                <span>{dict.navPlay}</span>
              </button>
              <button
                type="button"
                onClick={() => navigateToLobbyTab('bots')}
                className={`inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'lobby' && lobbyTab === 'bots' ? 'text-white' : ''
                }`}
              >
                <Bot className="w-4 h-4 text-[#81B64C]" />
                <span>{dict.navBots}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCoachTargetGame(null);
                  setCoachTargetPgn(null);
                  setCoachSessionKey((k) => k + 1);
                  setViewMode('coach');
                }}
                className={`inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'coach' ? 'text-white' : ''
                }`}
              >
                <GraduationCap className="w-4 h-4 text-[#81B64C]" />
                <span>{dict.navCoach}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('stats')}
                className={`inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'stats' ? 'text-white' : ''
                }`}
              >
                <TrendingUp className="w-4 h-4 text-[#81B64C]" />
                <span>{dict.navStats}</span>
              </button>
              <button
                type="button"
                onClick={() => navigateToLobbyTab('leaderboard')}
                className={`inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'lobby' && lobbyTab === 'leaderboard' ? 'text-white' : ''
                }`}
              >
                <Trophy className="w-4 h-4 text-[#E6912C]" />
                <span>{dict.navLeaderboard}</span>
              </button>
            </nav>
          )}

          {/* Zone 3: Language selector + 1 primary user action */}
          <div className="flex items-center gap-2 shrink-0">
            <LanguagePicker
              lang={activeLang}
              country={activeCountry}
              onChange={handleLocaleChange}
              searchPlaceholder={dict.searchLanguage}
              variant="compact"
            />
            {profile ? (
              activeGame && activeGame.status === 'active' && viewMode !== 'game' ? (
                <button
                  type="button"
                  onClick={() => setViewMode('game')}
                  className="px-3.5 py-1.5 rounded bg-[#81B64C] hover:bg-[#95C85E] text-white text-xs font-bold border-b-2 border-[#5D8A32] whitespace-nowrap shrink-0"
                >
                  {dict.backToGame}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="px-3 py-1.5 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#3C3A36] text-[#E5E4E2] text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  {countryCodeToFlag(profile.country) && (
                    <span className="text-sm leading-none shrink-0" aria-hidden="true">
                      {countryCodeToFlag(profile.country)}
                    </span>
                  )}
                  <span className="max-w-[110px] truncate">{profile.username}</span>
                  <LogOut className="w-3.5 h-3.5 text-[#9E9D9A]" />
                </button>
              )
            ) : (
              <span className="hidden sm:inline text-xs font-semibold text-[#9E9D9A] whitespace-nowrap shrink-0">
                {authReady ? dict.ready : dict.connecting}
              </span>
            )}
          </div>
        </div>
        {profile && (
          <nav className="flex md:hidden items-center justify-around border-t border-[#3C3A36] bg-[#21201D] px-2 py-1.5 text-[11px] font-bold text-[#BABABA]">
            <button
              type="button"
              onClick={() => navigateToLobbyTab('challenge')}
              className={viewMode === 'lobby' && lobbyTab === 'challenge' ? 'text-white' : ''}
            >
              {dict.navPlay}
            </button>
            <button
              type="button"
              onClick={() => navigateToLobbyTab('bots')}
              className={viewMode === 'lobby' && lobbyTab === 'bots' ? 'text-white' : ''}
            >
              {dict.navBots}
            </button>
            <button
              type="button"
              onClick={() => {
                setCoachTargetGame(null);
                setCoachTargetPgn(null);
                setCoachSessionKey((k) => k + 1);
                setViewMode('coach');
              }}
              className={viewMode === 'coach' ? 'text-[#81B64C]' : ''}
            >
              {dict.navCoach}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('stats')}
              className={viewMode === 'stats' ? 'text-[#81B64C]' : ''}
            >
              {dict.navStats}
            </button>
            <button
              type="button"
              onClick={() => navigateToLobbyTab('leaderboard')}
              className={viewMode === 'lobby' && lobbyTab === 'leaderboard' ? 'text-white' : ''}
            >
              {dict.navLeaderboard}
            </button>
          </nav>
        )}
      </header>

      <main className="flex-1">
        {!profile ? (
          <UsernameGateModal
            step={needsUsernameChoice ? 'choose_username' : 'google'}
            lang={activeLang}
            country={activeCountry}
            dict={dict}
            error={authError}
            connecting={
              !authReady ||
              connecting ||
              Boolean(authUser && !profileLoaded)
            }
            onLocaleChange={handleLocaleChange}
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
                  dict={dict}
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
                      text,
                      activeLang
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
                      authUser.uid,
                      activeLang
                    ).catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onRespondDraw={(accept) => {
                    if (!authUser) return;
                    void respondDrawInFirestore(
                      activeGame,
                      accept,
                      profile.username,
                      authUser.uid,
                      activeLang
                    ).catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onRematch={() => {
                    if (!authUser) return;
                    const myColor: PieceColor =
                      !activeGame.white.isBot && activeGame.white.uid === authUser.uid ? 'w' : 'b';
                    void requestOrAcceptRematchInFirestore(
                      activeGame,
                      myColor,
                      authUser.uid,
                      activeLang
                    )
                      .then((newId) => {
                        if (newId) {
                          setActiveGameId(newId);
                          setViewMode('game');
                          soundFX.playChallenge();
                        }
                      })
                      .catch((err: Error) => setRuntimeFatalError(err));
                  }}
                  onBackToLobby={() => navigateToLobbyTab()}
                  onOpenCoachStudio={() => {
                    setCoachTargetGame(activeGame);
                    setCoachTargetPgn(null);
                    setCoachSessionKey((k) => k + 1);
                    setViewMode('coach');
                  }}
                />
              </motion.div>
            ) : viewMode === 'coach' ? (
              <motion.div
                key={`coach-${coachSessionKey}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
              >
                <CoachReviewStudio
                  myUsername={profile.username}
                  myElo={profile.elo}
                  lang={activeLang}
                  initialGame={coachTargetGame}
                  initialPgn={coachTargetPgn}
                  savedReviews={savedReviews}
                  onSaveReview={(review) => {
                    if (!authUser) return;
                    void saveGameReviewToFirestore(authUser.uid, review).catch((err: Error) =>
                      setRuntimeFatalError(err)
                    );
                  }}
                  onBackToLobby={() => navigateToLobbyTab()}
                  onBackToGame={activeGame ? () => setViewMode('game') : undefined}
                  onRequestOpenStats={() => setViewMode('stats')}
                />
              </motion.div>
            ) : viewMode === 'stats' ? (
              <motion.div
                key="stats"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
              >
                <StatsDashboard
                  profile={profile}
                  reviews={savedReviews}
                  onOpenReviewInCoach={(rev) => {
                    setCoachTargetGame(null);
                    setCoachTargetPgn({
                      pgn: rev.pgn,
                      playerColor: rev.playerColor,
                      id: rev.id,
                    });
                    setCoachSessionKey((k) => k + 1);
                    setViewMode('coach');
                  }}
                  onOpenImportPgn={() => {
                    setCoachTargetGame(null);
                    setCoachTargetPgn(null);
                    setCoachSessionKey((k) => k + 1);
                    setViewMode('coach');
                  }}
                  onBackToLobby={() => navigateToLobbyTab()}
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
                  dict={dict}
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
                      colorPref,
                      activeLang
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
          dict={dict}
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
