export type HexCoord = { q: number; r: number };

/** Владелец юнита. Принадлежность хранится явно, а не выводится из фракции:
 *  оба игрока могут собрать ростор из одной и той же фракции. */
export type PlayerId = 'player1' | 'player2';

export type Unit = {
  id: string;
  name: string;
  player: PlayerId;
  /** Слаг фракции из БД (krigmark, angelin, ...). */
  faction: string;
  position: HexCoord;
  hp: number;
  maxHp: number;
  movement: number;
  attack: number;
  defense: number;
};

/**
 * Запись ростера, приходящая из ArmyBuilder: шаблон юнита из БД
 * плюс слаг его фракции. Координат здесь нет — их выдаёт `gameStore`.
 */
export type RosterUnitInput = {
  id: string;
  name: string;
  factionSlug?: string;
  maxHp: number;
  movement: number;
  attack: number;
  defense: number;
};

export type TerrainType = 'plain' | 'cover';

export type TerrainData = {
  type: TerrainType;
  coverBonus: number;
};
