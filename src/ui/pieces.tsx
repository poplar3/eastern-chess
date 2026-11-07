import type { ReactNode } from 'react';
import { JANGGI_PIECES } from '../core/janggi';
import { colorOf, FAMILY_OF, typeOf, type Color, type GameId, type Piece } from '../core/types';

export type PieceStyle = 'icons' | 'hanja';

export const SIDE_COLORS: Record<Color, string> = { w: '#17694a', b: '#b3242a' };
/** Названия сторон в Чанги (для остальных игр — variant.sides). */
export const SIDE_NAMES: Record<Color, string> = { w: 'Чо', b: 'Хан' };

export const PIECE_NAMES = Object.fromEntries(
  Object.entries(JANGGI_PIECES).map(([t, i]) => [t, { ru: i.ru, short: i.short, ko: i.native }]),
) as Record<keyof typeof JANGGI_PIECES, { ru: string; short: string; ko: string }>;

/** Цвет «чернил» фигур каждой стороны в каждой игре. */
const INK: Record<GameId, Record<Color, string>> = {
  janggi: SIDE_COLORS,
  xiangqi: { w: '#b8231f', b: '#1f1f1f' },
  shogi: { w: '#1f1a14', b: '#1f1a14' },
  makruk: { w: '#3a2a18', b: '#f3e3bf' },
  shatranj: { w: '#3a2a18', b: '#f3e3bf' },
  cambodian: { w: '#3a2a18', b: '#f3e3bf' },
  sittuyin: { w: '#3a2a18', b: '#f3e3bf' },
  minishogi: { w: '#1f1a14', b: '#1f1a14' },
  kyotoshogi: { w: '#1f1a14', b: '#1f1a14' },
  manchu: { w: '#b8231f', b: '#1f1f1f' },
};
/** Иконки фигур макрука и шатранджа: тип → рисунок. */
const CHESS8_ICON: Partial<Record<GameId, Record<string, string>>> = {
  makruk: { K: 'K', M: 'A', S: 'SB', N: 'N', R: 'BOAT', P: 'P' },
  shatranj: { K: 'K', Q: 'A', B: 'B', N: 'N', R: 'R', P: 'P' },
  cambodian: { K: 'K', M: 'A', S: 'SB', N: 'N', R: 'BOAT', P: 'FISH' },
  sittuyin: { K: 'K', F: 'A', S: 'B', N: 'N', R: 'R', P: 'P' },
};
const SHOGI_PROMOTED_INK = '#b8231f';

const HANJA: Record<Color, Record<string, string>> = {
  w: { K: '楚', A: '士', B: '象', N: '馬', R: '車', C: '包', P: '卒' },
  b: { K: '漢', A: '士', B: '象', N: '馬', R: '車', C: '包', P: '兵' },
};
const XIANGQI_HAN: Record<Color, Record<string, string>> = {
  w: { K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵', M: '旗' },
  b: { K: '將', A: '士', B: '象', N: '馬', R: '車', C: '砲', P: '卒' },
};
const SHOGI_KANJI: Record<string, string> = {
  R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩',
  '+R': '龍', '+B': '馬', '+S': '全', '+N': '圭', '+L': '杏', '+P': 'と',
};
/** Киото-сёги: у каждой стороны фигуры свой знак (перевёрнутая сторона — с плюсом). */
const KYOTO_KANJI: Record<string, string> = { L: '香', '+L': 'と', S: '銀', '+S': '角', N: '桂', '+N': '金', P: '歩', '+P': '飛' };
/** Иконки фигур киото-сёги. */
const KYOTO_ICON: Record<string, string> = { L: 'SL', '+L': 'SG', S: 'SS', '+S': 'SB', N: 'N', '+N': 'SG', P: 'P', '+P': 'SR' };

/** Иероглиф, которым подписана фигура. */
export function pieceGlyph(piece: Piece, game: GameId): string {
  const c = colorOf(piece);
  const t = typeOf(piece);
  const family = FAMILY_OF[game];
  if (family === 'shogi') return t === 'K' ? (c === 'w' ? '玉' : '王') : game === 'kyotoshogi' ? KYOTO_KANJI[t] : SHOGI_KANJI[t];
  return family === 'xiangqi' ? (t === 'M' ? '旗' : XIANGQI_HAN[c][t]) : HANJA[c][t];
}

const FONT_CLASS: Record<GameId, string> = {
  janggi: 'hanja',
  xiangqi: 'hanja-xq',
  manchu: 'hanja-xq',
  shogi: 'hanja-sh',
  minishogi: 'hanja-sh',
  kyotoshogi: 'hanja-sh',
  makruk: '',
  shatranj: '',
  cambodian: '',
  sittuyin: '',
};

/** Радиус фигуры Чанги при шаге сетки 64: генерал крупнее всех, страж и солдат — меньше. */
export function pieceRadius(t: string, game: GameId = 'janggi'): number {
  const family = FAMILY_OF[game];
  if (family === 'xiangqi') return 27;
  if (family === 'chess8') return 26;
  if (family === 'shogi') return shogiSize(t) * 30;
  return t === 'K' ? 30 : t === 'A' || t === 'P' ? 21 : 26;
}

/** Размер фигуры сёги относительно короля. */
function shogiSize(t: string) {
  const b = t.replace('+', '');
  return b === 'K' ? 1 : b === 'R' || b === 'B' ? 0.97 : b === 'G' || b === 'S' ? 0.93 : b === 'N' || b === 'L' ? 0.88 : 0.83;
}

const IVORY = '#f7ecd2';

/** Иконки в стиле «европейских» фигур; координаты в квадрате −30…30. */
function icon(t: string, c: string, bg = IVORY): ReactNode {
  switch (t) {
    case 'K':
      return (
        <g fill={c}>
          <path d="M-24 12 L-27 -14 L-12 -1 L0 -22 L12 -1 L27 -14 L24 12 Z" />
          <rect x={-24} y={15} width={48} height={7} rx={2} />
          <circle cx={-27} cy={-16} r={4} />
          <circle cx={0} cy={-24} r={4} />
          <circle cx={27} cy={-16} r={4} />
        </g>
      );
    case 'A':
      return (
        <g>
          <path fill={c} d="M0 -26 L22 -18 L20 4 Q16 20 0 28 Q-16 20 -20 4 L-22 -18 Z" />
          <path d="M0 -15 V16 M-11 -3 H11" stroke={bg} strokeWidth={4} strokeLinecap="round" />
        </g>
      );
    case 'B':
      return (
        <g fill={c}>
          <ellipse cx={7} cy={1} rx={19} ry={13} />
          <circle cx={-13} cy={-7} r={11} />
          <path d="M-21 -2 Q-29 10 -24 23" stroke={c} strokeWidth={6} fill="none" strokeLinecap="round" />
          <rect x={-6} y={9} width={7} height={15} rx={2} />
          <rect x={15} y={9} width={7} height={15} rx={2} />
          <ellipse cx={-6} cy={-6} rx={7} ry={9} stroke={bg} strokeWidth={2} />
          <path d="M-18 3 Q-14 9 -8 7" stroke={bg} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <circle cx={-17} cy={-10} r={2} fill={bg} />
        </g>
      );
    case 'N':
      return (
        <g>
          <path
            fill={c}
            d="M15 26 L-15 26 L-13 17 Q-5 8 -3 1 L-13 5 Q-22 7 -24 -1 L-21 -7 Q-10 -18 -7 -24 L-4 -30 L2 -22 Q21 -17 22 3 Q22 17 15 26 Z"
          />
          <circle cx={-8} cy={-13} r={2.4} fill={bg} />
          <path d="M6 -18 Q14 -4 10 14" stroke={bg} strokeWidth={2} fill="none" strokeLinecap="round" />
        </g>
      );
    case 'R':
      return (
        <g>
          <path fill={c} d="M-27 -9 H27 L21 -25 H-21 Z" />
          <circle cx={0} cy={9} r={14} fill="none" stroke={c} strokeWidth={5} />
          <path d="M0 -5 V23 M-14 9 H14 M-10 -1 L10 19 M10 -1 L-10 19" stroke={c} strokeWidth={2.5} />
          <circle cx={0} cy={9} r={4.5} fill={c} />
        </g>
      );
    case 'C':
      return (
        <g>
          <g transform="rotate(-24)" fill={c}>
            <rect x={-25} y={-9} width={46} height={15} rx={7} />
            <rect x={18} y={-12} width={7} height={21} rx={2} />
          </g>
          <circle cx={-3} cy={13} r={11} fill={bg} stroke={c} strokeWidth={5} />
          <circle cx={-3} cy={13} r={3.5} fill={c} />
        </g>
      );
    case 'P':
      return (
        <g fill={c}>
          <circle cx={0} cy={-14} r={9} />
          <path d="M-8 -4 H8 L13 17 H-13 Z" />
          <rect x={-17} y={17} width={34} height={7} rx={2} />
        </g>
      );
    // ---- Фигуры сёги ----
    case 'SR': // ладья — башня
      return (
        <g fill={c}>
          <path d="M-18 -26 H-10 V-19 H-4 V-26 H4 V-19 H10 V-26 H18 V-12 L13 -7 V14 L18 18 V24 H-18 V18 L-13 14 V-7 L-18 -12 Z" />
          <rect x={-7} y={-3} width={14} height={4} fill={bg} />
        </g>
      );
    case 'SB': // слон — митра
      return (
        <g>
          <path fill={c} d="M0 -28 Q-17 -12 -14 6 Q-12 15 0 17 Q12 15 14 6 Q17 -12 0 -28 Z" />
          <path d="M5 -16 L-5 -2" stroke={bg} strokeWidth={4} strokeLinecap="round" />
          <circle cx={0} cy={-30} r={4} fill={c} />
          <rect x={-18} y={19} width={36} height={7} rx={2} fill={c} />
        </g>
      );
    case 'SG': // золотой генерал — шлем со звездой
    case 'SS': // серебряный генерал — шлем
      return (
        <g>
          <path fill={c} d="M-22 14 Q-24 -20 0 -24 Q24 -20 22 14 Z" />
          <rect x={-26} y={14} width={52} height={8} rx={3} fill={c} />
          {t === 'SG' ? (
            <path
              d="M0 -14 L3.5 -4 L14 -4 L5.5 2 L8.5 12 L0 6 L-8.5 12 L-5.5 2 L-14 -4 L-3.5 -4 Z"
              fill={bg}
            />
          ) : (
            <path d="M0 -15 V9 M-10 -3 H10" stroke={bg} strokeWidth={4} strokeLinecap="round" />
          )}
        </g>
      );
    case 'BOAT': // ладья макрука — лодка (руа)
      return (
        <g fill={c}>
          <path d="M-27 6 H27 L18 21 H-18 Z" />
          <path d="M-3 -27 V6" stroke={c} strokeWidth={4} />
          <path d="M1 -25 L21 1 H1 Z" />
          <path d="M-7 -19 L-22 1 H-7 Z" />
          <path d="M-14 13 H14" stroke={bg} strokeWidth={2.5} strokeLinecap="round" />
        </g>
      );
    case 'FISH': // пешка камбоджийских шахмат — рыба (трей)
      return (
        <g fill={c}>
          <path d="M-20 0 Q-4 -18 14 -4 L26 -14 L24 0 L26 14 L14 4 Q-4 18 -20 0 Z" />
          <circle cx={-10} cy={-3} r={2.8} fill={bg} />
          <path d="M-2 -8 Q3 0 -2 8" stroke={bg} strokeWidth={2} fill="none" strokeLinecap="round" />
          <rect x={-17} y={17} width={34} height={6} rx={2} />
        </g>
      );
    case 'FLAG': // знамя маньчжурских шахмат
      return (
        <g fill={c}>
          <rect x={-18} y={-28} width={5} height={52} rx={2} />
          <path d="M-13 -26 Q2 -32 12 -24 Q20 -18 26 -22 V4 Q20 8 12 2 Q2 -6 -13 0 Z" />
          <path d="M-5 -16 H14 M-5 -8 H14" stroke={bg} strokeWidth={3} strokeLinecap="round" />
          <rect x={-24} y={22} width={18} height={5} rx={2} />
        </g>
      );
    case 'SL': // стрелка — копьё
      return (
        <g fill={c}>
          <path d="M0 -30 L9 -12 L3 -12 L3 20 L-3 20 L-3 -12 L-9 -12 Z" />
          <rect x={-12} y={20} width={24} height={6} rx={2} />
        </g>
      );
    default:
      return null;
  }
}

/** Иконка для фигуры сёги: тип без превращения. */
function shogiIcon(t: string) {
  const b = t.replace('+', '');
  return b === 'N' || b === 'P' || b === 'K' ? b : 'S' + b;
}

function octagon(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((22.5 + 45 * i) * Math.PI) / 180;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Пятиугольная фигура сёги, остриём вверх; s — масштаб (король = 1). */
function pentagon(s: number) {
  const w = 25 * s, h = 29 * s;
  return `0,${-h} ${w * 0.78},${-h * 0.62} ${w},${h} ${-w},${h} ${-w * 0.78},${-h * 0.62}`;
}

interface Props {
  piece: Piece;
  style: PieceStyle;
  x: number;
  y: number;
  /** Масштаб относительно стандартного размера. */
  scale?: number;
  dim?: boolean;
  game?: GameId;
  /** Доска перевёрнута (для сёги фигуры смотрят остриём на соперника). */
  flipped?: boolean;
}

export function PieceView({ piece, style, x, y, scale = 1, dim, game = 'janggi', flipped = false }: Props) {
  const c = colorOf(piece);
  const t = typeOf(piece);
  const family = FAMILY_OF[game];
  if (family === 'shogi') {
    const s = shogiSize(t);
    const promoted = t.startsWith('+');
    const ink = promoted ? SHOGI_PROMOTED_INK : INK.shogi[c];
    const upside = (c === 'b') !== flipped;
    const label = pieceGlyph(piece, game);
    const iconName = game === 'kyotoshogi' && t !== 'K' ? KYOTO_ICON[t] : shogiIcon(t);
    return (
      <g transform={`translate(${x} ${y}) scale(${scale}) rotate(${upside ? 180 : 0})`} opacity={dim ? 0.45 : 1} className="piece">
        <polygon points={pentagon(s)} fill="rgba(0,0,0,0.25)" transform="translate(1.5 2.5)" />
        <polygon points={pentagon(s)} fill="url(#shogiFill)" stroke="#7a5626" strokeWidth={1.6} strokeLinejoin="round" />
        {style === 'hanja' ? (
          <text className={FONT_CLASS.shogi} fill={ink} fontSize={30 * s} textAnchor="middle" dominantBaseline="central" y={3 * s}>
            {label}
          </text>
        ) : (
          <g transform={`translate(0 ${3 * s}) scale(${(s * 0.62 * 26) / 30})`}>{icon(iconName, ink, '#f3d79a')}</g>
        )}
        {promoted && style === 'icons' && (
          <text className="promo-mark" x={13 * s} y={-9 * s} fill={SHOGI_PROMOTED_INK} fontSize={15 * s} textAnchor="middle" dominantBaseline="central">
            +
          </text>
        )}
      </g>
    );
  }
  const r = pieceRadius(t, game);
  const color = INK[game][c];
  const chess8 = CHESS8_ICON[game];
  if (chess8) {
    // Макрук и шатрандж: круглые фишки, светлые у белых и тёмные у чёрных; иероглифов у этих игр нет.
    const dark = c === 'b';
    return (
      <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={dim ? 0.45 : 1} className="piece">
        <circle r={r + 1.5} fill="rgba(0,0,0,0.25)" transform="translate(1.5 2.5)" />
        <circle r={r} fill={dark ? 'url(#pieceFillDark)' : 'url(#pieceFill)'} stroke={dark ? '#120c06' : '#5b3a17'} strokeWidth={2} />
        <circle r={r - 4} fill="none" stroke={dark ? '#f3e3bf' : '#5b3a17'} strokeOpacity={0.3} strokeWidth={1} />
        <g transform={`scale(${(r * 0.74) / 30})`}>{icon(chess8[t] ?? t, color, dark ? '#2b2118' : IVORY)}</g>
      </g>
    );
  }
  const glyph = pieceGlyph(piece, game);
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={dim ? 0.45 : 1} className="piece">
      {family === 'xiangqi' ? (
        <>
          <circle r={r + 1.5} fill="rgba(0,0,0,0.25)" transform="translate(1.5 2.5)" />
          <circle r={r} fill="url(#pieceFill)" stroke={color} strokeWidth={2.4} />
          <circle r={r - 4} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={1.2} />
        </>
      ) : (
        <>
          <polygon points={octagon(r + 1.5)} fill="rgba(0,0,0,0.25)" transform="translate(1.5 2.5)" />
          <polygon points={octagon(r)} fill="url(#pieceFill)" stroke={color} strokeWidth={2.4} />
          <polygon points={octagon(r - 4)} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1} />
        </>
      )}
      {style === 'hanja' ? (
        <text className={FONT_CLASS[game]} fill={color} fontSize={r * (family === 'xiangqi' ? 1.05 : 1.15)} textAnchor="middle" dominantBaseline="central" y={1}>
          {glyph}
        </text>
      ) : (
        <g transform={`scale(${(r * 0.72) / 30})`}>{icon(t === 'M' ? 'FLAG' : t, color)}</g>
      )}
    </g>
  );
}

/** Отдельная маленькая фигура для панелей и диалогов. */
export function PieceIcon({ piece, style, size = 32, game = 'janggi' }: { piece: Piece; style: PieceStyle; size?: number; game?: GameId }) {
  const r = pieceRadius(typeOf(piece), game);
  return (
    <svg width={size} height={size} viewBox="-32 -32 64 64" className="piece-icon">
      <PieceDefs />
      <PieceView piece={piece} style={style} x={0} y={0} scale={30 / r} game={game} />
    </svg>
  );
}

export function PieceDefs() {
  return (
    <defs>
      <radialGradient id="pieceFill" cx="40%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#fffaf0" />
        <stop offset="70%" stopColor="#f3e3bf" />
        <stop offset="100%" stopColor="#dcc597" />
      </radialGradient>
      <radialGradient id="pieceFillDark" cx="40%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#5a4632" />
        <stop offset="70%" stopColor="#2f2318" />
        <stop offset="100%" stopColor="#1c140c" />
      </radialGradient>
      <linearGradient id="shogiFill" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor="#f8e2ad" />
        <stop offset="100%" stopColor="#e2bd73" />
      </linearGradient>
    </defs>
  );
}
