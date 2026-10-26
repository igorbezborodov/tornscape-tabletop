import type { HexCoord, TerrainData, TerrainType } from '../types/game';

export const HEX_SIZE = 60;

export const hexKey = (h: HexCoord) => `${h.q},${h.r}`;

export const hexToPixel = (hex: HexCoord, size = HEX_SIZE) => {
  const x = size * Math.sqrt(3) * (hex.q + hex.r / 2);
  const y = size * 1.5 * hex.r;
  return { x, y };
};

export type Point = { x: number; y: number };

// Шесть вершин гекса (pointy-top)
export const hexCornersAt = (cx: number, cy: number, size = HEX_SIZE): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return points;
};

export const hexCorners = (hex: HexCoord, size = HEX_SIZE): Point[] => {
  const { x, y } = hexToPixel(hex, size);
  return hexCornersAt(x, y, size);
};

export const hexPath = (cx: number, cy: number, size: number): string => {
  const points = hexCornersAt(cx, cy, size).map(p => `${p.x},${p.y}`);
  return `M${points.join(' L')} Z`;
};

export const hexNeighbors = (h: HexCoord): HexCoord[] => {
  const dirs = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 }
  ];
  return dirs.map(d => ({ q: h.q + d.q, r: h.r + d.r }));
};

export const hexDistance = (a: HexCoord, b: HexCoord): number => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
};

/**
 * Вершины гекса в целочисленной решётке вершин.
 *
 * Для раскладки из hexToPixel() нормированная координата вершины равна
 * X = (√3/2)(2q + r + du), Y = (1/2)(3r + dv). Отсюда целочисленный ключ
 * (2q + r + du, 3r + dv): у соседних гексов общие вершины дают одинаковый
 * ключ, поэтому рёбра сопоставляются точно, без погрешности float.
 * Порядок смещений совпадает с порядком точек из hexCorners().
 */
const CORNER_SHIFTS: Array<[number, number]> = [
  [1, -1],
  [1, 1],
  [0, 2],
  [-1, 1],
  [-1, -1],
  [0, -2],
];

type VertexKey = string;

const hexCornerKeys = (hex: HexCoord): VertexKey[] =>
  CORNER_SHIFTS.map(([du, dv]) => `${2 * hex.q + hex.r + du},${3 * hex.r + dv}`);

type Edge = { a: Point; b: Point; ka: VertexKey; kb: VertexKey; count: number };

/**
 * Возвращает внешние контуры гексона (цветка из 7 гексов) как SVG path.
 *
 * Алгоритм: собираем все рёбра гексов, входящих в гексон, и отбрасываем те,
 * что встречаются дважды (они внутренние, между соседними гексами).
 * Оставшиеся рёбра сшиваем в замкнутые ломаные по общим вершинам.
 * Так граница получается точной, без «швов» внутри гексона, а на краях
 * карты контур корректно обрезается по фактически присутствующим гексам.
 */
export const getHexsonOutlinePaths = (
  center: HexCoord,
  isInGrid: (h: HexCoord) => boolean,
  size = HEX_SIZE,
): string[] => {
  const tiles = [center, ...hexNeighbors(center)].filter(isInGrid);
  const edges = new Map<string, Edge>();

  for (const tile of tiles) {
    const corners = hexCorners(tile, size);
    const keys = hexCornerKeys(tile);
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const ka = keys[i];
      const kb = keys[j];
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const existing = edges.get(key);
      if (existing) existing.count += 1;
      else edges.set(key, { a: corners[i], b: corners[j], ka, kb, count: 1 });
    }
  }

  // Внутренние рёбра встречаются дважды — остаются только внешние
  const boundary = Array.from(edges.values()).filter(e => e.count === 1);
  const adjacency = new Map<VertexKey, number[]>();
  boundary.forEach((e, idx) => {
    for (const k of [e.ka, e.kb]) {
      const list = adjacency.get(k);
      if (list) list.push(idx);
      else adjacency.set(k, [idx]);
    }
  });

  const used = new Array<boolean>(boundary.length).fill(false);
  const paths: string[] = [];

  for (let startIdx = 0; startIdx < boundary.length; startIdx++) {
    if (used[startIdx]) continue;

    const start = boundary[startIdx];
    used[startIdx] = true;

    const ring: Point[] = [start.a];
    let currentKey = start.ka;

    // Идём по смежным рёбрам, пока не вернёмся в стартовую вершину
    for (;;) {
      const nextIdx = (adjacency.get(currentKey) ?? []).find(i => !used[i]);
      if (nextIdx === undefined) break;

      used[nextIdx] = true;
      const edge = boundary[nextIdx];
      const fromA = edge.ka === currentKey;
      currentKey = fromA ? edge.kb : edge.ka;

      if (currentKey === start.ka) break;
      ring.push(fromA ? edge.b : edge.a);
    }

    if (ring.length >= 3) {
      paths.push(`M${ring.map(p => `${p.x},${p.y}`).join(' L')} Z`);
    }
  }

  return paths;
};

export const generateHexsonGrid = (hexsonRows: number) => {
  const hexes: HexCoord[] = [];
  const hexsonCenters = new Set<string>();

  const STEP_ALONG = { q: 1, r: 2 };
  const STEP_NEXT_ROW = { q: 3, r: -1 };

  let startQ = 0;
  let startR = 0;

  for (let row = 0; row < hexsonRows; row++) {
    const isEvenRow = row % 2 === 0;
    const cols = isEvenRow ? 6 : 7;

    const shiftQ = isEvenRow ? 0 : -1;
    const shiftR = isEvenRow ? 0 : -2;

    for (let col = 0; col < cols; col++) {
      const centerQ = startQ + col * STEP_ALONG.q + shiftQ;
      const centerR = startR + col * STEP_ALONG.r + shiftR;

      const center = { q: centerQ, r: centerR };
      
      hexes.push(center);
      hexsonCenters.add(hexKey(center));
      hexes.push(...hexNeighbors(center));
    }

    startQ += STEP_NEXT_ROW.q;
    startR += STEP_NEXT_ROW.r;
    
    if (!isEvenRow) {
      startQ -= STEP_ALONG.q;
      startR -= STEP_ALONG.r;
    }
  }
  
  const uniqueHexes = Array.from(new Map(hexes.map(h => [hexKey(h), h])).values());
  return { hexes: uniqueHexes, hexsonCenters };
};

/**
 * Шесть направлений между соседними Гексонами.
 *
 * Гексоны в `generateHexsonGrid` разнесены на расстояние 3 гекса, поэтому
 * соседние центры отличаются на один из этих векторов. Именно эти направления
 * используются правилами «Линия Гексонов» и «Слепая Зона».
 */
export const HEXSON_DIRS: HexCoord[] = [
  { q: 1, r: 2 },
  { q: 3, r: -1 },
  { q: 2, r: -3 },
  { q: -1, r: -2 },
  { q: -3, r: 1 },
  { q: -2, r: 3 },
];

/** Соседние Гексоны (центры). */
export const hexsonNeighbors = (center: HexCoord): HexCoord[] =>
  HEXSON_DIRS.map(d => ({ q: center.q + d.q, r: center.r + d.r }));

/** Индекс направления от `a` к `b`, если они соседние Гексоны; иначе -1. */
export const hexsonDirectionIndex = (a: HexCoord, b: HexCoord): number =>
  HEXSON_DIRS.findIndex(
    d => a.q + d.q === b.q && a.r + d.r === b.r,
  );

/**
 * Ближайший центр Гексона для указанного гекса.
 * Гексы «цветка» принадлежат своему центру, а стыки — ближайшему из центров.
 */
export const hexsonOf = (hex: HexCoord, centers: Set<string>): HexCoord => {
  if (centers.has(hexKey(hex))) return hex;

  let best: { center: HexCoord; dist: number } | null = null;
  for (const key of centers) {
    const [q, r] = key.split(',').map(Number);
    const center = { q, r };
    const dist = hexDistance(hex, center);
    if (!best || dist < best.dist) best = { center, dist };
  }

  return best ? best.center : hex;
};

/** Все гексы, которые занимает Гексон (центр + соседи). */
export const hexesOfHexson = (center: HexCoord): HexCoord[] => [
  center,
  ...hexNeighbors(center),
];

/**
 * Линия Гексонов между двумя центрами (алгоритм линейной интерполяции
 * с округлением в кубических координатах).
 *
 * Используется правилами Видимости: если между Миниатюрой и целью лежит
 * Укрывающий Ландшафт, цель находится в «Слепой Зоне».
 */
export const hexsonLine = (a: HexCoord, b: HexCoord): HexCoord[] => {
  const toCube = (h: HexCoord) => ({ x: h.q, z: h.r, y: -h.q - h.r });
  const fromCube = (c: { x: number; y: number; z: number }): HexCoord => ({
    q: Math.round(c.x),
    r: Math.round(c.z),
  });

  const ca = toCube(a);
  const cb = toCube(b);
  const distance = hexDistance(a, b);
  if (distance === 0) return [a];

  const result: HexCoord[] = [];
  for (let i = 0; i <= distance; i++) {
    const t = i / distance;
    const x = ca.x + (cb.x - ca.x) * t;
    const y = ca.y + (cb.y - ca.y) * t;
    const z = ca.z + (cb.z - ca.z) * t;

    // Округление с сохранением суммы x + y + z = 0
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);
    const dx = Math.abs(rx - x);
    const dy = Math.abs(ry - y);
    const dz = Math.abs(rz - z);

    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;

    result.push(fromCube({ x: rx, y: ry, z: rz }));
  }

  return result;
};

/** Расстояние в Гексонах. */
export const hexsonDistance = (a: HexCoord, b: HexCoord): number =>
  hexDistance(a, b) / 3;

/** Направления на гексы внутри Гексона — для движения по гексам. */
export const hexesInsideHexson = (center: HexCoord, inBounds: (h: HexCoord) => boolean) =>
  hexesOfHexson(center).filter(inBounds);

/**
 * Генерация ландшафта по правилам: Объёмный Ландшафт занимает целый Гексон
 * (1 Гексон = 7 гексов), Опасный Ландшафт — отдельные гексы.
 *
 * Руины Весторна и Кристаллы Эфирита взаимоисключающие в рамках сценария
 * (правило «все элементы Объёмного Ландшафта должны быть одного вида»).
 */
export const generateBattleTerrain = (
  hexes: HexCoord[],
  hexsonCenters: Set<string>,
  options: { coverKind?: 'ruins' | 'etherCrystals'; coverCount?: number } = {},
): Map<string, TerrainData> => {
  const terrain = new Map<string, TerrainData>();
  const coverKind = options.coverKind ?? (Math.random() < 0.5 ? 'ruins' : 'etherCrystals');
  const inGrid = (h: HexCoord) => hexes.some(x => x.q === h.q && x.r === h.r);

  const centers = Array.from(hexsonCenters).map(key => {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
  });

  // Объёмный Ландшафт: целые Гексоны, никогда не в центре поля (расстановка)
  const shuffled = [...centers].sort(() => Math.random() - 0.5);
  const coverCount = options.coverCount ?? Math.max(2, Math.round(centers.length * 0.12));
  const coverCenters = shuffled.slice(0, coverCount);

  for (const center of coverCenters) {
    for (const hex of hexesOfHexson(center)) {
      if (!inGrid(hex)) continue;
      terrain.set(hexKey(hex), { type: coverKind, coverBonus: 0 });
    }
  }

  // Опасный Ландшафт: отдельные гексы (не поверх Объёмного)
  const hazardKinds: TerrainType[] = ['flame', 'swamp', 'quicksand', 'deepWater'];
  for (const hex of hexes) {
    const key = hexKey(hex);
    if (terrain.has(key)) continue;
    if (Math.random() >= 0.06) continue;
    const kind = hazardKinds[Math.floor(Math.random() * hazardKinds.length)];
    terrain.set(key, { type: kind, coverBonus: 0 });
  }

  return terrain;
};

export const reachableHexes = (
  start: HexCoord,
  range: number,
  blocked: Set<string>,
  inBounds: (h: HexCoord) => boolean,
): HexCoord[] => {
  const visited = new Set<string>([hexKey(start)]);
  const result: HexCoord[] = [];
  const queue: Array<{ hex: HexCoord; dist: number }> = [{ hex: start, dist: 0 }];

  while (queue.length > 0) {
    const { hex, dist } = queue.shift()!;
    if (dist >= range) continue;
    for (const n of hexNeighbors(hex)) {
      const k = hexKey(n);
      if (visited.has(k) || blocked.has(k) || !inBounds(n)) continue;
      visited.add(k);
      result.push(n);
      queue.push({ hex: n, dist: dist + 1 });
    }
  }
  return result;
};