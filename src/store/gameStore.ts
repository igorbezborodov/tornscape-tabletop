import { create } from 'zustand';
import type { HexCoord, Unit } from '../types/game';
import { hexKey, reachableHexes, hexDistance } from '../lib/hex';
import { rollDice } from '../lib/dice';

type Player = 'player1' | 'player2';

type CombatLog = {
  id: string;
  text: string;
  timestamp: number;
};

type GameState = {
  gridSize: { cols: number; rows: number };
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

// Пока привяжем фракции к игрокам жестко для прототипа
const factionToPlayer = (faction: string): Player => 
  (faction === 'krigmark' || faction === 'castilia') ? 'player1' : 'player2';

const inBounds = (h: HexCoord, s: { cols: number; rows: number }) =>
  h.q >= 0 && h.q < s.cols && h.r >= 0 && h.r < s.rows;

export const useGameStore = create<GameState>((set, get) => ({
  gridSize: { cols: 6, rows: 6 },
  units: [
    { id: 'u1', name: 'Воин Кригмарка',  faction: 'krigmark',
      position: { q: 1, r: 1 }, hp: 3, maxHp: 3,
      movement: 3, attack: 2, defense: 2 },
    { id: 'u2', name: 'Стрелок Ангельна', faction: 'angelin',
      position: { q: 4, r: 4 }, hp: 2, maxHp: 2,
      movement: 2, attack: 3, defense: 1 },
  ],
  activeUnitId: null,
  reachable: [],
  currentPlayer: 'player1',
  hasActivated: false,
  logs: [{ id: 'start', text: 'Игра началась. Ход Игрока 1.', timestamp: Date.now() }],

  selectUnit: (id) => {
    const s = get();
    if (s.hasActivated) return; // Нельзя выбирать юнитов после действия
    if (!id) return set({ activeUnitId: null, reachable: [] });
    
    const unit = s.units.find(u => u.id === id);
    if (!unit || unit.hp <= 0) return;

    // Проверяем, принадлежит ли юнит текущему игроку
    if (factionToPlayer(unit.faction) !== s.currentPlayer) {
      return addLog(`Это не ваш юнит! Сейчас ход ${s.currentPlayer === 'player1' ? 'Игрока 1' : 'Игрока 2'}`);
    }

    // Считаем зону движения (с учетом врагов, но не учитывая союзников, чтобы можно было пройти сквозь них)
    const blocked = new Set(
      s.units.filter(u => u.id !== id && u.hp > 0 && factionToPlayer(u.faction) !== s.currentPlayer)
        .map(u => hexKey(u.position)),
    );
    const reachable = reachableHexes(
      unit.position, unit.movement, blocked,
      h => inBounds(h, s.gridSize),
    );
    
    // Добавляем в reachable позиции врагов для атаки (чтобы подсветить их красным)
    const enemiesInRange = s.units.filter(u => 
      u.hp > 0 && 
      factionToPlayer(u.faction) !== s.currentPlayer && 
      hexDistance(unit.position, u.position) <= unit.movement + 1 // Атака на 1 дальше движения
    ).map(u => u.position);

    set({ activeUnitId: id, reachable: [...reachable, ...enemiesInRange] });
  },

  moveUnit: (id, to) => {
    const s = get();
    const unit = s.units.find(u => u.id === id);
    if (!unit) return false;

    // Проверяем, не пытаемся ли мы встать на врага
    const targetUnit = s.units.find(u => u.hp > 0 && u.position.q === to.q && u.position.r === to.r);
    if (targetUnit) {
      if (factionToPlayer(targetUnit.faction) !== s.currentPlayer) {
        get().attackUnit(id, targetUnit.id);
        return true;
      }
      return false; // Нельзя вставать на своих
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

    // Бросок атаки и защиты
    const attackRolls = rollDice(attacker.attack, 6);
    const defenseRolls = rollDice(target.defense, 6);
    
    const attackSum = attackRolls.reduce((a, b) => a + b, 0);
    const defenseSum = defenseRolls.reduce((a, b) => a + b, 0);

    const damage = Math.max(0, attackSum - defenseSum);

    let logText = `${attacker.name} атакует ${target.name}. `;
    logText += `Атака: [${attackRolls.join(',')}] = ${attackSum}. `;
    logText += `Защита: [${defenseRolls.join(',')}] = ${defenseSum}. `;
    
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

// Вспомогательная функция для логов
function addLog(text: string) {
  useGameStore.setState(s => ({
    logs: [{ id: Math.random().toString(), text, timestamp: Date.now() }, ...s.logs]
  }));
}