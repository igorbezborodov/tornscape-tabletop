import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useGameStore } from '../store/gameStore';
import { HEX_SIZE, hexKey, hexPath, hexToPixel, getHexsonOutlinePaths } from '../lib/hex';
import { zoneHexKeys } from '../lib/setup';
import {
  SCENARIO_MARKER_ICON,
  SCENARIO_MARKER_LABEL,
  STATE_MARKER_ICON,
  TERRAIN_ICON,
  isCoverTerrain,
  isHazardTerrain,
  type HexCoord,
  type TerrainData,
  type Unit,
} from '../types/game';

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
const TERRAIN_FONT = HEX_SIZE * 0.44;
const MARKER_FONT = HEX_SIZE * 0.3;
const WHIRLWIND_RADIUS = HEX_SIZE * 2.1;
const WHIRLWIND_STROKE = HEX_SIZE * 0.1;

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
  const {
    grid,
    hexsonCenters,
    terrain,
    units,
    whirlwinds,
    scenarioMarkers,
    activeUnitId,
    activation,
    phase,
    reachable,
    currentPlayer,
    setupStage,
    deploymentZones,
    deployingPlayer,
    deployUnit,
    deployToReserve,
    activateFromReserve,
    beginActivation,
    moveActiveUnit,
    confirmAttack,
    declareReaction,
  } = useGameStore();

  const [selectedDeployId, setSelectedDeployId] = useState<string | null>(null);
  const [reserveUnitId, setReserveUnitId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);

  const isDeployment = setupStage === 'deployment';

  /** Миниатюры текущего выставляющегося игрока, ещё не попавшие на поле. */
  const pendingDeploy = useMemo(
    () =>
      isDeployment && deployingPlayer
        ? units.filter(
            item => item.player === deployingPlayer && !item.deployed && !item.reserve,
          )
        : [],
    [isDeployment, deployingPlayer, units],
  );

  // Если выбранная миниатюра ушла из очереди, берём первую доступную.
  const activeDeployId =
    selectedDeployId && pendingDeploy.some(item => item.id === selectedDeployId)
      ? selectedDeployId
      : pendingDeploy[0]?.id ?? null;

  /** Резерв игрока, чья сейчас Активация: вводится в игру с −1 Маркером Времени. */
  const reserveUnits = useMemo(
    () =>
      phase === 'activation' && setupStage === 'complete' && !activeUnitId
        ? units.filter(
            item =>
              item.reserve && !item.dead && item.hp > 0 && item.player === currentPlayer,
          )
        : [],
    [phase, setupStage, activeUnitId, currentPlayer, units],
  );

  /** Гексы зон расстановки: подсвечиваются до завершения Шага 3. */
  const zoneOwnerByHex = useMemo(() => {
    const map = new Map<string, Unit['player'] | null>();
    if (setupStage === 'complete') return map;
    for (const zone of deploymentZones) {
      for (const key of zoneHexKeys(zone)) map.set(key, zone.player);
    }
    return map;
  }, [deploymentZones, setupStage]);

  /** Подписи зон — по центру масс гексонов зоны. */
  const zoneLabels = useMemo(() => {
    if (setupStage === 'complete') return [];
    return deploymentZones.map((zone, index) => {
      const points = zone.hexsons.map(hexToPixel);
      const cx = points.reduce((total, point) => total + point.x, 0) / Math.max(1, points.length);
      const cy = points.reduce((total, point) => total + point.y, 0) / Math.max(1, points.length);
      const caption =
        zone.player === 'player1'
          ? `ЗОНА 1 (Синие)`
          : zone.player === 'player2'
            ? `ЗОНА 2 (Красные)`
            : `ЗОНА ${index + 1}`;
      return { key: zone.id, x: cx, y: cy, caption, player: zone.player };
    });
  }, [deploymentZones, setupStage]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const reachableSet = useMemo(() => new Set(reachable.map(hexKey)), [reachable]);

  const unitsByHex = useMemo(() => {
    const m = new Map<string, Unit>();
    // Не выставленные миниатюры (Шаг 3) и Резерв на поле не показываются.
    for (const u of units) if (u.hp > 0 && u.deployed) m.set(hexKey(u.position), u);
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

  // Подсветка легальных целей текущего Действия Атаки.
  const targetSet = useMemo(
    () => new Set(activation?.targetIds ?? []),
    [activation?.targetIds],
  );
  const isAttackPending = targetSet.size > 0;

  const handleClick = (hex: HexCoord) => {
    const key = hexKey(hex);
    const unitAt = unitsByHex.get(key);

    // 0а. Шаг 3 «Расстановка»: клик по гексу своей зоны выставляет миниатюру.
    if (isDeployment) {
      if (!activeDeployId) return;
      deployUnit(activeDeployId, hex);
      setSelectedDeployId(null);
      return;
    }

    // 0б. Резерв: клик по гексу своей зоны вводит миниатюру из Резерва.
    if (reserveUnitId) {
      if (activateFromReserve(reserveUnitId, hex)) setReserveUnitId(null);
      return;
    }

    // 1. Заявлено Действие Атаки — клик по легальной цели резолвит атаку.
    if (isAttackPending) {
      if (unitAt && targetSet.has(unitAt.id)) {
        confirmAttack(unitAt.id);
        return;
      }
      // Одиночная Реакция «Защита» заявляется до атаки, поэтому клик по себе
      // трактуется как подготовка к защите.
      if (unitAt && activation && unitAt.id === activation.unitId) {
        declareReaction(unitAt.id, 'defend');
        return;
      }
      return;
    }

    // 2. Заявлено перемещение — клик по достижимому гексу двигает миниатюру.
    if (activation?.selectedActionId && reachableSet.has(key)) {
      moveActiveUnit(hex);
      return;
    }

    // 3. Иначе клик по своей неактивированной миниатюре начинает Активацию.
    if (phase === 'activation' && unitAt) beginActivation(unitAt.id);
  };

  const hexFill = (key: string, unit: Unit | undefined, terrainAt: TerrainData | undefined) => {
    const isActive = unit?.id === activeUnitId;
    const isTarget = !!unit && targetSet.has(unit.id);
    const isReachable = reachableSet.has(key);

    // Зона расстановки: подсветка до завершения Шага 3 (цвет игрока).
    // Ландшафт внутри зоны не перекрывает подсветку — он виден иконкой.
    const zoneOwner = zoneOwnerByHex.get(key);
    const zoneTint =
      zoneOwner === 'player1'
        ? '#26405e'
        : zoneOwner === 'player2'
          ? '#4a2a2e'
          : zoneOwnerByHex.has(key)
            ? '#3a3f52'
            : null;

    let fill = zoneTint ?? '#2a3a4d';
    if (!zoneTint) {
      if (terrainAt && isHazardTerrain(terrainAt.type)) fill = '#4a3524';
      else if (terrainAt && isCoverTerrain(terrainAt.type)) fill = '#2a4a2a';
    }
    if (isReachable) fill = '#3a5a80';
    if (isTarget) fill = '#7a2a2a';
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

          {/* СЛОЙ 3: Декор — ландшафт, маркеры сценария и миниатюры */}
          {grid.map(hex => {
            const { x, y } = hexToPixel(hex);
            const key = hexKey(hex);
            const unit = unitsByHex.get(key);
            const cell = terrain.get(key);
            const terrainIcon = cell && cell.type !== 'plain' ? TERRAIN_ICON[cell.type] : '';
            const markerHere = scenarioMarkers.find(
              marker => hexKey(marker.position) === key && !marker.carrierUnitId,
            );
            const markerOnUnit = scenarioMarkers.find(
              marker => marker.carrierUnitId && marker.carrierUnitId === unit?.id,
            );

            // Портрет круглый: clipPath обрезает изображение по границе жетона.
            const clipId = unit ? `unit-clip-${unit.id}` : '';

            return (
              <g key={`decor-${key}`} pointerEvents="none">
                {terrainIcon && (
                  <text
                    x={x}
                    y={y + TERRAIN_FONT * 0.35}
                    textAnchor="middle"
                    fontSize={TERRAIN_FONT}
                    opacity={unit ? 0.35 : 0.85}
                  >
                    {terrainIcon}
                  </text>
                )}
                {markerHere && (
                  <g>
                    {/* Маркер Сценария: цвет — сторона, иконка — вид маркера. */}
                    <circle
                      cx={x}
                      cy={y - UNIT_RADIUS * 0.85}
                      r={HEX_SIZE * 0.3}
                      fill={
                        markerHere.owner === 'player2'
                          ? '#8a4a4a'
                          : markerHere.owner === 'player1'
                            ? '#4a6a8a'
                            : '#5a5a70'
                      }
                      stroke="#0a1220"
                      strokeWidth={HEX_SIZE * 0.03}
                    />
                    <text
                      x={x}
                      y={y - UNIT_RADIUS * 0.85 + HEX_SIZE * 0.11}
                      textAnchor="middle"
                      fontSize={HEX_SIZE * 0.3}
                    >
                      {SCENARIO_MARKER_ICON[markerHere.kind]}
                    </text>
                  </g>
                )}
                {unit && (
                  <g>
                    {unit.imageUrl && (
                      <defs>
                        <clipPath id={clipId}>
                          <circle cx={x} cy={y} r={UNIT_RADIUS} />
                        </clipPath>
                      </defs>
                    )}
                    <circle cx={x} cy={y} r={UNIT_RADIUS}
                            fill={unit.player === 'player1' ? '#a0c0e0' : '#e0b0b0'}
                            stroke={unit.player === 'player1' ? '#1d3a5c' : '#6b2020'}
                            strokeWidth={HEX_SIZE * 0.04} />
                    {unit.imageUrl ? (
                      // Портрет вместо инициалов: он один и тот же у всех копий
                      // юнита, поэтому привязываем картинку к ключу гекса.
                      <image
                        href={unit.imageUrl}
                        x={x - UNIT_RADIUS}
                        y={y - UNIT_RADIUS}
                        width={UNIT_RADIUS * 2}
                        height={UNIT_RADIUS * 2}
                        clipPath={`url(#${clipId})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    ) : (
                      <text x={x} y={y + UNIT_NAME_FONT * 0.36} textAnchor="middle" fontSize={UNIT_NAME_FONT} fontWeight="bold" fill="#000">
                        {unit.name.slice(0, 2)}
                      </text>
                    )}
                    <circle cx={x} cy={y} r={UNIT_RADIUS}
                            fill="none"
                            stroke={unit.player === 'player1' ? '#1d3a5c' : '#6b2020'}
                            strokeWidth={HEX_SIZE * 0.04} />
                    {/* Ободок цвета игрока: активированные миниатюры тускнеют. */}
                    {unit.activated && (
                      <circle cx={x} cy={y} r={UNIT_RADIUS * 1.08}
                              fill="none" stroke="#8899aa" strokeWidth={HEX_SIZE * 0.03}
                              strokeDasharray={`${HEX_SIZE * 0.12} ${HEX_SIZE * 0.1}`} />
                    )}
                    {/* Маркеры Времени: каждый — маленький ромб снизу слева. */}
                    {Array.from({ length: unit.timeMarkers }).map((_, index) => (
                      <rect
                        key={`tm-${key}-${index}`}
                        x={x - UNIT_RADIUS + index * HEX_SIZE * 0.22}
                        y={y + UNIT_RADIUS * 0.55}
                        width={HEX_SIZE * 0.15}
                        height={HEX_SIZE * 0.15}
                        fill="#c9a227"
                        stroke="#0a1220"
                        strokeWidth={HEX_SIZE * 0.02}
                        transform={`rotate(45 ${x - UNIT_RADIUS + index * HEX_SIZE * 0.22 + HEX_SIZE * 0.075} ${y + UNIT_RADIUS * 0.55 + HEX_SIZE * 0.075})`}
                      />
                    ))}
                    {/* Маркеры Состояний: иконки справа сверху от жетона. */}
                    {unit.stateMarkers.map((marker, index) => (
                      <text
                        key={`sm-${key}-${marker}-${index}`}
                        x={x + UNIT_RADIUS * 0.9}
                        y={y - UNIT_RADIUS * 0.6 + index * MARKER_FONT * 0.9}
                        fontSize={MARKER_FONT}
                        textAnchor="middle"
                      >
                        {STATE_MARKER_ICON[marker]}
                      </text>
                    ))}
                    {markerOnUnit && (
                      <g>
                        <circle
                          cx={x - UNIT_RADIUS * 0.85}
                          cy={y - UNIT_RADIUS * 0.85}
                          r={HEX_SIZE * 0.26}
                          fill={markerOnUnit.owner === 'player2' ? '#8a4a4a' : '#4a6a8a'}
                          stroke="#0a1220"
                          strokeWidth={HEX_SIZE * 0.03}
                        />
                        <text
                          x={x - UNIT_RADIUS * 0.85}
                          y={y - UNIT_RADIUS * 0.85 + HEX_SIZE * 0.1}
                          textAnchor="middle"
                          fontSize={HEX_SIZE * 0.26}
                        >
                          {SCENARIO_MARKER_ICON[markerOnUnit.kind]}
                        </text>
                      </g>
                    )}
                    <text x={x} y={y + HEX_SIZE * 0.92} textAnchor="middle" fontSize={UNIT_HP_FONT} fill="#fff">
                      {unit.hp}/{unit.maxHp}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/*
            СЛОЙ 4: Эфирные Вихри. Вихрь занимает целый гексон, поэтому
            рисуется полупрозрачным кругом поверх миниатюр — видно, кто в нём.
          */}
          <g style={{ pointerEvents: 'none' }}>
            {whirlwinds.map(whirlwind => {
              const { x, y } = hexToPixel(whirlwind.position);
              const stroke =
                whirlwind.allegiance === 'player1'
                  ? '#4a8ad0'
                  : whirlwind.allegiance === 'player2'
                    ? '#d05a5a'
                    : '#b0a0e0';
              return (
                <g key={`whirlwind-${whirlwind.id}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={WHIRLWIND_RADIUS}
                    fill="rgba(120, 100, 200, 0.16)"
                    stroke={stroke}
                    strokeWidth={WHIRLWIND_STROKE}
                    strokeDasharray={`${HEX_SIZE * 0.3} ${HEX_SIZE * 0.2}`}
                  />
                  <text
                    x={x}
                    y={y - WHIRLWIND_RADIUS * 0.82}
                    textAnchor="middle"
                    fontSize={HEX_SIZE * 0.62}
                  >
                    {whirlwind.isMaelstrom ? '🌪️' : '🌀'}
                  </text>
                  <text
                    x={x}
                    y={y + WHIRLWIND_RADIUS * 0.95}
                    textAnchor="middle"
                    fontSize={HEX_SIZE * 0.34}
                    fill="#d8ccff"
                  >
                    💎 {whirlwind.etherCrystals}
                  </text>
                </g>
              );
            })}
          </g>

          {/* СЛОЙ 5: Подписи Зон Расстановки (Шаг 3). */}
          {zoneLabels.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              {zoneLabels.map(label => (
                <text
                  key={`zone-label-${label.key}`}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fontSize={HEX_SIZE * 0.9}
                  fontWeight="bold"
                  fill={
                    label.player === 'player1'
                      ? 'rgba(150, 200, 255, 0.75)'
                      : label.player === 'player2'
                        ? 'rgba(255, 170, 170, 0.75)'
                        : 'rgba(220, 220, 240, 0.6)'
                  }
                  stroke="#0a1220"
                  strokeWidth={HEX_SIZE * 0.06}
                  paintOrder="stroke"
                >
                  {label.caption}
                </text>
              ))}
            </g>
          )}

        </g>
      </svg>

      {/* Панель Шага 3 «Расстановка»: очередь миниатюр текущего игрока. */}
      {isDeployment && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            width: 240,
            maxHeight: '70%',
            overflowY: 'auto',
            background: 'rgba(15, 24, 34, 0.94)',
            border: '1px solid #4a6a8a',
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            color: '#dbeafe',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
            Шаг 3: расстановка
            {deployingPlayer ? (deployingPlayer === 'player1' ? ' — Игрок 1' : ' — Игрок 2') : ''}
          </div>
          <div style={{ marginBottom: 8, opacity: 0.8, lineHeight: 1.35 }}>
            Выберите миниатюру и кликните гекс своей зоны. Очередь: по одной Миниатюре.
          </div>
          {pendingDeploy.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Очередь пуста.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pendingDeploy.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedDeployId(item.id)}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: `1px solid ${item.id === activeDeployId ? '#c9a227' : '#3a4a5d'}`,
                    background: item.id === activeDeployId ? '#2a3a52' : '#1a2632',
                    color: '#dbeafe',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {item.name}
                  <span style={{ opacity: 0.6 }}> · {item.points} очк.</span>
                </button>
              ))}
            </div>
          )}
          {activeDeployId && (
            <button
              type="button"
              onClick={() => {
                deployToReserve(activeDeployId);
                setSelectedDeployId(null);
              }}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid #8a6a3a',
                background: '#3a2e1e',
                color: '#f0d9a0',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              В Резерв (не помещается в зону)
            </button>
          )}
        </div>
      )}

      {/* Резерв в Фазе IV: ввод миниатюры на поле с −1 Маркером Времени. */}
      {reserveUnits.length > 0 && !reserveUnitId && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            background: 'rgba(15, 24, 34, 0.94)',
            border: '1px solid #8a6a3a',
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            color: '#f0d9a0',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Резерв</div>
          {reserveUnits.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setReserveUnitId(item.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginBottom: 4,
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid #3a4a5d',
                background: '#1a2632',
                color: '#dbeafe',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {reserveUnitId && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            background: 'rgba(15, 24, 34, 0.94)',
            border: '1px solid #c9a227',
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            color: '#f0d9a0',
          }}
        >
          Кликните гекс в своей зоне, чтобы ввести миниатюру из Резерва.
          <button
            type="button"
            onClick={() => setReserveUnitId(null)}
            style={{
              display: 'block',
              marginTop: 6,
              width: '100%',
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid #3a4a5d',
              background: '#1a2632',
              color: '#dbeafe',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Отмена
          </button>
        </div>
      )}

      {/* Легенда обозначений на гексах. */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 12,
          maxWidth: 260,
          background: 'rgba(15, 24, 34, 0.94)',
          border: '1px solid #3a4a5d',
          borderRadius: 8,
          padding: 8,
          fontSize: 11,
          color: '#cfe3f7',
          lineHeight: 1.5,
        }}
      >
        <button
          type="button"
          onClick={() => setLegendOpen(open => !open)}
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            color: '#9ecbff',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 'bold',
            padding: 0,
            marginBottom: legendOpen ? 6 : 0,
          }}
        >
          {legendOpen ? '▾' : '▸'} Легенда обозначений
        </button>
        {legendOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>🛡️ Укрытие (Объёмный Ландшафт) — цель скрыта</div>
            <div>💎 Кристаллы Эфирита — Укрытие</div>
            <div>🔥 / ☠️ / 🌀 / 🌊 — Опасный Ландшафт</div>
            <div>{SCENARIO_MARKER_ICON.portable} {SCENARIO_MARKER_LABEL.portable} — несёт миниатюра</div>
            <div>{SCENARIO_MARKER_ICON.bound} {SCENARIO_MARKER_LABEL.bound} — снимается по условию</div>
            <div>{SCENARIO_MARKER_ICON.prisoner} {SCENARIO_MARKER_LABEL.prisoner}</div>
            <div>{SCENARIO_MARKER_ICON.common} {SCENARIO_MARKER_LABEL.common} — открывается по сценарию</div>
            <div>🌀 Эфирный Вихрь · 🌪️ Смерч · 💎 запас Эфира</div>
            <div>◇ золотой ромб — Маркер Времени</div>
            <div>Серый пунктир на жетоне — уже активирована</div>
          </div>
        )}
      </div>

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
