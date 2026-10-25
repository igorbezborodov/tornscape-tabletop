import { create } from 'zustand';
import type { HexCoord, PlayerId, RosterUnitInput, Unit, TerrainData } from '../types/game';
import {
  hexKey,
  hexToPixel,
  reachableHexes,
  hexDistance,
  generateHexsonGrid,
  generateTerrain,
} from '../lib/hex';
import { rollDice } from '../lib/dice';

type CombatLog = {
  id: string;
  text: string;
  timestamp: number;
};

const ROWS = 7;
const { hexes: initialHexes, hexsonCenters: initialHexsonCenters } = generateHexsonGrid(ROWS);

/** Доля поля (по горизонтали) от каждого края, где разрешён спавн. */
const SPAWN_ZONE_SHARE = 0.25;

const playerLabel = (player: PlayerId): string =>
  player === 'player1' ? 'Игрока 1' : 'Игрока 2';

const playerTitle = (player: PlayerId): string =>
  player === 'player1' ? 'Игрок 1 (Синие)' : 'Игрок 2 (Красные)';

const inBounds = (h: HexCoord) => initialHexes.some(hex => hex.q === h.q && hex.r === h.r);

const hexPixels = initialHexes.map(hex => ({ hex, ...hexToPixel(hex) }));

/**
 * Подбирает гексы для расстановки армии на одном из краёв поля.
 *
 * Зона спавна вычисляется от фактических границ сгенерированного поля (а не
 * задаётся «магическими» координатами), поэтому юниты всегда попадают на
 * существующие гексы. Внутри зоны предпочтение отдаётся гексам ближе к
 * середине поля по вертикали, а между юнитами выдерживается зазор: сначала
 * пытаемся разнести их на 2 гекса, затем на 1, в крайнем случае ставим рядом.
 */
const pickSpawnHexes = (
  count: number,
  side: 'left' | 'right',
  taken: Set<string>,
): HexCoord[] => {
  if (count <= 0) return [];

  const xs = hexPixels.map(p => p.x);
  const ys = hexPixels.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const span = maxX - minX || 1;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

  const zone = hexPixels.filter(p =>
    side === 'left'
      ? p.x <= minX + span * SPAWN_ZONE_SHARE
      : p.x >= maxX - span * SPAWN_ZONE_SHARE,
  );

  const ordered = [...zone].sort((a, b) => {
    const da = Math.abs(a.y - centerY);
    const db = Math.abs(b.y - centerY);
    if (da !== db) return da - db;
    return side === 'left' ? a.x - b.x : b.x - a.x;
  });

  const chosen: HexCoord[] = [];

  for (const minGap of [2, 1, 0]) {
    for (const candidate of ordered) {
      if (chosen.length >= count) break;

      const key = hexKey(candidate.hex);
      if (taken.has(key)) continue;
      if (chosen.some(h => hexDistance(h, candidate.hex) < minGap)) continue;

      chosen.push(candidate.hex);
      taken.add(key);
    }
    if (chosen.length >= count) break;
  }

  // Страховка: если в зоне спавна не хватило места (очень большой ростер),
  // добираем ближайшие свободные гексы по всему полю, чтобы не потерять юнита.
  if (chosen.length < count) {
    const rest = hexPixels
      .filter(p => !taken.has(hexKey(p.hex)))
      .sort((a, b) =>
        side === 'left'
          ? a.x - b.x || Math.abs(a.y - centerY) - Math.abs(b.y - centerY)
          : b.x - a.x || Math.abs(a.y - centerY) - Math.abs(b.y - centerY),
      );

    for (const candidate of rest) {
      if (chosen.length >= count) break;
      chosen.push(candidate.hex);
      taken.add(hexKey(candidate.hex));
    }
  }

  return chosen;
};

const buildArmy = (
  roster: RosterUnitInput[],
  player: PlayerId,
  side: 'left' | 'right',
  taken: Set<string>,
): Unit[] => {
  const spawns = pickSpawnHexes(roster.length, side, taken);

  return roster.slice(0, spawns.length).map((template, index) => ({
    id: `${player === 'player1' ? 'p1' : 'p2'}-${template.id}-${index}`,
    name: template.name,
    player,
    faction: template.factionSlug ?? 'unknown',
    // null, если у карты нет портрета — тогда поле рисует инициалы.
    imageUrl: template.imageUrl ?? null,
    position: spawns[index],
    hp: template.maxHp,
    maxHp: template.maxHp,
    movement: template.movement,
    attack: template.attack,
    defense: template.defense,
  }));
};

type GameState = {
  grid: HexCoord[];
  hexsonCenters: Set<string>;
  terrain: Map<string, TerrainData>;
  units: Unit[];
  activeUnitId: string | null;
  reachable: HexCoord[];
  currentPlayer: PlayerId;
  hasActivated: boolean;
  logs: CombatLog[];

  /**
   * Стартует новую партию по ростерам из ArmyBuilder: очищает лог, сбрасывает
   * ход и расставляет юнитов на противоположных краях поля.
   */
  startGameWithRosters: (p1Units: RosterUnitInput[], p2Units: RosterUnitInput[]) => void;
  /** Возвращает игру в исходное состояние (экран сборки). */
  resetGame: () => void;

  selectUnit: (id: string | null) => void;
  moveUnit: (id: string, to: HexCoord) => boolean;
  attackUnit: (attackerId: string, targetId: string) => void;
  endTurn: () => void;
};

const createNewLog = (text: string): CombatLog => ({
  id: Math.random().toString(36).slice(2),
  text,
  timestamp: Date.now(),
});

export const useGameStore = create<GameState>((set, get) => ({
  grid: initialHexes,
  hexsonCenters: initialHexsonCenters,
  terrain: generateTerrain(initialHexes),
  units: [],
  activeUnitId: null,
  reachable: [],
  currentPlayer: 'player1',
  hasActivated: false,
  logs: [],

  startGameWithRosters: (p1Units, p2Units) => {
    const taken = new Set<string>();
    const army1 = buildArmy(p1Units, 'player1', 'left', taken);
    const army2 = buildArmy(p2Units, 'player2', 'right', taken);

    set({
      // Новое поле — новые укрытия, чтобы партии не были одинаковыми
      terrain: generateTerrain(initialHexes),
      units: [...army1, ...army2],
      currentPlayer: 'player1',
      hasActivated: false,
      activeUnitId: null,
      reachable: [],
      logs: [
        createNewLog(
          `Игра началась! Игрок 1 выставил ${army1.length} юн., Игрок 2 — ${army2.length} юн.`,
        ),
      ],
    });
  },

  resetGame: () =>
    set({
      units: [],
      activeUnitId: null,
      reachable: [],
      currentPlayer: 'player1',
      hasActivated: false,
      logs: [],
    }),

  selectUnit: (id) => {
    const s = get();
    if (s.hasActivated) return;
    if (!id) return set({ activeUnitId: null, reachable: [] });

    const unit = s.units.find(u => u.id === id);
    if (!unit || unit.hp <= 0) return;

    if (unit.player !== s.currentPlayer) {
      return addLog(`Это не ваш юнит! Сейчас ход ${playerLabel(s.currentPlayer)}.`);
    }

    // Занятые гексы непроходимы: и свои, и чужие. Атака идёт через
    // список целей в радиусе, а не «шагом» на гекс противника.
    const blocked = new Set(
      s.units.filter(u => u.id !== id && u.hp > 0).map(u => hexKey(u.position)),
    );
    const reachable = reachableHexes(unit.position, unit.movement, blocked, inBounds);

    const enemiesInRange = s.units
      .filter(
        u =>
          u.hp > 0 &&
          u.player !== s.currentPlayer &&
          hexDistance(unit.position, u.position) <= unit.movement + 1,
      )
      .map(u => u.position);

    set({ activeUnitId: id, reachable: [...reachable, ...enemiesInRange] });
  },

  moveUnit: (id, to) => {
    const s = get();
    const unit = s.units.find(u => u.id === id);
    if (!unit) return false;

    const targetUnit = s.units.find(
      u => u.hp > 0 && u.position.q === to.q && u.position.r === to.r,
    );
    if (targetUnit) {
      if (targetUnit.player !== s.currentPlayer) {
        get().attackUnit(id, targetUnit.id);
        return true;
      }
      return false;
    }

    const isOk = s.reachable.some(h => h.q === to.q && h.r === to.r);
    if (!isOk) return false;

    set({
      units: s.units.map(u => (u.id === id ? { ...u, position: to } : u)),
      activeUnitId: null,
      reachable: [],
      hasActivated: true,
    });
    addLog(`${unit.name} переместился.`);
    return true;
  },

  attackUnit: (attackerId, targetId) => {
    const s = get();
    const attacker = s.units.find(u => u.id === attackerId);
    const target = s.units.find(u => u.id === targetId);
    if (!attacker || !target) return;

    const targetTerrain = s.terrain.get(hexKey(target.position));
    const coverBonus = targetTerrain ? targetTerrain.coverBonus : 0;

    const attackRolls = rollDice(attacker.attack, 6);
    const defenseRolls = rollDice(target.defense + coverBonus, 6);

    const attackSum = attackRolls.reduce((a, b) => a + b, 0);
    const defenseSum = defenseRolls.reduce((a, b) => a + b, 0);

    const damage = Math.max(0, attackSum - defenseSum);

    let logText = `${attacker.name} атакует ${target.name}. `;
    logText += `Атака: [${attackRolls.join(',')}] = ${attackSum}. `;
    logText += `Защита${coverBonus > 0 ? ` (в укрытии +${coverBonus})` : ''}: [${defenseRolls.join(',')}] = ${defenseSum}. `;

    if (damage > 0) {
      logText += `💥 Нанесено ${damage} урона!`;
      if (target.hp - damage <= 0) logText += ` ${target.name} уничтожен!`;
    } else {
      logText += 'Промах / Заблокировано.';
    }

    set({
      units: s.units.map(u =>
        u.id === targetId ? { ...u, hp: Math.max(0, u.hp - damage) } : u,
      ),
      activeUnitId: null,
      reachable: [],
      hasActivated: true,
    });
    addLog(logText);
  },

  endTurn: () => {
    const s = get();
    const nextPlayer: PlayerId = s.currentPlayer === 'player1' ? 'player2' : 'player1';
    set({
      currentPlayer: nextPlayer,
      hasActivated: false,
      activeUnitId: null,
      reachable: [],
    });
    addLog(`Ход переходит к ${playerLabel(nextPlayer)}.`);
  },
}));

/** Текущий игрок в читаемом виде — используется в UI. */
export { playerTitle };

function addLog(text: string) {
  useGameStore.setState(s => ({
    logs: [createNewLog(text), ...s.logs],
  }));
}
