// Проверка, что движок запускается, играет с нейросетью в каждой игре и находит ход.
// Чанги — со встроенной сетью; остальные игры — с сетями из папки nnue рядом с движком (scripts/fetch-engine.mjs).
// Использование: node scripts/engine-smoke.mjs <путь к движку> [--no-nets]
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { NETS, evalFileFor } from './nnue-nets.mjs';

const path = process.argv[2];
const evalFile = process.argv.includes('--no-nets') ? '' : evalFileFor(path);
if (!evalFile && !process.argv.includes('--no-nets')) {
  console.error('Рядом с движком нет папки nnue с сетями остальных игр: запустите npm run fetch-engine');
  process.exit(1);
}
// Вариант сети — начало её имени: xiangqi-c07e94a5c7cb.nnue → xiangqi.
const variants = ['janggi', ...(evalFile ? NETS.map((n) => n.name.replace(/-[0-9a-f]{12}\.nnue$/, '')) : [])];

function check(variant) {
  return new Promise((resolve) => {
    const proc = spawn(path, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    const timer = setTimeout(() => {
      console.error(`${variant}: движок не ответил за 60 с`);
      proc.kill();
      resolve(false);
    }, 60000);
    const lines = [];
    createInterface({ input: proc.stdout }).on('line', (l) => {
      lines.push(l);
      if (!l.startsWith('bestmove')) return;
      clearTimeout(timer);
      proc.stdin.write('quit\n');
      const net = lines.find((x) => x.startsWith('info string NNUE evaluation using'));
      const nnue = !!net && net.includes(variant) && net.endsWith('enabled');
      const name = lines.find((x) => x.startsWith('id name'));
      console.log(`${variant}: ${name?.slice(8)}; ${net ?? 'без нейросети'}; ${l}`);
      if (!nnue) console.error(`${variant}: движок работает без нейросети`);
      resolve(nnue && /^bestmove [a-l]\d+[a-l]?\d*/.test(l));
    });
    if (evalFile) proc.stdin.write(`setoption name EvalFile value ${evalFile}\n`);
    proc.stdin.write(`uci\nsetoption name UCI_Variant value ${variant}\nposition startpos\ngo depth 12\n`);
  });
}

let ok = true;
for (const v of variants) ok = (await check(v)) && ok;
process.exit(ok ? 0 : 1);
