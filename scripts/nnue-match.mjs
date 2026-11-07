// Матч «с нейросетью» против «без нейросети» (или двух любых настроек) для любого варианта Fairy-Stockfish.
// Конец партии определяет ffish (тот же Fairy-Stockfish, собранный в WebAssembly), поэтому скрипт подходит
// для всех игр, в том числе тех, правил которых нет в приложении. Каждая пара партий начинается с одного
// случайного дебюта (VARIANT_PLIES случайных полуходов), стороны меняются цветами.
// Использование:
//   npm i --no-save ffish
//   FAIRY_STOCKFISH=<путь> VARIANT=shogi node scripts/nnue-match.mjs '<опции A>' '<опции B>' [пар] [мс на ход] [одновременно]
// Например, сеть против классической оценки:
//   VARIANT=xiangqi node scripts/nnue-match.mjs '{"EvalFile":"/путь/xiangqi-c07e94a5c7cb.nnue"}' '{"Use NNUE":false}' 50 100 4
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { ENGINE } from './uci-engine.mjs';

// Старый загрузчик ffish в Node с fetch пытается скачать .wasm по пути как по URL — читаем файл с диска.
const savedFetch = globalThis.fetch;
globalThis.fetch = undefined;
const ffish = createRequire(import.meta.url)('ffish');
await new Promise((resolve) => (ffish.onRuntimeInitialized = resolve));
globalThis.fetch = savedFetch;
const VARIANT = process.env.VARIANT ?? 'janggi';
const OPENING_PLIES = Number(process.env.VARIANT_PLIES ?? 4);
const MAX_PLIES = Number(process.env.MAX_PLIES ?? 400);
const [optsA, optsB] = [JSON.parse(process.argv[2] ?? '{}'), JSON.parse(process.argv[3] ?? '{"Use NNUE":false}')];
const PAIRS = Number(process.argv[4] ?? 20);
const MOVETIME = Number(process.argv[5] ?? 100);
const PARALLEL = Number(process.argv[6] ?? 2);

class Player {
  constructor(opts) {
    this.proc = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.waiters = [];
    this.lines = [];
    createInterface({ input: this.proc.stdout }).on('line', (l) => {
      this.lines.push(l);
      const w = this.waiters[0];
      if (w && w.test(l)) {
        this.waiters.shift();
        w.resolve(l);
      }
    });
    this.opts = opts;
  }
  send(s) {
    this.proc.stdin.write(s + '\n');
  }
  wait(test) {
    return new Promise((resolve) => this.waiters.push({ test, resolve }));
  }
  async init() {
    this.send('uci');
    await this.wait((l) => l === 'uciok');
    // EvalFile — до выбора варианта: сеть подбирается при смене UCI_Variant и при isready.
    for (const [k, v] of Object.entries({ Threads: 1, Hash: 32, ...this.opts })) this.send(`setoption name ${k} value ${v}`);
    this.send(`setoption name UCI_Variant value ${VARIANT}`);
    this.send('isready');
    await this.wait((l) => l === 'readyok');
  }
  /** Чем оценивает позиции: движок сообщает об этом при первом поиске. */
  get eval() {
    const l = this.lines.find((x) => x.startsWith('info string NNUE evaluation using'));
    return l ? l.replace('info string NNUE evaluation using ', 'нейросеть ').replace(' enabled', '') : 'классическая оценка';
  }
  async move(fen, moves) {
    this.send(`position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`);
    this.send(`go movetime ${MOVETIME}`);
    return (await this.wait((l) => l.startsWith('bestmove'))).split(/\s+/)[1];
  }
  quit() {
    this.send('quit');
  }
}

/** Детерминированный генератор случайных чисел, чтобы матчи можно было повторить. */
function rng(seed) {
  return () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
}

function randomOpening(i) {
  const rand = rng(1000 + i);
  for (;;) {
    const b = new ffish.Board(VARIANT);
    let ok = true;
    for (let p = 0; p < OPENING_PLIES && ok; p++) {
      const moves = b.legalMoves().split(' ').filter(Boolean);
      if (!moves.length || b.isGameOver(true)) ok = false;
      else b.push(moves[Math.floor(rand() * moves.length)]);
    }
    const fen = b.fen();
    const over = b.isGameOver(true);
    b.delete();
    if (ok && !over) return fen;
  }
}

let shown = false;
/** Партия: 'A', 'B', 'draw' или null при сбое. */
async function play(fen, aFirst) {
  const a = new Player(optsA);
  const b = new Player(optsB);
  await Promise.all([a.init(), b.init()]);
  const board = new ffish.Board(VARIANT, fen);
  const firstIsWhite = board.turn();
  const moves = [];
  try {
    while (!board.isGameOver(true) && moves.length < MAX_PLIES) {
      const p = (board.turn() === firstIsWhite) === aFirst ? a : b;
      const m = await p.move(fen, moves);
      if (!m || m === '(none)' || !board.push(m)) break;
      moves.push(m);
    }
  } finally {
    if (!shown) {
      shown = true;
      console.log(`A: ${a.eval}\nB: ${b.eval}`);
    }
    a.quit();
    b.quit();
  }
  const over = board.isGameOver(true);
  const res = over ? board.result(true) : moves.length >= MAX_PLIES ? '1/2-1/2' : null;
  board.delete();
  if (!res) return null;
  if (res === '1/2-1/2') return { winner: 'draw', plies: moves.length };
  // result() даётся с точки зрения белых (в FEN — «w»); первая сторона после дебюта может быть любой.
  const whiteWon = res === '1-0';
  const aIsWhite = (firstIsWhite === true) === aFirst;
  return { winner: whiteWon === aIsWhite ? 'A' : 'B', plies: moves.length };
}

const jobs = [];
for (let i = 0; i < PAIRS; i++) {
  const fen = randomOpening(i);
  jobs.push([fen, true], [fen, false]);
}
const score = { A: 0, B: 0, draw: 0 };
let next = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < jobs.length) {
      const [fen, aFirst] = jobs[next++];
      const r = await play(fen, aFirst);
      if (!r) continue;
      score[r.winner]++;
      console.log(`${r.winner === 'draw' ? 'ничья' : 'победил ' + r.winner} (${r.plies} пл.)  счёт A ${score.A} : ${score.B} B, ничьих ${score.draw}`);
    }
  }),
);
const n = score.A + score.B + score.draw;
const p = (score.A + score.draw / 2) / n;
const elo = p > 0 && p < 1 ? Math.round(-400 * Math.log10(1 / p - 1)) : p === 1 ? Infinity : -Infinity;
console.log(`Итог ${VARIANT}: A +${score.A} −${score.B} =${score.draw} из ${n}, ≈ ${elo > 0 ? '+' : ''}${elo} Elo в пользу A`);
process.exit(0);
