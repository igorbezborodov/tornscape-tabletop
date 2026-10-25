import { create } from 'zustand';
import type { HexCoord, Unit } from '../types/game';
import { hexKey, reachableHexes } from '../lib/hex';

type GameState = {
  gridSize: { cols: number; rows: number };
  units: Unit[];
  activeUnitId: string | null;
  reachable: HexCoord[];
  selectUnit: (id: string | null) => void;
  moveUnit: (id: string, to: HexCoord) => boolean;
  damageUnit: (id: string, dmg: number) => void;
};

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

  selectUnit: (id) => {
    const s = get();
    if (!id) return set({ activeUnitId: null, reachable: [] });
    const unit = s.units.find(u => u.id === id);
    if (!unit || unit.hp <= 0) return;

    const blocked = new Set(
      s.units.filter(u => u.id !== id && u.hp > 0).map(u => hexKey(u.position)),
    );
    const reachable = reachableHexes(
      unit.position, unit.movement, blocked,
      h => inBounds(h, s.gridSize),
    );
    set({ activeUnitId: id, reachable });
  },

  moveUnit: (id, to) => {
    const s = get();
    const isOk = s.reachable.some(h => h.q === to.q && h.r === to.r);
    if (!isOk) return false;
    set({
      units: s.units.map(u => (u.id === id ? { ...u, position: to } : u)),
      activeUnitId: null,
      reachable: [],
    });
    return true;
  },

  damageUnit: (id, dmg) => {
    set(s => ({
      units: s.units.map(u =>
        u.id === id ? { ...u, hp: Math.max(0, u.hp - dmg) } : u,
      ),
    }));
  },
}));