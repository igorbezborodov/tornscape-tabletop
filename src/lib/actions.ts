/**
 * Плитки Действий и проверки их легальности.
 *
 * Глава «Структура игры → Действия» перечисляет стандартные Действия:
 *  - Шаг            — 1 Маркер Времени, движение на дистанцию «Шага»;
 *  - Бег            — 1 Маркер Времени, движение на удвоенную дистанцию, но
 *                     запрещён при Статусе «Разгул»;
 *  - Концентрация   — 1 Маркер Времени, +1 Кубик Атаки к следующему Действию;
 *  - Защита         — Реакция, +2 Кубика Защиты до конца Активации;
 *  - Исследовать    — 1 Маркер Времени, сбор Кристаллов Эфира и Маркеров;
 *  - Взять предмет  — 1 Маркер Времени, подбор Маркера Сценария;
 *  - Перевязать раны— 2 Маркера Времени, снятие Маркера «Кровотечение».
 *
 * Ко всем Действиям применяются общие ограничения Активации (глава
 * «Активация Миниатюр → Маркеры Времени»):
 *  - при Активации выдаётся 2 Маркера Времени, накопить можно не более 3;
 *  - нельзя повторять одно и то же Действие в одной Активации;
 *  - можно совершить не более одной Атаки за Активацию;
 *  - Реакции доступны только неактивированной миниатюре и расходуют её
 *    Активацию.
 */

import type { ActionKind, ActionTile, TerrainData, Unit } from '../types/game';
import { effectiveMovement } from './stateMarkers';

/** Стандартные Действия, не привязанные к Плиткам конкретной миниатюры. */
export const standardActionsFor = (unit: Unit, terrain?: TerrainData): ActionTile[] => {
  const stepRange = effectiveMovement(unit, terrain);

  return [
    {
      id: 'step',
      name: 'Шаг',
      kind: 'step',
      timeCost: 1,
      range: stepRange,
      description: `Перемещение на ${stepRange} гекс(а).`,
    },
    {
      id: 'run',
      name: 'Бег',
      kind: 'run',
      timeCost: 1,
      range: stepRange * 2,
      description: `Перемещение на ${stepRange * 2} гекс(а); запрещён при «Разгуле».`,
    },
    {
      id: 'concentrate',
      name: 'Концентрация',
      kind: 'concentrate',
      timeCost: 1,
      range: 0,
      description: '+1 Кубик Атаки к следующему Действию; запрещена при «Голоде» и «Ослеплении».',
    },
    {
      id: 'defend',
      name: 'Защита',
      kind: 'defend',
      timeCost: 1,
      range: 0,
      reaction: true,
      description: 'Реакция: +2 Кубика Защиты до конца Активации.',
    },
    {
      id: 'investigate',
      name: 'Исследовать',
      kind: 'investigate',
      timeCost: 1,
      range: 0,
      description: 'Собрать Кристаллы Эфира или Маркер Сценария в своём Гексоне.',
    },
    {
      id: 'takeItem',
      name: 'Взять предмет',
      kind: 'takeItem',
      timeCost: 1,
      range: 0,
      description: 'Подобрать Переносимый Маркер Сценария в своём Гексоне.',
    },
    {
      id: 'healWounds',
      name: 'Перевязать раны',
      kind: 'healWounds',
      timeCost: 2,
      range: 0,
      description: 'Снять Маркер «Кровотечение».',
    },
  ];
};

/** Полный список доступных Плиток Действий миниатюры (атаки + стандартные). */
export const actionsFor = (unit: Unit, terrain?: TerrainData): ActionTile[] => [
  ...unit.attackTiles,
  ...standardActionsFor(unit, terrain),
];

/** Поиск Плитки по id. */
export const actionById = (
  unit: Unit,
  actionId: string,
  terrain?: TerrainData,
): ActionTile | undefined => actionsFor(unit, terrain).find(tile => tile.id === actionId);

export const isAttackAction = (tile: ActionTile): boolean =>
  tile.kind === 'meleeAttack' || tile.kind === 'rangedAttack' || tile.kind === 'counterAttack';

/** Что уже использовано в текущей Активации. */
export type ActivationUsage = {
  actionIds: string[];
  attackUsed: boolean;
  /** Потрачено Маркеров Времени на действия (без учёта штрафов). */
  timeSpent: number;
};

export type ActionLegality = { allowed: boolean; reason?: string };

/**
 * Полная проверка легальности Действия:
 * Маркеры Времени, повтор Действия, лимит Атак, Реакции и Статусы.
 */
export const checkActionLegality = (
  unit: Unit,
  tile: ActionTile,
  usage: ActivationUsage,
  options: { activating: boolean; reacting: boolean } = { activating: true, reacting: false },
): ActionLegality => {
  if (unit.hp <= 0) return { allowed: false, reason: 'Миниатюра уничтожена.' };

  if (tile.reaction && !options.reacting) {
    return {
      allowed: false,
      reason: 'Это Действие-Реакция: его можно заявить только в ответ на действие противника.',
    };
  }

  if (!tile.reaction && options.reacting) {
    return { allowed: false, reason: 'Реакцией можно заявить только Реакцию.' };
  }

  if (isAttackAction(tile) && usage.attackUsed) {
    return { allowed: false, reason: 'За Активацию можно совершить только одну Атаку.' };
  }

  if (usage.actionIds.includes(tile.id)) {
    return { allowed: false, reason: `Действие «${tile.name}» уже использовано в этой Активации.` };
  }

  if (unit.timeMarkers < tile.timeCost) {
    return {
      allowed: false,
      reason: `Не хватает Маркеров Времени: нужно ${tile.timeCost}, есть ${unit.timeMarkers}.`,
    };
  }

  if (tile.kind === 'run' && unit.statuses.includes('rampage')) {
    return { allowed: false, reason: 'Статус «Разгул» запрещает Бег.' };
  }

  if (tile.kind === 'concentrate') {
    if (unit.statuses.includes('hunger')) {
      return { allowed: false, reason: 'Статус «Голод» запрещает Концентрацию.' };
    }
    if (unit.statuses.includes('blinded')) {
      return { allowed: false, reason: 'Статус «Ослеплён» запрещает Концентрацию.' };
    }
  }

  return { allowed: true };
};

/** Дистанция до цели в гексах для проверки дальности Атаки. */
export const actionReach = (tile: ActionTile): number => Math.max(1, tile.range);

/** Ключи Плиток, которые считаются «атакой» для правила «одна Атака». */
export const ATTACK_KINDS: ActionKind[] = ['meleeAttack', 'rangedAttack', 'counterAttack'];
