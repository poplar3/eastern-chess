import type { GameId, Variant } from '../core/types';
import { FAMILY, loreFor, type FamilyNode } from '../lore';

interface Props {
  /** Игра, выбранная в шапке. */
  variant: Variant;
  /** Переключиться на другую игру (клик по древу). */
  onChoose: (id: GameId) => void;
}

function FamilyTree({ current, onChoose }: { current: GameId; onChoose: (id: GameId) => void }) {
  const children = (id?: string) => FAMILY.filter((n) => n.parent === id);
  const render = (n: FamilyNode) => {
    const kids = children(n.id);
    const label = (
      <>
        <span className="lore-node-name">{n.name}</span>
        <span className="lore-node-when">{n.when}</span>
      </>
    );
    return (
      <li key={n.id}>
        {n.game ? (
          <button
            className={`lore-node playable${n.game === current ? ' current' : ''}`}
            onClick={() => n.game && onChoose(n.game)}
            aria-current={n.game === current ? 'true' : undefined}
          >
            {label}
          </button>
        ) : (
          <span className="lore-node">{label}</span>
        )}
        {kids.length > 0 && <ul>{kids.map(render)}</ul>}
      </li>
    );
  };
  return <ul className="lore-tree">{children(undefined).map(render)}</ul>;
}

export function HistoryView({ variant, onChoose }: Props) {
  const lore = loreFor(variant.id);
  return (
    <div className="puzzles lore">
      <div className="puzzles-head">
        <div>
          <h2>
            <span className={`lore-mark brand-${variant.id}`}>{variant.mark}</span> История: {variant.name}
          </h2>
          <div className="muted">{lore ? lore.origin : variant.subtitle}</div>
        </div>
      </div>

      {!lore ? (
        <div className="panel coming-soon">
          <p>Рассказ об истории этой игры появится в следующих версиях.</p>
        </div>
      ) : (
        <div className="lore-grid">
          <article className="lore-main">
            <p className="lore-tagline">{lore.tagline}</p>
            {lore.sections.map((s) => (
              <section key={s.title} className="panel lore-section">
                <h3>{s.title}</h3>
                {s.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </section>
            ))}
            <section className="panel lore-section">
              <h3>Любопытно</h3>
              <ul className="lore-facts">
                {lore.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </section>
          </article>

          <aside className="lore-side">
            <section className="panel">
              <h3>Лента времени</h3>
              <ol className="lore-timeline">
                {lore.timeline.map((e, i) => (
                  <li key={i}>
                    <b>{e.when}</b>
                    <span>{e.what}</span>
                  </li>
                ))}
              </ol>
            </section>
            {lore.words && lore.words.length > 0 && (
              <section className="panel">
                <h3>Слова</h3>
                <dl className="lore-words">
                  {lore.words.map((w) => (
                    <div key={w.native}>
                      <dt>
                        <span className="lore-native">{w.native}</span> <span className="muted">{w.reading}</span>
                      </dt>
                      <dd>{w.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            <section className="panel">
              <h3>Семейное древо</h3>
              <FamilyTree current={variant.id} onChoose={onChoose} />
              <p className="muted lore-note">
                Пути, которыми шахматы попали в Китай и Японию, историки до сих пор обсуждают. Нажмите на игру, чтобы
                прочитать её историю.
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
