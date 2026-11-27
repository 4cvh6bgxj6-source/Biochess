'use client';

import { Chess, type Square } from 'chess.js';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  BOT_DEFINITIONS,
  isTrainingBot,
  TIME_CONTROLS,
  type BotId,
  type Challenge,
  type ChatMessage,
  type ColorPref,
  type GameMove,
  type GameState,
  type GameStatus,
  type PieceColor,
  type PlayerSummary,
  type RecentMatchSummary,
  type SavedGameReview,
  type TimeControlId,
} from './types';
import {
  chooseBotMove,
  evaluatePlayedMove,
  getBotChatReply,
  getBotGreeting,
  getBotMoveComment,
  getBotQualityReaction,
} from './chess-bot';
import { getLocalizedBotDrawReply } from './bot-dialogue';
import { db, handleFirestoreError, OperationType } from './firebase';
import { normalizeUiLang, type SupportedUiLang } from './i18n';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const MIN_ELO = 100;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,20}$/;
const migratingMinEloUids = new Set<string>();

interface FsLocaleText {
  usernameLength: string;
  usernameReserved: string;
  usernameTaken: string;
  invalidOpponent: string;
  cannotChallengeSelf: string;
  playerNotFound: (name: string) => string;
  playerUnavailable: (name: string) => string;
  challengeUnavailable: string;
  onePlayerUnavailable: string;
  matchStarted: string;
  gameEnded: string;
  invalidMove: string;
  timeExpired: string;
  gameNotFound: string;
  moveAlreadyUpdated: string;
  checkmateWins: (name: string) => string;
  stalemateDraw: string;
  repetitionDraw: string;
  insufficientDraw: string;
  fiftyMoveDraw: string;
  resignedReason: (name: string) => string;
  timeoutReason: (name: string) => string;
  drawOfferMsg: (name: string) => string;
  drawAgreedReason: string;
  drawAcceptedMsg: string;
  drawDeclinedMsg: (name: string) => string;
  rematchStartedMsg: string;
  goodGameFallback: string;
  whiteFallback: string;
  blackFallback: string;
  freeOpeningFallback: string;
}

const FS_TEXT: Record<SupportedUiLang, FsLocaleText> = {
  it: {
    usernameLength: 'Usa da 2 a 20 caratteri: solo lettere, numeri o underscore (_).',
    usernameReserved: 'Nome riservato. Scegline un altro.',
    usernameTaken: 'Nome già in uso.',
    invalidOpponent: 'Username avversario non valido.',
    cannotChallengeSelf: 'Non puoi sfidare te stesso.',
    playerNotFound: (n) => `Giocatore "${n}" non trovato.`,
    playerUnavailable: (n) => `Giocatore "${n}" non disponibile.`,
    challengeUnavailable: 'La sfida non è più disponibile.',
    onePlayerUnavailable: 'Uno dei giocatori non è più disponibile.',
    matchStarted: 'Partita iniziata. Buona sfida!',
    gameEnded: 'Partita già conclusa.',
    invalidMove: 'Mossa non valida.',
    timeExpired: 'Tempo scaduto.',
    gameNotFound: 'Partita non trovata.',
    moveAlreadyUpdated: 'Mossa già aggiornata.',
    checkmateWins: (n) => `Scacco matto · Vince ${n}`,
    stalemateDraw: 'Patta per stallo',
    repetitionDraw: 'Patta per ripetizione di mosse',
    insufficientDraw: 'Patta per materiale insufficiente',
    fiftyMoveDraw: 'Patta (regola delle 50 mosse)',
    resignedReason: (n) => `${n} ha abbandonato la partita.`,
    timeoutReason: (n) => `Tempo scaduto per ${n}.`,
    drawOfferMsg: (n) => `${n} propone la patta.`,
    drawAgreedReason: 'Patta concordata.',
    drawAcceptedMsg: 'Patta accettata.',
    drawDeclinedMsg: (n) => `${n} ha rifiutato la patta.`,
    rematchStartedMsg: 'Rivincita iniziata!',
    goodGameFallback: 'Buona partita!',
    whiteFallback: 'Bianco',
    blackFallback: 'Nero',
    freeOpeningFallback: 'Apertura Libera',
  },
  en: {
    usernameLength: 'Use 2 to 20 characters: letters, numbers, or underscore (_) only.',
    usernameReserved: 'Reserved name. Please choose another.',
    usernameTaken: 'Username already taken.',
    invalidOpponent: 'Invalid opponent username.',
    cannotChallengeSelf: 'You cannot challenge yourself.',
    playerNotFound: (n) => `Player "${n}" not found.`,
    playerUnavailable: (n) => `Player "${n}" is unavailable.`,
    challengeUnavailable: 'This challenge is no longer available.',
    onePlayerUnavailable: 'One of the players is no longer available.',
    matchStarted: 'Game started. Good luck!',
    gameEnded: 'Game has already ended.',
    invalidMove: 'Illegal move.',
    timeExpired: 'Time expired.',
    gameNotFound: 'Game not found.',
    moveAlreadyUpdated: 'Move already updated.',
    checkmateWins: (n) => `Checkmate · ${n} wins`,
    stalemateDraw: 'Draw by stalemate',
    repetitionDraw: 'Draw by threefold repetition',
    insufficientDraw: 'Draw by insufficient material',
    fiftyMoveDraw: 'Draw (50-move rule)',
    resignedReason: (n) => `${n} resigned.`,
    timeoutReason: (n) => `${n} ran out of time.`,
    drawOfferMsg: (n) => `${n} offers a draw.`,
    drawAgreedReason: 'Draw by agreement.',
    drawAcceptedMsg: 'Draw accepted.',
    drawDeclinedMsg: (n) => `${n} declined the draw.`,
    rematchStartedMsg: 'Rematch started!',
    goodGameFallback: 'Good game!',
    whiteFallback: 'White',
    blackFallback: 'Black',
    freeOpeningFallback: 'Free Opening',
  },
  es: {
    usernameLength: 'Usa de 2 a 20 caracteres: solo letras, números o guion bajo (_).',
    usernameReserved: 'Nombre reservado. Elige otro.',
    usernameTaken: 'El nombre de usuario ya está en uso.',
    invalidOpponent: 'Usuario del rival no válido.',
    cannotChallengeSelf: 'No puedes desafiarte a ti mismo.',
    playerNotFound: (n) => `Jugador "${n}" no encontrado.`,
    playerUnavailable: (n) => `Jugador "${n}" no disponible.`,
    challengeUnavailable: 'El desafío ya no está disponible.',
    onePlayerUnavailable: 'Uno de los jugadores ya no está disponible.',
    matchStarted: 'Partida iniciada. ¡Buena suerte!',
    gameEnded: 'La partida ya ha terminado.',
    invalidMove: 'Jugada no válida.',
    timeExpired: 'Tiempo agotado.',
    gameNotFound: 'Partida no encontrada.',
    moveAlreadyUpdated: 'Jugada ya actualizada.',
    checkmateWins: (n) => `Jaque mate · Gana ${n}`,
    stalemateDraw: 'Tablas por ahogado',
    repetitionDraw: 'Tablas por repetición triple',
    insufficientDraw: 'Tablas por material insuficiente',
    fiftyMoveDraw: 'Tablas (regla de 50 jugadas)',
    resignedReason: (n) => `${n} se rindió.`,
    timeoutReason: (n) => `Tiempo agotado para ${n}.`,
    drawOfferMsg: (n) => `${n} ofrece tablas.`,
    drawAgreedReason: 'Tablas acordadas.',
    drawAcceptedMsg: 'Tablas aceptadas.',
    drawDeclinedMsg: (n) => `${n} rechazó las tablas.`,
    rematchStartedMsg: '¡Revancha iniciada!',
    goodGameFallback: '¡Buena partida!',
    whiteFallback: 'Blancas',
    blackFallback: 'Negras',
    freeOpeningFallback: 'Apertura libre',
  },
  fr: {
    usernameLength: 'Utilisez 2 à 20 caractères : lettres, chiffres ou underscore (_).',
    usernameReserved: 'Nom réservé. Choisissez-en un autre.',
    usernameTaken: 'Nom déjà utilisé.',
    invalidOpponent: "Nom d'adversaire invalide.",
    cannotChallengeSelf: 'Vous ne pouvez pas vous défier vous-même.',
    playerNotFound: (n) => `Joueur "${n}" introuvable.`,
    playerUnavailable: (n) => `Joueur "${n}" indisponible.`,
    challengeUnavailable: "Le défi n'est plus disponible.",
    onePlayerUnavailable: "L'un des joueurs n'est plus disponible.",
    matchStarted: 'Partie commencée. Bonne partie !',
    gameEnded: 'La partie est déjà terminée.',
    invalidMove: 'Coup illégal.',
    timeExpired: 'Temps écoulé.',
    gameNotFound: 'Partie introuvable.',
    moveAlreadyUpdated: 'Coup déjà mis à jour.',
    checkmateWins: (n) => `Échec et mat · ${n} gagne`,
    stalemateDraw: 'Nulle par pat',
    repetitionDraw: 'Nulle par répétition',
    insufficientDraw: 'Nulle par matériel insuffisant',
    fiftyMoveDraw: 'Nulle (règle des 50 coups)',
    resignedReason: (n) => `${n} a abandonné.`,
    timeoutReason: (n) => `Temps écoulé pour ${n}.`,
    drawOfferMsg: (n) => `${n} propose la nulle.`,
    drawAgreedReason: 'Nulle convenue.',
    drawAcceptedMsg: 'Nulle acceptée.',
    drawDeclinedMsg: (n) => `${n} a refusé la nulle.`,
    rematchStartedMsg: 'Revanche lancée !',
    goodGameFallback: 'Bonne partie !',
    whiteFallback: 'Blancs',
    blackFallback: 'Noirs',
    freeOpeningFallback: 'Ouverture libre',
  },
  de: {
    usernameLength: 'Verwende 2 bis 20 Zeichen: nur Buchstaben, Ziffern oder Unterstrich (_).',
    usernameReserved: 'Reservierter Name. Bitte wähle einen anderen.',
    usernameTaken: 'Benutzername bereits vergeben.',
    invalidOpponent: 'Ungültiger Gegner-Benutzername.',
    cannotChallengeSelf: 'Du kannst dich nicht selbst herausfordern.',
    playerNotFound: (n) => `Spieler "${n}" nicht gefunden.`,
    playerUnavailable: (n) => `Spieler "${n}" nicht verfügbar.`,
    challengeUnavailable: 'Die Herausforderung ist nicht mehr verfügbar.',
    onePlayerUnavailable: 'Einer der Spieler ist nicht mehr verfügbar.',
    matchStarted: 'Partie gestartet. Viel Erfolg!',
    gameEnded: 'Partie ist bereits beendet.',
    invalidMove: 'Ungültiger Zug.',
    timeExpired: 'Zeit abgelaufen.',
    gameNotFound: 'Partie nicht gefunden.',
    moveAlreadyUpdated: 'Zug bereits aktualisiert.',
    checkmateWins: (n) => `Schachmatt · ${n} gewinnt`,
    stalemateDraw: 'Remis durch Patt',
    repetitionDraw: 'Remis durch Stellungswiederholung',
    insufficientDraw: 'Remis wegen unzureichenden Materials',
    fiftyMoveDraw: 'Remis (50-Züge-Regel)',
    resignedReason: (n) => `${n} hat aufgegeben.`,
    timeoutReason: (n) => `Zeit abgelaufen für ${n}.`,
    drawOfferMsg: (n) => `${n} bietet Remis an.`,
    drawAgreedReason: 'Remis vereinbart.',
    drawAcceptedMsg: 'Remis angenommen.',
    drawDeclinedMsg: (n) => `${n} hat Remis abgelehnt.`,
    rematchStartedMsg: 'Revanche gestartet!',
    goodGameFallback: 'Gute Partie!',
    whiteFallback: 'Weiß',
    blackFallback: 'Schwarz',
    freeOpeningFallback: 'Freie Eröffnung',
  },
  pt: {
    usernameLength: 'Use de 2 a 20 caracteres: apenas letras, números ou underscore (_).',
    usernameReserved: 'Nome reservado. Escolha outro.',
    usernameTaken: 'Nome já está em uso.',
    invalidOpponent: 'Nome de usuário do adversário inválido.',
    cannotChallengeSelf: 'Você não pode desafiar a si mesmo.',
    playerNotFound: (n) => `Jogador "${n}" não encontrado.`,
    playerUnavailable: (n) => `Jogador "${n}" indisponível.`,
    challengeUnavailable: 'O desafio não está mais disponível.',
    onePlayerUnavailable: 'Um dos jogadores não está mais disponível.',
    matchStarted: 'Partida iniciada. Bom jogo!',
    gameEnded: 'Partida já encerrada.',
    invalidMove: 'Lance inválido.',
    timeExpired: 'Tempo esgotado.',
    gameNotFound: 'Partida não encontrada.',
    moveAlreadyUpdated: 'Lance já atualizado.',
    checkmateWins: (n) => `Xeque-mate · ${n} vence`,
    stalemateDraw: 'Empate por afogamento',
    repetitionDraw: 'Empate por repetição de lances',
    insufficientDraw: 'Empate por material insuficiente',
    fiftyMoveDraw: 'Empate (regra dos 50 lances)',
    resignedReason: (n) => `${n} desistiu.`,
    timeoutReason: (n) => `Tempo esgotado para ${n}.`,
    drawOfferMsg: (n) => `${n} propõe empate.`,
    drawAgreedReason: 'Empate acordado.',
    drawAcceptedMsg: 'Empate aceito.',
    drawDeclinedMsg: (n) => `${n} recusou o empate.`,
    rematchStartedMsg: 'Revanche iniciada!',
    goodGameFallback: 'Bom jogo!',
    whiteFallback: 'Brancas',
    blackFallback: 'Pretas',
    freeOpeningFallback: 'Abertura Livre',
  },
  ru: {
    usernameLength: 'От 2 до 20 символов: только буквы, цифры или подчёркивание (_).',
    usernameReserved: 'Имя зарезервировано. Выберите другое.',
    usernameTaken: 'Имя уже занято.',
    invalidOpponent: 'Некорректное имя соперника.',
    cannotChallengeSelf: 'Нельзя вызвать самого себя.',
    playerNotFound: (n) => `Игрок «${n}» не найден.`,
    playerUnavailable: (n) => `Игрок «${n}» недоступен.`,
    challengeUnavailable: 'Вызов больше недействителен.',
    onePlayerUnavailable: 'Один из игроков больше недоступен.',
    matchStarted: 'Партия началась. Удачи!',
    gameEnded: 'Партия уже завершена.',
    invalidMove: 'Невозможный ход.',
    timeExpired: 'Время вышло.',
    gameNotFound: 'Партия не найдена.',
    moveAlreadyUpdated: 'Ход уже обновлён.',
    checkmateWins: (n) => `Мат · Победил ${n}`,
    stalemateDraw: 'Ничья (пат)',
    repetitionDraw: 'Ничья (троекратное повторение)',
    insufficientDraw: 'Ничья (недостаточно материала)',
    fiftyMoveDraw: 'Ничья (правило 50 ходов)',
    resignedReason: (n) => `${n} сдался.`,
    timeoutReason: (n) => `Время истекло у ${n}.`,
    drawOfferMsg: (n) => `${n} предлагает ничью.`,
    drawAgreedReason: 'Ничья по соглашению.',
    drawAcceptedMsg: 'Ничья принята.',
    drawDeclinedMsg: (n) => `${n} отклонил ничью.`,
    rematchStartedMsg: 'Реванш начался!',
    goodGameFallback: 'Хорошей игры!',
    whiteFallback: 'Белые',
    blackFallback: 'Чёрные',
    freeOpeningFallback: 'Свободный дебют',
  },
  zh: {
    usernameLength: '请使用 2 至 20 个字符：仅限字母、数字或下划线 (_)。',
    usernameReserved: '保留名称，请换一个。',
    usernameTaken: '该用户名已被占用。',
    invalidOpponent: '对手用户名无效。',
    cannotChallengeSelf: '不能挑战自己。',
    playerNotFound: (n) => `未找到玩家“${n}”。`,
    playerUnavailable: (n) => `玩家“${n}”当前不可用。`,
    challengeUnavailable: '该挑战已失效。',
    onePlayerUnavailable: '其中一位玩家已不可用。',
    matchStarted: '对局已开始，祝对弈愉快！',
    gameEnded: '对局已结束。',
    invalidMove: '非法着法。',
    timeExpired: '时间耗尽。',
    gameNotFound: '未找到对局。',
    moveAlreadyUpdated: '着法已更新。',
    checkmateWins: (n) => `将杀 · ${n} 获胜`,
    stalemateDraw: '逼和',
    repetitionDraw: '三次重复局面和棋',
    insufficientDraw: '子力不足和棋',
    fiftyMoveDraw: '50步规则和棋',
    resignedReason: (n) => `${n} 认输。`,
    timeoutReason: (n) => `${n} 超时。`,
    drawOfferMsg: (n) => `${n} 提出和棋。`,
    drawAgreedReason: '双方同意和棋。',
    drawAcceptedMsg: '和棋已接受。',
    drawDeclinedMsg: (n) => `${n} 拒绝了和棋。`,
    rematchStartedMsg: '再战已开始！',
    goodGameFallback: '祝你对局愉快！',
    whiteFallback: '白棋',
    blackFallback: '黑棋',
    freeOpeningFallback: '自由开局',
  },
  ja: {
    usernameLength: '2〜20文字の英数字またはアンダースコア(_)を使用してください。',
    usernameReserved: '予約語のため使用できません。別の名前を選んでください。',
    usernameTaken: 'このユーザー名は既に使用されています。',
    invalidOpponent: '対戦相手のユーザー名が無効です。',
    cannotChallengeSelf: '自分自身に挑戦することはできません。',
    playerNotFound: (n) => `プレイヤー「${n}」が見つかりません。`,
    playerUnavailable: (n) => `プレイヤー「${n}」は現在利用できません。`,
    challengeUnavailable: 'この挑戦は無効になりました。',
    onePlayerUnavailable: 'いずれかのプレイヤーが利用できません。',
    matchStarted: '対局開始。よろしくお願いします！',
    gameEnded: '対局は既に終了しています。',
    invalidMove: '反則手です。',
    timeExpired: '時間切れです。',
    gameNotFound: '対局が見つかりません。',
    moveAlreadyUpdated: '既に手が更新されています。',
    checkmateWins: (n) => `チェックメイト · ${n} の勝利`,
    stalemateDraw: 'ステイルメイト（引き分け）',
    repetitionDraw: '千日手（引き分け）',
    insufficientDraw: '戦力不足（引き分け）',
    fiftyMoveDraw: '50手ルール（引き分け）',
    resignedReason: (n) => `${n} が投了しました。`,
    timeoutReason: (n) => `${n} の時間切れ。`,
    drawOfferMsg: (n) => `${n} がドローを提案しました。`,
    drawAgreedReason: '合意による引き分け。',
    drawAcceptedMsg: 'ドローが承認されました。',
    drawDeclinedMsg: (n) => `${n} がドローを辞退しました。`,
    rematchStartedMsg: '再戦が開始されました！',
    goodGameFallback: 'よろしくお願いします！',
    whiteFallback: '白',
    blackFallback: '黒',
    freeOpeningFallback: '自由戦型',
  },
  ko: {
    usernameLength: '2~20자의 영문, 숫자 또는 밑줄(_)만 사용하세요.',
    usernameReserved: '예약된 이름입니다. 다른 이름을 선택하세요.',
    usernameTaken: '이미 사용 중인 사용자 이름입니다.',
    invalidOpponent: '상대 사용자 이름이 올바르지 않습니다.',
    cannotChallengeSelf: '자기 자신에게 도전할 수 없습니다.',
    playerNotFound: (n) => `플레이어 "${n}"을(를) 찾을 수 없습니다.`,
    playerUnavailable: (n) => `플레이어 "${n}"을(를) 이용할 수 없습니다.`,
    challengeUnavailable: '더 이상 유효하지 않은 도전입니다.',
    onePlayerUnavailable: '플레이어 중 한 명을 이용할 수 없습니다.',
    matchStarted: '대국이 시작되었습니다. 즐거운 대국 되세요!',
    gameEnded: '이미 종료된 대국입니다.',
    invalidMove: '유효하지 않은 수입니다.',
    timeExpired: '시간이 종료되었습니다.',
    gameNotFound: '대국을 찾을 수 없습니다.',
    moveAlreadyUpdated: '이미 업데이트된 수입니다.',
    checkmateWins: (n) => `체크메이트 · ${n} 승리`,
    stalemateDraw: '스테일메이트 무승부',
    repetitionDraw: '3회 동형 반복 무승부',
    insufficientDraw: '기물 부족 무승부',
    fiftyMoveDraw: '50수 규칙 무승부',
    resignedReason: (n) => `${n} 기권.`,
    timeoutReason: (n) => `${n} 시간 초과.`,
    drawOfferMsg: (n) => `${n} 님이 무승부를 제안했습니다.`,
    drawAgreedReason: '합의 무승부.',
    drawAcceptedMsg: '무승부가 수락되었습니다.',
    drawDeclinedMsg: (n) => `${n} 님이 무승부를 거절했습니다.`,
    rematchStartedMsg: '재대국이 시작되었습니다!',
    goodGameFallback: '좋은 대국 되세요!',
    whiteFallback: '백',
    blackFallback: '흑',
    freeOpeningFallback: '자유 오프닝',
  },
  ar: {
    usernameLength: 'استخدم 2 إلى 20 حرفاً: حروفاً أو أرقاماً أو شرطة سفلية (_) فقط.',
    usernameReserved: 'اسم محجوز. يرجى اختيار اسم آخر.',
    usernameTaken: 'اسم المستخدم مستخدم بالفعل.',
    invalidOpponent: 'اسم مستخدم الخصم غير صالح.',
    cannotChallengeSelf: 'لا يمكنك تحدي نفسك.',
    playerNotFound: (n) => `اللاعب "${n}" غير موجود.`,
    playerUnavailable: (n) => `اللاعب "${n}" غير متاح.`,
    challengeUnavailable: 'لم يعد التحدي متاحاً.',
    onePlayerUnavailable: 'أحد اللاعبين لم يعد متاحاً.',
    matchStarted: 'بدأت المباراة. حظاً موفقاً!',
    gameEnded: 'انتهت المباراة بالفعل.',
    invalidMove: 'نقلة غير قانونية.',
    timeExpired: 'انتهى الوقت.',
    gameNotFound: 'المباراة غير موجودة.',
    moveAlreadyUpdated: 'تم تحديث النقلة بالفعل.',
    checkmateWins: (n) => `كش مات · فاز ${n}`,
    stalemateDraw: 'تعادل بالردب',
    repetitionDraw: 'تعادل بتكرار النقلات',
    insufficientDraw: 'تعادل لعدم كفاية القطع',
    fiftyMoveDraw: 'تعادل (قاعدة 50 نقلة)',
    resignedReason: (n) => `استسلم ${n}.`,
    timeoutReason: (n) => `انتهى وقت ${n}.`,
    drawOfferMsg: (n) => `عرض ${n} التعادل.`,
    drawAgreedReason: 'تعادل بالاتفاق.',
    drawAcceptedMsg: 'تم قبول التعادل.',
    drawDeclinedMsg: (n) => `رفض ${n} التعادل.`,
    rematchStartedMsg: 'بدأت مباراة الإعادة!',
    goodGameFallback: 'مباراة موفقة!',
    whiteFallback: 'الأبيض',
    blackFallback: 'الأسود',
    freeOpeningFallback: 'افتتاح حر',
  },
};

function getFsText(lang?: string): FsLocaleText {
  return FS_TEXT[normalizeUiLang(lang)] || FS_TEXT.en;
}

function clampElo(raw: unknown, fallback = 300): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return Math.max(MIN_ELO, Math.min(10000, Math.round(fallback)));
  }
  return Math.max(MIN_ELO, Math.min(10000, Math.round(raw)));
}
const VALID_BOT_IDS = new Set<BotId>([
  'knight',
  'bishop',
  'king',
  'master',
  'dummy',
  'alien',
  'gothamchess',
  'mittens',
]);
const RESERVED_USERNAMES = new Set([
  'duolingo',
  'luna',
  'martin',
  'master',
  'bot_cavallo',
  'bot_alfiere',
  'bot_re',
  'coach_alien',
  'witty_alien',
  'coach_gothamchess',
  'coach_mittens',
  'dummy_training',
  'biochess',
  'sistema',
  'system',
  'bot',
]);

function sanitizeCountryCode(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const upper = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : undefined;
}

function sanitizeLangCode(raw: unknown): string {
  if (typeof raw !== 'string') return 'it';
  const cleaned = raw.trim().toLowerCase().slice(0, 16);
  return cleaned.length >= 2 ? cleaned : 'it';
}

export function makeEntityId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function tsToMs(val: unknown): number {
  if (val && typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    return val;
  }
  return Date.now();
}

function tsToMsStrict(val: unknown): number | undefined {
  if (val && typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    return val;
  }
  return undefined;
}

export function normalizeUsernameKey(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsernameInput(
  raw: string,
  lang?: string
): { ok: true; username: string; key: string } | { ok: false; error: string } {
  const t = getFsText(lang);
  const trimmed = raw.trim();
  if (!USERNAME_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: t.usernameLength,
    };
  }
  const key = trimmed.toLowerCase();
  if (RESERVED_USERNAMES.has(key)) {
    return { ok: false, error: t.usernameReserved };
  }
  return { ok: true, username: trimmed, key };
}

export interface UserProfileDocData {
  uid: string;
  username: string;
  key: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  online: boolean;
  activeGameId: string;
}

export interface GameDocSnapshot {
  id: string;
  whiteUid: string;
  whiteUsername: string;
  whiteElo: number;
  whiteIsBot: boolean;
  whiteCountry?: string;
  blackUid: string;
  blackUsername: string;
  blackElo: number;
  blackIsBot: boolean;
  blackCountry?: string;
  participantUids: string[];
  fen: string;
  pgn: string;
  turn: PieceColor;
  movesCount: number;
  status: GameStatus;
  winner: PieceColor | 'draw' | '';
  endReason: string;
  timeControl: TimeControlId;
  whiteTimeMs: number;
  blackTimeMs: number;
  drawOfferBy: PieceColor | '';
  rematchRequestedBy: PieceColor | '';
  rematchGameId: string;
  whiteEloApplied: boolean;
  blackEloApplied: boolean;
  isBotGame: boolean;
  botId: BotId | '';
  lastMoveAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

function mapUserDocToSummary(data: Record<string, unknown>): PlayerSummary {
  const activeGameId = typeof data.activeGameId === 'string' ? data.activeGameId : '';
  const online = Boolean(data.online);
  return {
    uid: String(data.uid || ''),
    username: String(data.username || ''),
    elo: clampElo(data.elo, 300),
    wins: typeof data.wins === 'number' ? data.wins : 0,
    losses: typeof data.losses === 'number' ? data.losses : 0,
    draws: typeof data.draws === 'number' ? data.draws : 0,
    status: !online ? 'offline' : activeGameId ? 'in_game' : 'online',
    activeGameId: activeGameId || null,
    lastSeenAtMs: tsToMsStrict(data.updatedAt),
    lang: typeof data.lang === 'string' ? sanitizeLangCode(data.lang) : undefined,
    country: sanitizeCountryCode(data.country),
  };
}

function mapGameDoc(id: string, data: Record<string, unknown>): GameDocSnapshot {
  const rawBotId = typeof data.botId === 'string' ? (data.botId as BotId) : '';
  const botId: BotId | '' = rawBotId && VALID_BOT_IDS.has(rawBotId) ? rawBotId : '';
  return {
    id,
    whiteUid: String(data.whiteUid || ''),
    whiteUsername: String(data.whiteUsername || ''),
    whiteElo: clampElo(data.whiteElo, 300),
    whiteIsBot: Boolean(data.whiteIsBot),
    whiteCountry: sanitizeCountryCode(data.whiteCountry),
    blackUid: String(data.blackUid || ''),
    blackUsername: String(data.blackUsername || ''),
    blackElo: clampElo(data.blackElo, 300),
    blackIsBot: Boolean(data.blackIsBot),
    blackCountry: sanitizeCountryCode(data.blackCountry),
    participantUids: Array.isArray(data.participantUids)
      ? data.participantUids.map((u) => String(u))
      : [],
    fen: String(data.fen || START_FEN),
    pgn: String(data.pgn || ''),
    turn: data.turn === 'b' ? 'b' : 'w',
    movesCount: typeof data.movesCount === 'number' ? data.movesCount : 0,
    status: (data.status as GameStatus) || 'active',
    winner:
      data.winner === 'w' || data.winner === 'b' || data.winner === 'draw'
        ? data.winner
        : '',
    endReason: String(data.endReason || ''),
    timeControl: (data.timeControl as TimeControlId) || 'blitz_5_0',
    whiteTimeMs: typeof data.whiteTimeMs === 'number' ? data.whiteTimeMs : 0,
    blackTimeMs: typeof data.blackTimeMs === 'number' ? data.blackTimeMs : 0,
    drawOfferBy: data.drawOfferBy === 'w' || data.drawOfferBy === 'b' ? data.drawOfferBy : '',
    rematchRequestedBy:
      data.rematchRequestedBy === 'w' || data.rematchRequestedBy === 'b'
        ? data.rematchRequestedBy
        : '',
    rematchGameId: String(data.rematchGameId || ''),
    whiteEloApplied: Boolean(data.whiteEloApplied),
    blackEloApplied: Boolean(data.blackEloApplied),
    isBotGame: Boolean(data.isBotGame),
    botId,
    lastMoveAtMs: tsToMs(data.lastMoveAt),
    createdAtMs: tsToMs(data.createdAt),
    updatedAtMs: tsToMs(data.updatedAt),
  };
}

export function assembleGameState(
  docSnap: GameDocSnapshot,
  moves: GameMove[],
  chat: ChatMessage[]
): GameState {
  const botIdVal = docSnap.botId ? (docSnap.botId as BotId) : undefined;
  return {
    id: docSnap.id,
    white: {
      uid: docSnap.whiteUid,
      username: docSnap.whiteUsername,
      elo: docSnap.whiteElo,
      isBot: docSnap.whiteIsBot,
      botId: docSnap.whiteIsBot ? botIdVal : undefined,
      country: docSnap.whiteCountry,
    },
    black: {
      uid: docSnap.blackUid,
      username: docSnap.blackUsername,
      elo: docSnap.blackElo,
      isBot: docSnap.blackIsBot,
      botId: docSnap.blackIsBot ? botIdVal : undefined,
      country: docSnap.blackCountry,
    },
    fen: docSnap.fen,
    pgn: docSnap.pgn,
    turn: docSnap.turn,
    moves,
    status: docSnap.status,
    winner: docSnap.winner === '' ? null : docSnap.winner,
    endReason: docSnap.endReason || undefined,
    timeControl: docSnap.timeControl,
    whiteTimeMs: docSnap.whiteTimeMs,
    blackTimeMs: docSnap.blackTimeMs,
    lastMoveAt: docSnap.lastMoveAtMs,
    createdAt: docSnap.createdAtMs,
    drawOfferBy: docSnap.drawOfferBy === '' ? null : docSnap.drawOfferBy,
    rematchRequestedBy: docSnap.rematchRequestedBy === '' ? null : docSnap.rematchRequestedBy,
    rematchGameId: docSnap.rematchGameId || undefined,
    whiteEloApplied: docSnap.whiteEloApplied,
    blackEloApplied: docSnap.blackEloApplied,
    chat,
    isBotGame: docSnap.isBotGame,
    botId: botIdVal,
  };
}

export async function registerBioChessUsername(
  uid: string,
  rawUsername: string,
  rawLang = 'en',
  rawCountry = 'US'
): Promise<{ ok: true; profile: PlayerSummary } | { ok: false; error: string }> {
  const t = getFsText(rawLang);
  const v = validateUsernameInput(rawUsername, rawLang);
  if (!v.ok) return v;

  const lang = sanitizeLangCode(rawLang);
  const country = sanitizeCountryCode(rawCountry) || 'US';

  const usernamePath = `usernames/${v.key}`;
  try {
    const existingClaim = await getDoc(doc(db, 'usernames', v.key));
    if (existingClaim.exists()) {
      return { ok: false, error: t.usernameTaken };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, usernamePath);
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', v.key), {
      uid,
      username: v.username,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid), {
      uid,
      username: v.username,
      key: v.key,
      elo: 300,
      wins: 0,
      losses: 0,
      draws: 0,
      online: true,
      activeGameId: '',
      lang,
      country,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    return {
      ok: true,
      profile: {
        uid,
        username: v.username,
        elo: 300,
        wins: 0,
        losses: 0,
        draws: 0,
        status: 'online',
        activeGameId: null,
        lang,
        country,
      },
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function updateUserLocale(
  uid: string,
  rawLang: string,
  rawCountry: string
): Promise<void> {
  const path = `users/${uid}`;
  const lang = sanitizeLangCode(rawLang);
  const country = sanitizeCountryCode(rawCountry) || 'IT';
  try {
    await updateDoc(doc(db, 'users', uid), {
      lang,
      country,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setPresence(
  uid: string,
  online: boolean,
  activeGameId?: string
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const payload: Record<string, unknown> = {
      online,
      updatedAt: serverTimestamp(),
    };
    if (activeGameId !== undefined) {
      payload.activeGameId = activeGameId;
    }
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function ensureMinEloFloor(uid: string): Promise<void> {
  if (!uid || migratingMinEloUids.has(uid)) return;
  migratingMinEloUids.add(uid);
  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, 'users', uid);
      const snap = await tx.get(userRef);
      if (!snap.exists()) return;
      const data = snap.data();
      if (typeof data.elo !== 'number' || !Number.isFinite(data.elo) || data.elo < MIN_ELO) {
        tx.update(userRef, {
          elo: MIN_ELO,
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    console.warn('[BioChess][ELO] Minimum ELO migration deferred:', err);
  } finally {
    migratingMinEloUids.delete(uid);
  }
}

export function subscribeMyProfile(
  uid: string,
  onProfile: (profile: PlayerSummary | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onProfile(null);
        return;
      }
      const rawData = snap.data();
      if (
        typeof rawData.elo !== 'number' ||
        !Number.isFinite(rawData.elo) ||
        rawData.elo < MIN_ELO
      ) {
        void ensureMinEloFloor(uid);
      }
      onProfile(mapUserDocToSummary(rawData));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeOnlinePlayers(
  myUid: string,
  onPlayers: (players: PlayerSummary[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'users'), where('online', '==', true), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => mapUserDocToSummary(d.data()))
        .filter((p) => p.uid !== myUid)
        .sort((a, b) => b.elo - a.elo);
      onPlayers(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeLeaderboard(
  onLeaderboard: (players: PlayerSummary[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'users'),
    where('elo', '>=', 0),
    orderBy('elo', 'desc'),
    limit(12)
  );
  return onSnapshot(
    q,
    (snap) => {
      onLeaderboard(
        snap.docs
          .map((d) => mapUserDocToSummary(d.data()))
          .sort((a, b) => b.elo - a.elo)
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeRecentMatches(
  onMatches: (matches: RecentMatchSummary[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'recentMatches'),
    where('createdAt', '>', Timestamp.fromMillis(0)),
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: RecentMatchSummary[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          white: String(data.white || ''),
          black: String(data.black || ''),
          winner:
            data.winner === 'w' || data.winner === 'b' || data.winner === 'draw'
              ? data.winner
              : null,
          status: (data.status as GameStatus) || 'draw',
          endReason: String(data.endReason || ''),
          movesCount: typeof data.movesCount === 'number' ? data.movesCount : 0,
          timeControl: (data.timeControl as TimeControlId) || 'blitz_5_0',
          finishedAt: tsToMs(data.createdAt),
          isBotGame: Boolean(data.isBotGame),
        };
      });
      onMatches(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'recentMatches');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeChallenges(
  uid: string,
  onIncoming: (challenges: Challenge[]) => void,
  onOutgoing: (challenges: Challenge[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const qIncoming = query(collection(db, 'challenges'), where('toUid', '==', uid), limit(25));
  const qOutgoing = query(collection(db, 'challenges'), where('fromUid', '==', uid), limit(25));

  const mapDoc = (id: string, data: Record<string, unknown>): Challenge => ({
    id,
    fromUid: String(data.fromUid || ''),
    from: String(data.fromUsername || ''),
    fromElo: clampElo(data.fromElo, 300),
    fromCountry: sanitizeCountryCode(data.fromCountry),
    toUid: String(data.toUid || ''),
    to: String(data.toUsername || ''),
    toCountry: sanitizeCountryCode(data.toCountry),
    timeControl: (data.timeControl as TimeControlId) || 'blitz_5_0',
    colorPref: (data.colorPref as ColorPref) || 'random',
    createdAt: tsToMs(data.createdAt),
    expiresAt: typeof data.expiresAtMs === 'number' ? data.expiresAtMs : Date.now() + 300000,
    targetOnline: true,
  });

  const unsub1 = onSnapshot(
    qIncoming,
    (snap) => {
      const now = Date.now();
      const pending = snap.docs
        .filter((d) => {
          const data = d.data();
          const exp = typeof data.expiresAtMs === 'number' ? data.expiresAtMs : now + 1000;
          return data.status === 'pending' && exp > now;
        })
        .map((d) => mapDoc(d.id, d.data()))
        .sort((a, b) => b.createdAt - a.createdAt);
      onIncoming(pending);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'challenges');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsub2 = onSnapshot(
    qOutgoing,
    (snap) => {
      const now = Date.now();
      const pending = snap.docs
        .filter((d) => {
          const data = d.data();
          const exp = typeof data.expiresAtMs === 'number' ? data.expiresAtMs : now + 1000;
          return data.status === 'pending' && exp > now;
        })
        .map((d) => mapDoc(d.id, d.data()))
        .sort((a, b) => b.createdAt - a.createdAt);
      onOutgoing(pending);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'challenges');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}

export function subscribeMyGames(
  uid: string,
  onGamesUpdate: (activeGames: GameDocSnapshot[], unappliedFinished: GameDocSnapshot[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'games'),
    where('participantUids', 'array-contains', uid),
    limit(500)
  );
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => mapGameDoc(d.id, d.data()));
      const activeGames = docs
        .filter((g) => g.status === 'active')
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);

      const unapplied = docs.filter((g) => {
        if (g.status === 'active') return false;
        const isWhite = !g.whiteIsBot && g.whiteUid === uid;
        const isBlack = !g.blackIsBot && g.blackUid === uid;
        return (isWhite && !g.whiteEloApplied) || (isBlack && !g.blackEloApplied);
      });

      onGamesUpdate(activeGames, unapplied);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'games');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeGameRoom(
  gameId: string,
  onGame: (gameDoc: GameDocSnapshot | null) => void,
  onMoves: (moves: GameMove[]) => void,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const unsubGame = onSnapshot(
    doc(db, 'games', gameId),
    (snap) => {
      if (!snap.exists()) {
        onGame(null);
        return;
      }
      onGame(mapGameDoc(snap.id, snap.data()));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, `games/${gameId}`);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const qMoves = query(collection(db, 'games', gameId, 'moves'), orderBy('ply', 'asc'));
  const unsubMoves = onSnapshot(
    qMoves,
    (snap) => {
      const list: GameMove[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          san: String(data.san || ''),
          from: String(data.from || ''),
          to: String(data.to || ''),
          fen: String(data.fen || ''),
          color: data.color === 'b' ? 'b' : 'w',
          captured: data.captured ? String(data.captured) : undefined,
          promotion: data.promotion ? String(data.promotion) : undefined,
          quality: data.quality as GameMove['quality'],
          cpLoss: typeof data.cpLoss === 'number' ? data.cpLoss : 0,
          timestamp: tsToMs(data.createdAt),
        };
      });
      onMoves(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, `games/${gameId}/moves`);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const qMsgs = query(collection(db, 'games', gameId, 'messages'), orderBy('createdAt', 'asc'));
  const unsubMsgs = onSnapshot(
    qMsgs,
    (snap) => {
      const list: ChatMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          sender: String(data.sender || ''),
          text: String(data.text || ''),
          timestamp: tsToMs(data.createdAt),
          kind:
            data.kind === 'bot' || data.kind === 'system' || data.kind === 'player'
              ? data.kind
              : 'player',
        };
      });
      onMessages(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, `games/${gameId}/messages`);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubGame();
    unsubMoves();
    unsubMsgs();
  };
}

export async function sendChallengeToUser(
  me: PlayerSummary,
  myUid: string,
  targetRawUsername: string,
  timeControl: TimeControlId,
  colorPref: ColorPref,
  lang?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = getFsText(lang || me.lang);
  const trimmed = targetRawUsername.trim();
  const key = normalizeUsernameKey(trimmed);
  if (!USERNAME_REGEX.test(trimmed)) {
    return { ok: false, error: t.invalidOpponent };
  }
  if (key === normalizeUsernameKey(me.username)) {
    return { ok: false, error: t.cannotChallengeSelf };
  }

  let targetUid = '';
  try {
    const claimSnap = await getDoc(doc(db, 'usernames', key));
    if (!claimSnap.exists()) {
      return { ok: false, error: t.playerNotFound(trimmed) };
    }
    targetUid = String(claimSnap.data().uid || '');
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `usernames/${key}`);
  }

  if (!targetUid || targetUid === myUid) {
    return { ok: false, error: t.cannotChallengeSelf };
  }

  let targetUsername = trimmed;
  let targetCountry: string | undefined;
  try {
    const userSnap = await getDoc(doc(db, 'users', targetUid));
    if (!userSnap.exists()) {
      return { ok: false, error: t.playerUnavailable(trimmed) };
    }
    const targetData = userSnap.data();
    targetUsername = String(targetData.username || trimmed).slice(0, 20);
    targetCountry = sanitizeCountryCode(targetData.country);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${targetUid}`);
  }

  const fromCountry = sanitizeCountryCode(me.country);
  const challengeId = makeEntityId('ch');
  try {
    const batch = writeBatch(db);
    const challengePayload: Record<string, unknown> = {
      id: challengeId,
      fromUid: myUid,
      fromUsername: me.username.slice(0, 20),
      fromElo: clampElo(me.elo, 300),
      toUid: targetUid,
      toUsername: targetUsername,
      timeControl,
      colorPref,
      status: 'pending',
      gameId: '',
      expiresAtMs: Date.now() + 5 * 60 * 1000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (fromCountry) challengePayload.fromCountry = fromCountry;
    if (targetCountry) challengePayload.toCountry = targetCountry;

    batch.set(doc(db, 'challenges', challengeId), challengePayload);
    await batch.commit();
    return { ok: true };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `challenges/${challengeId}`);
  }
}

export async function cancelPendingChallenge(challengeId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'challenges', challengeId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `challenges/${challengeId}`);
  }
}

export async function respondToChallenge(
  challengeId: string,
  accept: boolean,
  myUid: string,
  lang?: string
): Promise<{ ok: true; gameId?: string } | { ok: false; error: string }> {
  const t = getFsText(lang);
  if (!accept) {
    try {
      await updateDoc(doc(db, 'challenges', challengeId), {
        status: 'declined',
        updatedAt: serverTimestamp(),
      });
      return { ok: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `challenges/${challengeId}`);
    }
  }

  let chData: Record<string, unknown>;
  try {
    const chSnap = await getDoc(doc(db, 'challenges', challengeId));
    if (!chSnap.exists() || chSnap.data().status !== 'pending') {
      return { ok: false, error: t.challengeUnavailable };
    }
    chData = chSnap.data();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `challenges/${challengeId}`);
  }

  const fromUid = String(chData.fromUid || '');
  const toUid = String(chData.toUid || '');
  const timeControl = (chData.timeControl as TimeControlId) || 'blitz_5_0';
  const colorPref = (chData.colorPref as ColorPref) || 'random';

  let fromProfile: { username: string; elo: number; country?: string };
  let toProfile: { username: string; elo: number; country?: string };
  try {
    const [fromSnap, toSnap] = await Promise.all([
      getDoc(doc(db, 'users', fromUid)),
      getDoc(doc(db, 'users', toUid)),
    ]);
    if (!fromSnap.exists() || !toSnap.exists()) {
      return { ok: false, error: t.onePlayerUnavailable };
    }
    const fd = fromSnap.data();
    const td = toSnap.data();
    fromProfile = {
      username: String(fd.username || chData.fromUsername || ''),
      elo: clampElo(fd.elo, 300),
      country: sanitizeCountryCode(fd.country) || sanitizeCountryCode(chData.fromCountry),
    };
    toProfile = {
      username: String(td.username || chData.toUsername || ''),
      elo: clampElo(td.elo, 300),
      country: sanitizeCountryCode(td.country) || sanitizeCountryCode(chData.toCountry),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${fromUid}`);
  }

  const challengerPlaysWhite =
    colorPref === 'w' ? true : colorPref === 'b' ? false : Math.random() < 0.5;

  const whiteUid = challengerPlaysWhite ? fromUid : toUid;
  const whiteUsername = (challengerPlaysWhite ? fromProfile.username : toProfile.username).slice(0, 32);
  const whiteElo = challengerPlaysWhite ? fromProfile.elo : toProfile.elo;
  const whiteCountry = challengerPlaysWhite ? fromProfile.country : toProfile.country;

  const blackUid = challengerPlaysWhite ? toUid : fromUid;
  const blackUsername = (challengerPlaysWhite ? toProfile.username : fromProfile.username).slice(0, 32);
  const blackElo = challengerPlaysWhite ? toProfile.elo : fromProfile.elo;
  const blackCountry = challengerPlaysWhite ? toProfile.country : fromProfile.country;

  const gameId = makeEntityId('game');
  const tc = TIME_CONTROLS[timeControl];
  const startMsgId = makeEntityId('msg');

  try {
    const batch = writeBatch(db);
    const gamePayload: Record<string, unknown> = {
      id: gameId,
      whiteUid,
      whiteUsername,
      whiteElo: clampElo(whiteElo, 300),
      whiteIsBot: false,
      blackUid,
      blackUsername,
      blackElo: clampElo(blackElo, 300),
      blackIsBot: false,
      participantUids: [whiteUid, blackUid],
      fen: START_FEN,
      pgn: '',
      turn: 'w',
      movesCount: 0,
      status: 'active',
      winner: '',
      endReason: '',
      timeControl,
      whiteTimeMs: tc.initialMs,
      blackTimeMs: tc.initialMs,
      drawOfferBy: '',
      rematchRequestedBy: '',
      rematchGameId: '',
      whiteEloApplied: false,
      blackEloApplied: false,
      isBotGame: false,
      botId: '',
      lastMoveAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (whiteCountry) gamePayload.whiteCountry = whiteCountry;
    if (blackCountry) gamePayload.blackCountry = blackCountry;

    batch.set(doc(db, 'games', gameId), gamePayload);
    batch.set(doc(db, 'games', gameId, 'messages', startMsgId), {
      id: startMsgId,
      sender: 'BioChess',
      authorUid: myUid,
      text: t.matchStarted,
      kind: 'system',
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'challenges', challengeId), {
      status: 'accepted',
      gameId,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', myUid), {
      online: true,
      activeGameId: gameId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return { ok: true, gameId };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${gameId}`);
  }
}

export async function createBotGameInFirestore(
  me: PlayerSummary,
  myUid: string,
  botId: BotId,
  timeControl: TimeControlId,
  colorPref: ColorPref,
  lang?: string
): Promise<string> {
  const bot = BOT_DEFINITIONS[botId];
  const botLang = lang || me.lang;
  const playerPlaysWhite =
    colorPref === 'w' ? true : colorPref === 'b' ? false : Math.random() < 0.5;

  const gameId = makeEntityId('game');
  const tc = TIME_CONTROLS[timeControl];
  const greetMsgId = makeEntityId('msg');

  const myCountry = sanitizeCountryCode(me.country);
  const botCountry = sanitizeCountryCode(bot.country);
  const whiteCountry = playerPlaysWhite ? myCountry : botCountry;
  const blackCountry = playerPlaysWhite ? botCountry : myCountry;

  try {
    const batch = writeBatch(db);
    const gamePayload: Record<string, unknown> = {
      id: gameId,
      whiteUid: playerPlaysWhite ? myUid : 'bot',
      whiteUsername: (playerPlaysWhite ? me.username : bot.name).slice(0, 32),
      whiteElo: playerPlaysWhite ? clampElo(me.elo, 300) : clampElo(bot.elo, 300),
      whiteIsBot: !playerPlaysWhite,
      blackUid: playerPlaysWhite ? 'bot' : myUid,
      blackUsername: (playerPlaysWhite ? bot.name : me.username).slice(0, 32),
      blackElo: playerPlaysWhite ? clampElo(bot.elo, 300) : clampElo(me.elo, 300),
      blackIsBot: playerPlaysWhite,
      participantUids: [myUid],
      fen: START_FEN,
      pgn: '',
      turn: 'w',
      movesCount: 0,
      status: 'active',
      winner: '',
      endReason: '',
      timeControl,
      whiteTimeMs: tc.initialMs,
      blackTimeMs: tc.initialMs,
      drawOfferBy: '',
      rematchRequestedBy: '',
      rematchGameId: '',
      whiteEloApplied: false,
      blackEloApplied: false,
      isBotGame: true,
      botId,
      lastMoveAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (whiteCountry) gamePayload.whiteCountry = whiteCountry;
    if (blackCountry) gamePayload.blackCountry = blackCountry;

    batch.set(doc(db, 'games', gameId), gamePayload);
    batch.set(doc(db, 'games', gameId, 'messages', greetMsgId), {
      id: greetMsgId,
      sender: bot.name.slice(0, 32),
      authorUid: myUid,
      text: getBotGreeting(botId, me.username, botLang).slice(0, 400),
      kind: 'bot',
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', myUid), {
      online: true,
      activeGameId: gameId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return gameId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `games/${gameId}`);
  }
}

export function buildChessWithHistory(game: {
  fen: string;
  pgn?: string;
  moves?: Array<{ from: string; to: string; promotion?: string }>;
}): Chess {
  if (game.moves && game.moves.length > 0) {
    try {
      const replayed = new Chess();
      let ok = true;
      for (const m of game.moves) {
        const res = replayed.move({
          from: m.from,
          to: m.to,
          ...(m.promotion ? { promotion: m.promotion } : {}),
        });
        if (!res) {
          ok = false;
          break;
        }
      }
      if (ok && replayed.fen() === game.fen) {
        return replayed;
      }
    } catch {
      // fall through to PGN / FEN fallback
    }
  }

  if (game.pgn && game.pgn.trim().length > 0) {
    try {
      const fromPgn = new Chess();
      fromPgn.loadPgn(game.pgn);
      if (fromPgn.fen() === game.fen) {
        return fromPgn;
      }
    } catch {
      // fall through to bare FEN fallback
    }
  }

  try {
    return new Chess(game.fen);
  } catch {
    return new Chess();
  }
}

export async function submitMoveToFirestore(params: {
  game: GameState;
  uid: string;
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  liveWhiteMs: number;
  liveBlackMs: number;
  botChatText?: string | null;
  expectedMovesCount?: number;
  lang?: string;
}): Promise<{ ok: true; nextStatus: GameStatus; movedColor: PieceColor; captured?: string; inCheck: boolean; quality: GameMove['quality'] } | { ok: false; error: string }> {
  const { game, uid, from, to, promotion, liveWhiteMs, liveBlackMs, botChatText, expectedMovesCount, lang } = params;
  const t = getFsText(lang);
  if (game.status !== 'active') {
    return { ok: false, error: t.gameEnded };
  }

  const chess = buildChessWithHistory(game);
  const movingColor = chess.turn();
  const prevMove = game.moves.length > 0 ? game.moves[game.moves.length - 1] : undefined;

  let moveRes;
  try {
    const fromPiece = chess.get(from as Square);
    const isPawnPromotion =
      fromPiece?.type === 'p' &&
      ((fromPiece.color === 'w' && to[1] === '8') ||
        (fromPiece.color === 'b' && to[1] === '1'));
    moveRes = chess.move({
      from,
      to,
      ...(promotion ? { promotion } : isPawnPromotion ? { promotion: 'q' } : {}),
    });
  } catch {
    return { ok: false, error: t.invalidMove };
  }
  if (!moveRes) {
    return { ok: false, error: t.invalidMove };
  }

  const baseMovesCount = Math.max(
    game.moves.length,
    typeof expectedMovesCount === 'number' && Number.isFinite(expectedMovesCount) ? expectedMovesCount : 0
  );

  const evalResult = evaluatePlayedMove(
    game.fen,
    from,
    to,
    moveRes.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
    prevMove ? { to: prevMove.to, captured: prevMove.captured } : undefined,
    baseMovesCount
  );

  const tc = TIME_CONTROLS[game.timeControl];
  const isDummyTraining = Boolean(game.isBotGame && game.botId === 'dummy');
  const isClockedActiveTurn =
    !isDummyTraining && game.timeControl !== 'unlimited' && baseMovesCount >= 1;
  const moverRemainingBeforeMove = movingColor === 'w' ? liveWhiteMs : liveBlackMs;
  if (isClockedActiveTurn && moverRemainingBeforeMove <= 0) {
    return { ok: false, error: t.timeExpired };
  }

  let nextWhiteMs = Math.max(0, Math.min(86400000, Math.round(Number.isFinite(liveWhiteMs) ? liveWhiteMs : 0)));
  let nextBlackMs = Math.max(0, Math.min(86400000, Math.round(Number.isFinite(liveBlackMs) ? liveBlackMs : 0)));
  if (isClockedActiveTurn) {
    if (movingColor === 'w') {
      nextWhiteMs = Math.max(1, Math.min(86400000, nextWhiteMs + tc.incrementMs));
    } else {
      nextBlackMs = Math.max(1, Math.min(86400000, nextBlackMs + tc.incrementMs));
    }
  }

  let nextStatus: GameStatus = 'active';
  let nextWinner: PieceColor | 'draw' | '' = '';
  let nextEndReason = '';

  if (chess.isCheckmate()) {
    nextStatus = 'checkmate';
    nextWinner = movingColor;
    nextEndReason = t.checkmateWins(movingColor === 'w' ? game.white.username : game.black.username);
  } else if (chess.isStalemate()) {
    nextStatus = 'stalemate';
    nextWinner = 'draw';
    nextEndReason = t.stalemateDraw;
  } else if (chess.isThreefoldRepetition()) {
    nextStatus = 'draw';
    nextWinner = 'draw';
    nextEndReason = t.repetitionDraw;
  } else if (chess.isInsufficientMaterial()) {
    nextStatus = 'draw';
    nextWinner = 'draw';
    nextEndReason = t.insufficientDraw;
  } else if (chess.isDraw()) {
    nextStatus = 'draw';
    nextWinner = 'draw';
    nextEndReason = t.fiftyMoveDraw;
  }

  const nextPly = baseMovesCount + 1;
  const moveDocId = String(nextPly);
  const safeCpLoss = Number.isFinite(evalResult.cpLoss)
    ? Math.max(0, Math.min(200000, Math.round(evalResult.cpLoss)))
    : 0;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'games', game.id, 'moves', moveDocId), {
      ply: nextPly,
      san: moveRes.san.slice(0, 16),
      from: moveRes.from,
      to: moveRes.to,
      fen: chess.fen().slice(0, 200),
      color: movingColor,
      captured: moveRes.captured ? String(moveRes.captured).slice(0, 2) : '',
      promotion: moveRes.promotion ? String(moveRes.promotion).slice(0, 2) : '',
      quality: evalResult.quality,
      cpLoss: safeCpLoss,
      authorUid: uid,
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'games', game.id), {
      fen: chess.fen().slice(0, 200),
      pgn: chess.pgn().slice(0, 8000),
      turn: chess.turn(),
      movesCount: nextPly,
      status: nextStatus,
      winner: nextWinner,
      endReason: nextEndReason.slice(0, 200),
      whiteTimeMs: nextWhiteMs,
      blackTimeMs: nextBlackMs,
      drawOfferBy: '',
      lastMoveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (nextStatus !== 'active') {
      batch.set(doc(db, 'recentMatches', game.id), {
        id: game.id,
        white: game.white.username.slice(0, 32),
        black: game.black.username.slice(0, 32),
        winner: nextWinner || 'draw',
        status: nextStatus,
        endReason: nextEndReason.slice(0, 200),
        movesCount: nextPly,
        timeControl: game.timeControl,
        isBotGame: game.isBotGame,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }

    if (botChatText && game.isBotGame && game.botId) {
      const msgId = makeEntityId('msg');
      batch.set(doc(db, 'games', game.id, 'messages', msgId), {
        id: msgId,
        sender: BOT_DEFINITIONS[game.botId].name.slice(0, 32),
        authorUid: uid,
        text: botChatText.slice(0, 400),
        kind: 'bot',
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return {
      ok: true,
      nextStatus,
      movedColor: movingColor,
      captured: moveRes.captured,
      inCheck: chess.inCheck(),
      quality: evalResult.quality,
    };
  } catch (error) {
    // Handle concurrent game-end (e.g., timeout/resign committed simultaneously) without crashing
    try {
      const latestSnap = await getDoc(doc(db, 'games', game.id));
      if (!latestSnap.exists()) {
        return { ok: false, error: t.gameNotFound };
      }
      const latestData = latestSnap.data();
      if (latestData.status !== 'active') {
        return { ok: false, error: t.gameEnded };
      }
      if (
        (typeof latestData.movesCount === 'number' && latestData.movesCount >= nextPly) ||
        latestData.turn !== movingColor
      ) {
        return { ok: false, error: t.moveAlreadyUpdated };
      }
    } catch {
      // fall through to standard handler if server check itself fails
    }
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }
}

export async function runBotTurnInFirestore(params: {
  game: GameState;
  uid: string;
  liveWhiteMs: number;
  liveBlackMs: number;
  humanLastMoveMeta?: { quality: GameMove['quality']; captured?: string; inCheck: boolean };
  lang?: string;
}): Promise<boolean> {
  const { game, uid, liveWhiteMs, liveBlackMs, humanLastMoveMeta, lang } = params;
  if (game.status !== 'active' || !game.isBotGame || !game.botId || game.botId === 'dummy') {
    return false;
  }

  const botColor: PieceColor = game.white.isBot ? 'w' : 'b';
  if (game.turn !== botColor) return false;

  const botMove = chooseBotMove(game.fen, game.botId);
  if (!botMove) return false;

  let botComment: string | null = null;
  if (game.botId === 'alien' && botMove.san === 'Nxf7') {
    botComment = getBotMoveComment('alien', 'alien_gambit', lang);
  } else if (humanLastMoveMeta) {
    botComment = getBotQualityReaction(game.botId, humanLastMoveMeta.quality || 'neutral', lang);
    if (!botComment && humanLastMoveMeta.captured === 'q') {
      botComment = getBotMoveComment(game.botId, 'capture_queen', lang);
    } else if (!botComment && humanLastMoveMeta.inCheck && Math.random() < 0.45) {
      botComment = getBotMoveComment(game.botId, 'bot_checked', lang);
    }
  }

  const res = await submitMoveToFirestore({
    game,
    uid,
    from: botMove.from,
    to: botMove.to,
    promotion: (botMove.promotion as 'q' | 'r' | 'b' | 'n' | undefined) || undefined,
    liveWhiteMs,
    liveBlackMs,
    botChatText: botComment,
    lang,
  });

  if (!res.ok) {
    return false;
  }

  if (res.nextStatus === 'checkmate' && game.botId) {
    const winMsg = getBotMoveComment(game.botId, 'checkmate_win', lang);
    if (winMsg) {
      await sendSystemOrBotChatMessage({
        gameId: game.id,
        uid,
        sender: BOT_DEFINITIONS[game.botId].name,
        text: winMsg,
        kind: 'bot',
      });
    }
  } else if (res.nextStatus === 'active' && game.botId && !botComment) {
    if (res.captured === 'q') {
      const text = getBotMoveComment(game.botId, 'capture_queen', lang);
      if (text) {
        await sendSystemOrBotChatMessage({
          gameId: game.id,
          uid,
          sender: BOT_DEFINITIONS[game.botId].name,
          text,
          kind: 'bot',
        });
      }
    } else if (res.inCheck && Math.random() < 0.35) {
      const text = getBotMoveComment(game.botId, 'check_given', lang);
      if (text) {
        await sendSystemOrBotChatMessage({
          gameId: game.id,
          uid,
          sender: BOT_DEFINITIONS[game.botId].name,
          text,
          kind: 'bot',
        });
      }
    }
  }

  return true;
}

export async function sendSystemOrBotChatMessage(params: {
  gameId: string;
  uid: string;
  sender: string;
  text: string;
  kind: 'player' | 'bot' | 'system';
}): Promise<void> {
  const clean = params.text.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!clean) return;
  const msgId = makeEntityId('msg');
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'games', params.gameId, 'messages', msgId), {
      id: msgId,
      sender: params.sender.slice(0, 32),
      authorUid: params.uid,
      text: clean,
      kind: params.kind,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `games/${params.gameId}/messages/${msgId}`);
  }
}

export async function sendPlayerChatAndMaybeBotReply(
  game: GameState,
  uid: string,
  myUsername: string,
  rawText: string,
  lang?: string
): Promise<void> {
  const clean = rawText.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!clean) return;

  await sendSystemOrBotChatMessage({
    gameId: game.id,
    uid,
    sender: myUsername,
    text: clean,
    kind: 'player',
  });

  if (game.isBotGame && game.botId) {
    const botId = game.botId;
    const botColor: PieceColor = game.white.isBot ? 'w' : 'b';
    const replyText = getBotChatReply(botId, clean, game.fen, botColor, game.moves.length, lang);
    setTimeout(() => {
      void sendSystemOrBotChatMessage({
        gameId: game.id,
        uid,
        sender: BOT_DEFINITIONS[botId].name,
        text: replyText,
        kind: 'bot',
      });
    }, 350);
  }
}

export async function resignGameInFirestore(
  game: GameState,
  myColor: PieceColor,
  myUsername: string,
  uid: string,
  lang?: string
): Promise<void> {
  if (game.status !== 'active') return;
  const t = getFsText(lang);
  try {
    const latestSnap = await getDoc(doc(db, 'games', game.id));
    if (!latestSnap.exists() || latestSnap.data().status !== 'active') return;
  } catch {
    // proceed and let server rule arbitrate
  }

  const winner: PieceColor = myColor === 'w' ? 'b' : 'w';
  const endReason = t.resignedReason(myUsername).slice(0, 200);
  const msgId = makeEntityId('msg');

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'games', game.id), {
      status: 'resigned',
      winner,
      endReason,
      drawOfferBy: '',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'recentMatches', game.id), {
      id: game.id,
      white: game.white.username.slice(0, 32),
      black: game.black.username.slice(0, 32),
      winner,
      status: 'resigned',
      endReason,
      movesCount: game.moves.length,
      timeControl: game.timeControl,
      isBotGame: game.isBotGame,
      authorUid: uid,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'games', game.id, 'messages', msgId), {
      id: msgId,
      sender: 'BioChess',
      authorUid: uid,
      text: endReason,
      kind: 'system',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    try {
      const latestSnap = await getDoc(doc(db, 'games', game.id));
      if (latestSnap.exists() && latestSnap.data().status !== 'active') {
        return;
      }
    } catch {
      // ignore
    }
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }
}

export async function claimTimeoutInFirestore(
  game: GameState,
  timedOutColor: PieceColor,
  uid: string,
  lang?: string
): Promise<'claimed' | 'already_resolved'> {
  const t = getFsText(lang);
  console.info('[BioChess][Timeout] claimTimeoutInFirestore invoked', {
    gameId: game.id,
    timedOutColor,
    clientStatus: game.status,
    clientTurn: game.turn,
    clientMovesLen: game.moves.length,
    timeControl: game.timeControl,
    uid,
  });

  if (
    game.status !== 'active' ||
    (game.isBotGame && game.botId === 'dummy') ||
    game.timeControl === 'unlimited' ||
    game.moves.length < 1 ||
    game.turn !== timedOutColor
  ) {
    return 'already_resolved';
  }

  const gameRef = doc(db, 'games', game.id);
  const recentRef = doc(db, 'recentMatches', game.id);
  const msgId = makeEntityId('msg');
  const msgRef = doc(db, 'games', game.id, 'messages', msgId);

  try {
    const outcome = await runTransaction(db, async (tx) => {
      const latestSnap = await tx.get(gameRef);
      if (!latestSnap.exists()) {
        return 'already_resolved' as const;
      }
      const latest = mapGameDoc(latestSnap.id, latestSnap.data());

      if (
        latest.status !== 'active' ||
        (latest.isBotGame && latest.botId === 'dummy') ||
        latest.timeControl === 'unlimited' ||
        latest.movesCount < 1 ||
        latest.turn !== timedOutColor
      ) {
        return 'already_resolved' as const;
      }

      const winner: PieceColor = timedOutColor === 'w' ? 'b' : 'w';
      const loserName = timedOutColor === 'w' ? latest.whiteUsername : latest.blackUsername;
      const safeWhiteName = (latest.whiteUsername.trim() || t.whiteFallback).slice(0, 32).padEnd(2, '_');
      const safeBlackName = (latest.blackUsername.trim() || t.blackFallback).slice(0, 32).padEnd(2, '_');
      const endReason = t.timeoutReason(loserName || (timedOutColor === 'w' ? t.whiteFallback : t.blackFallback)).slice(0, 200);
      const clampClock = (ms: number) =>
        Math.max(0, Math.min(86400000, Math.round(Number.isFinite(ms) ? ms : 0)));
      const nextWhiteTimeMs = timedOutColor === 'w' ? 0 : clampClock(latest.whiteTimeMs);
      const nextBlackTimeMs = timedOutColor === 'b' ? 0 : clampClock(latest.blackTimeMs);
      const safeMovesCount = Math.max(1, Math.min(2000, Math.round(latest.movesCount)));

      tx.update(gameRef, {
        status: 'timeout',
        winner,
        endReason,
        whiteTimeMs: nextWhiteTimeMs,
        blackTimeMs: nextBlackTimeMs,
        drawOfferBy: '',
        updatedAt: serverTimestamp(),
      });
      tx.set(recentRef, {
        id: latest.id,
        white: safeWhiteName,
        black: safeBlackName,
        winner,
        status: 'timeout',
        endReason,
        movesCount: safeMovesCount,
        timeControl: latest.timeControl,
        isBotGame: latest.isBotGame,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
      tx.set(msgRef, {
        id: msgId,
        sender: 'BioChess',
        authorUid: uid,
        text: endReason,
        kind: 'system',
        createdAt: serverTimestamp(),
      });
      return 'claimed' as const;
    });

    console.info('[BioChess][Timeout] Transaction outcome', { gameId: game.id, outcome });
    return outcome;
  } catch (error) {
    console.warn('[BioChess][Timeout] Transaction failed; inspecting authoritative game state', {
      gameId: game.id,
      error,
    });
    try {
      const checkSnap = await getDoc(gameRef);
      if (!checkSnap.exists()) return 'already_resolved';
      const checkDoc = mapGameDoc(checkSnap.id, checkSnap.data());
      if (checkDoc.status !== 'active' || checkDoc.turn !== timedOutColor) {
        return 'already_resolved';
      }
    } catch {
      // ignore secondary check errors
    }
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }
}

export async function offerDrawInFirestore(
  game: GameState,
  myColor: PieceColor,
  myUsername: string,
  uid: string,
  lang?: string
): Promise<void> {
  if (game.status !== 'active' || game.drawOfferBy === myColor) return;
  const t = getFsText(lang);
  const msgId = makeEntityId('msg');

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'games', game.id), {
      drawOfferBy: myColor,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'games', game.id, 'messages', msgId), {
      id: msgId,
      sender: 'BioChess',
      authorUid: uid,
      text: t.drawOfferMsg(myUsername).slice(0, 400),
      kind: 'system',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }

  if (game.isBotGame && game.botId) {
    const botId = game.botId;
    const chess = new Chess(game.fen);
    const botAccepts =
      botId === 'dummy' || (game.moves.length >= 24 && !chess.inCheck() && botId === 'knight');
    setTimeout(() => {
      void respondDrawInFirestore(
        { ...game, drawOfferBy: myColor },
        botAccepts,
        BOT_DEFINITIONS[botId].name,
        uid,
        lang
      );
    }, 380);
  }
}

export async function respondDrawInFirestore(
  game: GameState,
  accept: boolean,
  responderName: string,
  uid: string,
  lang?: string
): Promise<void> {
  if (game.status !== 'active' || !game.drawOfferBy) return;
  const t = getFsText(lang);
  const msgId = makeEntityId('msg');

  try {
    const batch = writeBatch(db);
    if (accept) {
      const endReason = t.drawAgreedReason;
      batch.update(doc(db, 'games', game.id), {
        status: 'draw',
        winner: 'draw',
        endReason,
        drawOfferBy: '',
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'recentMatches', game.id), {
        id: game.id,
        white: game.white.username.slice(0, 32),
        black: game.black.username.slice(0, 32),
        winner: 'draw',
        status: 'draw',
        endReason,
        movesCount: game.moves.length,
        timeControl: game.timeControl,
        isBotGame: game.isBotGame,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'games', game.id, 'messages', msgId), {
        id: msgId,
        sender: game.isBotGame ? responderName.slice(0, 32) : 'BioChess',
        authorUid: uid,
        text: game.isBotGame
          ? getLocalizedBotDrawReply(true, lang)
          : t.drawAcceptedMsg,
        kind: game.isBotGame ? 'bot' : 'system',
        createdAt: serverTimestamp(),
      });
    } else {
      batch.update(doc(db, 'games', game.id), {
        drawOfferBy: '',
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'games', game.id, 'messages', msgId), {
        id: msgId,
        sender: game.isBotGame ? responderName.slice(0, 32) : 'BioChess',
        authorUid: uid,
        text: game.isBotGame
          ? getLocalizedBotDrawReply(false, lang)
          : t.drawDeclinedMsg(responderName).slice(0, 400),
        kind: game.isBotGame ? 'bot' : 'system',
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${game.id}`);
  }
}

export async function requestOrAcceptRematchInFirestore(
  game: GameState,
  myColor: PieceColor,
  uid: string,
  lang?: string
): Promise<string | null> {
  if (game.rematchGameId) return game.rematchGameId;
  if (game.status === 'active') return null;

  const gameRef = doc(db, 'games', game.id);
  const userRef = doc(db, 'users', uid);

  const buildRematchWriteData = (
    latestGame: GameDocSnapshot,
    userData: Record<string, unknown> | null,
    newGameId: string,
    newMsgId: string
  ) => {
    const nextWhiteUid = latestGame.blackIsBot ? 'bot' : latestGame.blackUid;
    const nextBlackUid = latestGame.whiteIsBot ? 'bot' : latestGame.whiteUid;
    const nextWhiteIsBot = latestGame.blackIsBot;
    const nextBlackIsBot = latestGame.whiteIsBot;

    const myLatestElo = userData ? clampElo(userData.elo, 300) : undefined;
    const myLatestUsername = userData ? String(userData.username || '').trim() : '';
    const myLatestCountry = userData ? sanitizeCountryCode(userData.country) : undefined;

    const t = getFsText(lang);
    const rawNextWhiteName =
      (!nextWhiteIsBot && nextWhiteUid === uid && myLatestUsername) ||
      latestGame.blackUsername ||
      t.whiteFallback;
    const rawNextBlackName =
      (!nextBlackIsBot && nextBlackUid === uid && myLatestUsername) ||
      latestGame.whiteUsername ||
      t.blackFallback;

    const nextWhiteUsername = rawNextWhiteName.trim().slice(0, 32).padEnd(2, '_');
    const nextBlackUsername = rawNextBlackName.trim().slice(0, 32).padEnd(2, '_');

    const nextWhiteElo =
      !nextWhiteIsBot && nextWhiteUid === uid && myLatestElo !== undefined
        ? myLatestElo
        : clampElo(latestGame.blackElo, 300);
    const nextBlackElo =
      !nextBlackIsBot && nextBlackUid === uid && myLatestElo !== undefined
        ? myLatestElo
        : clampElo(latestGame.whiteElo, 300);

    const nextWhiteCountry =
      (!nextWhiteIsBot && nextWhiteUid === uid ? myLatestCountry : undefined) ||
      sanitizeCountryCode(latestGame.blackCountry);
    const nextBlackCountry =
      (!nextBlackIsBot && nextBlackUid === uid ? myLatestCountry : undefined) ||
      sanitizeCountryCode(latestGame.whiteCountry);

    const participantUids = Array.from(
      new Set(
        [nextWhiteUid, nextBlackUid].filter((u): u is string => Boolean(u && u !== 'bot'))
      )
    );

    const safeTimeControl: TimeControlId = TIME_CONTROLS[latestGame.timeControl]
      ? latestGame.timeControl
      : 'blitz_5_0';
    const tc = TIME_CONTROLS[safeTimeControl];

    const resolvedBotId: BotId | '' = latestGame.isBotGame
      ? latestGame.botId && VALID_BOT_IDS.has(latestGame.botId)
        ? latestGame.botId
        : 'knight'
      : '';

    const rematchPayload: Record<string, unknown> = {
      id: newGameId,
      whiteUid: nextWhiteUid,
      whiteUsername: nextWhiteUsername,
      whiteElo: nextWhiteElo,
      whiteIsBot: nextWhiteIsBot,
      blackUid: nextBlackUid,
      blackUsername: nextBlackUsername,
      blackElo: nextBlackElo,
      blackIsBot: nextBlackIsBot,
      participantUids,
      fen: START_FEN,
      pgn: '',
      turn: 'w',
      movesCount: 0,
      status: 'active',
      winner: '',
      endReason: '',
      timeControl: safeTimeControl,
      whiteTimeMs: tc.initialMs,
      blackTimeMs: tc.initialMs,
      drawOfferBy: '',
      rematchRequestedBy: '',
      rematchGameId: '',
      whiteEloApplied: false,
      blackEloApplied: false,
      isBotGame: latestGame.isBotGame,
      botId: resolvedBotId,
      lastMoveAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (nextWhiteCountry) rematchPayload.whiteCountry = nextWhiteCountry;
    if (nextBlackCountry) rematchPayload.blackCountry = nextBlackCountry;

    const botDef =
      latestGame.isBotGame && resolvedBotId ? BOT_DEFINITIONS[resolvedBotId] : undefined;
    const humanName = nextWhiteIsBot ? nextBlackUsername : nextWhiteUsername;
    const greetingText = botDef
      ? getBotGreeting(botDef.id, humanName, lang).trim().slice(0, 400) || t.goodGameFallback
      : t.rematchStartedMsg;

    const msgPayload = {
      id: newMsgId,
      sender: botDef ? botDef.name.slice(0, 32) : 'BioChess',
      authorUid: uid,
      text: greetingText,
      kind: latestGame.isBotGame ? 'bot' : 'system',
      createdAt: serverTimestamp(),
    };

    return { rematchPayload, msgPayload };
  };

  const resolveColorAndAction = (latestGame: GameDocSnapshot) => {
    const actualMyColor: PieceColor =
      !latestGame.whiteIsBot && latestGame.whiteUid === uid
        ? 'w'
        : !latestGame.blackIsBot && latestGame.blackUid === uid
          ? 'b'
          : myColor;

    const shouldCreateNow =
      latestGame.isBotGame ||
      (latestGame.rematchRequestedBy !== '' && latestGame.rematchRequestedBy !== actualMyColor);

    return { actualMyColor, shouldCreateNow };
  };

  try {
    const candidateNewGameId = makeEntityId('game');
    const candidateMsgId = makeEntityId('msg');
    const newGameRef = doc(db, 'games', candidateNewGameId);
    const newMsgRef = doc(db, 'games', candidateNewGameId, 'messages', candidateMsgId);

    const resultGameId = await runTransaction(db, async (tx) => {
      const [latestGameSnap, userSnap] = await Promise.all([
        tx.get(gameRef),
        tx.get(userRef),
      ]);
      if (!latestGameSnap.exists()) return null;

      const latestGame = mapGameDoc(latestGameSnap.id, latestGameSnap.data());
      if (latestGame.status === 'active') return null;

      if (latestGame.rematchGameId) {
        return latestGame.rematchGameId;
      }

      const { actualMyColor, shouldCreateNow } = resolveColorAndAction(latestGame);

      if (!shouldCreateNow) {
        if (latestGame.rematchRequestedBy === actualMyColor) {
          return null;
        }
        tx.update(gameRef, {
          rematchRequestedBy: actualMyColor,
          updatedAt: serverTimestamp(),
        });
        return null;
      }

      const userData = userSnap.exists() ? userSnap.data() : null;
      const { rematchPayload, msgPayload } = buildRematchWriteData(
        latestGame,
        userData,
        candidateNewGameId,
        candidateMsgId
      );

      tx.set(newGameRef, rematchPayload);
      tx.set(newMsgRef, msgPayload);
      tx.update(gameRef, {
        ...(latestGame.rematchRequestedBy ? { rematchRequestedBy: '' } : {}),
        rematchGameId: candidateNewGameId,
        updatedAt: serverTimestamp(),
      });
      if (userSnap.exists()) {
        tx.update(userRef, {
          online: true,
          activeGameId: candidateNewGameId,
          updatedAt: serverTimestamp(),
        });
      }

      return candidateNewGameId;
    });

    return resultGameId;
  } catch (txError) {
    console.warn('[BioChess][Rematch] Atomic rematch transaction failed, attempting resilient fallback:', txError);
    try {
      const [checkSnap, userSnap] = await Promise.all([
        getDoc(gameRef),
        getDoc(userRef),
      ]);

      if (checkSnap.exists()) {
        const checked = mapGameDoc(checkSnap.id, checkSnap.data());
        if (checked.rematchGameId) {
          return checked.rematchGameId;
        }
        if (checked.status === 'active') {
          return null;
        }

        const { actualMyColor, shouldCreateNow } = resolveColorAndAction(checked);
        if (!shouldCreateNow) {
          if (checked.rematchRequestedBy === actualMyColor) {
            return null;
          }
          await updateDoc(gameRef, {
            rematchRequestedBy: actualMyColor,
            updatedAt: serverTimestamp(),
          });
          return null;
        }

        const fallbackGameId = makeEntityId('game');
        const fallbackMsgId = makeEntityId('msg');
        const fallbackGameRef = doc(db, 'games', fallbackGameId);
        const fallbackMsgRef = doc(db, 'games', fallbackGameId, 'messages', fallbackMsgId);
        const userData = userSnap.exists() ? userSnap.data() : null;
        const { rematchPayload, msgPayload } = buildRematchWriteData(
          checked,
          userData,
          fallbackGameId,
          fallbackMsgId
        );

        try {
          const batch = writeBatch(db);
          batch.set(fallbackGameRef, rematchPayload);
          batch.set(fallbackMsgRef, msgPayload);
          if (userSnap.exists()) {
            batch.update(userRef, {
              online: true,
              activeGameId: fallbackGameId,
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        } catch (batchWithUserErr) {
          console.warn('[BioChess][Rematch] Fallback batch with user update failed, retrying without user update:', batchWithUserErr);
          const minBatch = writeBatch(db);
          minBatch.set(fallbackGameRef, rematchPayload);
          minBatch.set(fallbackMsgRef, msgPayload);
          await minBatch.commit();
        }

        try {
          await updateDoc(gameRef, {
            ...(checked.rematchRequestedBy ? { rematchRequestedBy: '' } : {}),
            rematchGameId: fallbackGameId,
            updatedAt: serverTimestamp(),
          });
        } catch (linkErr) {
          console.warn('[BioChess][Rematch] Non-fatal: new game created but old game link skipped:', linkErr);
        }

        return fallbackGameId;
      }
    } catch (fallbackError) {
      handleFirestoreError(fallbackError, OperationType.WRITE, `games/${game.id}`);
    }
    handleFirestoreError(txError, OperationType.WRITE, `games/${game.id}`);
  }
}

export async function settleMyEloForGame(uid: string, gameDoc: GameDocSnapshot): Promise<boolean> {
  if (gameDoc.status === 'active') return false;
  const isWhite = !gameDoc.whiteIsBot && gameDoc.whiteUid === uid;
  const isBlack = !gameDoc.blackIsBot && gameDoc.blackUid === uid;
  if (!isWhite && !isBlack) return false;
  if ((isWhite && gameDoc.whiteEloApplied) || (isBlack && gameDoc.blackEloApplied)) return true;

  const userRef = doc(db, 'users', uid);
  const gameRef = doc(db, 'games', gameDoc.id);
  const appliedField = isWhite ? 'whiteEloApplied' : 'blackEloApplied';

  try {
    const settled = await runTransaction(db, async (tx) => {
      const [userSnap, latestGameSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(gameRef),
      ]);
      if (!userSnap.exists() || !latestGameSnap.exists()) return false;
      const latestGame = mapGameDoc(latestGameSnap.id, latestGameSnap.data());
      if (latestGame.status === 'active') return false;
      if ((isWhite && latestGame.whiteEloApplied) || (isBlack && latestGame.blackEloApplied)) {
        return true;
      }

      // Training games against Coaches or Dummy do NOT affect ranked ELO or W/L/D stats
      if (latestGame.isBotGame && isTrainingBot(latestGame.botId)) {
        tx.update(userRef, {
          online: true,
          activeGameId: '',
          updatedAt: serverTimestamp(),
        });
        tx.update(gameRef, {
          [appliedField]: true,
          updatedAt: serverTimestamp(),
        });
        return true;
      }

      const u = userSnap.data();
      const rawCurElo =
        typeof u.elo === 'number' && Number.isFinite(u.elo) ? Math.max(0, Math.round(u.elo)) : 300;
      const effectiveCurElo = Math.max(MIN_ELO, rawCurElo);
      const curWins =
        typeof u.wins === 'number' && Number.isFinite(u.wins) ? Math.max(0, Math.round(u.wins)) : 0;
      const curLosses =
        typeof u.losses === 'number' && Number.isFinite(u.losses)
          ? Math.max(0, Math.round(u.losses))
          : 0;
      const curDraws =
        typeof u.draws === 'number' && Number.isFinite(u.draws)
          ? Math.max(0, Math.round(u.draws))
          : 0;

      const myColor: PieceColor = isWhite ? 'w' : 'b';
      const isTimeout = latestGame.status === 'timeout';
      const winDelta = isTimeout ? 20 : 50;
      const lossDelta = isTimeout ? 5 : 76;

      let nextElo = effectiveCurElo;
      let nextWins = curWins;
      let nextLosses = curLosses;
      let nextDraws = curDraws;

      if (latestGame.winner === 'draw' || latestGame.winner === '') {
        nextDraws += 1;
      } else if (latestGame.winner === myColor) {
        nextWins += 1;
        nextElo = Math.min(10000, effectiveCurElo + winDelta);
      } else {
        nextLosses += 1;
        nextElo = Math.max(MIN_ELO, effectiveCurElo - lossDelta);
      }

      const curActiveGameId = typeof u.activeGameId === 'string' ? u.activeGameId : '';
      const preservedActiveGameId =
        curActiveGameId && curActiveGameId !== latestGame.id ? curActiveGameId : '';

      tx.update(userRef, {
        elo: nextElo,
        wins: nextWins,
        losses: nextLosses,
        draws: nextDraws,
        activeGameId: preservedActiveGameId,
        updatedAt: serverTimestamp(),
      });
      tx.update(gameRef, {
        [appliedField]: true,
        updatedAt: serverTimestamp(),
      });
      return true;
    });

    return settled;
  } catch (error) {
    try {
      const checkSnap = await getDoc(gameRef);
      if (checkSnap.exists()) {
        const checked = mapGameDoc(checkSnap.id, checkSnap.data());
        if ((isWhite && checked.whiteEloApplied) || (isBlack && checked.blackEloApplied)) {
          return true;
        }
      }
    } catch {
      // ignore check errors
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function saveGameReviewToFirestore(
  uid: string,
  review: SavedGameReview
): Promise<void> {
  const safeId = review.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const reviewId = safeId.length >= 4 ? safeId : `rev_${Date.now().toString(36)}`;
  const path = `users/${uid}/reviews/${reviewId}`;

  const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v || 0)));
  const clampCount = (v: number) => Math.max(0, Math.min(2000, Math.round(v || 0)));

  const payload: SavedGameReview = {
    id: reviewId,
    whiteUsername: (review.whiteUsername || 'White').trim().slice(0, 32) || 'White',
    blackUsername: (review.blackUsername || 'Black').trim().slice(0, 32) || 'Black',
    playerColor: review.playerColor === 'b' ? 'b' : 'w',
    result: review.result === 'win' || review.result === 'loss' ? review.result : 'draw',
    accuracyPct: clampPct(review.accuracyPct),
    openingName: (review.openingName || 'Free Opening').trim().slice(0, 80) || 'Free Opening',
    openingAcc: clampPct(review.openingAcc),
    middlegameAcc: clampPct(review.middlegameAcc),
    endgameAcc: clampPct(review.endgameAcc),
    brilliantCount: clampCount(review.brilliantCount),
    greatCount: clampCount(review.greatCount),
    goodCount: clampCount(review.goodCount),
    inaccuracyCount: clampCount(review.inaccuracyCount),
    mistakeCount: clampCount(review.mistakeCount),
    blunderCount: clampCount(review.blunderCount),
    missedWinCount: clampCount(review.missedWinCount),
    movesCount: clampCount(review.movesCount),
    source: review.source === 'pgn' ? 'pgn' : 'biochess',
    pgn: String(review.pgn || '').slice(0, 8000),
    createdAtMs: Math.max(1, Math.round(review.createdAtMs || Date.now())),
  };

  try {
    await setDoc(doc(db, 'users', uid, 'reviews', reviewId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeMyGameReviews(
  uid: string,
  onReviews: (reviews: SavedGameReview[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/reviews`;
  const q = query(collection(db, 'users', uid, 'reviews'), orderBy('createdAtMs', 'desc'), limit(60));
  return onSnapshot(
    q,
    (snap) => {
      const list: SavedGameReview[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          whiteUsername: String(data.whiteUsername || 'White'),
          blackUsername: String(data.blackUsername || 'Black'),
          playerColor: data.playerColor === 'b' ? 'b' : 'w',
          result: data.result === 'win' || data.result === 'loss' ? data.result : 'draw',
          accuracyPct: typeof data.accuracyPct === 'number' ? data.accuracyPct : 0,
          openingName: String(data.openingName || 'Free Opening'),
          openingAcc: typeof data.openingAcc === 'number' ? data.openingAcc : 0,
          middlegameAcc: typeof data.middlegameAcc === 'number' ? data.middlegameAcc : 0,
          endgameAcc: typeof data.endgameAcc === 'number' ? data.endgameAcc : 0,
          brilliantCount: typeof data.brilliantCount === 'number' ? data.brilliantCount : 0,
          greatCount: typeof data.greatCount === 'number' ? data.greatCount : 0,
          goodCount: typeof data.goodCount === 'number' ? data.goodCount : 0,
          inaccuracyCount: typeof data.inaccuracyCount === 'number' ? data.inaccuracyCount : 0,
          mistakeCount: typeof data.mistakeCount === 'number' ? data.mistakeCount : 0,
          blunderCount: typeof data.blunderCount === 'number' ? data.blunderCount : 0,
          missedWinCount: typeof data.missedWinCount === 'number' ? data.missedWinCount : 0,
          movesCount: typeof data.movesCount === 'number' ? data.movesCount : 0,
          source: data.source === 'pgn' ? 'pgn' : 'biochess',
          pgn: String(data.pgn || ''),
          createdAtMs: typeof data.createdAtMs === 'number' ? data.createdAtMs : Date.now(),
        };
      });
      onReviews(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}
