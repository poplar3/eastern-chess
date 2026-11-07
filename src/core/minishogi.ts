// Малые сёги на доске 5×5: мини-сёги и киото-сёги (правила — в shogi.ts).
import { SHOGI_PIECES, shogiVariant, type ShogiGait } from './shogi';
import type { PieceInfo, Variant } from './types';

export const MINISHOGI_START = 'rbsgk/4p/5/P4/KGSBR[-] w 0 1';
export const KYOTOSHOGI_START = 'p+nks+l/5/5/5/+LSK+NP[-] w 0 1';

const MINI_TYPES = ['K', 'R', 'B', 'G', 'S', 'P', '+R', '+B', '+S', '+P'];

export const MINISHOGI: Variant = shogiVariant(
  {
    id: 'minishogi',
    engine: 'minishogi',
    name: 'Мини-сёги',
    subtitle: 'сёги на доске 5×5',
    mark: '五',
    size: 5,
    startFen: MINISHOGI_START,
    pieces: Object.fromEntries(MINI_TYPES.map((t) => [t, SHOGI_PIECES[t]])),
    values: { K: 0, R: 10, B: 8, G: 6, S: 5, P: 2, '+R': 12, '+B': 10, '+S': 6, '+P': 6 },
    gaits: { K: 'king', R: 'rook', B: 'bishop', G: 'gold', S: 'silver', P: 'pawn', '+R': 'dragon', '+B': 'horse', '+S': 'gold', '+P': 'gold' },
    handOrder: ['R', 'B', 'G', 'S', 'P'],
    zone: 1,
    classicDrops: true,
    repetition: 'sente-loses',
    endReasons: {
      checkmate: 'Мат (цуми)',
      stalemate: 'Нет ходов — это поражение',
      'pawn-drop-mate': 'Мат сбросом пешки (утифудзумэ) запрещён: поставивший его проигрывает',
      repetition: 'Четырёхкратное повторение позиции (сэннититэ): в мини-сёги проигрывает сэнтэ',
      'perpetual-check': 'Вечный шах при повторении запрещён: проигрывает шахующий',
      resign: 'Сдача',
    },
  },
  { group: 'extra', promoHint: 'Фигура входит в последнюю горизонталь или выходит из неё. Превращаться необязательно (пешке на последней горизонтали — обязательно).' },
);

/** Фигуры киото-сёги: у каждой, кроме короля, две стороны. */
export const KYOTO_PIECES: Record<string, PieceInfo> = {
  K: SHOGI_PIECES.K,
  L: { ru: 'Стрелка', short: 'Ст', acc: 'стрелку', ins: 'стрелкой', native: '香' },
  '+L': { ru: 'Токин', short: 'Т', acc: 'токин', ins: 'токином', native: 'と' },
  S: { ru: 'Серебряный генерал', short: 'Се', acc: 'серебряного генерала', ins: 'серебряным генералом', native: '銀' },
  '+S': { ru: 'Слон', short: 'С', acc: 'слона', ins: 'слоном', native: '角' },
  N: { ru: 'Конь', short: 'К', acc: 'коня', ins: 'конём', native: '桂' },
  '+N': { ru: 'Золотой генерал', short: 'З', acc: 'золотого генерала', ins: 'золотым генералом', native: '金' },
  P: { ru: 'Пешка', short: 'П', acc: 'пешку', ins: 'пешкой', native: '歩' },
  '+P': { ru: 'Ладья', short: 'Л', acc: 'ладью', ins: 'ладьёй', native: '飛' },
};

const KYOTO_GAITS: Record<string, ShogiGait> = {
  K: 'king', L: 'lance', '+L': 'gold', S: 'silver', '+S': 'bishop', N: 'knight', '+N': 'gold', P: 'pawn', '+P': 'rook',
};

export const KYOTOSHOGI: Variant = shogiVariant(
  {
    id: 'kyotoshogi',
    engine: 'kyotoshogi',
    name: 'Киото-сёги',
    subtitle: 'фигуры-перевёртыши 5×5',
    mark: '京',
    size: 5,
    startFen: KYOTOSHOGI_START,
    pieces: KYOTO_PIECES,
    values: { K: 0, L: 4, '+L': 6, S: 5, '+S': 7, N: 4, '+N': 6, P: 3, '+P': 8 },
    gaits: KYOTO_GAITS,
    handOrder: ['P', 'S', 'N', 'L'],
    zone: 5,
    kyoto: true,
    classicDrops: false,
    repetition: 'draw',
    endReasons: {
      checkmate: 'Мат (цуми)',
      stalemate: 'Нет ходов — это поражение',
      repetition: 'Четырёхкратное повторение позиции (сэннититэ): ничья',
      'perpetual-check': 'Вечный шах при повторении запрещён: проигрывает шахующий',
      resign: 'Сдача',
    },
  },
  { group: 'extra', promoHint: 'Взятую фигуру можно поставить любой стороной.' },
);
