// Правила Сёги (японские шахматы) и их малых вариантов: мини-сёги 5×5 и киото-сёги.
// Семантика совпадает с вариантами "shogi", "minishogi" и "kyotoshogi" движка Fairy-Stockfish.
// Сёги: сброс взятых фигур, превращение в трёх дальних горизонталях, запрет двух пешек на вертикали (нифу) и фигур
// без ходов; мат сбросом пешки (утифудзумэ) проигрывает поставившему его; нет ходов — поражение; четырёхкратное
// повторение (сэннититэ) — ничья, а при вечном шахе проигрывает шахующий.
// Мини-сёги: доска 5×5, зона превращения — одна дальняя горизонталь, сэннититэ — поражение сэнтэ.
// Киото-сёги: доска 5×5, каждая фигура, кроме короля, после каждого хода переворачивается на другую сторону
// (стрелка ↔ токин, серебро ↔ слон, конь ↔ золото, пешка ↔ ладья); сбросить фигуру можно любой стороной;
// нифу, запрета фигур без ходов и запрета мата сбросом пешки нет.
import {
  colorOf,
  opposite,
  perpetualCheck,
  repetitionCount,
  typeOf,
  type Board,
  type Color,
  type GameId,
  type GameResult,
  type Hand,
  type HistoryEntry,
  type Move,
  type Piece,
  type PieceInfo,
  type Position,
  type Variant,
} from './types';

/** Как ходит фигура. */
export type ShogiGait = 'king' | 'gold' | 'silver' | 'knight' | 'lance' | 'pawn' | 'rook' | 'bishop' | 'dragon' | 'horse';

export interface ShogiRules {
  id: GameId;
  engine: string;
  name: string;
  subtitle: string;
  mark: string;
  size: number;
  startFen: string;
  pieces: Record<string, PieceInfo>;
  values: Record<string, number>;
  /** Тип фигуры (с «+» у перевёрнутых) → как она ходит. */
  gaits: Record<string, ShogiGait>;
  /** Порядок фигур в руке: от сильных к слабым. */
  handOrder: readonly string[];
  /** Глубина зоны превращения в горизонталях. */
  zone: number;
  /** Киото-сёги: каждый ход переворачивает фигуру, сброс любой стороной. */
  kyoto?: boolean;
  /** Нифу, запрет фигур без ходов и мата сбросом пешки (обычные правила сёги). */
  classicDrops: boolean;
  /** Итог сэннититэ без вечного шаха. */
  repetition: 'draw' | 'sente-loses';
  endReasons: Variant['endReasons'];
}

export const SIZE = 9;
export const SHOGI_START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[] w - - 0 1';
/** Порядок фигур в руке: от сильных к слабым. */
export const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'] as const;
const ENGINE_FILES = 'abcdefghi';
const RANK_LETTERS = 'abcdefghi';
const KANJI_DIGITS = '一二三四五六七八九';

export const SHOGI_PIECES: Record<string, PieceInfo> = {
  K: { ru: 'Король', short: 'Кр', acc: 'короля', ins: 'королём', native: '王/玉' },
  R: { ru: 'Ладья', short: 'Л', acc: 'ладью', ins: 'ладьёй', native: '飛' },
  B: { ru: 'Слон', short: 'С', acc: 'слона', ins: 'слоном', native: '角' },
  G: { ru: 'Золотой генерал', short: 'З', acc: 'золотого генерала', ins: 'золотым генералом', native: '金' },
  S: { ru: 'Серебряный генерал', short: 'Се', acc: 'серебряного генерала', ins: 'серебряным генералом', native: '銀' },
  N: { ru: 'Конь', short: 'К', acc: 'коня', ins: 'конём', native: '桂' },
  L: { ru: 'Стрелка', short: 'Ст', acc: 'стрелку', ins: 'стрелкой', native: '香' },
  P: { ru: 'Пешка', short: 'П', acc: 'пешку', ins: 'пешкой', native: '歩' },
  '+R': { ru: 'Дракон', short: 'Д', acc: 'дракона', ins: 'драконом', native: '龍' },
  '+B': { ru: 'Лошадь', short: 'Лш', acc: 'лошадь', ins: 'лошадью', native: '馬' },
  '+S': { ru: 'Превращённое серебро', short: '+Се', acc: 'превращённое серебро', ins: 'превращённым серебром', native: '全' },
  '+N': { ru: 'Превращённый конь', short: '+К', acc: 'превращённого коня', ins: 'превращённым конём', native: '圭' },
  '+L': { ru: 'Превращённая стрелка', short: '+Ст', acc: 'превращённую стрелку', ins: 'превращённой стрелкой', native: '杏' },
  '+P': { ru: 'Токин', short: 'Т', acc: 'токин', ins: 'токином', native: 'と' },
};

/** Ценность фигур (обычная оценка любителей). */
export const SHOGI_VALUES: Record<string, number> = {
  K: 0, R: 10, B: 8, G: 6, S: 5, N: 4, L: 3, P: 1,
  '+R': 12, '+B': 10, '+S': 6, '+N': 6, '+L': 6, '+P': 6,
};

const SHOGI_GAITS: Record<string, ShogiGait> = {
  K: 'king', R: 'rook', B: 'bishop', G: 'gold', S: 'silver', N: 'knight', L: 'lance', P: 'pawn',
  '+R': 'dragon', '+B': 'horse', '+S': 'gold', '+N': 'gold', '+L': 'gold', '+P': 'gold',
};

export const isPromoted = (p: Piece) => p.startsWith('+');
/** Тип без превращения: «+P» → «P». */
export const baseType = (p: Piece) => typeOf(p).replace('+', '');

const KING_STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** Шаги для стороны, идущей «вверх» (dr = +1 — вперёд). */
const GOLD_STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]];
const SILVER_STEPS: [number, number][] = [[0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const ORTHO: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Правила и запись для игры семейства сёги. */
export function makeShogi(rules: ShogiRules) {
  const SIZE = rules.size;
  const { gaits: GAITS, handOrder: HAND } = rules;
  /** Типы, у которых есть перевёрнутая сторона. */
  const PROMOTABLE = new Set(Object.keys(GAITS).filter((t) => GAITS['+' + t]));

  const sq = (f: number, r: number) => r * SIZE + f;
  const fileOf = (s: number) => s % SIZE;
  const rankOf = (s: number) => Math.floor(s / SIZE);
  const onBoard = (f: number, r: number) => f >= 0 && f < SIZE && r >= 0 && r < SIZE;

  /** Поле в японской записи: вертикали 1–9 справа налево, горизонтали a–i сверху вниз (со стороны сэнтэ). */
  function squareName(s: number) {
    return `${SIZE - fileOf(s)}${RANK_LETTERS[SIZE - 1 - rankOf(s)]}`;
  }
  function engineSquare(s: number) {
    return ENGINE_FILES[fileOf(s)] + (rankOf(s) + 1);
  }
  function parseEngineSquare(name: string) {
    const f = ENGINE_FILES.indexOf(name[0]);
    const r = parseInt(name.slice(1), 10) - 1;
    if (f < 0 || !(r >= 0 && r < SIZE)) throw new Error(`Неверное поле: ${name}`);
    return sq(f, r);
  }

  // ---------- FEN ----------

  function parseFen(fen: string): Position {
    const parts = fen.trim().split(/\s+/);
    let placement = parts[0];
    let handStr = '';
    const br = /\[([^\]]*)\]$/.exec(placement);
    if (br) {
      handStr = br[1];
      placement = placement.slice(0, br.index);
    }
    const rows = placement.split('/');
    if (rows.length !== SIZE) throw new Error(`FEN: должно быть ${SIZE} рядов`);
    const board: Board = new Array(SIZE * SIZE).fill(null);
    rows.forEach((row, i) => {
      const rank = SIZE - 1 - i;
      let file = 0;
      const re = /(\d+)|(\+?[a-zA-Z])/g;
      let t: RegExpExecArray | null;
      while ((t = re.exec(row))) {
        if (t[1]) file += parseInt(t[1], 10);
        else {
          const p = t[2];
          if (!GAITS[typeOf(p)]) throw new Error(`FEN: неизвестная фигура ${p}`);
          board[sq(file, rank)] = p;
          file++;
        }
      }
      if (file !== SIZE) throw new Error(`FEN: ряд ${rank + 1} неполный`);
    });
    const hands: Record<Color, Hand> = { w: {}, b: {} };
    if (handStr && handStr !== '-') {
      const re = /(\d*)([a-zA-Z])/g;
      let t: RegExpExecArray | null;
      while ((t = re.exec(handStr))) {
        const c: Color = t[2] === t[2].toUpperCase() ? 'w' : 'b';
        const k = t[2].toUpperCase();
        hands[c][k] = (hands[c][k] ?? 0) + (t[1] ? parseInt(t[1], 10) : 1);
      }
    }
    // После расстановки идут сторона, (поля рокировки и взятия на проходе) и счётчики.
    const rest = parts.slice(1);
    const turn = rest[0] === 'b' ? 'b' : 'w';
    const nums = rest.slice(1).filter((x) => /^\d+$/.test(x));
    const half = nums.length >= 2 ? parseInt(nums[nums.length - 2], 10) : 0;
    const full = nums.length >= 1 ? parseInt(nums[nums.length - 1], 10) : 1;
    return { board, turn, halfmove: half || 0, fullmove: full || 1, hands };
  }

  function handString(hands: Record<Color, Hand> | undefined) {
    let s = '';
    for (const c of ['w', 'b'] as const) {
      for (const t of HAND_ORDER) {
        const n = hands?.[c][t] ?? 0;
        const ch = c === 'w' ? t : t.toLowerCase();
        s += ch.repeat(n);
      }
    }
    return s;
  }

  function toFen(pos: Position): string {
    const rows: string[] = [];
    for (let r = SIZE - 1; r >= 0; r--) {
      let row = '';
      let empty = 0;
      for (let f = 0; f < SIZE; f++) {
        const p = pos.board[sq(f, r)];
        if (!p) empty++;
        else {
          if (empty) row += empty;
          empty = 0;
          row += p;
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return `${rows.join('/')}[${handString(pos.hands)}] ${pos.turn} - - ${pos.halfmove} ${pos.fullmove}`;
  }

  function targets(board: Board, from: number): number[] {
    const p = board[from]!;
    const us = colorOf(p);
    const dir = us === 'w' ? 1 : -1;
    const f0 = fileOf(from), r0 = rankOf(from);
    const out: number[] = [];
    const step = (df: number, dr: number) => {
      const f = f0 + df, r = r0 + dr * dir;
      if (!onBoard(f, r)) return;
      const t = board[sq(f, r)];
      if (t && colorOf(t) === us) return;
      out.push(sq(f, r));
    };
    const slide = (df: number, dr: number) => {
      let f = f0 + df, r = r0 + dr * dir;
      while (onBoard(f, r)) {
        const t = board[sq(f, r)];
        if (t) {
          if (colorOf(t) !== us) out.push(sq(f, r));
          break;
        }
        out.push(sq(f, r));
        f += df;
        r += dr * dir;
      }
    };
    switch (GAITS[typeOf(p)]) {
      case 'king':
        KING_STEPS.forEach(([a, b]) => step(a, b));
        break;
      case 'gold':
        GOLD_STEPS.forEach(([a, b]) => step(a, b));
        break;
      case 'silver':
        SILVER_STEPS.forEach(([a, b]) => step(a, b));
        break;
      case 'knight':
        step(1, 2);
        step(-1, 2);
        break;
      case 'lance':
        slide(0, 1);
        break;
      case 'pawn':
        step(0, 1);
        break;
      case 'rook':
        ORTHO.forEach(([a, b]) => slide(a, b));
        break;
      case 'bishop':
        DIAG.forEach(([a, b]) => slide(a, b));
        break;
      case 'dragon':
        ORTHO.forEach(([a, b]) => slide(a, b));
        DIAG.forEach(([a, b]) => step(a, b));
        break;
      case 'horse':
        DIAG.forEach(([a, b]) => slide(a, b));
        ORTHO.forEach(([a, b]) => step(a, b));
        break;
    }
    return out;
  }

  const attacksFrom = (board: Board, from: number) => (board[from] ? targets(board, from) : []);

  function findKing(board: Board, c: Color) {
    return board.indexOf(c === 'w' ? 'K' : 'k');
  }

  function isAttacked(board: Board, target: number, by: Color) {
    for (let s = 0; s < board.length; s++) {
      const p = board[s];
      if (p && colorOf(p) === by && targets(board, s).includes(target)) return true;
    }
    return false;
  }

  function kingInCheck(board: Board, c: Color) {
    const k = findKing(board, c);
    return k >= 0 && isAttacked(board, k, opposite(c));
  }

  /** Горизонталь, считая от стороны `c`: 0 — своя первая. */
  const relRank = (r: number, c: Color) => (c === 'w' ? r : SIZE - 1 - r);
  const inZone = (r: number, c: Color) => relRank(r, c) >= SIZE - rules.zone;

  /** Есть ли у фигуры хоть один ход с этого поля (на пустой доске) — иначе ход или сброс туда запрещён. */
  function canMoveFrom(t: string, r: number, c: Color) {
    if (!rules.classicDrops) return true;
    const rr = relRank(r, c);
    if (t === 'P' || t === 'L') return rr <= SIZE - 2;
    if (t === 'N') return rr <= SIZE - 3;
    return true;
  }

  function applyMove(pos: Position, m: Move): Position {
    const board = pos.board.slice();
    const us = pos.turn;
    const hands: Record<Color, Hand> = { w: { ...pos.hands?.w }, b: { ...pos.hands?.b } };
    let capture = false;
    if (m.from < 0) {
      const t = m.drop!;
      const placed = (m.promo ? '+' : '') + t;
      board[m.to] = us === 'w' ? placed : placed.toLowerCase();
      hands[us][t] = (hands[us][t] ?? 0) - 1;
      if (!hands[us][t]) delete hands[us][t];
    } else {
      const p = board[m.from]!;
      const cap = board[m.to];
      if (cap) {
        capture = true;
        const t = baseType(cap);
        hands[us][t] = (hands[us][t] ?? 0) + 1;
      }
      board[m.to] = m.promo ? '+' + p : m.demote ? p.replace('+', '') : p;
      board[m.from] = null;
    }
    return {
      board,
      turn: opposite(us),
      halfmove: capture ? 0 : pos.halfmove + 1,
      fullmove: us === 'b' ? pos.fullmove + 1 : pos.fullmove,
      hands,
    };
  }

  function pseudoMoves(pos: Position): Move[] {
    const { board, turn: us } = pos;
    const out: Move[] = [];
    for (let s = 0; s < board.length; s++) {
      const p = board[s];
      if (!p || colorOf(p) !== us) continue;
      const t = typeOf(p);
      for (const to of targets(board, s)) {
        if (rules.kyoto) {
          // Каждый ход, кроме хода короля, переворачивает фигуру.
          out.push(isPromoted(t) ? { from: s, to, demote: true } : PROMOTABLE.has(t) ? { from: s, to, promo: true } : { from: s, to });
          continue;
        }
        const canPromote = PROMOTABLE.has(t) && (inZone(rankOf(s), us) || inZone(rankOf(to), us));
        if (canPromote) out.push({ from: s, to, promo: true });
        if (canMoveFrom(t, rankOf(to), us)) out.push({ from: s, to });
      }
    }
    const hand = pos.hands?.[us] ?? {};
    const pawnFiles = new Set<number>();
    for (let s = 0; s < board.length; s++) if (board[s] === (us === 'w' ? 'P' : 'p')) pawnFiles.add(fileOf(s));
    for (const t of HAND) {
      if (!hand[t]) continue;
      for (let s = 0; s < board.length; s++) {
        if (board[s] || !canMoveFrom(t, rankOf(s), us)) continue;
        if (rules.classicDrops && t === 'P' && pawnFiles.has(fileOf(s))) continue;
        if (rules.kyoto) out.push({ from: -1, to: s, drop: t, promo: true });
        out.push({ from: -1, to: s, drop: t });
      }
    }
    return out;
  }

  /**
   * Легальные ходы. Мат сбросом пешки (утифудзумэ) здесь не запрещается: как и в Fairy-Stockfish,
   * такой ход возможен, но сделавший его проигрывает (см. result).
   */
  function legalMoves(pos: Position): Move[] {
    const us = pos.turn;
    return pseudoMoves(pos).filter((m) => !kingInCheck(applyMove(pos, m).board, us));
  }

  function makeMove(pos: Position, m: Move): Position {
    return applyMove(pos, m);
  }

  function moveToUci(m: Move): string {
    if (m.from < 0) return `${m.promo ? '+' : ''}${m.drop}@${engineSquare(m.to)}`;
    return engineSquare(m.from) + engineSquare(m.to) + (m.promo ? '+' : m.demote ? '-' : '');
  }

  function uciToMove(uci: string): Move {
    const d = /^(\+?)([A-Z])@([a-i][1-9])$/.exec(uci);
    if (d) return { from: -1, to: parseEngineSquare(d[3]), drop: d[2], ...(d[1] ? { promo: true } : {}) };
    const m = /^([a-i][1-9])([a-i][1-9])([+-]?)$/.exec(uci);
    if (!m) throw new Error(`Неверный ход: ${uci}`);
    return { from: parseEngineSquare(m[1]), to: parseEngineSquare(m[2]), ...(m[3] === '+' ? { promo: true } : m[3] === '-' ? { demote: true } : {}) };
  }

  function positionKey(pos: Position) {
    return pos.board.map((p) => p ?? '.').join(',') + pos.turn + handString(pos.hands);
  }

  function result(start: Position, history: HistoryEntry[]): GameResult | null {
    const n = history.length;
    const pos = n ? history[n - 1].pos : start;
    if (legalMoves(pos).length === 0) {
      const check = kingInCheck(pos.board, pos.turn);
      // Мат сбросом пешки запрещён: проигрывает тот, кто его поставил.
      if (check && rules.classicDrops && n > 0 && history[n - 1].move.drop === 'P' && !history[n - 1].move.promo) return { winner: pos.turn, reason: 'pawn-drop-mate' };
      return { winner: opposite(pos.turn), reason: check ? 'checkmate' : 'stalemate' };
    }
    if (n >= 6) {
      const { count, firstIdx } = repetitionCount(start, history, positionKey, false);
      if (count >= 4) {
        const w = perpetualCheck(history, firstIdx, pos.turn);
        if (w) return { winner: w, reason: 'perpetual-check' };
        return { winner: rules.repetition === 'sente-loses' ? 'b' : null, reason: 'repetition' };
      }
    }
    return null;
  }

  return { sq, fileOf, rankOf, squareName, engineSquare, parseEngineSquare, parseFen, toFen, handString, attacksFrom, findKing, kingInCheck, legalMoves, makeMove, moveToUci, uciToMove, positionKey, result, inZone, PROMOTABLE, SIZE };
}

/** Вариант семейства сёги для приложения. */
export function shogiVariant(rules: ShogiRules, extra: { sides?: Record<Color, string>; sidesGen?: Record<Color, string>; group: Variant['group']; promoHint: string }): Variant {
  const g = makeShogi(rules);
  const { PROMOTABLE, inZone, SIZE } = g;
  return {
    id: rules.id,
    family: 'shogi',
    group: extra.group,
    engine: rules.engine,
    name: rules.name,
    subtitle: rules.subtitle,
    mark: rules.mark,
    files: SIZE,
    ranks: SIZE,
    startFen: rules.startFen,
    sides: extra.sides ?? { w: 'Сэнтэ', b: 'Готэ' },
    sidesGen: extra.sidesGen ?? { w: 'сэнтэ', b: 'готэ' },
    kingAcc: 'короля',
    hasPass: false,
    hasHands: true,
    handOrder: rules.handOrder,
    promoHint: extra.promoHint,
    hasPoints: false,
    board: 'cells',
    pluralSides: false,
    hasGlyphs: true,
    moveLimitPlies: 0,
    parseFen: g.parseFen,
    toFen: g.toFen,
    legalMoves: g.legalMoves,
    makeMove: g.makeMove,
    inCheck: (pos) => g.kingInCheck(pos.board, pos.turn),
    kingSquare: g.findKing,
    attacksFrom: g.attacksFrom,
    moveToUci: g.moveToUci,
    uciToMove: g.uciToMove,
    squareName: g.squareName,
    engineSquare: g.engineSquare,
    parseSquare: g.parseEngineSquare,
    fileLabels: Array.from({ length: SIZE }, (_, f) => String(SIZE - f)),
    rankLabels: Array.from({ length: SIZE }, (_, r) => KANJI_DIGITS[SIZE - 1 - r]),
    pieceInfo: (p) => rules.pieces[typeOf(p)],
    pieceValue: (p) => rules.values[typeOf(p)] ?? 0,
    formatMove(h) {
      const m = h.move;
      if (m.from < 0) return `${rules.pieces[(m.promo ? '+' : '') + m.drop!].short}*${g.squareName(m.to)}`;
      const name = rules.pieces[typeOf(h.piece)].short;
      const sep = h.captured ? '×' : '–';
      let suffix = '';
      if (rules.kyoto) suffix = m.promo || m.demote ? '↻' : '';
      else if (m.promo) suffix = '+';
      else if (PROMOTABLE.has(typeOf(h.piece)) && (inZone(g.rankOf(m.from), colorOf(h.piece)) || inZone(g.rankOf(m.to), colorOf(h.piece)))) suffix = '=';
      return `${name} ${g.squareName(m.from)}${sep}${g.squareName(m.to)}${suffix}`;
    },
    result: g.result,
    positionKey: g.positionKey,
    endReasons: rules.endReasons,
  };
}

const SHOGI_RULES: ShogiRules = {
  id: 'shogi',
  engine: 'shogi',
  name: 'Сёги',
  subtitle: 'японские шахматы',
  mark: '王',
  size: SIZE,
  startFen: SHOGI_START,
  pieces: SHOGI_PIECES,
  values: SHOGI_VALUES,
  gaits: SHOGI_GAITS,
  handOrder: HAND_ORDER,
  zone: 3,
  classicDrops: true,
  repetition: 'draw',
  endReasons: {
    checkmate: 'Мат (цуми)',
    stalemate: 'Нет ходов — это поражение',
    'pawn-drop-mate': 'Мат сбросом пешки (утифудзумэ) запрещён: поставивший его проигрывает',
    repetition: 'Четырёхкратное повторение позиции (сэннититэ): ничья',
    'perpetual-check': 'Вечный шах при повторении запрещён: проигрывает шахующий',
    resign: 'Сдача',
  },
};

const std = makeShogi(SHOGI_RULES);
export const { sq, fileOf, rankOf, squareName, engineSquare, parseEngineSquare, parseFen, toFen, handString, attacksFrom, findKing, kingInCheck, legalMoves, makeMove, moveToUci, uciToMove, positionKey } = std;

export const SHOGI: Variant = shogiVariant(SHOGI_RULES, {
  group: 'main',
  promoHint: 'Фигура ходит в зоне превращения (три дальние горизонтали). Превращаться необязательно, но обычно выгодно.',
});
