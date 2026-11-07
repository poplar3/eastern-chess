// Ввод хода мышью: выбор фигуры на доске или в руке (сёги), поле назначения и выбор превращения.
import { useState, type ReactNode } from 'react';
import type { Game } from '../core/game';
import { colorOf, isPass, type Color, type Move } from '../core/types';
import { Modal } from './Modal';
import { PieceIcon, type PieceStyle } from './pieces';

export interface MoveInput {
  selected: number | null;
  selectedDrop: string | null;
  /** Поля, куда можно пойти выбранной фигурой. */
  targets: Move[];
  onSquareClick: (s: number) => void;
  onHandClick: (c: Color, t: string) => void;
  clear: () => void;
  /** Диалог выбора превращения, когда он открыт. */
  dialog: ReactNode;
}

/**
 * @param game партия
 * @param canMove можно ли сейчас ходить
 * @param onMove сделать ход (ход уже проверен на легальность)
 */
export function useMoveInput(game: Game, canMove: boolean, onMove: (m: Move) => void, style: PieceStyle): MoveInput {
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<string | null>(null);
  const [promo, setPromo] = useState<Move[] | null>(null);

  const clear = () => {
    setSelected(null);
    setSelectedDrop(null);
    setPromo(null);
  };
  const commit = (m: Move) => {
    clear();
    onMove(m);
  };

  const onSquareClick = (s: number) => {
    if (!canMove) return;
    const legal = game.legalMoves();
    if (selectedDrop) {
      const ms = legal.filter((x) => x.drop === selectedDrop && x.to === s);
      if (ms.length === 1) return commit(ms[0]);
      if (ms.length > 1) return setPromo(ms);
    }
    if (selected !== null) {
      const ms = legal.filter((x) => x.from === selected && x.to === s && !isPass(x));
      if (ms.length === 1) return commit(ms[0]);
      if (ms.length > 1) return setPromo(ms);
    }
    const p = game.position.board[s];
    setSelectedDrop(null);
    if (p && colorOf(p) === game.turn) setSelected(s === selected ? null : s);
    else setSelected(null);
  };

  const onHandClick = (c: Color, t: string) => {
    if (!canMove || c !== game.turn) return;
    setSelected(null);
    setSelectedDrop((d) => (d === t ? null : t));
  };

  const legal = selected !== null || selectedDrop ? game.legalMoves() : [];
  const targets = selectedDrop
    ? legal.filter((m) => m.drop === selectedDrop)
    : selected !== null
      ? legal.filter((m) => m.from === selected)
      : [];

  let dialog: ReactNode = null;
  if (promo) {
    const us = game.turn;
    /** Фигура, которая окажется на поле после хода. */
    const result = (m: Move) => {
      if (m.drop) {
        const t = (m.promo ? '+' : '') + m.drop;
        return us === 'w' ? t : t.toLowerCase();
      }
      const p = game.position.board[m.from]!;
      return m.promo ? (game.variant.family === 'shogi' ? '+' + p : p) : p;
    };
    const drop = !!promo[0].drop;
    const ordered = [...promo].sort((a, b) => Number(!!b.promo) - Number(!!a.promo));
    dialog = (
      <Modal title={drop ? 'Какой стороной поставить?' : 'Превратить фигуру?'} onClose={() => setPromo(null)}>
        <div className="promo-choice">
          {ordered.map((m, i) => {
            const piece = result(m);
            const name = game.variant.pieceInfo(piece).ru.toLowerCase();
            return (
              <button key={i} className="btn promo-option" onClick={() => commit(m)}>
                <PieceIcon piece={piece} style={style} size={52} game={game.variant.id} />
                <span>{drop ? <b>{name}</b> : m.promo ? <>Превратить: <b>{name}</b></> : <>Оставить: {name}</>}</span>
              </button>
            );
          })}
        </div>
        {game.variant.promoHint && <p className="hint">{game.variant.promoHint}</p>}
      </Modal>
    );
  }

  return { selected, selectedDrop, targets, onSquareClick, onHandClick, clear, dialog };
}
