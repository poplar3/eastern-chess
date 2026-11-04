// Генератор собственных задач: движок играет партии сам с собой со случайностью,
// в найденных позициях ищутся форсированные маты и выигрыш материала,
// и каждая задача проверяется на единственность решения.
// В режиме MODE=compose вместо партий перебираются случайные позиции с небольшим числом фигур
// (как в составленных задачах 묘수풀이) и в них ищутся маты в 2–4 хода.
// В режиме MODE=bakbo составляются задачи по канону 박보: каждый ход решающего — шах,
// мат в MIN_MATE–MAX_MATE ходов (по умолчанию 3–7), позиции с большим числом фигур.
// VARIANT=xiangqi или VARIANT=shogi — задачи для Сянци или Сёги (по умолчанию Чанги). Для них MODE=checks —
// маты, где каждый ход решающего — шах (в сёги это канон цумэ), с позициями как в MODE=compose.
// Использование: FAIRY_STOCKFISH=<путь> [VARIANT=…] [MODE=compose] node scripts/gen-puzzles.mjs [число_партий|число_позиций] [выход.json]
import { Engine, isPassUci } from './uci-engine.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'vite';

const GAMES = Number(process.argv[2] ?? 40);
const OUT = process.argv[3] ?? new URL('../src/puzzles/generated.json', import.meta.url).pathname;
const WORKERS = Number(process.env.WORKERS ?? 4);
const MODE = process.env.MODE ?? 'games';
const VARIANT = process.env.VARIANT ?? 'janggi';
const CHECKS = MODE === 'bakbo' || MODE === 'checks';
const MIN_MATE = Number(process.env.MIN_MATE ?? (MODE === 'bakbo' ? 3 : 2));
const MAX_MATE = Number(process.env.MAX_MATE ?? (MODE === 'bakbo' ? 7 : MODE === 'checks' ? 5 : 4));

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const R = await vite.ssrLoadModule('/src/core/rules.ts');
const { Game: BaseGame } = await vite.ssrLoadModule('/src/core/game.ts');
const { getVariant } = await vite.ssrLoadModule('/src/core/variants.ts');
const V = getVariant(VARIANT);
class Game extends BaseGame {
  constructor(fen) {
    super(fen, V);
  }
}

const val = (s) => (s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate : -100000 - s.mate) : s.cp);
const rnd = (n) => Math.floor(Math.random() * n);
/** Материал стороны: фигуры на доске и (в сёги) в руке. */
function material(pos, c) {
  let sum = 0;
  for (const p of pos.board) if (p && (p === p.toUpperCase() ? 'w' : 'b') === c) sum += V.pieceValue(p);
  for (const [t, n] of Object.entries(pos.hands?.[c] ?? {})) sum += V.pieceValue(t) * n;
  return sum;
}
const fenOf = (g) => V.toFen({ ...g.position, halfmove: 0, fullmove: 1 });
const keyOf = (fen) => fen.split(' ').slice(0, 2).join(' ');

/**
 * Мат в N с единственным решением на каждом ходе решающего (кроме последнего).
 * checksOnly — правило 박보: каждый ход решающего должен объявлять шах.
 */
async function verifyMate(eng, fen, n, checksOnly = false) {
  const g = new Game(fen);
  const solver = g.turn;
  const line = [];
  for (let left = n; left > 0; left--) {
    const ls = await eng.search(fenOf(g), Math.max(12, 2 * left + 8), left > 1 ? 2 : 1);
    const top = ls[0];
    if (!top || top.score.mate === undefined || top.score.mate <= 0 || top.score.mate > left) return null;
    // Другой ход может тоже вести к мату, но только медленнее — иначе решение не единственное.
    if (left > 1 && ls[1] && ls[1].score.mate !== undefined && ls[1].score.mate > 0 && ls[1].score.mate <= left) return null;
    const mv = top.pv[0];
    if (VARIANT === 'janggi' && isPassUci(mv)) return null;
    const h = g.playUci(mv);
    if (checksOnly && !h.check) return null;
    line.push(mv);
    const res = g.result();
    if (res) return res.reason === 'checkmate' && res.winner === solver && left === 1 ? line : null;
    if (left === 1) return null;
    const def = await eng.search(fenOf(g), 10, 1);
    if (!def[0]) return null;
    g.playUci(def[0].pv[0]);
    line.push(def[0].pv[0]);
    if (g.result()) return null;
  }
  return null;
}

/** Выигрыш не меньше 3 очков материала с единственным сильным ходом на каждом шаге. */
async function verifyTactic(eng, fen) {
  const g = new Game(fen);
  const solver = g.turn;
  const opp = R.opposite(solver);
  const start = material(g.position, solver) - material(g.position, opp);
  if (Math.abs(start) > 6) return null;
  const line = [];
  for (let step = 0; step < 3; step++) {
    const ls = await eng.search(fenOf(g), 14, 2);
    const [a, b] = ls;
    if (!a || a.score.mate !== undefined) return null;
    if (a.score.cp < 250) return null;
    if (b && val(a.score) - val(b.score) < 250) return null;
    const mv = a.pv[0];
    if (VARIANT === 'janggi' && isPassUci(mv)) return null;
    g.playUci(mv);
    line.push(mv);
    if (g.result()) return null;
    // Ответ соперника — лучший по движку.
    const def = await eng.search(fenOf(g), 12, 1);
    if (!def[0]) return null;
    const reply = def[0].pv[0];
    // Если решающий уже выиграл материал и ответ ничего не возвращает, задача закончена.
    const gainNow = material(g.position, solver) - material(g.position, opp) - start;
    const g2 = new Game(fenOf(g));
    g2.playUci(reply);
    const gainAfterReply = material(g2.position, solver) - material(g2.position, opp) - start;
    if (gainNow >= 3 && gainAfterReply >= 3) return { line, gain: gainAfterReply };
    g.playUci(reply);
    line.push(reply);
    if (g.result()) return null;
  }
  return null;
}

const found = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const seen = new Set(found.map((p) => keyOf(p.fen)));
let gamesLeft = GAMES;

async function worker(id) {
  const eng = new Engine();
  await eng.init();
  while (gamesLeft-- > 0) {
    const s = () => R.SETUPS[rnd(4)].id;
    const g = new Game(VARIANT === 'janggi' ? R.startFenWithSetups(s(), s()) : V.startFen);
    const gameId = Math.random().toString(36).slice(2, 8);
    for (let ply = 0; ply < 160 && !g.result(); ply++) {
      const fen = fenOf(g);
      const key = keyOf(fen);
      if (ply >= 12 && !seen.has(key)) {
        const quick = await eng.search(fen, 9, 2);
        const top = quick[0];
        if (top && top.score.mate !== undefined && top.score.mate > 0 && top.score.mate <= 4) {
          const line = await verifyMate(eng, fen, top.score.mate);
          if (line) {
            seen.add(key);
            found.push({ fen, goal: 'mate', mateIn: top.score.mate, line, game: gameId, ply });
            console.log(`[${id}] мат в ${top.score.mate}: ${fen} ${line.join(' ')}`);
          }
        } else if (top && top.score.cp >= 300 && (!quick[1] || val(top.score) - val(quick[1].score) >= 250)) {
          const t = await verifyTactic(eng, fen);
          if (t) {
            seen.add(key);
            found.push({ fen, goal: 'material', gain: t.gain, line: t.line, game: gameId, ply });
            console.log(`[${id}] +${t.gain}: ${fen} ${t.line.join(' ')}`);
          }
        }
      }
      // Ход партии: случайный среди близких по силе, иногда заметно слабее — чтобы появлялись тактические позиции.
      const ls = await eng.search(fen, 6, 4);
      if (!ls.length) break;
      const best = val(ls[0].score);
      const margin = Math.random() < 0.12 ? 400 : 60;
      const cands = ls.filter((l) => best - val(l.score) <= margin);
      const pick = cands[rnd(cands.length)].pv[0];
      try {
        g.playUci(pick);
      } catch {
        break;
      }
    }
    writeFileSync(OUT, JSON.stringify(found, null, 1));
    console.log(`[${id}] партия сыграна, всего задач: ${found.length}`);
  }
  eng.quit();
}


const PALACE = { w: [3, 4, 5].flatMap((f) => [0, 1, 2].map((r) => R.sq(f, r))), b: [3, 4, 5].flatMap((f) => [7, 8, 9].map((r) => R.sq(f, r))) };
const pickFree = (board, squares) => {
  const free = squares.filter((s) => !board[s]);
  return free.length ? free[rnd(free.length)] : -1;
};
const ALL = Array.from({ length: 90 }, (_, i) => i);
/** Поля, где фигура данного типа может стоять в настоящей партии. */
function squaresFor(t, c) {
  if (t === 'A') return PALACE[c];
  if (t === 'P') return ALL.filter((s) => (c === 'w' ? R.rankOf(s) >= 3 : R.rankOf(s) <= 6));
  return ALL;
}

function randomPosition() {
  const att = Math.random() < 0.5 ? 'w' : 'b';
  const def = R.opposite(att);
  const board = Array(90).fill(null);
  const put = (t, c) => {
    const s = pickFree(board, t === 'K' ? PALACE[c] : squaresFor(t, c));
    if (s >= 0) board[s] = c === 'w' ? t : t.toLowerCase();
  };
  put('K', def);
  put('K', att);
  for (let i = rnd(3); i > 0; i--) put('A', def);
  const defExtra = ['P', 'P', 'N', 'B', 'C', 'R'];
  for (let i = rnd(3); i > 0; i--) put(defExtra[rnd(defExtra.length)], def);
  for (let i = rnd(2); i > 0; i--) put('A', att);
  const attPool = ['R', 'R', 'C', 'C', 'N', 'N', 'B', 'B', 'P', 'P', 'P'];
  for (let i = 2 + rnd(3); i > 0; i--) put(attPool.splice(rnd(attPool.length), 1)[0], att);
  const pos = { board, turn: att, halfmove: 0, fullmove: 1 };
  if (R.inCheck(board, def) || R.inCheck(board, att) || R.generalsFacing(board)) return null;
  // Две пушки на одной линии с генералом и прочие экзотические случаи отсеет движок; здесь — только базовая законность.
  return R.toFen(pos);
}

/** Позиция для 박보: у защиты дворец со стражами и несколько фигур, у нападения от трёх до шести фигур. */
function randomBakbo() {
  const att = Math.random() < 0.5 ? 'w' : 'b';
  const def = R.opposite(att);
  const board = Array(90).fill(null);
  const put = (t, c) => {
    const s = pickFree(board, t === 'K' ? PALACE[c] : squaresFor(t, c));
    if (s >= 0) board[s] = c === 'w' ? t : t.toLowerCase();
  };
  put('K', def);
  put('K', att);
  for (let i = 1 + rnd(2); i > 0; i--) put('A', def);
  const defPool = ['P', 'P', 'P', 'N', 'N', 'B', 'B', 'C', 'C', 'R', 'R'];
  for (let i = 1 + rnd(4); i > 0; i--) put(defPool.splice(rnd(defPool.length), 1)[0], def);
  for (let i = rnd(3); i > 0; i--) put('A', att);
  const attPool = ['R', 'R', 'C', 'C', 'N', 'N', 'B', 'B', 'P', 'P', 'P', 'P'];
  for (let i = 3 + rnd(4); i > 0; i--) put(attPool.splice(rnd(attPool.length), 1)[0], att);
  if (R.inCheck(board, def) || R.inCheck(board, att) || R.generalsFacing(board)) return null;
  return R.toFen({ board, turn: att, halfmove: 0, fullmove: 1 });
}

let positionsLeft = GAMES;
async function composer(id) {
  const eng = new Engine();
  await eng.init();
  while (positionsLeft-- > 0) {
    const bakbo = CHECKS;
    const fen = VARIANT === 'xiangqi' ? randomXiangqi(bakbo) : VARIANT === 'shogi' ? randomShogi(bakbo) : bakbo ? randomBakbo() : randomPosition();
    if (!fen) continue;
    const key = keyOf(fen);
    if (seen.has(key)) continue;
    const quick = await eng.search(fen, bakbo ? 12 : 8, 1);
    const top = quick[0];
    if (!top || top.score.mate === undefined || top.score.mate < MIN_MATE || top.score.mate > MAX_MATE) continue;
    const line = await verifyMate(eng, fen, top.score.mate, bakbo);
    if (!line) continue;
    seen.add(key);
    const kind = MODE === 'checks' ? 'checks' : bakbo ? 'bakbo' : 'compose';
    found.push({ fen, goal: 'mate', mateIn: top.score.mate, line, game: kind });
    console.log(`[${id}] ${kind}, мат в ${top.score.mate}: ${fen} ${line.join(' ')}`);
    if (found.length % 5 === 0) writeFileSync(OUT, JSON.stringify(found, null, 1));
  }
  eng.quit();
}

// ---------- Сянци ----------

const XQ_PALACE = { w: [3, 4, 5].flatMap((f) => [0, 1, 2].map((r) => r * 9 + f)), b: [3, 4, 5].flatMap((f) => [7, 8, 9].map((r) => r * 9 + f)) };
const XQ_ADVISOR = { w: [3, 5, 13, 21, 23], b: [66, 68, 76, 84, 86] };
const XQ_ELEPHANT = { w: [2, 6, 18, 22, 26, 38, 42], b: [47, 51, 63, 67, 71, 83, 87] };
/** Поля, где солдат может стоять в настоящей партии: до реки — только на исходных вертикалях. */
function xqPawnSquares(c) {
  return Array.from({ length: 90 }, (_, s) => s).filter((s) => {
    const f = s % 9, r = Math.floor(s / 9);
    const rel = c === 'w' ? r : 9 - r;
    return rel >= 5 || ((rel === 3 || rel === 4) && f % 2 === 0);
  });
}

function randomXiangqi(checks) {
  const att = Math.random() < 0.5 ? 'w' : 'b';
  const def = att === 'w' ? 'b' : 'w';
  const board = Array(90).fill(null);
  const all = Array.from({ length: 90 }, (_, i) => i);
  const squares = (t, c) => (t === 'K' ? XQ_PALACE[c] : t === 'A' ? XQ_ADVISOR[c] : t === 'B' ? XQ_ELEPHANT[c] : t === 'P' ? xqPawnSquares(c) : all);
  const put = (t, c) => {
    const s = pickFree(board, squares(t, c));
    if (s >= 0) board[s] = c === 'w' ? t : t.toLowerCase();
  };
  put('K', def);
  put('K', att);
  for (let i = rnd(3); i > 0; i--) put('A', def);
  for (let i = rnd(3); i > 0; i--) put('B', def);
  const defPool = ['P', 'P', 'N', 'C', 'R'];
  for (let i = rnd(checks ? 4 : 3); i > 0; i--) put(defPool[rnd(defPool.length)], def);
  for (let i = rnd(2); i > 0; i--) put('A', att);
  const attPool = ['R', 'R', 'C', 'C', 'N', 'N', 'P', 'P', 'P'];
  for (let i = (checks ? 3 : 2) + rnd(3); i > 0; i--) put(attPool.splice(rnd(attPool.length), 1)[0], att);
  const pos = { board, turn: att, halfmove: 0, fullmove: 1 };
  if (V.inCheck({ ...pos, turn: def }) || V.inCheck(pos)) return null;
  return V.toFen(pos);
}

// ---------- Сёги ----------

/**
 * Позиция для цумэ: король защиты в своём углу или в центре своего лагеря, рядом несколько его фигур,
 * у нападения — 2–4 фигуры у лагеря соперника и 1–3 фигуры в руке. Остальные фигуры — у защиты в руке
 * не лежат (как в классических цумэ, они «в коробке»), поэтому руку защиты оставляем пустой.
 */
function randomShogi(checks) {
  const att = Math.random() < 0.5 ? 'w' : 'b';
  const def = att === 'w' ? 'b' : 'w';
  const rel = (r, c) => (c === 'w' ? r : 8 - r);
  const board = Array(81).fill(null);
  const sqs = (pred) => Array.from({ length: 81 }, (_, s) => s).filter((s) => pred(s % 9, Math.floor(s / 9)));
  const canStand = (t, s, c) => {
    const rr = rel(Math.floor(s / 9), c);
    if (t === 'P' || t === 'L') return rr <= 7;
    if (t === 'N') return rr <= 6;
    return true;
  };
  const put = (t, c, pred) => {
    const free = sqs(pred).filter((s) => !board[s] && canStand(t.replace('+', ''), s, c));
    if (t === 'P') {
      const files = new Set(board.flatMap((p, s) => (p === (c === 'w' ? 'P' : 'p') ? [s % 9] : [])));
      for (let i = free.length - 1; i >= 0; i--) if (files.has(free[i] % 9)) free.splice(i, 1);
    }
    if (!free.length) return -1;
    const s = free[rnd(free.length)];
    board[s] = c === 'w' ? t : t.toLowerCase();
    return s;
  };
  // Король защиты — на дальних от нападения горизонталях.
  const k = put('K', def, (f, r) => rel(r, def) <= 1 && (Math.random() < 0.6 ? f <= 1 || f >= 7 : true));
  const kf = k % 9, kr = Math.floor(k / 9);
  const near = (d) => (f, r) => Math.abs(f - kf) <= d && Math.abs(r - kr) <= d;
  const defPool = ['G', 'G', 'S', 'S', 'P', 'P', 'P', 'N', 'L', 'B'];
  for (let i = 1 + rnd(checks ? 4 : 3); i > 0; i--) put(defPool[rnd(defPool.length)], def, near(2));
  const attPool = ['R', '+R', 'B', '+B', 'G', 'S', 'N', 'L', 'P', '+P'];
  for (let i = 1 + rnd(3); i > 0; i--) put(attPool[rnd(attPool.length)], att, near(3));
  // Король нападения далеко — в цумэ его часто нет вовсе, но движку нужен король у обеих сторон.
  put('K', att, (f, r) => rel(r, att) <= 1 && Math.abs(f - kf) >= 3);
  const handPool = ['G', 'G', 'S', 'S', 'N', 'L', 'P', 'R', 'B'];
  const hand = {};
  for (let i = 1 + rnd(3); i > 0; i--) {
    const t = handPool[rnd(handPool.length)];
    hand[t] = (hand[t] ?? 0) + 1;
  }
  const pos = { board, turn: att, halfmove: 0, fullmove: 1, hands: { [att]: hand, [def]: {} } };
  if (V.inCheck({ ...pos, turn: def }) || V.inCheck(pos)) return null;
  return V.toFen(pos);
}

await Promise.all(Array.from({ length: WORKERS }, (_, i) => (MODE === 'compose' || CHECKS ? composer(i) : worker(i))));
writeFileSync(OUT, JSON.stringify(found, null, 1));
await vite.close();
console.log(`Готово: ${found.length} задач в ${OUT}`);
