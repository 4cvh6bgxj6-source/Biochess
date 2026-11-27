import { Chess } from 'chess.js';
import type { Move, PieceSymbol } from 'chess.js';
import type { GameState, PieceColor, SavedGameReview } from './types';
import { searchPositionWithPv, type EnginePvResult } from './fast-chess-engine';
import { classifyMoveUnified, UNIFIED_EVAL_CONFIG } from './chess-bot';
import { normalizeUiLang, type SupportedUiLang } from './i18n';

export type CoachMoveClass =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'missed_win';

export interface AnalyzedMove {
  ply: number; // 0-indexed
  moveNumber: number;
  color: PieceColor;
  san: string;
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  captured?: string;
  fenBefore: string;
  fenAfter: string;
  evalBeforeWhiteCp: number;
  evalAfterWhiteCp: number;
  mateBefore?: number; // +N = White mates in N, -N = Black mates in N
  mateAfter?: number;
  bestMoveSan: string;
  bestMoveFrom: string;
  bestMoveTo: string;
  bestMovePromo?: 'q' | 'r' | 'b' | 'n';
  bestPvSan: string[];
  playedPvSan: string[];
  cpLoss: number;
  evalSwingCp: number;
  classification: CoachMoveClass;
  phase: 'opening' | 'middlegame' | 'endgame';
  isDecisiveMoment: boolean;
  tacticalNote: string;
}

export interface PlayerSideSummary {
  accuracyPct: number;
  openingAcc: number;
  middlegameAcc: number;
  endgameAcc: number;
  book: number;
  brilliant: number;
  great: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  missedWin: number;
}

export interface FullGameAnalysis {
  id: string;
  source: 'biochess' | 'pgn';
  whiteUsername: string;
  blackUsername: string;
  whiteElo?: number;
  blackElo?: number;
  playerColor: PieceColor;
  result: 'win' | 'loss' | 'draw';
  resultLabel: string;
  endReason: string;
  openingEco: string;
  openingName: string;
  pgn: string;
  moves: AnalyzedMove[];
  decisiveMoments: AnalyzedMove[];
  whiteStats: PlayerSideSummary;
  blackStats: PlayerSideSummary;
  analyzedAtMs: number;
}

export interface StudentAttemptEvaluation {
  san: string;
  from: string;
  to: string;
  isBest: boolean;
  cpLossVsBest: number;
  evalWhiteCp: number;
  mateIn?: number;
  refutationLineSan: string[];
  verdict: 'exact_best' | 'strong_alternative' | 'inaccurate' | 'blunder';
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

interface OpeningEntry {
  eco: string;
  name: string;
  line: string[];
}

const OPENING_BOOK_CATALOG: OpeningEntry[] = [
  { eco: 'B15', name: 'Caro-Kann: Alien Gambit', line: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nf6', 'Ng5', 'h6', 'Nxf7'] },
  { eco: 'C50', name: 'Partita Italiana (Giuoco Piano)', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'] },
  { eco: 'C55', name: 'Partita Italiana: Difesa dei Due Cavalli', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
  { eco: 'C50', name: 'Partita Italiana', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { eco: 'C60', name: 'Partita Spagnola (Ruy Lopez)', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'C45', name: 'Partita Scozzese', line: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'] },
  { eco: 'C47', name: 'Partita dei Quattro Cavalli', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'] },
  { eco: 'C42', name: 'Difesa Petrov (Stafford Gambit)', line: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'Nc6'] },
  { eco: 'C42', name: 'Difesa Petrov (Russa)', line: ['e4', 'e5', 'Nf3', 'Nf6'] },
  { eco: 'C41', name: 'Difesa Philidor', line: ['e4', 'e5', 'Nf3', 'd6'] },
  { eco: 'C25', name: 'Partita Viennese', line: ['e4', 'e5', 'Nc3'] },
  { eco: 'C30', name: 'Gambetto di Re', line: ['e4', 'e5', 'f4'] },
  { eco: 'B27', name: 'Difesa Siciliana: Drago / Najdorf', line: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'] },
  { eco: 'B23', name: 'Difesa Siciliana: Chiusa', line: ['e4', 'c5', 'Nc3'] },
  { eco: 'B20', name: 'Difesa Siciliana', line: ['e4', 'c5'] },
  { eco: 'C02', name: 'Difesa Francese: Variante di Spinta', line: ['e4', 'e6', 'd4', 'd5', 'e5'] },
  { eco: 'C00', name: 'Difesa Francese', line: ['e4', 'e6'] },
  { eco: 'B12', name: 'Difesa Caro-Kann', line: ['e4', 'c6', 'd4', 'd5'] },
  { eco: 'B10', name: 'Difesa Caro-Kann', line: ['e4', 'c6'] },
  { eco: 'B01', name: 'Difesa Scandinava', line: ['e4', 'd5'] },
  { eco: 'B07', name: 'Difesa Pirc', line: ['e4', 'd6', 'd4', 'Nf6'] },
  { eco: 'B02', name: 'Difesa Alekhine', line: ['e4', 'Nf6'] },
  { eco: 'D30', name: 'Gambetto di Donna Rifiutato', line: ['d4', 'd5', 'c4', 'e6'] },
  { eco: 'D10', name: 'Difesa Slava', line: ['d4', 'd5', 'c4', 'c6'] },
  { eco: 'D20', name: 'Gambetto di Donna Accettato', line: ['d4', 'd5', 'c4', 'dxc4'] },
  { eco: 'D06', name: 'Gambetto di Donna', line: ['d4', 'd5', 'c4'] },
  { eco: 'D02', name: 'Sistema Londra', line: ['d4', 'd5', 'Bf4'] },
  { eco: 'A45', name: 'Sistema Londra', line: ['d4', 'Nf6', 'Bf4'] },
  { eco: 'A40', name: 'Gambetto Englund', line: ['d4', 'e5'] },
  { eco: 'E20', name: 'Difesa Nimzo-Indiana', line: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { eco: 'E60', name: 'Difesa Est-Indiana', line: ['d4', 'Nf6', 'c4', 'g6'] },
  { eco: 'A50', name: 'Difesa Indiana', line: ['d4', 'Nf6'] },
  { eco: 'A10', name: 'Apertura Inglese', line: ['c4'] },
  { eco: 'A06', name: 'Apertura Reti', line: ['Nf3', 'd5'] },
  { eco: 'A04', name: 'Apertura Zukertort / Reti', line: ['Nf3'] },
  { eco: 'C20', name: 'Apertura di Pedone di Re', line: ['e4'] },
  { eco: 'D00', name: 'Apertura di Pedone di Donna', line: ['d4'] },
];

const OPENING_NAMES_BY_IT: Record<string, Partial<Record<SupportedUiLang, string>>> = {
  'Caro-Kann: Alien Gambit': {
    en: 'Caro-Kann: Alien Gambit',
  },
  'Partita Italiana (Giuoco Piano)': {
    en: 'Italian Game (Giuoco Piano)',
    es: 'Apertura Italiana (Giuoco Piano)',
    fr: 'Partie Italienne (Giuoco Piano)',
    de: 'Italienische Partie (Giuoco Piano)',
    pt: 'Abertura Italiana (Giuoco Piano)',
    ru: 'Итальянская партия',
    zh: '意大利开局',
    ja: 'イタリアン・ゲーム',
    ko: '이탈리안 게임',
    ar: 'الافتتاح الإيطالي',
  },
  'Partita Italiana: Difesa dei Due Cavalli': {
    en: 'Italian Game: Two Knights Defense',
    es: 'Italiana: Defensa de los Dos Caballos',
    fr: 'Italienne : Défense des Deux Cavaliers',
    de: 'Italienisch: Zweispringerspiel',
    pt: 'Italiana: Defesa dos Dois Cavalos',
    ru: 'Итальянская: Защита двух коней',
    zh: '意大利开局：双马防御',
    ja: 'イタリアン：トゥーナイツ・ディフェンス',
    ko: '이탈리안: 투 나이츠 디펜스',
    ar: 'الإيطالي: دفاع الحصانين',
  },
  'Partita Italiana': {
    en: 'Italian Game',
    es: 'Apertura Italiana',
    fr: 'Partie Italienne',
    de: 'Italienische Partie',
    pt: 'Abertura Italiana',
    ru: 'Итальянская партия',
    zh: '意大利开局',
    ja: 'イタリアン・ゲーム',
    ko: '이탈리안 게임',
    ar: 'الافتتاح الإيطالي',
  },
  'Partita Spagnola (Ruy Lopez)': {
    en: 'Ruy Lopez (Spanish Opening)',
    es: 'Apertura Española (Ruy López)',
    fr: 'Partie Espagnole (Ruy Lopez)',
    de: 'Spanische Partie (Ruy Lopez)',
    pt: 'Abertura Espanhola (Ruy Lopez)',
    ru: 'Испанская партия',
    zh: '西班牙开局',
    ja: 'ルイ・ロペス',
    ko: '루이 로페즈',
    ar: 'الافتتاح الإسباني (روي لوبيز)',
  },
  'Partita Scozzese': {
    en: 'Scotch Game',
    es: 'Apertura Escocesa',
    fr: 'Partie Écossaise',
    de: 'Schottische Partie',
    pt: 'Abertura Escocesa',
    ru: 'Шотландская партия',
    zh: '苏格兰开局',
    ja: 'スコッチ・ゲーム',
    ko: '스카치 게임',
    ar: 'الافتتاح الاسكتلندي',
  },
  'Partita dei Quattro Cavalli': {
    en: 'Four Knights Game',
    es: 'Apertura de los Cuatro Caballos',
    fr: 'Partie des Quatre Cavaliers',
    de: 'Vierspringerspiel',
    pt: 'Abertura dos Quatro Cavalos',
    ru: 'Дебют четырёх коней',
    zh: '四马开局',
    ja: 'フォー・ナイツ・ゲーム',
    ko: '포 나이츠 게임',
    ar: 'افتتاح الأحصنة الأربعة',
  },
  'Difesa Petrov (Stafford Gambit)': {
    en: "Petrov's Defense (Stafford Gambit)",
    es: 'Defensa Petrov (Gambito Stafford)',
    fr: 'Défense Petrov (Gambit Stafford)',
    de: 'Russische Verteidigung (Stafford-Gambit)',
    pt: 'Defesa Petrov (Gambito Stafford)',
    ru: 'Русская партия (Гамбит Стаффорда)',
    zh: '彼得罗夫防御（斯塔福德弃兵）',
    ja: 'ペトロフ・ディフェンス (スタッフォード・ギャンビット)',
    ko: '페트로프 디펜스 (스태포드 갬빗)',
    ar: 'دفاع بتروف (غامبيت ستافورد)',
  },
  'Difesa Petrov (Russa)': {
    en: "Petrov's Defense",
    es: 'Defensa Petrov',
    fr: 'Défense Petrov',
    de: 'Russische Verteidigung',
    pt: 'Defesa Petrov',
    ru: 'Русская партия',
    zh: '彼得罗夫防御',
    ja: 'ペトロフ・ディフェンス',
    ko: '페트로프 디펜스',
    ar: 'دفاع بتروف',
  },
  'Difesa Philidor': {
    en: 'Philidor Defense',
    es: 'Defensa Philidor',
    fr: 'Défense Philidor',
    de: 'Philidor-Verteidigung',
    pt: 'Defesa Philidor',
    ru: 'Защита Филидора',
    zh: '菲利多尔防御',
    ja: 'フィリドール・ディフェンス',
    ko: '필리도어 디펜스',
    ar: 'دفاع فيليدور',
  },
  'Partita Viennese': {
    en: 'Vienna Game',
    es: 'Apertura Vienesa',
    fr: 'Partie Viennoise',
    de: 'Wiener Partie',
    pt: 'Abertura Vienense',
    ru: 'Венская партия',
    zh: '维也纳开局',
    ja: 'ウィーン・ゲーム',
    ko: '비엔나 게임',
    ar: 'افتتاح فيينا',
  },
  'Gambetto di Re': {
    en: "King's Gambit",
    es: 'Gambito de Rey',
    fr: 'Gambit du Roi',
    de: 'Königsgambit',
    pt: 'Gambito do Rei',
    ru: 'Королевский гамбит',
    zh: '王翼弃兵',
    ja: 'キングズ・ギャンビット',
    ko: '킹스 갬빗',
    ar: 'غامبيت الملك',
  },
  'Difesa Siciliana: Drago / Najdorf': {
    en: 'Sicilian Defense: Dragon / Najdorf',
    es: 'Defensa Siciliana: Dragón / Najdorf',
    fr: 'Défense Sicilienne : Dragon / Najdorf',
    de: 'Sizilianisch: Drache / Najdorf',
    pt: 'Defesa Siciliana: Dragão / Najdorf',
    ru: 'Сицилианская: Дракон / Найдорф',
    zh: '西西里防御：龙式 / 纳道夫',
    ja: 'シシリアン：ドラゴン / ナイドルフ',
    ko: '시실리안: 드래곤 / 나이도르프',
    ar: 'الدفاع الصقلي: التنين / نايدورف',
  },
  'Difesa Siciliana: Chiusa': {
    en: 'Closed Sicilian Defense',
    es: 'Siciliana Cerrada',
    fr: 'Sicilienne Fermée',
    de: 'Geschlossener Sizilianer',
    pt: 'Siciliana Fechada',
    ru: 'Закрытая сицилианская',
    zh: '封闭式西西里防御',
    ja: 'クローズド・シシリアン',
    ko: '클로즈드 시실리안',
    ar: 'الصقلي المغلق',
  },
  'Difesa Siciliana': {
    en: 'Sicilian Defense',
    es: 'Defensa Siciliana',
    fr: 'Défense Sicilienne',
    de: 'Sizilianische Verteidigung',
    pt: 'Defesa Siciliana',
    ru: 'Сицилианская защита',
    zh: '西西里防御',
    ja: 'シシリアン・ディフェンス',
    ko: '시실리안 디펜스',
    ar: 'الدفاع الصقلي',
  },
  'Difesa Francese: Variante di Spinta': {
    en: 'French Defense: Advance Variation',
    es: 'Defensa Francesa: Variante de Avance',
    fr: 'Défense Française : Variante d’Avance',
    de: 'Französisch: Vorstoßvariante',
    pt: 'Defesa Francesa: Variante do Avanço',
    ru: 'Французская: Вариант с продвижением',
    zh: '法兰西防御：推进变例',
    ja: 'フレンチ：アドバンス・バリエーション',
    ko: '프렌치: 어드밴스 바리에이션',
    ar: 'الدفاع الفرنسي: تفريع التقدم',
  },
  'Difesa Francese': {
    en: 'French Defense',
    es: 'Defensa Francesa',
    fr: 'Défense Française',
    de: 'Französische Verteidigung',
    pt: 'Defesa Francesa',
    ru: 'Французская защита',
    zh: '法兰西防御',
    ja: 'フレンチ・ディフェンス',
    ko: '프렌치 디펜스',
    ar: 'الدفاع الفرنسي',
  },
  'Difesa Caro-Kann': {
    en: 'Caro-Kann Defense',
    es: 'Defensa Caro-Kann',
    fr: 'Défense Caro-Kann',
    de: 'Caro-Kann-Verteidigung',
    pt: 'Defesa Caro-Kann',
    ru: 'Защита Каро-Канн',
    zh: '卡罗-康防御',
    ja: 'カロ・カン・ディフェンス',
    ko: '카로-칸 디펜스',
    ar: 'دفاع كارو-كان',
  },
  'Difesa Scandinava': {
    en: 'Scandinavian Defense',
    es: 'Defensa Escandinava',
    fr: 'Défense Scandinave',
    de: 'Skandinavische Verteidigung',
    pt: 'Defesa Escandinava',
    ru: 'Скандинавская защита',
    zh: '斯堪的纳维亚防御',
    ja: 'スカンジナビアン・ディフェンス',
    ko: '스칸디나비안 디펜스',
    ar: 'الدفاع الإسكندنافي',
  },
  'Difesa Pirc': {
    en: 'Pirc Defense',
    es: 'Defensa Pirc',
    fr: 'Défense Pirc',
    de: 'Pirc-Verteidigung',
    pt: 'Defesa Pirc',
    ru: 'Защита Пирца-Уфимцева',
    zh: '皮尔茨防御',
    ja: 'ピルツ・ディフェンス',
    ko: '피르츠 디펜스',
    ar: 'دفاع بيرتس',
  },
  'Difesa Alekhine': {
    en: "Alekhine's Defense",
    es: 'Defensa Alekhine',
    fr: 'Défense Alekhine',
    de: 'Aljechin-Verteidigung',
    pt: 'Defesa Alekhine',
    ru: 'Защита Алехина',
    zh: '阿廖欣防御',
    ja: 'アリョーヒン・ディフェンス',
    ko: '알레힌 디펜스',
    ar: 'دفاع أليخين',
  },
  'Gambetto di Donna Rifiutato': {
    en: "Queen's Gambit Declined",
    es: 'Gambito de Dama Rehusado',
    fr: 'Gambit Dame Refusé',
    de: 'Abgelehntes Damengambit',
    pt: 'Gambito da Dama Recusado',
    ru: 'Отказанный ферзевый гамбит',
    zh: '拒后翼弃兵',
    ja: 'クイーンズ・ギャンビット・ディクラインド',
    ko: '퀸즈 갬빗 디클라인드',
    ar: 'غامبيت الوزير المرفوض',
  },
  'Difesa Slava': {
    en: 'Slav Defense',
    es: 'Defensa Eslava',
    fr: 'Défense Slave',
    de: 'Slawische Verteidigung',
    pt: 'Defesa Eslava',
    ru: 'Славянская защита',
    zh: '斯拉夫防御',
    ja: 'スラブ・ディフェンス',
    ko: '슬라브 디펜스',
    ar: 'الدفاع السلافي',
  },
  'Gambetto di Donna Accettato': {
    en: "Queen's Gambit Accepted",
    es: 'Gambito de Dama Aceptado',
    fr: 'Gambit Dame Accepté',
    de: 'Angenommenes Damengambit',
    pt: 'Gambito da Dama Aceito',
    ru: 'Принятый ферзевый гамбит',
    zh: '接受后翼弃兵',
    ja: 'クイーンズ・ギャンビット・アクセプテッド',
    ko: '퀸즈 갬빗 억셉티드',
    ar: 'غامبيت الوزير المقبول',
  },
  'Gambetto di Donna': {
    en: "Queen's Gambit",
    es: 'Gambito de Dama',
    fr: 'Gambit Dame',
    de: 'Damengambit',
    pt: 'Gambito da Dama',
    ru: 'Ферзевый гамбит',
    zh: '后翼弃兵',
    ja: 'クイーンズ・ギャンビット',
    ko: '퀸즈 갬빗',
    ar: 'غامبيت الوزير',
  },
  'Sistema Londra': {
    en: 'London System',
    es: 'Sistema Londres',
    fr: 'Système de Londres',
    de: 'Londoner System',
    pt: 'Sistema Londres',
    ru: 'Лондонская система',
    zh: '伦敦体系',
    ja: 'ロンドン・システム',
    ko: '런던 시스템',
    ar: 'نظام لندن',
  },
  'Gambetto Englund': {
    en: 'Englund Gambit',
    es: 'Gambito Englund',
    fr: 'Gambit Englund',
    de: 'Englund-Gambit',
    pt: 'Gambito Englund',
    ru: 'Гамбит Энглунда',
    zh: '英格伦德弃兵',
    ja: 'エングルンド・ギャンビット',
    ko: '잉글런드 갬빗',
    ar: 'غامبيت إنجلوند',
  },
  'Difesa Nimzo-Indiana': {
    en: 'Nimzo-Indian Defense',
    es: 'Defensa Nimzoindia',
    fr: 'Défense Nimzo-Indienne',
    de: 'Nimzo-Indische Verteidigung',
    pt: 'Defesa Nimzo-Índia',
    ru: 'Защита Нимцовича',
    zh: '尼姆佐-印度防御',
    ja: 'ニムゾ・インディアン',
    ko: '님조-인디언 디펜스',
    ar: 'الدفاع النمزو-هندي',
  },
  'Difesa Est-Indiana': {
    en: "King's Indian Defense",
    es: 'Defensa India de Rey',
    fr: 'Défense Est-Indienne',
    de: 'Königsindische Verteidigung',
    pt: 'Defesa Índia do Rei',
    ru: 'Староиндийская защита',
    zh: '王翼印度防御',
    ja: 'キングズ・インディアン',
    ko: '킹즈 인디언 디펜스',
    ar: 'الدفاع الهندي الملكي',
  },
  'Difesa Indiana': {
    en: 'Indian Defense',
    es: 'Defensa India',
    fr: 'Défense Indienne',
    de: 'Indische Verteidigung',
    pt: 'Defesa Índia',
    ru: 'Индийская защита',
    zh: '印度防御',
    ja: 'インディアン・ディフェンス',
    ko: '인디언 디펜스',
    ar: 'الدفاع الهندي',
  },
  'Apertura Inglese': {
    en: 'English Opening',
    es: 'Apertura Inglesa',
    fr: 'Ouverture Anglaise',
    de: 'Englische Eröffnung',
    pt: 'Abertura Inglesa',
    ru: 'Английское начало',
    zh: '英国式开局',
    ja: 'イングリッシュ・オープニング',
    ko: '잉글리시 오프닝',
    ar: 'الافتتاح الإنجليزي',
  },
  'Apertura Reti': {
    en: 'Réti Opening',
    es: 'Apertura Réti',
    fr: 'Ouverture Réti',
    de: 'Réti-Eröffnung',
    pt: 'Abertura Réti',
    ru: 'Дебют Рети',
    zh: '雷蒂开局',
    ja: 'レティ・オープニング',
    ko: '레티 오프닝',
    ar: 'افتتاح ريتي',
  },
  'Apertura Zukertort / Reti': {
    en: 'Zukertort / Réti Opening',
    es: 'Apertura Zukertort / Réti',
    fr: 'Ouverture Zukertort / Réti',
    de: 'Zukertort- / Réti-Eröffnung',
    pt: 'Abertura Zukertort / Réti',
    ru: 'Дебют Цукерторта / Рети',
    zh: '祖克托特 / 雷蒂开局',
    ja: 'ズカートート / レティ',
    ko: '주커토르트 / 레티',
    ar: 'افتتاح زوكيرتورت / ريتي',
  },
  'Apertura di Pedone di Re': {
    en: "King's Pawn Opening",
    es: 'Apertura de Peón de Rey',
    fr: 'Ouverture du Pion Roi',
    de: 'Königsbauern-Eröffnung',
    pt: 'Abertura do Peão do Rei',
    ru: 'Дебют королевской пешки',
    zh: '王前兵开局',
    ja: 'キングズ・ポーン・オープニング',
    ko: '킹즈 폰 오프닝',
    ar: 'افتتاح بيدق الملك',
  },
  'Apertura di Pedone di Donna': {
    en: "Queen's Pawn Opening",
    es: 'Apertura de Peón de Dama',
    fr: 'Ouverture du Pion Dame',
    de: 'Damenbauern-Eröffnung',
    pt: 'Abertura do Peão da Dama',
    ru: 'Дебют ферзевой пешки',
    zh: '后前兵开局',
    ja: 'クイーンズ・ポーン・オープニング',
    ko: '퀸즈 폰 오프닝',
    ar: 'افتتاح بيدق الوزير',
  },
  'Apertura Libera': {
    en: 'Unclassified Opening',
    es: 'Apertura Libre',
    fr: 'Ouverture Libre',
    de: 'Freie Eröffnung',
    pt: 'Abertura Livre',
    ru: 'Свободный дебют',
    zh: '自由开局',
    ja: '自由戦型',
    ko: '자유 오프닝',
    ar: 'افتتاح حر',
  },
};

export function translateOpeningName(name: string, lang?: string): string {
  const code = normalizeUiLang(lang);
  if (code === 'it') return name;
  const entry = OPENING_NAMES_BY_IT[name];
  if (!entry) return name;
  return entry[code] || entry.en || name;
}

export function detectOpeningFromSans(sans: string[], lang?: string): { eco: string; name: string } {
  let bestMatch: OpeningEntry | null = null;
  for (const entry of OPENING_BOOK_CATALOG) {
    if (sans.length < entry.line.length) continue;
    let matches = true;
    for (let i = 0; i < entry.line.length; i++) {
      if (sans[i] !== entry.line[i]) {
        matches = false;
        break;
      }
    }
    if (matches && (!bestMatch || entry.line.length > bestMatch.line.length)) {
      bestMatch = entry;
    }
  }
  const rawName = bestMatch ? bestMatch.name : 'Apertura Libera';
  return {
    eco: bestMatch ? bestMatch.eco : 'A00',
    name: translateOpeningName(rawName, lang),
  };
}

function pvUciToSan(fen: string, pv: Array<{ from: string; to: string; promo?: string }>): string[] {
  try {
    const chess = new Chess(fen);
    const sans: string[] = [];
    for (const step of pv) {
      try {
        const m = chess.move({
          from: step.from,
          to: step.to,
          promotion: (step.promo as 'q' | 'r' | 'b' | 'n' | undefined) || 'q',
        });
        if (!m) break;
        sans.push(m.san);
      } catch {
        break;
      }
    }
    return sans;
  } catch {
    return [];
  }
}

function moveToSan(fen: string, from: string, to: string, promo?: string): string {
  try {
    const chess = new Chess(fen);
    const m = chess.move({
      from,
      to,
      promotion: (promo as 'q' | 'r' | 'b' | 'n' | undefined) || 'q',
    });
    return m ? m.san : `${from}${to}`;
  } catch {
    return `${from}${to}`;
  }
}

function getGamePhase(fen: string, ply: number): 'opening' | 'middlegame' | 'endgame' {
  if (ply < 14) return 'opening';
  try {
    const chess = new Chess(fen);
    const board = chess.board();
    let nonKingMaterial = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = board[r][c];
        if (!sq || sq.type === 'k' || sq.type === 'p') continue;
        nonKingMaterial += PIECE_VALUES[sq.type];
      }
    }
    if (nonKingMaterial <= 2600) return 'endgame';
    return 'middlegame';
  } catch {
    return 'middlegame';
  }
}

function buildTacticalNote(params: {
  color: PieceColor;
  san: string;
  bestMoveSan: string;
  classification: CoachMoveClass;
  cpLoss: number;
  evalBeforeMoverCp: number;
  evalAfterMoverCp: number;
  mateBefore?: number;
  mateAfter?: number;
  bestPvSan: string[];
  playedPvSan: string[];
  lang?: string;
}): string {
  const {
    color,
    san,
    bestMoveSan,
    classification,
    cpLoss,
    evalBeforeMoverCp,
    evalAfterMoverCp,
    mateBefore,
    mateAfter,
    bestPvSan,
    playedPvSan,
    lang,
  } = params;

  const code = normalizeUiLang(lang);
  const moverSign = color === 'w' ? 1 : -1;
  const mateBeforeForMover = mateBefore ? mateBefore * moverSign : undefined;
  const mateAfterForMover = mateAfter ? mateAfter * moverSign : undefined;
  const lossStr = (cpLoss / 100).toFixed(1);
  const bestPv = bestPvSan.slice(0, 3).join(' ');
  const playedPv = playedPvSan.slice(0, 3).join(' ');
  const evalAfterStr = (evalAfterMoverCp / 100).toFixed(1);
  const evalBeforeStr = (evalBeforeMoverCp / 100).toFixed(1);

  if (code === 'it') {
    if (san.includes('#')) return 'Scacco matto decisivo.';
    if (mateAfterForMover !== undefined && mateAfterForMover < 0) {
      return `Permette uno scacco matto forzato in ${Math.abs(mateAfterForMover)} mosse (${playedPv}).`;
    }
    if (mateBeforeForMover !== undefined && mateBeforeForMover > 0 && (!mateAfterForMover || mateAfterForMover < 0)) {
      return `Manca un matto forzato in ${mateBeforeForMover} con ${bestMoveSan}.`;
    }
    if (classification === 'brilliant') {
      return `Sacrificio spettacolare (${san}) che mantiene la valutazione vincente.`;
    }
    if (classification === 'great') {
      return `Unica mossa precisa (${san}) che conserva il vantaggio critico.`;
    }
    if (classification === 'missed_win') {
      return `Occasione vincente mancata: ${bestMoveSan} (${bestPv}) dava un vantaggio netto (~+${evalBeforeStr}).`;
    }
    if (classification === 'blunder') {
      const seq = playedPv ? ` L'avversario risponde con ${playedPv}.` : '';
      return `Errore grave (-${lossStr} pedoni): invece di ${san}, bisognava giocare ${bestMoveSan} (${bestPv}).${seq}`;
    }
    if (classification === 'mistake') {
      return `Errore (-${lossStr} pedoni): ${bestMoveSan} (${bestPv}) era nettamente migliore (valutazione ${evalAfterStr}).`;
    }
    if (classification === 'inaccuracy') {
      return `Imprecisione: ${bestMoveSan} manteneva maggiore controllo.`;
    }
    if (classification === 'book') {
      return 'Mossa teorica di apertura.';
    }
    return 'Mossa solida e coerente con la posizione.';
  }

  const packs: Record<
    Exclude<SupportedUiLang, 'it'>,
    {
      mate: string;
      allowsMate: (n: number) => string;
      missedMate: (n: number) => string;
      brilliant: string;
      great: string;
      missedWin: string;
      blunder: (seq: string) => string;
      mistake: string;
      inaccuracy: string;
      book: string;
      good: string;
    }
  > = {
    en: {
      mate: 'Decisive checkmate.',
      allowsMate: (n) => `Allows a forced checkmate in ${n} moves (${playedPv}).`,
      missedMate: (n) => `Misses a forced mate in ${n} with ${bestMoveSan}.`,
      brilliant: `Spectacular sacrifice (${san}) that keeps a winning evaluation.`,
      great: `Only accurate move (${san}) preserving the critical advantage.`,
      missedWin: `Missed winning chance: ${bestMoveSan} (${bestPv}) gave a clear edge (~+${evalBeforeStr}).`,
      blunder: (seq) => `Blunder (-${lossStr} pawns): instead of ${san}, ${bestMoveSan} (${bestPv}) was needed.${seq}`,
      mistake: `Mistake (-${lossStr} pawns): ${bestMoveSan} (${bestPv}) was much stronger (eval ${evalAfterStr}).`,
      inaccuracy: `Inaccuracy: ${bestMoveSan} kept tighter control.`,
      book: 'Opening theory move.',
      good: 'Solid move consistent with the position.',
    },
    es: {
      mate: 'Jaque mate decisivo.',
      allowsMate: (n) => `Permite jaque mate forzado en ${n} jugadas (${playedPv}).`,
      missedMate: (n) => `Omite mate forzado en ${n} con ${bestMoveSan}.`,
      brilliant: `Sacrificio brillante (${san}) que mantiene una ventaja ganadora.`,
      great: `Única jugada precisa (${san}) que conserva la ventaja clave.`,
      missedWin: `Victoria perdida: ${bestMoveSan} (${bestPv}) daba ventaja clara (~+${evalBeforeStr}).`,
      blunder: (seq) => `Error grave (-${lossStr} peones): en vez de ${san}, había que jugar ${bestMoveSan} (${bestPv}).${seq}`,
      mistake: `Error (-${lossStr} peones): ${bestMoveSan} (${bestPv}) era muy superior (eval ${evalAfterStr}).`,
      inaccuracy: `Imprecisión: ${bestMoveSan} mantenía mayor control.`,
      book: 'Jugada teórica de apertura.',
      good: 'Jugada sólida y coherente con la posición.',
    },
    fr: {
      mate: 'Échec et mat décisif.',
      allowsMate: (n) => `Permet un mat forcé en ${n} coups (${playedPv}).`,
      missedMate: (n) => `Manque un mat forcé en ${n} avec ${bestMoveSan}.`,
      brilliant: `Sacrifice brillant (${san}) qui maintient un avantage gagnant.`,
      great: `Seul coup précis (${san}) préservant l’avantage critique.`,
      missedWin: `Gain manqué : ${bestMoveSan} (${bestPv}) donnait un net avantage (~+${evalBeforeStr}).`,
      blunder: (seq) => `Gaffe (-${lossStr} pions) : au lieu de ${san}, il fallait jouer ${bestMoveSan} (${bestPv}).${seq}`,
      mistake: `Erreur (-${lossStr} pions) : ${bestMoveSan} (${bestPv}) était nettement meilleur (éval ${evalAfterStr}).`,
      inaccuracy: `Imprécision : ${bestMoveSan} gardait plus de contrôle.`,
      book: 'Coup théorique d’ouverture.',
      good: 'Coup solide cohérent avec la position.',
    },
    de: {
      mate: 'Entscheidendes Schachmatt.',
      allowsMate: (n) => `Ermöglicht erzwungenes Matt in ${n} Zügen (${playedPv}).`,
      missedMate: (n) => `Verpasst Matt in ${n} mit ${bestMoveSan}.`,
      brilliant: `Spektakuläres Opfer (${san}) mit klarer Gewinnstellung.`,
      great: `Einziger genauer Zug (${san}), der den Vorteil wahrt.`,
      missedWin: `Gewinn verpasst: ${bestMoveSan} (${bestPv}) gab klaren Vorteil (~+${evalBeforeStr}).`,
      blunder: (seq) => `Patzer (-${lossStr} Bauern): statt ${san} war ${bestMoveSan} (${bestPv}) nötig.${seq}`,
      mistake: `Fehler (-${lossStr} Bauern): ${bestMoveSan} (${bestPv}) war deutlich stärker (Bew. ${evalAfterStr}).`,
      inaccuracy: `Ungenauigkeit: ${bestMoveSan} hielt mehr Kontrolle.`,
      book: 'Theoriezug in der Eröffnung.',
      good: 'Solider, zur Stellung passender Zug.',
    },
    pt: {
      mate: 'Xeque-mate decisivo.',
      allowsMate: (n) => `Permite mate forçado em ${n} lances (${playedPv}).`,
      missedMate: (n) => `Perde mate forçado em ${n} com ${bestMoveSan}.`,
      brilliant: `Sacrifício brilhante (${san}) mantendo avaliação vencedora.`,
      great: `Único lance preciso (${san}) preservando a vantagem crítica.`,
      missedWin: `Vitória perdida: ${bestMoveSan} (${bestPv}) dava vantagem clara (~+${evalBeforeStr}).`,
      blunder: (seq) => `Erro grave (-${lossStr} peões): em vez de ${san}, jogue ${bestMoveSan} (${bestPv}).${seq}`,
      mistake: `Erro (-${lossStr} peões): ${bestMoveSan} (${bestPv}) era bem melhor (aval. ${evalAfterStr}).`,
      inaccuracy: `Imprecisão: ${bestMoveSan} mantinha maior controle.`,
      book: 'Lance teórico de abertura.',
      good: 'Lance sólido e coerente com a posição.',
    },
    ru: {
      mate: 'Решающий мат.',
      allowsMate: (n) => `Допускает форсированный мат в ${n} х. (${playedPv}).`,
      missedMate: (n) => `Упущен мат в ${n} ходов ходом ${bestMoveSan}.`,
      brilliant: `Блестящая жертва (${san}) с сохранением выигрыша.`,
      great: `Единственный точный ход (${san}), сохраняющий перевес.`,
      missedWin: `Упущенная победа: ${bestMoveSan} (${bestPv}) давал перевес (~+${evalBeforeStr}).`,
      blunder: (seq) => `Зевок (-${lossStr} пешки): вместо ${san} следовало ${bestMoveSan} (${bestPv}).${seq}`,
      mistake: `Ошибка (-${lossStr} пешки): ${bestMoveSan} (${bestPv}) сильнее (оценка ${evalAfterStr}).`,
      inaccuracy: `Неточность: ${bestMoveSan} давал больше контроля.`,
      book: 'Теоретический дебютный ход.',
      good: 'Надёжный позиционный ход.',
    },
    zh: {
      mate: '决定性将杀。',
      allowsMate: (n) => `允许对手在 ${n} 步内强制将杀 (${playedPv})。`,
      missedMate: (n) => `错失 ${bestMoveSan} 的 ${n} 步强制将杀。`,
      brilliant: `精彩弃子 (${san})，保持胜势。`,
      great: `唯一精确着法 (${san})，守住关键优势。`,
      missedWin: `错失胜机：${bestMoveSan} (${bestPv}) 可获得明显优势 (~+${evalBeforeStr})。`,
      blunder: (seq) => `大漏着 (-${lossStr} 兵)：应走 ${bestMoveSan} (${bestPv}) 而非 ${san}。${seq}`,
      mistake: `失误 (-${lossStr} 兵)：${bestMoveSan} (${bestPv}) 明显更佳（评估 ${evalAfterStr}）。`,
      inaccuracy: `不精确：${bestMoveSan} 控制力更强。`,
      book: '开局定式着法。',
      good: '稳健且合理的着法。',
    },
    ja: {
      mate: '決定的なチェックメイト。',
      allowsMate: (n) => `${n} 手詰みを許します (${playedPv})。`,
      missedMate: (n) => `${bestMoveSan} による ${n} 手詰みを逃しました。`,
      brilliant: `勝勢を保つ見事なサクリファイス (${san})。`,
      great: `重要な優位を保つ唯一の好手 (${san})。`,
      missedWin: `勝ち逃し：${bestMoveSan} (${bestPv}) で明確な優位でした (~+${evalBeforeStr})。`,
      blunder: (seq) => `大悪手 (-${lossStr} ポーン)：${san} ではなく ${bestMoveSan} (${bestPv}) が必要でした。${seq}`,
      mistake: `悪手 (-${lossStr} ポーン)：${bestMoveSan} (${bestPv}) の方が有力でした (評価 ${evalAfterStr})。`,
      inaccuracy: `疑問手：${bestMoveSan} で主導権を維持できました。`,
      book: '定跡手。',
      good: '局面に合った堅実な手。',
    },
    ko: {
      mate: '결정적인 체크메이트.',
      allowsMate: (n) => `${n}수 강제 메이트를 허용합니다 (${playedPv}).`,
      missedMate: (n) => `${bestMoveSan}로 ${n}수 메이트를 놓쳤습니다.`,
      brilliant: `승세를 유지하는 멋진 희생 (${san}).`,
      great: `핵심 우위를 지키는 유일한 정확한 수 (${san}).`,
      missedWin: `승리 놓침: ${bestMoveSan} (${bestPv})가 유리했습니다 (~+${evalBeforeStr}).`,
      blunder: (seq) => `대실수 (-${lossStr} 폰): ${san} 대신 ${bestMoveSan} (${bestPv})가 필요했습니다.${seq}`,
      mistake: `실수 (-${lossStr} 폰): ${bestMoveSan} (${bestPv})가 훨씬 좋았습니다 (평가 ${evalAfterStr}).`,
      inaccuracy: `부정확: ${bestMoveSan}가 더 안정적이었습니다.`,
      book: '오프닝 이론 수.',
      good: '포지션에 어울리는 탄탄한 수.',
    },
    ar: {
      mate: 'كش مات حاسم.',
      allowsMate: (n) => `يسمح بكش مات إجباري خلال ${n} نقلات (${playedPv}).`,
      missedMate: (n) => `يُضيّع كش مات خلال ${n} نقلات عبر ${bestMoveSan}.`,
      brilliant: `تضحية رائعة (${san}) تحافظ على الأفضلية الحاسمة.`,
      great: `النقلة الدقيقة الوحيدة (${san}) للحفاظ على الأفضلية.`,
      missedWin: `فرصة فوز ضائعة: ${bestMoveSan} (${bestPv}) كان يمنح أفضلية واضحة (~+${evalBeforeStr}).`,
      blunder: (seq) => `خطأ فادح (-${lossStr} بيادق): بدلاً من ${san} كان يجب لعب ${bestMoveSan} (${bestPv}).${seq}`,
      mistake: `خطأ (-${lossStr} بيادق): ${bestMoveSan} (${bestPv}) أفضل بكثير (تقييم ${evalAfterStr}).`,
      inaccuracy: `عدم دقة: ${bestMoveSan} يحافظ على سيطرة أكبر.`,
      book: 'نقلة افتتاحية نظرية.',
      good: 'نقلة متماسكة متوافقة مع الوضعية.',
    },
  };

  const p = packs[code] || packs.en;
  if (san.includes('#')) return p.mate;
  if (mateAfterForMover !== undefined && mateAfterForMover < 0) {
    return p.allowsMate(Math.abs(mateAfterForMover));
  }
  if (mateBeforeForMover !== undefined && mateBeforeForMover > 0 && (!mateAfterForMover || mateAfterForMover < 0)) {
    return p.missedMate(mateBeforeForMover);
  }
  if (classification === 'brilliant') return p.brilliant;
  if (classification === 'great') return p.great;
  if (classification === 'missed_win') return p.missedWin;
  if (classification === 'blunder') {
    const seq = playedPv ? ` (${playedPv})` : '';
    return p.blunder(seq);
  }
  if (classification === 'mistake') return p.mistake;
  if (classification === 'inaccuracy') return p.inaccuracy;
  if (classification === 'book') return p.book;
  return p.good;
}

function summarizeSide(moves: AnalyzedMove[], color: PieceColor): PlayerSideSummary {
  const sideMoves = moves.filter((m) => m.color === color);
  const calcAcc = (arr: AnalyzedMove[]): number => {
    if (arr.length === 0) return 100;
    const avgLoss =
      arr.reduce((sum, m) => sum + Math.min(600, m.cpLoss), 0) / arr.length;
    return Math.max(10, Math.min(99, Math.round(100 * Math.exp(-avgLoss / 175))));
  };

  const counts = {
    book: 0,
    brilliant: 0,
    great: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    missedWin: 0,
  };

  for (const m of sideMoves) {
    if (m.classification === 'book') counts.book++;
    else if (m.classification === 'brilliant') counts.brilliant++;
    else if (m.classification === 'great') counts.great++;
    else if (m.classification === 'good') counts.good++;
    else if (m.classification === 'inaccuracy') counts.inaccuracy++;
    else if (m.classification === 'mistake') counts.mistake++;
    else if (m.classification === 'blunder') counts.blunder++;
    else if (m.classification === 'missed_win') counts.missedWin++;
  }

  return {
    accuracyPct: calcAcc(sideMoves),
    openingAcc: calcAcc(sideMoves.filter((m) => m.phase === 'opening')),
    middlegameAcc: calcAcc(sideMoves.filter((m) => m.phase === 'middlegame')),
    endgameAcc: calcAcc(sideMoves.filter((m) => m.phase === 'endgame')),
    ...counts,
  };
}

export interface RawMoveEntry {
  san: string;
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  captured?: string;
  color: PieceColor;
  fenBefore: string;
  fenAfter: string;
}

export interface ParsedGameInput {
  id: string;
  source: 'biochess' | 'pgn';
  whiteUsername: string;
  blackUsername: string;
  whiteElo?: number;
  blackElo?: number;
  playerColor: PieceColor;
  result: 'win' | 'loss' | 'draw';
  resultLabel: string;
  endReason: string;
  pgn: string;
  rawMoves: RawMoveEntry[];
}

export function parsePgnForAnalysis(
  pgnText: string,
  preferredColor: PieceColor = 'w',
  myUsername?: string,
  lang?: string
): { ok: true; parsed: ParsedGameInput } | { ok: false; error: string } {
  const code = normalizeUiLang(lang);
  const msgPack = {
    it: {
      empty: 'Incolla un PGN valido prima di avviare l’analisi.',
      invalid: 'PGN non valido o illeggibile. Verifica le mosse algebriche (es. 1. e4 e5 2. Nf3 Nc6).',
      noMoves: 'Il PGN non contiene alcuna mossa da analizzare.',
      white: 'Bianco',
      black: 'Nero',
    },
    en: {
      empty: 'Paste a valid PGN before starting the analysis.',
      invalid: 'Invalid or unreadable PGN. Check algebraic moves (e.g. 1. e4 e5 2. Nf3 Nc6).',
      noMoves: 'The PGN does not contain any moves to analyze.',
      white: 'White',
      black: 'Black',
    },
    es: {
      empty: 'Pega un PGN válido antes de iniciar el análisis.',
      invalid: 'PGN inválido o ilegible. Verifica las jugadas (ej. 1. e4 e5 2. Nf3 Nc6).',
      noMoves: 'El PGN no contiene jugadas para analizar.',
      white: 'Blancas',
      black: 'Negras',
    },
    fr: {
      empty: 'Collez un PGN valide avant de lancer l’analyse.',
      invalid: 'PGN invalide ou illisible. Vérifiez les coups (ex. 1. e4 e5 2. Nf3 Nc6).',
      noMoves: 'Le PGN ne contient aucun coup à analyser.',
      white: 'Blancs',
      black: 'Noirs',
    },
    de: {
      empty: 'Bitte ein gültiges PGN vor der Analyse einfügen.',
      invalid: 'Ungültiges oder unlesbares PGN (z. B. 1. e4 e5 2. Nf3 Nc6).',
      noMoves: 'Das PGN enthält keine Züge.',
      white: 'Weiß',
      black: 'Schwarz',
    },
    pt: {
      empty: 'Cole um PGN válido antes de iniciar a análise.',
      invalid: 'PGN inválido ou ilegível (ex. 1. e4 e5 2. Nf3 Nc6).',
      noMoves: 'O PGN não contém lances para analisar.',
      white: 'Brancas',
      black: 'Pretas',
    },
  }[code === 'it' || code === 'en' || code === 'es' || code === 'fr' || code === 'de' || code === 'pt' ? code : 'en'];

  const cleaned = pgnText.trim();
  if (!cleaned) {
    return { ok: false, error: msgPack.empty };
  }

  const chess = new Chess();
  try {
    chess.loadPgn(cleaned);
  } catch {
    return {
      ok: false,
      error: msgPack.invalid,
    };
  }

  const history = chess.history({ verbose: true }) as Move[];
  if (history.length === 0) {
    return { ok: false, error: msgPack.noMoves };
  }

  const headers = chess.header();
  const whiteName = (headers.White || msgPack.white).slice(0, 32);
  const blackName = (headers.Black || msgPack.black).slice(0, 32);
  const whiteElo = headers.WhiteElo ? parseInt(headers.WhiteElo, 10) : undefined;
  const blackElo = headers.BlackElo ? parseInt(headers.BlackElo, 10) : undefined;

  let detectedColor: PieceColor = preferredColor;
  if (myUsername) {
    const low = myUsername.toLowerCase();
    if (blackName.toLowerCase() === low && whiteName.toLowerCase() !== low) {
      detectedColor = 'b';
    } else if (whiteName.toLowerCase() === low && blackName.toLowerCase() !== low) {
      detectedColor = 'w';
    }
  }

  const resStr = headers.Result || '*';
  let result: 'win' | 'loss' | 'draw' = 'draw';
  let resultLabel = '½-½';
  if (resStr === '1-0') {
    result = detectedColor === 'w' ? 'win' : 'loss';
    resultLabel = '1-0';
  } else if (resStr === '0-1') {
    result = detectedColor === 'b' ? 'win' : 'loss';
    resultLabel = '0-1';
  } else if (resStr === '1/2-1/2') {
    result = 'draw';
    resultLabel = '½-½';
  } else if (chess.isCheckmate()) {
    const winnerColor: PieceColor = chess.turn() === 'w' ? 'b' : 'w';
    result = winnerColor === detectedColor ? 'win' : 'loss';
    resultLabel = winnerColor === 'w' ? '1-0' : '0-1';
  } else if (chess.isDraw()) {
    result = 'draw';
    resultLabel = '½-½';
  } else {
    resultLabel = '*';
  }

  const rawMoves: RawMoveEntry[] = [];
  try {
    const startFenHeader = headers.FEN || headers.Fen;
    let fallbackReplay: Chess | null = null;
    for (const m of history) {
      let fenBefore = typeof m.before === 'string' && m.before ? m.before : '';
      let fenAfter = typeof m.after === 'string' && m.after ? m.after : '';

      if (!fenBefore || !fenAfter) {
        if (!fallbackReplay) {
          fallbackReplay = startFenHeader ? new Chess(startFenHeader) : new Chess();
        }
        fenBefore = fallbackReplay.fen();
        const res = fallbackReplay.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
        });
        fenAfter = fallbackReplay.fen();
        rawMoves.push({
          san: res.san,
          from: res.from,
          to: res.to,
          promotion: res.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
          captured: res.captured,
          color: res.color,
          fenBefore,
          fenAfter,
        });
      } else {
        rawMoves.push({
          san: m.san,
          from: m.from,
          to: m.to,
          promotion: m.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
          captured: m.captured,
          color: m.color,
          fenBefore,
          fenAfter,
        });
      }
    }
  } catch (err) {
    console.warn('[BioChess][Coach] Failed extracting PGN moves cleanly:', err);
    if (rawMoves.length === 0) {
      return {
        ok: false,
        error: msgPack.invalid,
      };
    }
  }

  // Deterministic short hash for PGN deduplication
  let hash = 2166136261;
  for (let i = 0; i < cleaned.length; i++) {
    hash ^= cleaned.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const pgnId = `pgn_${(hash >>> 0).toString(36)}`;

  return {
    ok: true,
    parsed: {
      id: pgnId,
      source: 'pgn',
      whiteUsername: whiteName,
      blackUsername: blackName,
      whiteElo: Number.isFinite(whiteElo) ? whiteElo : undefined,
      blackElo: Number.isFinite(blackElo) ? blackElo : undefined,
      playerColor: detectedColor,
      result,
      resultLabel,
      endReason:
        headers.Termination ||
        headers.Event ||
        (code === 'it' ? 'Partita importata da PGN' : 'Imported PGN Game'),
      pgn: chess.pgn(),
      rawMoves,
    },
  };
}

export function gameStateToParsedInput(
  game: GameState,
  myUsername: string,
  lang?: string
): ParsedGameInput {
  const playerColor: PieceColor =
    !game.white.isBot && game.white.username.toLowerCase() === myUsername.toLowerCase()
      ? 'w'
      : 'b';

  const result: 'win' | 'loss' | 'draw' =
    game.winner === 'draw' || !game.winner
      ? 'draw'
      : game.winner === playerColor
        ? 'win'
        : 'loss';

  const resultLabel =
    game.winner === 'w' ? '1-0' : game.winner === 'b' ? '0-1' : '½-½';

  const rawMoves: RawMoveEntry[] = [];
  for (let i = 0; i < game.moves.length; i++) {
    const m = game.moves[i];
    const fenBefore = i === 0 ? START_FEN : game.moves[i - 1]?.fen || START_FEN;
    rawMoves.push({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
      captured: m.captured,
      color: m.color,
      fenBefore,
      fenAfter: m.fen,
    });
  }

  return {
    id: game.id,
    source: 'biochess',
    whiteUsername: game.white.username,
    blackUsername: game.black.username,
    whiteElo: game.white.elo,
    blackElo: game.black.elo,
    playerColor,
    result,
    resultLabel,
    endReason: game.endReason || (normalizeUiLang(lang) === 'it' ? 'Partita BioChess' : 'BioChess Game'),
    pgn: game.pgn,
    rawMoves,
  };
}

export async function analyzeFullGameWithEngine(
  parsed: ParsedGameInput,
  onProgress?: (completed: number, total: number) => void,
  lang?: string
): Promise<FullGameAnalysis> {
  const total = parsed.rawMoves.length;
  const evalCache = new Map<string, ReturnType<typeof searchPositionWithPv>>();

  const getEval = (fen: string) => {
    if (evalCache.has(fen)) return evalCache.get(fen)!;
    const res = searchPositionWithPv(fen, UNIFIED_EVAL_CONFIG, 1);
    evalCache.set(fen, res);
    return res;
  };

  const analyzedMoves: AnalyzedMove[] = [];
  const sans = parsed.rawMoves.map((m) => m.san);
  const opening = detectOpeningFromSans(sans, lang);

  for (let i = 0; i < total; i++) {
    const raw = parsed.rawMoves[i];
    const beforeEval = getEval(raw.fenBefore);
    let legalMovesCount: number | undefined;
    try {
      const beforeChess = new Chess(raw.fenBefore);
      legalMovesCount = beforeChess.moves().length;
    } catch {
      legalMovesCount = undefined;
    }

    let isTerminalMate = false;
    let isTerminalDraw = false;
    try {
      const afterChess = new Chess(raw.fenAfter);
      isTerminalMate = afterChess.isCheckmate();
      isTerminalDraw = afterChess.isDraw();
    } catch {
      isTerminalMate = false;
      isTerminalDraw = false;
    }

    const targetPromo = raw.promotion || 'q';
    const playedWasBest = Boolean(
      beforeEval &&
        beforeEval.bestFrom === raw.from &&
        beforeEval.bestTo === raw.to &&
        (!beforeEval.bestPromo || beforeEval.bestPromo === targetPromo)
    );

    const afterEval: EnginePvResult | null = isTerminalMate
      ? {
          scoreCpWhite: raw.color === 'w' ? 30000 : -30000,
          mateIn: 0,
          bestFrom: raw.from,
          bestTo: raw.to,
          pv: [],
          reachedDepth: UNIFIED_EVAL_CONFIG.maxDepth,
        }
      : isTerminalDraw
        ? {
            scoreCpWhite: 0,
            bestFrom: raw.from,
            bestTo: raw.to,
            pv: [],
            reachedDepth: UNIFIED_EVAL_CONFIG.maxDepth,
          }
        : playedWasBest
          ? beforeEval
          : getEval(raw.fenAfter);

    const prevRaw = i > 0 ? parsed.rawMoves[i - 1] : undefined;
    const unified = classifyMoveUnified({
      fenBefore: raw.fenBefore,
      fenAfter: raw.fenAfter,
      from: raw.from,
      to: raw.to,
      promotion: raw.promotion,
      captured: raw.captured,
      san: raw.san,
      color: raw.color,
      plyIndex: i,
      legalMovesCount,
      lastMove: prevRaw ? { to: prevRaw.to, captured: prevRaw.captured } : undefined,
      beforeEval,
      afterEval,
      isTerminalMate,
      isTerminalDraw,
    });

    const moverSign = raw.color === 'w' ? 1 : -1;
    const evalBeforeWhiteCp = unified.evalBeforeWhiteCp;
    const evalAfterWhiteCp = unified.evalAfterWhiteCp;
    const evalBeforeMoverCp = evalBeforeWhiteCp * moverSign;
    const evalAfterMoverCp = evalAfterWhiteCp * moverSign;

    const bestFrom = unified.bestFrom;
    const bestTo = unified.bestTo;
    const bestPromo = unified.bestPromo;
    const bestMoveSan = moveToSan(raw.fenBefore, bestFrom, bestTo, bestPromo);
    const bestPvSan = [bestMoveSan];
    const playedPvSan: string[] = [];

    const cpLoss = unified.cpLoss;
    const evalSwingCp = unified.evalSwingCp;
    const phase = getGamePhase(raw.fenBefore, i);
    const classification: CoachMoveClass = unified.classification;

    const tacticalNote = buildTacticalNote({
      color: raw.color,
      san: raw.san,
      bestMoveSan,
      classification,
      cpLoss,
      evalBeforeMoverCp,
      evalAfterMoverCp,
      mateBefore: unified.mateBefore,
      mateAfter: unified.mateAfter,
      bestPvSan,
      playedPvSan,
      lang,
    });

    analyzedMoves.push({
      ply: i,
      moveNumber: Math.floor(i / 2) + 1,
      color: raw.color,
      san: raw.san,
      from: raw.from,
      to: raw.to,
      promotion: raw.promotion,
      captured: raw.captured,
      fenBefore: raw.fenBefore,
      fenAfter: raw.fenAfter,
      evalBeforeWhiteCp,
      evalAfterWhiteCp,
      mateBefore: unified.mateBefore,
      mateAfter: unified.mateAfter,
      bestMoveSan,
      bestMoveFrom: bestFrom,
      bestMoveTo: bestTo,
      bestMovePromo: bestPromo as 'q' | 'r' | 'b' | 'n' | undefined,
      bestPvSan,
      playedPvSan,
      cpLoss,
      evalSwingCp,
      classification,
      phase,
      isDecisiveMoment: false,
      tacticalNote,
    });

    if (onProgress && (i % 4 === 3 || i === total - 1)) {
      onProgress(i + 1, total);
    }
    if (i % 12 === 11) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Identify top 5 decisive moments across the game
  const candidates = analyzedMoves
    .filter(
      (m) =>
        m.classification === 'blunder' ||
        m.classification === 'missed_win' ||
        m.classification === 'mistake' ||
        m.classification === 'brilliant' ||
        m.cpLoss >= 95
    )
    .map((m) => {
      const playerWeight = m.color === parsed.playerColor ? 1.35 : 0.9;
      const severity =
        m.classification === 'blunder'
          ? 400
          : m.classification === 'missed_win'
            ? 350
            : m.classification === 'brilliant'
              ? 280
              : 180;
      return {
        ply: m.ply,
        priority: (severity + Math.min(600, m.cpLoss)) * playerWeight,
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((c) => c.ply);

  const decisiveSet = new Set(candidates);
  for (const m of analyzedMoves) {
    if (!decisiveSet.has(m.ply)) continue;
    m.isDecisiveMoment = true;

    // Enrich ONLY the decisive moments with 4-ply Principal Variations for instant coaching accuracy
    const deepBefore = searchPositionWithPv(
      m.fenBefore,
      { maxDepth: 4, budgetMs: 350, quiescencePlies: 4, deterministic: true, maxNodes: 180000 },
      4
    );
    if (deepBefore && deepBefore.pv.length > 0) {
      m.bestPvSan = pvUciToSan(m.fenBefore, deepBefore.pv);
    }

    try {
      const afterCh = new Chess(m.fenAfter);
      if (!afterCh.isGameOver()) {
        const deepAfter = searchPositionWithPv(
          m.fenAfter,
          { maxDepth: 3, budgetMs: 250, quiescencePlies: 3, deterministic: true, maxNodes: 140000 },
          3
        );
        if (deepAfter && deepAfter.pv.length > 0) {
          m.playedPvSan = pvUciToSan(m.fenAfter, deepAfter.pv);
        }
      }
    } catch {
      // ignore invalid fenAfter
    }

    const moverSign = m.color === 'w' ? 1 : -1;
    m.tacticalNote = buildTacticalNote({
      color: m.color,
      san: m.san,
      bestMoveSan: m.bestMoveSan,
      classification: m.classification,
      cpLoss: m.cpLoss,
      evalBeforeMoverCp: m.evalBeforeWhiteCp * moverSign,
      evalAfterMoverCp: m.evalAfterWhiteCp * moverSign,
      mateBefore: m.mateBefore,
      mateAfter: m.mateAfter,
      bestPvSan: m.bestPvSan,
      playedPvSan: m.playedPvSan,
      lang,
    });
  }

  const decisiveMoments = analyzedMoves.filter((m) => m.isDecisiveMoment);
  const whiteStats = summarizeSide(analyzedMoves, 'w');
  const blackStats = summarizeSide(analyzedMoves, 'b');

  return {
    id: parsed.id,
    source: parsed.source,
    whiteUsername: parsed.whiteUsername,
    blackUsername: parsed.blackUsername,
    whiteElo: parsed.whiteElo,
    blackElo: parsed.blackElo,
    playerColor: parsed.playerColor,
    result: parsed.result,
    resultLabel: parsed.resultLabel,
    endReason: parsed.endReason,
    openingEco: opening.eco,
    openingName: opening.name,
    pgn: parsed.pgn,
    moves: analyzedMoves,
    decisiveMoments,
    whiteStats,
    blackStats,
    analyzedAtMs: Date.now(),
  };
}

export function getMoveVariationOnDemand(move: AnalyzedMove): string[] {
  if (move.bestPvSan.length > 1) return move.bestPvSan;
  const deep = searchPositionWithPv(
    move.fenBefore,
    { maxDepth: 3, budgetMs: 250, quiescencePlies: 3, deterministic: true, maxNodes: 140000 },
    4
  );
  if (deep && deep.pv.length > 0) {
    const line = pvUciToSan(move.fenBefore, deep.pv);
    if (line.length > 0) {
      move.bestPvSan = line;
      return line;
    }
  }
  return move.bestPvSan;
}

export function analysisToSavedReview(analysis: FullGameAnalysis): SavedGameReview {
  const mySide = analysis.playerColor === 'w' ? analysis.whiteStats : analysis.blackStats;
  return {
    id: analysis.id,
    whiteUsername: analysis.whiteUsername.slice(0, 32),
    blackUsername: analysis.blackUsername.slice(0, 32),
    playerColor: analysis.playerColor,
    result: analysis.result,
    accuracyPct: mySide.accuracyPct,
    openingName: analysis.openingName.slice(0, 80),
    openingAcc: mySide.openingAcc,
    middlegameAcc: mySide.middlegameAcc,
    endgameAcc: mySide.endgameAcc,
    brilliantCount: mySide.brilliant,
    greatCount: mySide.great,
    goodCount: mySide.good,
    inaccuracyCount: mySide.inaccuracy,
    mistakeCount: mySide.mistake,
    blunderCount: mySide.blunder,
    missedWinCount: mySide.missedWin,
    movesCount: analysis.moves.length,
    source: analysis.source,
    pgn: analysis.pgn.slice(0, 8000),
    createdAtMs: analysis.analyzedAtMs,
  };
}

export function evaluateStudentMoveOnPosition(
  fenBefore: string,
  from: string,
  to: string,
  promotion: 'q' | 'r' | 'b' | 'n' | undefined,
  engineBestSan: string,
  engineBestEvalWhiteCp: number
): StudentAttemptEvaluation | null {
  let chess: Chess;
  try {
    chess = new Chess(fenBefore);
  } catch {
    return null;
  }
  const moverColor = chess.turn();
  const moverSign = moverColor === 'w' ? 1 : -1;

  let moveRes: Move;
  try {
    moveRes = chess.move({ from, to, promotion: promotion || 'q' });
  } catch {
    return null;
  }

  const afterFen = chess.fen();
  const isMate = chess.isCheckmate();
  const isDraw = chess.isDraw();
  const afterRes = isMate || isDraw
    ? null
    : searchPositionWithPv(
        afterFen,
        { maxDepth: 4, budgetMs: 350, quiescencePlies: 4, deterministic: true, maxNodes: 180000 },
        4
      );

  const studentEvalWhiteCp = isMate
    ? moverColor === 'w'
      ? 30000
      : -30000
    : isDraw
      ? 0
      : (afterRes?.scoreCpWhite ?? 0);

  const bestMoverCp = engineBestEvalWhiteCp * moverSign;
  const studentMoverCp = studentEvalWhiteCp * moverSign;
  const cpLoss = isMate || moveRes.san === engineBestSan
    ? 0
    : Math.max(0, Math.round(bestMoverCp - studentMoverCp));

  const refutationLineSan = afterRes ? pvUciToSan(afterFen, afterRes.pv) : [];

  let verdict: StudentAttemptEvaluation['verdict'] = 'inaccurate';
  if (moveRes.san === engineBestSan || isMate) {
    verdict = 'exact_best';
  } else if (cpLoss <= 40) {
    verdict = 'strong_alternative';
  } else if (cpLoss >= 200 || (afterRes?.mateIn && afterRes.mateIn * moverSign < 0)) {
    verdict = 'blunder';
  }

  return {
    san: moveRes.san,
    from: moveRes.from,
    to: moveRes.to,
    isBest: moveRes.san === engineBestSan || isMate,
    cpLossVsBest: cpLoss,
    evalWhiteCp: studentEvalWhiteCp,
    mateIn: afterRes?.mateIn,
    refutationLineSan,
    verdict,
  };
}
