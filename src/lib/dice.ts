/**
 * Движок Костей Торна.
 *
 * Правила (глава «Компоненты игры → Игровые Кубики») описывают четыре вида
 * кубиков и три возможных значения на грани, но не публикуют точное
 * распределение граней — оно задаётся физическими кубиками набора.
 * Здесь распределение вынесено в `DIE_FACES`: если понадобится подстроить
 * баланс под реальные кубики, достаточно изменить эту таблицу.
 *
 *  - Кубик Атаки  (красный): Успех / Критический Успех / Ничего;
 *  - Кубик Защиты (белый):   Успех / Критический Успех / Ничего;
 *  - Кубик Ловкости (зелёный): Успех / Ничего (критов нет);
 *  - Кубик Мастерства (чёрный): Успех / Ничего (критов нет).
 */

import type { DefensePool, DicePool, DieFace, DieResult, DieType } from '../types/game';

/** Распределение граней по видам кубиков (6 граней на кубик). */
export const DIE_FACES: Record<DieType, DieFace[]> = {
  attack: ['critical', 'success', 'success', 'success', 'blank', 'blank'],
  defense: ['critical', 'success', 'success', 'blank', 'blank', 'blank'],
  agility: ['success', 'success', 'success', 'blank', 'blank', 'blank'],
  mastery: ['success', 'success', 'success', 'blank', 'blank', 'blank'],
};

/** Подписи и цвета кубиков — используются в интерфейсе броска. */
export const DIE_META: Record<DieType, { label: string; color: string; glyph: string }> = {
  attack: { label: 'Атака', color: '#c0392b', glyph: '⚔️' },
  defense: { label: 'Защита', color: '#ecf0f1', glyph: '🛡️' },
  agility: { label: 'Ловкость', color: '#27ae60', glyph: '🌀' },
  mastery: { label: 'Мастерство', color: '#2c3e50', glyph: '✴️' },
};

export const FACE_LABEL: Record<DieFace, string> = {
  success: 'Успех',
  critical: 'Критический Успех',
  blank: 'Ничего',
};

let dieCounter = 0;

const nextDieId = (): string => {
  dieCounter += 1;
  return `die-${Date.now().toString(36)}-${dieCounter.toString(36)}`;
};

/** Бросок одного кубика указанного вида. */
export const rollDie = (type: DieType): DieResult => {
  const faces = DIE_FACES[type];
  const face = faces[Math.floor(Math.random() * faces.length)];
  return { id: nextDieId(), type, face };
};

/** Переброс уже брошенного кубика (Ловкость, способности, Кристаллы Эфира). */
export const rerollDie = (die: DieResult): DieResult => ({
  ...rollDie(die.type),
  id: die.id,
});

/** Бросок Пула Кубиков: все кубики бросаются одновременно. */
export const rollPool = (pool: DicePool): DieResult[] => {
  const dice: DieResult[] = [];
  for (let i = 0; i < (pool.attack ?? 0); i++) dice.push(rollDie('attack'));
  for (let i = 0; i < (pool.agility ?? 0); i++) dice.push(rollDie('agility'));
  for (let i = 0; i < (pool.mastery ?? 0); i++) dice.push(rollDie('mastery'));
  for (let i = 0; i < (pool.defense ?? 0); i++) dice.push(rollDie('defense'));
  return dice;
};

/** Бросок пула Защиты из пиктограммы щита. */
export const rollDefensePool = (pool: DefensePool): DieResult[] =>
  rollPool({ attack: 0, agility: pool.agility, mastery: 0, defense: pool.defense });

export const countFace = (dice: DieResult[], face: DieFace): number =>
  dice.reduce((total, die) => (die.face === face ? total + 1 : total), 0);

export const countSuccesses = (dice: DieResult[]): number => countFace(dice, 'success');

export const countCriticals = (dice: DieResult[]): number => countFace(dice, 'critical');

/** Любой успех, включая критический (для правил «при наличии хотя бы одного успеха»). */
export const countAnySuccess = (dice: DieResult[]): number =>
  countSuccesses(dice) + countCriticals(dice);

/** Кубики заданного вида. */
export const diceOfType = (dice: DieResult[], type: DieType): DieResult[] =>
  dice.filter(die => die.type === type);

/** Текстовое описание результата броска для журнала. */
export const describeDice = (dice: DieResult[]): string =>
  dice
    .map(die => {
      const glyph = die.type === 'attack' ? '⚔' : die.type === 'defense' ? '🛡' : die.type === 'agility' ? '🌀' : '✴';
      const value = die.face === 'critical' ? 'К' : die.face === 'success' ? 'У' : '·';
      return `${glyph}${value}`;
    })
    .join(' ');

/**
 * Пул Кубиков Атаки с учётом бонусов:
 *  - «Концентрация» добавляет кубики к следующему действию;
 *  - статус «Голод» даёт +1 Кубик Атаки к ближнему бою;
 *  - «Кристаллы Эфирита» рядом дают +1 Мастерство и +1 Ловкость к эфирным атакам.
 */
export const buildAttackPool = (
  actionPool: DicePool | undefined,
  bonuses: { concentration?: number; hunger?: boolean; nearEtherCrystals?: boolean; etherAttack?: boolean } = {},
): DicePool => {
  const base: DicePool = {
    attack: actionPool?.attack ?? 0,
    agility: actionPool?.agility ?? 0,
    mastery: actionPool?.mastery ?? 0,
  };

  base.attack += bonuses.concentration ?? 0;
  if (bonuses.hunger) base.attack += 1;
  if (bonuses.nearEtherCrystals && bonuses.etherAttack) {
    base.mastery += 1;
    base.agility += 1;
  }

  return base;
};
