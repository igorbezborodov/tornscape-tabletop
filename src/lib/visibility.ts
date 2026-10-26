/**
 * Видимость, Укрытие и Слепые Зоны (глава «Бой → Видимость Миниатюр»).
 *
 * Правила задают «Слепую Зону» геометрически: от Гексона Миниатюры проводятся
 * две Линии Гексонов, касающиеся Укрывающего Ландшафта; всё, что попало внутрь
 * угла между ними, Миниатюру не видит.
 *
 * Реализация:
 *  - `blindZone` возвращает множество Гексонов «Слепой Зоны»;
 *  - `canSee` проверяет, не находится ли цель в Слепой Зоне цели/атакующего;
 *  - `defenseZoneBonus` реализует «Преимущество Больших Миниатюр» (+1 Кубик
 *    Защиты от атак из «Защитной Зоны»).
 */

import type { HexCoord, TerrainType, Unit } from '../types/game';
import {
  HEXSON_DIRS,
  hexDistance,
  hexKey,
  hexsonDirectionIndex,
  hexsonLine,
  hexsonNeighbors,
  hexsonOf,
} from './hex';
import { isCoverTerrain } from '../types/game';

/** Гексоны-Гексоны, занятые Укрывающим Ландшафтом. */
export const coverHexsons = (
  terrain: Map<string, { type: TerrainType }>,
  hexsonCenters: Set<string>,
): Set<string> => {
  const result = new Set<string>();
  for (const key of hexsonCenters) {
    const [q, r] = key.split(',').map(Number);
    const center = { q, r };
    // Гексон считается Укрывающим, если хотя бы его центр — Укрытие.
    const terrainAt = terrain.get(hexKey(center));
    if (terrainAt && isCoverTerrain(terrainAt.type)) result.add(key);
  }
  return result;
};

/**
 * «Слепая Зона» для Пехотной / Крупной Миниатюры, укрывшейся за ландшафтом.
 *
 * Берутся два соседних с укрытием направления «вперёд» (от ландшафта к
 * миниатюре и на один сектор в стороны), и все Гексоны внутри угла между
 * этими Линиями Гексонов считаются Слепой Зоной.
 *
 * Возвращает множество ключей Гексонов. Пустое множество — миниатюра не
 * в Укрытии.
 */
export const blindZone = (
  unitCenter: HexCoord,
  coverCenter: HexCoord,
  limit = 8,
): Set<string> => {
  const away = hexsonDirectionIndex(coverCenter, unitCenter);
  if (away < 0) return new Set();

  // Линии идут от миниатюры: две соседние с направлением «от укрытия».
  const sideA = HEXSON_DIRS[(away + 5) % 6];
  const sideB = HEXSON_DIRS[(away + 1) % 6];

  const zone = new Set<string>();

  const trace = (dir: HexCoord) => {
    let current = unitCenter;
    for (let i = 0; i <= limit; i++) {
      current = { q: current.q + dir.q, r: current.r + dir.r };
      zone.add(hexKey(current));
    }
  };

  trace(sideA);
  trace(sideB);

  // Заполняем сектор между линиями: на каждом шаге удаления внутренние
  // Гексоны получаются смешением векторов sideA и sideB, взятых с весами
  // (step - offset) и offset. Крайние веса уже добавлены через trace().
  for (let step = 2; step <= limit; step++) {
    for (let offset = 1; offset < step; offset++) {
      const mixed: HexCoord = {
        q: unitCenter.q + sideA.q * (step - offset) + sideB.q * offset,
        r: unitCenter.r + sideA.r * (step - offset) + sideB.r * offset,
      };
      zone.add(hexKey(mixed));
    }
  }

  return zone;
};

/**
 * Находится ли Миниатюра в Укрытии относительно указанного направления.
 * Возвращает центр укрывающего Гексона или null.
 */
export const coverSourceFor = (
  unit: Unit,
  hexsonCenters: Set<string>,
  covers: Set<string>,
): HexCoord | null => {
  const center = hexsonOf(unit.position, hexsonCenters);
  const centerKey = hexKey(center);
  if (covers.has(centerKey)) return null; // внутри укрытия стоять нельзя

  const neighbours = hexsonNeighbors(center).filter(n => covers.has(hexKey(n)));
  if (neighbours.length === 0) return null;

  // Огромные миниатюры Укрытия не получают вовсе.
  if (unit.size === 'huge') return null;

  return neighbours[0];
};

export type VisibilityResult = {
  visible: boolean;
  /** Миниатюра сама укрыта за ландшафтом. */
  hidden: boolean;
  /** Цель в Слепой Зоне атакующего. */
  inBlindZone: boolean;
};

/**
 * Проверка видимости цели для атакующего.
 *
 * Правила по размерам:
 *  - Пехотная / Крупная: Слепая Зона — угол между двумя Линиями Гексонов;
 *  - Большая: Слепая Зона — одна Линия Гексонов (узкий сектор);
 *  - Огромная: Укрытия не получает, её видят все.
 */
export const canSee = (
  attacker: Unit,
  target: Unit,
  terrain: Map<string, { type: TerrainType }>,
  hexsonCenters: Set<string>,
): VisibilityResult => {
  const covers = coverHexsons(terrain, hexsonCenters);
  const attackerCenter = hexsonOf(attacker.position, hexsonCenters);
  const targetCenter = hexsonOf(target.position, hexsonCenters);

  if (target.size === 'huge') {
    return { visible: true, hidden: false, inBlindZone: false };
  }

  const cover = coverSourceFor(target, hexsonCenters, covers);
  if (!cover) return { visible: true, hidden: false, inBlindZone: false };

  if (attackerCenter.q === targetCenter.q && attackerCenter.r === targetCenter.r) {
    // В одном Гексоне укрытие не работает (миниатюры видят друг друга).
    return { visible: true, hidden: false, inBlindZone: false };
  }

  if (target.size === 'big') {
    // Большая миниатюра: Слепая Зона — Линия Гексонов к укрытию и дальше.
    const line = hexsonLine(targetCenter, cover);
    const lineBeyond = line.concat(
      line.map((hex, index) => {
        const delta = { q: hex.q - cover.q, r: hex.r - cover.r };
        return { q: hex.q + delta.q * index, r: hex.r + delta.r * index };
      }),
    );
    const inBlind = lineBeyond.some(hex => hexKey(hex) === hexKey(attackerCenter));

    // Преимущество: +1 Кубик Защиты вместо полной невидимости.
    return { visible: !inBlind, hidden: false, inBlindZone: inBlind };
  }

  const zone = blindZone(targetCenter, cover);
  // Сама укрывающаяся миниатюра не видит тех, кто рядом с её укрытием.
  const nearCover = hexsonNeighbors(cover).some(
    n => hexKey(n) === hexKey(attackerCenter),
  );

  const inBlind = nearCover || zone.has(hexKey(attackerCenter));
  return { visible: !inBlind, hidden: false, inBlindZone: inBlind };
};

/**
 * «Преимущество Больших Миниатюр»: +1 Кубик Защиты при нахождении в смежном
 * Гексоне от Укрывающего Ландшафта — но только от атак из «Защитной Зоны».
 *
 * Для прототипа: Большая миниатюра рядом с укрытием получает +1 Кубик Защиты
 * от дистанционных атак, если атакующий находится с той же стороны укрытия.
 */
export const bigMiniatureDefenseBonus = (
  defender: Unit,
  attacker: Unit,
  terrain: Map<string, { type: TerrainType }>,
  hexsonCenters: Set<string>,
): number => {
  if (defender.size !== 'big') return 0;

  const covers = coverHexsons(terrain, hexsonCenters);
  const cover = coverSourceFor(defender, hexsonCenters, covers);
  if (!cover) return 0;

  const attackerCenter = hexsonOf(attacker.position, hexsonCenters);
  const defenderCenter = hexsonOf(defender.position, hexsonCenters);

  // Атакующий должен быть в том же секторе, что и укрытие — тогда он
  // стреляет «из-за» укрытия, и Большая миниатюра получает преимущество.
  const toCover = hexsonDirectionIndex(defenderCenter, cover);
  const toAttacker = hexsonDirectionIndex(defenderCenter, attackerCenter);

  return toCover >= 0 && toCover === toAttacker ? 1 : 0;
};

/** Расстояние между миниатюрами в Гексонах (для дистанционных атак). */
export const hexsonDistanceBetween = (
  a: Unit,
  b: Unit,
  hexsonCenters: Set<string>,
): number =>
  hexDistance(
    hexsonOf(a.position, hexsonCenters),
    hexsonOf(b.position, hexsonCenters),
  ) / 3;

/** Миниатюры смежны (стоят в соседних гексах). */
export const isAdjacent = (a: Unit, b: Unit): boolean =>
  hexDistance(a.position, b.position) === 1;
