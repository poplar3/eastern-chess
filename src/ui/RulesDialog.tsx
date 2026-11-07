import type { ReactNode } from 'react';
import type { PieceType } from '../core/rules';
import { PIECE_VALUES } from '../core/rules';
import type { Variant } from '../core/types';
import { Modal } from './Modal';
import { PIECE_NAMES, PieceIcon, type PieceStyle } from './pieces';
import { CambodianRules, MakrukRules, ShatranjRules, SittuyinRules } from './RulesChess8';
import { KyotoShogiRules, ManchuRules, MinishogiRules, ShogiRules, XiangqiRules } from './RulesOther';

const PIECE_RULES: { t: PieceType; text: ReactNode }[] = [
  {
    t: 'K',
    text: (
      <>
        Не выходит из дворца. Ходит на одну клетку по линиям дворца: по вертикали, горизонтали и по
        диагоналям дворца. Генерала нельзя ставить под удар.
      </>
    ),
  },
  { t: 'A', text: <>Ходит так же, как генерал: на одну клетку по линиям дворца, не покидая его.</> },
  {
    t: 'R',
    text: (
      <>
        На любое расстояние по вертикали или горизонтали, как ладья. Внутри дворца может ходить и по его
        диагоналям. Самая сильная фигура.
      </>
    ),
  },
  {
    t: 'C',
    text: (
      <>
        Ходит и бьёт только прыжком через одну фигуру («лафет») по вертикали или горизонтали, на любое
        расстояние за ней. Перепрыгивать через пушку и бить пушку нельзя. Внутри дворца может прыгать по
        диагонали через центр.
      </>
    ),
  },
  {
    t: 'N',
    text: (
      <>
        Шаг на одну клетку прямо, затем на одну по диагонали — «буквой Г». Если клетка прямо занята, ход
        невозможен (конь «спотыкается»).
      </>
    ),
  },
  {
    t: 'B',
    text: (
      <>
        Шаг на одну клетку прямо, затем на две по диагонали (итог — 2×3 клетки). Обе промежуточные точки
        должны быть свободны. В отличие от сянци, слон свободно ходит по всей доске.
      </>
    ),
  },
  {
    t: 'P',
    text: (
      <>
        На одну клетку вперёд или в сторону, назад не ходит. Во дворце соперника может ходить вперёд и по
        диагоналям дворца. Не превращается в другие фигуры.
      </>
    ),
  },
];

export function RulesDialog({
  variant,
  style,
  onClose,
  onMnemonics,
}: {
  variant?: Variant;
  style: PieceStyle;
  onClose: () => void;
  /** Открыть подсказки, как запомнить иероглифы. */
  onMnemonics?: () => void;
}) {
  const id = variant?.id ?? 'janggi';
  return (
    <Modal title={`Краткие правила: ${variant?.name ?? 'Чанги'}`} onClose={onClose} wide>
      {onMnemonics && (
        <button className="btn rules-mnemonics" onClick={onMnemonics}>
          Как запомнить иероглифы
        </button>
      )}
      {id === 'xiangqi' ? (
        <XiangqiRules style={style} />
      ) : id === 'shogi' ? (
        <ShogiRules style={style} />
      ) : id === 'makruk' ? (
        <MakrukRules style={style} />
      ) : id === 'shatranj' ? (
        <ShatranjRules style={style} />
      ) : id === 'cambodian' ? (
        <CambodianRules style={style} />
      ) : id === 'sittuyin' ? (
        <SittuyinRules style={style} />
      ) : id === 'minishogi' ? (
        <MinishogiRules style={style} />
      ) : id === 'kyotoshogi' ? (
        <KyotoShogiRules style={style} />
      ) : id === 'manchu' ? (
        <ManchuRules style={style} />
      ) : (
        <JanggiRules style={style} />
      )}
    </Modal>
  );
}

function JanggiRules({ style }: { style: PieceStyle }) {
  return (
      <div className="rules">
        <section>
          <h3>Цель игры</h3>
          <p>
            Поставить мат генералу соперника: генерал под ударом (шах, по-корейски <b>장군</b>), и от удара
            нельзя уйти, закрыться или взять атакующую фигуру. Играют две стороны: <b className="cho">Чо (초)</b> —
            зелёные, ходят первыми, и <b className="han">Хан (한)</b> — красные.
          </p>
        </section>
        <section>
          <h3>Доска</h3>
          <p>
            Фигуры стоят на пересечениях линий доски 9×10. Реки, как в сянци, нет. У каждой стороны есть
            <b> дворец</b> — квадрат 3×3 с диагоналями. Генерал и стражи не могут его покинуть, а диагонали
            дворца дают дополнительные ходы колесницам, пушкам и солдатам.
          </p>
        </section>
        <section>
          <h3>Фигуры</h3>
          <table className="piece-table">
            <tbody>
              {PIECE_RULES.map(({ t, text }) => (
                <tr key={t}>
                  <td className="piece-cell">
                    <PieceIcon piece={t} style={style} size={36} />
                    <PieceIcon piece={t.toLowerCase()} style={style} size={36} />
                  </td>
                  <td>
                    <b>
                      {PIECE_NAMES[t].ru} ({PIECE_NAMES[t].ko})
                    </b>
                    {t !== 'K' && <span className="muted"> — {PIECE_VALUES[t]} очк.</span>}
                    <div>{text}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3>Расстановка слонов и коней</h3>
          <p>
            Перед партией каждый игрок сам выбирает, как поставить коней и слонов на своей первой линии. Вариантов
            четыре: «слоны внутри» (конь-слон-слон-конь), «слоны снаружи» (слон-конь-конь-слон), «слон слева»
            (слон-конь-слон-конь) и «слон справа» (конь-слон-конь-слон), если смотреть со своей стороны доски.
            Первым выбирает Хан, затем Чо. Остальные фигуры стоят всегда одинаково.
          </p>
        </section>
        <section>
          <h3>Пропуск хода</h3>
          <p>
            Вместо хода можно пропустить ход (кнопка «Пропустить ход»), но только если ваш генерал не под шахом.
            Если оба игрока пропустили ход подряд, партия заканчивается подсчётом очков.
          </p>
        </section>
        <section>
          <h3>Биджанг (빅장)</h3>
          <p>
            Если генералы стоят на одной вертикали и между ними нет фигур, это <b>биджанг</b>. Соперник
            обязан его разорвать: увести генерала с вертикали или поставить между генералами фигуру. Если он
            вместо этого пропускает ход, партия сразу заканчивается подсчётом очков. Поэтому биджанг выгодно
            объявлять, когда вы ведёте по очкам. На доске биджанг показан оранжевой линией, а на панели счёта
            видно, кто победит, если биджанг не разорвут.
          </p>
        </section>
        <section>
          <h3>Подсчёт очков</h3>
          <p>
            Колесница — 13, пушка — 7, конь — 5, слон — 3, страж — 3, солдат — 2. В начале у Чо 72 очка, у
            Хана 72 + 1,5 очка компенсации (<b>덤</b>) за то, что он ходит вторым. Ничьей поэтому не бывает.
            Очки решают исход при биджанге, двойном пропуске хода, троекратном повторении позиции и после
            100 полуходов без взятий.
          </p>
        </section>
        <section>
          <h3>Повторения</h3>
          <p>
            Бесконечно повторять ходы нельзя: при троекратном повторении позиции партия заканчивается
            подсчётом очков, а вечный шах запрещён — сторона, которая его даёт, проигрывает.
          </p>
        </section>
      </div>
  );
}
