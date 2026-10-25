// src/lib/rosterRules.ts
// Правила набора армии, повторяющие логику https://armybuilder.torn-world.com:
// формат (200/300/400 очков) → домен → фракция → лидер → юниты, заклинания
// и снаряжение с лимитами количества.
//
// Модуль намеренно не зависит ни от DOM, ни от Prisma: его импортируют и
// React-компоненты, и Express-сервер, поэтому проверки совпадают.

import { SPELLS_PER_ROSTER } from './rosterLimits';
import type { RosterUnitInput } from '../types/game';

// Константа живёт в отдельном модуле без импортов: её подключает сервер,
// собираемый с moduleResolution=NodeNext.
export { SPELLS_PER_ROSTER };

/** Юнит, который идёт «в комплекте» с выбранным юнитом (например, псарь → боевые псы). */
export type UnitRequirement = {
  slug: string;
  name: string;
  limit: number;
  points: number | null;
  /** Порядок у armybuilder (по возрастанию). */
  weight: number;
};

export type RosterUnitOption = {
  optionId: string;
  unitId: string;
  slug: string;
  name: string;
  /** Стоимость одной модели в очках. */
  points: number;
  /** Максимум моделей у выбранного лидера. */
  limit: number;
  /** Порядок в списке выбора: armybuilder сортирует по weight по возрастанию. */
  weight: number;
  /** Взаимоисключающие варианты одного персонажа (taorgas, aldvin, …). */
  uniqKey: string | null;
  imageUrl: string | null;
  cardImageUrl: string | null;
  /** Обратная сторона двусторонней карты (лицо с текстом умений). */
  cardBackImageUrl: string | null;
  specialRules: string | null;
  requires: UnitRequirement[];
};

export type RosterSpellOption = {
  optionId: string;
  spellId: string;
  slug: string;
  name: string;
  limit: number;
  /** Порядок в списке заклинаний (по возрастанию). */
  weight: number;
  domainSlug: string | null;
  imageUrl: string | null;
};

export type RosterEquipmentOption = {
  optionId: string;
  equipmentId: string;
  slug: string;
  name: string;
  points: number;
  limit: number;
  /** Порядок в списке снаряжения (по возрастанию). */
  weight: number;
  imageUrl: string | null;
};

/**
 * Привязанный юнит: доступен только после того, как в ростер добавлен
 * родитель (например, «Гомункул Помощник» открывается Некро-Алхимиком).
 * Стоимость у спутника своя, поэтому он расходует очки как обычный юнит.
 */
export type RosterCompanionOption = {
  slug: string;
  name: string;
  /** Стоимость одной модели в очках. */
  points: number;
  /** Родительский юнит, который открывает спутника. */
  parentSlug: string;
  parentName: string;
  /** weight родителя — спутник всегда выводится сразу под ним. */
  parentWeight: number;
  /** Максимум спутников на одного родителя. */
  limit: number;
  /** Собственный weight спутника (порядок среди «детей» родителя). */
  weight: number;
  imageUrl: string | null;
  cardImageUrl: string | null;
  cardBackImageUrl: string | null;
};

export type SelectedCompanion = RosterCompanionOption & { quantity: number };

export type SelectedUnit = RosterUnitOption & { quantity: number };
export type SelectedSpell = RosterSpellOption & { quantity: number };

/**
 * Персонаж ростера, на которого можно надеть снаряжение. armybuilder не
 * хранит носителя (в `structure.equipment` есть только id, количество и
 * стоимость), поэтому назначение живёт в клиентском состоянии ростера.
 */
export type EquipmentBearer = {
  slug: string;
  name: string;
  /** Лидер, обычный юнит или спутник — влияет только на подпись. */
  kind: 'hero' | 'unit' | 'companion';
};

export type SelectedEquipment = RosterEquipmentOption & {
  quantity: number;
  /** Кому розданы экземпляры: не больше `quantity` персонажей. */
  bearers: EquipmentBearer[];
};

export type RosterSelection = {
  domainSlug: string | null;
  domainName: string | null;
  factionSlug: string | null;
  factionName: string | null;
  heroSlug: string | null;
  heroName: string | null;
  heroPoints: number;
  formatPoints: number;
  units: SelectedUnit[];
  /** Спутники, открытые выбранными юнитами (в очки не входят). */
  companions: SelectedCompanion[];
  spells: SelectedSpell[];
  equipment: SelectedEquipment[];
};

export type CanAddVerdict = { allowed: boolean; reason: string | null };

export const createEmptySelection = (formatPoints: number): RosterSelection => ({
  domainSlug: null,
  domainName: null,
  factionSlug: null,
  factionName: null,
  heroSlug: null,
  heroName: null,
  heroPoints: 0,
  formatPoints,
  units: [],
  companions: [],
  spells: [],
  equipment: [],
});

const sumUnits = (units: SelectedUnit[]): number =>
  units.reduce((total, unit) => total + unit.points * unit.quantity, 0);

const sumCompanions = (companions: SelectedCompanion[]): number =>
  companions.reduce((total, companion) => total + companion.points * companion.quantity, 0);

const sumEquipment = (equipment: SelectedEquipment[]): number =>
  equipment.reduce((total, item) => total + item.points * item.quantity, 0);

/** Стоимость ростера: лидер + юниты со спутниками + снаряжение (заклинания бесплатны). */
export const selectionPoints = (selection: RosterSelection): number =>
  selection.heroPoints +
  sumUnits(selection.units) +
  sumCompanions(selection.companions) +
  sumEquipment(selection.equipment);

/** Моделей в ростере: обычные юниты плюс спутники (они тоже выходят на поле). */
export const selectionUnitCount = (selection: RosterSelection): number =>
  selection.units.reduce((total, unit) => total + unit.quantity, 0) +
  selection.companions.reduce((total, companion) => total + companion.quantity, 0);

/** Сумма количеств всех заклинаний ростера — сравнивается с SPELLS_PER_ROSTER. */
export const selectionSpellCount = (selection: RosterSelection): number =>
  selection.spells.reduce((total, spell) => total + spell.quantity, 0);

/** Сколько ещё заклинаний можно добрать до обязательных десяти. */
export const spellSlotsLeft = (selection: RosterSelection): number =>
  Math.max(0, SPELLS_PER_ROSTER - selectionSpellCount(selection));

export const quantityOf = (selection: RosterSelection, slug: string): number =>
  selection.units.find((unit) => unit.slug === slug)?.quantity ?? 0;

export const spellQuantityOf = (selection: RosterSelection, slug: string): number =>
  selection.spells.find((spell) => spell.slug === slug)?.quantity ?? 0;

export const equipmentQuantityOf = (selection: RosterSelection, slug: string): number =>
  selection.equipment.find((item) => item.slug === slug)?.quantity ?? 0;

export const equipmentBearersOf = (
  selection: RosterSelection,
  slug: string,
): EquipmentBearer[] => selection.equipment.find((item) => item.slug === slug)?.bearers ?? [];

const bearerKeyOf = (kind: EquipmentBearer['kind'], slug: string): string => `${kind}:${slug}`;

/**
 * Персонажи ростера, которым можно выдать снаряжение: лидер, выбранные
 * юниты и спутники. armybuilder не публикует ограничений «кому что можно
 * надеть», поэтому подходящими считаются все выбранные персонажи.
 */
export const rosterBearers = (selection: RosterSelection): EquipmentBearer[] => {
  const bearers: EquipmentBearer[] = [];

  if (selection.heroSlug) {
    bearers.push({
      slug: bearerKeyOf('hero', selection.heroSlug),
      name: selection.heroName ?? 'Лидер',
      kind: 'hero',
    });
  }

  for (const unit of selection.units) {
    if (unit.quantity < 1) continue;
    bearers.push({ slug: bearerKeyOf('unit', unit.slug), name: unit.name, kind: 'unit' });
  }

  for (const companion of selection.companions) {
    if (companion.quantity < 1) continue;
    bearers.push({
      slug: bearerKeyOf('companion', companion.slug),
      name: `${companion.name} (к «${companion.parentName}»)`,
      kind: 'companion',
    });
  }

  return bearers;
};

/**
 * Убирает носителей, которых больше нет в ростере (удалили юнита или
 * спутника), и лишние назначения сверх текущего количества экземпляров.
 */
const pruneBearers = (selection: RosterSelection): RosterSelection => {
  if (selection.equipment.length === 0) return selection;

  const validKeys = new Set(rosterBearers(selection).map((bearer) => bearer.slug));

  return {
    ...selection,
    equipment: selection.equipment.map((item) => {
      const bearers = item.bearers
        .filter((bearer) => validKeys.has(bearer.slug))
        .slice(0, item.quantity);

      return bearers.length === item.bearers.length ? item : { ...item, bearers };
    }),
  };
};

/**
 * Взаимоисключающие юниты: нельзя взять два варианта с одинаковым `uniqKey`
 * (например, «Клинки Таоргаса» и «Молот Таоргаса»).
 */
export const uniqConflictFor = (
  selection: RosterSelection,
  unit: RosterUnitOption,
): string | null => {
  if (!unit.uniqKey) return null;

  const conflict = selection.units.find(
    (selected) =>
      selected.quantity > 0 && selected.uniqKey === unit.uniqKey && selected.slug !== unit.slug,
  );

  return conflict ? conflict.name : null;
};

/** Можно ли добавить ещё одну модель юнита (лимит, уникальность, бюджет очков). */
export const canAddUnit = (
  selection: RosterSelection,
  unit: RosterUnitOption,
): CanAddVerdict => {
  const conflict = uniqConflictFor(selection, unit);
  if (conflict) {
    return { allowed: false, reason: `Несовместимо с «${conflict}»: вариант уже выбран.` };
  }

  if (quantityOf(selection, unit.slug) >= unit.limit) {
    return { allowed: false, reason: `Достигнут лимит: ${unit.limit} шт.` };
  }

  if (selectionPoints(selection) + unit.points > selection.formatPoints) {
    return { allowed: false, reason: `Не хватает очков (лимит ${selection.formatPoints}).` };
  }

  return { allowed: true, reason: null };
};

export const addUnit = (selection: RosterSelection, unit: RosterUnitOption): RosterSelection => {
  if (!canAddUnit(selection, unit).allowed) return selection;

  const existing = selection.units.find((selected) => selected.slug === unit.slug);

  if (existing) {
    return {
      ...selection,
      units: selection.units.map((selected) =>
        selected.slug === unit.slug
          ? { ...selected, quantity: selected.quantity + 1 }
          : selected,
      ),
    };
  }

  return { ...selection, units: [...selection.units, { ...unit, quantity: 1 }] };
};

/**
 * Лимит спутников растёт вместе с числом родителей: как на armybuilder,
 * `max_quantity = количество родителей × вложенный лимит` (два Некро-Алхимика
 * открывают до 4 Гомункулов при лимите 2 на родителя).
 */
export const companionLimitFor = (
  selection: RosterSelection,
  companion: RosterCompanionOption,
): number => {
  const parent = selection.units.find((unit) => unit.slug === companion.parentSlug);
  if (!parent) return 0;
  return companion.limit * parent.quantity;
};

/**
 * Убирает спутников, у которых больше нет родителя в ростере, и обрезает
 * количество до нового лимита: при удалении родителя «висящих» спутников
 * остаться не должно.
 */
const pruneCompanions = (
  units: SelectedUnit[],
  companions: SelectedCompanion[],
): SelectedCompanion[] =>
  companions.flatMap((companion) => {
    const parent = units.find((unit) => unit.slug === companion.parentSlug);
    const limit = parent ? companion.limit * parent.quantity : 0;
    if (limit < 1) return [];
    if (companion.quantity > limit) return [{ ...companion, quantity: limit }];
    return [companion];
  });

export const removeUnit = (selection: RosterSelection, slug: string): RosterSelection => {
  const units = selection.units.flatMap((unit) => {
    if (unit.slug !== slug) return [unit];
    if (unit.quantity <= 1) return [];
    return [{ ...unit, quantity: unit.quantity - 1 }];
  });

  return pruneBearers({
    ...selection,
    units,
    companions: pruneCompanions(units, selection.companions),
  });
};

export const removeUnitAll = (selection: RosterSelection, slug: string): RosterSelection => {
  const units = selection.units.filter((unit) => unit.slug !== slug);

  return pruneBearers({
    ...selection,
    units,
    companions: pruneCompanions(units, selection.companions),
  });
};

export const companionQuantityOf = (selection: RosterSelection, slug: string): number =>
  selection.companions.find((companion) => companion.slug === slug)?.quantity ?? 0;

/** Спутник доступен только после добавления родителя. */
export const canAddCompanion = (
  selection: RosterSelection,
  companion: RosterCompanionOption,
): CanAddVerdict => {
  const limit = companionLimitFor(selection, companion);

  if (limit < 1) {
    return {
      allowed: false,
      reason: `Сначала добавьте «${companion.parentName}» в ростер.`,
    };
  }

  if (companionQuantityOf(selection, companion.slug) >= limit) {
    return {
      allowed: false,
      reason: `Достигнут лимит: ${limit} шт. (по ${companion.limit} на каждого «${companion.parentName}»).`,
    };
  }

  // Спутник стоит своих очков — проверяем бюджет так же, как для юнитов.
  if (selectionPoints(selection) + companion.points > selection.formatPoints) {
    return { allowed: false, reason: `Не хватает очков (лимит ${selection.formatPoints}).` };
  }

  return { allowed: true, reason: null };
};

export const addCompanion = (
  selection: RosterSelection,
  companion: RosterCompanionOption,
): RosterSelection => {
  if (!canAddCompanion(selection, companion).allowed) return selection;

  const existing = selection.companions.find((item) => item.slug === companion.slug);

  if (existing) {
    return {
      ...selection,
      companions: selection.companions.map((item) =>
        item.slug === companion.slug ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    };
  }

  return { ...selection, companions: [...selection.companions, { ...companion, quantity: 1 }] };
};

export const removeCompanion = (selection: RosterSelection, slug: string): RosterSelection =>
  pruneBearers({
    ...selection,
    companions: selection.companions.flatMap((companion) => {
      if (companion.slug !== slug) return [companion];
      if (companion.quantity <= 1) return [];
      return [{ ...companion, quantity: companion.quantity - 1 }];
    }),
  });

export const canAddSpell = (
  selection: RosterSelection,
  spell: RosterSpellOption,
): CanAddVerdict => {
  if (spellQuantityOf(selection, spell.slug) >= spell.limit) {
    return { allowed: false, reason: `Достигнут лимит: ${spell.limit} шт.` };
  }

  // Верхняя граница жёсткая: ровно 10 заклинаний, «про запас» брать нельзя.
  if (selectionSpellCount(selection) >= SPELLS_PER_ROSTER) {
    return {
      allowed: false,
      reason: `Набрано ${SPELLS_PER_ROSTER} заклинаний — это общий лимит ростера.`,
    };
  }

  return { allowed: true, reason: null };
};

export const addSpell = (selection: RosterSelection, spell: RosterSpellOption): RosterSelection => {
  if (!canAddSpell(selection, spell).allowed) return selection;

  const existing = selection.spells.find((item) => item.slug === spell.slug);

  if (existing) {
    return {
      ...selection,
      spells: selection.spells.map((item) =>
        item.slug === spell.slug ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    };
  }

  return { ...selection, spells: [...selection.spells, { ...spell, quantity: 1 }] };
};

/** Снятие карты не ограничено общим лимитом: иначе полный набор нельзя пересобрать. */
export const removeSpell = (selection: RosterSelection, slug: string): RosterSelection => ({
  ...selection,
  spells: selection.spells.flatMap((spell) => {
    if (spell.slug !== slug) return [spell];
    if (spell.quantity <= 1) return [];
    return [{ ...spell, quantity: spell.quantity - 1 }];
  }),
});


export const canAddEquipment = (
  selection: RosterSelection,
  item: RosterEquipmentOption,
): CanAddVerdict => {
  if (equipmentQuantityOf(selection, item.slug) >= item.limit) {
    return { allowed: false, reason: `Достигнут лимит: ${item.limit} шт.` };
  }

  if (selectionPoints(selection) + item.points > selection.formatPoints) {
    return { allowed: false, reason: `Не хватает очков (лимит ${selection.formatPoints}).` };
  }

  return { allowed: true, reason: null };
};

export const addEquipment = (
  selection: RosterSelection,
  item: RosterEquipmentOption,
): RosterSelection => {
  if (!canAddEquipment(selection, item).allowed) return selection;

  const existing = selection.equipment.find((selected) => selected.slug === item.slug);
  const freeBearer = rosterBearers(selection).find(
    (bearer) => !existing?.bearers.some((assigned) => assigned.slug === bearer.slug),
  );

  if (existing) {
    return {
      ...selection,
      equipment: selection.equipment.map((selected) =>
        selected.slug === item.slug
          ? {
              ...selected,
              quantity: selected.quantity + 1,
              // Новый экземпляр сразу получает свободного персонажа, если он есть.
              bearers: freeBearer ? [...selected.bearers, freeBearer] : selected.bearers,
            }
          : selected,
      ),
    };
  }

  return {
    ...selection,
    equipment: [
      ...selection.equipment,
      { ...item, quantity: 1, bearers: freeBearer ? [freeBearer] : [] },
    ],
  };
};

export const removeEquipment = (
  selection: RosterSelection,
  slug: string,
): RosterSelection => ({
  ...selection,
  equipment: selection.equipment.flatMap((item) => {
    if (item.slug !== slug) return [item];
    if (item.quantity <= 1) return [];
    return [
      {
        ...item,
        quantity: item.quantity - 1,
        // Снимаем последнего назначенного носителя вместе с экземпляром.
        bearers: item.bearers.slice(0, item.quantity - 1),
      },
    ];
  }),
});

/**
 * Назначает снаряжение конкретному персонажу из ростера. `null` снимает
 * назначение — предмет остаётся в ростере, но остаётся «в запасе».
 */
export const assignEquipmentBearer = (
  selection: RosterSelection,
  slug: string,
  bearerSlug: string | null,
): RosterSelection => {
  if (!selection.equipment.some((item) => item.slug === slug)) return selection;

  const bearer = bearerSlug
    ? rosterBearers(selection).find((item) => item.slug === bearerSlug)
    : null;

  if (bearerSlug && !bearer) return selection;

  return {
    ...selection,
    equipment: selection.equipment.map((item) =>
      item.slug === slug ? { ...item, bearers: bearer ? [bearer] : [] } : item,
    ),
  };
};

/** Полная проверка ростера — используется и в интерфейсе, и на сервере. */
export const selectionProblems = (selection: RosterSelection): string[] => {
  const problems: string[] = [];

  if (!selection.heroSlug) {
    problems.push('Лидер не выбран.');
  }

  if (selection.units.length === 0) {
    problems.push('В ростере нет ни одного юнита.');
  }

  for (const unit of selection.units) {
    if (unit.quantity < 1) {
      problems.push(`«${unit.name}»: количество должно быть не меньше 1.`);
    }

    if (unit.quantity > unit.limit) {
      problems.push(`«${unit.name}»: превышен лимит ${unit.limit} шт.`);
    }
  }

  const uniqGroups = new Map<string, string[]>();

  for (const unit of selection.units) {
    if (!unit.uniqKey || unit.quantity < 1) continue;
    const group = uniqGroups.get(unit.uniqKey) ?? [];
    group.push(unit.name);
    uniqGroups.set(unit.uniqKey, group);
  }

  for (const names of uniqGroups.values()) {
    if (names.length > 1) {
      problems.push(`Взаимоисключающие юниты: ${names.join(', ')}.`);
    }
  }

  for (const companion of selection.companions) {
    const limit = companionLimitFor(selection, companion);

    if (limit < 1) {
      problems.push(`«${companion.name}»: нет родителя «${companion.parentName}» в ростере.`);
    } else if (companion.quantity > limit) {
      problems.push(`«${companion.name}»: лимит ${limit} шт.`);
    }
  }

  for (const spell of selection.spells) {
    if (spell.quantity > spell.limit) {
      problems.push(`Заклинание «${spell.name}»: лимит ${spell.limit} шт.`);
    }
  }

  // Набор заклинаний обязателен и строго фиксирован по размеру.
  const spellCount = selectionSpellCount(selection);

  if (spellCount !== SPELLS_PER_ROSTER) {
    problems.push(
      `Заклинания: ${spellCount} из ${SPELLS_PER_ROSTER} — в ростере должно быть ровно ${SPELLS_PER_ROSTER}.`,
    );
  }

  const bearerKeys = new Set(rosterBearers(selection).map((bearer) => bearer.slug));

  for (const item of selection.equipment) {
    if (item.quantity > item.limit) {
      problems.push(`Снаряжение «${item.name}»: лимит ${item.limit} шт.`);
    }

    if (item.bearers.length > item.quantity) {
      problems.push(
        `Снаряжение «${item.name}»: назначено ${item.bearers.length} носителей при ${item.quantity} экз.`,
      );
    }

    const lost = item.bearers.find((bearer) => !bearerKeys.has(bearer.slug));

    if (lost) {
      problems.push(`Снаряжение «${item.name}»: носитель «${lost.name}» не выбран в ростере.`);
    }
  }

  const points = selectionPoints(selection);

  if (points > selection.formatPoints) {
    problems.push(`Превышен бюджет: ${points} из ${selection.formatPoints} очков.`);
  }

  return problems;
};

/**
 * Боевые параметры карт armybuilder не публикует (они есть только на
 * изображениях), поэтому для прототипа настольной игры характеристики
 * выводятся из стоимости. Значения намеренно скромные: юнит за 100 очков
 * получает 6 HP, 5 атаки и 4 защиты.
 */
export const deriveCombatStats = (points: number) => {
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  return {
    maxHp: clamp(Math.round(points / 15), 1, 6),
    movement: 3,
    attack: clamp(Math.round(points / 25) + 1, 1, 5),
    defense: clamp(Math.round(points / 30) + 1, 1, 4),
  };
};

/** Разворачивает выбор в отдельные модели для игрового поля. */
export const expandUnitsForBattle = (selection: RosterSelection): RosterUnitInput[] => {
  const units = selection.units.flatMap((unit) => {
    const stats = deriveCombatStats(unit.points);

    return Array.from({ length: unit.quantity }, () => ({
      id: unit.unitId,
      name: unit.name,
      factionSlug: selection.factionSlug ?? undefined,
      // Портрет берём из каталога: на поле он заменяет инициалы юнита.
      imageUrl: unit.imageUrl ?? undefined,
      maxHp: stats.maxHp,
      movement: stats.movement,
      attack: stats.attack,
      defense: stats.defense,
    }));
  });

  // Спутники выходят на поле вместе с родителем: они бесплатны, поэтому
  // характеристики считаются по минимальному порогу.
  const companions = selection.companions.flatMap((companion) =>
    Array.from({ length: companion.quantity }, () => ({
      id: `companion:${companion.slug}`,
      name: companion.name,
      factionSlug: selection.factionSlug ?? undefined,
      imageUrl: companion.imageUrl ?? undefined,
      maxHp: 1,
      movement: 3,
      attack: 1,
      defense: 1,
    })),
  );

  return [...units, ...companions];
};
