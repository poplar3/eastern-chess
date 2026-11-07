import type { Variant } from '../core/types';
import { MNEMONICS } from './mnemonics';
import { Modal } from './Modal';
import { PieceIcon } from './pieces';

/** Подсказки, как запомнить иероглифы фигур. */
export function MnemonicsDialog({ variant, onClose }: { variant: Variant; onClose: () => void }) {
  const set = MNEMONICS[variant.id];
  return (
    <Modal
      title={`Как запомнить иероглифы: ${variant.name}`}
      onClose={onClose}
      wide
      footer={
        <button className="btn primary" onClick={onClose}>
          Понятно, играем
        </button>
      }
    >
      <p className="mn-intro">{set.intro}</p>
      <table className="mn-table">
        <thead>
          <tr>
            <th>Знак</th>
            <th>Фигура</th>
            <th>На что похож</th>
            <th>Как запомнить</th>
          </tr>
        </thead>
        <tbody>
          {set.cards.map((m) => (
            <tr key={m.piece + m.glyph}>
              <td className="mn-glyph">
                <PieceIcon piece={m.piece} style="hanja" size={48} game={variant.id} />
              </td>
              <td className="mn-name">{m.name}</td>
              <td className="mn-look" data-label="На что похож">
                {m.look}
              </td>
              <td className="mn-hook" data-label="Как запомнить">
                {m.hook}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {set.outro && <p className="mn-intro">{set.outro}</p>}
      <p className="muted mn-foot">Эти подсказки всегда можно открыть снова в «Правилах».</p>
    </Modal>
  );
}
