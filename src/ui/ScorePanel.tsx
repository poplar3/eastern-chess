import type { Game } from '../core/game';
import { endReasonText } from '../core/game';
import { HAN_BONUS, materialPoints, pointsWinner } from '../core/rules';
import { HAND_ORDER } from '../core/shogi';
import { opposite, type Color } from '../core/types';
import { PieceIcon, type PieceStyle } from './pieces';

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export function ScorePanel({ game, style }: { game: Game; style: PieceStyle }) {
  const v = game.variant;
  const S = v.sides;
  const board = game.position.board;
  const result = game.result();
  const captured = game.captured();
  const last = game.history[game.history.length - 1];
  const pts: Record<Color, number> | null = v.hasPoints ? { w: materialPoints(board, 'w'), b: materialPoints(board, 'b') } : null;
  const leader = v.hasPoints ? pointsWinner(board) : null;

  return (
    <div className="panel score-panel">
      <div className="score-rows">
        {(['w', 'b'] as const).map((c) => (
          <div key={c} className={`score-row ${c === 'w' ? 'cho' : 'han'}${game.turn === c && !result ? ' to-move' : ''}`}>
            <PieceIcon piece={c === 'w' ? 'K' : 'k'} style={style} size={30} game={v.id} />
            <div className="score-name">
              {S[c]}
              {game.turn === c && !result && <span className="turn-badge">ходит</span>}
            </div>
            {pts && (
              <div className="score-value" title={c === 'b' ? `включая ${fmt(HAN_BONUS)} очка компенсации` : undefined}>
                {fmt(pts[c])}
              </div>
            )}
          </div>
        ))}
      </div>
      {pts && leader && (
        <>
          <div className="score-bar" title="Соотношение очков">
            <div className="score-bar-cho" style={{ width: `${(pts.w / (pts.w + pts.b)) * 100}%` }} />
          </div>
          <div className="score-summary">
            По очкам ведёт <b className={leader === 'w' ? 'cho' : 'han'}>{S[leader]}</b> на {fmt(Math.abs(pts.w - pts.b))}
            <span className="muted"> (у Хана +1,5 за второй ход)</span>
          </div>
        </>
      )}

      {result && (
        <div className={`alert game-over ${result.winner === 'w' ? 'cho' : result.winner === 'b' ? 'han' : ''}`} role="status">
          <b>{result.reason === 'checkmate' ? 'Мат!' : 'Партия окончена.'}</b>{' '}
          {result.winner ? (
            <>
              Победа: <b>{S[result.winner]}</b>.
            </>
          ) : (
            <b>Ничья.</b>
          )}
          {result.reason !== 'checkmate' && <> {endReasonText(game, result)}.</>}
        </div>
      )}
      {!result && game.bikjang && leader && (
        <div className="alert bikjang">
          <b>Биджанг!</b> Генералы смотрят друг на друга. {S[game.turn]} должен разорвать биджанг
          или пропустить ход — тогда партия закончится подсчётом очков, и победит <b>{S[leader]}</b>.
        </div>
      )}
      {!result && game.inCheck() && (
        <div className="alert check">
          <b>Шах!</b> {v.pluralSides ? `${S[game.turn]} должны защитить ${v.kingAcc}.` : `${S[game.turn]} должен защитить ${v.kingAcc}.`}
        </div>
      )}

      {v.hasHands ? (
        <div className="captured">
          {(['w', 'b'] as const).map((c) => {
            const hand = game.position.hands?.[c] ?? {};
            const items = HAND_ORDER.filter((t) => hand[t]);
            return (
              <div key={c} className="captured-row">
                <span className="muted">В руке у {v.sidesGen[c]}:</span>
                {items.length === 0 && <span className="muted"> —</span>}
                {items.map((t) => (
                  <span key={t} className="hand-chip">
                    <PieceIcon piece={c === 'w' ? t : t.toLowerCase()} style={style} size={22} game={v.id} />
                    {hand[t]! > 1 && <span className="small">×{hand[t]}</span>}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="captured">
          {(['w', 'b'] as const).map((c) => (
            <div key={c} className="captured-row">
              <span className="muted">
                {S[c]} {v.pluralSides ? 'взяли' : 'взял'}:
              </span>
              {captured[c].length === 0 && <span className="muted"> —</span>}
              {captured[c].map((p, i) => (
                <PieceIcon key={i} piece={p} style={style} size={22} game={v.id} />
              ))}
            </div>
          ))}
        </div>
      )}
      {!result && v.countingText?.(game.start, game.history) && <div className="muted small">{v.countingText(game.start, game.history)}</div>}
      {v.moveLimitPlies > 0 && (
        <div className="muted small">
          {v.id === 'shatranj' ? 'Без взятий и ходов пешек' : 'Без взятий'}: {game.position.halfmove} из {v.moveLimitPlies} полуходов
          {v.hasPass && last && last.move.from === last.move.to && !result && (
            <> · {S[opposite(game.turn)]} пропустил ход: второй пропуск подряд закончит партию подсчётом очков</>
          )}
        </div>
      )}
      {v.hasHands && !result && !game.history.some((h) => h.captured) && (
        <div className="muted small">Взятые фигуры переходят в руку: их можно поставить на любое свободное поле вместо хода.</div>
      )}
    </div>
  );
}
