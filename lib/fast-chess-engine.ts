// High-speed 0x88 chess engine with Tapered Evaluation, Transposition Table,
// Null-Move Pruning, LMR, Killer/History Ordering, Quiescence, and Opening Book.

export type FastColor = 1 | -1; // 1 = White, -1 = Black

// Piece codes: 1=P, 2=N, 3=B, 4=R, 5=Q, 6=K (positive=white, negative=black)
const EMPTY = 0;
const PAWN = 1;
const KNIGHT = 2;
const BISHOP = 3;
const ROOK = 4;
const QUEEN = 5;
const KING = 6;

const MATE_SCORE = 30000;
const INF = 32000;

// Move encoding (32-bit int):
// bits 0..6:   from (0..127)
// bits 7..13:  to (0..127)
// bits 14..16: promo piece (0 or 2..5)
// bits 17..19: captured piece type (0..6)
// bit 20:      ep capture flag
// bit 21:      castle flag
const encMove = (
  from: number,
  to: number,
  promo = 0,
  cap = 0,
  ep = 0,
  castle = 0
): number =>
  from | (to << 7) | (promo << 14) | (cap << 17) | (ep << 20) | (castle << 21);

export const moveFrom = (m: number): number => m & 0x7f;
export const moveTo = (m: number): number => (m >> 7) & 0x7f;
export const movePromo = (m: number): number => (m >> 14) & 0x7;
const moveCap = (m: number): number => (m >> 17) & 0x7;
const moveIsEp = (m: number): number => (m >> 20) & 1;
const moveIsCastle = (m: number): number => (m >> 21) & 1;

export function sq0x88ToAlgebraic(sq: number): string {
  const file = sq & 7;
  const rank = 8 - (sq >> 4);
  return `${String.fromCharCode(97 + file)}${rank}`;
}

export function algebraicTo0x88(alg: string): number {
  const file = alg.charCodeAt(0) - 97;
  const rank = 8 - parseInt(alg[1], 10);
  return (rank << 4) | file;
}

const PROMO_CHAR: Record<number, 'n' | 'b' | 'r' | 'q'> = {
  [KNIGHT]: 'n',
  [BISHOP]: 'b',
  [ROOK]: 'r',
  [QUEEN]: 'q',
};

export function fastMovePromoChar(m: number): 'n' | 'b' | 'r' | 'q' | undefined {
  const p = movePromo(m);
  return p ? PROMO_CHAR[p] : undefined;
}

// PeSTO-style Midgame & Endgame piece values
const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0];
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];

// 64-entry PSTs (from White's perspective: index 0 = a8 .. 63 = h1)
const MG_PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  98, 134, 61, 95, 68, 126, 34, -11,
  -6, 7, 26, 31, 65, 56, 25, -20,
  -14, 13, 6, 21, 23, 12, 17, -23,
  -27, -2, -5, 12, 17, 6, 10, -25,
  -26, -4, -4, -10, 3, 3, 33, -12,
  -35, -1, -20, -23, -15, 24, 38, -22,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const EG_PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  178, 173, 158, 134, 147, 132, 165, 187,
  94, 100, 85, 67, 56, 53, 82, 84,
  32, 24, 13, 5, -2, 4, 17, 17,
  13, 9, -3, -7, -7, -8, 3, -1,
  4, 7, -6, 1, 0, -5, -1, -8,
  13, 8, 8, 10, 13, 0, 2, -7,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const MG_KNIGHT_PST = [
  -167, -89, -34, -49, 61, -97, -15, -107,
  -73, -41, 72, 36, 23, 62, 7, -17,
  -47, 60, 37, 65, 84, 129, 73, 44,
  -9, 17, 19, 53, 37, 69, 18, 22,
  -13, 4, 16, 13, 28, 19, 21, -8,
  -23, -9, 12, 10, 19, 17, 25, -16,
  -29, -53, -12, -3, -1, 18, -14, -19,
  -105, -21, -58, -33, -17, -28, -19, -23,
];
const EG_KNIGHT_PST = [
  -58, -38, -13, -28, -31, -27, -63, -99,
  -25, -8, -25, -2, -9, -25, -24, -52,
  -24, -20, 10, 9, -1, -9, -19, -41,
  -17, 3, 22, 22, 22, 11, 8, -18,
  -18, -6, 16, 25, 16, 17, 4, -18,
  -23, -3, -1, 15, 10, -3, -20, -22,
  -42, -20, -10, -5, -2, -20, -23, -44,
  -29, -51, -23, -15, -22, -18, -50, -64,
];

const MG_BISHOP_PST = [
  -29, 4, -82, -37, -25, -42, 7, -8,
  -26, 16, -18, -13, 30, 59, 18, -47,
  -16, 37, 43, 40, 35, 50, 37, -2,
  -4, 5, 19, 50, 37, 37, 7, -2,
  -6, 13, 13, 26, 34, 12, 10, 4,
  0, 15, 15, 15, 14, 27, 18, 10,
  4, 15, 16, 0, 7, 21, 33, 1,
  -33, -3, -14, -21, -13, -12, -39, -21,
];
const EG_BISHOP_PST = [
  -14, -21, -11, -8, -7, -9, -17, -24,
  -8, -4, 7, -12, -3, -13, -4, -14,
  2, -8, 0, -1, -2, 6, 0, 4,
  -3, 9, 12, 9, 14, 10, 3, 2,
  -6, 3, 13, 19, 7, 10, -3, -9,
  -12, -3, 8, 10, 13, 3, -7, -15,
  -14, -18, -7, -1, 4, -9, -15, -27,
  -23, -9, -23, -5, -9, -16, -5, -17,
];

const MG_ROOK_PST = [
  32, 42, 32, 51, 63, 9, 31, 43,
  27, 32, 58, 62, 80, 67, 26, 44,
  -5, 19, 26, 36, 17, 45, 61, 16,
  -24, -11, 7, 26, 24, 35, -8, -20,
  -36, -26, -12, -1, 9, -7, 6, -23,
  -45, -25, -16, -17, 3, 0, -5, -33,
  -44, -16, -20, -9, -1, 11, -6, -71,
  -19, -13, 1, 17, 16, 7, -37, -26,
];
const EG_ROOK_PST = [
  13, 10, 18, 15, 12, 12, 8, 5,
  11, 13, 13, 11, -3, 3, 8, 3,
  7, 7, 7, 5, 4, -3, -5, -3,
  4, 3, 13, 1, 2, 1, -1, 2,
  3, 5, 8, 4, -5, -6, -8, -11,
  -4, 0, -5, -1, -7, -12, -8, -16,
  -6, -6, 0, 2, -9, -9, -11, -3,
  -9, 2, 3, -1, -5, -13, 4, -20,
];

const MG_QUEEN_PST = [
  -28, 0, 29, 12, 59, 44, 43, 45,
  -24, -39, -5, 1, -16, 57, 28, 54,
  -13, -17, 7, 8, 29, 56, 47, 57,
  -27, -27, -16, -16, -1, 17, -2, 1,
  -9, -26, -9, -10, -2, -4, 3, -3,
  -14, 2, -11, -2, -5, 2, 14, 5,
  -35, -8, 11, 2, 8, 15, -3, 1,
  -1, -18, -9, 10, -15, -25, -31, -50,
];
const EG_QUEEN_PST = [
  -9, 22, 22, 27, 27, 19, 10, 20,
  -17, 20, 32, 41, 58, 25, 30, 0,
  -20, 6, 9, 49, 47, 35, 19, 9,
  3, 22, 24, 45, 57, 40, 57, 36,
  -18, 28, 19, 47, 31, 34, 39, 23,
  -16, -27, 15, 6, 9, 17, 10, 5,
  -22, -23, -30, -16, -16, -23, -36, -32,
  -33, -28, -22, -43, -5, -32, -20, -41,
];

const MG_KING_PST = [
  -65, 23, 16, -15, -56, -34, 2, 13,
  29, -1, -20, -7, -8, -4, -38, -29,
  -9, 24, 2, -16, -20, 6, 22, -22,
  -17, -20, -12, -27, -30, -25, -14, -36,
  -49, -1, -27, -39, -46, -44, -33, -51,
  -14, -14, -22, -46, -44, -30, -15, -27,
  1, 7, -8, -64, -43, -16, 9, 8,
  -15, 36, 12, -54, 8, -28, 24, 14,
];
const EG_KING_PST = [
  -74, -35, -18, -18, -11, 15, 4, -17,
  -12, 17, 14, 17, 17, 38, 23, 11,
  10, 17, 23, 15, 20, 45, 44, 13,
  -8, 22, 24, 27, 26, 33, 26, 3,
  -18, -4, 21, 24, 27, 23, 9, -11,
  -19, -3, 11, 21, 23, 16, 7, -9,
  -27, -11, 4, 13, 14, 4, -5, -17,
  -53, -33, -21, -11, -28, -14, -24, -43,
];

const MG_PSTS = [null, MG_PAWN_PST, MG_KNIGHT_PST, MG_BISHOP_PST, MG_ROOK_PST, MG_QUEEN_PST, MG_KING_PST];
const EG_PSTS = [null, EG_PAWN_PST, EG_KNIGHT_PST, EG_BISHOP_PST, EG_ROOK_PST, EG_QUEEN_PST, EG_KING_PST];

const KNIGHT_DIRS = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_DIRS = [-17, -15, 15, 17];
const ROOK_DIRS = [-16, -1, 1, 16];
const QUEEN_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17];
const KING_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17];

// Deterministic PRNG for Zobrist tables
function makeRng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

const ZOB_PIECE_HI = new Uint32Array(13 * 64);
const ZOB_PIECE_LO = new Uint32Array(13 * 64);
const ZOB_CASTLE_HI = new Uint32Array(16);
const ZOB_CASTLE_LO = new Uint32Array(16);
const ZOB_EP_HI = new Uint32Array(9);
const ZOB_EP_LO = new Uint32Array(9);
let ZOB_TURN_HI = 0;
let ZOB_TURN_LO = 0;

(() => {
  const rng = makeRng(0x9e3779b9);
  for (let i = 0; i < 13 * 64; i++) {
    ZOB_PIECE_HI[i] = rng();
    ZOB_PIECE_LO[i] = rng();
  }
  for (let i = 0; i < 16; i++) {
    ZOB_CASTLE_HI[i] = rng();
    ZOB_CASTLE_LO[i] = rng();
  }
  for (let i = 0; i < 9; i++) {
    ZOB_EP_HI[i] = rng();
    ZOB_EP_LO[i] = rng();
  }
  ZOB_TURN_HI = rng();
  ZOB_TURN_LO = rng();
})();

// Transposition Table (fixed size 131,072 entries -> zero GC pressure)
const TT_SIZE = 1 << 17;
const TT_MASK = TT_SIZE - 1;
const TT_NONE = 0;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

const ttKeyHi = new Uint32Array(TT_SIZE);
const ttKeyLo = new Uint32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);

const MAX_PLY = 48;
const killerMoves = new Int32Array(MAX_PLY * 2);
const historyTable = new Int32Array(13 * 128);

interface UndoState {
  castling: number;
  ep: number;
  capturedPiece: number;
  hashHi: number;
  hashLo: number;
  wKingSq: number;
  bKingSq: number;
}

export class FastBoard {
  public board = new Int8Array(128);
  public turn: FastColor = 1;
  public castling = 0;
  public ep = -1;
  public wKingSq = 0;
  public bKingSq = 0;
  public hashHi = 0;
  public hashLo = 0;
  private undoStack: UndoState[] = [];
  private hashHistoryHi: number[] = [];
  private hashHistoryLo: number[] = [];

  constructor(fen: string) {
    this.loadFen(fen);
  }

  public loadFen(fen: string) {
    this.board.fill(0);
    this.undoStack = [];
    this.hashHistoryHi = [];
    this.hashHistoryLo = [];

    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          c += parseInt(ch, 10);
        } else {
          const sq = (r << 4) | c;
          let p = 0;
          switch (ch) {
            case 'P': p = PAWN; break;
            case 'N': p = KNIGHT; break;
            case 'B': p = BISHOP; break;
            case 'R': p = ROOK; break;
            case 'Q': p = QUEEN; break;
            case 'K': p = KING; this.wKingSq = sq; break;
            case 'p': p = -PAWN; break;
            case 'n': p = -KNIGHT; break;
            case 'b': p = -BISHOP; break;
            case 'r': p = -ROOK; break;
            case 'q': p = -QUEEN; break;
            case 'k': p = -KING; this.bKingSq = sq; break;
          }
          this.board[sq] = p;
          c++;
        }
      }
    }

    this.turn = parts[1] === 'b' ? -1 : 1;
    let cast = 0;
    const castStr = parts[2] || '-';
    if (castStr.includes('K')) cast |= 1;
    if (castStr.includes('Q')) cast |= 2;
    if (castStr.includes('k')) cast |= 4;
    if (castStr.includes('q')) cast |= 8;
    this.castling = cast;

    this.ep = parts[3] && parts[3] !== '-' ? algebraicTo0x88(parts[3]) : -1;
    this.recomputeHash();
  }

  private recomputeHash() {
    let hi = 0;
    let lo = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = (r << 4) | c;
        const p = this.board[sq];
        if (p !== 0) {
          const sq64 = (r << 3) | c;
          const idx = (p + 6) * 64 + sq64;
          hi ^= ZOB_PIECE_HI[idx];
          lo ^= ZOB_PIECE_LO[idx];
        }
      }
    }
    hi ^= ZOB_CASTLE_HI[this.castling];
    lo ^= ZOB_CASTLE_LO[this.castling];
    const epIdx = this.ep >= 0 ? (this.ep & 7) + 1 : 0;
    hi ^= ZOB_EP_HI[epIdx];
    lo ^= ZOB_EP_LO[epIdx];
    if (this.turn === -1) {
      hi ^= ZOB_TURN_HI;
      lo ^= ZOB_TURN_LO;
    }
    this.hashHi = hi >>> 0;
    this.hashLo = lo >>> 0;
  }

  public isSquareAttacked(sq: number, byColor: FastColor): boolean {
    // Pawns
    if (byColor === 1) {
      const pSq1 = sq + 15;
      if ((pSq1 & 0x88) === 0 && this.board[pSq1] === PAWN) return true;
      const pSq2 = sq + 17;
      if ((pSq2 & 0x88) === 0 && this.board[pSq2] === PAWN) return true;
    } else {
      const pSq1 = sq - 15;
      if ((pSq1 & 0x88) === 0 && this.board[pSq1] === -PAWN) return true;
      const pSq2 = sq - 17;
      if ((pSq2 & 0x88) === 0 && this.board[pSq2] === -PAWN) return true;
    }

    // Knights
    const oppKnight = byColor * KNIGHT;
    for (let i = 0; i < 8; i++) {
      const nSq = sq + KNIGHT_DIRS[i];
      if ((nSq & 0x88) === 0 && this.board[nSq] === oppKnight) return true;
    }

    // King
    const oppKing = byColor * KING;
    for (let i = 0; i < 8; i++) {
      const kSq = sq + KING_DIRS[i];
      if ((kSq & 0x88) === 0 && this.board[kSq] === oppKing) return true;
    }

    // Diagonal (Bishop / Queen)
    const oppBishop = byColor * BISHOP;
    const oppQueen = byColor * QUEEN;
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_DIRS[i];
      let cur = sq + d;
      while ((cur & 0x88) === 0) {
        const p = this.board[cur];
        if (p !== 0) {
          if (p === oppBishop || p === oppQueen) return true;
          break;
        }
        cur += d;
      }
    }

    // Orthogonal (Rook / Queen)
    const oppRook = byColor * ROOK;
    for (let i = 0; i < 4; i++) {
      const d = ROOK_DIRS[i];
      let cur = sq + d;
      while ((cur & 0x88) === 0) {
        const p = this.board[cur];
        if (p !== 0) {
          if (p === oppRook || p === oppQueen) return true;
          break;
        }
        cur += d;
      }
    }

    return false;
  }

  public inCheck(color: FastColor = this.turn): boolean {
    const kSq = color === 1 ? this.wKingSq : this.bKingSq;
    return this.isSquareAttacked(kSq, (color === 1 ? -1 : 1) as FastColor);
  }

  public generatePseudoMoves(capturesOnly = false): number[] {
    const moves: number[] = [];
    const us = this.turn;
    const them = -us;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = (r << 4) | c;
        const p = this.board[sq];
        if (p === 0 || (p > 0 ? 1 : -1) !== us) continue;

        const type = p > 0 ? p : -p;

        if (type === PAWN) {
          const dir = us === 1 ? -16 : 16;
          const startRank = us === 1 ? 6 : 1;
          const promoRank = us === 1 ? 0 : 7;

          // Single push & double push
          const fwd1 = sq + dir;
          const fwdRank = fwd1 >> 4;
          if ((fwd1 & 0x88) === 0 && this.board[fwd1] === EMPTY) {
            if (fwdRank === promoRank) {
              moves.push(encMove(sq, fwd1, QUEEN));
              if (!capturesOnly) {
                moves.push(encMove(sq, fwd1, ROOK));
                moves.push(encMove(sq, fwd1, BISHOP));
                moves.push(encMove(sq, fwd1, KNIGHT));
              }
            } else if (!capturesOnly) {
              moves.push(encMove(sq, fwd1));
              if (r === startRank) {
                const fwd2 = fwd1 + dir;
                if (this.board[fwd2] === EMPTY) {
                  moves.push(encMove(sq, fwd2));
                }
              }
            }
          }

          // Captures
          for (const capOff of [dir - 1, dir + 1]) {
            const capSq = sq + capOff;
            if ((capSq & 0x88) !== 0) continue;
            const target = this.board[capSq];
            if (target !== EMPTY && (target > 0 ? 1 : -1) === them) {
              const capType = target > 0 ? target : -target;
              if ((capSq >> 4) === promoRank) {
                moves.push(encMove(sq, capSq, QUEEN, capType));
                if (!capturesOnly) {
                  moves.push(encMove(sq, capSq, ROOK, capType));
                  moves.push(encMove(sq, capSq, BISHOP, capType));
                  moves.push(encMove(sq, capSq, KNIGHT, capType));
                }
              } else {
                moves.push(encMove(sq, capSq, 0, capType));
              }
            } else if (capSq === this.ep) {
              moves.push(encMove(sq, capSq, 0, PAWN, 1));
            }
          }
        } else if (type === KNIGHT) {
          for (let i = 0; i < 8; i++) {
            const to = sq + KNIGHT_DIRS[i];
            if ((to & 0x88) !== 0) continue;
            const target = this.board[to];
            if (target === EMPTY) {
              if (!capturesOnly) moves.push(encMove(sq, to));
            } else if ((target > 0 ? 1 : -1) === them) {
              moves.push(encMove(sq, to, 0, target > 0 ? target : -target));
            }
          }
        } else if (type === KING) {
          for (let i = 0; i < 8; i++) {
            const to = sq + KING_DIRS[i];
            if ((to & 0x88) !== 0) continue;
            const target = this.board[to];
            if (target === EMPTY) {
              if (!capturesOnly) moves.push(encMove(sq, to));
            } else if ((target > 0 ? 1 : -1) === them) {
              moves.push(encMove(sq, to, 0, target > 0 ? target : -target));
            }
          }
          // Castling
          if (!capturesOnly) {
            if (us === 1 && sq === 0x74) {
              if (
                (this.castling & 1) !== 0 &&
                this.board[0x75] === EMPTY &&
                this.board[0x76] === EMPTY &&
                this.board[0x77] === ROOK &&
                !this.isSquareAttacked(0x74, -1) &&
                !this.isSquareAttacked(0x75, -1) &&
                !this.isSquareAttacked(0x76, -1)
              ) {
                moves.push(encMove(0x74, 0x76, 0, 0, 0, 1));
              }
              if (
                (this.castling & 2) !== 0 &&
                this.board[0x73] === EMPTY &&
                this.board[0x72] === EMPTY &&
                this.board[0x71] === EMPTY &&
                this.board[0x70] === ROOK &&
                !this.isSquareAttacked(0x74, -1) &&
                !this.isSquareAttacked(0x73, -1) &&
                !this.isSquareAttacked(0x72, -1)
              ) {
                moves.push(encMove(0x74, 0x72, 0, 0, 0, 1));
              }
            } else if (us === -1 && sq === 0x04) {
              if (
                (this.castling & 4) !== 0 &&
                this.board[0x05] === EMPTY &&
                this.board[0x06] === EMPTY &&
                this.board[0x07] === -ROOK &&
                !this.isSquareAttacked(0x04, 1) &&
                !this.isSquareAttacked(0x05, 1) &&
                !this.isSquareAttacked(0x06, 1)
              ) {
                moves.push(encMove(0x04, 0x06, 0, 0, 0, 1));
              }
              if (
                (this.castling & 8) !== 0 &&
                this.board[0x03] === EMPTY &&
                this.board[0x02] === EMPTY &&
                this.board[0x01] === EMPTY &&
                this.board[0x00] === -ROOK &&
                !this.isSquareAttacked(0x04, 1) &&
                !this.isSquareAttacked(0x03, 1) &&
                !this.isSquareAttacked(0x02, 1)
              ) {
                moves.push(encMove(0x04, 0x02, 0, 0, 0, 1));
              }
            }
          }
        } else {
          const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : QUEEN_DIRS;
          for (let dIdx = 0; dIdx < dirs.length; dIdx++) {
            const d = dirs[dIdx];
            let to = sq + d;
            while ((to & 0x88) === 0) {
              const target = this.board[to];
              if (target === EMPTY) {
                if (!capturesOnly) moves.push(encMove(sq, to));
              } else {
                if ((target > 0 ? 1 : -1) === them) {
                  moves.push(encMove(sq, to, 0, target > 0 ? target : -target));
                }
                break;
              }
              to += d;
            }
          }
        }
      }
    }

    return moves;
  }

  private togglePieceHash(piece: number, sq: number) {
    if (piece === 0) return;
    const sq64 = ((sq >> 4) << 3) | (sq & 7);
    const idx = (piece + 6) * 64 + sq64;
    this.hashHi = (this.hashHi ^ ZOB_PIECE_HI[idx]) >>> 0;
    this.hashLo = (this.hashLo ^ ZOB_PIECE_LO[idx]) >>> 0;
  }

  public makeMove(m: number): boolean {
    const from = moveFrom(m);
    const to = moveTo(m);
    const promo = movePromo(m);
    const isEp = moveIsEp(m);
    const isCastle = moveIsCastle(m);
    const us = this.turn;

    this.undoStack.push({
      castling: this.castling,
      ep: this.ep,
      capturedPiece: this.board[to],
      hashHi: this.hashHi,
      hashLo: this.hashLo,
      wKingSq: this.wKingSq,
      bKingSq: this.bKingSq,
    });
    this.hashHistoryHi.push(this.hashHi);
    this.hashHistoryLo.push(this.hashLo);

    // Clear old EP hash
    const oldEpIdx = this.ep >= 0 ? (this.ep & 7) + 1 : 0;
    this.hashHi = (this.hashHi ^ ZOB_EP_HI[oldEpIdx]) >>> 0;
    this.hashLo = (this.hashLo ^ ZOB_EP_LO[oldEpIdx]) >>> 0;

    // Clear old castling hash
    this.hashHi = (this.hashHi ^ ZOB_CASTLE_HI[this.castling]) >>> 0;
    this.hashLo = (this.hashLo ^ ZOB_CASTLE_LO[this.castling]) >>> 0;

    const moving = this.board[from];
    const cap = this.board[to];

    this.togglePieceHash(moving, from);
    if (cap !== EMPTY) this.togglePieceHash(cap, to);

    this.board[from] = EMPTY;
    const placed = promo ? us * promo : moving;
    this.board[to] = placed;
    this.togglePieceHash(placed, to);

    if (isEp) {
      const epCapSq = us === 1 ? to + 16 : to - 16;
      const epPawn = this.board[epCapSq];
      this.togglePieceHash(epPawn, epCapSq);
      this.board[epCapSq] = EMPTY;
    }

    if (isCastle) {
      let rFrom = 0;
      let rTo = 0;
      if (to === 0x76) { rFrom = 0x77; rTo = 0x75; }
      else if (to === 0x72) { rFrom = 0x70; rTo = 0x73; }
      else if (to === 0x06) { rFrom = 0x07; rTo = 0x05; }
      else { rFrom = 0x00; rTo = 0x03; }
      const rook = this.board[rFrom];
      this.togglePieceHash(rook, rFrom);
      this.board[rFrom] = EMPTY;
      this.board[rTo] = rook;
      this.togglePieceHash(rook, rTo);
    }

    if (moving === KING) this.wKingSq = to;
    else if (moving === -KING) this.bKingSq = to;

    // Update castling rights
    if (from === 0x74 || to === 0x74) this.castling &= ~3;
    if (from === 0x77 || to === 0x77) this.castling &= ~1;
    if (from === 0x70 || to === 0x70) this.castling &= ~2;
    if (from === 0x04 || to === 0x04) this.castling &= ~12;
    if (from === 0x07 || to === 0x07) this.castling &= ~4;
    if (from === 0x00 || to === 0x00) this.castling &= ~8;

    // Update EP square
    this.ep = -1;
    if (moving === PAWN && from - to === 32) this.ep = to + 16;
    else if (moving === -PAWN && to - from === 32) this.ep = to - 16;

    const newEpIdx = this.ep >= 0 ? (this.ep & 7) + 1 : 0;
    this.hashHi = (this.hashHi ^ ZOB_EP_HI[newEpIdx] ^ ZOB_CASTLE_HI[this.castling] ^ ZOB_TURN_HI) >>> 0;
    this.hashLo = (this.hashLo ^ ZOB_EP_LO[newEpIdx] ^ ZOB_CASTLE_LO[this.castling] ^ ZOB_TURN_LO) >>> 0;

    this.turn = (us === 1 ? -1 : 1) as FastColor;

    // Verify legality (own king not left in check)
    const ourKingSq = us === 1 ? this.wKingSq : this.bKingSq;
    if (this.isSquareAttacked(ourKingSq, this.turn)) {
      this.unmakeMove(m);
      return false;
    }
    return true;
  }

  public unmakeMove(m: number) {
    const u = this.undoStack.pop()!;
    this.hashHistoryHi.pop();
    this.hashHistoryLo.pop();

    const us = (this.turn === 1 ? -1 : 1) as FastColor;
    this.turn = us;
    this.castling = u.castling;
    this.ep = u.ep;
    this.hashHi = u.hashHi;
    this.hashLo = u.hashLo;
    this.wKingSq = u.wKingSq;
    this.bKingSq = u.bKingSq;

    const from = moveFrom(m);
    const to = moveTo(m);
    const promo = movePromo(m);

    this.board[from] = promo ? us * PAWN : this.board[to];
    this.board[to] = u.capturedPiece;

    if (moveIsEp(m)) {
      const epCapSq = us === 1 ? to + 16 : to - 16;
      this.board[epCapSq] = -us * PAWN;
    }

    if (moveIsCastle(m)) {
      if (to === 0x76) { this.board[0x77] = ROOK; this.board[0x75] = EMPTY; }
      else if (to === 0x72) { this.board[0x70] = ROOK; this.board[0x73] = EMPTY; }
      else if (to === 0x06) { this.board[0x07] = -ROOK; this.board[0x05] = EMPTY; }
      else { this.board[0x00] = -ROOK; this.board[0x03] = EMPTY; }
    }
  }

  public makeNullMove(): UndoState {
    const state: UndoState = {
      castling: this.castling,
      ep: this.ep,
      capturedPiece: 0,
      hashHi: this.hashHi,
      hashLo: this.hashLo,
      wKingSq: this.wKingSq,
      bKingSq: this.bKingSq,
    };
    const oldEpIdx = this.ep >= 0 ? (this.ep & 7) + 1 : 0;
    this.hashHi = (this.hashHi ^ ZOB_EP_HI[oldEpIdx] ^ ZOB_EP_HI[0] ^ ZOB_TURN_HI) >>> 0;
    this.hashLo = (this.hashLo ^ ZOB_EP_LO[oldEpIdx] ^ ZOB_EP_LO[0] ^ ZOB_TURN_LO) >>> 0;
    this.ep = -1;
    this.turn = (this.turn === 1 ? -1 : 1) as FastColor;
    return state;
  }

  public unmakeNullMove(state: UndoState) {
    this.ep = state.ep;
    this.hashHi = state.hashHi;
    this.hashLo = state.hashLo;
    this.turn = (this.turn === 1 ? -1 : 1) as FastColor;
  }

  public isRepetition(): boolean {
    const len = this.hashHistoryHi.length;
    for (let i = len - 2; i >= 0; i -= 2) {
      if (this.hashHistoryHi[i] === this.hashHi && this.hashHistoryLo[i] === this.hashLo) {
        return true;
      }
    }
    return false;
  }

  public hasNonPawnMaterial(color: FastColor): boolean {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[(r << 4) | c];
        if (p === 0) continue;
        if ((p > 0 ? 1 : -1) === color) {
          const t = p > 0 ? p : -p;
          if (t >= KNIGHT && t <= QUEEN) return true;
        }
      }
    }
    return false;
  }

  public evaluate(style: 'normal' | 'aggressive' = 'normal'): number {
    let mg = 0;
    let eg = 0;
    let phase = 0;

    let wBishops = 0;
    let bBishops = 0;
    const wPawnFiles = [0, 0, 0, 0, 0, 0, 0, 0];
    const bPawnFiles = [0, 0, 0, 0, 0, 0, 0, 0];
    const wMinRow = [8, 8, 8, 8, 8, 8, 8, 8];
    const wMaxRow = [-1, -1, -1, -1, -1, -1, -1, -1];
    const bMinRow = [8, 8, 8, 8, 8, 8, 8, 8];
    const bMaxRow = [-1, -1, -1, -1, -1, -1, -1, -1];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = (r << 4) | c;
        const p = this.board[sq];
        if (p === 0) continue;

        const isW = p > 0;
        const t = isW ? p : -p;
        const pstIdx = isW ? (r << 3) | c : ((7 - r) << 3) | c;
        const mgVal = MG_VALUE[t] + MG_PSTS[t]![pstIdx];
        const egVal = EG_VALUE[t] + EG_PSTS[t]![pstIdx];

        if (isW) {
          mg += mgVal;
          eg += egVal;
          if (t === BISHOP) wBishops++;
          else if (t === PAWN) {
            wPawnFiles[c]++;
            if (r < wMinRow[c]) wMinRow[c] = r;
            if (r > wMaxRow[c]) wMaxRow[c] = r;
          }
        } else {
          mg -= mgVal;
          eg -= egVal;
          if (t === BISHOP) bBishops++;
          else if (t === PAWN) {
            bPawnFiles[c]++;
            if (r < bMinRow[c]) bMinRow[c] = r;
            if (r > bMaxRow[c]) bMaxRow[c] = r;
          }
        }
        phase += PHASE_WEIGHT[t];
      }
    }

    // Bishop pair
    if (wBishops >= 2) { mg += 32; eg += 46; }
    if (bBishops >= 2) { mg -= 32; eg -= 46; }

    // Pawn structure, passed pawns & rook open files
    for (let c = 0; c < 8; c++) {
      if (wPawnFiles[c] > 1) {
        mg -= 12 * (wPawnFiles[c] - 1);
        eg -= 18 * (wPawnFiles[c] - 1);
      }
      if (bPawnFiles[c] > 1) {
        mg += 12 * (bPawnFiles[c] - 1);
        eg += 18 * (bPawnFiles[c] - 1);
      }

      const wIso =
        wPawnFiles[c] > 0 &&
        (c === 0 || wPawnFiles[c - 1] === 0) &&
        (c === 7 || wPawnFiles[c + 1] === 0);
      if (wIso) { mg -= 14; eg -= 16; }

      const bIso =
        bPawnFiles[c] > 0 &&
        (c === 0 || bPawnFiles[c - 1] === 0) &&
        (c === 7 || bPawnFiles[c + 1] === 0);
      if (bIso) { mg += 14; eg += 16; }

      // Passed pawn detection (White advances toward row 0, Black toward row 7)
      if (wMinRow[c] < 8) {
        const wRow = wMinRow[c];
        const oppInFront =
          bMinRow[c] < wRow ||
          (c > 0 && bMinRow[c - 1] < wRow) ||
          (c < 7 && bMinRow[c + 1] < wRow);
        if (!oppInFront) {
          const adv = 7 - wRow; // 1..6
          const bonus = [0, 10, 18, 32, 55, 92, 145, 0][adv];
          mg += bonus >> 1;
          eg += bonus;
        }
      }
      if (bMaxRow[c] >= 0) {
        const bRow = bMaxRow[c];
        const oppInFront =
          wMaxRow[c] > bRow ||
          (c > 0 && wMaxRow[c - 1] > bRow) ||
          (c < 7 && wMaxRow[c + 1] > bRow);
        if (!oppInFront) {
          const adv = bRow; // 1..6
          const bonus = [0, 10, 18, 32, 55, 92, 145, 0][adv];
          mg -= bonus >> 1;
          eg -= bonus;
        }
      }
    }

    // Rook open / semi-open files + king pawn shield
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[(r << 4) | c];
        if (p === ROOK) {
          if (wPawnFiles[c] === 0) {
            const b = bPawnFiles[c] === 0 ? 22 : 12;
            mg += style === 'aggressive' ? b + 6 : b;
            eg += 10;
          }
        } else if (p === -ROOK) {
          if (bPawnFiles[c] === 0) {
            const b = wPawnFiles[c] === 0 ? 22 : 12;
            mg -= style === 'aggressive' ? b + 6 : b;
            eg -= 10;
          }
        }
      }
    }

    // King pawn shield in midgame
    const wkR = this.wKingSq >> 4;
    const wkC = this.wKingSq & 7;
    if (wkR >= 6) {
      for (let dc = -1; dc <= 1; dc++) {
        const fc = wkC + dc;
        if (fc >= 0 && fc < 8) {
          if (this.board[((wkR - 1) << 4) | fc] === PAWN) mg += 16;
          else if (wkR === 7 && this.board[(5 << 4) | fc] === PAWN) mg += 8;
        }
      }
    }
    const bkR = this.bKingSq >> 4;
    const bkC = this.bKingSq & 7;
    if (bkR <= 1) {
      for (let dc = -1; dc <= 1; dc++) {
        const fc = bkC + dc;
        if (fc >= 0 && fc < 8) {
          if (this.board[((bkR + 1) << 4) | fc] === -PAWN) mg -= 16;
          else if (bkR === 0 && this.board[(2 << 4) | fc] === -PAWN) mg -= 8;
        }
      }
    }

    // Endgame mop-up: push losing king to corner & bring winning king closer
    if (phase <= 8 && Math.abs(eg) >= 260) {
      const distKings = Math.abs(wkR - bkR) + Math.abs(wkC - bkC);
      if (eg > 0) {
        const bkEdge = Math.abs(bkR - 3.5) + Math.abs(bkC - 3.5);
        eg += Math.round(bkEdge * 14 + (14 - distKings) * 6);
      } else {
        const wkEdge = Math.abs(wkR - 3.5) + Math.abs(wkC - 3.5);
        eg -= Math.round(wkEdge * 14 + (14 - distKings) * 6);
      }
    }

    // Tempo bonus
    mg += this.turn * 10;
    eg += this.turn * 8;

    const clampedPhase = Math.min(24, phase);
    const total = Math.round((mg * clampedPhase + eg * (24 - clampedPhase)) / 24);
    return this.turn === 1 ? total : -total;
  }
}

// Compact position key (board + turn + castling) for opening book lookup
function fenBookKey(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return `${parts[0]} ${parts[1]} ${parts[2]}`;
}

// Curated strong master-level opening book (SAN choices with weights)
const MASTER_OPENING_BOOK: Record<string, Array<{ san: string; weight: number }>> = {
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq': [
    { san: 'e4', weight: 45 },
    { san: 'd4', weight: 40 },
    { san: 'c4', weight: 10 },
    { san: 'Nf3', weight: 5 },
  ],
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq': [
    { san: 'c5', weight: 42 },
    { san: 'e5', weight: 32 },
    { san: 'c6', weight: 16 },
    { san: 'e6', weight: 10 },
  ],
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq': [
    { san: 'Nf6', weight: 52 },
    { san: 'd5', weight: 40 },
    { san: 'e6', weight: 8 },
  ],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': [
    { san: 'Nf3', weight: 80 },
    { san: 'Nc3', weight: 20 },
  ],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq': [
    { san: 'Nc6', weight: 82 },
    { san: 'Nf6', weight: 18 },
  ],
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq': [
    { san: 'Bb5', weight: 58 },
    { san: 'Bc4', weight: 32 },
    { san: 'd4', weight: 10 },
  ],
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq': [
    { san: 'a6', weight: 65 },
    { san: 'Nf6', weight: 35 },
  ],
  'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq': [
    { san: 'Ba4', weight: 85 },
    { san: 'Bxc6', weight: 15 },
  ],
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq': [
    { san: 'Bc5', weight: 55 },
    { san: 'Nf6', weight: 45 },
  ],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': [
    { san: 'Nf3', weight: 85 },
    { san: 'Nc3', weight: 15 },
  ],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq': [
    { san: 'd6', weight: 45 },
    { san: 'Nc6', weight: 35 },
    { san: 'e6', weight: 20 },
  ],
  'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq': [
    { san: 'd4', weight: 90 },
    { san: 'Bb5+', weight: 10 },
  ],
  'rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq': [
    { san: 'cxd4', weight: 100 },
  ],
  'rnbqkbnr/pp2pppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq': [
    { san: 'Nf6', weight: 100 },
  ],
  'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq': [
    { san: 'Nc3', weight: 100 },
  ],
  'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq': [
    { san: 'a6', weight: 60 },
    { san: 'e6', weight: 25 },
    { san: 'g6', weight: 15 },
  ],
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq': [
    { san: 'c4', weight: 85 },
    { san: 'Nf3', weight: 15 },
  ],
  'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq': [
    { san: 'e6', weight: 52 },
    { san: 'c6', weight: 40 },
    { san: 'dxc4', weight: 8 },
  ],
  'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq': [
    { san: 'c4', weight: 85 },
    { san: 'Nf3', weight: 15 },
  ],
  'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq': [
    { san: 'e6', weight: 50 },
    { san: 'g6', weight: 45 },
    { san: 'c5', weight: 5 },
  ],
  'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': [
    { san: 'd4', weight: 90 },
    { san: 'Nc3', weight: 10 },
  ],
  'rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq': [
    { san: 'd5', weight: 100 },
  ],
  'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': [
    { san: 'd4', weight: 100 },
  ],
  'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq': [
    { san: 'd5', weight: 100 },
  ],
};

export function pickBookMoveSan(fen: string, preferredAggression = false): string | null {
  const entries = MASTER_OPENING_BOOK[fenBookKey(fen)];
  if (!entries || entries.length === 0) return null;
  if (preferredAggression && entries.some((e) => e.san === 'Nc3' || e.san === 'c5' || e.san === 'e4')) {
    const aggressive = entries.filter((e) => e.san === 'Nc3' || e.san === 'c5' || e.san === 'e4' || e.san === 'Bc4');
    if (aggressive.length > 0 && Math.random() < 0.7) {
      return aggressive[Math.floor(Math.random() * aggressive.length)].san;
    }
  }
  const total = entries.reduce((acc, e) => acc + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.san;
  }
  return entries[0].san;
}

export interface SearchConfig {
  maxDepth: number;
  budgetMs: number;
  quiescencePlies: number;
  style?: 'normal' | 'aggressive';
}

export interface RootSearchResult {
  bestFrom: string;
  bestTo: string;
  bestPromo?: 'n' | 'b' | 'r' | 'q';
  scoreCp: number;
  ranked: Array<{
    from: string;
    to: string;
    promo?: 'n' | 'b' | 'r' | 'q';
    scoreCp: number;
  }>;
  reachedDepth: number;
}

export function searchBestMoves(fen: string, config: SearchConfig): RootSearchResult | null {
  const fb = new FastBoard(fen);
  const style = config.style ?? 'normal';
  const deadline = Date.now() + config.budgetMs;
  let nodes = 0;
  let timedOut = false;

  killerMoves.fill(0);
  // Decay history slightly rather than zeroing completely, or clear cleanly for determinism
  historyTable.fill(0);

  const checkTime = () => {
    nodes++;
    if ((nodes & 1023) === 0 && Date.now() >= deadline) {
      timedOut = true;
    }
  };

  const scoreMove = (m: number, ply: number, ttBest: number): number => {
    if (m === ttBest) return 10_000_000;
    const cap = moveCap(m);
    const promo = movePromo(m);
    if (cap > 0 || promo > 0) {
      const attacker = Math.abs(fb.board[moveFrom(m)]);
      return 1_000_000 + cap * 100 - attacker + promo * 80;
    }
    const kBase = ply < MAX_PLY ? ply * 2 : 0;
    if (ply < MAX_PLY) {
      if (m === killerMoves[kBase]) return 900_000;
      if (m === killerMoves[kBase + 1]) return 800_000;
    }
    const pieceIdx = fb.board[moveFrom(m)] + 6;
    return historyTable[pieceIdx * 128 + moveTo(m)];
  };

  const orderMovesList = (moves: number[], ply: number, ttBest = 0) => {
    const scores = new Int32Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      scores[i] = scoreMove(moves[i], ply, ttBest);
    }
    // Simple in-place selection/insertion sort (fast for <= 60 moves)
    for (let i = 1; i < moves.length; i++) {
      const m = moves[i];
      const s = scores[i];
      let j = i - 1;
      while (j >= 0 && scores[j] < s) {
        moves[j + 1] = moves[j];
        scores[j + 1] = scores[j];
        j--;
      }
      moves[j + 1] = m;
      scores[j + 1] = s;
    }
  };

  const quiescence = (alpha: number, beta: number, qPly: number): number => {
    checkTime();
    if (timedOut) return 0;

    const standPat = fb.evaluate(style);
    if (qPly <= 0) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const captures = fb.generatePseudoMoves(true);
    orderMovesList(captures, MAX_PLY - 1);

    for (let i = 0; i < captures.length; i++) {
      const m = captures[i];
      // Delta pruning for hopeless captures (skip if even capturing + 200cp can't raise alpha)
      const cap = moveCap(m);
      if (cap > 0 && movePromo(m) === 0 && standPat + MG_VALUE[cap] + 220 < alpha) {
        continue;
      }
      if (!fb.makeMove(m)) continue;
      const score = -quiescence(-beta, -alpha, qPly - 1);
      fb.unmakeMove(m);
      if (timedOut) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  const alphaBeta = (
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    allowNull: boolean
  ): number => {
    checkTime();
    if (timedOut) return 0;

    if (ply > 0 && fb.isRepetition()) {
      return 0;
    }

    const inChk = fb.inCheck();
    let effectiveDepth = depth;
    if (inChk && ply < 24) {
      effectiveDepth += 1;
    }

    if (effectiveDepth <= 0) {
      return config.quiescencePlies > 0
        ? quiescence(alpha, beta, config.quiescencePlies)
        : fb.evaluate(style);
    }

    const ttIdx = (fb.hashLo ^ fb.hashHi) & TT_MASK;
    let ttBest = 0;
    if (
      ttKeyHi[ttIdx] === fb.hashHi &&
      ttKeyLo[ttIdx] === fb.hashLo &&
      ttFlag[ttIdx] !== TT_NONE
    ) {
      ttBest = ttMove[ttIdx];
      if (ttDepth[ttIdx] >= effectiveDepth && ply > 0) {
        const sc = ttScore[ttIdx];
        const flag = ttFlag[ttIdx];
        if (flag === TT_EXACT) return sc;
        if (flag === TT_LOWER && sc >= beta) return sc;
        if (flag === TT_UPPER && sc <= alpha) return sc;
      }
    }

    // Null-Move Pruning
    if (
      allowNull &&
      effectiveDepth >= 3 &&
      !inChk &&
      ply > 0 &&
      fb.hasNonPawnMaterial(fb.turn)
    ) {
      const nullState = fb.makeNullMove();
      const r = effectiveDepth >= 6 ? 3 : 2;
      const nullScore = -alphaBeta(effectiveDepth - 1 - r, -beta, -beta + 1, ply + 1, false);
      fb.unmakeNullMove(nullState);
      if (timedOut) return 0;
      if (nullScore >= beta) return beta;
    }

    const moves = fb.generatePseudoMoves(false);
    orderMovesList(moves, ply, ttBest);

    let legalCount = 0;
    let bestLocalMove = 0;
    let bestScore = -INF;
    const origAlpha = alpha;

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (!fb.makeMove(m)) continue;
      legalCount++;

      let score: number;
      const isQuiet = moveCap(m) === 0 && movePromo(m) === 0;

      // Principal Variation Search + Late Move Reductions (LMR)
      if (legalCount === 1) {
        score = -alphaBeta(effectiveDepth - 1, -beta, -alpha, ply + 1, true);
      } else {
        let reduction = 0;
        if (effectiveDepth >= 3 && legalCount >= 4 && isQuiet && !inChk && !fb.inCheck()) {
          reduction = legalCount >= 10 && effectiveDepth >= 5 ? 2 : 1;
        }
        score = -alphaBeta(effectiveDepth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (!timedOut && score > alpha && (reduction > 0 || score < beta)) {
          score = -alphaBeta(effectiveDepth - 1, -beta, -alpha, ply + 1, true);
        }
      }

      fb.unmakeMove(m);
      if (timedOut) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestLocalMove = m;
      }
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) {
          if (isQuiet && ply < MAX_PLY) {
            const kBase = ply * 2;
            if (killerMoves[kBase] !== m) {
              killerMoves[kBase + 1] = killerMoves[kBase];
              killerMoves[kBase] = m;
            }
            const pieceIdx = fb.board[moveFrom(m)] + 6;
            historyTable[pieceIdx * 128 + moveTo(m)] += effectiveDepth * effectiveDepth;
          }
          break;
        }
      }
    }

    if (legalCount === 0) {
      return inChk ? -MATE_SCORE + ply : 0;
    }

    // Store in TT (normalize mate scores relative to current ply? skip mate normalization safely for depth < 12 or store exact)
    if (Math.abs(bestScore) < MATE_SCORE - 100) {
      ttKeyHi[ttIdx] = fb.hashHi;
      ttKeyLo[ttIdx] = fb.hashLo;
      ttDepth[ttIdx] = effectiveDepth;
      ttMove[ttIdx] = bestLocalMove;
      ttScore[ttIdx] = bestScore;
      ttFlag[ttIdx] =
        bestScore <= origAlpha ? TT_UPPER : bestScore >= beta ? TT_LOWER : TT_EXACT;
    }

    return bestScore;
  };

  // Generate strictly legal root moves first
  const pseudoRoot = fb.generatePseudoMoves(false);
  const legalRoot: number[] = [];
  for (let i = 0; i < pseudoRoot.length; i++) {
    const m = pseudoRoot[i];
    if (fb.makeMove(m)) {
      legalRoot.push(m);
      fb.unmakeMove(m);
    }
  }
  if (legalRoot.length === 0) return null;

  let rootScores = legalRoot.map((m) => ({ move: m, score: 0 }));
  let reachedDepth = 0;

  // Iterative deepening (keeps ONLY fully completed depth results so timeouts never corrupt scores)
  for (let depth = 1; depth <= config.maxDepth; depth++) {
    timedOut = false;
    const nextScores: Array<{ move: number; score: number }> = [];
    let alpha = -INF;
    const beta = INF;

    for (let i = 0; i < rootScores.length; i++) {
      const m = rootScores[i].move;
      fb.makeMove(m);
      let score: number;
      if (i === 0) {
        score = -alphaBeta(depth - 1, -beta, -alpha, 1, true);
      } else {
        score = -alphaBeta(depth - 1, -alpha - 1, -alpha, 1, true);
        if (!timedOut && score > alpha) {
          score = -alphaBeta(depth - 1, -beta, -alpha, 1, true);
        }
      }
      fb.unmakeMove(m);

      if (timedOut) break;
      nextScores.push({ move: m, score });
      if (score > alpha) {
        alpha = score;
      }
    }

    if (timedOut) {
      // Keep the completed previous depth's ordering unless depth 1 timed out (never happens)
      break;
    }

    nextScores.sort((a, b) => b.score - a.score);
    rootScores = nextScores;
    reachedDepth = depth;

    // Early stop if forced checkmate found
    if (rootScores[0].score >= MATE_SCORE - 50) {
      break;
    }
    if (Date.now() >= deadline) {
      break;
    }
  }

  const best = rootScores[0];
  return {
    bestFrom: sq0x88ToAlgebraic(moveFrom(best.move)),
    bestTo: sq0x88ToAlgebraic(moveTo(best.move)),
    bestPromo: fastMovePromoChar(best.move),
    scoreCp: best.score,
    ranked: rootScores.map((r) => ({
      from: sq0x88ToAlgebraic(moveFrom(r.move)),
      to: sq0x88ToAlgebraic(moveTo(r.move)),
      promo: fastMovePromoChar(r.move),
      scoreCp: r.score,
    })),
    reachedDepth,
  };
}
