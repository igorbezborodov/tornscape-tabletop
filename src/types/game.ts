export type HexCoord = { q: number; r: number };

export type UnitFaction = 'krigmark' | 'keld' | 'angelin' | 'castilia';

export type Unit = {
  id: string;
  name: string;
  faction: UnitFaction;
  position: HexCoord;
  hp: number;
  maxHp: number;
  movement: number;
  attack: number;
  defense: number;
};