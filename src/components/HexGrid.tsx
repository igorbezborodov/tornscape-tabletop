import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useGameStore } from '../store/gameStore';
import { HEX_SIZE, hexKey, hexPath, hexToPixel, getHexsonOutlinePaths } from '../lib/hex';
import type { HexCoord, TerrainData, Unit } from '../types/game';

type ViewBox = { x: number; y: number; w: number; h: number };

const BORDER_BACKDROP = '#0a1220';
const BORDER_COLOR = '#88bbee';

const MIN_ZOOM = 0.7;
const MAX_ZOOM = 8;
const INITIAL_ZOOM = 2;

// Все размеры элементов привязаны к размеру гекса, поэтому поле масштабируется целиком
const GRID_STROKE = HEX_SIZE * 0.022;
const HEX_INSET = HEX_SIZE * 0.017;
const BORDER_BACKDROP_WIDTH = HEX_SIZE * 0.18;
const BORDER_WIDTH = HEX_SIZE * 0.06;
const UNIT_RADIUS = HEX_SIZE * 0.62;
const UNIT_NAME_FONT = HEX_SIZE * 0.28;
const UNIT_HP_FONT = HEX_SIZE * 0.22;
const COVER_FONT = HEX_SIZE * 0.34;

// Зум относительно точки (px, py) в координатах viewBox
const zoomAbout = (view: ViewBox, baseW: number, px: number, py: number, factor: number): ViewBox => {
  const minW = baseW / MAX_ZOOM;
  const maxW = baseW / MIN_ZOOM;
  const nextW = Math.min(maxW, Math.max(minW, view.w / factor));
  const ratio = nextW / view.w;
  const nextH = view.h * ratio;

  return {
    x: px - (px - view.x) * ratio,
    y: py - (py - view.y) * ratio,
    w: nextW,
    h: nextH,
  };
};

// Не даём утащить поле за пределы экрана: центр вида остаётся внутри поля
const clampPan = (view: ViewBox, base: ViewBox): ViewBox => {
  const cx = Math.min(base.x + base.w, Math.max(base.x, view.x + view.w / 2));
  const cy = Math.min(base.y + base.h, Math.max(base.y, view.y + view.h / 2));
  return { ...view, x: cx - view.w / 2, y: cy - view.h / 2 };
};

const buttonStyle: CSSProperties = {
  width: 40,
  height: 40,
  fontSize: 20,
  fontWeight: 'bold',
  color: '#dbeafe',
  background: 'rgba(42, 58, 77, 0.92)',
  border: '1px solid #4a6a8a',
  borderRadius: 8,
  cursor: 'pointer',
  lineHeight: 1,
};

const HexGrid = () => {
  const { grid, hexsonCenters, terrain, units, activeUnitId, reachable, selectUnit, moveUnit, hasActivated } = useGameStore();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const reachableSet = useMemo(() => new Set(reachable.map(hexKey)), [reachable]);

  const unitsByHex = useMemo(() => {
    const m = new Map<string, Unit>();
    for (const u of units) if (u.hp > 0) m.set(hexKey(u.position), u);
    return m;
  }, [units]);

  // Контуры гексонов: непрерывная внешняя граница цветка из 7 гексов
  const hexsonOutlines = useMemo(() => {
    const present = new Set(grid.map(hexKey));
    const isInGrid = (h: HexCoord) => present.has(hexKey(h));

    const paths: string[] = [];
    hexsonCenters.forEach(centerKey => {
      const [q, r] = centerKey.split(',').map(Number);
      // Точный размер: у соседних гексонов общие рёбра, поэтому их границы
      // должны совпадать и давать одну общую линию по стыку
      paths.push(...getHexsonOutlinePaths({ q, r }, isInGrid, HEX_SIZE));
    });
    return paths;
  }, [grid, hexsonCenters]);

  // Базовый (вписанный в контейнер) вид поля и его центр для поворота
  const { baseView, centerX, centerY } = useMemo(() => {
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

    const pad = HEX_SIZE * 1.5;
    return {
      baseView: {
        x: minX - pad,
        y: minY - pad,
        w: maxX - minX + pad * 2,
        h: maxY - minY + pad * 2,
      },
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }, [grid]);

  const defaultView = (): ViewBox => {
    const cx = baseView.x + baseView.w / 2;
    const cy = baseView.y + baseView.h / 2;
    return zoomAbout(baseView, baseView.w, cx, cy, INITIAL_ZOOM);
  };

  const [view, setView] = useState<ViewBox>(defaultView);

  // Сброс вида при изменении поля
  useEffect(() => {
    setView(defaultView());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseView]);

  // Зум колесом мыши относительно курсора
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;

      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView(v => clampPan(zoomAbout(v, baseView.w, pt.x, pt.y, factor), baseView));
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [baseView]);

  const zoomAtCenter = (factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    const rect = svg.getBoundingClientRect();
    const pt = new DOMPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      .matrixTransform(ctm.inverse());
    setView(v => clampPan(zoomAbout(v, baseView.w, pt.x, pt.y, factor), baseView));
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;

    // Если после прошлого драга браузер не прислал click, флаг мог остаться
    // выставленным — снимаем его, чтобы не «съесть» текущий клик
    suppressClickRef.current = false;

    // Захват указателя ставим только при реальном перетаскивании, иначе он
    // перехватывает клик и выбор гекса перестаёт работать
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !svg) return;

    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
      drag.moved = true;
      setIsPanning(true);
      svg.setPointerCapture(e.pointerId);
    }
    if (!drag.moved) return;

    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    const inv = ctm.inverse();
    const prev = new DOMPoint(drag.lastX, drag.lastY).matrixTransform(inv);
    const cur = new DOMPoint(e.clientX, e.clientY).matrixTransform(inv);
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;

    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    setView(v => clampPan({ ...v, x: v.x - dx, y: v.y - dy }, baseView));
  };

  const endDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (drag.moved) suppressClickRef.current = true;

    const svg = svgRef.current;
    if (svg?.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);

    dragRef.current = null;
    setIsPanning(false);
  };

  const handleClick = (hex: HexCoord) => {
    if (hasActivated) return;

    const key = hexKey(hex);
    const unitAt = unitsByHex.get(key);

    if (activeUnitId && reachableSet.has(key)) {
      moveUnit(activeUnitId, hex);
      return;
    }
    if (unitAt) selectUnit(unitAt.id);
    else selectUnit(null);
  };

  const hexFill = (key: string, unit: Unit | undefined, terrainAt: TerrainData | undefined) => {
    const isActive = unit?.id === activeUnitId;
    const isAttackable = reachableSet.has(key) && !!unit && unit.id !== activeUnitId;
    const isReachable = reachableSet.has(key);
    const isCover = terrainAt?.type === 'cover';

    let fill = '#2a3a4d';
    if (isCover) fill = '#2a4a2a';
    if (isReachable) fill = '#3a5a80';
    if (isAttackable) fill = '#7a2a2a';
    if (isActive) fill = '#c9a227';
    return fill;
  };

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={e => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            e.stopPropagation();
          }
        }}
        style={{
          display: 'block',
          width: '100%',
          maxHeight: '85vh',
          border: '1px solid #2a3a4d',
          background: '#0f1822',
          borderRadius: 8,
          overflow: 'hidden',
          touchAction: 'none',
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
      >
        <g transform={`rotate(-40 ${centerX} ${centerY})`}>

          {/* СЛОЙ 1: Заливка маленьких гексов */}
          {grid.map(hex => {
            const { x, y } = hexToPixel(hex);
            const key = hexKey(hex);
            const unit = unitsByHex.get(key);

            return (
              <path
                key={`base-${key}`}
                d={hexPath(x, y, HEX_SIZE - HEX_INSET)}
                fill={hexFill(key, unit, terrain.get(key))}
                stroke="#3a4a5d"
                strokeWidth={GRID_STROKE}
                onClick={() => handleClick(hex)}
              />
            );
          })}

          {/*
            СЛОЙ 2: Границы гексонов.
            Рисуем в два отдельных прохода: сначала все тёмные подложки, затем все
            светлые линии. Иначе подложка следующего гексона перекрыла бы светлую
            линию предыдущего на общем ребре.
          */}
          <g style={{ pointerEvents: 'none' }}>
            {hexsonOutlines.map((d, i) => (
              <path
                key={`hexson-backdrop-${i}`}
                d={d}
                fill="none"
                stroke={BORDER_BACKDROP}
                strokeWidth={BORDER_BACKDROP_WIDTH}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {hexsonOutlines.map((d, i) => (
              <path
                key={`hexson-line-${i}`}
                d={d}
                fill="none"
                stroke={BORDER_COLOR}
                strokeWidth={BORDER_WIDTH}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </g>

          {/* СЛОЙ 3: Декор — укрытия и юниты */}
          {grid.map(hex => {
            const { x, y } = hexToPixel(hex);
            const key = hexKey(hex);
            const unit = unitsByHex.get(key);
            const isCover = terrain.get(key)?.type === 'cover';

            return (
              <g key={`decor-${key}`} pointerEvents="none">
                {isCover && (
                  <text x={x} y={y + COVER_FONT * 0.35} textAnchor="middle" fontSize={COVER_FONT} fill="#88cc88">🛡️</text>
                )}
                {unit && (
                  <g>
                    <circle cx={x} cy={y} r={UNIT_RADIUS}
                            fill={unit.player === 'player1' ? '#a0c0e0' : '#e0b0b0'}
                            stroke={unit.player === 'player1' ? '#1d3a5c' : '#6b2020'}
                            strokeWidth={HEX_SIZE * 0.04} />
                    <text x={x} y={y + UNIT_NAME_FONT * 0.36} textAnchor="middle" fontSize={UNIT_NAME_FONT} fontWeight="bold" fill="#000">
                      {unit.name.slice(0, 2)}
                    </text>
                    <text x={x} y={y + HEX_SIZE * 0.92} textAnchor="middle" fontSize={UNIT_HP_FONT} fill="#fff">
                      {unit.hp}/{unit.maxHp}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        </g>
      </svg>

      {/* Управление камерой */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" style={buttonStyle} title="Приблизить" onClick={() => zoomAtCenter(1.3)}>+</button>
        <button type="button" style={buttonStyle} title="Отдалить" onClick={() => zoomAtCenter(1 / 1.3)}>−</button>
        <button type="button" style={buttonStyle} title="Сбросить вид" onClick={() => setView(defaultView())}>⟲</button>
      </div>

      <div style={{
        position: 'absolute', bottom: 10, left: 12,
        fontSize: 12, color: '#9ecbff', opacity: 0.75, pointerEvents: 'none',
      }}>
        Колесо мыши — зум, перетаскивание — панорама
      </div>
    </div>
  );
};

export default HexGrid;
