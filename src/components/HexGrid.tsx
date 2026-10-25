import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { HEX_SIZE, hexKey, hexPath, hexToPixel, generateGrid } from '../lib/hex';
import type { HexCoord, Unit } from '../types/game';

const HexGrid = () => {
  const { units, gridSize, activeUnitId, reachable, selectUnit, moveUnit, hasActivated } = useGameStore();

  const grid = useMemo(() => generateGrid(gridSize.cols, gridSize.rows), [gridSize]);
  const reachableSet = useMemo(() => new Set(reachable.map(hexKey)), [reachable]);
  
  const unitsByHex = useMemo(() => {
    const m = new Map<string, Unit>();
    for (const u of units) if (u.hp > 0) m.set(hexKey(u.position), u);
    return m;
  }, [units]);

  const { viewBox } = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const hw = HEX_SIZE * Math.sqrt(3) / 2;
    const hh = HEX_SIZE;

    grid.forEach(hex => {
      const { x, y } = hexToPixel(hex);
      minX = Math.min(minX, x - hw);
      maxX = Math.max(maxX, x + hw);
      minY = Math.min(minY, y - hh);
      maxY = Math.max(maxY, y + hh);
    });
    const pad = 20;
    return { viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}` };
  }, [grid]);

  const handleClick = (hex: HexCoord) => {
    if (hasActivated) return; // Если уже ходили, клики игнорируются

    const key = hexKey(hex);
    const unitAt = unitsByHex.get(key);

    if (activeUnitId && reachableSet.has(key)) {
      moveUnit(activeUnitId, hex); // Внутри moveUnit уже есть проверка на атаку
      return;
    }
    if (unitAt) selectUnit(unitAt.id);
    else selectUnit(null);
  };

  return (
    <svg viewBox={viewBox} style={{ width: '100%', maxHeight: '80vh', border: '1px solid #2a3a4d', background: '#0f1822', borderRadius: 8 }}>
      {grid.map(hex => {
        const { x, y } = hexToPixel(hex);
        const cx = x, cy = y;
        const key = hexKey(hex);
        const unit = unitsByHex.get(key);
        const isActive = unit?.id === activeUnitId;
        
        // Проверяем, является ли гекс зоной атаки (там стоит юнит)
        const isAttackable = reachableSet.has(key) && unit && unit.id !== activeUnitId;

        return (
          <g key={key}>
            <path 
              d={hexPath(cx, cy, HEX_SIZE - 1)}
              fill={
                isAttackable ? '#7a2a2a' : // Красный для атаки
                isActive ? '#c9a227' :     // Золотой для активного
                reachableSet.has(key) ? '#3a5a80' : // Синий для движения
                '#2a3a4d'                  // Обычный
              }
              stroke={isAttackable ? '#ff5555' : "#5a7a9a"} 
              strokeWidth={isAttackable ? 2 : 1}
              style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
              onClick={() => handleClick(hex)} 
            />
            {unit && (
              <g pointerEvents="none">
                <circle cx={cx} cy={cy} r={HEX_SIZE * 0.55}
                        fill={unit.id.startsWith('u1') ? '#e0e0e0' : '#a0c0e0'} // Разный цвет для фракций
                        stroke="#000" strokeWidth={1.5} />
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