/**
 * Разрешение Действия Атаки по правилам Tornscape.
 *
 * Глава «Бой → Структура Действия Атаки» задаёт ровно 11 шагов:
 *   1. Проверка легальности цели
 *   2. Бросок Атаки
 *   3. Использование Ловкости (атакующий)
 *   4. Переброс атакующего за способности и эфир
 *   5. Переброс защищающегося за способности и эффекты
 *   6. Бросок Защиты
 *   7. Использование Ловкости (защищающийся)
 *   8. Переброс защищающегося за способности и эфир
 *   9. Переброс атакующего за способности и эффекты
 *  10. Сравнение значений кубиков
 *  11. Нанесение урона
 *
 * Шаги 4, 5, 8, 9 в базовых правилах не имеют фиксированного эффекта: это
 * точки, где игроки применяют свойства карт, способности и тратят Кристаллы
 * Эфира. В прототипе они моделируются перебросом заданного числа кубиков
 * (`rerolls` в параметрах) — так движок остаётся честным по отношению к
 * последовательности шагов, а конкретные способности подключаются сверху.
 */

import type {
  ActionTile,
  DamageType,
  DefensePool,
  DieFace,
  DieResult,
  DicePool,
  MiniSize,
  StateMarker,
} from '../types/game';
import {
  buildAttackPool,
  countAnySuccess,
  countCriticals,
  describeDice,
  rerollDie,
  rollDefensePool,
  rollPool,
} from './dice';

export type AttackContext = {
  action: ActionTile;
  /** Вид атаки: ближний бой или дистанционная. */
  kind: 'melee' | 'ranged';
  /** Свободная Атака: Критические Успехи Защиты урона атакующему не наносят. */
  freeAttack?: boolean;
  /** Уклонение: Бросок Защиты совершается только Кубиками Ловкости. */
  evasion?: boolean;
  /** Зона Плохой Видимости: дистанционная атака перебрасывает успехи. */
  poorVisibility?: boolean;
  /** Атакующий в Зоне Плохой Видимости (тоже перебрасывает успехи). */
  attackerInPoorVisibility?: boolean;
  /** Бонусы атакующего: Концентрация, Голод, рядом Кристаллы Эфирита. */
  attackerBonuses?: {
    concentration?: number;
    hunger?: boolean;
    nearEtherCrystals?: boolean;
  };
  /** Бонус Кубиков Защиты: Реакция «Защита», Преимущество Больших миниатюр. */
  defenseBonus?: number;
  /** Перебросы по шагам 4/5/8/9 (способности, эффекты, Кристаллы Эфира). */
  rerolls?: {
    attackerStep4?: number;
    defenderStep5?: number;
    defenderStep8?: number;
    attackerStep9?: number;
  };
  /** Защищающаяся миниатюра: её параметры нужны для Критического Успеха Защиты. */
  defender?: {
    name: string;
    size: MiniSize;
    defensePool: DefensePool;
    /** Действие ближнего боя защищающегося — им наносится ответный урон. */
    meleeAction?: ActionTile;
    /** Максимальное количество Жизней — для правила «Сокрушительный Урон». */
    maxHp?: number;
  };
};

export type CombatStepLog = {
  step: number;
  title: string;
  detail: string;
};

export type AttackResult = {
  steps: CombatStepLog[];
  attackDice: DieResult[];
  defenseDice: DieResult[];
  /** Кубики Атаки, оставшиеся после отмены Защитой. */
  remainingAttack: DieResult[];
  /** Количество Мастерских Кубиков Атаки (удвоенный урон). */
  masteredDice: number;
  /** Урон, который получает защищающийся. */
  damageToDefender: number;
  /** Урон, который получает атакующий (Критические Успехи Защиты). */
  damageToAttacker: number;
  damageType: DamageType;
  /** Маркер Состояния от «Урона с эффектом» (только от критического урона). */
  stateMarker: StateMarker | null;
  /** Полученные Маркеры Веры за Критические Успехи бросков. */
  faithMarkers: number;
  /** true, если защищающийся обязан был уклоняться (Сокрушительный Урон). */
  mustEvade: boolean;
  summary: string;
};

/**
 * Шаг 3/7: использование Кубиков Ловкости.
 *
 * Каждый успешный Кубик Ловкости позволяет перебросить один «прочий» кубик:
 * на шаге 3 — Атаки или Мастерства, на шаге 7 — Защиты. Неудачные кубики
 * (Ничего) перебрасываются в первую очередь: это строго выгоднее.
 */
const applyAgility = (
  dice: DieResult[],
  targetTypes: Array<DieResult['type']>,
  onReroll?: (die: DieResult, next: DieResult) => void,
): DieResult[] => {
  const result = [...dice];
  const agilitySuccesses = result.filter(
    die => die.type === 'agility' && die.face === 'success',
  ).length;

  if (agilitySuccesses === 0) return result;

  const rerollable = () =>
    result
      .map((die, index) => ({ die, index }))
      .filter(({ die }) => targetTypes.includes(die.type) && die.face === 'blank')
      .map(({ index }) => index);

  const secondary = () =>
    result
      .map((die, index) => ({ die, index }))
      .filter(({ die }) => targetTypes.includes(die.type) && die.face === 'success')
      .map(({ index }) => index);

  let budget = agilitySuccesses;

  for (const pick of [rerollable, secondary]) {
    for (const index of pick()) {
      if (budget <= 0) break;
      const before = result[index];
      const after = rerollDie(before);
      result[index] = after;
      budget -= 1;
      onReroll?.(before, after);
    }
    if (budget <= 0) break;
  }

  return result;
};

/** Переброс выбранных кубиков (шаги 4/5/8/9 и правило Плохой Видимости). */
const rerollFaces = (
  dice: DieResult[],
  type: DieResult['type'],
  faces: DieFace[],
  count: number,
): DieResult[] => {
  if (count <= 0) return dice;
  const result = [...dice];
  let budget = count;

  for (let i = 0; i < result.length && budget > 0; i++) {
    const die = result[i];
    if (die.type !== type || !faces.includes(die.face)) continue;
    result[i] = rerollDie(die);
    budget -= 1;
  }

  return result;
};

/**
 * Полное разрешение атаки по 11 шагам правил.
 */
export const resolveAttack = (ctx: AttackContext, targetName: string): AttackResult => {
  const steps: CombatStepLog[] = [];
  const action = ctx.action;
  const damageValue = action.damage ?? 0;
  const isMelee = ctx.kind === 'melee';
  const defenderName = ctx.defender?.name ?? targetName;

  // --- Шаг 1: Проверка легальности цели -------------------------------------
  steps.push({
    step: 1,
    title: 'Проверка легальности цели',
    detail: `Цель «${defenderName}» в пределах дистанции ${action.range} и в пределах видимости.`,
  });

  // --- Шаг 2: Бросок Атаки ---------------------------------------------------
  const pool: DicePool = buildAttackPool(action.pool, {
    concentration: ctx.attackerBonuses?.concentration,
    hunger: ctx.attackerBonuses?.hunger,
    nearEtherCrystals: ctx.attackerBonuses?.nearEtherCrystals,
    etherAttack: action.ether,
  });
  let attackDice = rollPool(pool);
  steps.push({
    step: 2,
    title: 'Бросок Атаки',
    detail: `Пул: ${pool.attack}⚔ ${pool.agility}🌀 ${pool.mastery}✴ → ${describeDice(attackDice)}`,
  });

  // --- Шаг 3: Ловкость атакующего -------------------------------------------
  attackDice = applyAgility(attackDice, ['attack', 'mastery']);
  steps.push({
    step: 3,
    title: 'Использование Ловкости (атакующий)',
    detail: `После перебросов: ${describeDice(attackDice)}`,
  });

  // --- Шаги 4–5: перебросы за способности и эфир ----------------------------
  const attackerStep4 = ctx.rerolls?.attackerStep4 ?? 0;
  const defenderStep5 = ctx.rerolls?.defenderStep5 ?? 0;

  if (attackerStep4 > 0) {
    attackDice = rerollFaces(attackDice, 'attack', ['blank'], attackerStep4);
  }
  if (defenderStep5 > 0) {
    // Защищающийся перебрасывает успехи атакующего: это его ресурс.
    attackDice = rerollFaces(attackDice, 'attack', ['success'], defenderStep5);
  }
  steps.push({
    step: 4,
    title: 'Переброс атакующего за способности и эфир',
    detail: attackerStep4 > 0
      ? `Переброшено кубиков: ${attackerStep4} → ${describeDice(attackDice)}`
      : 'Способности и Кристаллы Эфира не использовались.',
  });
  steps.push({
    step: 5,
    title: 'Переброс защищающегося за способности и эффекты',
    detail: defenderStep5 > 0
      ? `Переброшено успехов атаки: ${defenderStep5} → ${describeDice(attackDice)}`
      : 'Эффекты не применялись.',
  });

  // --- Шаг 6: Бросок Защиты -------------------------------------------------
  const shield: DefensePool = ctx.defender?.defensePool ?? { defense: 0, agility: 0 };
  const defenseBonus = ctx.defenseBonus ?? 0;

  // Уклонение: бросаются только Кубики Ловкости из щита (правило «Уклонение»).
  let defenseDice: DieResult[] = ctx.evasion
    ? rollDefensePool({ defense: 0, agility: shield.agility })
    : rollDefensePool({ defense: shield.defense + defenseBonus, agility: shield.agility });

  steps.push({
    step: 6,
    title: 'Бросок Защиты',
    detail: ctx.evasion
      ? `Уклонение: ${shield.agility}🌀 → ${describeDice(defenseDice)}`
      : `Щит: ${shield.defense + defenseBonus}🛡 ${shield.agility}🌀 → ${describeDice(defenseDice)}`,
  });

  // --- Шаг 7: Ловкость защищающегося ---------------------------------------
  defenseDice = applyAgility(defenseDice, ctx.evasion ? [] : ['defense']);
  steps.push({
    step: 7,
    title: 'Использование Ловкости (защищающийся)',
    detail: `После перебросов: ${describeDice(defenseDice)}`,
  });

  // --- Шаги 8–9: перебросы --------------------------------------------------
  const defenderStep8 = ctx.rerolls?.defenderStep8 ?? 0;
  const attackerStep9 = ctx.rerolls?.attackerStep9 ?? 0;

  if (defenderStep8 > 0) {
    defenseDice = rerollFaces(defenseDice, 'defense', ['blank'], defenderStep8);
  }
  if (attackerStep9 > 0) {
    defenseDice = rerollFaces(defenseDice, 'defense', ['success'], attackerStep9);
  }
  steps.push({
    step: 8,
    title: 'Переброс защищающегося за способности и эфир',
    detail: defenderStep8 > 0
      ? `Переброшено кубиков: ${defenderStep8} → ${describeDice(defenseDice)}`
      : 'Способности не использовались.',
  });
  steps.push({
    step: 9,
    title: 'Переброс атакующего за способности и эффекты',
    detail: attackerStep9 > 0
      ? `Переброшено успехов защиты: ${attackerStep9} → ${describeDice(defenseDice)}`
      : 'Эффекты не применялись.',
  });

  // --- Шаг 10: Сравнение значений -------------------------------------------
  const remaining = [...attackDice];
  const defenseCriticals = defenseDice.filter(die => die.face === 'critical');
  const defenseSuccesses = ctx.evasion
    ? defenseDice.filter(die => die.face === 'success')
    : defenseDice.filter(die => die.type === 'defense' && die.face === 'success');

  // Успех Защиты отменяет только обычный Успех Атаки.
  let cancelBudget = defenseSuccesses.length;
  for (let i = 0; i < remaining.length && cancelBudget > 0; i++) {
    const die = remaining[i];
    if (die.type !== 'attack' || die.face !== 'success') continue;
    remaining.splice(i, 1);
    i -= 1;
    cancelBudget -= 1;
  }

  // Критический Успех Защиты отменяет любой успех Атаки (в том числе критический).
  let counterDamage = 0;
  const defenderMelee = ctx.defender?.meleeAction;
  const canCounter =
    isMelee && !ctx.freeAttack && Boolean(defenderMelee) && (defenderMelee?.damage ?? 0) > 0;

  for (let i = 0; i < defenseCriticals.length; i++) {
    const critIndex = remaining.findIndex(
      die => die.type === 'attack' && die.face === 'critical',
    );

    if (critIndex >= 0) {
      // Сначала гасим критический Успех Атаки — он наносит урон, который нельзя отменить иначе.
      remaining.splice(critIndex, 1);
      continue;
    }

    // Если критических успехов атаки не осталось, Критический Успех Защиты
    // может нанести ответный урон (даже не отменяя кубик) — в ближнем бою.
    if (canCounter) {
      counterDamage += defenderMelee?.damage ?? 0;
      continue;
    }

    const normalIndex = remaining.findIndex(
      die => die.type === 'attack' && die.face === 'success',
    );
    if (normalIndex >= 0) remaining.splice(normalIndex, 1);
  }

  const survivingAttacks = remaining.filter(die => die.type === 'attack' && die.face !== 'blank');
  const masterySuccesses = countAnySuccess(attackDice.filter(die => die.type === 'mastery'));

  // Кубик Мастерства удваивает значение одного Кубика Атаки (не более одного к одному).
  const masteredDice = Math.min(masterySuccesses, survivingAttacks.length);

  steps.push({
    step: 10,
    title: 'Сравнение значений кубиков',
    detail:
      `Отменено Защитой: ${defenseSuccesses.length + (defenseCriticals.length - counterDamage > 0 ? 0 : 0)}; ` +
      `осталось Кубиков Атаки: ${survivingAttacks.length}; ` +
      `Критических Защиты: ${defenseCriticals.length}; ` +
      `Мастерских Кубиков: ${masteredDice}.`,
  });

  // --- Шаг 11: Нанесение урона ---------------------------------------------
  const normalCount = survivingAttacks.length - masteredDice;
  let damageToDefender = normalCount * damageValue + masteredDice * damageValue * 2;

  // Урон с эффектом: срабатывает только от Критического Кубика Атаки.
  const criticalSurvived = survivingAttacks.some(die => die.face === 'critical');
  const stateMarker =
    criticalSurvived && action.effectOnCritical ? action.effectOnCritical : null;

  const faithMarkers =
    countCriticals(attackDice) + countCriticals(defenseDice);

  const mustEvade =
    action.damage !== undefined &&
    ctx.defender?.maxHp !== undefined &&
    action.damage >= ctx.defender.maxHp;

  steps.push({
    step: 11,
    title: 'Нанесение урона',
    detail:
      `Защищающийся «${defenderName}» получает ${damageToDefender} урона` +
      (counterDamage > 0 ? `; атакующий получает ${counterDamage} урона от Критического Успеха Защиты` : '') +
      (stateMarker ? `; цель получает Маркер «${stateMarker}»` : '') +
      '.',
  });

  const summary =
    `${action.name}: ${damageToDefender} урона по «${defenderName}»` +
    (counterDamage > 0 ? `, ответный урон ${counterDamage}` : '') +
    (faithMarkers > 0 ? `, +${faithMarkers} Маркер(ов) Веры` : '');

  return {
    steps,
    attackDice,
    defenseDice,
    remainingAttack: survivingAttacks,
    masteredDice,
    damageToDefender,
    damageToAttacker: counterDamage,
    damageType: action.damageType ?? 'physical',
    stateMarker,
    faithMarkers,
    mustEvade,
    summary,
  };
};

/**
 * Правило «Атака в Группу Миниатюр»: все неуспешные Кубики Атаки бросаются
 * вновь по ближайшей к атакующему миниатюре, смежной с изначальной целью.
 * Возвращает дополнительный пул — его разрешают отдельной атакой.
 */
export const groupAttackDice = (result: AttackResult): DieResult[] =>
  result.attackDice.filter(die => die.type === 'attack' && die.face === 'blank');

/**
 * Тест на Панику: бросок Кубика Защиты; Успех или Критический Успех — успех.
 * Возвращает true, если миниатюра получает Маркер «Паника».
 */
export const panicTestFailed = (diceCount = 1): boolean => {
  const dice = rollPool({ attack: 0, agility: 0, mastery: 0, defense: diceCount });
  return countAnySuccess(dice) === 0;
};

/**
 * Проверка Уклонения (Глубокая Вода, Выталкивание): бросок Кубиков Ловкости.
 * Возвращает true при наличии хотя бы одного Успеха.
 */
export const evasionCheckPassed = (agilityDice = 1): boolean => {
  const dice = rollPool({ attack: 0, agility: agilityDice, mastery: 0 });
  return countAnySuccess(dice) > 0;
};
