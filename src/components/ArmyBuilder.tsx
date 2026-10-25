import { useEffect, useMemo, useState } from 'react';
import {
  API_BASE_URL,
  fetchFactions,
  fetchUnits,
  type FactionDto,
  type UnitDto,
} from '../lib/api';
import { useGameStore } from '../store/gameStore';
import type { PlayerId, RosterUnitInput } from '../types/game';

export type { PlayerId };

export type RosterMap = Record<PlayerId, UnitDto[]>;

export const POINTS_LIMIT = 200;

const PLAYER_META: Record<PlayerId, { title: string; side: string; accent: string }> = {
  player1: { title: 'Игрок 1', side: 'Синие', accent: '#4a6a8a' },
  player2: { title: 'Игрок 2', side: 'Красные', accent: '#8a4a4a' },
};

const createEmptyRosters = (): RosterMap => ({ player1: [], player2: [] });

const sumPoints = (roster: UnitDto[]): number => roster.reduce((sum, unit) => sum + unit.points, 0);

type ArmyBuilderProps = {
  /** Вызывается после того, как партия инициализирована в gameStore. */
  onStart: (rosters: RosterMap) => void;
  /** Позволяет вернуться к сборке, не теряя уже выбранных юнитов. */
  initialRosters?: RosterMap;
};

const ArmyBuilder = ({ onStart, initialRosters }: ArmyBuilderProps) => {
  const [factions, setFactions] = useState<FactionDto[]>([]);
  const [units, setUnits] = useState<UnitDto[]>([]);
  const [selectedFactionId, setSelectedFactionId] = useState<string>('');
  const [search, setSearch] = useState('');

  const [rosters, setRosters] = useState<RosterMap>(() => initialRosters ?? createEmptyRosters());

  const startGameWithRosters = useGameStore(state => state.startGameWithRosters);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Загрузка справочников с бэкенда. CORS включён на сервере, поэтому
  // запросы идут напрямую на http://localhost:3001 без прокси Vite.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [factionList, unitList] = await Promise.all([
          fetchFactions(controller.signal),
          fetchUnits(controller.signal),
        ]);

        if (cancelled) return;

        setFactions(factionList);
        setUnits(unitList);
        setSelectedFactionId(previous => previous || factionList[0]?.id || '');
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;

        setError(loadError instanceof Error ? loadError.message : 'Неизвестная ошибка загрузки.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadKey]);

  const p1Points = sumPoints(rosters.player1);
  const p2Points = sumPoints(rosters.player2);

  const factionName = useMemo(
    () => new Map(factions.map(faction => [faction.id, faction.name])),
    [factions],
  );

  // Юнит в ростере — это шаблон из БД, у него есть только `factionId`.
  // Для игрового поля нужен слаг фракции (krigmark, angelin, ...),
  // поэтому конвертируем ростер перед стартом партии.
  const factionSlug = useMemo(
    () => new Map(factions.map(faction => [faction.id, faction.slug])),
    [factions],
  );

  const toRosterInput = (roster: UnitDto[]): RosterUnitInput[] =>
    roster.map(unit => ({
      id: unit.id,
      name: unit.name,
      factionSlug: factionSlug.get(unit.factionId),
      maxHp: unit.maxHp,
      movement: unit.movement,
      attack: unit.attack,
      defense: unit.defense,
    }));

  const availableUnits = useMemo(() => {
    const query = search.trim().toLowerCase();

    return units.filter(unit => {
      if (unit.factionId !== selectedFactionId) return false;
      if (!query) return true;

      const haystack = `${unit.name} ${unit.specialRules ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [units, selectedFactionId, search]);

  const pointsFor = (player: PlayerId): number =>
    player === 'player1' ? p1Points : p2Points;

  const canAdd = (unit: UnitDto, player: PlayerId): boolean =>
    pointsFor(player) + unit.points <= POINTS_LIMIT;

  const addUnit = (unit: UnitDto, player: PlayerId) => {
    setRosters(previous => {
      const points = sumPoints(previous[player]);
      if (points + unit.points > POINTS_LIMIT) return previous;

      return { ...previous, [player]: [...previous[player], unit] };
    });
  };

  const removeUnit = (index: number, player: PlayerId) => {
    setRosters(previous => ({
      ...previous,
      [player]: previous[player].filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const clearRoster = (player: PlayerId) => {
    setRosters(previous => ({ ...previous, [player]: [] }));
  };

  const canStart = rosters.player1.length > 0 && rosters.player2.length > 0;

  const startGame = () => {
    if (!canStart) return;

    // Расстановка и сброс хода — на стороне gameStore,
    // экран переключает App через onStart.
    startGameWithRosters(toRosterInput(rosters.player1), toRosterInput(rosters.player2));
    onStart(rosters);
  };

  const renderRoster = (player: PlayerId) => {
    const meta = PLAYER_META[player];
    const roster = rosters[player];
    const points = pointsFor(player);
    const usedPercent = Math.min(100, Math.round((points / POINTS_LIMIT) * 100));

    return (
      <div style={{ background: '#2a3a4d', padding: 16, borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>
            {meta.title}{' '}
            <span style={{ fontSize: 14, opacity: 0.7 }}>({meta.side})</span>
          </h3>
          <button
            onClick={() => clearRoster(player)}
            disabled={roster.length === 0}
            style={{
              padding: '4px 10px',
              fontSize: 13,
              cursor: roster.length === 0 ? 'not-allowed' : 'pointer',
              opacity: roster.length === 0 ? 0.4 : 0.9,
              background: 'transparent',
              color: '#fff',
              border: '1px solid #55708a',
              borderRadius: 6,
            }}
          >
            Очистить
          </button>
        </div>

        <div style={{ margin: '10px 0 6px', fontSize: 15, opacity: 0.85 }}>
          {points} / {POINTS_LIMIT} очков · юнитов: {roster.length}
        </div>

        <div style={{ height: 6, borderRadius: 3, background: '#1a2634', overflow: 'hidden' }}>
          <div
            style={{
              width: `${usedPercent}%`,
              height: '100%',
              background: meta.accent,
              transition: 'width 180ms ease',
            }}
          />
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {roster.length === 0 ? (
            <div style={{ fontSize: 14, opacity: 0.55 }}>
              Пока пусто — добавляйте юнитов из каталога.
            </div>
          ) : (
            roster.map((unit, index) => (
              <div
                key={`${unit.id}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  background: '#3a4a5d',
                  padding: '7px 10px',
                  borderRadius: 4,
                  fontSize: 15,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {unit.name}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ opacity: 0.7, fontSize: 13 }}>{unit.points}</span>
                  <button
                    onClick={() => removeUnit(index, player)}
                    aria-label={`Убрать ${unit.name}`}
                    title="Убрать юнита"
                    style={{
                      width: 24,
                      height: 24,
                      lineHeight: '20px',
                      textAlign: 'center',
                      padding: 0,
                      cursor: 'pointer',
                      background: '#a33',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                    }}
                  >
                    ×
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', background: '#0a1220', minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ marginTop: 0, marginBottom: 4, fontSize: 34 }}>Сборка Ростера</h1>
      <p style={{ margin: 0, opacity: 0.7, fontSize: 16, lineHeight: 1.5 }}>
        Каждый игрок набирает армию на {POINTS_LIMIT} очков. Юниты загружаются из базы данных через{' '}
        <code style={{ background: '#1a2634', padding: '2px 6px', borderRadius: 4 }}>{API_BASE_URL}/api</code>.
      </p>

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: '#4a1f1f',
            border: '1px solid #8a4a4a',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span style={{ fontSize: 15 }}>{error}</span>
          <button
            onClick={() => setReloadKey(value => value + 1)}
            style={{ padding: '8px 14px', cursor: 'pointer', borderRadius: 6, border: 'none', fontWeight: 'bold' }}
          >
            Повторить
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, marginTop: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Каталог юнитов */}
        <div style={{ flex: '2 1 560px', background: '#2a3a4d', padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0, fontSize: 22 }}>Каталог юнитов</h2>

          <select
            value={selectedFactionId}
            onChange={event => setSelectedFactionId(event.target.value)}
            disabled={factions.length === 0}
            style={{
              padding: 10,
              fontSize: 16,
              marginBottom: 10,
              width: '100%',
              background: '#3a4a5d',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
            }}
          >
            {factions.length === 0 && <option value="">Загрузка фракций…</option>}
            {factions.map(faction => (
              <option key={faction.id} value={faction.id}>
                {faction.name}
              </option>
            ))}
          </select>

          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Поиск по названию или правилам…"
            style={{
              padding: 10,
              fontSize: 15,
              marginBottom: 16,
              width: '100%',
              background: '#3a4a5d',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
            }}
          />

          {loading && <div style={{ opacity: 0.7 }}>Загрузка юнитов…</div>}

          {!loading && !error && availableUnits.length === 0 && (
            <div style={{ opacity: 0.6, fontSize: 15 }}>
              {units.length === 0
                ? 'В базе нет юнитов. Запустите npm run db:seed.'
                : 'Нет юнитов, подходящих под фильтр.'}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {availableUnits.map(unit => {
              const p1Allowed = canAdd(unit, 'player1');
              const p2Allowed = canAdd(unit, 'player2');

              return (
                <div
                  key={unit.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    background: '#3a4a5d',
                    padding: 12,
                    borderRadius: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 200, flex: '1 1 220px' }}>
                    <div style={{ fontSize: 16 }}>
                      <strong>{unit.name}</strong>{' '}
                      <span style={{ color: '#c9a227', fontWeight: 'bold' }}>{unit.points} очк.</span>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>
                      HP: {unit.maxHp} | Движ: {unit.movement} | Атк: {unit.attack} | Защ: {unit.defense}
                    </div>
                    {unit.specialRules && (
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, fontStyle: 'italic' }}>
                        {unit.specialRules}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {(['player1', 'player2'] as const).map(player => {
                      const allowed = player === 'player1' ? p1Allowed : p2Allowed;

                      return (
                        <button
                          key={player}
                          onClick={() => addUnit(unit, player)}
                          disabled={!allowed}
                          title={
                            allowed
                              ? `Добавить в ростер ${PLAYER_META[player].title}`
                              : `Не хватает очков: лимит ${POINTS_LIMIT}`
                          }
                          style={{
                            padding: '8px 12px',
                            cursor: allowed ? 'pointer' : 'not-allowed',
                            opacity: allowed ? 1 : 0.4,
                            borderRadius: 6,
                            border: 'none',
                            background: PLAYER_META[player].accent,
                            color: '#fff',
                            fontWeight: 'bold',
                          }}
                        >
                          {player === 'player1' ? 'В P1' : 'В P2'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ростеры игроков */}
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {renderRoster('player1')}
          {renderRoster('player2')}

          <button
            onClick={startGame}
            disabled={!canStart}
            title={canStart ? 'Перейти на игровое поле' : 'Каждый игрок должен взять хотя бы одного юнита'}
            style={{
              padding: 15,
              fontSize: 18,
              background: canStart ? '#c9a227' : '#5a5540',
              color: canStart ? '#000' : '#bdbdbd',
              border: 'none',
              borderRadius: 8,
              cursor: canStart ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
            }}
          >
            Начать игру
          </button>

          {!canStart && (
            <div style={{ fontSize: 13, opacity: 0.6, textAlign: 'center', marginTop: -6 }}>
              Оба игрока должны выбрать хотя бы одного юнита.
            </div>
          )}

          <div style={{ fontSize: 12, opacity: 0.45, textAlign: 'center' }}>
            Фракций в базе: {factions.length} · шаблонов юнитов: {units.length}
            {selectedFactionId && factionName.get(selectedFactionId)
              ? ` · выбрано: ${factionName.get(selectedFactionId)}`
              : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArmyBuilder;
