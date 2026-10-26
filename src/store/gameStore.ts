/**
 * Состояние партии Tornscape.
 *
 * Стор реализует структуру партии и хода из правил:
 *
 *  Партия:  подготовка → инициатива → развёртывание → ходы → подсчёт VP.
 *  Ход:     Фаза I Начало хода → Фаза II Карта Богов → Фаза III Инициатива →
 *           Фаза IV Активация → Фаза V Движение Вихрей → Фаза VI Конец хода.
 *  Активация: 8 шагов (см. `beginActivation`), 2 Маркера Времени (максимум 3),
 *           запрет повторов Действий и не более одной Атаки.
 */

import { create } from 'zustand';
import type {
  ActionTile,
  BattleLog,
  DeploymentZone,
  DeploymentZoneId,
  HexCoord,
  InitiativeRoll,
  PlayerId,
  RosterUnitInput,
  ScenarioMarker,
  SetupStage,
  StateMarker,
  TerrainData,
  TurnPhase,
  Unit,
  Whirlwind,
} from '../types/game';
import {
  generateBattleTerrain,
  generateHexsonGrid,
  hexDistance,
  hexKey,
  hexNeighbors,
  reachableHexes,
} from '../lib/hex';
import { fitsInZone, prepareScenarioField } from '../lib/setup';
import { rollPool, describeDice, countAnySuccess } from '../lib/dice';
import { resolveAttack, type AttackResult } from '../lib/combat';
import {
  ACTIVATION_TIME_MARKERS,
  MAX_TIME_MARKERS,
  addStateMarker,
  effectiveMovement,
  expireStatusesAtEndOfActivation,
  expireStatusesAtStartOfTurn,
  statusDefenseBonus,
  terrainActivationEffect,
  triggerStateMarkers,
} from '../lib/stateMarkers';
import {
  actionById,
  actionsFor,
  checkActionLegality,
  isAttackAction,
  type ActivationUsage,
} from '../lib/actions';
import { bigMiniatureDefenseBonus, canSee } from '../lib/visibility';
import {
  isInWhirlwind,
  moveWhirlwind,
  reactionsBlockedInWhirlwind,
  takeEtherCrystals,
} from '../lib/whirlwinds';
import {
  MAX_VP,
  SCENARIOS,
  clampVp,
  emptyStats,
  lossesPoints,
  scoreMatch,
  type MatchScore,
  type PlayerScenarioStats,
  type ScenarioId,
} from '../lib/scenarios';

const ROWS = 7;
const { hexes: initialHexes, hexsonCenters: initialHexsonCenters } = generateHexsonGrid(ROWS);

/** Максимальное число ходов в партии (правила: 6 ходов, VP на 2/4/6). */
export const MAX_TURNS = 6;

/** Сколько раз перебрасывается инициатива, если все значения кубиков равны. */
const INITIATIVE_REROLL_LIMIT = 12;

const playerLabel = (player: PlayerId): string =>
  player === 'player1' ? 'Игрока 1' : 'Игрока 2';

export const playerTitle = (player: PlayerId): string =>
  player === 'player1' ? 'Игрок 1 (Синие)' : 'Игрок 2 (Красные)';

const otherPlayer = (player: PlayerId): PlayerId =>
  player === 'player1' ? 'player2' : 'player1';

const inBounds = (h: HexCoord) => initialHexes.some(hex => hex.q === h.q && hex.r === h.r);

/**
 * Создаёт Миниатюру из записи ростера.
 *
 * Шаг 3 «Расстановка»: миниатюра создаётся не выставленной (`deployed: false`)
 * и не в Резерве — игрок сам решает, куда её поставить.
 * Позиция по умолчанию — центр поля; она заменяется при выставлении.
 */
const unitFromRoster = (
  template: RosterUnitInput,
  player: PlayerId,
  position: HexCoord,
  index: number,
): Unit => ({
  id: `${player === 'player1' ? 'p1' : 'p2'}-${template.id}-${index}`,
  name: template.name,
  player,
  faction: template.factionSlug ?? 'unknown',
  imageUrl: template.imageUrl ?? null,
  position,
  size: template.size,
  hp: template.maxHp,
  maxHp: template.maxHp,
  movement: template.movement,
  defensePool: template.defensePool,
  attackTiles: template.attackTiles,
  isLeader: template.isLeader ?? false,
  points: template.points,
  domain: template.domain,
  timeMarkers: 0,
  activated: false,
  reactivations: 0,
  stateMarkers: [],
  statuses: [],
  concentration: 0,
  defenseBonus: 0,
  freeAttacksUsed: [],
  dead: false,
  deployed: false,
  reserve: false,
});

/** Миниатюры, реально находящиеся на поле (выставлены и живы). */
const deployedUnits = (units: Unit[]): Unit[] =>
  units.filter(unit => unit.deployed && !unit.dead && unit.hp > 0);

/**
 * Шаг 3 «Расстановка»: чей ход выставлять Миниатюру.
 *
 * Правило: «Начиная с Атакующего Игрока, оба игрока начинают выставлять по
 * одной Миниатюре… по очереди. Если у одного из игроков заканчиваются
 * Миниатюры, второй продолжает выставлять оставшиеся в одиночку».
 */
const nextDeployingPlayer = (units: Unit[], after: PlayerId): PlayerId | null => {
  const pending = (player: PlayerId) =>
    units.filter(item => item.player === player && !item.deployed && !item.reserve);

  const opponent = otherPlayer(after);
  if (pending(opponent).length > 0) return opponent;
  if (pending(after).length > 0) return after;
  return null;
};

/**
 * Бросок Инициативы (structure_game.txt, Шаг 2 и Фаза III).
 *
 * Правило дословно: «Игрок, получивший в результате больше Критических успехов,
 * считается выигравшим Инициативу. При отсутствии или равенстве выпавших
 * Критических Успехов выигравшим считается игрок, получивший больше Успехов.
 * Если все выпавшие значения обоих игроков равны, они заново совершают бросок
 * трех Кубиков Атаки».
 */
const rollInitiativePair = (): { rolls: InitiativeRoll[]; winner: PlayerId; equal: boolean } => {
  const rollFor = (player: PlayerId): InitiativeRoll => {
    const dice = rollPool({ attack: 3, agility: 0, mastery: 0 });
    return {
      player,
      dice,
      criticals: dice.filter(die => die.face === 'critical').length,
      successes: dice.filter(die => die.face === 'success').length,
    };
  };

  let p1 = rollFor('player1');
  let p2 = rollFor('player2');
  const allRolls: InitiativeRoll[] = [];

  const sameValues = (a: InitiativeRoll, b: InitiativeRoll): boolean => {
    const left = a.dice.map(die => die.face).sort().join(',');
    const right = b.dice.map(die => die.face).sort().join(',');
    return left === right;
  };

  let attempts = 0;
  while (sameValues(p1, p2) && attempts < INITIATIVE_REROLL_LIMIT) {
    allRolls.push(p1, p2);
    p1 = rollFor('player1');
    p2 = rollFor('player2');
    attempts += 1;
  }

  // Больше Критических Успехов; при равенстве — больше Успехов.
  let winner: PlayerId;
  if (p1.criticals !== p2.criticals) {
    winner = p1.criticals > p2.criticals ? 'player1' : 'player2';
  } else if (p1.successes !== p2.successes) {
    winner = p1.successes > p2.successes ? 'player1' : 'player2';
  } else {
    // Все значения равны — по правилам нужен новый бросок; лимит защищает
    // от бесконечного цикла в headless-симуляции.
    winner = 'player1';
  }

  return { rolls: [...allRolls, p1, p2], winner, equal: sameValues(p1, p2) };
};

export type PendingAttack = {
  attackerId: string;
  targetId: string;
  attackerName: string;
  targetName: string;
  result: AttackResult;
};

type ActivationState = {
  unitId: string;
  usage: ActivationUsage;
  selectedActionId: string | null;
  reachable: HexCoord[];
  targetIds: string[];
};

type GameState = {
  grid: HexCoord[];
  hexsonCenters: Set<string>;
  terrain: Map<string, TerrainData>;
  units: Unit[];
  whirlwinds: Whirlwind[];
  scenarioMarkers: ScenarioMarker[];

  activeUnitId: string | null;
  reachable: HexCoord[];
  currentPlayer: PlayerId;
  logs: BattleLog[];

  scenario: ScenarioId;
  turn: number;
  phase: TurnPhase;
  /** Победитель броска инициативы — активируется первым. */
  initiativeWinner: PlayerId | null;
  initiativeRolls: InitiativeRoll[];
  /** Текущая Активация: Маркеры Времени, выбранное Действие, цели. */
  activation: ActivationState | null;
  /** Результат последней атаки — для панели с 11 шагами. */
  pendingAttack: PendingAttack | null;
  /** Победные Очки и статистика сценария. */
  stats: Record<PlayerId, PlayerScenarioStats>;
  faithMarkers: Record<PlayerId, number>;
  etherMarkers: Record<PlayerId, number>;
  crystals: Record<PlayerId, number>;
  godCards: Record<PlayerId, number>;
  score: MatchScore | null;
  matchFinished: boolean;

  // --- Шаги 1–3: подготовка партии ---
  /** Этап подготовки; `complete` — начинается первый Ход. */
  setupStage: SetupStage;
  /** Атакующий Игрок: открывает первый Ход и выбирает зону расстановки. */
  attacker: PlayerId | null;
  /** Выбранная Атакующим зона (вторая достаётся противнику). */
  attackerZone: DeploymentZoneId | null;
  /** Две Зоны Расстановки согласно схеме сценария. */
  deploymentZones: DeploymentZone[];
  /** Чей сейчас выбор миниатюры на Шаге 3. */
  deployingPlayer: PlayerId | null;
  /** Победитель подготовительного броска инициативы (выбирает Атакующего). */
  setupInitiativeWinner: PlayerId | null;

  startGameWithRosters: (
    p1Units: RosterUnitInput[],
    p2Units: RosterUnitInput[],
    options?: { scenario?: ScenarioId },
  ) => void;
  resetGame: () => void;
  setScenario: (scenario: ScenarioId) => void;

  /** Шаг 2: бросок инициативы перед расстановкой. */
  rollSetupInitiative: () => void;
  /** Шаг 2: победитель инициативы выбирает Атакующего Игрока. */
  chooseAttacker: (attacker: PlayerId) => void;
  /** Шаг 3: Атакующий Игрок выбирает зону расстановки. */
  chooseDeploymentZone: (zone: DeploymentZoneId) => void;
  /** Шаг 3: выставить миниатюру в свой гекс зоны. */
  deployUnit: (unitId: string, hex: HexCoord) => boolean;
  /** Шаг 3: отправить миниатюру в Резерв. */
  deployToReserve: (unitId: string) => void;
  /** Шаг 3 завершён: переход к первому Ходу. */
  finishDeployment: () => void;
  /** Резерв: выставление миниатюры из Резерва при её Активации. */
  activateFromReserve: (unitId: string, hex: HexCoord) => boolean;

  advancePhase: () => void;
  rollInitiative: () => void;

  beginActivation: (unitId: string) => void;
  selectAction: (actionId: string) => void;
  moveActiveUnit: (to: HexCoord) => boolean;
  confirmAttack: (targetId: string, options?: { evasion?: boolean }) => void;
  declareReaction: (unitId: string, reaction: 'defend' | 'counterAttack') => void;
  finishActivation: () => void;

  moveWhirlwinds: () => void;
  endTurn: () => void;
  finishMatch: () => void;
};

const createNewLog = (text: string, step?: string): BattleLog => ({
  id: Math.random().toString(36).slice(2),
  text,
  timestamp: Date.now(),
  step,
});

/** Дописывает запись в журнал (новые записи сверху). */
function addLogs(entries: Array<string | { text: string; step?: string }>): void {
  if (entries.length === 0) return;
  useGameStore.setState(state => ({
    logs: [
      ...entries.map(entry =>
        typeof entry === 'string' ? createNewLog(entry) : createNewLog(entry.text, entry.step),
      ),
      ...state.logs,
    ].slice(0, 300),
  }));
}

const log = (text: string, step?: string) => addLogs([{ text, step }]);

/** Ландшафт под миниатюрой. */
const terrainAt = (terrain: Map<string, TerrainData>, position: HexCoord): TerrainData | undefined =>
  terrain.get(hexKey(position));

const isCoverCell = (terrain: Map<string, TerrainData>, hex: HexCoord): boolean => {
  const cell = terrain.get(hexKey(hex));
  return cell ? cell.type === 'ruins' || cell.type === 'etherCrystals' : false;
};

/** Стоимость потерь погибшей миниатюры и её влияние на сценарий. */
const onUnitDeath = (
  state: GameState,
  unit: Unit,
): { units: Unit[]; stats: Record<PlayerId, PlayerScenarioStats>; logs: string[] } => {
  const opponent = otherPlayer(unit.player);
  const logs: string[] = [`«${unit.name}» уничтожена.`];

  const stats: Record<PlayerId, PlayerScenarioStats> = {
    ...state.stats,
    [opponent]: {
      ...state.stats[opponent],
      lossesPoints: state.stats[opponent].lossesPoints + unit.points,
    },
    [unit.player]: {
      ...state.stats[unit.player],
      leaderAlive: unit.isLeader ? false : state.stats[unit.player].leaderAlive,
    },
  };

  // Потеря Лидера Экспедиции: Тест на Панику у всех оставшихся миниатюр.
  let units = state.units.map(item =>
    item.id === unit.id ? { ...item, hp: 0, dead: true, timeMarkers: 0 } : item,
  );

  if (unit.isLeader) {
    logs.push(
      `Лидер Экспедиции ${playerLabel(unit.player)} погиб — все миниатюры проходят Тест на Панику.`,
    );
    units = units.map(item => {
      if (item.player !== unit.player || item.dead || item.hp <= 0) return item;
      const dice = rollPool({ attack: 0, agility: 0, mastery: 0, defense: 1 });
      const passed = countAnySuccess(dice) > 0;
      if (passed) {
        logs.push(`«${item.name}»: Тест на Панику → ${describeDice(dice)} — пройден.`);
        return item;
      }
      logs.push(`«${item.name}»: Тест на Панику → ${describeDice(dice)} — провален, Маркер «Паника».`);
      return addStateMarker(item, 'panic').unit;
    });
  }

  return { units, stats, logs };
};

/** Применяет повреждение к миниатюре и, при необходимости, смерть. */
const damageUnit = (
  state: GameState,
  unitId: string,
  damage: number,
): { units: Unit[]; stats: Record<PlayerId, PlayerScenarioStats>; logs: string[] } => {
  const target = state.units.find(unit => unit.id === unitId);
  if (!target || damage <= 0) {
    return { units: state.units, stats: state.stats, logs: [] };
  }

  const hp = Math.max(0, target.hp - damage);
  const damaged: Unit = { ...target, hp };
  const logs = [`«${target.name}» получает ${damage} урона (Жизни ${hp}/${target.maxHp}).`];

  if (hp > 0) {
    return {
      units: state.units.map(unit => (unit.id === unitId ? damaged : unit)),
      stats: state.stats,
      logs,
    };
  }

  const death = onUnitDeath({ ...state, units: state.units.map(u => (u.id === unitId ? damaged : u)) }, damaged);
  return {
    units: death.units ?? state.units,
    stats: death.stats ?? state.stats,
    logs: [...logs, ...death.logs],
  };
};

export const useGameStore = create<GameState>((set, get) => ({
  grid: initialHexes,
  hexsonCenters: initialHexsonCenters,
  terrain: generateBattleTerrain(initialHexes, initialHexsonCenters, {
    coverKind: 'ruins',
    coverCount: 3,
  }),
  units: [],
  whirlwinds: [],
  scenarioMarkers: [],

  activeUnitId: null,
  reachable: [],
  currentPlayer: 'player1',
  logs: [],

  scenario: 'meetingEngagement',
  turn: 1,
  phase: 'startOfTurn',
  initiativeWinner: null,
  initiativeRolls: [],
  activation: null,
  pendingAttack: null,
  stats: { player1: emptyStats(), player2: emptyStats() },
  faithMarkers: { player1: 0, player2: 0 },
  etherMarkers: { player1: 0, player2: 0 },
  crystals: { player1: 0, player2: 0 },
  godCards: { player1: 0, player2: 0 },
  score: null,
  matchFinished: false,

  setupStage: 'scenario',
  attacker: null,
  attackerZone: null,
  deploymentZones: [],
  deployingPlayer: null,
  setupInitiativeWinner: null,

  startGameWithRosters: (p1Units, p2Units, options = {}) => {
    const scenario = options.scenario ?? get().scenario;
    const definition = SCENARIOS[scenario];

    // Шаг 1: подготовка поля строго по «Схеме Расстановки» сценария.
    const centers = Array.from(initialHexsonCenters).map(key => {
      const [q, r] = key.split(',').map(Number);
      return { q, r };
    });
    const field = prepareScenarioField(scenario, initialHexes, centers);

    const center = field.center;
    const army1 = p1Units.map((template, index) =>
      unitFromRoster(template, 'player1', center, index),
    );
    const army2 = p2Units.map((template, index) =>
      unitFromRoster(template, 'player2', center, index),
    );

    set({
      terrain: field.terrain,
      units: [...army1, ...army2],
      whirlwinds: field.whirlwinds,
      scenarioMarkers: field.markers,
      deploymentZones: field.zones,
      scenario,
      turn: 1,
      phase: 'startOfTurn',
      currentPlayer: 'player1',
      initiativeWinner: null,
      initiativeRolls: [],
      activeUnitId: null,
      activation: null,
      reachable: [],
      pendingAttack: null,
      stats: { player1: emptyStats(), player2: emptyStats() },
      faithMarkers: { player1: 0, player2: 0 },
      etherMarkers: { player1: 0, player2: 0 },
      crystals: { player1: 0, player2: 0 },
      godCards: { player1: 0, player2: 0 },
      score: null,
      matchFinished: false,
      setupStage: 'initiative',
      attacker: null,
      attackerZone: null,
      deployingPlayer: null,
      setupInitiativeWinner: null,
      logs: [
        createNewLog(`Сценарий «${definition.name}»: ${definition.summary}`, 'Шаг 1'),
        createNewLog(
          `Поле подготовлено по схеме сценария: ${field.whirlwinds.length} Эфирных Вихрей, ${field.markers.length} Маркеров Сценария.`,
          'Шаг 1',
        ),
        createNewLog(
          `Шаг 2: бросьте инициативу тремя Кубиками Атаки. Победитель выберет Атакующего Игрока.`,
          'Шаг 2',
        ),
      ],
    });
  },

  resetGame: () =>
    set({
      units: [],
      whirlwinds: [],
      scenarioMarkers: [],
      activeUnitId: null,
      activation: null,
      reachable: [],
      currentPlayer: 'player1',
      turn: 1,
      phase: 'startOfTurn',
      initiativeWinner: null,
      initiativeRolls: [],
      pendingAttack: null,
      stats: { player1: emptyStats(), player2: emptyStats() },
      faithMarkers: { player1: 0, player2: 0 },
      etherMarkers: { player1: 0, player2: 0 },
      crystals: { player1: 0, player2: 0 },
      godCards: { player1: 0, player2: 0 },
      score: null,
      matchFinished: false,
      setupStage: 'scenario',
      attacker: null,
      attackerZone: null,
      deploymentZones: [],
      deployingPlayer: null,
      setupInitiativeWinner: null,
      logs: [],
    }),

  setScenario: scenario => {
    const state = get();

    // Партия уже идёт: сценарий меняется только «на бумаге».
    if (state.setupStage === 'complete') {
      set({ scenario });
      log(`Выбран сценарий «${SCENARIOS[scenario].name}».`, 'Шаг 1');
      return;
    }

    // Шаг 3 уже начался — зоны закреплены за игроками, менять схему нельзя.
    if (state.setupStage === 'deployment') {
      log('Сценарий нельзя изменить после начала Расстановки.', 'Шаг 1');
      return;
    }

    // Шаг 1: поле пересобирается по «Схеме Расстановки» нового сценария,
    // поэтому результаты Шага 2 и выбора зоны сбрасываются.
    const centers = Array.from(initialHexsonCenters).map(key => {
      const [q, r] = key.split(',').map(Number);
      return { q, r };
    });
    const field = prepareScenarioField(scenario, initialHexes, centers);

    set({
      scenario,
      terrain: field.terrain,
      whirlwinds: field.whirlwinds,
      scenarioMarkers: field.markers,
      deploymentZones: field.zones,
      units: state.units.map(unit => ({
        ...unit,
        deployed: false,
        reserve: false,
        position: field.center,
      })),
      setupStage: 'initiative',
      attacker: null,
      attackerZone: null,
      deployingPlayer: null,
      setupInitiativeWinner: null,
      initiativeRolls: [],
    });

    addLogs([
      { text: `Выбран сценарий «${SCENARIOS[scenario].name}».`, step: 'Шаг 1' },
      {
        text: `Поле пересобрано по схеме сценария: ${field.whirlwinds.length} Эфирных Вихрей, ${field.markers.length} Маркеров Сценария.`,
        step: 'Шаг 1',
      },
      {
        text: 'Шаг 2: бросьте инициативу заново — победитель выберет Атакующего Игрока.',
        step: 'Шаг 2',
      },
    ]);
  },

  rollSetupInitiative: () => {
    const state = get();
    if (state.setupStage !== 'initiative') {
      log('Бросок инициативы выполняется на Шаге 2 подготовки.', 'Шаг 2');
      return;
    }

    const { rolls, winner, equal } = rollInitiativePair();
    const [p1, p2] = rolls.slice(-2);

    set({
      setupInitiativeWinner: winner,
      setupStage: 'attacker',
      initiativeRolls: rolls,
    });

    addLogs([
      { text: `Игрок 1: 3 Кубика Атаки → ${describeDice(p1.dice)}.`, step: 'Шаг 2' },
      { text: `Игрок 2: 3 Кубика Атаки → ${describeDice(p2.dice)}.`, step: 'Шаг 2' },
      {
        text: `Критические Успехи: ${p1.criticals} : ${p2.criticals}; Успехи: ${p1.successes} : ${p2.successes}.`,
        step: 'Шаг 2',
      },
      ...(equal
        ? [{ text: 'Все значения кубиков равны — переброс не дал результата, инициатива отдана Игроку 1 по лимиту перебросов.', step: 'Шаг 2' }]
        : []),
      {
        text: `Инициативу выигрывает ${playerTitle(winner)} и выбирает Атакующего Игрока.`,
        step: 'Шаг 2',
      },
    ]);
  },

  chooseAttacker: attacker => {
    const state = get();
    if (state.setupStage !== 'attacker') {
      log('Атакующий Игрок выбирается сразу после броска инициативы.', 'Шаг 2');
      return;
    }

    set({ attacker, setupStage: 'zone' });
    log(
      `Атакующим Игроком становится ${playerTitle(attacker)}. Он выбирает Зону Расстановки.`,
      'Шаг 2',
    );
  },

  chooseDeploymentZone: zoneId => {
    const state = get();
    const attacker = state.attacker;
    if (state.setupStage !== 'zone' || !attacker) {
      log('Зона расстановки выбирается после назначения Атакующего Игрока.', 'Шаг 3');
      return;
    }

    const opponent = otherPlayer(attacker);
    const deploymentZones = state.deploymentZones.map(zone => ({
      ...zone,
      player: zone.id === zoneId ? attacker : opponent,
    }));

    set({
      deploymentZones,
      attackerZone: zoneId,
      deployingPlayer: attacker,
      setupStage: 'deployment',
    });

    addLogs([
      {
        text: `${playerTitle(attacker)} выбирает зону расстановки и выставляет первую Миниатюру.`,
        step: 'Шаг 3',
      },
      {
        text: 'Игроки выставляют по одной Миниатюре по очереди, начиная с Атакующего Игрока.',
        step: 'Шаг 3',
      },
    ]);
  },

  deployUnit: (unitId, hex) => {
    const state = get();
    if (state.setupStage !== 'deployment') return false;

    const unit = state.units.find(item => item.id === unitId);
    if (!unit || unit.deployed || unit.reserve) return false;
    if (unit.player !== state.deployingPlayer) {
      log(`Сейчас выставляет Миниатюры ${playerTitle(state.deployingPlayer!)}.`, 'Шаг 3');
      return false;
    }

    const zone = state.deploymentZones.find(item => item.player === unit.player);
    if (!zone || !fitsInZone(zone, hex, unit.size)) {
      log(
        `«${unit.name}» не помещается в Зоне Расстановки: гексон вне зоны${unit.size === 'infantry' ? '' : ' или Крупная Миниатюра не помещается целиком'}.`,
        'Шаг 3',
      );
      return false;
    }

    const occupied = deployedUnits(state.units).some(
      item => item.position.q === hex.q && item.position.r === hex.r,
    );
    if (occupied) {
      log('В этом гексе уже стоит Миниатюра.', 'Шаг 3');
      return false;
    }

    const units = state.units.map(item =>
      item.id === unitId ? { ...item, position: hex, deployed: true, reserve: false } : item,
    );

    const nextPlayer = nextDeployingPlayer(units, unit.player);
    set({ units, deployingPlayer: nextPlayer });

    log(
      `«${unit.name}» выставлена${nextPlayer ? '' : ' — все Миниатюры на поле'}.`,
      'Шаг 3',
    );

    if (!nextPlayer) {
      log('Все Миниатюры выставлены. Завершите расстановку.', 'Шаг 3');
    }

    return true;
  },

  deployToReserve: unitId => {
    const state = get();
    if (state.setupStage !== 'deployment') return;

    const unit = state.units.find(item => item.id === unitId);
    if (!unit || unit.deployed || unit.reserve) return;
    if (unit.player !== state.deployingPlayer) return;

    const units = state.units.map(item =>
      item.id === unitId ? { ...item, reserve: true, deployed: false } : item,
    );

    const nextPlayer = nextDeployingPlayer(units, unit.player);
    set({ units, deployingPlayer: nextPlayer });

    log(
      `«${unit.name}» отправлена в Резерв: в Зоне Расстановки не нашлось подходящего гекса.`,
      'Шаг 3',
    );
  },

  finishDeployment: () => {
    const state = get();
    if (state.setupStage !== 'deployment') return;

    const undeployed = state.units.filter(item => !item.deployed && !item.reserve);
    if (undeployed.length > 0) {
      log(
        `Осталось не выставлено Миниатюр: ${undeployed.length}. Выставьте их или отправьте в Резерв.`,
        'Шаг 3',
      );
      return;
    }

    const attacker = state.attacker ?? 'player1';
    const deployed1 = deployedUnits(state.units).filter(item => item.player === 'player1').length;
    const deployed2 = deployedUnits(state.units).filter(item => item.player === 'player2').length;
    const reserveCount = state.units.filter(item => item.reserve).length;

    set({
      setupStage: 'complete',
      phase: 'startOfTurn',
      turn: 1,
      currentPlayer: attacker,
      deployingPlayer: null,
      initiativeWinner: null,
      initiativeRolls: [],
    });

    addLogs([
      {
        text: `Расстановка завершена: Игрок 1 — ${deployed1} мин. на поле, Игрок 2 — ${deployed2} мин. В Резерве: ${reserveCount}.`,
        step: 'Шаг 3',
      },
      {
        text: 'Оба игрока берут по две карты Богов.',
        step: 'Шаг 3',
      },
      {
        text: `Первый Ход открывает Атакующий Игрок — ${playerTitle(attacker)}. Фаза III «Бросок инициативы» начинается со второго хода.`,
        step: 'Шаг 4',
      },
    ]);

    set(currentState => ({
      godCards: {
        player1: currentState.godCards.player1 + 2,
        player2: currentState.godCards.player2 + 2,
      },
    }));
  },

  activateFromReserve: (unitId, hex) => {
    const state = get();
    if (state.phase !== 'activation' || state.setupStage !== 'complete') return false;

    const unit = state.units.find(item => item.id === unitId);
    if (!unit || !unit.reserve) return false;

    // Резерв вводится в игру только в свою Активацию: по правилу Миниатюра
    // из Резерва сразу Активируется (Шаг 2 с −1 Маркером Времени).
    if (unit.player !== state.currentPlayer) {
      log(
        `Миниатюры из Резерва вводит ${playerTitle(state.currentPlayer)} — сейчас его Активация.`,
        'Резерв',
      );
      return false;
    }

    if (state.activeUnitId && state.activeUnitId !== unitId) {
      log('Сначала завершите текущую Активацию.', 'Резерв');
      return false;
    }

    const zone = state.deploymentZones.find(item => item.player === unit.player);
    if (!zone || !fitsInZone(zone, hex, unit.size)) {
      log('Миниатюра из Резерва выставляется только в своей Зоне Расстановки.', 'Резерв');
      return false;
    }

    const occupied = deployedUnits(state.units).some(
      item => item.position.q === hex.q && item.position.r === hex.r,
    );
    if (occupied) {
      log('В этом гексе уже стоит Миниатюра.', 'Резерв');
      return false;
    }

    // Правило Резерва: после выставления Активация продолжается со Шага 2,
    // но с −1 Маркером Времени на эту Активацию.
    const units = state.units.map(item =>
      item.id === unitId
        ? {
            ...item,
            position: hex,
            deployed: true,
            reserve: false,
            timeMarkers: Math.max(0, ACTIVATION_TIME_MARKERS - 1),
            freeAttacksUsed: [],
          }
        : item,
    );

    set({
      units,
      activeUnitId: unitId,
      activation: {
        unitId,
        usage: { actionIds: [], attackUsed: false, timeSpent: 0 },
        selectedActionId: null,
        reachable: [],
        targetIds: [],
      },
      reachable: [],
      pendingAttack: null,
    });

    addLogs([
      {
        text: `«${unit.name}» выставлена из Резерва в свою Зону Расстановки.`,
        step: 'Резерв',
      },
      {
        text: `Активация продолжается со Шага 2 с ${ACTIVATION_TIME_MARKERS - 1} Маркером Времени (на один меньше).`,
        step: 'Резерв',
      },
    ]);

    return true;
  },

  advancePhase: () => {
    const state = get();
    if (state.matchFinished) return;

    switch (state.phase) {
      case 'startOfTurn': {
        const logs: string[] = [];
        const units = state.units.map(unit => {
          if (unit.dead || unit.hp <= 0) return unit;
          const expired = expireStatusesAtStartOfTurn(unit);
          logs.push(...expired.logs);
          return {
            ...expired.unit,
            activated: false,
            reactivations: 0,
            timeMarkers: 0,
            defenseBonus: 0,
            concentration: 0,
            freeAttacksUsed: [],
          };
        });
        set({ phase: 'drawGodCard', units });
        log(`Ход ${state.turn}. Фаза I: Начало хода.`, 'Фаза I');
        addLogs(logs);
        break;
      }

      case 'drawGodCard': {
        // Каждый игрок берёт карту Богов; в прототипе это влияет на сценарии.
        set({
          // Фаза III «Инициатива» начинается только со второго хода
          // (structure_game.txt:313). Первый ход открывает Атакующий Игрок.
          phase: state.turn === 1 ? 'activation' : 'initiative',
          currentPlayer: state.turn === 1 ? (state.attacker ?? 'player1') : state.currentPlayer,
          godCards: {
            player1: state.godCards.player1 + 1,
            player2: state.godCards.player2 + 1,
          },
          stats: {
            player1: { ...state.stats.player1, godCardsPlayed: state.stats.player1.godCardsPlayed + 1 },
            player2: { ...state.stats.player2, godCardsPlayed: state.stats.player2.godCardsPlayed + 1 },
          },
        });
        log('Фаза II: оба игрока взяли карту Богов.', 'Фаза II');
        if (state.turn === 1) {
          const opener = state.attacker ?? 'player1';
          log(
            `Фаза III пропускается: первый ход открывает Атакующий Игрок — ${playerTitle(opener)}.`,
            'Фаза III',
          );
          log(`Фаза IV: Активация. Первым активируется ${playerTitle(opener)}.`, 'Фаза IV');
        }
        break;
      }

      case 'initiative':
        if (!state.initiativeWinner) {
          log('Фаза III: сначала бросьте инициативу.', 'Фаза III');
          return;
        }
        set({
          phase: 'activation',
          currentPlayer: state.initiativeWinner,
        });
        log(
          `Фаза IV: Активация. Первым активируется ${playerTitle(state.initiativeWinner)}.`,
          'Фаза IV',
        );
        break;

      case 'activation':
        set({ phase: 'whirlwindMovement', activeUnitId: null, activation: null, reachable: [] });
        log('Фаза IV завершена форсированно.', 'Фаза IV');
        break;

      case 'whirlwindMovement':
        set({ phase: 'endOfTurn' });
        log('Фаза V: Движение Вихрей завершено.', 'Фаза V');
        break;

      case 'endOfTurn': {
        log('Фаза VI: Конец хода.', 'Фаза VI');

        if (state.turn >= MAX_TURNS) {
          get().finishMatch();
          return;
        }

        set({
          phase: 'startOfTurn',
          turn: state.turn + 1,
          initiativeWinner: null,
          initiativeRolls: [],
          currentPlayer: state.attacker ?? 'player1',
          activeUnitId: null,
          activation: null,
          reachable: [],
          pendingAttack: null,
          units: state.units.map(unit => ({
            ...unit,
            activated: false,
            reactivations: 0,
            timeMarkers: 0,
            defenseBonus: 0,
            concentration: 0,
            freeAttacksUsed: [],
          })),
        });
        break;
      }
    }
  },

  rollInitiative: () => {
    const state = get();
    if (state.phase !== 'initiative') {
      log('Бросок инициативы выполняется в Фазе III.', 'Фаза III');
      return;
    }

    const { rolls, winner, equal } = rollInitiativePair();
    const pairs = rolls.length / 2;
    const p1 = rolls[rolls.length - 2];
    const p2 = rolls[rolls.length - 1];

    set({
      initiativeWinner: winner,
      initiativeRolls: rolls,
      currentPlayer: winner,
    });

    const logs: Array<{ text: string; step?: string }> = [];
    if (pairs > 1) {
      logs.push({
        text: `Все значения кубиков обоих игроков совпали — бросок инициативы повторён (попыток: ${pairs}).`,
        step: 'Фаза III',
      });
    }
    logs.push(
      {
        text: `Игрок 1: 3 Кубика Атаки → ${describeDice(p1.dice)} (${p1.criticals} крит., ${p1.successes} усп.).`,
        step: 'Фаза III',
      },
      {
        text: `Игрок 2: 3 Кубика Атаки → ${describeDice(p2.dice)} (${p2.criticals} крит., ${p2.successes} усп.).`,
        step: 'Фаза III',
      },
    );

    if (equal) {
      logs.push({
        text: `Равенство сохранилось после ${INITIATIVE_REROLL_LIMIT} перебросов — Инициатива отдана Игроку 1.`,
        step: 'Фаза III',
      });
    } else if (p1.criticals !== p2.criticals) {
      logs.push({
        text: 'Больше Критических успехов — Инициатива выиграна по первому условию.',
        step: 'Фаза III',
      });
    } else {
      logs.push({
        text: 'Критических успехов поровну — Инициатива выиграна по числу Успехов.',
        step: 'Фаза III',
      });
    }

    logs.push({
      text: `Инициативу выигрывает ${playerTitle(winner)} и активируется первым.`,
      step: 'Фаза III',
    });

    addLogs(logs);

    // Критические Успехи броска инициативы дают Маркеры Веры (combat.txt).
    const faith: Record<PlayerId, number> = { ...state.faithMarkers };
    faith.player1 += rolls.reduce((total, roll) => total + (roll.player === 'player1' ? roll.criticals : 0), 0);
    faith.player2 += rolls.reduce((total, roll) => total + (roll.player === 'player2' ? roll.criticals : 0), 0);
    set({ faithMarkers: faith });
  },

  beginActivation: unitId => {
    const state = get();
    if (state.phase !== 'activation') {
      log('Активация доступна только в Фазе IV.', 'Фаза IV');
      return;
    }

    const unit = state.units.find(item => item.id === unitId);
    if (!unit || unit.hp <= 0) return;

    if (!unit.deployed) {
      // Миниатюра ещё не выставлена (Шаг 3) либо находится в Резерве.
      if (unit.reserve) {
        log(
          `«${unit.name}» в Резерве: выберите гекс в своей зоне расстановки — Активация из Резерва начинается с −1 Маркера Времени.`,
          'Резерв',
        );
      } else {
        log(`«${unit.name}» ещё не выставлена на поле (Шаг 3 «Расстановка»).`, 'Фаза IV');
      }
      return;
    }

    if (unit.player !== state.currentPlayer) {
      log(`Сейчас активируется ${playerTitle(state.currentPlayer)}.`, 'Фаза IV');
      return;
    }

    if (unit.activated) {
      if (unit.reactivations >= 1) {
        log(`«${unit.name}» уже реактивирована в этом ходу — повторная реактивация запрещена.`, 'Фаза IV');
        return;
      }
    }

    const reactionBlocked = reactionsBlockedInWhirlwind(state.whirlwinds, unit.position);
    if (reactionBlocked) {
      log(
        `«${unit.name}» стоит в Эфирном Вихре: Реакции ей недоступны, но Активация разрешена.`,
        'Фаза IV',
      );
    }

    const logs: Array<{ text: string; step?: string }> = [
      {
        text: `Шаг 1: «${unit.name}» начинает Активацию (${playerLabel(unit.player)}).`,
        step: 'Шаг 1',
      },
    ];

    // Шаг 2: срабатывание ландшафта.
    const terrain = terrainAt(state.terrain, unit.position);
    let working = unit;
    if (terrain && terrain.type !== 'plain') {
      const effect = terrainActivationEffect(unit, terrain);
      logs.push({ text: effect.logs.join(' '), step: 'Шаг 2' });
      working = effect.unit;
      if (effect.died) {
        const result = damageUnit(
          { ...state, units: state.units.map(item => (item.id === unit.id ? effect.unit : item)) },
          unit.id,
          unit.hp,
        );
        logs.push(...result.logs.map(text => ({ text, step: 'Шаг 2' })));
        set({ units: result.units, stats: result.stats, activation: null, activeUnitId: null });
        addLogs(logs);
        return;
      }
    } else {
      logs.push({ text: 'Шаг 2: ландшафт не оказывает эффекта.', step: 'Шаг 2' });
    }

    // Шаг 3: начало Активации — выдача Маркеров Времени.
    working = {
      ...working,
      timeMarkers: Math.min(MAX_TIME_MARKERS, working.timeMarkers + ACTIVATION_TIME_MARKERS),
      activated: false,
      reactivations: unit.activated ? unit.reactivations + 1 : unit.reactivations,
      freeAttacksUsed: [],
    };
    logs.push({
      text: `Шаг 3: выдано ${ACTIVATION_TIME_MARKERS} Маркера Времени (всего ${working.timeMarkers}, максимум ${MAX_TIME_MARKERS}).`,
      step: 'Шаг 3',
    });

    // Шаг 4: срабатывание Маркеров Состояний.
    if (working.stateMarkers.length > 0) {
      const markers = triggerStateMarkers(working);
      logs.push({ text: markers.logs.join(' '), step: 'Шаг 4' });
      working = markers.unit;

      if (markers.died) {
        const result = damageUnit(
          { ...state, units: state.units.map(item => (item.id === unit.id ? working : item)) },
          unit.id,
          working.hp,
        );
        logs.push(...result.logs.map(text => ({ text, step: 'Шаг 4' })));
        set({ units: result.units, stats: result.stats, activation: null, activeUnitId: null });
        addLogs(logs);
        return;
      }
    } else {
      logs.push({ text: 'Шаг 4: Маркеров Состояний нет.', step: 'Шаг 4' });
    }

    set({
      units: state.units.map(item => (item.id === unit.id ? working : item)),
      activeUnitId: unit.id,
      activation: {
        unitId: unit.id,
        usage: { actionIds: [], attackUsed: false, timeSpent: 0 },
        selectedActionId: null,
        reachable: [],
        targetIds: [],
      },
      reachable: [],
      pendingAttack: null,
    });

    addLogs(logs);
  },

  selectAction: actionId => {
    const state = get();
    const activation = state.activation;
    if (!activation) {
      log('Сначала выберите миниатюру для Активации.', 'Фаза IV');
      return;
    }

    const unit = state.units.find(item => item.id === activation.unitId);
    if (!unit) return;

    const terrain = terrainAt(state.terrain, unit.position);
    const tile = actionById(unit, actionId, terrain);
    if (!tile) {
      log(`Действие «${actionId}» недоступно этой миниатюре.`, 'Шаг 5');
      return;
    }

    const legality = checkActionLegality(unit, tile, activation.usage);
    if (!legality.allowed) {
      log(legality.reason ?? 'Действие недоступно.', 'Шаг 5');
      return;
    }

    if (tile.kind === 'concentrate') {
      // Концентрация — мгновенное Действие.
      const nextUnit: Unit = {
        ...unit,
        timeMarkers: unit.timeMarkers - tile.timeCost,
        concentration: unit.concentration + 1,
      };
      set({
        units: state.units.map(item => (item.id === unit.id ? nextUnit : item)),
        activation: {
          ...activation,
          usage: {
            actionIds: [...activation.usage.actionIds, tile.id],
            attackUsed: activation.usage.attackUsed,
            timeSpent: activation.usage.timeSpent + tile.timeCost,
          },
          selectedActionId: null,
          reachable: [],
          targetIds: [],
        },
        reachable: [],
      });
      log(
        `Шаг 6: «${unit.name}» концентрируется (+1 Кубик Атаки к следующему Действию). Осталось Маркеров Времени: ${nextUnit.timeMarkers}.`,
        'Шаг 6',
      );
      return;
    }

    if (tile.kind === 'defend' || tile.reaction) {
      get().declareReaction(unit.id, 'defend');
      return;
    }

    if (tile.kind === 'healWounds') {
      if (!unit.stateMarkers.includes('bleeding')) {
        log(`«Перевязать раны» нужно только при Маркере «Кровотечение».`, 'Шаг 6');
        return;
      }
      const nextUnit: Unit = {
        ...unit,
        timeMarkers: unit.timeMarkers - tile.timeCost,
        stateMarkers: unit.stateMarkers.filter(marker => marker !== 'bleeding'),
      };
      set({
        units: state.units.map(item => (item.id === unit.id ? nextUnit : item)),
        activation: {
          ...activation,
          usage: {
            actionIds: [...activation.usage.actionIds, tile.id],
            attackUsed: activation.usage.attackUsed,
            timeSpent: activation.usage.timeSpent + tile.timeCost,
          },
          selectedActionId: null,
          reachable: [],
          targetIds: [],
        },
      });
      log(
        `Шаг 6: «${unit.name}» перевязывает раны: Маркер «Кровотечение» снят за 2 Маркера Времени.`,
        'Шаг 6',
      );
      return;
    }

    if (tile.kind === 'investigate' || tile.kind === 'takeItem') {
      const whirlwind = state.whirlwinds.find(item => isInWhirlwind(item, unit.position));
      const marker = state.scenarioMarkers.find(
        item =>
          item.position.q === unit.position.q &&
          item.position.r === unit.position.r &&
          item.carrierUnitId === null,
      );

      let crystals = state.crystals;
      let whirlwinds = state.whirlwinds;
      let scenarioMarkers = state.scenarioMarkers;
      let stats = state.stats;
      const entries: string[] = [];

      if (whirlwind && tile.kind === 'investigate') {
        const taken = takeEtherCrystals(whirlwind, unit.player, 2);
        whirlwinds = state.whirlwinds.map(item => (item.id === whirlwind.id ? taken.whirlwind : item));
        crystals = { ...state.crystals, [unit.player]: state.crystals[unit.player] + taken.taken };
        stats = {
          ...state.stats,
          [unit.player]: {
            ...state.stats[unit.player],
            crystals: state.stats[unit.player].crystals + taken.taken,
          },
        };
        entries.push(
          `«${unit.name}» исследует Вихрь и забирает ${taken.taken} Кристалл(ов) Эфира (Приверженность переходит к ${playerTitle(unit.player)}).`,
        );
      }

      if (marker) {
        scenarioMarkers = state.scenarioMarkers.map(item =>
          item.id === marker.id
            ? { ...item, carrierUnitId: unit.id, owner: unit.player }
            : item,
        );
        stats = {
          ...stats,
          [unit.player]: {
            ...stats[unit.player],
            controlledMarkers: stats[unit.player].controlledMarkers + 1,
            capturedPrisoners:
              marker.kind === 'prisoner'
                ? stats[unit.player].capturedPrisoners + 1
                : stats[unit.player].capturedPrisoners,
          },
        };
        entries.push(`«${unit.name}» берёт маркер сценария.`);
      }

      if (entries.length === 0) {
        log(`Исследовать нечего: рядом нет Вихря или маркера.`, 'Шаг 6');
        return;
      }

      set({
        crystals,
        whirlwinds,
        scenarioMarkers,
        stats,
        units: state.units.map(item =>
          item.id === unit.id
            ? { ...item, timeMarkers: item.timeMarkers - tile.timeCost }
            : item,
        ),
        activation: {
          ...activation,
          usage: {
            actionIds: [...activation.usage.actionIds, tile.id],
            attackUsed: activation.usage.attackUsed,
            timeSpent: activation.usage.timeSpent + tile.timeCost,
          },
          selectedActionId: null,
          reachable: [],
          targetIds: [],
        },
      });
      log(`Шаг 6: ${entries.join(' ')}`, 'Шаг 6');
      return;
    }

    // Движение и Атаки: показываем доступные гексы и цели.
    if (tile.kind === 'step' || tile.kind === 'run') {
      const blocked = new Set<string>();
      for (const item of deployedUnits(state.units)) {
        if (item.id === unit.id) continue;
        blocked.add(hexKey(item.position));
      }
      // Объёмный ландшафт и Вихри непроходимы.
      for (const hex of state.grid) {
        if (isCoverCell(state.terrain, hex)) blocked.add(hexKey(hex));
      }
      for (const whirlwind of state.whirlwinds) {
        for (const hex of [whirlwind.position, ...hexNeighbors(whirlwind.position)]) {
          blocked.add(hexKey(hex));
        }
      }

      const range = effectiveMovement(unit, terrain) * (tile.kind === 'run' ? 2 : 1);
      const reachable = reachableHexes(unit.position, range, blocked, inBounds);

      set({
        activation: { ...activation, selectedActionId: tile.id, reachable, targetIds: [] },
        reachable,
      });
      log(
        `Шаг 5: «${unit.name}» заявляет «${tile.name}» (${range} гекс.).`,
        'Шаг 5',
      );
      return;
    }

    if (isAttackAction(tile)) {
      const targets = deployedUnits(state.units).filter(target => {
        if (target.player === unit.player) return false;

        const distance = hexDistance(unit.position, target.position);
        if (tile.kind === 'meleeAttack') return distance === 1;
        if (tile.kind === 'counterAttack') return distance === 1;

        // Дистанционная Атака запрещена, если в смежном гексе есть враг.
        const adjacentEnemy = deployedUnits(state.units).some(
          enemy =>
            enemy.player !== unit.player &&
            hexDistance(unit.position, enemy.position) === 1,
        );
        if (adjacentEnemy) return false;
        if (distance > tile.range) return false;

        const visibility = canSee(unit, target, state.terrain, state.hexsonCenters);
        return visibility.visible;
      });

      if (targets.length === 0) {
        log(
          `Шаг 5: у действия «${tile.name}» нет легальных целей (дистанция, видимость или Связан в Ближнем Бою).`,
          'Шаг 5',
        );
      }

      set({
        activation: {
          ...activation,
          selectedActionId: tile.id,
          reachable: [],
          targetIds: targets.map(target => target.id),
        },
        reachable: [],
      });

      if (targets.length > 0) {
        log(
          `Шаг 5: «${unit.name}» заявляет «${tile.name}». Цели: ${targets.map(t => `«${t.name}»`).join(', ')}.`,
          'Шаг 5',
        );
      }
      return;
    }

    log(`Действие «${tile.name}» пока не поддерживается в прототипе.`, 'Шаг 5');
  },

  moveActiveUnit: to => {
    const state = get();
    const activation = state.activation;
    if (!activation || !activation.selectedActionId) return false;

    const unit = state.units.find(item => item.id === activation.unitId);
    if (!unit) return false;

    const tile = actionById(
      unit,
      activation.selectedActionId,
      terrainAt(state.terrain, unit.position),
    );
    if (!tile) return false;

    const allowed = activation.reachable.some(hex => hex.q === to.q && hex.r === to.r);
    if (!allowed) {
      log('Гекс недоступен для этого перемещения.', 'Шаг 6');
      return false;
    }

    const moved: Unit = {
      ...unit,
      position: to,
      timeMarkers: unit.timeMarkers - tile.timeCost,
      concentration: 0,
    };

    let units = state.units.map(item => (item.id === unit.id ? moved : item));
    let stats = state.stats;
    const entries: Array<{ text: string; step?: string }> = [
      {
        text: `Шаг 7: «${unit.name}» перемещается на ${hexKey(to)} (${tile.name}, потрачено ${tile.timeCost} Маркер(ов) Времени).`,
        step: 'Шаг 7',
      },
    ];

    // Опасный ландшафт срабатывает при входе в гекс.
    const terrain = terrainAt(state.terrain, to);
    if (terrain && terrain.type !== 'plain') {
      const effect = terrainActivationEffect(moved, terrain);
      if (effect.logs.length > 0) {
        entries.push({ text: effect.logs.join(' '), step: 'Шаг 7' });
      }
      units = units.map(item => (item.id === unit.id ? effect.unit : item));

      if (effect.died) {
        const result = damageUnit({ ...state, units }, unit.id, effect.unit.hp);
        entries.push(...result.logs.map(text => ({ text, step: 'Шаг 7' })));
        set({
          units: result.units,
          stats: result.stats,
          activation: null,
          activeUnitId: null,
          reachable: [],
        });
        addLogs(entries);
        return true;
      }
    }

    set({
      units,
      stats,
      activation: {
        ...activation,
        usage: {
          actionIds: [...activation.usage.actionIds, tile.id],
          attackUsed: activation.usage.attackUsed,
          timeSpent: activation.usage.timeSpent + tile.timeCost,
        },
        selectedActionId: null,
        reachable: [],
        targetIds: [],
      },
      reachable: [],
    });

    addLogs(entries);
    return true;
  },

  confirmAttack: (targetId, options = {}) => {
    const state = get();
    const activation = state.activation;
    if (!activation || !activation.selectedActionId) {
      log('Сначала заявите Действие Атаки.', 'Шаг 5');
      return;
    }

    const attacker = state.units.find(item => item.id === activation.unitId);
    const target = state.units.find(item => item.id === targetId);
    if (!attacker || !target) return;

    if (!activation.targetIds.includes(targetId)) {
      log(`«${target.name}» не является легальной целью.`, 'Шаг 1');
      return;
    }

    const attackerTerrain = terrainAt(state.terrain, attacker.position);
    const tile = actionById(attacker, activation.selectedActionId, attackerTerrain);
    if (!tile) return;

    const legality = checkActionLegality(attacker, tile, activation.usage);
    if (!legality.allowed) {
      log(legality.reason ?? 'Атака недоступна.', 'Шаг 5');
      return;
    }

    const targetTerrain = terrainAt(state.terrain, target.position);
    const visibility = canSee(attacker, target, state.terrain, state.hexsonCenters);
    const poorVisibility = state.whirlwinds.some(
      whirlwind =>
        isInWhirlwind(whirlwind, attacker.position) || isInWhirlwind(whirlwind, target.position),
    );

    const defenseBonus =
      target.defenseBonus +
      statusDefenseBonus(target) +
      bigMiniatureDefenseBonus(target, attacker, state.terrain, state.hexsonCenters);

    const meleeTile = target.attackTiles.find(item => item.kind === 'meleeAttack');

    // «Сокрушительный Урон»: при уроне не меньше максимума Жизней работает
    // только Уклонение, поэтому оно применяется принудительно.
    const crushing = (tile.damage ?? 0) >= target.maxHp;
    const evasion = Boolean(options.evasion) || crushing;

    const result = resolveAttack(
      {
        action: tile,
        kind: tile.kind === 'meleeAttack' || tile.kind === 'counterAttack' ? 'melee' : 'ranged',
        evasion,
        poorVisibility,
        attackerBonuses: {
          concentration: attacker.concentration,
          hunger: attacker.statuses.includes('hunger'),
          nearEtherCrystals: targetTerrain?.type === 'etherCrystals',
        },
        defenseBonus,
        defender: {
          name: target.name,
          size: target.size,
          defensePool: target.defensePool,
          meleeAction: meleeTile,
          maxHp: target.maxHp,
        },
      },
      target.name,
    );

    const entries: BattleLog[] = [
      createNewLog(
        `Шаг 6: «${attacker.name}» атакует «${target.name}» действием «${tile.name}».` +
          (poorVisibility ? ' Зона Плохой Видимости: успехи Атаки перебрасываются.' : '') +
          (visibility.inBlindZone ? ' Цель в Слепой Зоне.' : ''),
        'Шаг 6',
      ),
      ...result.steps.map(stepLog =>
        createNewLog(`Шаг ${stepLog.step}: ${stepLog.title} — ${stepLog.detail}`, `Шаг ${stepLog.step}`),
      ),
    ];

    // Затраты Маркеров Времени и учёт использования Действий.
    const spentAttacker: Unit = {
      ...attacker,
      timeMarkers: attacker.timeMarkers - tile.timeCost,
      concentration: 0,
    };

    let units = state.units.map(item => (item.id === attacker.id ? spentAttacker : item));
    let stats = state.stats;
    let faithMarkers: Record<PlayerId, number> = { ...state.faithMarkers };

    // Маркеры Веры за Критические Успехи любых бросков.
    if (result.faithMarkers > 0) {
      faithMarkers = {
        ...faithMarkers,
        [attacker.player]: faithMarkers[attacker.player] + result.faithMarkers,
      };
      stats = {
        ...stats,
        [attacker.player]: {
          ...stats[attacker.player],
          faithEtherMarkers: stats[attacker.player].faithEtherMarkers + result.faithMarkers,
        },
      };
    }

    // Урон по защищающемуся.
    if (result.damageToDefender > 0) {
      const applied = damageUnit({ ...state, units, stats }, target.id, result.damageToDefender);
      units = applied.units;
      stats = applied.stats;
      entries.push(...applied.logs.map(text => createNewLog(text, 'Шаг 11')));
    } else {
      entries.push(createNewLog('Шаг 11: урон не нанесён — все успехи Атаки отменены.', 'Шаг 11'));
    }

    // Ответный урон от Критического Успеха Защиты в ближнем бою.
    if (result.damageToAttacker > 0) {
      const applied = damageUnit({ ...state, units, stats }, attacker.id, result.damageToAttacker);
      units = applied.units;
      stats = applied.stats;
      entries.push(...applied.logs.map(text => createNewLog(text, 'Шаг 11')));
    }

    // «Урон с эффектом»: Маркер Состояния при Критическом Уроне.
    if (result.stateMarker && result.damageToDefender > 0) {
      const targetNow = units.find(item => item.id === target.id);
      if (targetNow && targetNow.hp > 0) {
        const applied = addStateMarker(targetNow, result.stateMarker, attacker.size === 'huge');
        if (applied.applied) {
          units = units.map(item => (item.id === target.id ? applied.unit : item));
          entries.push(
            createNewLog(
              `Цель получает Маркер Состояния «${result.stateMarker}» (Критический Урон).`,
              'Шаг 11',
            ),
          );
        } else if (applied.reason) {
          entries.push(createNewLog(applied.reason, 'Шаг 11'));
        }
      }
    }

    set({
      units,
      stats,
      faithMarkers,
      pendingAttack: {
        attackerId: attacker.id,
        targetId: target.id,
        attackerName: attacker.name,
        targetName: target.name,
        result,
      },
      activation: {
        ...activation,
        usage: {
          actionIds: [...activation.usage.actionIds, tile.id],
          attackUsed: true,
          timeSpent: activation.usage.timeSpent + tile.timeCost,
        },
        selectedActionId: null,
        reachable: [],
        targetIds: [],
      },
      reachable: [],
      logs: [...entries, ...state.logs].slice(0, 300),
    });
  },

  declareReaction: (unitId, reaction) => {
    const state = get();
    const unit = state.units.find(item => item.id === unitId);
    if (!unit || unit.hp <= 0) return;

    if (unit.activated) {
      log(`«${unit.name}» уже активирована — Реакция недоступна.`, 'Шаг 6');
      return;
    }

    if (unit.stateMarkers.length > 0) {
      log(
        `«${unit.name}» имеет Маркер Состояния — Реакции недоступны.`,
        'Шаг 6',
      );
      return;
    }

    if (reactionsBlockedInWhirlwind(state.whirlwinds, unit.position)) {
      log(`«${unit.name}» стоит в Эфирном Вихре — Реакции недоступны.`, 'Шаг 6');
      return;
    }

    const terrain = terrainAt(state.terrain, unit.position);
    if (terrain && terrain.type !== 'plain' && terrain.type !== 'etherCrystals' && terrain.type !== 'ruins') {
      log(`«${unit.name}» на Опасном Ландшафте — Реакции недоступны.`, 'Шаг 6');
      return;
    }

    if (reaction === 'defend') {
      const next: Unit = {
        ...unit,
        activated: true,
        defenseBonus: unit.defenseBonus + 2,
        timeMarkers: Math.max(0, unit.timeMarkers - 1),
      };
      set({
        units: state.units.map(item => (item.id === unit.id ? next : item)),
      });
      log(
        `Шаг 6: «${unit.name}» объявляет Реакцию «Защита» (+2 Кубика Защиты до конца Активации). Реакция расходует её Активацию.`,
        'Шаг 6',
      );
      return;
    }

    // Встречная Атака: одновременный удар по активной миниатюре.
    const activeId = state.activeUnitId;
    const active = state.units.find(item => item.id === activeId);
    const meleeTile = unit.attackTiles.find(item => item.kind === 'meleeAttack');
    if (!active || !meleeTile || hexDistance(unit.position, active.position) !== 1) {
      log(`Встречная Атака невозможна: нужна смежная вражеская миниатюра и Плитка ближнего боя.`, 'Шаг 6');
      return;
    }

    const result = resolveAttack(
      {
        action: meleeTile,
        kind: 'melee',
        defenseBonus: active.defenseBonus,
        defender: {
          name: active.name,
          size: active.size,
          defensePool: active.defensePool,
          meleeAction: active.attackTiles.find(item => item.kind === 'meleeAttack'),
          maxHp: active.maxHp,
        },
      },
      active.name,
    );

    const applied = damageUnit(state, active.id, result.damageToDefender);
    const reactivated: Unit = {
      ...unit,
      activated: true,
      timeMarkers: Math.max(0, unit.timeMarkers - meleeTile.timeCost),
    };

    set({
      units: applied.units.map(item => (item.id === unit.id ? reactivated : item)),
      stats: applied.stats,
      logs: [
        createNewLog(
          `Шаг 6: «${unit.name}» объявляет Встречную Атаку по «${active.name}» — ${result.damageToDefender} урона.`,
          'Шаг 6',
        ),
        ...result.steps.map(stepLog =>
          createNewLog(`Шаг ${stepLog.step}: ${stepLog.detail}`, `Шаг ${stepLog.step}`),
        ),
        ...applied.logs.map(text => createNewLog(text, 'Шаг 6')),
        ...state.logs,
      ].slice(0, 300),
    });
  },

  finishActivation: () => {
    const state = get();
    const activation = state.activation;
    if (!activation) return;

    const unit = state.units.find(item => item.id === activation.unitId);

    const expire = unit ? expireStatusesAtEndOfActivation(unit) : null;
    const units = state.units.map(item => {
      if (item.id !== activation.unitId) return item;
      const base = expire ? expire.unit : item;
      // Шаг 8: после завершения Активации Миниатюра теряет все Маркеры Времени.
      return { ...base, activated: true, timeMarkers: 0, defenseBonus: 0, concentration: 0 };
    });

    // Учитываются только миниатюры, реально стоящие на поле (Шаг 3).
    const remaining = (player: PlayerId) =>
      units.filter(
        item =>
          item.player === player && item.deployed && item.hp > 0 && !item.dead && !item.activated,
      );

    const current = state.currentPlayer;
    const opponent = otherPlayer(current);

    let nextPlayer = current;
    if (remaining(opponent).length > 0) nextPlayer = opponent;
    else if (remaining(current).length === 0) nextPlayer = opponent;

    const bothDone =
      remaining('player1').length === 0 && remaining('player2').length === 0;

    set({
      units,
      activeUnitId: null,
      activation: null,
      reachable: [],
      currentPlayer: bothDone ? current : nextPlayer,
      phase: bothDone ? 'whirlwindMovement' : 'activation',
    });

    addLogs([
      ...(expire?.logs ?? []),
      { text: `Активация завершена.`, step: 'Шаг 8' },
      ...(bothDone
        ? [{ text: 'Все миниатюры активированы — переход к Фазе V.', step: 'Фаза IV' }]
        : [{ text: `Следующая активация: ${playerTitle(nextPlayer)}.`, step: 'Фаза IV' }]),
    ]);
  },

  moveWhirlwinds: () => {
    const state = get();
    // Правило Фазы V: Вихри двигаются только в «Движение Вихрей».
    if (state.phase !== 'whirlwindMovement') {
      log('Эфирные Вихри двигаются только в Фазе V.', 'Фаза V');
      return;
    }

    const moved = state.whirlwinds.map(whirlwind =>
      moveWhirlwind(whirlwind, { inBounds }),
    );

    set({
      whirlwinds: moved.map(item => item.whirlwind),
      stats: {
        ...state.stats,
        player1: {
          ...state.stats.player1,
          whirlwindsRemoved: state.stats.player1.whirlwindsRemoved,
        },
      },
    });

    addLogs(moved.map(item => ({ text: item.log, step: 'Фаза V' })));
  },

  endTurn: () => {
    const state = get();
    if (state.phase === 'activation') {
      set({ phase: 'whirlwindMovement', activeUnitId: null, activation: null, reachable: [] });
      log('Активация прервана, переход к Фазе V.', 'Фаза IV');
      return;
    }
    get().advancePhase();
  },

  finishMatch: () => {
    const state = get();
    const score = scoreMatch(state.scenario, state.stats);

    set({
      score,
      matchFinished: true,
      phase: 'endOfTurn',
      activeUnitId: null,
      activation: null,
      reachable: [],
    });

    addLogs([
      {
        text: `Партия завершена. Победные Очки: Игрок 1 — ${Math.min(MAX_VP, clampVp(score.player1))}, Игрок 2 — ${Math.min(MAX_VP, clampVp(score.player2))}.`,
        step: 'Подсчёт VP',
      },
      {
        text:
          score.winner === 'draw'
            ? 'Ничья!'
            : `Побеждает ${playerTitle(score.winner)}!`,
        step: 'Подсчёт VP',
      },
    ]);
  },
}));

/** Текущий набор действий активной миниатюры — удобно для интерфейса. */
export const activeActions = (state: GameState): ActionTile[] => {
  const unit = state.units.find(item => item.id === state.activeUnitId);
  if (!unit) return [];
  return actionsFor(unit, terrainAt(state.terrain, unit.position));
};

/** Погибшие миниатюры игрока — для сценариев и панели потерь. */
export const deadUnitsOf = (units: Unit[], player: PlayerId): Unit[] =>
  units.filter(unit => unit.player === player && (unit.dead || unit.hp <= 0));

/** Сумма очков потерь игрока (правило «больше потерь»). */
export const playerLosses = (units: Unit[], player: PlayerId): number =>
  lossesPoints(deadUnitsOf(units, player));

export type { AttackResult, StateMarker };
