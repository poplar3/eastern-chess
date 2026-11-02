import { useEffect, useMemo, useRef, useState } from 'react';
import { Game } from '../core/game';
import { isPass, type Move, type Variant } from '../core/types';
import { allPuzzles, conceptsFor, isClassic, levelsFor, loadSolved, saveSolved, type ConceptId, type Puzzle } from '../puzzles';
import { Board, type Arrow } from './Board';
import { useMoveInput } from './moveInput';
import type { PieceStyle } from './pieces';

interface Props {
  variant: Variant;
  style: PieceStyle;
  /** Начать обычную партию с компьютером из этой позиции. */
  onPlayFrom: (fen: string, human: 'w' | 'b') => void;
}

type Status = 'play' | 'wrong' | 'reply' | 'solved' | 'shown' | 'free';

export function PuzzlesView({ variant, style, onPlayFrom }: Props) {
  const puzzles = useMemo(() => allPuzzles(variant.id), [variant.id]);
  const levels = levelsFor(variant.id);
  const CONCEPTS = conceptsFor(variant.id);
  const [solved, setSolved] = useState(loadSolved);
  const [current, setCurrent] = useState<Puzzle | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [concept, setConcept] = useState<ConceptId | ''>('');
  const [origin, setOrigin] = useState<'' | 'classic' | 'own'>('');

  const markSolved = (id: string, clean: boolean) => {
    setSolved((s) => {
      const next = { ...s, [id]: { clean: clean || !!s[id]?.clean } };
      saveSolved(next);
      return next;
    });
  };

  if (current) {
    const idx = puzzles.indexOf(current);
    const next = puzzles.slice(idx + 1).find((p) => !solved[p.id]) ?? puzzles[idx + 1] ?? null;
    return (
      <PuzzleSolver
        key={current.id}
        puzzle={current}
        number={idx + 1}
        variant={variant}
        style={style}
        onSolved={(clean) => markSolved(current.id, clean)}
        onBack={() => setCurrent(null)}
        onNext={next ? () => setCurrent(next) : undefined}
        onPlayFrom={onPlayFrom}
      />
    );
  }

  const usedConcepts = (Object.keys(CONCEPTS) as ConceptId[]).filter((c) => puzzles.some((p) => p.concepts.includes(c)));
  const list = puzzles.filter(
    (p) =>
      (level === null || p.level.n === level) &&
      (!concept || p.concepts.includes(concept)) &&
      (!origin || (origin === 'classic') === isClassic(p)),
  );
  const solvedCount = puzzles.filter((p) => solved[p.id]).length;

  return (
    <div className="puzzles">
      <div className="puzzles-head">
        <div>
          <h2>Задачи</h2>
          <div className="muted">
            Решено {solvedCount} из {puzzles.length}. Задачи упорядочены от простых к сложным; уровни соответствуют
            {variant.id === 'janggi' ? ' корейским любительским разрядам.' : variant.id === 'shogi' ? ' любительским разрядам сёги (кю и дан).' : ' силе игры от новичка до сильного любителя.'}
          </div>
        </div>
        <div className="puzzle-filters">
          <div className="segmented level-filter">
            <button className={level === null ? 'active' : ''} onClick={() => setLevel(null)}>
              Все
            </button>
            {levels.map((l) => (
              <button key={l.n} className={level === l.n ? 'active' : ''} onClick={() => setLevel(l.n)} title={l.rank}>
                {l.ru}
              </button>
            ))}
          </div>
          <select value={concept} onChange={(e) => setConcept(e.target.value as ConceptId | '')} aria-label="Приём">
            <option value="">Все приёмы</option>
            {usedConcepts.map((c) => (
              <option key={c} value={c}>
                {CONCEPTS[c].ru}
              </option>
            ))}
          </select>
          {puzzles.some(isClassic) && (
            <select value={origin} onChange={(e) => setOrigin(e.target.value as '' | 'classic' | 'own')} aria-label="Источник">
              <option value="">Все источники</option>
              <option value="classic">Корейские задачи (бакбо)</option>
              <option value="own">Составленные приложением</option>
            </select>
          )}
        </div>
      </div>
      {concept && <div className="panel concept-about"><b>{CONCEPTS[concept].ru}.</b> {CONCEPTS[concept].about}</div>}
      <div className="puzzle-grid">
        {list.map((p) => (
          <button key={p.id} className={`puzzle-card${solved[p.id] ? ' solved' : ''}`} onClick={() => setCurrent(p)}>
            <span className="puzzle-num">№ {puzzles.indexOf(p) + 1}</span>
            {solved[p.id] && <span className="puzzle-done" title={solved[p.id].clean ? 'Решена с первой попытки' : 'Решена'}>{solved[p.id].clean ? '★' : '✓'}</span>}
            <b>{p.title}</b>
            <span className={`lvl lvl-${p.level.n}`}>{p.level.ru}</span>
            <span className="muted small">{p.concepts.map((c) => CONCEPTS[c].ru).join(', ')}</span>
            <span className="muted small">Ход {variant.sidesGen[p.solver]}</span>
            {isClassic(p) && <span className="muted small">Бакбо, № {p.number}</span>}
          </button>
        ))}
        {list.length === 0 && <div className="muted">{puzzles.length ? 'Нет задач с такими условиями.' : 'Задач для этой игры пока нет.'}</div>}
      </div>
    </div>
  );
}

interface SolverProps {
  puzzle: Puzzle;
  number: number;
  variant: Variant;
  style: PieceStyle;
  onSolved: (clean: boolean) => void;
  onBack: () => void;
  onNext?: () => void;
  onPlayFrom: (fen: string, human: 'w' | 'b') => void;
}

function PuzzleSolver({ puzzle, number, variant, style, onSolved, onBack, onNext, onPlayFrom }: SolverProps) {
  // Партия мутируется на месте; bump() перерисовывает, setGame() подменяет её целиком.
  const CONCEPTS = conceptsFor(variant.id);
  const [game, setGame] = useState(() => new Game(puzzle.fen, variant));
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const [status, setStatus] = useState<Status>('play');
  const [hintLevel, setHintLevel] = useState(0);
  const [errors, setErrors] = useState(0);
  const [usedHelp, setUsedHelp] = useState(false);
  const [wrongMove, setWrongMove] = useState<Move | null>(null);
  // Решение, по которому идёт игрок: основное или одна из равноценных альтернатив.
  const [line, setLine] = useState(puzzle.line);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // В режиме решения номер следующего ожидаемого хода — это длина истории.
  const step = status === 'free' ? -1 : game.history.length;
  const solving = status === 'play' || status === 'wrong';

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setGame(new Game(puzzle.fen, variant));
    setLine(puzzle.line);
    setStatus('play');
    input.clear();
    setHintLevel(0);
    setWrongMove(null);
    bump();
  };

  const tryMove = (m: Move) => {
    const g = game;
    if (status === 'free') {
      g.play(m);
      bump();
      return;
    }
    const uci = variant.moveToUci(m);
    let cur = line;
    let ok = uci === cur[step];
    // Равноценный другой ход: дальше решение идёт по его продолжению.
    const alt = ok ? undefined : puzzle.alts?.find((a) => a.at === step && a.line[0] === uci);
    if (alt) {
      cur = [...line.slice(0, step), ...alt.line];
      setLine(cur);
      ok = true;
    }
    // На последнем ходу засчитывается любой мат.
    if (!ok && puzzle.goal === 'mate' && step === cur.length - 1) {
      const probe = new Game(puzzle.fen, variant);
      for (const u of g.uciMoves) probe.playUci(u);
      probe.play(m);
      ok = probe.result()?.reason === 'checkmate';
    }
    if (!ok) {
      setErrors((e) => e + 1);
      setWrongMove(m);
      setStatus('wrong');
      return;
    }
    setWrongMove(null);
    g.play(m);
    setHintLevel(0);
    if (step + 1 >= cur.length) {
      setStatus('solved');
      onSolved(errors === 0 && !usedHelp);
    } else {
      setStatus('reply');
      later(550, () => {
        g.playUci(cur[step + 1]);
        setStatus('play');
        bump();
      });
    }
    bump();
  };

  const input = useMoveInput(game, solving || status === 'free', tryMove, style);

  const showSolution = () => {
    timers.current.forEach(clearTimeout);
    const g = new Game(puzzle.fen, variant);
    setGame(g);
    setLine(puzzle.line);
    setStatus('shown');
    setUsedHelp(true);
    input.clear();
    setWrongMove(null);
    bump();
    puzzle.line.forEach((u, i) =>
      later(700 * (i + 1), () => {
        g.playUci(u);
        bump();
      }),
    );
  };

  /** Свободная игра: с текущей позиции, а если партия уже закончилась — с позиции задачи. */
  const startFree = () => {
    if (game.result()) setGame(new Game(puzzle.fen, variant));
    input.clear();
    setStatus('free');
    bump();
  };

  const hint = () => {
    setUsedHelp(true);
    setHintLevel((h) => Math.min(h + 1, 3));
  };

  // Подсказки: для первого хода — приём, фигура, ход; для следующих — фигура и ход.
  const expectedUci = step >= 0 ? line[step] : undefined;
  const expectedMove = expectedUci ? variant.uciToMove(expectedUci) : null;
  const hintTexts: string[] = [];
  if (expectedMove && solving) {
    if (step === 0) hintTexts.push(...puzzle.hints.slice(0, hintLevel));
    else {
      const probe = new Game(game.fen, variant);
      const h = probe.play(expectedMove);
      const name = variant.pieceInfo(h.piece).ru.toLowerCase();
      if (hintLevel >= 1)
        hintTexts.push(expectedMove.from < 0 ? `Поставьте из руки: ${name}.` : `Ходит ${name} с ${variant.squareName(expectedMove.from)}.`);
      if (hintLevel >= 2) hintTexts.push(`Ход: ${variant.formatMove(h)}.`);
    }
  }
  const maxHints = step === 0 ? 3 : 2;
  const hintSquare = solving && expectedMove && expectedMove.from >= 0 && (step === 0 ? hintLevel >= 2 : hintLevel >= 1) ? expectedMove.from : null;
  const arrows: Arrow[] =
    solving && expectedMove && hintLevel >= maxHints
      ? [{ from: expectedMove.from, to: expectedMove.to, drop: expectedMove.drop, side: game.turn, color: '#1f8a4c', main: true }]
      : [];
  if (wrongMove && status === 'wrong')
    arrows.push({ from: wrongMove.from, to: wrongMove.to, drop: wrongMove.drop, side: game.turn, color: '#7b8794', dashed: true });

  const last = game.history[game.history.length - 1];
  const result = game.result();
  const checkSquare = (!result || result.reason === 'checkmate') && game.inCheck() ? variant.kingSquare(game.position.board, game.turn) : null;
  const targets = input.targets;
  const done = status === 'solved' || status === 'shown' || status === 'free';
  const animating = status === 'shown' && game.history.length < line.length;

  return (
    <main className="layout">
      <div className="board-area">
        <div className="board-column">
          <div className="board-wrap">
            <Board
              board={game.position.board}
              style={style}
              flipped={puzzle.solver === 'b'}
              selected={input.selected ?? hintSquare}
              targets={targets}
              lastMove={last ? last.move : null}
              checkSquare={checkSquare}
              arrows={arrows}
              onSquareClick={input.onSquareClick}
              variant={variant}
              hands={game.position.hands}
              selectedDrop={input.selectedDrop}
              turn={game.turn}
              onHandClick={solving || status === 'free' ? input.onHandClick : undefined}
            />
            {input.dialog}
          </div>
        </div>
      </div>
      <aside className="side">
        <div className="panel puzzle-panel">
          <div className="ai-head">
            <b>
              Задача № {number}: {puzzle.title}
            </b>
            <button className="btn small-btn" onClick={onBack}>
              К списку
            </button>
          </div>
          <div className="puzzle-meta">
            <span className={`lvl lvl-${puzzle.level.n}`} title={puzzle.level.rank}>
              {puzzle.level.ru} · {puzzle.level.rank}
            </span>
          </div>
          <p className="puzzle-desc">{puzzle.description}</p>
          <div className="concept-chips">
            {puzzle.concepts.map((c) => (
              <span key={c} className="chip" title={CONCEPTS[c].about}>
                {CONCEPTS[c].ru}
              </span>
            ))}
          </div>

          {status === 'play' && <div className="puzzle-status">Ваш ход: вы играете за {variant.sidesGen[puzzle.solver]}.</div>}
          {status === 'wrong' && <div className="alert check">Не тот ход. Попробуйте ещё раз или возьмите подсказку.</div>}
          {status === 'reply' && <div className="puzzle-status">Верно! Соперник отвечает…</div>}
          {status === 'solved' && (
            <div className="alert game-over">
              <b>Задача решена!</b> {errors === 0 && !usedHelp ? 'С первой попытки и без подсказок.' : ''}
            </div>
          )}
          {status === 'shown' && <div className="puzzle-status">{animating ? 'Показываю решение…' : 'Решение показано.'}</div>}
          {status === 'free' && (
            <div className="puzzle-status">
              Свободная игра: ходите за обе стороны как угодно.{' '}
              {result && <b>Партия окончена: {result.winner ? `победа — ${variant.sides[result.winner]}` : 'ничья'}.</b>}
            </div>
          )}

          {hintTexts.length > 0 && (
            <ul className="hint-list">
              {hintTexts.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}

          <div className="ai-buttons">
            {solving && (
              <>
                <button className="btn primary" onClick={hint} disabled={hintLevel >= maxHints}>
                  Подсказка {hintLevel > 0 ? `(${hintLevel}/${maxHints})` : ''}
                </button>
                <button className="btn" onClick={showSolution}>
                  Показать решение
                </button>
              </>
            )}
            {(done || status === 'wrong') && (
              <button className="btn" onClick={reset}>
                Заново
              </button>
            )}
            {done && !animating && status !== 'free' && (
              <button
                className="btn"
                onClick={startFree}
                title={result ? 'Партия окончена — свободная игра начнётся с позиции задачи' : 'Продолжить с этой позиции без проверки ходов'}
              >
                Свободная игра
              </button>
            )}
            {status === 'free' && (
              <button
                className="btn"
                onClick={() => {
                  game.undo();
                  bump();
                }}
                disabled={game.history.length === 0}
              >
                Отменить ход
              </button>
            )}
            {done && !animating && (
              <button
                className="btn"
                onClick={() => (result ? onPlayFrom(puzzle.fen, puzzle.solver) : onPlayFrom(game.fen, game.turn))}
                title={result ? 'Обычная партия с компьютером с позиции задачи' : 'Обычная партия с компьютером из текущей позиции'}
              >
                Играть с компьютером
              </button>
            )}
            {onNext && done && !animating && (
              <button className="btn primary" onClick={onNext}>
                Следующая задача
              </button>
            )}
          </div>

          {done && !animating && (
            <div className="puzzle-solution">
              <div>
                <b>Решение:</b> {puzzle.solution.join(', ')}
              </div>
              <p>{puzzle.explanation}</p>
              {puzzle.concepts.map((c) => (
                <p key={c} className="small">
                  <b>{CONCEPTS[c].ru}{CONCEPTS[c].ko ? ` (${CONCEPTS[c].ko})` : ''}.</b> {CONCEPTS[c].about}
                </p>
              ))}
            </div>
          )}
          {puzzle.source && (
            <div className="muted small puzzle-source">
              Источник: {puzzle.source.author}
              {puzzle.source.title ? `. ${puzzle.source.title}` : ''}
              {puzzle.source.url && (
                <>
                  {'. '}
                  <span className="source-url">{puzzle.source.url}</span>
                </>
              )}
            </div>
          )}
        </div>
        {status === 'free' && variant.hasPass && (
          <div className="panel controls">
            <button
              className="btn"
              onClick={() => {
                const g = variant.kingSquare(game.position.board, game.turn);
                const m = { from: g, to: g };
                if (game.isLegal(m)) tryMove(m);
              }}
              disabled={!!result || !game.legalMoves().some(isPass)}
            >
              Пропустить ход
            </button>
          </div>
        )}
      </aside>
    </main>
  );
}
