import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { HEX_SIZE, hexKey, hexPath, hexToPixel, generateGrid } from '../lib/hex';
import type { HexCoord, Unit } from '../types/game';

const HexGrid = () => {
  const { units, gridSize, activeUnitId, reachable, selectUnit, moveUnit } = useGameStore();

  const grid = useMemo(() => generateGrid(gridSize.cols, gridSize.rows), [gridSize]);
  const reachableSet = useMemo(() => new Set(reachable.map(hexKey)), [reachable]);
  const unitsByHex = useMemo(() => {
    const m = new Map<string, Unit>();
    for (const u of units) if (u.hp > 0) m.set(hexKey(u.position), u);
    return m;
  }, [units]);

  // Вычисляем границы поля для автоматического центрирования (viewBox)
  const { viewBox } = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const hw = HEX_SIZE * Math.sqrt(3) / 2; // половина ширины гекса
    const hh = HEX_SIZE; // половина высоты гекса

    grid.forEach(hex => {
      const { x, y } = hexToPixel(hex);
      minX = Math.min(minX, x - hw);
      maxX = Math.max(maxX, x + hw);
      minY = Math.min(minY, y - hh);
      maxY = Math.max(maxY, y + hh);
    });

    const pad = 20; // Отступ от краев
    return {
      viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
    };
  }, [grid]);

  const handleClick = (hex: HexCoord) => {
    const key = hexKey(hex);
    const unitAt = unitsByHex.get(key);

    if (activeUnitId && reachableSet.has(key) && !unitAt) {
      moveUnit(activeUnitId, hex);
      return;
    }
    if (unitAt) selectUnit(unitAt.id);
    else selectUnit(null);
  };

  return (
    <svg 
      viewBox={viewBox} 
      style={{ 
        width: '100%', 
        maxHeight: '80vh', 
        border: '1px solid #2a3a4d', 
        background: '#0f1822', 
        borderRadius: 8 
      }}
    >
      {grid.map(hex => {
        const { x, y } = hexToPixel(hex);
        const cx = x, cy = y; // Теперь координаты точно совпадают с центрами
        const key = hexKey(hex);
        const unit = unitsByHex.get(key);
        const isActive = unit?.id === activeUnitId;
        const isReachable = reachableSet.has(key);

        return (
          <g key={key}>
            <path 
              d={hexPath(cx, cy, HEX_SIZE - 1)}
              fill={isReachable ? '#3a5a80' : isActive ? '#c9a227' : '#2a3a4d'}
              stroke="#5a7a9a" 
              strokeWidth={1}
              style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
              onClick={() => handleClick(hex)} 
            />
            {unit && (
              <g pointerEvents="none">
                <circle cx={cx} cy={cy} r={HEX_SIZE * 0.55}
                        fill="#e0e0e0" stroke="#000" strokeWidth={1.5} />
                <text x={cx} y={cy + 4} textAnchor="middle"
                      fontSize={11} fontWeight="bold" fill="#000">
                  {unit.name.slice(0, 2)}
                </text>
                <text x={cx} y={cy + HEX_SIZE * 0.85} textAnchor="middle"
                      fontSize={10} fill="#fff">
                  {unit.hp}/{unit.maxHp}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default HexGrid;