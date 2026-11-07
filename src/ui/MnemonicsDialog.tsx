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
      <ul className="mn-list">
        {set.cards.map((m) => (
          <li key={m.piece + m.glyph} className="mn-card">
            <PieceIcon piece={m.piece} style="hanja" size={56} game={variant.id} />
            <div>
              <div className="mn-name">{m.name}</div>
              <div className="mn-look">{m.look}</div>
              <div className="mn-hook">{m.hook}</div>
            </div>
          </li>
        ))}
      </ul>
      {set.outro && <p className="mn-intro">{set.outro}</p>}
      <p className="muted mn-foot">Эти подсказки всегда можно открыть снова в «Правилах».</p>
    </Modal>
  );
}
