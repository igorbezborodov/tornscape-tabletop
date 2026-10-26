/**
 * Эфирные Вихри (глава «Эфирные Вихри»).
 *
 * Правила:
 *  - Вихрь занимает один Гексон (центр «цветка» из 7 гексов);
 *  - Вихрь имеет запас Кристаллов Эфира: миниатюра, заканчивающая движение в
 *    смежном с Вихрем гексе, может забрать Кристаллы (действие «Исследовать»);
 *  - У Вихря есть Приверженность: если Приверженность враждебна домену
 *    миниатюры, миниатюра не может забирать Кристаллы и получает штрафы;
 *  - Приверженность меняется, когда миниатюра вносит Кристаллы Эфира;
 *  - Фаза V «Движение Вихрей»: игроки по очереди, начиная с того, кто первым
 *    активировал все свои миниатюры, бросают 2 Кубика Атаки и по выпавшему
 *    значению определяют направление, после чего могут повернуть Вихрь в любую
 *    сторону;
 *  - Вихрь создаёт Зону Плохой Видимости и запрещает Реакции стоящим в нём;
 *  - «Вихрь-Смерч» (сценарий 16) определяет Приверженность при каждом
 *    взаимодействии.
 */

import type { DomainSlug, HexCoord, PlayerId, Whirlwind } from '../types/game';
import { HOSTILE_DOMAINS } from '../types/game';
import { HEXSON_DIRS, hexKey, hexsonDistance, hexsonLine, hexsonNeighbors } from './hex';
import { countAnySuccess, describeDice, rollPool } from './dice';

/** Сколько Кристаллов Эфира содержит новый Вихрь. */
export const DEFAULT_ETHER_CRYSTALS = 3;

let whirlwindCounter = 0;
const nextWhirlwindId = (): string => {
  whirlwindCounter += 1;
  return `ww-${whirlwindCounter.toString(36)}`;
};

/** Создаёт нейтральный Вихрь в указанном Гексоне. */
export const createWhirlwind = (
  position: HexCoord,
  options: { etherCrystals?: number; domain?: DomainSlug | null; isMaelstrom?: boolean } = {},
): Whirlwind => ({
  id: nextWhirlwindId(),
  position,
  etherCrystals: options.etherCrystals ?? DEFAULT_ETHER_CRYSTALS,
  allegiance: null,
  domain: options.domain ?? null,
  isMaelstrom: options.isMaelstrom ?? false,
});

/**
 * Приверженность Вихря по отношению к домену миниатюры:
 *  - 'allied'   — домен совпадает или Вихрь нейтрален;
 *  - 'hostile'  — домен враждебен домену миниатюры;
 *  - 'neutral'  — у Вихря нет домена.
 */
export const allegianceFor = (
  whirlwind: Whirlwind,
  domain?: DomainSlug,
): 'allied' | 'hostile' | 'neutral' => {
  if (!whirlwind.domain || !domain) return 'neutral';
  if (whirlwind.domain === domain) return 'allied';
  return HOSTILE_DOMAINS[domain] === whirlwind.domain ? 'hostile' : 'neutral';
};

/** Миниатюра может забирать Кристаллы, если Вихрь не враждебен её домену. */
export const canTakeEther = (whirlwind: Whirlwind, domain?: DomainSlug): boolean =>
  allegianceFor(whirlwind, domain) !== 'hostile';

/**
 * Забирает Кристаллы Эфира из Вихря. Приверженность переходит к забравшему,
 * если он внёс в Вихрь Кристаллы (для прототипа — при любом изъятии).
 */
export const takeEtherCrystals = (
  whirlwind: Whirlwind,
  player: PlayerId,
  amount: number,
): { whirlwind: Whirlwind; taken: number } => {
  const taken = Math.max(0, Math.min(amount, whirlwind.etherCrystals));
  return {
    whirlwind: {
      ...whirlwind,
      etherCrystals: whirlwind.etherCrystals - taken,
      allegiance: taken > 0 ? player : whirlwind.allegiance,
    },
    taken,
  };
};

/**
 * Миниатюра находится «в Вихре», если её Гексон совпадает с центром Вихря или
 * является одним из шести соседних.
 */
export const isInWhirlwind = (whirlwind: Whirlwind, position: HexCoord): boolean =>
  hexsonDistance(whirlwind.position, position) < 1.5;

/** Гексоны Зоны Плохой Видимости вокруг Вихря. */
export const poorVisibilityHexsons = (whirlwind: Whirlwind): string[] =>
  [whirlwind.position, ...hexsonNeighbors(whirlwind.position)].map(hexKey);

/** Реакции недоступны миниатюре, стоящей в Вихре. */
export const reactionsBlockedInWhirlwind = (whirlwinds: Whirlwind[], position: HexCoord): boolean =>
  whirlwinds.some(whirlwind => isInWhirlwind(whirlwind, position));

/**
 * Фаза V: направление движения Вихря по 2 Кубикам Атаки.
 *
 * Значения на гранях переводятся в одно из шести направлений Гексонов:
 * каждый успех сдвигает на 1 Гексон, Критический Успех — на 2. Итоговый сдвиг
 * складывается по модулю 6 направлений. Игрок после броска может повернуть
 * Вихрь в любую сторону — это реализовано параметром `rotateTo`.
 */
export type WhirlwindMoveResult = {
  whirlwind: Whirlwind;
  dice: ReturnType<typeof rollPool>;
  log: string;
  direction: HexCoord;
  /** Сколько Гексонов пролетел Вихрь. */
  distance: number;
};

export const moveWhirlwind = (
  whirlwind: Whirlwind,
  options: { rotateTo?: number; inBounds?: (h: HexCoord) => boolean } = {},
): WhirlwindMoveResult => {
  const dice = rollPool({ attack: 2, agility: 0, mastery: 0 });
  const successes = countAnySuccess(dice);

  // Направление: сумма «весов» кубиков по кругу из шести направлений.
  const weighted = dice.reduce((total, die, index) => {
    const weight = die.face === 'critical' ? 2 : die.face === 'success' ? 1 : 0;
    return total + weight * (index + 1);
  }, 0);

  const directionIndex = options.rotateTo ?? (weighted % HEXSON_DIRS.length);
  const direction = HEXSON_DIRS[directionIndex];

  // Вихрь летит на число успехов (минимум 1, чтобы движение было заметным).
  const distance = Math.max(1, successes);
  let position = whirlwind.position;

  for (let step = 0; step < distance; step++) {
    const candidate = { q: position.q + direction.q, r: position.r + direction.r };
    if (options.inBounds && !options.inBounds(candidate)) break;
    position = candidate;
  }

  return {
    whirlwind: { ...whirlwind, position },
    dice,
    direction,
    distance,
    log:
      `Вихрь в ${hexKey(whirlwind.position)}: бросок 2 Кубиков Атаки → ${describeDice(dice)}; ` +
      `направление ${directionIndex + 1}, смещение на ${distance} Гексон(а) → ${hexKey(position)}` +
      (options.rotateTo !== undefined ? ' (повёрнут игроком).' : '.'),
  };
};

/**
 * Линия полёта Вихря для отрисовки на поле: Гексоны от старого к новому центру.
 * Используется интерфейсом, чтобы показать траекторию.
 */
export const whirlwindPath = (from: HexCoord, to: HexCoord): HexCoord[] => hexsonLine(from, to);

/** Оставшиеся Кристаллы Эфира на всех Вихрях (для сценариев). */
export const totalEtherCrystals = (whirlwinds: Whirlwind[]): number =>
  whirlwinds.reduce((total, whirlwind) => total + whirlwind.etherCrystals, 0);

/** Вихри, чья Приверженность принадлежит указанному игроку. */
export const whirlwindsOf = (whirlwinds: Whirlwind[], player: PlayerId): Whirlwind[] =>
  whirlwinds.filter(whirlwind => whirlwind.allegiance === player);
