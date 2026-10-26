/**
 * Подготовка Игрового Поля по правилам (structure_game.txt, scenario.txt).
 *
 * Шаг 1 «Подготовка к игре»: игроки выбирают Сценарий и располагают на поле
 * все необходимые элементы согласно «Схеме Расстановки» карточки сценария:
 *  - Элементы Ландшафта (Объёмный и Опасный);
 *  - Эфирные Вихри (с указанным запасом Эфира);
 *  - Маркеры Сценария (Переносимые / Связанные / Пленники / Общие);
 *  - Зоны Расстановки обоих игроков.
 *
 * Шаг 3 «Расстановка»: Атакующий Игрок выбирает одну из двух зон, после чего
 * игроки поочерёдно выставляют по одной Миниатюре. Здесь же описаны
 * геометрические проверки зоны (`zoneHexKeys`, `fitsInZone`).
 *
 * Схемы заданы декларативно, потому что картинки схем в правилах — растровые:
 * каждая схема описывает состав элементов и их взаимное расположение
 * (центр / кольцо вокруг центра / половины поля / зоны расстановки).
 */

import type {
  DeploymentZone,
  DeploymentZoneId,
  HexCoord,
  PlayerId,
  ScenarioMarker,
  ScenarioMarkerKind,
  TerrainData,
  TerrainType,
  Whirlwind,
} from '../types/game';
import { HEXSON_DIRS, hexKey, hexToPixel, hexesOfHexson } from './hex';
import { createWhirlwind } from './whirlwinds';
import type { ScenarioId } from './scenarios';

/** Где именно схема сценария размещает группу маркеров. */
export type MarkerPlacement =
  /** Центральный Гексон поля. */
  | 'center'
  /** Кольцо Гексонов вокруг центрального. */
  | 'innerRing'
  /** Половина маркеров в западной части поля, половина — в восточной. */
  | 'splitSides'
  /** Внутри Зон Расстановки (по одному на зону). */
  | 'zones';

export type MarkerSpec = {
  kind: ScenarioMarkerKind;
  count: number;
  placement: MarkerPlacement;
  /** Владелец маркера по схеме (сценарии 6 и 14 размечают стороны цветом). */
  owner?: PlayerId | null;
  /** Подпись для легенды поля. */
  label: string;
};

/** «Схема Расстановки» сценария. */
export type ScenarioScheme = {
  /** Доля ширины поля (по горизонтали) под каждую Зону Расстановки. */
  zoneShare: number;
  /** Вид Объёмного Ландшафта схемы: все элементы одного вида (правило игры). */
  coverKind: 'ruins' | 'etherCrystals';
  coverCount: number;
  /** Опасный Ландшафт схемы: вид и число гексов. */
  hazard: { kind: TerrainType; count: number } | null;
  /** Эфирные Вихри на начало игры. */
  whirlwinds: { count: number; ether: number; maelstrom?: boolean; special?: boolean };
  markers: MarkerSpec[];
  /** Специальные правила сценария, влияющие на подготовку и ход партии. */
  notes: string[];
};

/** Маркер-пленник схемы: «Общий Маркер» со сторонами доменов. */
const PRISONERS = (count: number): MarkerSpec => ({
  kind: 'prisoner',
  count,
  placement: 'splitSides',
  owner: null,
  label: 'Пленник («Общий Маркер»)',
});

export const SCENARIO_SCHEMES: Record<ScenarioId, ScenarioScheme> = {
  meetingEngagement: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 3,
    hazard: { kind: 'quicksand', count: 2 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [],
    notes: ['В сценарии нет специальных правил: расположите ландшафт по схеме и начинайте игру.'],
  },

  lostRelic: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 4,
    hazard: { kind: 'flame', count: 3 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [
      {
        kind: 'common',
        count: 4,
        placement: 'innerRing',
        owner: null,
        label: 'Хранилище реликвии (4 маркера, по одному на Домен)',
      },
    ],
    notes: [
      'Перед началом перемешайте четыре Маркера Сценария (по одному каждого Домена) стороной «Общий Маркер» вверх.',
      'Как только стартовый Эфирный Вихрь теряет последнюю единицу Эфира, положите случайный Маркер в любой Гекс его Гексона.',
      'Действие «Взять Предмет» переворачивает Маркер: «Маркер Торгвара» становится Переносимым, любой другой убирается с поля.',
    ],
  },

  rescue: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 2,
    hazard: { kind: 'swamp', count: 2 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [PRISONERS(3)],
    notes: [
      'Три Маркера Сценария «Общий Маркер» считаются Пленниками.',
      'Контроль над Пленником даёт Миниатюра, связанная с ним.',
      'Убийство Пленника приносит игроку −2 ПО.',
    ],
  },

  bloodAndFlame: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 3,
    hazard: { kind: 'flame', count: 5 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [],
    notes: [
      'После расстановки каждый игрок назначает Лейтенанта: Миниатюра не менее 20 очков, не Лидер.',
      'Затем каждый игрок назначает Сержанта: Миниатюра не менее 10 очков, не Лидер и не Лейтенант.',
      'Лейтенант, Сержант и союзники в пределах 1 Гексона от них проходят Тест на Панику автоматически при потере Лидера.',
    ],
  },

  cursedArtifact: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 2,
    hazard: { kind: 'flame', count: 6 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [
      {
        kind: 'portable',
        count: 4,
        placement: 'innerRing',
        owner: null,
        label: 'Проклятый Артефакт (4 маркера, по одному на Домен)',
      },
    ],
    notes: [
      'Один Маркер кладётся на поле стороной «Общий Маркер», остальные отложите не переворачивая.',
      'Маркер — Переносимый: при первом действии «Взять Предмет» переверните его, свойства зависят от Домена.',
      'Если носитель убирается с поля, Маркер остаётся в любом Гексе, который занимала Миниатюра.',
    ],
  },

  otraaksHarvest: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 4,
    hazard: { kind: 'flame', count: 5 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [
      { kind: 'bound', count: 2, placement: 'splitSides', owner: 'player1', label: 'Маркер Торна (Игрок 1)' },
      { kind: 'bound', count: 2, placement: 'splitSides', owner: 'player2', label: 'Маркер Торна (Игрок 2)' },
    ],
    notes: [
      'Четыре Маркера Сценария «Маркер Торна» считаются Связанными Маркерами.',
      'Синие маркеры принадлежат Игроку 1, зелёные — Игроку 2.',
      'Союзная Миниатюра в смежном Гексе может принять урон Маркера на себя.',
    ],
  },

  wildHunt: {
    zoneShare: 0.22,
    coverKind: 'etherCrystals',
    coverCount: 3,
    hazard: { kind: 'quicksand', count: 2 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [],
    notes: [
      'После расстановки каждый игрок, начиная с того, кто последним выставил все Миниатюры, назначает Цель.',
      'Целью не может быть Лидер Отряда или Миниатюра дешевле 15 Игровых Очков.',
      'Миниатюра-Цель имеет иммунитет к вражеским Картам Богов.',
    ],
  },

  ancientStones: {
    zoneShare: 0.22,
    coverKind: 'etherCrystals',
    coverCount: 4,
    hazard: { kind: 'swamp', count: 2 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [
      {
        kind: 'portable',
        count: 4,
        placement: 'innerRing',
        owner: null,
        label: 'Камень Древних (Торгвар / Отраакс / Роуна / Ноктиис)',
      },
    ],
    notes: [
      'Каждый Маркер — Переносимый и берётся действием «Взять Предмет».',
      'Пока Миниатюра игрока несёт Маркер, игрок контролирует этот Артефакт.',
    ],
  },

  exodus: {
    zoneShare: 0.22,
    coverKind: 'etherCrystals',
    coverCount: 3,
    hazard: { kind: 'swamp', count: 2 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [PRISONERS(3)],
    notes: [
      'Три Маркера Сценария «Общий Маркер» считаются Пленниками.',
      'Пленник в вашей Зоне Расстановки приносит +3 ПО.',
      'Убийство Пленника приносит игроку −2 ПО.',
    ],
  },

  godsHearUs: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 2,
    hazard: { kind: 'swamp', count: 6 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [],
    notes: [
      'Каждый раз, когда с Эфирного Вихря снимается последняя единица Эфира, кладите его рядом с собой, а не в сброс.',
      'В конце сценария убранные Вихри подсчитываются для Победных Очков.',
    ],
  },

  embraceOfDeath: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 2,
    hazard: { kind: 'swamp', count: 8 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [
      {
        kind: 'common',
        count: 1,
        placement: 'center',
        owner: null,
        label: 'Эфирная Нежить (Ноктиис)',
      },
    ],
    notes: [
      'Маркер «Ноктиис» — враждебная обоим игрокам Миниатюра Эфирной Нежити.',
      'В конце каждого Хода Нежить движется к ближайшей Миниатюре и атакует, если может.',
      'Зона Смертоносного Тумана расширяется: в конце 2–3 ходов 1 Гексон, 4–5 ходов 2 Гексона, 6 хода 3 Гексона от длинных краёв — 2 урона и «Отравлен».',
    ],
  },

  source: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 3,
    hazard: { kind: 'swamp', count: 4 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [
      {
        kind: 'common',
        count: 4,
        placement: 'innerRing',
        owner: null,
        label: 'Эфирный Узел',
      },
    ],
    notes: [
      'Маркеры не являются ни Переносимыми, ни Связанными: Миниатюры могут занимать их Гексы.',
      'Гексоны с Маркером считаются Эфирными Узлами; Вихри не могут их занимать.',
      'В конце сценария Узел захвачен игроком с большей суммой стоимости Миниатюр на Гексоне.',
    ],
  },

  domination: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 3,
    hazard: { kind: 'quicksand', count: 2 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [
      { kind: 'common', count: 3, placement: 'innerRing', owner: null, label: 'Маркер Доминации' },
    ],
    notes: [
      'Маркеры нейтральны и не являются Переносимыми или Связанными.',
      'В конце каждого хода Маркер становится союзным, если в его Гексоне только союзные Миниатюры.',
      'Победные Очки за союзные Маркеры начисляются в конце 2, 4 и 6 ходов.',
    ],
  },

  sabotage: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 3,
    hazard: { kind: 'quicksand', count: 2 },
    whirlwinds: { count: 3, ether: 3 },
    markers: [
      { kind: 'common', count: 2, placement: 'splitSides', owner: 'player1', label: 'Маркер Саботажа (Игрок 1)' },
      { kind: 'common', count: 2, placement: 'splitSides', owner: 'player2', label: 'Маркер Саботажа (Игрок 2)' },
    ],
    notes: [
      'Две пары Маркеров двух разных Доменов; Вихри не могут занимать их Гексоны.',
      'В конце Шага III игроки выбирают по две союзные Миниатюры с действием «Взять Предмет» и выдают им «Эфирный Заряд».',
      'В конце каждого хода Маркеры с «Эфирным Зарядом» взрываются: Маркер Состояния и 2 урона в Гексоне и в пределах 1 Гексона.',
    ],
  },

  whirlwindHunter: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 3,
    hazard: { kind: 'quicksand', count: 2 },
    whirlwinds: { count: 3, ether: 3, special: true },
    markers: [],
    notes: [
      'Три Эфирных Вихря с начала игры имеют особые правила: броски приверженности не производятся.',
      'Опустевший Вихрь перестаёт перемещаться в Фазу V и не убирается с поля никакими источниками.',
      'В конце сценария Вихрь без Кристаллов считается захваченным Миниатюрой на его Гексоне.',
    ],
  },

  etherealMaelstrom: {
    zoneShare: 0.22,
    coverKind: 'ruins',
    coverCount: 3,
    hazard: { kind: 'flame', count: 3 },
    whirlwinds: { count: 3, ether: 3, maelstrom: true },
    markers: [],
    notes: [
      'Эфирный Вихрь в центре поля является Эфирным Смерчем.',
      'При каждом взаимодействии Смерч заново определяет приверженность броском.',
      'В конце хода Смерч делает 2 движения: сначала игрок, выигравший инициативу, затем его оппонент.',
    ],
  },
};

export const scenarioScheme = (id: ScenarioId): ScenarioScheme =>
  SCENARIO_SCHEMES[id] ?? SCENARIO_SCHEMES.meetingEngagement;

/** Детерминированный генератор случайных чисел (mulberry32). */
const mulberry32 = (seed: number): (() => number) => {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hashSeed = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const shuffle = <T>(items: T[], random: () => number): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Делит поле на две Зоны Расстановки по горизонтали.
 *
 * Пиксельная координата Гексона линейна по его координатам
 * (`x = size · √3/2 · (2q + r)`), поэтому зоны — это Гексоны у левого и
 * правого края поля. Сетка ромбовидная, и такая полоса повторяет её край.
 */
export const buildDeploymentZones = (
  centers: HexCoord[],
  share = 0.22,
): Record<DeploymentZoneId, HexCoord[]> => {
  if (centers.length === 0) return { west: [], east: [] };

  const withX = centers.map(center => ({ center, x: hexToPixel(center).x }));
  const xs = withX.map(item => item.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const span = maxX - minX || 1;
  const depth = span * share;

  const byX = (a: { x: number; center: HexCoord }, b: { x: number; center: HexCoord }) =>
    a.x - b.x || a.center.r - b.center.r;

  let west = withX.filter(item => item.x <= minX + depth).sort(byX);
  let east = withX.filter(item => item.x >= maxX - depth).sort(byX);

  // Страховка: в крошечной сетке зона не должна оказаться пустой.
  const minimum = Math.min(3, Math.floor(centers.length / 4));
  const sorted = [...withX].sort(byX);
  if (west.length < minimum) west = sorted.slice(0, minimum);
  if (east.length < minimum) east = sorted.slice(sorted.length - minimum);

  return {
    west: west.map(item => item.center),
    east: east.map(item => item.center),
  };
};

/** Гексоны (все 7 гексов) зоны — для подсветки и проверки размера Миниатюры. */
export const zoneHexKeys = (zone: DeploymentZone): Set<string> => {
  const keys = new Set<string>();
  for (const center of zone.hexsons) {
    for (const hex of hexesOfHexson(center)) keys.add(hexKey(hex));
  }
  return keys;
};

/**
 * Проверяет, помещается ли Миниатюра в Зону Расстановки.
 *
 * Пехотная Миниатюра занимает один гекс, Крупная Пехотная и больше — целый
 * Гексон (7 гексов): по правилам такая Миниатюра должна целиком помещаться
 * в пределах зоны расстановки.
 */
export const fitsInZone = (zone: DeploymentZone, hex: HexCoord, size: string): boolean => {
  const keys = zoneHexKeys(zone);
  if (size === 'infantry') return keys.has(hexKey(hex));
  return hexesOfHexson(hex).every(item => keys.has(hexKey(item)));
};

/** Центральный Гексон поля (по среднему пиксельному положению центров). */
const centralHexsonOf = (centers: HexCoord[]): HexCoord => {
  const points = centers.map(center => ({ center, ...hexToPixel(center) }));
  const avgX = points.reduce((total, item) => total + item.x, 0) / points.length;
  const avgY = points.reduce((total, item) => total + item.y, 0) / points.length;

  let best = centers[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const item of points) {
    const dist = (item.x - avgX) ** 2 + (item.y - avgY) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = item.center;
    }
  }
  return best;
};

export type PreparedField = {
  terrain: Map<string, TerrainData>;
  whirlwinds: Whirlwind[];
  markers: ScenarioMarker[];
  /** Зоны расстановки без назначенных игроков (их назначает Шаг 3). */
  zones: DeploymentZone[];
  /** Центральный Гексон схемы — для правил сценариев и подсказок. */
  center: HexCoord;
};

/**
 * Готовит поле по «Схеме Расстановки» выбранного сценария.
 *
 * Ландшафт и вихри расставляются детерминированно (по seed от id сценария),
 * чтобы партию можно было воспроизвести и прогнать в headless-симуляции.
 */
export const prepareScenarioField = (
  scenarioId: ScenarioId,
  hexes: HexCoord[],
  centers: HexCoord[],
): PreparedField => {
  const scheme = scenarioScheme(scenarioId);
  const random = mulberry32(hashSeed(`tornscape:${scenarioId}`));

  const center = centralHexsonOf(centers);
  const zoneSplit = buildDeploymentZones(centers, scheme.zoneShare);
  const zoneCenterKeys = new Set<string>([
    ...zoneSplit.west.map(hexKey),
    ...zoneSplit.east.map(hexKey),
  ]);

  const gridKeys = new Set(hexes.map(hexKey));
  const centerKeys = new Set(centers.map(hexKey));
  const inGrid = (hex: HexCoord) => gridKeys.has(hexKey(hex));

  const terrain = new Map<string, TerrainData>();

  // Объёмный Ландшафт занимает целый Гексон и не ставится в зонах расстановки.
  const coverCandidates = shuffle(
    centers.filter(item => !zoneCenterKeys.has(hexKey(item))),
    random,
  ).slice(0, scheme.coverCount);

  for (const cover of coverCandidates) {
    for (const hex of hexesOfHexson(cover)) {
      if (!inGrid(hex)) continue;
      terrain.set(hexKey(hex), { type: scheme.coverKind, coverBonus: 0 });
    }
  }

  // Опасный Ландшафт — отдельные гексы, не поверх Объёмного и не в зонах.
  if (scheme.hazard && scheme.hazard.count > 0) {
    const zoneHexes = new Set<string>();
    for (const key of zoneCenterKeys) {
      const [q, r] = key.split(',').map(Number);
      for (const hex of hexesOfHexson({ q, r })) zoneHexes.add(hexKey(hex));
    }

    const hazardCandidates = shuffle(
      hexes.filter(hex => !terrain.has(hexKey(hex)) && !zoneHexes.has(hexKey(hex))),
      random,
    ).slice(0, scheme.hazard.count);

    for (const hex of hazardCandidates) {
      terrain.set(hexKey(hex), { type: scheme.hazard.kind, coverBonus: 0 });
    }
  }

  // Эфирные Вихри: вне зон расстановки, ближе к центру поля.
  const whirlwindPool = centers
    .filter(item => !zoneCenterKeys.has(hexKey(item)) && !terrain.has(hexKey(item)))
    .sort(
      (a, b) =>
        (hexToPixel(a).x - hexToPixel(center).x) ** 2 +
        (hexToPixel(a).y - hexToPixel(center).y) ** 2 -
        ((hexToPixel(b).x - hexToPixel(center).x) ** 2 +
          (hexToPixel(b).y - hexToPixel(center).y) ** 2),
    );

  const whirlwindPositions: HexCoord[] = [];
  if (whirlwindPool.length > 0) {
    if (scheme.whirlwinds.maelstrom) whirlwindPositions.push(center);
    for (const candidate of whirlwindPool) {
      if (whirlwindPositions.length >= scheme.whirlwinds.count) break;
      if (whirlwindPositions.some(item => item.q === candidate.q && item.r === candidate.r)) continue;
      whirlwindPositions.push(candidate);
    }
  }

  const whirlwinds: Whirlwind[] = whirlwindPositions.map(position => {
    const whirlwind = createWhirlwind(position, {
      etherCrystals: scheme.whirlwinds.ether,
      isMaelstrom: Boolean(scheme.whirlwinds.maelstrom && hexKey(position) === hexKey(center)),
    });
    return scheme.whirlwinds.special ? { ...whirlwind, special: true } : whirlwind;
  });

  // Маркеры Сценария по схеме.
  const ring = HEXSON_DIRS.map(dir => ({ q: center.q + dir.q, r: center.r + dir.r })).filter(item =>
    centerKeys.has(hexKey(item)),
  );

  const occupied = new Set<string>();
  const markers: ScenarioMarker[] = [];

  const medianX = (() => {
    const xs = centers.map(item => hexToPixel(item).x).sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)] ?? 0;
  })();

  const sidePool = (side: 'west' | 'east'): HexCoord[] =>
    shuffle(
      centers.filter(item => {
        const x = hexToPixel(item).x;
        const key = hexKey(item);
        if (occupied.has(key) || zoneCenterKeys.has(key)) return false;
        return side === 'west' ? x < medianX : x >= medianX;
      }),
      random,
    );

  const zonePool = (side: DeploymentZoneId): HexCoord[] =>
    shuffle(zoneSplit[side].filter(item => !occupied.has(hexKey(item))), random);

  const takeNext = (pool: HexCoord[]): HexCoord | null => {
    for (const candidate of pool) {
      const key = hexKey(candidate);
      if (occupied.has(key)) continue;
      occupied.add(key);
      return candidate;
    }
    return null;
  };

  let splitIndex = 0;

  for (const spec of scheme.markers) {
    for (let i = 0; i < spec.count; i++) {
      let position: HexCoord | null = null;

      switch (spec.placement) {
        case 'center':
          position = takeNext([center]);
          break;
        case 'innerRing':
          position = takeNext(ring);
          break;
        case 'splitSides': {
          const side: 'west' | 'east' = splitIndex % 2 === 0 ? 'west' : 'east';
          splitIndex += 1;
          position = takeNext(sidePool(side)) ?? takeNext(sidePool(side === 'west' ? 'east' : 'west'));
          break;
        }
        case 'zones': {
          const side: DeploymentZoneId = i % 2 === 0 ? 'west' : 'east';
          position = takeNext(zonePool(side));
          break;
        }
      }

      if (!position) continue;
      if (!inGrid(position)) continue;

      markers.push({
        id: `marker-${scenarioId}-${markers.length + 1}`,
        kind: spec.kind,
        position,
        owner: spec.owner ?? null,
        carrierUnitId: null,
        homeOwner: spec.owner ?? null,
      });
    }
  }

  return {
    terrain,
    whirlwinds,
    markers,
    center,
    zones: [
      { id: 'west', player: null, hexsons: zoneSplit.west },
      { id: 'east', player: null, hexsons: zoneSplit.east },
    ],
  };
};

/** Русские названия видов Маркеров — для легенды поля. */
export const MARKER_KIND_LABEL: Record<ScenarioMarkerKind, string> = {
  portable: 'Переносимый',
  bound: 'Связанный',
  prisoner: 'Пленник',
  common: 'Общий',
};
