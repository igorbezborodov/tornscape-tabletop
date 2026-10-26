/**
 * Сценарии и Победные Очки.
 *
 * Глава «Сценарии» задаёт 16 сценариев. Общие правила для всех:
 *  - максимум 10 Победных Очков (VP) у игрока;
 *  - Победные Очки не могут быть ниже 0;
 *  - «больше потерь» считается по сумме очков уничтоженных миниатюр;
 *  - при равенстве по спорному условию оба игрока получают указанные очки
 *    (в правилах — «оба игрока получают по 1»).
 *
 * Каждое условие начисления задаётся в `SCENARIOS[id].vp(own, opp)` — так
 * сценарии описываются декларативно и одинаково считаются в интерфейсе.
 */

import type { PlayerId } from '../types/game';

export const MAX_VP = 10;

/**
 * Статистика игрока к концу партии. Все поля считаются по полю и журналу:
 * сценарии используют только те, что им нужны.
 */
export type PlayerScenarioStats = {
  /** Сумма очков уничтоженных миниатюр противника (для «больше потерь»). */
  lossesPoints: number;
  /** Сколько Победных Очков принесла потеря миниатюр противнику. */
  leaderAlive: boolean;
  /** Маркеры Веры + Эфирные Маркеры, накопленные за партию. */
  faithEtherMarkers: number;
  /** Кристаллы Эфира, собранные за партию. */
  crystals: number;
  /** Маркеры Сценария под контролем игрока. */
  controlledMarkers: number;
  /** Пленники, взятые под контроль. */
  capturedPrisoners: number;
  /** Пленники, потерянные игроком. */
  prisonersLost: number;
  /** Союзные пленники, дожившие до конца партии. */
  alliedPrisonersAlive: number;
  /** Пленники в своей зоне развёртывания (сценарий «Исход»). */
  prisonersInDeployment: number;
  /** Разыгранные карты Богов. */
  godCardsPlayed: number;
  /** Захваченные Эфирные Вихри. */
  whirlwindsCaptured: number;
  /** Уничтоженные (снятые) Эфирные Вихри. */
  whirlwindsRemoved: number;
  /** Захваченные Эфирные Узлы (сценарий «Источник»). */
  etherNodesCaptured: number;
  /** Собранные артефакты (сценарий «Камни Древних»). */
  artifacts: number;
  /** Пленники в зоне развёртывания противника (сценарий «Спасение»). */
  prisonersInEnemyZone: number;
  /** 3 — артефакт в зоне развёртывания противника, 2 — в 1 Гексоне, 1 — в 2 Гексонах, 0 — дальше. */
  artifactPlacement: 0 | 1 | 2 | 3;
  /** Уничтоженные миниатюры, приносящие очки по «Кровь и Пламя». */
  lieutenantKills: number;
  sergeantKills: number;
  /** Уничтоженные Эфирные Нежити (сценарий «В Объятия Смерти»). */
  etherUndeadKills: number;
  /** Уничтоженные Цели Охоты (сценарий «Дикая Охота»). */
  targetKills: number;
  /** Уничтоженные маркеры противника (сценарий «Саботаж»). */
  enemyMarkersDestroyed: number;
  /** Точки контроля в конце ходов 2, 4, 6 (сценарий «Доминация»). */
  dominationPoints: number;
  /** Остались ли войска у игрока хоть чем-то на поле. */
  hasSurvivors: boolean;
};

export const emptyStats = (): PlayerScenarioStats => ({
  lossesPoints: 0,
  leaderAlive: true,
  faithEtherMarkers: 0,
  crystals: 0,
  controlledMarkers: 0,
  capturedPrisoners: 0,
  prisonersLost: 0,
  alliedPrisonersAlive: 0,
  prisonersInDeployment: 0,
  godCardsPlayed: 0,
  whirlwindsCaptured: 0,
  whirlwindsRemoved: 0,
  etherNodesCaptured: 0,
  artifacts: 0,
  prisonersInEnemyZone: 0,
  artifactPlacement: 0,
  lieutenantKills: 0,
  sergeantKills: 0,
  etherUndeadKills: 0,
  targetKills: 0,
  enemyMarkersDestroyed: 0,
  dominationPoints: 0,
  hasSurvivors: true,
});

export type ScenarioId =
  | 'meetingEngagement'
  | 'lostRelic'
  | 'rescue'
  | 'bloodAndFlame'
  | 'cursedArtifact'
  | 'otraaksHarvest'
  | 'wildHunt'
  | 'ancientStones'
  | 'exodus'
  | 'godsHearUs'
  | 'embraceOfDeath'
  | 'source'
  | 'domination'
  | 'sabotage'
  | 'whirlwindHunter'
  | 'etherealMaelstrom';

export type Scenario = {
  id: ScenarioId;
  number: number;
  name: string;
  /** Краткое описание задачи сценария. */
  summary: string;
  /** Условия начисления Победных Очков для читаемого списка в интерфейсе. */
  conditions: string[];
  /** Чистая функция подсчёта Победных Очков. */
  vp: (own: PlayerScenarioStats, opp: PlayerScenarioStats) => number;
};

/** Кристаллы: +1 VP за каждые N собранных (с ограничением максимума). */
const crystalsVp = (crystals: number, per: number, max: number): number =>
  Math.min(max, Math.floor(crystals / per));

/** «Больше потерь»: +N VP тому, у кого сумма потерь противника выше. */
const moreLossesVp = (own: PlayerScenarioStats, opp: PlayerScenarioStats, value: number): number => {
  if (own.lossesPoints === opp.lossesPoints) return 0;
  return own.lossesPoints > opp.lossesPoints ? value : 0;
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  meetingEngagement: {
    id: 'meetingEngagement',
    number: 1,
    name: 'Встречный Бой',
    summary: 'Классическое столкновение: победитель тот, кто нанёс больше потерь и сохранил Лидера.',
    conditions: [
      '+3 за большее количество потерь в очках',
      '+2 за уничтожение Лидера противника',
      '+2 если ваш Лидер выжил',
      '+1 за каждые 3 Кристалла Эфира (максимум 3)',
    ],
    vp: (own, opp) =>
      moreLossesVp(own, opp, 3) +
      (!opp.leaderAlive ? 2 : 0) +
      (own.leaderAlive ? 2 : 0) +
      crystalsVp(own.crystals, 3, 3),
  },

  lostRelic: {
    id: 'lostRelic',
    number: 2,
    name: 'Утерянная Реликвия',
    summary: 'Реликвия в центре поля: контроль над ней приносит основные очки.',
    conditions: [
      '+4 если Реликвия под вашим контролем',
      '+2 за большее количество Кристаллов Эфира (при равенстве — по 1 обоим)',
      '+1 если Лидер противника уничтожен',
      '+1 за каждые 3 Кристалла Эфира (максимум 3)',
    ],
    vp: (own, opp) => {
      const relic = own.controlledMarkers > 0 ? 4 : 0;
      const crystalRace =
        own.crystals === opp.crystals ? 1 : own.crystals > opp.crystals ? 2 : 0;
      return relic + crystalRace + (!opp.leaderAlive ? 1 : 0) + crystalsVp(own.crystals, 3, 3);
    },
  },

  rescue: {
    id: 'rescue',
    number: 3,
    name: 'Спасение',
    summary: 'Пленники: их контроль и доставка в свою зону развёртывания.',
    conditions: [
      '+2 за каждого пленника под вашим контролем',
      '+2 за большее число пленников',
      '+1 за каждые 3 Кристалла Эфира (максимум 3)',
    ],
    vp: (own, opp) => {
      const captured = own.capturedPrisoners * 2;
      const race =
        own.capturedPrisoners === opp.capturedPrisoners
          ? 0
          : own.capturedPrisoners > opp.capturedPrisoners
            ? 2
            : 0;
      return captured + race + crystalsVp(own.crystals, 3, 3);
    },
  },

  bloodAndFlame: {
    id: 'bloodAndFlame',
    number: 4,
    name: 'Кровь и Пламя',
    summary: 'Охота на командование: Лидер, Лейтенант и Сержант противника.',
    conditions: [
      '+1 за большее количество потерь',
      '+3 за уничтожение Лидера противника',
      '+2 за уничтожение Лейтенанта противника',
      '+1 за уничтожение Сержанта противника',
      '+1 за каждые 3 Кристалла Эфира (максимум 3)',
    ],
    vp: (own, opp) =>
      moreLossesVp(own, opp, 1) +
      (!opp.leaderAlive ? 3 : 0) +
      own.lieutenantKills * 2 +
      own.sergeantKills * 1 +
      crystalsVp(own.crystals, 3, 3),
  },

  cursedArtifact: {
    id: 'cursedArtifact',
    number: 5,
    name: 'Проклятый Артефакт',
    summary: 'Донести артефакт в зону развёртывания противника.',
    conditions: [
      '+4 если маркер находится в зоне развёртывания противника',
      '+3 если маркер в пределах 1 Гексона от неё',
      '+2 если маркер в пределах 2 Гексонов',
      '+2 если ваш Лидер выжил',
      '+1 за каждые 2 Кристалла Эфира (максимум 4)',
    ],
    vp: (own, opp) => {
      void opp;
      // 3 — в зоне развёртывания противника, 2 — в 1 Гексоне, 1 — в 2 Гексонах.
      const placement = [0, 2, 3, 4][own.artifactPlacement] ?? 0;
      return placement + (own.leaderAlive ? 2 : 0) + crystalsVp(own.crystals, 2, 4);
    },
  },

  otraaksHarvest: {
    id: 'otraaksHarvest',
    number: 6,
    name: 'Жатва Отраакса',
    summary: 'Пленение и жертвоприношение: очки за каждого потерянного противником пленника.',
    conditions: [
      '+2 за каждого пленника, потерянного противником',
      '+2 за большее число потерянных противником пленников',
      '+1 за каждого выжившего союзного пленника',
      '+2 если у противника не осталось миниатюр',
    ],
    vp: (own, opp) => {
      const lost = opp.prisonersLost * 2;
      const race = opp.prisonersLost > own.prisonersLost ? 2 : 0;
      const allied = own.alliedPrisonersAlive * 1;
      const wipe = opp.hasSurvivors ? 0 : 2;
      return lost + race + allied + wipe;
    },
  },

  wildHunt: {
    id: 'wildHunt',
    number: 7,
    name: 'Дикая Охота',
    summary: 'Уничтожить Цель Охоты противника и сохранить свою.',
    conditions: [
      '+3 если Цель Охоты противника уничтожена',
      '+2 если ваша Цель Охоты выжила',
      '+2 за большее количество потерь',
      '+1 за каждые 3 Кристалла Эфира (максимум 3)',
    ],
    vp: (own, opp) =>
      own.targetKills * 3 +
      (opp.targetKills === 0 ? 2 : 0) +
      moreLossesVp(own, opp, 2) +
      crystalsVp(own.crystals, 3, 3),
  },

  ancientStones: {
    id: 'ancientStones',
    number: 8,
    name: 'Камни Древних',
    summary: 'Собрать четыре артефакта — главная задача сценария.',
    conditions: [
      '+8 если собраны четыре артефакта',
      '+6 если собраны три',
      '+4 если собраны два',
      '+2 если собран один',
      '+1 за большее количество потерь',
      '+1 за каждые 3 Кристалла Эфира (максимум 4)',
    ],
    vp: (own, opp) => {
      const table = [0, 2, 4, 6, 8];
      const artifacts = table[Math.min(4, own.artifacts)] ?? 0;
      return artifacts + moreLossesVp(own, opp, 1) + crystalsVp(own.crystals, 3, 4);
    },
  },

  exodus: {
    id: 'exodus',
    number: 9,
    name: 'Исход',
    summary: 'Вывести пленников в свою зону развёртывания.',
    conditions: [
      '+3 за каждого пленника в вашей зоне развёртывания',
      '+2 если Лидер противника уничтожен',
      '+1 за каждые 3 Кристалла Эфира (максимум 3)',
    ],
    vp: (own, opp) =>
      own.prisonersInDeployment * 3 + (!opp.leaderAlive ? 2 : 0) + crystalsVp(own.crystals, 3, 3),
  },

  godsHearUs: {
    id: 'godsHearUs',
    number: 10,
    name: 'Боги слышат нас!',
    summary: 'Накопление Маркеров Веры и Эфира, снятие вихрей и потери.',
    conditions: [
      '+3 за большее число Маркеров Веры и Эфирных Маркеров',
      '+1 за каждый снятый Эфирный Вихрь (максимум 3)',
      '+1 за большее число снятых Вихрей',
      '+3 за большее количество потерь',
    ],
    vp: (own, opp) => {
      const markers =
        own.faithEtherMarkers === opp.faithEtherMarkers
          ? 0
          : own.faithEtherMarkers > opp.faithEtherMarkers
            ? 3
            : 0;
      const removed = Math.min(3, own.whirlwindsRemoved);
      const race = own.whirlwindsRemoved > opp.whirlwindsRemoved ? 1 : 0;
      return markers + removed + race + moreLossesVp(own, opp, 3);
    },
  },

  embraceOfDeath: {
    id: 'embraceOfDeath',
    number: 11,
    name: 'В Объятия Смерти',
    summary: 'Уничтожение Эфирной Нежити и охота на Лидера.',
    conditions: [
      '+3 за большее количество потерь',
      '+2 за уничтожение Эфирной Нежити (при равенстве — по 1)',
      '+2 если Лидер противника уничтожен',
      '+1 за каждые 2 Кристалла Эфира (максимум 3)',
    ],
    vp: (own, opp) => {
      const undead =
        own.etherUndeadKills === opp.etherUndeadKills
          ? 1
          : own.etherUndeadKills > opp.etherUndeadKills
            ? 2
            : 0;
      return moreLossesVp(own, opp, 3) + undead + (!opp.leaderAlive ? 2 : 0) + crystalsVp(own.crystals, 2, 3);
    },
  },

  source: {
    id: 'source',
    number: 12,
    name: 'Источник',
    summary: 'Захват Эфирных Узлов и удержание преимущества по потерям.',
    conditions: [
      '+1 за каждый захваченный Эфирный Узел',
      '+2 за большее число захваченных Узлов',
      '+3 за большее количество потерь',
      '+1 за каждые 2 Кристалла Эфира (максимум 3)',
    ],
    vp: (own, opp) => {
      const nodes = own.etherNodesCaptured;
      const race = own.etherNodesCaptured > opp.etherNodesCaptured ? 2 : 0;
      return nodes + race + moreLossesVp(own, opp, 3) + crystalsVp(own.crystals, 2, 3);
    },
  },

  domination: {
    id: 'domination',
    number: 13,
    name: 'Доминация',
    summary: 'Контроль маркеров: очки начисляются в конце ходов 2, 4 и 6.',
    conditions: [
      '+1 за каждый союзный маркер в конце ходов 2, 4 и 6',
      '+1 за большее число Маркеров Веры и Эфирных Маркеров',
    ],
    vp: (own, opp) =>
      own.dominationPoints +
      (own.faithEtherMarkers > opp.faithEtherMarkers ? 1 : 0),
  },

  sabotage: {
    id: 'sabotage',
    number: 14,
    name: 'Саботаж',
    summary: 'Уничтожение маркеров противника и розыгрыш карт Богов.',
    conditions: [
      '+3 за каждый уничтоженный маркер противника',
      '+1 за большее число разыгранных карт Богов',
      '+1 за каждые 3 Кристалла Эфира (максимум 3)',
    ],
    vp: (own, opp) =>
      own.enemyMarkersDestroyed * 3 +
      (own.godCardsPlayed > opp.godCardsPlayed ? 1 : 0) +
      crystalsVp(own.crystals, 3, 3),
  },

  whirlwindHunter: {
    id: 'whirlwindHunter',
    number: 15,
    name: 'Ловец Вихрей',
    summary: 'Захват Эфирных Вихрей — основной источник очков.',
    conditions: [
      '+2 за каждый захваченный Вихрь без Кристаллов Эфира',
      '+2 если противник не захватил ни одного Вихря',
      '+1 за большее количество Кристаллов Эфира',
      '+1 за большее количество потерь',
    ],
    vp: (own, opp) =>
      own.whirlwindsCaptured * 2 +
      (opp.whirlwindsCaptured === 0 ? 2 : 0) +
      (own.crystals > opp.crystals ? 1 : 0) +
      moreLossesVp(own, opp, 1),
  },

  etherealMaelstrom: {
    id: 'etherealMaelstrom',
    number: 16,
    name: 'Эфирный Смерч',
    summary: 'Уничтожение Смерча, сбор Кристаллов и охота на Лидера.',
    conditions: [
      '+3 за снятый Эфирный Смерч',
      '+2 за большее количество Кристаллов Эфира',
      '+3 если Лидер противника уничтожен',
      '+2 за большее количество потерь',
    ],
    vp: (own, opp) =>
      own.whirlwindsRemoved * 3 +
      (own.crystals > opp.crystals ? 2 : 0) +
      (!opp.leaderAlive ? 3 : 0) +
      moreLossesVp(own, opp, 2),
  },
};

export const SCENARIO_LIST: Scenario[] = Object.values(SCENARIOS).sort(
  (a, b) => a.number - b.number,
);

export const scenarioById = (id: ScenarioId): Scenario => SCENARIOS[id];

/** Ограничение Победных Очков: от 0 до 10. */
export const clampVp = (value: number): number => Math.max(0, Math.min(MAX_VP, Math.round(value)));

export type MatchScore = {
  scenario: ScenarioId;
  player1: number;
  player2: number;
  winner: PlayerId | 'draw';
};

/** Итоговый счёт партии по сценарию. */
export const scoreMatch = (
  scenario: ScenarioId,
  stats: Record<PlayerId, PlayerScenarioStats>,
): MatchScore => {
  const definition = SCENARIOS[scenario];
  const player1 = clampVp(definition.vp(stats.player1, stats.player2));
  const player2 = clampVp(definition.vp(stats.player2, stats.player1));

  return {
    scenario,
    player1,
    player2,
    winner: player1 === player2 ? 'draw' : player1 > player2 ? 'player1' : 'player2',
  };
};

/** Порог «Сокрушительного Урона»: урон не меньше максимального числа Жизней. */
export const isCrushingDamage = (damage: number, targetMaxHp: number): boolean =>
  damage >= targetMaxHp;

/**
 * Стоимость потерь для сценариев: сумма очков уничтоженных миниатюр.
 * Принимает минимальный набор данных, чтобы не зависеть от стора.
 */
export const lossesPoints = (deadUnits: Array<{ points: number }>): number =>
  deadUnits.reduce((total, unit) => total + unit.points, 0);
