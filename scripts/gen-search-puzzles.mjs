// Задачи без движка: полный перебор по правилам приложения (Макрук, Шатрандж, Ок, Ситтуйин, мини-сёги,
// киото-сёги, маньчжурские шахматы). Перебираются случайные позиции с небольшим числом фигур, в них ищутся
//  - маты в 1 и 2 хода (полный перебор ходов) и маты в 3 хода, где каждый ход решающего — шах;
//  - выигрыш материала: перебор на 3 полухода с продолжением взятий до затишья.
// Каждое решение проверяется на единственность: на каждом ходе решающего есть только один выигрывающий ход.
// Использование: node scripts/gen-search-puzzles.mjs <игра> [секунд] [выход.json]
// Цели задаются переменными окружения MATE1, MATE2, MATE3, MATERIAL; SEED меняет случайные позиции.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const VARIANT = process.argv[2] ?? 'makruk';
const SECONDS = Number(process.argv[3] ?? 120);
const OUT = process.argv[4] ?? new URL(`../src/puzzles/${VARIANT}.json`, import.meta.url).pathname;
const SEED = Number(process.env.SEED ?? 1);
const TARGET = { mate1: Number(process.env.MATE1 ?? 30), mate2: Number(process.env.MATE2 ?? 50), mate3: Number(process.env.MATE3 ?? 30), material: Number(process.env.MATERIAL ?? 50) };

const vite = await createServer({ root: new URL('..', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const { getVariant } = await vite.ssrLoadModule('/src/core/variants.ts');
const V = getVariant(VARIANT);
const W = V.files, H = V.ranks, N = W * H;

let seed = SEED;
// mulberry32: целочисленный генератор, разные SEED дают разные последовательности.
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rnd = (n) => Math.floor(rand() * n);
const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
const opp = (c) => (c === 'w' ? 'b' : 'w');
const cased = (t, c) => (c === 'w' ? t.toUpperCase() : t.toLowerCase());
/** Горизонталь, считая от своей первой линии (0 — своя первая горизонталь). */
const relRank = (s, c) => (c === 'w' ? Math.floor(s / W) : H - 1 - Math.floor(s / W));
const fileOf = (s) => s % W;

const chessPawn = (lo, hi) => (t, c, s) => t !== 'P' || (relRank(s, c) >= lo && relRank(s, c) <= hi);
const inPalace = (s, c) => fileOf(s) >= 3 && fileOf(s) <= 5 && relRank(s, c) <= 2;
/** Поля Сянци: генерал и советники во дворце, слоны на своих семи полях, солдаты — на своих местах или за рекой. */
const XQ_OK = {
  A: (s, c) => inPalace(s, c) && (fileOf(s) + relRank(s, c)) % 2 === 1,
  B: (s, c) => relRank(s, c) <= 4 && relRank(s, c) % 2 === 0 && (fileOf(s) + relRank(s, c)) % 4 === 2,
  P: (s, c) => (relRank(s, c) >= 3 && relRank(s, c) <= 4 && fileOf(s) % 2 === 0) || relRank(s, c) >= 5,
};

/**
 * Настройки игры: фигуры, из которых составляются позиции (pool — у каждой стороны свои, shared — общие,
 * остаток уходит в руки), где фигура может стоять (ok), можно ли передать ход другой стороне поворотом доски (flip)
 * и бывает ли выигрыш без шаха (quietWins; иначе на последнем ходу перебираются только шахи — это намного быстрее).
 */
const CFG = {
  makruk: { prefix: 'mk', pool: { w: 'RRNNSSMPPP', b: 'RRNNSSMPPP' }, ok: chessPawn(2, 4), flip: true },
  // В шатрандже выигрывают и без шаха: пат и оголённый король.
  shatranj: { prefix: 'sh', pool: { w: 'RRNNBBQPPP', b: 'RRNNBBQPPP' }, ok: chessPawn(1, 6), flip: true, quietWins: true },
  cambodian: { prefix: 'kh', pool: { w: 'RRNNSSMPPP', b: 'RRNNSSMPPP' }, ok: chessPawn(2, 4), flip: true, gates: true },
  sittuyin: { prefix: 'si', pool: { w: 'RRNNSSFPPP', b: 'RRNNSSFPPP' }, ok: chessPawn(2, 6), flip: true, emptyHands: true },
  minishogi: {
    prefix: 'ms',
    shared: ['R', 'R', 'B', 'B', 'G', 'G', 'S', 'S', 'P', 'P'],
    promote: { R: '+R', B: '+B', S: '+S', P: '+P' },
    ok: (t, c, s, board) => {
      if (t !== 'P') return true;
      if (relRank(s, c) === H - 1) return false;
      // Две непревращённые пешки на одной вертикали (нифу) запрещены.
      return !board.some((p, x) => p === cased('P', c) && fileOf(x) === fileOf(s));
    },
    flip: true,
    hands: true,
    noPawnDropMate: true,
  },
  kyotoshogi: {
    prefix: 'ky',
    shared: ['L', 'L', 'S', 'S', 'N', 'N', 'P', 'P'],
    promote: { L: '+L', S: '+S', N: '+N', P: '+P' },
    always: true,
    ok: (t, c, s) => (t === 'P' || t === 'L' ? relRank(s, c) < H - 1 : t === 'N' ? relRank(s, c) < H - 2 : true),
    flip: true,
    hands: true,
  },
  manchu: {
    prefix: 'mc',
    pool: { w: 'MBBAAPPP', b: 'RRNNCCBBAAPPP' },
    king: inPalace,
    ok: (t, c, s) => (XQ_OK[t] ? XQ_OK[t](s, c) : true),
    flip: false,
  },
}[VARIANT];
if (!CFG) throw new Error(`Нет настроек для игры ${VARIANT}`);

const take = (arr) => arr.splice(rnd(arr.length), 1)[0];

/** Случайная позиция: у решающего nMine фигур, у соперника nTheirs (кроме королей). */
function randomPosition(nMine, nTheirs) {
  const board = Array(N).fill(null);
  const place = (piece, c, t) => {
    for (let k = 0; k < 60; k++) {
      const s = rnd(N);
      if (board[s]) continue;
      if (t === 'K' ? CFG.king && !CFG.king(s, c) : !CFG.ok(t, c, s, board)) continue;
      board[s] = piece;
      return true;
    }
    return false;
  };
  if (!place('K', 'w', 'K') || !place('k', 'b', 'K')) return null;
  const hands = { w: {}, b: {} };
  if (CFG.shared) {
    const pool = [...CFG.shared];
    for (const [c, n] of [['w', nMine], ['b', nTheirs]]) {
      for (let i = 0; i < n && pool.length; i++) {
        const b0 = take(pool);
        const t = CFG.promote[b0] && rand() < (CFG.always ? 0.5 : 0.25) ? CFG.promote[b0] : b0;
        if (!place(cased(t, c), c, t)) pool.push(b0);
      }
    }
    // Одна-две фигуры в руку решающему, остальные — сопернику (как в цумэ).
    for (let i = rnd(3); i > 0 && pool.length; i--) {
      const t = take(pool);
      hands.w[t] = (hands.w[t] ?? 0) + 1;
    }
    for (const t of pool) hands.b[t] = (hands.b[t] ?? 0) + 1;
  } else {
    for (const [c, n] of [['w', nMine], ['b', nTheirs]]) {
      const pool = CFG.pool[c].split('');
      for (let i = 0; i < n && pool.length; i++) {
        const t = take(pool);
        place(cased(t, c), c, t);
      }
    }
  }
  let pos = { board, turn: 'w', halfmove: 0, fullmove: 1 };
  if (CFG.hands || CFG.emptyHands) pos.hands = CFG.hands ? hands : { w: {}, b: {} };
  if (CFG.gates) pos.gates = [];
  if (CFG.flip && rand() < 0.5) {
    // Решают чёрные: поворачиваем доску на 180° и меняем цвета.
    const flipped = Array(N).fill(null);
    board.forEach((p, s) => p && (flipped[N - 1 - s] = colorOf(p) === 'w' ? p.toLowerCase() : p.toUpperCase()));
    pos = { ...pos, board: flipped, turn: 'b', ...(pos.hands ? { hands: { w: pos.hands.b, b: pos.hands.w } } : {}) };
  } else if (!CFG.flip && rand() < 0.5) pos.turn = 'b';
  // Сторона, которая не ходит, не должна быть под шахом; решающий тоже не под шахом.
  if (V.inCheck({ ...pos, turn: opp(pos.turn) }) || V.inCheck(pos)) return null;
  // Позиция должна пережить запись в FEN.
  const fen = V.toFen(pos);
  const back = V.parseFen(fen);
  return V.toFen(back) === fen ? back : null;
}

/** Мат сбросом пешки запрещён (мини-сёги); итог без истории этого не видит, поэтому такие ходы отсекаются здесь. */
const pawnDropMate = (m) => CFG.noPawnDropMate && m.drop === 'P' && !m.promo;

/** Итог партии в позиции (без истории): null — игра продолжается. */
const resultOf = (pos) => V.result(pos, []);

/** Может ли сторона, которая ходит, выиграть (любым способом) не больше чем за n своих ходов. */
function wins(pos, n, checksOnly = false) {
  const me = pos.turn;
  for (const m of order(pos, V.legalMoves(pos))) {
    const p2 = V.makeMove(pos, m);
    if ((checksOnly || (n === 1 && !CFG.quietWins)) && !V.inCheck(p2)) continue;
    const r = resultOf(p2);
    if (r) {
      if (r.winner === me && !pawnDropMate(m)) return true;
      continue;
    }
    if (n > 1 && V.legalMoves(p2).every((d) => wins(V.makeMove(p2, d), n - 1, checksOnly))) return true;
  }
  return false;
}

/** Сначала шахи и взятия — так перебор быстрее находит выигрыш. */
function order(pos, moves) {
  const score = (m) => (pos.board[m.to] ? 2 : 0) + (m.promo ? 1 : 0);
  return moves.sort((a, b) => score(b) - score(a));
}

/** Ходы решающего, выигрывающие не больше чем за n ходов. */
function winningMoves(pos, n, checksOnly) {
  const me = pos.turn;
  const out = [];
  for (const m of V.legalMoves(pos)) {
    const p2 = V.makeMove(pos, m);
    if ((checksOnly || (n === 1 && !CFG.quietWins)) && !V.inCheck(p2)) continue;
    const r = resultOf(p2);
    if (r) {
      if (r.winner === me && !pawnDropMate(m)) out.push({ m, p2, r });
      continue;
    }
    if (n > 1 && V.legalMoves(p2).every((d) => wins(V.makeMove(p2, d), n - 1, checksOnly))) out.push({ m, p2, r: null });
    if (out.length > 1) break;
  }
  return out;
}

/** Мат ровно в n ходов с единственным решением; возвращает линию или null. */
function solveMate(pos, n, checksOnly = false) {
  // Быстрее нет: иначе это задача на меньшее число ходов.
  for (let k = 1; k < n; k++) if (wins(pos, k)) return null;
  const line = [];
  let cur = pos;
  for (let left = n; left > 0; left--) {
    const ws = winningMoves(cur, left, checksOnly);
    if (ws.length !== 1) return null;
    // Если решающему доступна и задача без ограничения «только шахи» быстрее — не годится (проверено выше).
    const { m, p2, r } = ws[0];
    line.push(V.moveToUci(m));
    if (r) return left === 1 && r.reason === 'checkmate' ? line : null;
    if (left === 1) return null;
    // Защита соперника: дольше всех держится; при равенстве — взятие.
    let best = null;
    for (const d of V.legalMoves(p2)) {
      const p3 = V.makeMove(p2, d);
      const fast = wins(p3, left - 2, checksOnly) && left > 2;
      const key = (fast ? 0 : 10) + (p2.board[d.to] ? 1 : 0);
      if (!best || key > best.key) best = { d, p3, key };
    }
    if (!best) return null;
    line.push(V.moveToUci(best.d));
    cur = best.p3;
  }
  return null;
}

// ---------- Выигрыш материала ----------

const MATE = 1000;
const handOf = (pos, c) => Object.entries(pos.hands?.[c] ?? {}).reduce((s, [t, n]) => s + V.pieceValue(cased(t, c)) * (n ?? 0), 0);
// В сёги взятая фигура переходит в руку и тоже считается материалом.
const matOf = (pos, c) => pos.board.reduce((s, p) => (p && colorOf(p) === c ? s + V.pieceValue(p) : s), 0) + (CFG.hands ? handOf(pos, c) : 0);
const evalFor = (pos) => matOf(pos, pos.turn) - matOf(pos, opp(pos.turn));
/** Наименьший выигрыш материала для задачи. */
const GAIN = CFG.hands ? 3 : V.board === 'cells' ? 2.5 : 2;

/** Оценка конца партии; moves — уже найденные ходы позиции (в сёги партия кончается, только когда ходов нет). */
function terminalScore(pos, moves) {
  if (CFG.hands && moves.length > 0) return null;
  const r = resultOf(pos);
  if (!r) return null;
  return r.winner === null ? 0 : r.winner === pos.turn ? MATE : -MATE;
}

function quiesce(pos, alpha, beta, depth = 0) {
  const moves = V.legalMoves(pos);
  const t = terminalScore(pos, moves);
  if (t !== null) return t;
  const stand = evalFor(pos);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (depth > 6) return alpha;
  for (const m of moves) {
    if (!pos.board[m.to] && !m.promo) continue;
    const v = -quiesce(V.makeMove(pos, m), -beta, -alpha, depth + 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(pos, depth, alpha, beta, pv) {
  if (depth === 0) return quiesce(pos, alpha, beta);
  const moves = V.legalMoves(pos);
  const t = terminalScore(pos, moves);
  if (t !== null) return t;
  // С руками ходов слишком много: на последнем полуходе смотрим только взятия (с возможностью не брать).
  const narrow = CFG.hands && depth === 1;
  let best = narrow ? evalFor(pos) : -Infinity;
  if (narrow && best > alpha) alpha = best;
  for (const m of order(pos, moves)) {
    if (narrow && !pos.board[m.to]) continue;
    const sub = [];
    const v = -search(V.makeMove(pos, m), depth - 1, -beta, -alpha, sub);
    if (v > best) {
      best = v;
      pv.length = 0;
      pv.push(m, ...sub);
    }
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function solveMaterial(pos) {
  const base = quiesce(pos, -Infinity, Infinity);
  // Уже сейчас что-то висит — это не задача.
  if (base > evalFor(pos) + 0.5) return null;
  // Сначала узким окном отбираем ходы, которые выигрывают больше полпешки: такой ход должен быть ровно один.
  const thr = base + 0.5;
  const good = [];
  for (const m of order(pos, V.legalMoves(pos))) {
    if (-search(V.makeMove(pos, m), 2, -(thr + 0.01), -thr, []) > thr) good.push(m);
    if (good.length > 1) return null;
  }
  if (good.length !== 1) return null;
  const pv = [];
  const a = { m: good[0], v: -search(V.makeMove(pos, good[0]), 2, -Infinity, Infinity, pv), pv };
  if (a.v >= MATE / 2 || a.v - base < GAIN) return null;
  // Линия: первый ход, ответ и взятие решающего (нечётная длина).
  const moves = [a.m, ...a.pv].slice(0, 3);
  let cur = pos;
  const line = [];
  for (const m of moves) {
    line.push(V.moveToUci(m));
    cur = V.makeMove(cur, m);
    if (resultOf(cur)) break;
  }
  if (line.length % 2 === 0) line.pop();
  // Проверяем, что к концу линии материал действительно выигран.
  let p = pos;
  for (const u of line) p = V.makeMove(p, V.legalMoves(p).find((m) => V.moveToUci(m) === u));
  const gain = matOf(p, pos.turn) - matOf(p, opp(pos.turn)) - evalFor(pos);
  if (gain < GAIN) return null;
  return { line, gain: Math.round(a.v - base) === a.v - base ? a.v - base : Math.round((a.v - base) * 4) / 4 };
}

// ---------- Основной цикл ----------

const found = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const seen = new Set(found.map((p) => p.fen.split(' ').slice(0, 2).join(' ')));
const count = (k) => found.filter((p) => (k === 'material' ? p.goal === 'material' : k === 'mate3' ? p.checksOnly : p.goal === 'mate' && !p.checksOnly && p.mateIn === Number(k.slice(4)))).length;
const need = (k) => count(k) < TARGET[k];
const prefix = CFG.prefix;
const deadline = Date.now() + SECONDS * 1000;
let tried = 0;

while (Date.now() < deadline && Object.keys(TARGET).some(need)) {
  const pos = randomPosition(2 + rnd(3), 1 + rnd(4));
  if (!pos || resultOf(pos)) continue;
  const fen = V.toFen(pos);
  const key = fen.split(' ').slice(0, 2).join(' ');
  if (seen.has(key)) continue;
  tried++;
  let item = null;
  if (need('mate1') || need('mate2') || need('mate3')) {
    for (const [k, n, checks] of [['mate1', 1, false], ['mate2', 2, false], ['mate3', 3, true]]) {
      if (!need(k)) continue;
      const line = solveMate(pos, n, checks);
      if (line) {
        item = { goal: 'mate', mateIn: n, line, origin: checks ? 'search-checks' : 'search', ...(checks ? { checksOnly: true } : {}) };
        break;
      }
    }
  }
  if (!item && need('material')) {
    const t = solveMaterial(pos);
    if (t) item = { goal: 'material', gain: t.gain, line: t.line, origin: 'search' };
  }
  if (!item) continue;
  seen.add(key);
  const id = `${prefix}-${createHash('sha1').update(fen).digest('hex').slice(0, 7)}`;
  const { origin, ...rest } = item;
  found.push({ id, origin, fen, ...rest });
  console.log(`${found.length}: ${item.goal} ${item.mateIn ?? item.gain} ${fen} ${item.line.join(' ')}`);
  writeFileSync(OUT, JSON.stringify(found, null, 1));
}

console.log(`Позиций перебрано: ${tried}; задач: ${found.length} (мат в 1: ${count('mate1')}, в 2: ${count('mate2')}, шахами в 3: ${count('mate3')}, материал: ${count('material')})`);
writeFileSync(OUT, JSON.stringify(found, null, 1));
await vite.close();
