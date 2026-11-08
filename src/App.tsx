import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Evaluator, gameAtPly, HINT_DEPTH, LIVE_DEPTH, MULTIPV, type MoveReview } from './analysis/evaluator';
import { accuracy, cpForCho, winPercent } from './analysis/quality';
import { endReasonText, Game } from './core/game';
import { setupName, startFenWithSetups, type Setup } from './core/rules';
import { autoSetupMove, inSetup } from './core/sittuyin';
import { isPass, opposite, type Color, type GameId, type Move } from './core/types';
import { getVariant, VARIANTS } from './core/variants';
import { analysisThreads, BOT_LEVELS, formatScore, getEngine, type PvInfo } from './engine/engine';
import { applyTheme, effectiveTheme, loadConfig, loadPrefs, saveConfig, savePrefs, type GameConfig, type Theme } from './settings';
import { AiPanel, ARROW_COLORS, REPLY_COLOR, type EngineStatus, type ShownLines } from './ui/AiPanel';
import { Board, type Arrow } from './ui/Board';
import { GamePicker } from './ui/GamePicker';
import { Modal } from './ui/Modal';
import { MoveList } from './ui/MoveList';
import { NewGameDialog } from './ui/NewGameDialog';
import { PuzzlesView } from './ui/PuzzlesView';
import { TrainingView } from './ui/TrainingView';
import { StatsView } from './ui/StatsView';
import { HistoryView } from './ui/HistoryView';
import { newRecordId, patchRecord, putRecord, type GameRecord } from './history/store';
import { ReviewPanel } from './ui/ReviewPanel';
import { RulesDialog } from './ui/RulesDialog';
import { MnemonicsDialog } from './ui/MnemonicsDialog';
import { markMnemonicsSeen, MNEMONICS, mnemonicsSeen } from './ui/mnemonics';
import { ScorePanel } from './ui/ScorePanel';
import { useMoveInput } from './ui/moveInput';
import { allPuzzles } from './puzzles';
import { lessonsFor } from './training';
import './App.css';
import './theme-dark.css';

/** Непрерывный анализ: варианты показываются не мельче этой глубины и не чаще, чем раз в столько мс. */
const ANALYSIS_MIN_DEPTH = 10;
const ANALYSIS_THROTTLE_MS = 800;

function newGame(c: GameConfig) {
  const v = getVariant(c.variant);
  return v.id === 'janggi' ? new Game(startFenWithSetups(c.choSetup, c.hanSetup), v) : new Game(undefined, v);
}

/** Для разработки и тестов: ?fen=… открывает партию двух игроков с заданной позиции. */
const DEV_PARAMS = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
const DEV_FEN = DEV_PARAMS?.get('fen') ?? null;
/** ?bot=b — в позиции из ?fen= за Хана играет компьютер. */
const DEV_BOT = DEV_PARAMS?.get('bot') as 'w' | 'b' | null;

type View = 'game' | 'puzzles' | 'training' | 'stats' | 'history';
const SECTIONS: [View, string][] = [
  ['game', 'Партия'],
  ['puzzles', 'Задачи'],
  ['training', 'Обучение'],
  ['history', 'История'],
  ['stats', 'Статистика'],
];

export default function App() {
  const [config, setConfig] = useState<GameConfig>(() => (DEV_FEN ? { ...loadConfig(), mode: DEV_BOT ? 'bot' : 'human', humanColor: DEV_BOT === 'w' ? 'b' : 'w' } : loadConfig()));
  const [prefs, setPrefs] = useState(loadPrefs);
  const gameRef = useRef<Game>(DEV_FEN ? new Game(DEV_FEN, getVariant(config.variant)) : newGame(config));
  /** Партия начата с обычной расстановки (а не с позиции из задачи или ?fen=). */
  const [fromSetups, setFromSetups] = useState(!DEV_FEN && config.variant === 'janggi');
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const game = gameRef.current;
  const variant = game.variant;
  /** Игра, предложенная в диалоге новой партии (при переключении игры в заголовке). */
  const [dialogVariant, setDialogVariant] = useState<GameId | null>(null);

  const [flipped, setFlipped] = useState(config.mode === 'bot' && config.humanColor === 'b');
  const [showNewGame, setShowNewGame] = useState(!DEV_FEN);
  const [showRules, setShowRules] = useState(false);
  /** Подсказки по иероглифам: сами открываются в первой партии с иероглифами в каждой игре. */
  const [showMnemonics, setShowMnemonics] = useState(
    () => !DEV_FEN && config.pieceStyle === 'hanja' && !mnemonicsSeen(config.variant),
  );
  const [view, setView] = useState<View>(() => {
    const v = DEV_PARAMS?.get('view');
    return v === 'puzzles' || v === 'training' || v === 'stats' || v === 'history' ? v : 'game';
  });
  const [resultClosed, setResultClosed] = useState(false);

  // Журнал партий: id записи текущей партии и что уже записано.
  const recordId = useRef(newRecordId());
  const recordedKey = useRef('');
  /** Партия открыта из журнала (тогда её настройки не трогают сохранённые настройки новой партии). */
  const [openedRecord, setOpenedRecord] = useState(false);

  const [engineStatus, setEngineStatus] = useState<EngineStatus>({ state: 'loading' });
  const [analysisOn, setAnalysisOn] = useState(false);
  const [lines, setLines] = useState<ShownLines | null>(null);
  const [thinking, setThinking] = useState<'bot' | 'hint' | 'eval' | null>(null);
  const [hintDepth, setHintDepth] = useState(0);
  const token = useRef(0);

  // Разбор и оценка ходов
  const [reviews, setReviews] = useState<Record<number, MoveReview>>({});
  const reviewsRef = useRef(reviews);
  reviewsRef.current = reviews;
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<{ done: number; total: number } | null>(null);
  const reviewing = reviewProgress !== null;

  const engine = getEngine();
  const evaluator = useMemo(() => new Evaluator(engine), [engine]);
  const result = game.result();
  const botTurn = config.mode === 'bot' && game.turn !== config.humanColor && !result;
  const viewing = viewPly !== null && viewPly !== game.history.length;
  const humanCanMove = !result && !botTurn && !viewing && !reviewing;

  // Завершённая партия попадает в журнал; та же партия после отмены хода и нового окончания перезаписывается.
  useEffect(() => {
    const g = gameRef.current;
    const r = g.result();
    if (!r || !g.history.length) return;
    const key = `${g.uciMoves.join(' ')}|${r.reason}|${r.winner}`;
    if (recordedKey.current === key) return;
    recordedKey.current = key;
    const custom = !fromSetups && g.startFen !== g.variant.startFen;
    putRecord({
      v: 1,
      id: recordId.current,
      game: g.variant.id,
      gameName: g.variant.name,
      mode: config.mode,
      humanColor: config.mode === 'bot' ? config.humanColor : undefined,
      level: config.mode === 'bot' ? config.level : undefined,
      levelName: config.mode === 'bot' ? BOT_LEVELS.find((l) => l.id === config.level)?.name : undefined,
      custom: custom || undefined,
      setups: fromSetups && g.variant.id === 'janggi' ? { w: config.choSetup, b: config.hanSetup } : undefined,
      startFen: g.startFen,
      moves: g.uciMoves,
      result: { winner: r.winner, reason: r.reason },
      endedAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Когда разобраны все ходы завершённой партии, точность сохраняется в журнал.
  useEffect(() => {
    const g = gameRef.current;
    const n = g.history.length;
    if (reviewing || !n || !g.result() || !recordedKey.current) return;
    const all = Array.from({ length: n }, (_, i) => reviews[i + 1]);
    if (all.some((r) => !r)) return;
    const acc: Partial<Record<Color, number>> = {};
    for (const c of ['w', 'b'] as const) {
      const a = accuracy(all.filter((r) => r.mover === c).map((r) => r.loss));
      if (a !== null) acc[c] = Math.round(a * 10) / 10;
    }
    patchRecord(recordId.current, { accuracy: acc, accuracyDepth: Math.min(...all.map((r) => r.before.depth)) });
  }, [reviews, reviewing]);

  useEffect(() => {
    engine
      .init()
      .then(() => setEngineStatus({ state: 'ready', name: engine.name }))
      .catch((e: Error) => setEngineStatus({ state: 'error', message: e.message }));
  }, [engine]);

  // Оценка последнего хода, ход бота и непрерывный анализ — строго по очереди.
  useEffect(() => {
    // Во время разбора движок занят им; токен не трогаем, чтобы не прервать разбор.
    if (reviewing) return;
    const my = ++token.current;
    engine.stop();
    setLines(null);
    if (engineStatus.state !== 'ready' || showNewGame || view !== 'game') {
      setThinking(null);
      return;
    }
    const g = gameRef.current;
    const n = g.history.length;
    void (async () => {
      if (prefs.evalMoves && n > 0 && !reviewsRef.current[n]) {
        setThinking('eval');
        const r = await evaluator.reviewMove(g, n, LIVE_DEPTH);
        if (my !== token.current) return;
        if (r) setReviews((prev) => ({ ...prev, [n]: r }));
      }
      if (g.result()) {
        setThinking(null);
        return;
      }
      const fen = g.startFen;
      const moves = g.uciMoves;
      const posFen = g.fen;
      const turn = g.turn;
      const engineVariant = g.variant.engine;
      if (config.mode === 'bot' && g.turn !== config.humanColor) {
        const level = BOT_LEVELS.find((l) => l.id === config.level) ?? BOT_LEVELS[0];
        setThinking('bot');
        const startedAt = Date.now();
        const r = await engine.search({
          variant: engineVariant,
          fen,
          moves,
          movetime: level.movetime,
          elo: level.elo,
          skill: level.skill,
          threads: level.allThreads ? analysisThreads() : 1,
        });
        if (my !== token.current || !r.bestmove) return;
        // Небольшая пауза, чтобы ход бота был заметен
        await new Promise((res) => setTimeout(res, Math.max(0, 350 - (Date.now() - startedAt))));
        if (my !== token.current) return;
        try {
          g.playUci(r.bestmove);
        } catch (e) {
          console.error(e);
        }
        setThinking(null);
        setViewPly(null);
        bump();
      } else if (analysisOn) {
        setThinking(null);
        // Показываем только полностью досчитанные глубины и не чаще раза в ANALYSIS_THROTTLE_MS,
        // чтобы стрелки и оценка не мелькали.
        let lastShown = 0;
        let pending: PvInfo[] | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const publish = () => {
          timer = null;
          if (!pending || my !== token.current) return;
          setLines({ fen: posFen, turn, lines: pending, kind: 'analysis' });
          lastShown = Date.now();
          pending = null;
        };
        void engine.search({
          variant: engineVariant,
          fen,
          moves,
          infinite: true,
          multipv: MULTIPV,
          expectedLines: Math.min(MULTIPV, g.legalMoves().length),
          threads: analysisThreads(),
          onDepth: (ls) => {
            if (my !== token.current || (ls[0]?.depth ?? 0) < ANALYSIS_MIN_DEPTH) return;
            pending = ls;
            const wait = ANALYSIS_THROTTLE_MS - (Date.now() - lastShown);
            if (wait <= 0) publish();
            else if (!timer) timer = setTimeout(publish, wait);
          },
        });
      } else {
        setThinking(null);
      }
    })();
    return () => {
      // Если управление уже перехватил другой поиск (подсказка, разбор), не мешаем ему.
      if (token.current === my) engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, analysisOn, prefs.evalMoves, engineStatus.state, showNewGame, config, reviewing, view]);

  const requestHint = useCallback(() => {
    if (!humanCanMove || engineStatus.state !== 'ready') return;
    const my = ++token.current;
    engine.stop();
    const g = gameRef.current;
    const posFen = g.fen;
    const turn = g.turn;
    setThinking('hint');
    setHintDepth(0);
    // Подсказка считается до фиксированной глубины и кэшируется: повторное нажатие даёт тот же ответ,
    // а оценка сыгранного хода опирается на тот же расчёт.
    void evaluator
      .evaluate(g, g.history.length, HINT_DEPTH, (d) => my === token.current && setHintDepth(d))
      .then((ev) => {
        if (my !== token.current) return;
        setThinking(null);
        if (ev && !ev.terminal) setLines({ fen: posFen, turn, lines: ev.lines, kind: 'hint' });
      });
  }, [engine, evaluator, engineStatus.state, humanCanMove]);

  const startReview = async (depth: number) => {
    const my = ++token.current;
    engine.stop();
    setThinking(null);
    const g = gameRef.current;
    const n = g.history.length;
    setReviewProgress({ done: 0, total: n });
    for (let ply = 1; ply <= n; ply++) {
      const r = await evaluator.reviewMove(g, ply, depth);
      if (my !== token.current) return;
      if (!r) break;
      setReviews((x) => ({ ...x, [ply]: r }));
      setReviewProgress({ done: ply, total: n });
    }
    // Оценка итоговой позиции — для графика
    await evaluator.evaluate(g, n, depth);
    if (my !== token.current) return;
    setReviewProgress(null);
  };

  const stopReview = () => {
    token.current++;
    engine.stop();
    setReviewProgress(null);
  };

  const play = (m: Move) => {
    if (!game.isLegal(m)) return;
    game.play(m);
    setViewPly(null);
    bump();
  };

  const input = useMoveInput(game, humanCanMove, play, config.pieceStyle);

  // Ситтуйин: «Расставить за меня» — оставшиеся фигуры человека ставятся по готовой схеме.
  const [autoSetup, setAutoSetup] = useState(false);
  const setupPhase = !!variant.handsOnlyAtStart && inSetup(game.position);
  useEffect(() => setAutoSetup(false), [game]);
  useEffect(() => {
    if (!autoSetup) return;
    if (!setupPhase) return setAutoSetup(false);
    if (!humanCanMove) return;
    const t = setTimeout(() => {
      const m = autoSetupMove(game.position);
      if (m) play(m);
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSetup, version, humanCanMove, setupPhase]);

  const onSquareClick = (s: number) => {
    if (viewing) {
      setViewPly(null);
      return;
    }
    input.onSquareClick(s);
  };

  const pass = () => {
    const g = variant.kingSquare(game.position.board, game.turn);
    input.clear();
    play({ from: g, to: g });
  };

  const dropReviewsAfter = (n: number) =>
    setReviews((x) => Object.fromEntries(Object.entries(x).filter(([k]) => Number(k) <= n)));

  const undo = () => {
    token.current++;
    engine.stop();
    setReviewProgress(null);
    if (config.mode === 'bot') {
      game.undo();
      while (game.history.length && game.turn !== config.humanColor) game.undo();
    } else game.undo();
    dropReviewsAfter(game.history.length);
    if (openedRecord) {
      // Партию из журнала продолжили — это уже новая партия, старую запись не трогаем.
      recordId.current = newRecordId();
      recordedKey.current = '';
      setOpenedRecord(false);
    }
    input.clear();
    setViewPly(null);
    setResultClosed(false);
    bump();
  };

  const startGame = (c: GameConfig, fen?: string) => {
    token.current++;
    engine.stop();
    if (!fen) saveConfig(c);
    setConfig(c);
    gameRef.current = fen ? new Game(fen, getVariant(c.variant)) : newGame(c);
    setFromSetups(!fen && c.variant === 'janggi');
    setView('game');
    setFlipped(c.mode === 'bot' && c.humanColor === 'b');
    input.clear();
    setShowNewGame(false);
    setDialogVariant(null);
    setResultClosed(false);
    setLines(null);
    setReviews({});
    setViewPly(null);
    setReviewOpen(false);
    setReviewProgress(null);
    recordId.current = newRecordId();
    recordedKey.current = '';
    setOpenedRecord(false);
    setShowMnemonics(c.pieceStyle === 'hanja' && !mnemonicsSeen(c.variant));
    bump();
  };

  /** Открывает партию из журнала на доске с панелью разбора. */
  const openRecord = (r: GameRecord): boolean => {
    const v = (VARIANTS as Record<string, (typeof VARIANTS)[GameId] | undefined>)[r.game];
    if (!v) return false;
    const g = new Game(r.startFen, v);
    try {
      for (const m of r.moves) g.playUci(m);
    } catch {
      return false;
    }
    if (r.result.reason === 'resign' && r.result.winner) g.resign(opposite(r.result.winner));
    token.current++;
    engine.stop();
    const c: GameConfig = {
      ...config,
      variant: v.id,
      mode: r.mode,
      humanColor: r.humanColor ?? 'w',
      level: r.level ?? config.level,
      choSetup: (r.setups?.w as Setup) ?? config.choSetup,
      hanSetup: (r.setups?.b as Setup) ?? config.hanSetup,
    };
    setConfig(c);
    gameRef.current = g;
    recordId.current = r.id;
    const res = g.result();
    recordedKey.current = res ? `${g.uciMoves.join(' ')}|${res.reason}|${res.winner}` : '';
    setOpenedRecord(true);
    setFromSetups(!!r.setups && !r.custom);
    setView('game');
    setFlipped(c.mode === 'bot' && c.humanColor === 'b');
    input.clear();
    setShowNewGame(false);
    setDialogVariant(null);
    setResultClosed(true);
    setLines(null);
    setReviews({});
    setViewPly(0);
    setReviewOpen(true);
    setReviewProgress(null);
    bump();
    return true;
  };

  const openNewGame = () => setShowNewGame(true);

  const closeMnemonics = () => {
    markMnemonicsSeen(shownVariant.id);
    setShowMnemonics(false);
  };

  const resign = () => {
    if (result) return;
    const loser = config.mode === 'bot' ? config.humanColor : game.turn;
    game.resign(loser);
    token.current++;
    engine.stop();
    bump();
  };

  const openReview = () => {
    setReviewOpen(true);
    setResultClosed(true);
    if (viewPly === null) setViewPly(game.history.length);
  };

  const togglePrefs = (k: 'evalMoves') => {
    const p = { ...prefs, [k]: !prefs[k] };
    setPrefs(p);
    savePrefs(p);
  };

  // Ночной режим: тема на <html>; «как в системе» следит за сменой системной темы.
  useEffect(() => {
    applyTheme(prefs.theme);
    if (prefs.theme !== 'system' || typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [prefs.theme]);
  const THEME_NEXT: Record<Theme, Theme> = { system: 'dark', dark: 'light', light: 'system' };
  const THEME_LABEL: Record<Theme, string> = { system: 'как в системе', dark: 'ночная', light: 'дневная' };
  const cycleTheme = () => {
    const p = { ...prefs, theme: THEME_NEXT[prefs.theme] };
    setPrefs(p);
    savePrefs(p);
  };

  // Листание ходов стрелками
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showNewGame || showRules || view !== 'game') return;
      const n = gameRef.current.history.length;
      const cur = viewPly ?? n;
      if (e.key === 'ArrowLeft') setViewPly(Math.max(0, cur - 1));
      else if (e.key === 'ArrowRight') setViewPly(cur + 1 >= n ? null : cur + 1);
      else if (e.key === 'Home') setViewPly(0);
      else if (e.key === 'End') setViewPly(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewPly, showNewGame, showRules, view]);

  // ---------- Что показать на доске ----------
  const n = game.history.length;
  const shownPly = viewPly ?? n;
  const shownGame = viewing ? gameAtPly(game, shownPly) : game;
  const shownEntry = shownPly > 0 ? game.history[shownPly - 1] : null;
  const targets = !viewing ? input.targets : [];
  const shownResult = shownGame.result();
  // Подсвечиваем генерала под шахом, в том числе получившего мат
  const checkSquare =
    (!shownResult || shownResult.reason === 'checkmate' || shownResult.reason === 'pawn-drop-mate') && shownGame.inCheck()
      ? variant.kingSquare(shownGame.position.board, shownGame.turn)
      : null;
  const canPass = variant.hasPass && humanCanMove && game.legalMoves().some(isPass);

  const shownLines = !viewing && lines && lines.fen === game.fen ? lines : null;
  let arrows: Arrow[] = [];
  if (shownLines) {
    arrows = shownLines.lines
      .filter((l) => l.pv.length)
      .slice(0, 3)
      .map((l, i) => {
        const m = variant.uciToMove(l.pv[0]);
        return { from: m.from, to: m.to, drop: m.drop, side: shownLines.turn, color: ARROW_COLORS[i], label: String(i + 1), main: i === 0 };
      })
      .reverse();
    const reply = shownLines.lines[0]?.pv[1];
    if (reply) {
      const m = variant.uciToMove(reply);
      arrows.unshift({ from: m.from, to: m.to, drop: m.drop, side: opposite(shownLines.turn), color: REPLY_COLOR, dashed: true });
    }
  } else if ((viewing || reviewOpen) && shownPly > 0) {
    const r = reviews[shownPly];
    if (r && r.quality !== 'best' && r.before.best) {
      const m = variant.uciToMove(r.before.best);
      arrows = [{ from: m.from, to: m.to, drop: m.drop, side: r.mover, color: '#1f8a4c', label: 'лучше', main: true }];
    }
  }

  // Шкала оценки: просматриваемая позиция или текущий анализ
  let barCp: number | null = null;
  if (shownLines?.lines[0]) barCp = cpForCho(shownLines.lines[0].score, shownLines.turn);
  else barCp = evaluator.cached(game, shownPly)?.cpCho ?? null;

  const evals = Array.from({ length: n + 1 }, (_, i) => evaluator.cached(game, i)?.cpCho);
  const lastReview = !viewing && n > 0 ? (reviews[n] ?? null) : null;

  /** Игра, которую показывает текущий раздел: в партии — игра партии, в задачах и обучении — выбранная. */
  const shownVariant = view === 'game' ? variant : getVariant(config.variant);
  const chooseGame = (id: GameId) => {
    if (view === 'game') {
      if (id === variant.id) return;
      setDialogVariant(id);
      openNewGame();
    } else {
      setConfig({ ...config, variant: id });
      // Настройки партии из журнала не должны попасть в сохранённые настройки новой партии.
      saveConfig({ ...(openedRecord ? loadConfig() : config), variant: id });
    }
  };

  return (
    <div className="app" data-game={shownVariant.id}>
      <header className="topbar">
        <GamePicker current={shownVariant} onChoose={chooseGame} />
        <nav className="sections" aria-label="Разделы">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={`tab${view === id ? ' on' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <button className="btn ghost rules-btn" onClick={() => setShowRules(true)} title={`Правила: ${shownVariant.name}`}>
            <span className="rules-text">Правила</span>
            <span className="rules-icon" aria-hidden="true">
              ?
            </span>
          </button>
          <button
            className="btn ghost theme-toggle"
            onClick={cycleTheme}
            title={`Тема: ${THEME_LABEL[prefs.theme]}. Нажмите, чтобы сменить`}
            aria-label={`Тема: ${THEME_LABEL[prefs.theme]}`}
          >
            {prefs.theme === 'system' ? '◐' : effectiveTheme(prefs.theme) === 'dark' ? '☾' : '☀'}
          </button>
          <button className="btn primary new-game-btn" onClick={openNewGame}>
            Новая партия
          </button>
        </div>
      </header>

      {(view === 'puzzles' || view === 'training') && (view === 'puzzles' ? allPuzzles(shownVariant.id) : lessonsFor(shownVariant.id)).length === 0 && (
        <main className="layout">
          <div className="panel coming-soon">
            <h2>{view === 'puzzles' ? 'Задачи' : 'Обучение'}: {shownVariant.name}</h2>
            <p>
              {view === 'puzzles' ? 'Задачи' : 'Уроки'} для этой игры появятся в следующих версиях. Пока можно прочитать правила и
              сыграть с компьютером: подсказки и разбор партии уже работают.
            </p>
            <div className="controls">
              <button className="btn" onClick={() => setShowRules(true)}>
                Правила
              </button>
              <button className="btn primary" onClick={openNewGame}>
                Новая партия
              </button>
            </div>
          </div>
        </main>
      )}
      {view === 'puzzles' && allPuzzles(shownVariant.id).length > 0 && (
        <PuzzlesView
          key={shownVariant.id}
          variant={shownVariant}
          style={config.pieceStyle}
          onPlayFrom={(fen, human) => startGame({ ...config, variant: shownVariant.id, mode: 'bot', humanColor: human }, fen)}
        />
      )}
      {view === 'training' && lessonsFor(shownVariant.id).length > 0 && <TrainingView key={shownVariant.id} variant={shownVariant} style={config.pieceStyle} />}
      {view === 'stats' && <StatsView variant={shownVariant} onOpen={openRecord} />}
      {view === 'history' && <HistoryView key={shownVariant.id} variant={shownVariant} onChoose={chooseGame} />}
      {view === 'game' && (
      <main className="layout">
        <div className="board-area">
          <div
            className={`eval-bar${barCp === null ? ' empty' : ''}`}
            title={barCp === null ? 'Включите анализ или оценку ходов' : formatScore({ cp: barCp }, variant.sides)}
          >
            <div className="eval-han" style={{ height: `${100 - (barCp === null ? 50 : winPercent(barCp))}%` }} />
          </div>
          <div className="board-column">
            {viewing && (
              <div className="view-banner">
                Просмотр: {shownPly === 0 ? 'начальная позиция' : `после ${shownPly}-го полухода`}
                <button className="btn small-btn" onClick={() => setViewPly(null)}>
                  К текущей позиции
                </button>
              </div>
            )}
            <div className="board-wrap">
              <Board
                board={shownGame.position.board}
                style={config.pieceStyle}
                flipped={flipped}
                selected={viewing ? null : input.selected}
                targets={targets}
                lastMove={shownEntry ? shownEntry.move : null}
                checkSquare={checkSquare}
                arrows={arrows}
                onSquareClick={onSquareClick}
                variant={variant}
                hands={shownGame.position.hands}
                selectedDrop={viewing ? null : input.selectedDrop}
                turn={shownGame.turn}
                onHandClick={humanCanMove ? input.onHandClick : undefined}
              />
              {input.dialog}
            </div>
          </div>
        </div>

        <aside className="side">
          <ScorePanel game={shownGame} style={config.pieceStyle} />

          {fromSetups && (
            <div className="panel setups-line">
              <b>Расстановки:</b> Чо — {setupName(config.choSetup)}
              {config.mode === 'bot' && config.humanColor === 'b' && ' (выбрал компьютер)'}; Хан — {setupName(config.hanSetup)}
              {config.mode === 'bot' && config.humanColor === 'w' && ' (выбрал компьютер)'}.
            </div>
          )}

          <div className="panel controls">
            {setupPhase && humanCanMove && (
              <button className="btn primary" onClick={() => setAutoSetup(true)} disabled={autoSetup} title="Поставить оставшиеся фигуры по готовой схеме">
                Расставить за меня
              </button>
            )}
            {variant.hasPass && (
              <button className="btn" onClick={pass} disabled={!canPass} title="Пропустить ход (нельзя под шахом)">
                Пропустить ход
              </button>
            )}
            <button className="btn" onClick={undo} disabled={n === 0}>
              Отменить ход
            </button>
            <button className="btn" onClick={() => setFlipped((f) => !f)} title="Перевернуть доску">
              Перевернуть
            </button>
            <button className="btn danger" onClick={resign} disabled={!!result}>
              Сдаться
            </button>
          </div>

          {reviewOpen ? (
            <ReviewPanel
              game={game}
              reviews={reviews}
              evals={evals}
              viewPly={shownPly}
              progress={reviewProgress}
              onSelect={(p) => setViewPly(p >= n ? null : p)}
              onStart={(ms) => void startReview(ms)}
              onStop={stopReview}
              onClose={() => {
                stopReview();
                setReviewOpen(false);
                setViewPly(null);
              }}
            />
          ) : (
            <AiPanel
              game={game}
              status={engineStatus}
              lines={shownLines}
              thinking={thinking}
              hintDepth={hintDepth}
              botName={BOT_LEVELS.find((l) => l.id === config.level)?.name}
              analysisOn={analysisOn}
              evalMovesOn={prefs.evalMoves}
              canHint={humanCanMove}
              lastReview={lastReview}
              onHint={requestHint}
              onToggleAnalysis={() => setAnalysisOn((a) => !a)}
              onToggleEvalMoves={() => togglePrefs('evalMoves')}
              onReview={openReview}
            />
          )}

          <div className="panel moves-panel">
            <b>Ходы</b>
            <MoveList game={game} reviews={reviews} viewPly={viewPly} onSelect={(p) => setViewPly(p >= n ? null : p)} />
          </div>
        </aside>
      </main>
      )}

      {showNewGame && (
        <NewGameDialog
          key={dialogVariant ?? 'current'}
          initial={{ ...(openedRecord ? loadConfig() : config), variant: dialogVariant ?? (view === 'game' ? variant.id : config.variant) }}
          onStart={startGame}
          onClose={
            n || version > 0
              ? () => {
                  setShowNewGame(false);
                  setDialogVariant(null);
                }
              : undefined
          }
        />
      )}
      {showRules && (
        <RulesDialog
          variant={shownVariant}
          style={config.pieceStyle}
          onClose={() => setShowRules(false)}
          onMnemonics={
            MNEMONICS[shownVariant.id]
              ? () => {
                  setShowRules(false);
                  setShowMnemonics(true);
                }
              : undefined
          }
        />
      )}
      {showMnemonics && !showNewGame && MNEMONICS[shownVariant.id] && <MnemonicsDialog variant={shownVariant} onClose={closeMnemonics} />}
      {/* Пока открыт диалог новой партии, окно итогов не показываем: раньше оно оставалось поверх диалога и кнопка «Новая партия» как будто не работала. */}
      {result && !resultClosed && !showNewGame && view === 'game' && (
        <Modal
          title="Партия окончена"
          onClose={() => setResultClosed(true)}
          footer={
            <>
              <button className="btn" onClick={() => setResultClosed(true)}>
                Посмотреть доску
              </button>
              <button className="btn" onClick={openReview} disabled={engineStatus.state !== 'ready'}>
                Разбор партии
              </button>
              <button className="btn primary" onClick={openNewGame}>
                Новая партия
              </button>
            </>
          }
        >
          {result.winner ? (
            <p className="result-line">
              Победа: <b className={result.winner === 'w' ? 'cho' : 'han'}>{variant.sides[result.winner]}</b>
              {result.reason === 'resign' && ` — ${variant.sides[opposite(result.winner)]} ${variant.pluralSides ? 'сдались' : 'сдался'}`}
            </p>
          ) : (
            <p className="result-line">
              <b>Ничья</b>
            </p>
          )}
          <p>{endReasonText(game, result)}</p>
          {config.mode === 'bot' && (
            <p className="muted">
              {result.winner === config.humanColor
                ? 'Поздравляем!'
                : result.winner
                  ? 'Попробуйте ещё раз или выберите уровень полегче.'
                  : 'Неплохо! Попробуйте выиграть в следующий раз.'}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
