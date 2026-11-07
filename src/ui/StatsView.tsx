import { useMemo, useState } from 'react';
import { END_REASON_RU } from '../core/game';
import { plural, type Color, type EndReason, type Variant } from '../core/types';
import { VARIANTS } from '../core/variants';
import { botStats, deleteRecord, humanStats, loadRecords, outcome, type GameRecord, type Tally } from '../history/store';

interface Props {
  /** Игра, выбранная в шапке. */
  variant: Variant;
  /** Открыть партию на доске с разбором; false — партию не удалось восстановить. */
  onOpen: (r: GameRecord) => boolean;
}

/** Сколько партий показывать в списке сразу. */
const PAGE = 30;

const pct = (a: number | null) => (a === null ? '—' : `${Math.round(a)}%`);
const winRate = (t: Tally) => (t.games ? `${Math.round(((t.win + t.draw / 2) / t.games) * 100)}%` : '—');

function sideName(r: GameRecord, c: Color) {
  return (VARIANTS as Record<string, Variant | undefined>)[r.game]?.sides[c] ?? (c === 'w' ? 'Первые' : 'Вторые');
}

function reasonText(r: GameRecord) {
  const v = (VARIANTS as Record<string, Variant | undefined>)[r.game];
  const reason = r.result.reason as EndReason;
  return v?.endReasons[reason] ?? END_REASON_RU[reason] ?? String(r.result.reason);
}

function formatDate(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `сегодня, ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })}, ${time}`;
}

function TallyLine({ t }: { t: Tally }) {
  return (
    <>
      <td>{t.games}</td>
      <td className="st-win">{t.win}</td>
      <td className="st-loss">{t.loss}</td>
      <td>{t.draw}</td>
      <td>{winRate(t)}</td>
      <td title={t.reviewed ? `по ${t.reviewed} ${plural(t.reviewed, 'разобранной партии', 'разобранным партиям', 'разобранным партиям')}` : 'Разберите партию, чтобы узнать точность'}>
        {pct(t.accuracy)}
      </td>
    </>
  );
}

export function StatsView({ variant, onOpen }: Props) {
  const [records, setRecords] = useState(loadRecords);
  const [scope, setScope] = useState<'game' | 'all'>('game');
  const [shown, setShown] = useState(PAGE);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const list = useMemo(() => (scope === 'all' ? records : records.filter((r) => r.game === variant.id)), [records, scope, variant.id]);
  const bot = useMemo(() => botStats(list), [list]);
  const human = useMemo(() => humanStats(list), [list]);
  const allGames = scope === 'all';

  const remove = (id: string) => {
    deleteRecord(id);
    setRecords(loadRecords());
    setConfirmDelete(null);
  };

  const open = (r: GameRecord) => {
    setFailed(onOpen(r) ? null : r.id);
  };

  return (
    <div className="puzzles stats">
      <div className="puzzles-head">
        <div>
          <h2>Статистика</h2>
          <div className="muted">
            {list.length
              ? `${list.length} ${plural(list.length, 'завершённая партия', 'завершённые партии', 'завершённых партий')}${allGames ? ' во всех играх' : ` в ${variant.name}`}.`
              : 'Здесь появятся завершённые партии: результат, число ходов и точность после разбора.'}
          </div>
        </div>
        <div className="segmented level-filter">
          <button className={!allGames ? 'active' : ''} onClick={() => setScope('game')}>
            {variant.name}
          </button>
          <button className={allGames ? 'active' : ''} onClick={() => setScope('all')}>
            Все игры
          </button>
        </div>
      </div>

      {bot.total.games > 0 && (
        <div className="panel stats-panel">
          <b>Партии с компьютером</b>
          <div className="stats-tiles">
            <div className="stat-tile">
              <span className="stat-num">{bot.total.games}</span>
              <span className="muted small">{plural(bot.total.games, 'партия', 'партии', 'партий')}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-num st-win">{bot.total.win}</span>
              <span className="muted small">{plural(bot.total.win, 'победа', 'победы', 'побед')}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-num st-loss">{bot.total.loss}</span>
              <span className="muted small">{plural(bot.total.loss, 'поражение', 'поражения', 'поражений')}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-num">{bot.total.draw}</span>
              <span className="muted small">{plural(bot.total.draw, 'ничья', 'ничьи', 'ничьих')}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-num">{pct(bot.total.accuracy)}</span>
              <span className="muted small">средняя точность</span>
            </div>
          </div>
          <div className="stats-table-wrap">
            <table className="review-stats stats-table">
              <thead>
                <tr>
                  <th>Уровень</th>
                  <th>Партий</th>
                  <th>Побед</th>
                  <th>Пораж.</th>
                  <th>Ничьих</th>
                  <th title="Доля набранных очков: победа — 1, ничья — ½">Очки</th>
                  <th>Точность</th>
                </tr>
              </thead>
              <tbody>
                {bot.byLevel.map((l) => (
                  <tr key={l.level}>
                    <td>
                      {l.level ? `${l.level}. ` : ''}
                      {l.name}
                    </td>
                    <TallyLine t={l.tally} />
                  </tr>
                ))}
                {!allGames &&
                  (['w', 'b'] as const).map(
                    (c) =>
                      bot.byColor[c].games > 0 && (
                        <tr key={c} className="stats-sub">
                          <td>
                            Вы — <span className={c === 'w' ? 'cho' : 'han'}>{variant.sides[c]}</span>
                          </td>
                          <TallyLine t={bot.byColor[c]} />
                        </tr>
                      ),
                  )}
              </tbody>
            </table>
          </div>
          <div className="muted small">Партии, начатые с позиции из задачи, в счёт не идут. Точность считается по партиям, которые вы разобрали.</div>
        </div>
      )}

      {human.games > 0 && (
        <div className="panel stats-panel">
          <b>Партии двух игроков</b>
          <div>
            {human.games} {plural(human.games, 'партия', 'партии', 'партий')}
            {!allGames && (
              <>
                . Побед: <span className="cho">{variant.sides.w}</span> — {human.wins.w},{' '}
                <span className="han">{variant.sides.b}</span> — {human.wins.b}
                {human.draws > 0 && `, ничьих — ${human.draws}`}
              </>
            )}
            .
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="panel stats-panel">
          <b>Последние партии</b>
          <ul className="game-log">
            {list.slice(0, shown).map((r) => {
              const o = outcome(r);
              const supported = r.game in VARIANTS;
              const acc = r.humanColor ? r.accuracy?.[r.humanColor] : undefined;
              return (
                <li key={r.id} className={`game-row${o ? ` game-${o}` : ''}`}>
                  <div className="game-main">
                    <span className="game-result">
                      {o === 'win' ? 'Победа' : o === 'loss' ? 'Поражение' : o === 'draw' ? 'Ничья' : r.result.winner ? `Победа: ${sideName(r, r.result.winner)}` : 'Ничья'}
                    </span>
                    <span className="muted small">{reasonText(r)}</span>
                  </div>
                  <div className="game-meta small">
                    {allGames && <span>{r.gameName}</span>}
                    <span>
                      {r.mode === 'bot' ? `Компьютер: ${r.levelName ?? `уровень ${r.level}`}` : 'Два игрока'}
                      {r.mode === 'bot' && r.humanColor && (
                        <>
                          , вы за <span className={r.humanColor === 'w' ? 'cho' : 'han'}>{sideName(r, r.humanColor)}</span>
                        </>
                      )}
                      {r.custom && ', с позиции'}
                    </span>
                    <span>
                      {r.moves.length} {plural(r.moves.length, 'полуход', 'полухода', 'полуходов')}
                    </span>
                    <span>
                      {r.mode === 'bot' && r.humanColor
                        ? acc !== undefined && `точность ${Math.round(acc)}%`
                        : r.accuracy && (['w', 'b'] as const).filter((c) => r.accuracy?.[c] !== undefined).map((c) => `${sideName(r, c)} ${Math.round(r.accuracy![c]!)}%`).join(', ')}
                    </span>
                    <span className="muted">{formatDate(r.endedAt)}</span>
                  </div>
                  <div className="game-actions">
                    {confirmDelete === r.id ? (
                      <>
                        <button className="btn small-btn danger" onClick={() => remove(r.id)}>
                          Удалить
                        </button>
                        <button className="btn small-btn" onClick={() => setConfirmDelete(null)}>
                          Отмена
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn small-btn" onClick={() => open(r)} disabled={!supported} title={supported ? 'Открыть партию и разобрать' : 'Эта игра не поддерживается в этой версии'}>
                          Разобрать
                        </button>
                        <button className="icon-btn" onClick={() => setConfirmDelete(r.id)} aria-label="Удалить партию" title="Удалить партию">
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                  {failed === r.id && <div className="small st-loss">Не удалось восстановить партию: ходы не подходят к правилам этой версии.</div>}
                </li>
              );
            })}
          </ul>
          {list.length > shown && (
            <button className="btn" onClick={() => setShown((s) => s + PAGE)}>
              Показать ещё
            </button>
          )}
        </div>
      )}
    </div>
  );
}
