import { create } from 'zustand';
import type { HexCoord, Unit, TerrainData } from '../types/game';
import { hexKey, reachableHexes, hexDistance, generateHexsonGrid, generateTerrain } from '../lib/hex';
import { rollDice } from '../lib/dice';

type Player = 'player1' | 'player2';

type CombatLog = {
  id: string;
  text: string;
  timestamp: number;
};

const ROWS = 7;
const { hexes: initialHexes, hexsonCenters: initialHexsonCenters } = generateHexsonGrid(ROWS);
const initialTerrain = generateTerrain(initialHexes);

type GameState = {
  grid: HexCoord[];
  hexsonCenters: Set<string>;
  terrain: Map<string, TerrainData>;
  units: Unit[];
  activeUnitId: string | null;
  reachable: HexCoord[];
  currentPlayer: Player;
  hasActivated: boolean;
  logs: CombatLog[];
  
  selectUnit: (id: string | null) => void;
  moveUnit: (id: string, to: HexCoord) => boolean;
  attackUnit: (attackerId: string, targetId: string) => void;
  endTurn: () => void;
};

const factionToPlayer = (faction: string): Player => 
  (faction === 'krigmark' || faction === 'castilia') ? 'player1' : 'player2';

const inBounds = (h: HexCoord) => initialHexes.some(hex => hex.q === h.q && hex.r === h.r);

export const useGameStore = create<GameState>((set, get) => ({
  grid: initialHexes,
  hexsonCenters: initialHexsonCenters,
  terrain: initialTerrain,
  units: [
    { id: 'u1', name: 'Воин Кригмарка',  faction: 'krigmark',
      position: { q: 2, r: 1 }, hp: 3, maxHp: 3,
      movement: 3, attack: 2, defense: 2 },
    { id: 'u2', name: 'Стрелок Ангельна', faction: 'angelin',
      position: { q: 18, r: -2 }, hp: 2, maxHp: 2,
      movement: 2, attack: 3, defense: 1 },
  ],
  activeUnitId: null,
  reachable: [],
  currentPlayer: 'player1',
  hasActivated: false,
  logs: [{ id: 'start', text: 'Игра началась. Ход Игрока 1.', timestamp: Date.now() }],

  selectUnit: (id) => {
    const s = get();
    if (s.hasActivated) return;
    if (!id) return set({ activeUnitId: null, reachable: [] });
    
    const unit = s.units.find(u => u.id === id);
    if (!unit || unit.hp <= 0) return;

    if (factionToPlayer(unit.faction) !== s.currentPlayer) {
      return addLog(`Это не ваш юнит! Сейчас ход ${s.currentPlayer === 'player1' ? 'Игрока 1' : 'Игрока 2'}`);
    }

    const blocked = new Set(
      s.units.filter(u => u.id !== id && u.hp > 0 && factionToPlayer(u.faction) !== s.currentPlayer)
        .map(u => hexKey(u.position)),
    );
    const reachable = reachableHexes(
      unit.position, unit.movement, blocked, inBounds,
    );
    
    const enemiesInRange = s.units.filter(u => 
      u.hp > 0 && 
      factionToPlayer(u.faction) !== s.currentPlayer && 
      hexDistance(unit.position, u.position) <= unit.movement + 1
    ).map(u => u.position);

    set({ activeUnitId: id, reachable: [...reachable, ...enemiesInRange] });
  },

  moveUnit: (id, to) => {
    const s = get();
    const unit = s.units.find(u => u.id === id);
    if (!unit) return false;

    const targetUnit = s.units.find(u => u.hp > 0 && u.position.q === to.q && u.position.r === to.r);
    if (targetUnit) {
      if (factionToPlayer(targetUnit.faction) !== s.currentPlayer) {
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
    logText += `Защита${coverBonus > 0 ? ' (в укрытии +' + coverBonus + ')' : ''}: [${defenseRolls.join(',')}] = ${defenseSum}. `;
    
    if (damage > 0) {
      logText += `💥 Нанесено ${damage} урона!`;
      if (target.hp - damage <= 0) logText += ` ${target.name} уничтожен!`;
    } else {
      logText += `Промах / Заблокировано.`;
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
    const nextPlayer = s.currentPlayer === 'player1' ? 'player2' : 'player1';
    set({
      currentPlayer: nextPlayer,
      hasActivated: false,
      activeUnitId: null,
      reachable: [],
    });
    addLog(`Ход переходит к ${nextPlayer === 'player1' ? 'Игроку 1' : 'Игроку 2'}.`);
  },
}));

function addLog(text: string) {
  useGameStore.setState(s => ({
    logs: [{ id: Math.random().toString(), text, timestamp: Date.now() }, ...s.logs]
  }));
}