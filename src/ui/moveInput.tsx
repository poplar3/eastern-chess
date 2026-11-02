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
      const m = legal.find((x) => x.drop === selectedDrop && x.to === s);
      if (m) return commit(m);
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
    const piece = game.position.board[promo[0].from]!;
    const promoted = '+' + piece;
    const yes = promo.find((m) => m.promo)!;
    const no = promo.find((m) => !m.promo)!;
    const name = game.variant.pieceInfo(piece);
    const pname = game.variant.pieceInfo(promoted);
    dialog = (
      <Modal title="Превратить фигуру?" onClose={() => setPromo(null)}>
        <div className="promo-choice">
          <button className="btn promo-option" onClick={() => commit(yes)}>
            <PieceIcon piece={promoted} style={style} size={52} game={game.variant.id} />
            <span>
              Превратить: <b>{pname.ru.toLowerCase()}</b>
            </span>
          </button>
          <button className="btn promo-option" onClick={() => commit(no)}>
            <PieceIcon piece={piece} style={style} size={52} game={game.variant.id} />
            <span>Оставить: {name.ru.toLowerCase()}</span>
          </button>
        </div>
        <p className="hint">Фигура ходит в зоне превращения (три дальние горизонтали). Превращаться необязательно, но обычно выгодно.</p>
      </Modal>
    );
  }

  return { selected, selectedDrop, targets, onSquareClick, onHandClick, clear, dialog };
}
