'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Chess, type Square } from 'chess.js';
import { motion } from 'motion/react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { Bot, GraduationCap, Loader2, LogOut, Swords, TrendingUp, Trophy } from 'lucide-react';
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
  buildChessWithHistory,
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
import { BoardThemeProvider } from './BoardThemeContext';
import { BoardStylePicker } from './BoardStylePicker';

interface QueuedMoveEntry {
  id: string;
  gameId: string;
  ply: number;
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  fen: string;
  pgn: string;
  turn: PieceColor;
  move: GameMove;
  isGameOver: boolean;
}

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
  const settledGameIdsRef = useRef<Set<string>>(new Set());
  const eloRetryCountRef = useRef<Record<string, number>>({});
  const eloRetryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const attemptSettleGameEloRef = useRef<((uid: string, gameDoc: GameDocSnapshot) => void) | null>(null);
  const botTurnKeyRef = useRef<string>('');
  const latestGameRef = useRef<GameState | null>(null);
  const liveTimesRef = useRef<{ w: number; b: number }>({ w: 0, b: 0 });
  const activeGameIdRef = useRef<string | null>(null);
  const viewModeRef = useRef<'lobby' | 'game' | 'coach' | 'stats'>('lobby');
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
  const timeoutClaimedGameIdsRef = useRef<Set<string>>(new Set());
  const timeoutRetryAfterRef = useRef<Record<string, number>>({});
  const prevMovesCountRef = useRef<Record<string, number>>({});
  const prevGameStatusRef = useRef<Record<string, string>>({});
  const prevChatCountRef = useRef<Record<string, number>>({});
  const prevIncomingChallengeIdsRef = useRef<Set<string>>(new Set());
  const lastLocallyPlayedMoveRef = useRef<{ gameId: string; ply: number } | null>(null);
  const isFlushingQueueRef = useRef<boolean>(false);
  const rematchInFlightGameIdRef = useRef<string | null>(null);
  const [isSubmittingMove, setIsSubmittingMove] = useState(false);
  const [isRematchSubmitting, setIsRematchSubmitting] = useState(false);
  const authUserRef = useRef<User | null>(null);
  const activeGameRef = useRef<GameState | null>(null);
  const activeGameDocRef = useRef<GameDocSnapshot | null>(null);
  const activeMovesStateRef = useRef<{ gameId: string; moves: GameMove[] }>({
    gameId: '',
    moves: [],
  });
  const activeLangRef = useRef<string>('it');
  const [optimisticMoves, setOptimisticMoves] = useState<QueuedMoveEntry[]>([]);
  const optimisticMovesRef = useRef<QueuedMoveEntry[]>([]);
  const pendingCommitQueueRef = useRef<QueuedMoveEntry[]>([]);
  const lastCommittedInFlushRef = useRef<{
    gameId: string;
    movesCount: number;
    fen: string;
    pgn: string;
    turn: PieceColor;
    moves: GameMove[];
    status: GameState['status'];
    whiteTimeMs: number;
    blackTimeMs: number;
  } | null>(null);

  if (runtimeFatalError) {
    throw runtimeFatalError;
  }

  const handleListenerError = useCallback((err: Error) => {
    setRuntimeFatalError(err);
  }, []);

  const openGameRoom = useCallback((gameId: string) => {
    if (!gameId) return;
    knownActivePvpIdsRef.current.add(gameId);
    if (activeGameIdRef.current === gameId) {
      viewModeRef.current = 'game';
      setViewMode('game');
      return;
    }
    activeGameIdRef.current = gameId;
    viewModeRef.current = 'game';
    activeGameDocRef.current = null;
    activeMovesStateRef.current = { gameId: '', moves: [] };
    botTurnKeyRef.current = '';
    lastLocallyPlayedMoveRef.current = null;
    isFlushingQueueRef.current = false;
    rematchInFlightGameIdRef.current = null;
    timeoutClaimedIdRef.current = null;
    pendingCommitQueueRef.current = [];
    optimisticMovesRef.current = [];
    lastCommittedInFlushRef.current = null;
    setIsSubmittingMove(false);
    setIsRematchSubmitting(false);
    setOptimisticMoves([]);
    setLiveClock(null);
    setGameError(null);
    setActiveGameDoc(null);
    setActiveMovesState({ gameId: '', moves: [] });
    setActiveMessagesState({ gameId: '', messages: [] });
    setActiveGameId(gameId);
    setViewMode('game');
  }, []);

  const attemptSettleGameElo = useCallback((uid: string, gameDoc: GameDocSnapshot) => {
    if (gameDoc.status === 'active') return;
    const isWhite = !gameDoc.whiteIsBot && gameDoc.whiteUid === uid;
    const isBlack = !gameDoc.blackIsBot && gameDoc.blackUid === uid;
    if (!isWhite && !isBlack) return;
    if ((isWhite && gameDoc.whiteEloApplied) || (isBlack && gameDoc.blackEloApplied)) {
      settledGameIdsRef.current.add(gameDoc.id);
      if (eloRetryTimersRef.current[gameDoc.id]) {
        clearTimeout(eloRetryTimersRef.current[gameDoc.id]);
        delete eloRetryTimersRef.current[gameDoc.id];
      }
      return;
    }
    if (settledGameIdsRef.current.has(gameDoc.id) || settlingGameIdsRef.current.has(gameDoc.id)) {
      return;
    }
    if (eloRetryTimersRef.current[gameDoc.id]) {
      clearTimeout(eloRetryTimersRef.current[gameDoc.id]);
      delete eloRetryTimersRef.current[gameDoc.id];
    }
    settlingGameIdsRef.current.add(gameDoc.id);

    const scheduleRetry = () => {
      const delays = [450, 1000, 2000, 3500, 6000];
      const attempt = eloRetryCountRef.current[gameDoc.id] ?? 0;
      if (attempt >= delays.length) return;
      eloRetryCountRef.current[gameDoc.id] = attempt + 1;
      const delayMs = delays[attempt];
      eloRetryTimersRef.current[gameDoc.id] = setTimeout(() => {
        delete eloRetryTimersRef.current[gameDoc.id];
        const latestAuth = authUserRef.current;
        if (!latestAuth || latestAuth.uid !== uid) return;
        attemptSettleGameEloRef.current?.(uid, gameDoc);
      }, delayMs);
    };

    void settleMyEloForGame(uid, gameDoc)
      .then((didSettle) => {
        if (didSettle) {
          settledGameIdsRef.current.add(gameDoc.id);
          delete eloRetryCountRef.current[gameDoc.id];
        } else {
          scheduleRetry();
        }
      })
      .catch((err: Error) => {
        console.error('ELO settlement warning:', err);
        scheduleRetry();
      })
      .finally(() => {
        settlingGameIdsRef.current.delete(gameDoc.id);
      });
  }, []);

  useEffect(() => {
    attemptSettleGameEloRef.current = attemptSettleGameElo;
  }, [attemptSettleGameElo]);

  useEffect(() => {
    const timersRef = eloRetryTimersRef.current;
    return () => {
      for (const timer of Object.values(timersRef)) {
        clearTimeout(timer);
      }
    };
  }, []);

  const profileLoaded = Boolean(authUser && loadedProfileUid === authUser.uid);
  const hasProfile = Boolean(profile);
  const profileUsername = profile?.username || '';
  const activeLang = profile?.lang || selectedLocale.lang;
  const activeCountry = profile?.country || selectedLocale.country;
  const dict = useMemo(() => getUiDict(activeLang), [activeLang]);

  useEffect(() => {
    activeLangRef.current = activeLang;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('biochess_lang', activeLang);
      } catch {
        // ignore storage restrictions
      }
      document.documentElement.lang = activeLang;
    }
  }, [activeLang]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedLang = window.localStorage.getItem('biochess_lang');
      const savedCountry = window.localStorage.getItem('biochess_country');
      if (savedLang) {
        queueMicrotask(() => {
          setSelectedLocale((prev) => ({
            lang: savedLang,
            country: savedCountry || prev.country,
          }));
        });
      }
    } catch {
      // ignore storage restrictions
    }
  }, []);

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
      const curDict = getUiDict(activeLangRef.current);
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code === 'auth/unauthorized-domain') {
        setAuthError(curDict.errUnauthorizedDomain.replace('{host}', window.location.hostname));
      } else if (code && code !== 'auth/popup-closed-by-user') {
        setAuthError(curDict.errGoogleLoginFailed.replace('{code}', ` (${code})`));
      }
    });

    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setLoadedProfileUid(null);
        activeGameIdRef.current = null;
        activeGameDocRef.current = null;
        activeMovesStateRef.current = { gameId: '', moves: [] };
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
        settlingGameIdsRef.current.clear();
        settledGameIdsRef.current.clear();
        for (const timer of Object.values(eloRetryTimersRef.current)) {
          clearTimeout(timer);
        }
        eloRetryTimersRef.current = {};
        eloRetryCountRef.current = {};
        isFlushingQueueRef.current = false;
        pendingCommitQueueRef.current = [];
        optimisticMovesRef.current = [];
        lastCommittedInFlushRef.current = null;
        setIsSubmittingMove(false);
        setOptimisticMoves([]);
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
    viewModeRef.current = viewMode;
  }, [viewMode]);

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
              openGameRoom(toRestore.id);
            }
          }
        } else {
          // Auto-open newly started PvP matches when user is in lobby or viewing an already finished game
          const brandNewPvp = activePvpGames.find((g) => !knownActivePvpIdsRef.current.has(g.id));
          for (const g of activePvpGames) {
            knownActivePvpIdsRef.current.add(g.id);
          }
          const isCurrentlyInActiveGame = Boolean(
            viewModeRef.current === 'game' &&
              activeGameIdRef.current &&
              activeGameDocRef.current?.id === activeGameIdRef.current &&
              activeGameDocRef.current.status === 'active'
          );
          if (brandNewPvp && !isCurrentlyInActiveGame) {
            soundFX.playChallenge();
            openGameRoom(brandNewPvp.id);
          }
        }

        for (const finGame of unappliedFinished) {
          attemptSettleGameElo(uid, finGame);
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
  }, [authReady, authUser, hasProfile, handleListenerError, attemptSettleGameElo, openGameRoom]);

  // Settle ELO immediately when activeGameDoc finishes (even if user has >500 historical games)
  useEffect(() => {
    if (!authReady || !authUser || !hasProfile || !activeGameDoc) return;
    if (activeGameDoc.status === 'active') return;
    attemptSettleGameElo(authUser.uid, activeGameDoc);
  }, [authReady, authUser, hasProfile, activeGameDoc, attemptSettleGameElo]);

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
        if (activeGameIdRef.current !== roomGameId) return;
        setActiveGameDoc(docSnap);
        if (docSnap?.rematchGameId && docSnap.rematchGameId !== roomGameId) {
          openGameRoom(docSnap.rematchGameId);
          soundFX.playChallenge();
        }
      },
      (moves) => {
        if (activeGameIdRef.current !== roomGameId) return;
        setActiveMovesState({ gameId: roomGameId, moves });
      },
      (messages) => {
        if (activeGameIdRef.current !== roomGameId) return;
        setActiveMessagesState({ gameId: roomGameId, messages });
      },
      handleListenerError
    );

    return () => unsub();
  }, [authReady, authUser, hasProfile, activeGameId, handleListenerError, openGameRoom]);

  const activeGame: GameState | null = useMemo(() => {
    if (!activeGameId || !activeGameDoc || activeGameDoc.id !== activeGameId) return null;
    const baseMoves = activeMovesState.gameId === activeGameId ? activeMovesState.moves : [];
    const messages = activeMessagesState.gameId === activeGameId ? activeMessagesState.messages : [];
    const assembled = assembleGameState(activeGameDoc, baseMoves, messages);

    const queuedForGame = optimisticMoves.filter((q) => q.gameId === activeGameId);
    if (assembled.status === 'active' && queuedForGame.length > 0) {
      const unseenMoves = queuedForGame
        .filter((q) => q.ply > baseMoves.length)
        .map((q) => q.move);
      const uncommitted = queuedForGame.filter((q) => q.ply > activeGameDoc.movesCount);
      const latestUncommitted =
        uncommitted.length > 0 ? uncommitted[uncommitted.length - 1] : null;

      if (unseenMoves.length > 0 || latestUncommitted) {
        return {
          ...assembled,
          fen: latestUncommitted ? latestUncommitted.fen : assembled.fen,
          pgn: latestUncommitted ? latestUncommitted.pgn : assembled.pgn,
          turn: latestUncommitted ? latestUncommitted.turn : assembled.turn,
          moves: unseenMoves.length > 0 ? [...baseMoves, ...unseenMoves] : baseMoves,
        };
      }
    }

    return assembled;
  }, [activeGameId, activeGameDoc, activeMovesState, activeMessagesState, optimisticMoves]);

  // Prune optimistic moves once Firestore doc & moves subcollection snapshots have caught up
  useEffect(() => {
    const docId = activeGameDoc?.id || '';
    const docMoves = activeGameDoc?.movesCount ?? 0;
    const docStatus = activeGameDoc?.status || 'active';
    const subMovesLen =
      activeMovesState.gameId === activeGameId ? activeMovesState.moves.length : 0;

    if (
      lastCommittedInFlushRef.current &&
      (!activeGameId ||
        lastCommittedInFlushRef.current.gameId !== activeGameId ||
        (docId === activeGameId && docMoves >= lastCommittedInFlushRef.current.movesCount))
    ) {
      lastCommittedInFlushRef.current = null;
    }

    const filtered = optimisticMovesRef.current.filter((q) => {
      if (!activeGameId || q.gameId !== activeGameId) return false;
      if (docId === activeGameId) {
        if (docStatus !== 'active') return false;
        if (q.ply <= docMoves && q.ply <= subMovesLen) return false;
      }
      return true;
    });

    if (filtered.length !== optimisticMovesRef.current.length) {
      optimisticMovesRef.current = filtered;
      const t = setTimeout(() => {
        setOptimisticMoves(filtered);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [
    activeGameId,
    activeGameDoc?.id,
    activeGameDoc?.movesCount,
    activeGameDoc?.status,
    activeMovesState.gameId,
    activeMovesState.moves.length,
  ]);

  // Audio FX for moves, game end, and opponent chat messages
  useEffect(() => {
    if (!activeGame) return;
    const gId = activeGame.id;
    const prevCount = prevMovesCountRef.current[gId] ?? activeGame.moves.length;
    const prevStatus = prevGameStatusRef.current[gId] ?? activeGame.status;
    const alreadyPlayedLocally =
      lastLocallyPlayedMoveRef.current?.gameId === gId &&
      lastLocallyPlayedMoveRef.current?.ply === activeGame.moves.length;

    if (activeGame.moves.length > prevCount) {
      const lastMove = activeGame.moves[activeGame.moves.length - 1];

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
    } else if (prevStatus === 'active' && activeGame.status !== 'active' && !alreadyPlayedLocally) {
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

  const hasPendingOptimisticForActive = Boolean(
    activeGameId &&
      activeGameDoc &&
      optimisticMoves.some(
        (q) =>
          q.gameId === activeGameId &&
          (q.ply > activeGameDoc.movesCount ||
            q.ply >
              (activeMovesState.gameId === activeGameId ? activeMovesState.moves.length : 0))
      )
  );

  const isBoardSynced = Boolean(
    activeGame &&
      activeGameDoc &&
      activeGameDoc.id === activeGame.id &&
      activeMovesState.gameId === activeGame.id &&
      activeGame.moves.length === activeGameDoc.movesCount &&
      !isSubmittingMove &&
      !hasPendingOptimisticForActive
  );

  const activeDocMovesSynced = Boolean(
    isBoardSynced &&
      activeGameDoc &&
      activeGameDoc.movesCount >= 1
  );

  const isDummyActiveGame = Boolean(activeGame?.isBotGame && activeGame?.botId === 'dummy');

  const isClockRunning = Boolean(
    activeGame &&
      activeGame.status === 'active' &&
      !isDummyActiveGame &&
      activeGame.timeControl !== 'unlimited' &&
      activeDocMovesSynced &&
      activeGame.lastMoveAt > 0
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
    authUserRef.current = authUser;
  }, [authUser]);

  useEffect(() => {
    latestGameRef.current = activeGame;
    activeGameRef.current = activeGame;
  }, [activeGame]);

  useEffect(() => {
    activeGameDocRef.current = activeGameDoc;
  }, [activeGameDoc]);

  useEffect(() => {
    activeMovesStateRef.current = activeMovesState;
  }, [activeMovesState]);

  useEffect(() => {
    liveTimesRef.current = { w: whiteTimeMs, b: blackTimeMs };
  }, [whiteTimeMs, blackTimeMs]);

  const clockGameId = activeGame?.id || '';
  const clockLastMoveAt = activeGame?.lastMoveAt ?? 0;
  const clockTurn = activeGame?.turn ?? 'w';
  const clockMovesCount = activeGameDoc?.movesCount ?? 0;
  const clockBaseWhiteMs = activeGame?.whiteTimeMs ?? 0;
  const clockBaseBlackMs = activeGame?.blackTimeMs ?? 0;
  const authUid = authUser?.uid || '';

  // Live clock synchronization (drift-free using lastMoveAt) + timeout detection
  useEffect(() => {
    if (!clockGameId || !isClockRunning || clockLastMoveAt <= 0) return;

    console.info('[BioChess][Timer] Clock loop started', {
      clockGameId,
      clockTurn,
      clockMovesCount,
      clockBaseWhiteMs,
      clockBaseBlackMs,
      clockLastMoveAt,
    });

    const tick = () => {
      const elapsed = Math.max(0, Date.now() - clockLastMoveAt);
      const nextW = clockTurn === 'w' ? Math.max(0, clockBaseWhiteMs - elapsed) : clockBaseWhiteMs;
      const nextB = clockTurn === 'b' ? Math.max(0, clockBaseBlackMs - elapsed) : clockBaseBlackMs;
      setLiveClock({ gameId: clockGameId, w: nextW, b: nextB });

      const activeRemainingMs = clockTurn === 'w' ? nextW : nextB;
      const claimKey = `${clockGameId}:${clockTurn}:${clockMovesCount}`;
      const currentGame = latestGameRef.current;

      if (activeRemainingMs <= 0) {
        const retryAt = timeoutRetryAfterRef.current[claimKey] ?? 0;
        const alreadyClaimedGame = timeoutClaimedGameIdsRef.current.has(clockGameId);
        const alreadyClaimingKey = timeoutClaimedIdRef.current === claimKey;

        if (alreadyClaimedGame || alreadyClaimingKey) {
          return;
        }
        if (Date.now() < retryAt) {
          return;
        }

        if (
          authUid &&
          currentGame &&
          currentGame.id === clockGameId &&
          currentGame.status === 'active' &&
          currentGame.turn === clockTurn &&
          currentGame.moves.length >= 1
        ) {
          timeoutClaimedIdRef.current = claimKey;
          const timedOut: PieceColor = clockTurn;
          console.info('[BioChess][Timer] Clock reached 0ms, claiming timeout', {
            claimKey,
            timedOut,
            elapsed,
            clockBaseWhiteMs,
            clockBaseBlackMs,
          });
          void claimTimeoutInFirestore(currentGame, timedOut, authUid, activeLangRef.current)
            .then((outcome) => {
              console.info('[BioChess][Timer] Timeout claim outcome', { claimKey, outcome });
              if (outcome === 'claimed') {
                timeoutClaimedGameIdsRef.current.add(clockGameId);
              } else {
                timeoutRetryAfterRef.current[claimKey] = Date.now() + 2000;
                if (timeoutClaimedIdRef.current === claimKey) {
                  timeoutClaimedIdRef.current = null;
                }
              }
            })
            .catch((err: Error) => {
              console.error('[BioChess][Timer] Timeout claim error (cooldown 3s, no crash):', {
                claimKey,
                err,
              });
              timeoutRetryAfterRef.current[claimKey] = Date.now() + 3000;
              if (timeoutClaimedIdRef.current === claimKey) {
                timeoutClaimedIdRef.current = null;
              }
            });
        } else {
          console.warn('[BioChess][Timer] Active clock <= 0 but game guard skipped claim', {
            claimKey,
            hasAuth: Boolean(authUid),
            currentGameId: currentGame?.id,
            currentStatus: currentGame?.status,
            currentTurn: currentGame?.turn,
            movesLen: currentGame?.moves.length,
          });
        }
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
    clockMovesCount,
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
      const botColor: PieceColor = latestGame.white.isBot ? 'w' : 'b';
      const botRemainingMs = botColor === 'w' ? liveTimesRef.current.w : liveTimesRef.current.b;
      if (
        latestGame.timeControl !== 'unlimited' &&
        latestGame.moves.length >= 1 &&
        botRemainingMs <= 0
      ) {
        console.info('[BioChess][Bot] Skipping bot move because bot clock already expired', {
          gameId: botGameId,
          botColor,
          botRemainingMs,
        });
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
          console.error('Bot move warning:', err);
        });
    }, 620);

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
      const curDict = getUiDict(activeLangRef.current);
      if (code === 'auth/popup-blocked') {
        if (typeof window !== 'undefined' && window.self === window.top) {
          try {
            await signInWithRedirect(auth, googleProvider);
            return;
          } catch {
            // fall through to clear message
          }
        }
        setAuthError(curDict.errPopupBlocked);
        return;
      }
      if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setAuthError(curDict.errUnauthorizedDomain.replace('{host}', host));
        return;
      }
      if (code === 'auth/operation-not-allowed') {
        setAuthError(curDict.errGoogleAuthDisabled);
        return;
      }
      console.error('Google Sign-In error:', code, err);
      setAuthError(
        curDict.errGoogleLoginFailed.replace('{code}', code ? ` (${code})` : '')
      );
    } finally {
      setConnecting(false);
    }
  }

  function handleLocaleChange(opt: WorldLocaleOption) {
    setSelectedLocale({ lang: opt.lang, country: opt.country });
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('biochess_lang', opt.lang);
        window.localStorage.setItem('biochess_country', opt.country);
      } catch {
        // ignore storage restrictions
      }
    }
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
    activeGameIdRef.current = null;
    activeGameDocRef.current = null;
    setProfile(null);
    setActiveGameId(null);
    setViewMode('lobby');
  }

  function handleToggleMute() {
    const next = !muted;
    setMuted(next);
    soundFX.setMuted(next);
  }

  const flushMoveQueue = useCallback(async () => {
    if (isFlushingQueueRef.current) return;
    isFlushingQueueRef.current = true;
    setIsSubmittingMove(true);

    try {
      while (pendingCommitQueueRef.current.length > 0) {
        const item = pendingCommitQueueRef.current[0];
        const currentUser = authUserRef.current;
        const docSnap = activeGameDocRef.current;
        const movesSnap = activeMovesStateRef.current;

        if (!currentUser || !docSnap || docSnap.id !== item.gameId) {
          pendingCommitQueueRef.current = pendingCommitQueueRef.current.filter(
            (q) => q.gameId !== item.gameId
          );
          optimisticMovesRef.current = optimisticMovesRef.current.filter(
            (q) => q.gameId !== item.gameId
          );
          setOptimisticMoves([...optimisticMovesRef.current]);
          continue;
        }

        const baseMoves = movesSnap.gameId === docSnap.id ? movesSnap.moves : [];
        let commitGame = assembleGameState(docSnap, baseMoves, []);
        let expectedMovesCount = Math.max(baseMoves.length, docSnap.movesCount);

        const cachedFlush = lastCommittedInFlushRef.current;
        if (
          cachedFlush &&
          cachedFlush.gameId === item.gameId &&
          cachedFlush.movesCount > expectedMovesCount
        ) {
          commitGame = {
            ...commitGame,
            fen: cachedFlush.fen,
            pgn: cachedFlush.pgn,
            turn: cachedFlush.turn,
            moves: cachedFlush.moves,
            status: cachedFlush.status,
            whiteTimeMs: cachedFlush.whiteTimeMs,
            blackTimeMs: cachedFlush.blackTimeMs,
          };
          expectedMovesCount = cachedFlush.movesCount;
        }

        if (commitGame.status !== 'active') {
          pendingCommitQueueRef.current = pendingCommitQueueRef.current.filter(
            (q) => q.gameId !== item.gameId
          );
          optimisticMovesRef.current = optimisticMovesRef.current.filter(
            (q) => q.gameId !== item.gameId
          );
          setOptimisticMoves([...optimisticMovesRef.current]);
          continue;
        }

        let liveWhiteMs = commitGame.whiteTimeMs;
        let liveBlackMs = commitGame.blackTimeMs;
        const isDummyMode = Boolean(commitGame.isBotGame && commitGame.botId === 'dummy');
        if (
          !isDummyMode &&
          commitGame.timeControl !== 'unlimited' &&
          expectedMovesCount >= 1 &&
          commitGame.lastMoveAt > 0
        ) {
          const elapsed = Math.max(0, Date.now() - commitGame.lastMoveAt);
          if (commitGame.turn === 'w') {
            liveWhiteMs = Math.max(0, commitGame.whiteTimeMs - elapsed);
          } else {
            liveBlackMs = Math.max(0, commitGame.blackTimeMs - elapsed);
          }
        }

        try {
          const res = await submitMoveToFirestore({
            game: commitGame,
            uid: currentUser.uid,
            from: item.from,
            to: item.to,
            promotion: item.promotion,
            liveWhiteMs,
            liveBlackMs,
            expectedMovesCount,
            lang: activeLangRef.current,
          });

          pendingCommitQueueRef.current.shift();

          if (!res.ok) {
            lastLocallyPlayedMoveRef.current = null;
            pendingCommitQueueRef.current = pendingCommitQueueRef.current.filter(
              (q) => q.gameId !== item.gameId
            );
            optimisticMovesRef.current = optimisticMovesRef.current.filter(
              (q) => q.gameId !== item.gameId || q.ply < item.ply
            );
            setOptimisticMoves([...optimisticMovesRef.current]);
            setGameError(res.error);
            setTimeout(() => setGameError(null), 3000);
            break;
          }

          lastCommittedInFlushRef.current = {
            gameId: item.gameId,
            movesCount: item.ply,
            fen: item.fen,
            pgn: item.pgn,
            turn: item.turn,
            moves: [...commitGame.moves, { ...item.move, quality: res.quality }],
            status: res.nextStatus,
            whiteTimeMs: liveWhiteMs,
            blackTimeMs: liveBlackMs,
          };

          if (commitGame.isBotGame) {
            humanMoveMetaRef.current = {
              gameId: item.gameId,
              ply: item.ply,
              quality: res.quality,
              captured: res.captured,
              inCheck: res.inCheck,
            };
          }
        } catch (err) {
          pendingCommitQueueRef.current.shift();
          lastLocallyPlayedMoveRef.current = null;
          pendingCommitQueueRef.current = pendingCommitQueueRef.current.filter(
            (q) => q.gameId !== item.gameId
          );
          optimisticMovesRef.current = optimisticMovesRef.current.filter(
            (q) => q.gameId !== item.gameId || q.ply < item.ply
          );
          setOptimisticMoves([...optimisticMovesRef.current]);
          console.error('Move submission warning:', err);
          setGameError(getUiDict(activeLangRef.current).errMoveFailed);
          setTimeout(() => setGameError(null), 3500);
          break;
        }
      }
    } finally {
      isFlushingQueueRef.current = false;
      setIsSubmittingMove(pendingCommitQueueRef.current.length > 0);
    }
  }, []);

  const handlePlayerMove = useCallback(
    (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
      const currentUser = authUserRef.current;
      const docSnap = activeGameDocRef.current;
      const movesSnap = activeMovesStateRef.current;
      if (!currentUser || !docSnap || docSnap.status !== 'active') return;

      const gameId = docSnap.id;
      const existingQueued = optimisticMovesRef.current.filter((q) => q.gameId === gameId);
      if (existingQueued.some((q) => q.isGameOver)) {
        return;
      }

      const subMovesLen = movesSnap.gameId === gameId ? movesSnap.moves.length : 0;
      const committedCount = Math.max(docSnap.movesCount, subMovesLen);
      const pendingAhead = existingQueued.filter((q) => q.ply > docSnap.movesCount);
      const latestAhead =
        pendingAhead.length > 0 ? pendingAhead[pendingAhead.length - 1] : null;

      const effectiveFen = latestAhead ? latestAhead.fen : docSnap.fen;
      const effectivePlyBase = Math.max(
        committedCount,
        latestAhead ? latestAhead.ply : 0
      );

      soundFX.unlock();

      let previewChess: Chess;
      let movingColor: PieceColor;
      let previewRes: ReturnType<Chess['move']>;
      try {
        const committedMoves = movesSnap.gameId === gameId ? movesSnap.moves : [];
        const baseChess = buildChessWithHistory({
          fen: docSnap.fen,
          pgn: docSnap.pgn,
          moves: committedMoves,
        });
        for (const q of pendingAhead) {
          baseChess.move({
            from: q.from,
            to: q.to,
            ...(q.promotion ? { promotion: q.promotion } : {}),
          });
        }
        previewChess = baseChess.fen() === effectiveFen ? baseChess : new Chess(effectiveFen);
        movingColor = previewChess.turn();
        const fromPiece = previewChess.get(from as Square);
        const isPawnPromotion =
          fromPiece?.type === 'p' &&
          ((fromPiece.color === 'w' && to[1] === '8') ||
            (fromPiece.color === 'b' && to[1] === '1'));
        previewRes = previewChess.move({
          from,
          to,
          ...(promotion ? { promotion } : isPawnPromotion ? { promotion: 'q' } : {}),
        });
      } catch {
        return;
      }
      if (!previewRes) return;

      const nextPly = effectivePlyBase + 1;
      lastLocallyPlayedMoveRef.current = { gameId, ply: nextPly };

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

      const entry: QueuedMoveEntry = {
        id: `${gameId}_${nextPly}_${Date.now()}`,
        gameId,
        ply: nextPly,
        from,
        to,
        promotion: (previewRes.promotion as 'q' | 'r' | 'b' | 'n' | undefined) || promotion,
        fen: previewChess.fen(),
        pgn: previewChess.pgn(),
        turn: previewChess.turn(),
        move: {
          san: previewRes.san,
          from: previewRes.from,
          to: previewRes.to,
          fen: previewChess.fen(),
          color: movingColor,
          captured: previewRes.captured,
          promotion: previewRes.promotion,
          timestamp: Date.now(),
        },
        isGameOver: isOver,
      };

      optimisticMovesRef.current = [...optimisticMovesRef.current, entry];
      pendingCommitQueueRef.current = [...pendingCommitQueueRef.current, entry];
      setOptimisticMoves(optimisticMovesRef.current);
      setIsSubmittingMove(true);

      void flushMoveQueue();
    },
    [flushMoveQueue]
  );

  const needsUsernameChoice = Boolean(authReady && authUser && profileLoaded && !profile);

  function navigateToLobbyTab(tab?: LobbyTab) {
    if (!activeGame || activeGame.status !== 'active') {
      const staleGameId = activeGameIdRef.current;
      activeGameIdRef.current = null;
      activeGameDocRef.current = null;
      activeMovesStateRef.current = { gameId: '', moves: [] };
      setActiveGameId(null);
      setActiveGameDoc(null);
      setActiveMovesState({ gameId: '', moves: [] });
      setActiveMessagesState({ gameId: '', messages: [] });
      if (
        authUser &&
        staleGameId &&
        settledGameIdsRef.current.has(staleGameId)
      ) {
        void setPresence(authUser.uid, true, '').catch(() => {});
      }
    }
    if (tab) {
      setLobbyTab(tab);
    }
    setViewMode('lobby');
  }

  return (
    <BoardThemeProvider>
    <div className="min-h-screen flex flex-col bg-[#302E2B] text-[#F3F3F2]">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-[#3C3A36] bg-[#262421]">
        <div className="max-w-[1160px] mx-auto px-2.5 sm:px-6 h-14 flex items-center justify-between gap-1.5 sm:gap-6 lg:gap-8">
          {/* Zone 1: BioChess Emblem + Wordmark */}
          <button
            type="button"
            onClick={() => navigateToLobbyTab()}
            className="inline-flex items-center gap-1.5 sm:gap-2.5 text-sm sm:text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            <span className="relative w-7 h-7 sm:w-9 sm:h-9 rounded overflow-hidden border border-[#3C3A36] bg-[#0F1419] shrink-0">
              <Image
                src={BIOCHESS_LOGO}
                alt="BioChess"
                fill
                sizes="(max-width: 640px) 28px, 36px"
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

          {/* Zone 3: Style selector + Language selector + 1 primary user action */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <BoardStylePicker label={dict.navStyle} lang={activeLang} />
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
                  className="px-2 sm:px-3.5 py-1 sm:py-1.5 rounded bg-[#81B64C] hover:bg-[#95C85E] text-white text-[11px] sm:text-xs font-bold border-b-2 border-[#5D8A32] whitespace-nowrap shrink-0"
                >
                  {dict.backToGame}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  title={profile.username}
                  aria-label={`${profile.username} - ${dict.logoutAria}`}
                  className="px-2 sm:px-3 py-1 sm:py-1.5 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#3C3A36] text-[#E5E4E2] text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 sm:gap-2 whitespace-nowrap shrink-0"
                >
                  {countryCodeToFlag(profile.country) && (
                    <span className="hidden sm:inline text-sm leading-none shrink-0" aria-hidden="true">
                      {countryCodeToFlag(profile.country)}
                    </span>
                  )}
                  <span className="max-w-[54px] sm:max-w-[110px] truncate">{profile.username}</span>
                  <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#9E9D9A] shrink-0" />
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
        ) : viewMode === 'game' ? (
          activeGame ? (
            <motion.div
              key={`game-${activeGame.id}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
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
                key={activeGame.id}
                game={activeGame}
                myUid={authUser?.uid}
                myUsername={profile.username}
                dict={dict}
                lang={activeLang}
                whiteTimeMs={whiteTimeMs}
                blackTimeMs={blackTimeMs}
                isBoardSynced={isBoardSynced}
                muted={muted}
                onToggleMute={handleToggleMute}
                onMove={handlePlayerMove}
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
                    authUser.uid,
                    activeLang
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
                rematchPending={isRematchSubmitting}
                onRematch={() => {
                  if (!authUser) return;
                  const targetGame = activeGame;
                  if (rematchInFlightGameIdRef.current === targetGame.id) return;
                  rematchInFlightGameIdRef.current = targetGame.id;
                  setIsRematchSubmitting(true);
                  setGameError(null);
                  const myColor: PieceColor =
                    !targetGame.white.isBot && targetGame.white.uid === authUser.uid ? 'w' : 'b';
                  void requestOrAcceptRematchInFirestore(
                    targetGame,
                    myColor,
                    authUser.uid,
                    activeLang
                  )
                    .then((newId) => {
                      if (newId) {
                        openGameRoom(newId);
                        soundFX.playChallenge();
                      }
                    })
                    .catch((err: Error) => {
                      console.error('Rematch warning:', err);
                      let reason = '';
                      try {
                        const parsed = JSON.parse(err.message) as { error?: string; path?: string };
                        if (parsed?.error) {
                          reason = ` (${parsed.error.slice(0, 90)})`;
                        }
                      } catch {
                        if (err?.message) {
                          reason = ` (${err.message.slice(0, 90)})`;
                        }
                      }
                      setGameError(dict.errRematchFailed.replace('{reason}', reason));
                      setTimeout(() => setGameError(null), 5000);
                    })
                    .finally(() => {
                      if (rematchInFlightGameIdRef.current === targetGame.id) {
                        rematchInFlightGameIdRef.current = null;
                      }
                      setIsRematchSubmitting(false);
                    });
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
          ) : (
            <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-16 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-7 h-7 animate-spin text-[#81B64C]" />
              <p className="text-sm font-semibold text-[#DAD9D7]">{dict.connecting}</p>
              <button
                type="button"
                onClick={() => navigateToLobbyTab()}
                className="px-3.5 py-1.5 rounded bg-[#3C3A36] hover:bg-[#4B4843] text-xs font-bold text-white"
              >
                {dict.lobby}
              </button>
            </div>
          )
        ) : viewMode === 'coach' ? (
          <motion.div
            key={`coach-${coachSessionKey}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
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
            transition={{ duration: 0.14 }}
          >
            <StatsDashboard
              profile={profile}
              reviews={savedReviews}
              dict={dict}
              lang={activeLang}
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
            transition={{ duration: 0.14 }}
          >
            <LobbyView
              myProfile={profile}
              dict={dict}
              lang={activeLang}
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
                  colorPref,
                  activeLang
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
                void respondToChallenge(challengeId, accept, authUser.uid, activeLang)
                  .then((res) => {
                    if (!res.ok) {
                      setChallengeError(res.error);
                    } else if (res.gameId) {
                      openGameRoom(res.gameId);
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
                    openGameRoom(gameId);
                    soundFX.playChallenge();
                  })
                  .catch((err: Error) => setRuntimeFatalError(err));
              }}
            />
          </motion.div>
        )}
      </main>

      {profile && incomingChallenges.length > 0 && viewMode === 'game' && (
        <IncomingChallengeToast
          challenge={incomingChallenges[0]}
          dict={dict}
          lang={activeLang}
          onAccept={() => {
            if (!authUser) return;
            void respondToChallenge(incomingChallenges[0].id, true, authUser.uid, activeLang)
              .then((res) => {
                if (res.ok && res.gameId) {
                  openGameRoom(res.gameId);
                  soundFX.playChallenge();
                }
              })
              .catch((err: Error) => setRuntimeFatalError(err));
          }}
          onDecline={() => {
            if (!authUser) return;
            void respondToChallenge(incomingChallenges[0].id, false, authUser.uid, activeLang).catch(
              (err: Error) => setRuntimeFatalError(err)
            );
          }}
        />
      )}
    </div>
    </BoardThemeProvider>
  );
}
