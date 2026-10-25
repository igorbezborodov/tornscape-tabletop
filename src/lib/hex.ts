import type { HexCoord } from '../types/game';

export const HEX_SIZE = 40;

export const hexKey = (h: HexCoord) => `${h.q},${h.r}`;

// ИСПРАВЛЕНО: Формула для pointy-top (острый верх)
export const hexToPixel = (hex: HexCoord, size = HEX_SIZE) => ({
  x: size * Math.sqrt(3) * (hex.q + hex.r / 2),
  y: size * 1.5 * hex.r,
});

export const hexPath = (cx: number, cy: number, size: number): string => {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return `M${points.join(' L')} Z`;
};

export const hexDistance = (a: HexCoord, b: HexCoord): number => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
};

export const hexNeighbors = (h: HexCoord): HexCoord[] => [
  { q: h.q + 1, r: h.r },
  { q: h.q + 1, r: h.r - 1 },
  { q: h.q,     r: h.r - 1 },
  { q: h.q - 1, r: h.r },
  { q: h.q - 1, r: h.r + 1 },
  { q: h.q,     r: h.r + 1 },
];

export const generateGrid = (cols: number, rows: number): HexCoord[] => {
  const out: HexCoord[] = [];
  for (let q = 0; q < cols; q++)
    for (let r = 0; r < rows; r++) out.push({ q, r });
  return out;
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