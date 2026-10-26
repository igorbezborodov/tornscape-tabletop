/**
 * Маркеры Состояний, Статусы и Опасный Ландшафт.
 *
 * Глава «Компоненты игры → Кубик Состояний» задаёт шесть Маркеров и момент их
 * срабатывания — «Шаг 4: Срабатывание Маркеров Состояний» Активации:
 *
 *  - Горение     — противник бросает 2 Кубика Атаки, по 1 урону за успех;
 *                  Маркер снимается, если при броске не выпало ни одного Крита;
 *  - Замедление  — Маркер снимается, Пехотная/Крупная теряет 2 гекса Шага и
 *                  Бега, Большая/Огромная — 1 гекс;
 *  - Отравление  — бросок 1 Кубика Атаки, при успехе 1 урон; Маркер остаётся;
 *  - Оглушение   — Маркер снимается, миниатюра теряет 1 Маркер Времени;
 *  - Кровотечение — 1 урон; можно потратить 2 Маркера Времени на действие
 *                  «Перевязать раны» и снять Маркер;
 *  - Паника      — Маркер снимается, миниатюра теряет 1 Маркер Времени и
 *                  перемещается в сторону своей зоны развёртывания.
 *
 * Огромные миниатюры не получают Маркеры Состояний, кроме случаев, когда
 * источник — Огромная миниатюра (своя или чужая).
 *
 * Глава «Структура игры → Статусы» описывает «Разгул», «Голод», «Ослеплён» и
 * «Горючий». Статус — не Маркер: правила, работающие с Маркерами, на него не
 * влияют.
 */

import type {
  ActionKind,
  MiniStatus,
  StateMarker,
  TerrainData,
  Unit,
} from '../types/game';
import { MINI_STATUS_LABEL, STATE_MARKER_LABEL, STATE_MARKER_ORDER } from '../types/game';
import { countAnySuccess, countCriticals, describeDice, rollPool } from './dice';

/** При Активации миниатюра получает 2 Маркера Времени, накопить можно не более 3. */
export const ACTIVATION_TIME_MARKERS = 2;
export const MAX_TIME_MARKERS = 3;

/** Минимальная дистанция действий «Шаг»/«Бег» — даже со штрафами. */
const MIN_MOVEMENT = 1;

/**
 * Может ли миниатюра получить Маркер Состояния.
 * Огромные миниатюры защищены, если источник не Огромный.
 */
export const canReceiveStateMarker = (target: Unit, sourceIsHuge = false): boolean =>
  target.size !== 'huge' || sourceIsHuge;

/** Добавляет Маркер Состояния, если он ещё не висит на миниатюре. */
export const addStateMarker = (
  unit: Unit,
  marker: StateMarker,
  sourceIsHuge = false,
): { unit: Unit; applied: boolean; reason?: string } => {
  if (!canReceiveStateMarker(unit, sourceIsHuge)) {
    return {
      unit,
      applied: false,
      reason: `Огромная миниатюра «${unit.name}» не получает Маркеры Состояний.`,
    };
  }

  if (unit.stateMarkers.includes(marker)) {
    return { unit, applied: false, reason: `Маркер «${STATE_MARKER_LABEL[marker]}» уже есть.` };
  }

  return {
    unit: { ...unit, stateMarkers: [...unit.stateMarkers, marker] },
    applied: true,
  };
};

/** Снимает Маркер Состояния. */
export const removeStateMarker = (unit: Unit, marker: StateMarker): Unit => ({
  ...unit,
  stateMarkers: unit.stateMarkers.filter(item => item !== marker),
});

const isInfantryLike = (unit: Unit): boolean =>
  unit.size === 'infantry' || unit.size === 'largeInfantry';

/**
 * Дистанция «Шага»/«Бега» с учётом Маркеров, Статусов и ландшафта.
 *
 *  - Замедление: −2 гекса для Пехотной/Крупной, −1 для Большой/Огромной;
 *  - Зыбучие Пески: Пехотная/Крупная теряет 1 гекс;
 *  - Голод: +1 гекс для Пехотной/Крупной.
 */
export const effectiveMovement = (unit: Unit, terrain?: TerrainData): number => {
  let total = unit.movement;

  if (unit.stateMarkers.includes('slowed')) {
    total -= unit.size === 'big' || unit.size === 'huge' ? 1 : 2;
  }

  if (terrain?.type === 'quicksand' && isInfantryLike(unit)) {
    total -= 1;
  }

  if (unit.statuses.includes('hunger') && isInfantryLike(unit)) {
    total += 1;
  }

  return Math.max(MIN_MOVEMENT, total);
};

/** Разрешены ли Кубики Ловкости на Зыбучих Песках (для Пехотной/Крупной — нет). */
export const agilityDiceAllowed = (unit: Unit, terrain?: TerrainData): boolean =>
  !(terrain?.type === 'quicksand' && isInfantryLike(unit));

/** Разгул даёт +1 Кубик Защиты. */
export const statusDefenseBonus = (unit: Unit): number =>
  unit.statuses.includes('rampage') ? 1 : 0;

export type MarkerTriggerResult = {
  unit: Unit;
  logs: string[];
  /** Миниатюра погибла от эффектов Маркеров. */
  died: boolean;
  /** Сработал Маркер «Паника»: миниатюра бежит к своей зоне развёртывания. */
  panicMove: boolean;
};

/**
 * «Шаг 4: Срабатывание Маркеров Состояний».
 *
 * Маркеры разрешаются в фиксированном порядке граней Кубика Состояний, чтобы
 * результат был воспроизводим. Параметр `bindWounds` включает трату 2 Маркеров
 * Времени на «Перевязать раны» — интерфейс предлагает это игроку.
 */
export const triggerStateMarkers = (
  unit: Unit,
  options: { bindWounds?: boolean } = {},
): MarkerTriggerResult => {
  const logs: string[] = [];
  let current: Unit = { ...unit, stateMarkers: [...unit.stateMarkers] };
  let panicMove = false;

  const damage = (amount: number, source: string): void => {
    if (amount <= 0) return;
    current = { ...current, hp: Math.max(0, current.hp - amount) };
    logs.push(`${source}: «${current.name}» получает ${amount} урона (Жизни ${current.hp}).`);
  };

  const spendTimeMarker = (count: number): void => {
    current = {
      ...current,
      timeMarkers: Math.max(0, current.timeMarkers - count),
    };
  };

  for (const marker of STATE_MARKER_ORDER) {
    if (current.hp <= 0) break;
    if (!current.stateMarkers.includes(marker)) continue;

    switch (marker) {
      case 'burning': {
        const dice = rollPool({ attack: 2, agility: 0, mastery: 0 });
        const damageDone = countAnySuccess(dice);
        logs.push(
          `Маркер «Горение»: бросок 2 Кубиков Атаки → ${describeDice(dice)} (${damageDone} урона).`,
        );
        damage(damageDone, 'Горение');
        const criticals = countCriticals(dice);
        if (criticals === 0) {
          current = removeStateMarker(current, 'burning');
          logs.push('Критов нет — Маркер «Горение» снят.');
        } else {
          logs.push('Выпал Критический Успех — Маркер «Горение» остаётся.');
        }
        break;
      }

      case 'slowed': {
        const penalty = current.size === 'big' || current.size === 'huge' ? 1 : 2;
        current = removeStateMarker(current, 'slowed');
        logs.push(
          `Маркер «Замедление» снят: дистанция Шага и Бега уменьшена на ${penalty} гекс(а) до конца Активации.`,
        );
        break;
      }

      case 'poisoned': {
        const dice = rollPool({ attack: 1, agility: 0, mastery: 0 });
        const damageDone = countAnySuccess(dice);
        logs.push(
          `Маркер «Отравление»: бросок 1 Кубика Атаки → ${describeDice(dice)}.`,
        );
        damage(damageDone, 'Отравление');
        break;
      }

      case 'stunned': {
        current = removeStateMarker(current, 'stunned');
        spendTimeMarker(1);
        logs.push(
          `Маркер «Оглушение» снят: потерян 1 Маркер Времени (осталось ${current.timeMarkers}).`,
        );
        break;
      }

      case 'bleeding': {
        if (options.bindWounds && current.timeMarkers >= 2) {
          spendTimeMarker(2);
          current = removeStateMarker(current, 'bleeding');
          logs.push(
            `«Перевязать раны»: потрачено 2 Маркера Времени, Маркер «Кровотечение» снят.`,
          );
        } else {
          damage(1, 'Кровотечение');
          logs.push(
            `Маркер «Кровотечение» остаётся (для снятия нужно 2 Маркера Времени).`,
          );
        }
        break;
      }

      case 'panic': {
        current = removeStateMarker(current, 'panic');
        spendTimeMarker(1);
        panicMove = true;
        logs.push(
          `Маркер «Паника» снят: потерян 1 Маркер Времени (осталось ${current.timeMarkers}) и миниатюра бежит к своей зоне развёртывания.`,
        );
        break;
      }
    }
  }

  return { unit: current, logs, died: current.hp <= 0, panicMove };
};

/**
 * «Шаг 2: Срабатывание ландшафта» — Опасный Ландшафт срабатывает в начале
 * Активации.
 *
 *  - Пламенная Земля → Маркер «Горение»;
 *  - Губительная Топь → Маркер «Отравление»;
 *  - Зыбучие Пески → Пехотная/Крупная теряет 1 гекс движения и Кубики Ловкости;
 *  - Глубокая Вода → проверка Уклонения, при провале миниатюра погибает.
 */
export const terrainActivationEffect = (
  unit: Unit,
  terrain?: TerrainData,
): { unit: Unit; logs: string[]; died: boolean } => {
  if (!terrain) return { unit, logs: [], died: false };

  const logs: string[] = [];
  let current = unit;

  if (terrain.type === 'flame') {
    const applied = addStateMarker(current, 'burning');
    current = applied.unit;
    logs.push(
      applied.applied
        ? `Пламенная Земля: «${current.name}» получает Маркер «Горение».`
        : applied.reason ?? 'Пламенная Земля не оказала эффекта.',
    );
  }

  if (terrain.type === 'swamp') {
    const applied = addStateMarker(current, 'poisoned');
    current = applied.unit;
    logs.push(
      applied.applied
        ? `Губительная Топь: «${current.name}» получает Маркер «Отравление».`
        : applied.reason ?? 'Губительная Топь не оказала эффекта.',
    );
  }

  if (terrain.type === 'quicksand') {
    logs.push(
      isInfantryLike(current)
        ? `Зыбучие Пески: «${current.name}» теряет 1 гекс движения и не может использовать Кубики Ловкости.`
        : `Зыбучие Пески: «${current.name}» не испытывает затруднений.`,
    );
  }

  if (terrain.type === 'deepWater') {
    if (current.size === 'huge') {
      logs.push(`Глубокая Вода: Огромная миниатюра «${current.name}» проходит свободно.`);
    } else {
      const diceCount = current.size === 'big' ? 2 : 1;
      const dice = rollPool({ attack: 0, agility: diceCount, mastery: 0 });
      const passed = countAnySuccess(dice) > 0;
      logs.push(
        `Глубокая Вода: проверка Уклонения (${diceCount}🌀) → ${describeDice(dice)} — ${
          passed ? 'пройдена' : 'провалена'
        }.`,
      );
      if (!passed) {
        current = { ...current, hp: 0 };
        logs.push(`«${current.name}» погибает в Глубокой Воде.`);
        return { unit: current, logs, died: true };
      }
    }
  }

  return { unit: current, logs, died: false };
};

/**
 * Применение Статуса. «Разгул» немедленно даёт +2 Жизни, «Голод» и «Разгул»
 * взаимно исключают друг друга.
 */
export const gainStatus = (unit: Unit, status: MiniStatus): { unit: Unit; log: string } => {
  if (unit.statuses.includes(status)) {
    return { unit, log: `Статус «${MINI_STATUS_LABEL[status]}» уже активен.` };
  }

  let next: Unit = { ...unit, statuses: [...unit.statuses, status] };
  const notes = [`«${unit.name}» получает Статус «${MINI_STATUS_LABEL[status]}»`];

  if (status === 'rampage') {
    next = {
      ...next,
      statuses: next.statuses.filter(item => item !== 'hunger'),
      hp: Math.min(next.maxHp, next.hp + 2),
    };
    notes.push('немедленно +2 Жизни, +1 Кубик Защиты, запрещён Бег');
    notes.push('Статус «Голод» снят');
  }

  if (status === 'hunger') {
    next = { ...next, statuses: next.statuses.filter(item => item !== 'rampage') };
    notes.push('+1 гекс к Шагу и Бегу, +1 Кубик Атаки в ближнем бою, запрещена Концентрация');
    notes.push('Статус «Разгул» снят');
  }

  if (status === 'blinded') {
    notes.push('запрещена Концентрация, Статус теряется в конце следующей Активации');
  }

  if (status === 'flammable') {
    notes.push('уязвимость к огню, Статус теряется в конце следующей Активации');
  }

  return { unit: next, log: `${notes.join('; ')}.` };
};

/** «Разгул» теряется в начале своего хода. */
export const expireStatusesAtStartOfTurn = (unit: Unit): { unit: Unit; logs: string[] } => {
  if (!unit.statuses.includes('rampage')) return { unit, logs: [] };
  return {
    unit: { ...unit, statuses: unit.statuses.filter(status => status !== 'rampage') },
    logs: [`Статус «Разгул» у «${unit.name}» заканчивается в начале хода.`],
  };
};

/** «Ослеплён» и «Горючий» теряются в конце следующей Активации. */
export const expireStatusesAtEndOfActivation = (unit: Unit): { unit: Unit; logs: string[] } => {
  const expiring: MiniStatus[] = unit.statuses.filter(
    status => status === 'blinded' || status === 'flammable',
  );
  if (expiring.length === 0) return { unit, logs: [] };

  return {
    unit: {
      ...unit,
      statuses: unit.statuses.filter(status => !expiring.includes(status)),
    },
    logs: expiring.map(
      status => `Статус «${MINI_STATUS_LABEL[status]}» у «${unit.name}» заканчивается.`,
    ),
  };
};

/**
 * Ограничения Статусов на Действия:
 *  - «Голод» и «Ослеплён» запрещают Концентрацию;
 *  - «Разгул» запрещает Бег.
 */
export const canPerformAction = (
  unit: Unit,
  kind: ActionKind,
): { allowed: boolean; reason?: string } => {
  if (kind === 'concentrate') {
    if (unit.statuses.includes('hunger')) {
      return { allowed: false, reason: 'Статус «Голод» запрещает Концентрацию.' };
    }
    if (unit.statuses.includes('blinded')) {
      return { allowed: false, reason: 'Статус «Ослеплён» запрещает Концентрацию.' };
    }
  }

  if (kind === 'run' && unit.statuses.includes('rampage')) {
    return { allowed: false, reason: 'Статус «Разгул» запрещает Бег.' };
  }

  return { allowed: true };
};

/**
 * «Лютый Голод» — последовательность Фазы I: если миниатюра с «Голодом»
 * заканчивает ход без жертв, она обязана атаковать ближайшую миниатюру.
 * Возвращает текст напоминания для журнала.
 */
export const hungerReminder = (unit: Unit): string | null =>
  unit.statuses.includes('hunger')
    ? `«Лютый Голод»: «${unit.name}» должна атаковать ближайшую миниатюру в свой ход.`
    : null;
