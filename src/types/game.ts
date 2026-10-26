/**
 * Типы данных настольной игры Tornscape: Эфирные Экспедиции.
 *
 * Модель повторяет структуру правил (rulebook.torn-world.com):
 *  - четыре вида Костей Торна и значения на их гранях;
 *  - размеры миниатюр (Пехотная / Крупная / Большая / Огромная);
 *  - Плитки Действий с Пулом Кубиков, значением Урона и Маркерами Времени;
 *  - Маркеры Состояний и Статусы;
 *  - Эфирные Вихри, Кристаллы Эфира и Маркеры Веры;
 *  - Сценарии с Победными Очками.
 */

export type HexCoord = { q: number; r: number };

/** Владелец миниатюры. Принадлежность хранится явно, а не выводится из фракции:
 *  оба игрока могут собрать ростер из одной и той же фракции. */
export type PlayerId = 'player1' | 'player2';

/**
 * Размер Миниатюры. Влияет на движение, укрытие, выталкивание и получение
 * Маркеров Состояний (Огромные миниатюры почти не получают их).
 */
export type MiniSize = 'infantry' | 'largeInfantry' | 'big' | 'huge';

export const MINI_SIZE_LABEL: Record<MiniSize, string> = {
  infantry: 'Пехотная',
  largeInfantry: 'Крупная Пехотная',
  big: 'Большая',
  huge: 'Огромная',
};

/**
 * Четыре вида Костей Торна.
 *  - attack  — Кубик Атаки (красный), определяет степень успеха действия;
 *  - defense — Кубик Защиты (белый), отменяет успехи атаки;
 *  - agility — Кубик Ловкости (зелёный), даёт перебросы;
 *  - mastery — Кубик Мастерства (чёрный), удваивает урон.
 */
export type DieType = 'attack' | 'defense' | 'agility' | 'mastery';

/**
 * Значение на грани:
 *  - success  — Успех;
 *  - critical — Критический Успех (только Атака и Защита);
 *  - blank    — Ничего.
 */
export type DieFace = 'success' | 'critical' | 'blank';

export type DieResult = {
  /** Уникальный идентификатор кубика внутри броска (нужен для интерфейса). */
  id: string;
  type: DieType;
  face: DieFace;
};

/** Пул Кубиков: сколько кубиков каждого вида бросается одновременно. */
export type DicePool = {
  attack: number;
  agility: number;
  mastery: number;
  defense?: number;
};

/** Пул Кубиков Защиты из пиктограммы щита на Карточке Миниатюры. */
export type DefensePool = {
  defense: number;
  agility: number;
};

/** Виды Урона (глава «Бой → Виды урона»). */
export type DamageType =
  | 'physical'
  | 'fire'
  | 'cold'
  | 'electric'
  | 'poison'
  | 'mental'
  | 'ether';

export const DAMAGE_TYPE_LABEL: Record<DamageType, string> = {
  physical: 'Физический',
  fire: 'Огненный',
  cold: 'Холод',
  electric: 'Электрический',
  poison: 'Ядовитый',
  mental: 'Ментальный',
  ether: 'Эфирный',
};

/**
 * Маркеры Состояний (кубик состояний, 6 граней).
 * Эффекты срабатывают на «Шаге 4: Срабатывание Маркеров Состояний».
 */
export type StateMarker =
  | 'burning'
  | 'slowed'
  | 'poisoned'
  | 'stunned'
  | 'bleeding'
  | 'panic';

export const STATE_MARKER_LABEL: Record<StateMarker, string> = {
  burning: 'Горение',
  slowed: 'Замедление',
  poisoned: 'Отравление',
  stunned: 'Оглушение',
  bleeding: 'Кровотечение',
  panic: 'Паника',
};

export const STATE_MARKER_ICON: Record<StateMarker, string> = {
  burning: '🔥',
  slowed: '🐌',
  poisoned: '☠️',
  stunned: '💫',
  bleeding: '🩸',
  panic: '😱',
};

/** Порядок граней кубика состояний — используется для случайного маркера. */
export const STATE_MARKER_ORDER: StateMarker[] = [
  'burning',
  'slowed',
  'poisoned',
  'stunned',
  'bleeding',
  'panic',
];

/**
 * Статусы миниатюр. Статус — не Маркер: правила, работающие с Маркерами,
 * на него не влияют.
 */
export type MiniStatus = 'rampage' | 'hunger' | 'blinded' | 'flammable';

export const MINI_STATUS_LABEL: Record<MiniStatus, string> = {
  rampage: 'Разгул',
  hunger: 'Голод',
  blinded: 'Ослеплён',
  flammable: 'Горючий',
};

/** Домены (для Маркеров Веры и приверженности Вихрей). */
export type DomainSlug = 'torgvar' | 'otraaks' | 'rouna' | 'noktiis';

export const DOMAIN_LABEL: Record<DomainSlug, string> = {
  torgvar: 'Торгвар',
  otraaks: 'Отраакс',
  rouna: 'Роуна',
  noktiis: 'Ноктиис',
};

/** Враждебные пары доменов: приверженность Вихря определяет, кому он мешает. */
export const HOSTILE_DOMAINS: Record<DomainSlug, DomainSlug> = {
  torgvar: 'otraaks',
  otraaks: 'torgvar',
  rouna: 'noktiis',
  noktiis: 'rouna',
};

/**
 * Вид Плитки Действия. Реакции (Защита, Встречная Атака) помечены отдельно:
 * их можно заявлять только неактивированной миниатюрой.
 */
export type ActionKind =
  | 'step'
  | 'run'
  | 'concentrate'
  | 'defend'
  | 'investigate'
  | 'takeItem'
  | 'meleeAttack'
  | 'rangedAttack'
  | 'healWounds'
  | 'counterAttack';

export const ACTION_LABEL: Record<ActionKind, string> = {
  step: 'Шаг',
  run: 'Бег',
  concentrate: 'Концентрация',
  defend: 'Защита',
  investigate: 'Исследовать',
  takeItem: 'Взять предмет',
  meleeAttack: 'Атака ближнего боя',
  rangedAttack: 'Дистанционная атака',
  healWounds: 'Перевязать раны',
  counterAttack: 'Встречная атака',
};

/**
 * Плитка Действия Миниатюры.
 * 1 — дистанция, 2 — название, 3 — Маркеры Времени (стоимость),
 * 5 — значение Урона, 6 — Пул Кубиков, 7 — свойства.
 */
export type ActionTile = {
  id: string;
  name: string;
  kind: ActionKind;
  /** Стоимость в Маркерах Времени (1 или 2, у Реакций — тоже 1). */
  timeCost: number;
  /** Максимальная дистанция в гексах (для движения — дистанция перемещения). */
  range: number;
  /** Реакция заявляется только неактивированной миниатюрой. */
  reaction?: boolean;
  /** Значение Урона за каждый успешный Кубик Атаки. 0 — атака без урона. */
  damage?: number;
  damageType?: DamageType;
  /** Пул Кубиков, который бросается при выполнении действия. */
  pool?: DicePool;
  /** Эфирная Атака (пиктограмма «Эфирная»). */
  ether?: boolean;
  /** Маркер Состояния, который накладывается при Критическом Уроне. */
  effectOnCritical?: StateMarker;
  /** Атака без Урона: цель не совершает Бросок Защиты. */
  noDamageAttack?: boolean;
  /** Стоимость в Маркерах Веры (Действия за Веру). */
  faithCost?: { domain: DomainSlug; amount: number };
  /** Действие доступно только как Свободная Атака (например, «Штурмовое»). */
  assault?: boolean;
  description?: string;
};

/**
 * Миниатюра на игровом поле.
 *
 * Поля `hp/maxHp/size/defensePool/attackTiles` — статические параметры карточки,
 * остальные поля меняются в ходе партии.
 */
export type Unit = {
  id: string;
  name: string;
  player: PlayerId;
  /** Слаг фракции из БД (krigmark, angelin, ...). */
  faction: string;
  /** Портрет юнита из каталога: на поле заменяет подпись из первых букв. */
  imageUrl: string | null;
  position: HexCoord;

  size: MiniSize;
  hp: number;
  maxHp: number;
  /** Дистанция действий «Шаг» и «Бег», в гексах. */
  movement: number;
  /** Пул Кубиков Защиты (пиктограмма щита). */
  defensePool: DefensePool;
  /** Доступные Плитки Действий (атаки + стандартные). */
  attackTiles: ActionTile[];
  /** Лидер Экспедиции: его гибель triggers Тест на Панику у всего отряда. */
  isLeader: boolean;
  /** Стоимость в очках — нужна для подсчёта потерь и сценариев. */
  points: number;
  /** Домен фракции: определяет цвет Маркеров Веры. */
  domain?: DomainSlug;

  // --- изменяемое состояние в партии ---
  /** Текущие Маркеры Времени (при активации выдаётся 2, максимум 3). */
  timeMarkers: number;
  /** Активирована ли миниатюра в текущем ходу. */
  activated: boolean;
  /** Сколько раз миниатюру реактивировали в этом ходу (не более одного раза). */
  reactivations: number;
  /** Маркеры Состояний (не более одного каждого вида). */
  stateMarkers: StateMarker[];
  /** Статусы (не более одного каждого вида). */
  statuses: MiniStatus[];
  /** Бонус кубиков от «Концентрации» к следующему Действию. */
  concentration: number;
  /** Бонус Кубиков Защиты от Реакции «Защита» до конца активации. */
  defenseBonus: number;
  /** id врагов, по которым миниатюра уже совершила Свободную Атаку в эту активацию. */
  freeAttacksUsed: string[];
  /** Признак того, что миниатюра убита (убирается с поля, но остаётся в списке). */
  dead?: boolean;
  /**
   * Шаг 3 «Расстановка»: миниатюра уже выставлена в зоне расстановки.
   * До выставления миниатюра не показывается на поле, не блокирует гексы
   * и не может быть активирована.
   */
  deployed: boolean;
  /**
   * Резерв: миниатюра не поместилась в зону расстановки (или игрок сам
   * отправил её туда). Активируется из Резерва по правилам scenario.txt.
   */
  reserve: boolean;
};

/**
 * Запись ростера, приходящая из ArmyBuilder: шаблон юнита из БД
 * плюс слаг его фракции. Координат здесь нет — их выдаёт `gameStore`.
 */
export type RosterUnitInput = {
  id: string;
  name: string;
  factionSlug?: string;
  /** Портрет юнита (image_path из каталога armybuilder). */
  imageUrl?: string;
  domain?: DomainSlug;
  size: MiniSize;
  maxHp: number;
  movement: number;
  defensePool: DefensePool;
  attackTiles: ActionTile[];
  isLeader?: boolean;
  points: number;
};

/**
 * Виды Ландшафта.
 *  - ruins/etherCrystals — Объёмный Ландшафт (даёт Укрытие, занимает 1 гексон);
 *  - flame/swamp/quicksand/deepWater — Опасный Ландшафт.
 */
export type TerrainType =
  | 'plain'
  | 'ruins'
  | 'etherCrystals'
  | 'flame'
  | 'swamp'
  | 'quicksand'
  | 'deepWater';

export type TerrainData = {
  type: TerrainType;
  /** Бонус Кубиков Защиты от укрытия (для Объёмного Ландшафта — 0: укрытие
   *  работает через невидимость, а не через бонусные кубики). */
  coverBonus: number;
};

export const TERRAIN_LABEL: Record<TerrainType, string> = {
  plain: 'Равнина',
  ruins: 'Руины Весторна',
  etherCrystals: 'Кристаллы Эфирита',
  flame: 'Пламенная Земля',
  swamp: 'Губительная Топь',
  quicksand: 'Зыбучие Пески',
  deepWater: 'Глубокая Вода',
};

export const TERRAIN_ICON: Record<TerrainType, string> = {
  plain: '',
  ruins: '🛡️',
  etherCrystals: '💎',
  flame: '🔥',
  swamp: '☠️',
  quicksand: '🌀',
  deepWater: '🌊',
};

/** Объёмный Ландшафт даёт Укрытие (цель пропадает из видимости). */
export const isCoverTerrain = (type: TerrainType): boolean =>
  type === 'ruins' || type === 'etherCrystals';

/** Опасный Ландшафт срабатывает при входе/начале/конце активации. */
export const isHazardTerrain = (type: TerrainType): boolean =>
  type === 'flame' || type === 'swamp' || type === 'quicksand' || type === 'deepWater';

/** Эфирный Вихрь: запас Эфира, приверженность и домен. */
export type Whirlwind = {
  id: string;
  /** Гексон, который занимает вихрь (центр «цветка» из 7 гексов). */
  position: HexCoord;
  etherCrystals: number;
  /** Приверженность: чей игрок контролирует вихрь (null — нейтрален). */
  allegiance: PlayerId | null;
  /** Домен, к которому вихрь привержен. */
  domain: DomainSlug | null;
  /** Вихрь-смерч (сценарий 16): приверженность определяется при каждом взаимодействии. */
  isMaelstrom?: boolean;
  /** Вихрь из схемы сценария: двигается только по правилам сценария. */
  special?: boolean;
};

/**
 * Идентификатор зоны расстановки. У каждого сценария две зоны: одну выбирает
 * Атакующий Игрок (Шаг 3), во вторую выставляется его противник.
 */
export type DeploymentZoneId = 'west' | 'east';

export type DeploymentZone = {
  id: DeploymentZoneId;
  /** Игрок, который выставляется в этой зоне (назначается на Шаге 3). */
  player: PlayerId | null;
  /** Гексоны (центры) зоны расстановки согласно схеме сценария. */
  hexsons: HexCoord[];
};

/**
 * Этапы подготовки партии (Шаги 1–3 structure_game.txt).
 *  - scenario   — выбран сценарий, поле ещё не подготовлено;
 *  - initiative — Шаг 2: бросок инициативы тремя Кубиками Атаки;
 *  - attacker   — победитель инициативы выбирает Атакующего Игрока;
 *  - zone       — Атакующий Игрок выбирает зону расстановки;
 *  - deployment — Шаг 3: поочерёдное выставление миниатюр и Резерв;
 *  - complete   — подготовка завершена, начинается первый Ход.
 */
export type SetupStage =
  | 'scenario'
  | 'initiative'
  | 'attacker'
  | 'zone'
  | 'deployment'
  | 'complete';

export const SETUP_STAGE_LABEL: Record<SetupStage, string> = {
  scenario: 'Шаг 1: Подготовка к игре',
  initiative: 'Шаг 2: Определение Инициативы',
  attacker: 'Шаг 2: Выбор Атакующего Игрока',
  zone: 'Шаг 3: Зона расстановки',
  deployment: 'Шаг 3: Расстановка',
  complete: 'Подготовка завершена',
};

/** Маркер Сценария: Переносимый, Связанный, Пленник или общий. */
export type ScenarioMarkerKind = 'portable' | 'bound' | 'prisoner' | 'common';

/**
 * Иконки Маркеров Сценария (scenario.txt, раздел «Маркеры Сценария»):
 *  - Переносимый — миниатюра может нести его с собой;
 *  - Связанный — снимается только при выполнении условия сценария;
 *  - Пленник — «Общий Маркер», забирается действием «Взять Предмет»;
 *  - Общий — переворачивается и открывает свою сторону по правилам сценария.
 */
export const SCENARIO_MARKER_ICON: Record<ScenarioMarkerKind, string> = {
  portable: '🎒',
  bound: '⛓️',
  prisoner: '🧍',
  common: '❔',
};

export const SCENARIO_MARKER_LABEL: Record<ScenarioMarkerKind, string> = {
  portable: 'Переносимый Маркер',
  bound: 'Связанный Маркер',
  prisoner: 'Пленник (Общий Маркер)',
  common: 'Общий Маркер',
};

export type ScenarioMarker = {
  id: string;
  kind: ScenarioMarkerKind;
  position: HexCoord;
  /** Союзный/вражеский статус маркера. */
  owner: PlayerId | null;
  /** id миниатюры-носителя (для Переносимых и Связанных). */
  carrierUnitId: string | null;
  /** Исходная принадлежность по схеме сценария (для «Саботажа»). */
  homeOwner?: PlayerId | null;
};

/** Фазы Хода (Фазы I–VI). */
export type TurnPhase =
  | 'startOfTurn'
  | 'drawGodCard'
  | 'initiative'
  | 'activation'
  | 'whirlwindMovement'
  | 'endOfTurn';

export const TURN_PHASE_LABEL: Record<TurnPhase, string> = {
  startOfTurn: 'Фаза I: Начало хода',
  drawGodCard: 'Фаза II: Взятие карты Богов',
  initiative: 'Фаза III: Бросок инициативы',
  activation: 'Фаза IV: Активация миниатюр',
  whirlwindMovement: 'Фаза V: Движение вихрей',
  endOfTurn: 'Фаза VI: Конец хода',
};

/** Шаги Активации (1–8). */
export type ActivationStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Результат броска на Инициативу (3 Кубика Атаки). */
export type InitiativeRoll = {
  player: PlayerId;
  dice: DieResult[];
  criticals: number;
  successes: number;
};

/** Запись в журнале партии. */
export type BattleLog = {
  id: string;
  text: string;
  timestamp: number;
  /** Шаг правил, к которому относится запись (для обучающего лога). */
  step?: string;
};
