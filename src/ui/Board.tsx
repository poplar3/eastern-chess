import { useLayoutEffect, useRef } from 'react';
import { JANGGI } from '../core/janggi';
import { generalsFacing } from '../core/rules';
import { HAND_ORDER } from '../core/shogi';
import { colorOf, type Board as BoardArr, type Color, type Hand, type Move, type Variant } from '../core/types';
import { PieceDefs, PieceView, type PieceStyle } from './pieces';

export const CELL = 64;
/** Длительность анимации хода, мс. */
const MOVE_MS = 260;
const MARGIN_LINES = 56;
/** Для доски из клеток (сёги) поля уже: подписи стоят вплотную к доске. */
const MARGIN_CELLS = 36;
/** Высота полосы для фигур в руке (сёги). */
const HAND_H = 76;
const HAND_SLOT = 62;

export interface Arrow {
  from: number;
  to: number;
  color: string;
  label?: string;
  dashed?: boolean;
  /** Толстая стрелка для главного хода. */
  main?: boolean;
  /** Сброс фигуры из руки (сёги): тип фигуры и чья рука. */
  drop?: string;
  side?: Color;
}

interface Props {
  board: BoardArr;
  style: PieceStyle;
  flipped: boolean;
  selected: number | null;
  targets: Move[];
  lastMove: Move | null;
  checkSquare: number | null;
  arrows: Arrow[];
  onSquareClick: (s: number) => void;
  variant?: Variant;
  /** Фигуры в руке (сёги). */
  hands?: Record<Color, Hand>;
  /** Выбранная для сброса фигура из руки стороны, которая ходит. */
  selectedDrop?: string | null;
  /** Чей ход — его рука подсвечивается и доступна для выбора. */
  turn?: Color;
  onHandClick?: (c: Color, t: string) => void;
}

export function Board({
  board,
  style,
  flipped,
  selected,
  targets,
  lastMove,
  checkSquare,
  arrows,
  onSquareClick,
  variant = JANGGI,
  hands,
  selectedDrop = null,
  turn,
  onHandClick,
}: Props) {
  const game = variant.id;
  const FILES = variant.files;
  const RANKS = variant.ranks;
  const cells = variant.board === 'cells';
  const shogi = game === 'shogi';
  const MARGIN = cells ? MARGIN_CELLS : MARGIN_LINES;
  const handH = variant.hasHands ? HAND_H : 0;
  const W = cells ? FILES * CELL + 2 * MARGIN : (FILES - 1) * CELL + 2 * MARGIN;
  const BH = cells ? RANKS * CELL + 2 * MARGIN : (RANKS - 1) * CELL + 2 * MARGIN;
  const H = BH + 2 * handH;
  const off = cells ? CELL / 2 : 0;
  const sq = (f: number, r: number) => r * FILES + f;
  const pos = (s: number) => {
    const f = s % FILES;
    const r = Math.floor(s / FILES);
    const x = MARGIN + off + (flipped ? FILES - 1 - f : f) * CELL;
    const y = handH + MARGIN + off + (flipped ? r : RANKS - 1 - r) * CELL;
    return { x, y };
  };
  const pt = (f: number, r: number) => pos(sq(f, r));
  /** Сторона, чья рука нарисована снизу. */
  const bottom: Color = flipped ? 'b' : 'w';
  const handSlot = (c: Color, t: string) => {
    const list = HAND_ORDER.filter((x) => (hands?.[c][x] ?? 0) > 0);
    let i = list.indexOf(t as (typeof HAND_ORDER)[number]);
    if (i < 0) i = list.length;
    const n = Math.max(list.length, 1);
    const x0 = W / 2 - ((n - 1) * HAND_SLOT) / 2;
    const y = c === bottom ? H - HAND_H / 2 : HAND_H / 2;
    // Рука сверху выкладывается справа налево — так её видит соперник.
    const x = c === bottom ? x0 + i * HAND_SLOT : W - (x0 + i * HAND_SLOT);
    return { x, y };
  };

  // Анимация хода: фигура на поле назначения выезжает с исходного поля (или из руки). Двигается одна
  // маленькая группа SVG через Web Animations, без перерисовки всей доски.
  const pieceEls = useRef(new Map<number, SVGGElement>());
  const animated = useRef<Move | null>(lastMove);
  useLayoutEffect(() => {
    if (lastMove === animated.current) return;
    animated.current = lastMove;
    if (!lastMove || lastMove.from === lastMove.to) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const el = pieceEls.current.get(lastMove.to);
    if (!el?.animate) return;
    const p = board[lastMove.to];
    const a = lastMove.from < 0 ? (p ? handSlot(colorOf(p), lastMove.drop ?? '') : null) : pos(lastMove.from);
    if (!a) return;
    const b = pos(lastMove.to);
    el.animate([{ transform: `translate(${a.x - b.x}px, ${a.y - b.y}px)` }, { transform: 'translate(0, 0)' }], {
      duration: MOVE_MS,
      easing: 'cubic-bezier(0.25, 0.8, 0.35, 1)',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMove]);

  const grid = (() => {
    const lines: string[] = [];
    if (cells) {
      for (let k = 0; k <= FILES; k++) {
        const x = MARGIN + k * CELL;
        lines.push(`M${x} ${handH + MARGIN}L${x} ${handH + MARGIN + RANKS * CELL}`);
      }
      for (let k = 0; k <= RANKS; k++) {
        const y = handH + MARGIN + k * CELL;
        lines.push(`M${MARGIN} ${y}L${MARGIN + FILES * CELL} ${y}`);
      }
      return lines.join('');
    }
    for (let f = 0; f < FILES; f++) {
      if (game === 'xiangqi' && f > 0 && f < FILES - 1) {
        // Река: внутренние вертикали прерываются между 5-й и 6-й горизонталями.
        const a = pt(f, 0), b = pt(f, 4), c = pt(f, 5), d = pt(f, RANKS - 1);
        lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}M${c.x} ${c.y}L${d.x} ${d.y}`);
      } else {
        const a = pt(f, 0), b = pt(f, RANKS - 1);
        lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}`);
      }
    }
    for (let r = 0; r < RANKS; r++) {
      const a = pt(0, r), b = pt(FILES - 1, r);
      lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}`);
    }
    for (const [r0, r1] of [[0, 2], [7, 9]]) {
      const a = pt(3, r0), b = pt(5, r1), c = pt(5, r0), d = pt(3, r1);
      lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}M${c.x} ${c.y}L${d.x} ${d.y}`);
    }
    return lines.join('');
  })();

  const facing = game === 'janggi' && generalsFacing(board);
  const wg = variant.kingSquare(board, 'w');
  const bg = variant.kingSquare(board, 'b');
  // Походившая фигура рисуется последней, чтобы во время анимации ехать поверх остальных
  // (пушка перепрыгивает через фигуры).
  const moved = lastMove && lastMove.from !== lastMove.to ? lastMove.to : -1;
  const pieceOrder = board.map((_, s) => s).filter((s) => s !== moved);
  if (moved >= 0) pieceOrder.push(moved);
  const targetSet = new Map(targets.map((m) => [m.to, m]));
  const half = cells ? CELL / 2 - 1 : 30;
  const bx0 = MARGIN, by0 = handH + MARGIN;

  return (
    <svg className={`board board-${game}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Доска для игры ${variant.name}`}>
      <PieceDefs />
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0cf8e" />
          <stop offset="100%" stopColor="#dcae62" />
        </linearGradient>
        <radialGradient id="checkGlow">
          <stop offset="0%" stopColor="rgba(230,30,30,0.85)" />
          <stop offset="100%" stopColor="rgba(230,30,30,0)" />
        </radialGradient>
        {['#2f6fd6', '#d97a00', '#7b8794', '#8e44ad', '#1f8a4c'].map((c) => (
          <marker key={c} id={`arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
            <path d="M0 0L10 5L0 10z" fill={c} />
          </marker>
        ))}
      </defs>
      {variant.hasHands && (
        <>
          <rect x={0} y={0} width={W} height={HAND_H - 6} rx={10} className="hand-tray" />
          <rect x={0} y={H - HAND_H + 6} width={W} height={HAND_H - 6} rx={10} className="hand-tray" />
        </>
      )}
      <rect x={0} y={handH} width={W} height={BH} rx={10} fill="url(#wood)" />
      {cells ? (
        <path d={grid} stroke="#5b3a17" strokeWidth={1.3} fill="none" />
      ) : (
        <>
          <rect x={bx0} y={by0} width={W - 2 * MARGIN} height={BH - 2 * MARGIN} fill="none" stroke="#5b3a17" strokeWidth={2.5} />
          <path d={grid} stroke="#5b3a17" strokeWidth={1.3} fill="none" />
        </>
      )}
      {cells && <rect x={bx0} y={by0} width={FILES * CELL} height={RANKS * CELL} fill="none" stroke="#5b3a17" strokeWidth={2.5} />}
      {shogi &&
        [3, 6].flatMap((i) =>
          [3, 6].map((j) => <circle key={`hs${i}${j}`} cx={MARGIN + i * CELL} cy={by0 + j * CELL} r={4} fill="#5b3a17" />),
        )}
      {game === 'xiangqi' && (() => {
        const y = (pt(0, 4).y + pt(0, 5).y) / 2;
        const left = flipped ? '漢 界' : '楚 河';
        const right = flipped ? '楚 河' : '漢 界';
        return (
          <>
            <text className="river" x={W * 0.3} y={y} textAnchor="middle" dominantBaseline="central">
              {left}
            </text>
            <text className="river" x={W * 0.7} y={y} textAnchor="middle" dominantBaseline="central">
              {right}
            </text>
          </>
        );
      })()}

      {shogi
        ? Array.from({ length: FILES }, (_, f) => {
            const p = pt(f, 0);
            return (
              <text key={`f${f}`} className="coord" x={p.x} y={by0 - 10} textAnchor="middle">
                {variant.fileLabels[f]}
              </text>
            );
          })
        : Array.from({ length: FILES }, (_, f) => {
            const p = pt(f, flipped ? RANKS - 1 : 0);
            return (
              <text key={`f${f}`} className="coord" x={p.x} y={H - 12} textAnchor="middle">
                {variant.fileLabels[f]}
              </text>
            );
          })}
      {Array.from({ length: RANKS }, (_, r) => {
        const p = pt(flipped ? FILES - 1 : 0, r);
        return shogi ? (
          <text key={`r${r}`} className="coord coord-kanji" x={W - MARGIN / 2 + 1} y={p.y + 6} textAnchor="middle">
            {variant.rankLabels[r]}
          </text>
        ) : (
          <text key={`r${r}`} className="coord" x={18} y={p.y + 5} textAnchor="middle">
            {variant.rankLabels[r]}
          </text>
        );
      })}

      {lastMove &&
        [lastMove.from, lastMove.to]
          .filter((s) => s >= 0)
          .map((s, i) => {
            const p = pos(s);
            return <rect key={i} x={p.x - half} y={p.y - half} width={2 * half} height={2 * half} rx={cells ? 2 : 8} fill="rgba(255,240,90,0.45)" />;
          })}

      {checkSquare !== null && (() => {
        const p = pos(checkSquare);
        return <circle cx={p.x} cy={p.y} r={44} fill="url(#checkGlow)" />;
      })()}

      {facing && wg >= 0 && bg >= 0 && (() => {
        const a = pos(wg), b = pos(bg);
        return <line className="bikjang-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      })()}

      {variant.hasHands &&
        (['w', 'b'] as const).map((c) =>
          HAND_ORDER.filter((t) => (hands?.[c][t] ?? 0) > 0).map((t) => {
            const { x, y } = handSlot(c, t);
            const n = hands![c][t]!;
            const active = !!onHandClick && turn === c;
            const sel = selectedDrop === t && turn === c;
            return (
              <g key={`h${c}${t}`} className={active ? 'hand-piece active' : 'hand-piece'} onClick={active ? () => onHandClick(c, t) : undefined}>
                {sel && <rect x={x - 29} y={y - 33} width={58} height={66} rx={8} fill="none" stroke="#2f6fd6" strokeWidth={4} />}
                <PieceView piece={c === 'w' ? t : t.toLowerCase()} style={style} x={x} y={y} scale={0.9} game={game} flipped={flipped} />
                {n > 1 && (
                  <g>
                    <circle cx={x + 22} cy={y + 22} r={11} fill="#5b3a17" />
                    <text x={x + 22} y={y + 23} className="hand-count" textAnchor="middle" dominantBaseline="central">
                      {n}
                    </text>
                  </g>
                )}
                <rect x={x - 30} y={y - 34} width={60} height={68} fill="transparent" className={active ? 'hit' : undefined} />
              </g>
            );
          }),
        )}

      {pieceOrder.map((s) => {
        const p = board[s];
        if (!p) return null;
        const { x, y } = pos(s);
        return (
          <g
            key={s}
            ref={(el) => {
              if (el) pieceEls.current.set(s, el);
              else pieceEls.current.delete(s);
            }}
          >
            {selected === s &&
              (cells ? (
                <rect x={x - half + 2} y={y - half + 2} width={2 * half - 4} height={2 * half - 4} rx={4} fill="none" stroke="#2f6fd6" strokeWidth={4} />
              ) : (
                <circle cx={x} cy={y} r={36} fill="none" stroke="#2f6fd6" strokeWidth={5} />
              ))}
            <PieceView piece={p} style={style} x={x} y={y} game={game} flipped={flipped} />
          </g>
        );
      })}

      {[...targetSet.keys()].map((s) => {
        const { x, y } = pos(s);
        const isPassTarget = targetSet.get(s)!.from === s;
        if (isPassTarget) return null;
        return board[s] ? (
          <circle key={`t${s}`} cx={x} cy={y} r={cells ? 29 : 33} fill="none" stroke="rgba(47,111,214,0.85)" strokeWidth={4} />
        ) : (
          <circle key={`t${s}`} cx={x} cy={y} r={9} fill="rgba(47,111,214,0.75)" />
        );
      })}

      {arrows.map((a, i) => {
        const q = pos(a.to);
        const p = a.from < 0 ? handSlot(a.side ?? 'w', a.drop ?? '') : pos(a.from);
        if (a.from === a.to) {
          return <circle key={`a${i}`} cx={p.x} cy={p.y} r={36} fill="none" stroke={a.color} strokeWidth={6} strokeDasharray="8 6" opacity={0.85} />;
        }
        const dx = q.x - p.x, dy = q.y - p.y;
        const len = Math.hypot(dx, dy);
        const ex = q.x - (dx / len) * 14, ey = q.y - (dy / len) * 14;
        return (
          <g key={`a${i}`} opacity={0.85} pointerEvents="none">
            <line x1={p.x} y1={p.y} x2={ex} y2={ey} stroke={a.color} strokeWidth={a.main ? 9 : 6} strokeLinecap="round" strokeDasharray={a.dashed ? '12 9' : undefined} markerEnd={`url(#arrow-${a.color.slice(1)})`} />
            {a.label && (
              <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 8} className="arrow-label" textAnchor="middle">
                {a.label}
              </text>
            )}
          </g>
        );
      })}

      {Array.from({ length: FILES * RANKS }, (_, s) => {
        const { x, y } = pos(s);
        return cells ? (
          <rect key={`h${s}`} x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} fill="transparent" className="hit" onClick={() => onSquareClick(s)} />
        ) : (
          <circle key={`h${s}`} cx={x} cy={y} r={31} fill="transparent" className="hit" onClick={() => onSquareClick(s)} />
        );
      })}
    </svg>
  );
}
