import { useEffect, useMemo, useState } from 'react';
import {
  API_BASE_URL,
  fetchDomains,
  fetchFactions,
  fetchFormats,
  fetchHeroDetail,
  fetchHeroes,
  type DomainDto,
  type FactionDto,
  type HeroCompanionDto,
  type HeroDetailDto,
  type HeroSummaryDto,
  type HeroUnitDto,
  type RosterFormatDto,
} from '../lib/api';
import {
  addCompanion,
  addEquipment,
  addUnit,
  assignEquipmentBearer,
  canAddCompanion,
  canAddEquipment,
  canAddSpell,
  canAddUnit,
  companionLimitFor,
  companionQuantityOf,
  createEmptySelection,
  equipmentBearersOf,
  expandUnitsForBattle,
  equipmentQuantityOf,
  quantityOf,
  removeCompanion,
  removeEquipment,
  removeUnit,
  removeUnitAll,
  rosterBearers,
  selectionPoints,
  selectionProblems,
  selectionSpellCount,
  selectionUnitCount,
  spellQuantityOf,
  spellSlotsLeft,
  SPELLS_PER_ROSTER,
  toggleSpell,
  uniqConflictFor,
  type RosterCompanionOption,
  type RosterSelection,
  type RosterUnitOption,
} from '../lib/rosterRules';
import { useGameStore } from '../store/gameStore';
import type { PlayerId } from '../types/game';
import OptionCardModal, { type OptionCardData } from './OptionCardModal';
import UnitCardModal from './UnitCardModal';

export type { PlayerId };

/** Ростеры обоих игроков: у каждого свой домен, фракция, лидер и набор юнитов. */
export type RosterMap = Record<PlayerId, RosterSelection>;

export const DEFAULT_FORMAT_POINTS = 200;

const PLAYER_META: Record<PlayerId, { title: string; side: string; accent: string }> = {
  player1: { title: 'Игрок 1', side: 'Синие', accent: '#4a6a8a' },
  player2: { title: 'Игрок 2', side: 'Красные', accent: '#8a4a4a' },
};

const createEmptyRosters = (formatPoints: number): RosterMap => ({
  player1: createEmptySelection(formatPoints),
  player2: createEmptySelection(formatPoints),
});

const panelStyle = {
  background: '#2a3a4d',
  padding: 16,
  borderRadius: 8,
} as const;

const selectStyle = {
  padding: 9,
  fontSize: 15,
  width: '100%',
  background: '#3a4a5d',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
} as const;

const smallButtonStyle = {
  padding: '4px 10px',
  fontSize: 13,
  cursor: 'pointer',
  background: 'transparent',
  color: '#fff',
  border: '1px solid #55708a',
  borderRadius: 6,
} as const;

/** Название юнита, оформленное как ссылка на его карточку. */
const unitNameButtonStyle = {
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: '#fff',
  font: 'inherit',
  cursor: 'pointer',
  textDecoration: 'underline dotted',
  textUnderlineOffset: 3,
} as const;

type ArmyBuilderProps = {
  /** Вызывается после того, как партия инициализирована в gameStore. */
  onStart: (rosters: RosterMap) => void;
  /** Позволяет вернуться к сборке, не теряя уже выбранных юнитов. */
  initialRosters?: RosterMap;
};

/**
 * Строка каталога подбора: обычный юнит лидера либо спутник, который
 * выводится сразу под своим родителем — как в разметке armybuilder.
 */
type CatalogRow =
  | { kind: 'unit'; unit: HeroUnitDto }
  | { kind: 'companion'; companion: HeroCompanionDto };

/** Что показать в модальной карточке: юнит лидера или спутник. */
type PreviewTarget = {
  /** Приведённое к RosterUnitOption описание — его ожидает UnitCardModal. */
  unit: RosterUnitOption;
  quantity: number;
  canAdd: boolean;
  blockedReason: string | null;
  add: () => void;
};

const ArmyBuilder = ({ onStart, initialRosters }: ArmyBuilderProps) => {
  const [activePlayer, setActivePlayer] = useState<PlayerId>('player1');
  const [formats, setFormats] = useState<RosterFormatDto[]>([]);
  const [domains, setDomains] = useState<DomainDto[]>([]);
  const [factions, setFactions] = useState<FactionDto[]>([]);
  const [heroes, setHeroes] = useState<HeroSummaryDto[]>([]);
  const [heroDetail, setHeroDetail] = useState<HeroDetailDto | null>(null);
  const [search, setSearch] = useState('');
  /** Юнит, чья полная карточка открыта поверх каталога. */
  const [previewUnitSlug, setPreviewUnitSlug] = useState<string | null>(null);
  /** Слаг заклинания, чья карточка открыта. */
  const [previewSpellSlug, setPreviewSpellSlug] = useState<string | null>(null);
  /** Слаг снаряжения, чья карточка открыта. */
  const [previewEquipmentSlug, setPreviewEquipmentSlug] = useState<string | null>(null);

  const [rosters, setRosters] = useState<RosterMap>(
    () => initialRosters ?? createEmptyRosters(DEFAULT_FORMAT_POINTS),
  );

  const startGameWithRosters = useGameStore(state => state.startGameWithRosters);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const selection = rosters[activePlayer];

  // Признак загрузки карточки лидера вычисляется из уже загруженных данных:
  // так эффект не вызывает setState синхронно.
  const detailLoading =
    selection.heroSlug !== null && heroDetail?.hero.slug !== selection.heroSlug;

  // Справочники ниже зависят от выбора, поэтому при его смене очищаем их
  // прямо в обработчиках, а не внутри эффекта.
  const resetDependentLists = () => {
    setFactions([]);
    setHeroes([]);
    setHeroDetail(null);
    setPreviewUnitSlug(null);
    setPreviewSpellSlug(null);
    setPreviewEquipmentSlug(null);
  };

  const changePlayer = (player: PlayerId) => {
    if (player === activePlayer) return;
    resetDependentLists();
    setSearch('');
    setActivePlayer(player);
  };

  const patchSelection = (updater: (current: RosterSelection) => RosterSelection) => {
    setRosters(previous => ({ ...previous, [activePlayer]: updater(previous[activePlayer]) }));
  };

  // Форматы, домены и фракции домена — первичная загрузка справочников.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      try {
        const [formatList, domainList] = await Promise.all([
          fetchFormats(controller.signal),
          fetchDomains(controller.signal),
        ]);

        if (cancelled) return;

        setFormats(formatList);
        setDomains(domainList);
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

  // Фракции выбранного домена активного игрока.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!selection.domainSlug) {
      return () => {
        controller.abort();
      };
    }

    fetchFactions(selection.domainSlug, controller.signal)
      .then(list => {
        if (!cancelled) setFactions(list);
      })
      .catch(loadError => {
        if (cancelled) return;
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить фракции.');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selection.domainSlug, reloadKey]);

  // Лидеры выбранной фракции.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!selection.factionSlug) {
      return () => {
        controller.abort();
      };
    }

    fetchHeroes(selection.factionSlug, controller.signal)
      .then(list => {
        if (!cancelled) setHeroes(list);
      })
      .catch(loadError => {
        if (cancelled) return;
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить лидеров.');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selection.factionSlug, reloadKey]);

  // Карточка выбранного лидера: юниты, заклинания, снаряжение.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!selection.heroSlug) {
      return () => {
        controller.abort();
      };
    }

    fetchHeroDetail(selection.heroSlug, controller.signal)
      .then(detail => {
        if (!cancelled) setHeroDetail(detail);
      })
      .catch(loadError => {
        if (cancelled) return;
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить лидера.');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selection.heroSlug, reloadKey]);

  const domainName = (slug: string | null) =>
    domains.find(domain => domain.slug === slug)?.name ?? slug ?? '';

  const formatPoints = selection.formatPoints;

  const applyFormat = (points: number) => {
    setRosters(previous => {
      const next = { ...previous };

      for (const player of ['player1', 'player2'] as const) {
        next[player] = { ...previous[player], formatPoints: points };
      }

      return next;
    });
  };

  const selectDomain = (slug: string) => {
    patchSelection(current => ({
      ...createEmptySelection(current.formatPoints),
      domainSlug: slug || null,
      domainName: slug ? domainName(slug) : null,
    }));
    setFactions([]);
    setHeroes([]);
    setHeroDetail(null);
    setPreviewUnitSlug(null);
    setPreviewSpellSlug(null);
    setPreviewEquipmentSlug(null);
  };

  const selectFaction = (slug: string) => {
    patchSelection(current => ({
      ...current,
      factionSlug: slug || null,
      factionName: factions.find(faction => faction.slug === slug)?.name ?? null,
      heroSlug: null,
      heroName: null,
      heroPoints: 0,
      units: [],
      // Спутники привязаны к юнитам прошлого лидера — сбрасываем вместе с ними.
      companions: [],
      spells: [],
      equipment: [],
    }));
    setHeroes([]);
    setHeroDetail(null);
    setPreviewUnitSlug(null);
    setPreviewSpellSlug(null);
    setPreviewEquipmentSlug(null);
  };

  const selectHero = (slug: string) => {
    // Повторный клик по уже выбранному лидеру не должен обнулять ростер.
    if ((slug || null) === selection.heroSlug) return;

    const hero = heroes.find(item => item.slug === slug);

    patchSelection(current => ({
      ...current,
      heroSlug: slug || null,
      heroName: hero?.name ?? null,
      heroPoints: hero?.points ?? 0,
      // У каждого лидера свой набор юнитов, спутников, заклинаний и
      // снаряжения, поэтому при смене лидера ростер начинается заново.
      units: [],
      companions: [],
      spells: [],
      equipment: [],
    }));
    // Карточки юнитов, заклинаний и снаряжения прошлого лидера не должны
    // висеть поверх нового каталога.
    setPreviewUnitSlug(null);
    setPreviewSpellSlug(null);
    setPreviewEquipmentSlug(null);
  };

  // Порядок как на armybuilder: API отдаёт юнитов уже отсортированными по
  // weight, поэтому здесь только фильтр по поиску.
  const availableUnits = useMemo(() => {
    if (!heroDetail) return [];
    const query = search.trim().toLowerCase();
    if (!query) return heroDetail.units;

    return heroDetail.units.filter(unit =>
      `${unit.name} ${unit.specialRules ?? ''}`.toLowerCase().includes(query),
    );
  }, [heroDetail, search]);

  // Спутники видны всегда — даже пока родителя нет в ростере: на armybuilder
  // они стоят сразу под родителем и лишь помечены как недоступные. Добавить
  // их можно только после покупки родителя (это проверяет canAddCompanion).
  const availableCompanions = useMemo<RosterCompanionOption[]>(() => {
    if (!heroDetail) return [];
    const query = search.trim().toLowerCase();

    return heroDetail.companions.filter(companion =>
      query ? companion.name.toLowerCase().includes(query) : true,
    );
  }, [heroDetail, search]);

  /**
   * Единый список каталога: каждый юнит и сразу за ним его спутники.
   * Так повторяется разметка armybuilder, где вложенные юниты выводятся
   * внутри списка, а не отдельной секцией.
   */
  const catalogRows = useMemo<CatalogRow[]>(() => {
    const companionsByParent = new Map<string, RosterCompanionOption[]>();

    for (const companion of availableCompanions) {
      const list = companionsByParent.get(companion.parentSlug) ?? [];
      list.push(companion);
      companionsByParent.set(companion.parentSlug, list);
    }

    for (const list of companionsByParent.values()) {
      list.sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name, 'ru'));
    }

    const rows: CatalogRow[] = [];
    const parentsShown = new Set<string>();

    for (const unit of availableUnits) {
      rows.push({ kind: 'unit', unit });
      parentsShown.add(unit.slug);

      for (const companion of companionsByParent.get(unit.slug) ?? []) {
        rows.push({ kind: 'companion', companion });
      }
    }

    // Поиск по имени спутника: родитель мог не попасть в фильтр, но сам
    // спутник всё равно нужно показать — иначе его не найти.
    for (const companion of availableCompanions) {
      if (parentsShown.has(companion.parentSlug)) continue;
      rows.push({ kind: 'companion', companion });
    }

    return rows;
  }, [availableUnits, availableCompanions]);

  const canStart =
    selectionProblems(rosters.player1).length === 0 && selectionProblems(rosters.player2).length === 0;

  const rosterPoints = selectionPoints(selection);
  const problems = selectionProblems(selection);

  // Карточку ищем в полном списке лидера, а не в отфильтрованном: смена
  // поискового запроса не должна закрывать открытую карточку. Спутник
  // открывается той же карточкой — она принимает любые юнит-подобные данные.
  const previewTarget: PreviewTarget | null = (() => {
    if (!previewUnitSlug || !heroDetail) return null;

    const unit = heroDetail.units.find(item => item.slug === previewUnitSlug);
    if (unit) {
      const verdict = canAddUnit(selection, unit);

      return {
        unit,
        quantity: quantityOf(selection, unit.slug),
        canAdd: verdict.allowed,
        blockedReason: verdict.reason,
        add: () => patchSelection(current => addUnit(current, unit)),
      };
    }

    const companion = heroDetail.companions.find(item => item.slug === previewUnitSlug);
    if (!companion) return null;

    const verdict = canAddCompanion(selection, companion);

    return {
      // Спутник описывается теми же полями, а «требование» — это его родитель.
      unit: {
        optionId: `companion:${companion.slug}`,
        unitId: companion.slug,
        slug: companion.slug,
        name: companion.name,
        points: companion.points,
        limit: companion.limit,
        weight: companion.weight,
        uniqKey: null,
        imageUrl: companion.imageUrl,
        cardImageUrl: companion.cardImageUrl,
        cardBackImageUrl: companion.cardBackImageUrl,
        specialRules: null,
        requires: [
          {
            slug: companion.parentSlug,
            name: companion.parentName,
            limit: companion.limit,
            points: null,
            weight: companion.parentWeight,
          },
        ],
      },
      quantity: companionQuantityOf(selection, companion.slug),
      canAdd: verdict.allowed,
      blockedReason: verdict.reason,
      add: () => patchSelection(current => addCompanion(current, companion)),
    };
  })();

  // Карточки заклинаний и снаряжения односторонние: armybuilder публикует для
  // них единственное изображение и не отдаёт текст правил. Данные берём из
  // полного списка лидера, чтобы смена поиска не закрывала открытую карточку.
  const previewSpellCard: OptionCardData | null = (() => {
    if (!previewSpellSlug || !heroDetail) return null;

    const spell = heroDetail.spells.find(item => item.slug === previewSpellSlug);
    if (!spell) return null;

    return {
      slug: spell.slug,
      name: spell.name,
      // Заклинания в armybuilder бесплатны — стоимость не показываем.
      points: null,
      limit: spell.limit,
      imageUrl: spell.imageUrl,
      domainName: spell.domainSlug ? domainName(spell.domainSlug) : null,
    };
  })();

  const previewEquipmentCard: OptionCardData | null = (() => {
    if (!previewEquipmentSlug || !heroDetail) return null;

    const item = heroDetail.equipment.find(entry => entry.slug === previewEquipmentSlug);
    if (!item) return null;

    return {
      slug: item.slug,
      name: item.name,
      points: item.points,
      limit: item.limit,
      imageUrl: item.imageUrl,
    };
  })();

  const startGame = () => {
    if (!canStart) return;

    startGameWithRosters(
      expandUnitsForBattle(rosters.player1),
      expandUnitsForBattle(rosters.player2),
    );
    onStart(rosters);
  };

  const renderPlayerTabs = () => (
    <div style={{ display: 'flex', gap: 8 }}>
      {(['player1', 'player2'] as const).map(player => {
        const meta = PLAYER_META[player];
        const isActive = player === activePlayer;
        const points = selectionPoints(rosters[player]);

        return (
          <button
            key={player}
            onClick={() => changePlayer(player)}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: 15,
              cursor: 'pointer',
              borderRadius: 8,
              border: `1px solid ${isActive ? meta.accent : '#3a4a5d'}`,
              background: isActive ? meta.accent : '#1a2634',
              color: '#fff',
              fontWeight: isActive ? 'bold' : 'normal',
            }}
          >
            {meta.title} · {points} / {rosters[player].formatPoints} очк.
          </button>
        );
      })}
    </div>
  );

  const renderHeroPicker = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {heroes.length === 0 && <div style={{ opacity: 0.6, fontSize: 14 }}>Выберите фракцию.</div>}

      {heroes.map(hero => {
        const isActive = hero.slug === selection.heroSlug;

        return (
          <button
            key={hero.id}
            onClick={() => selectHero(hero.slug)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 10,
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: 8,
              border: `1px solid ${isActive ? '#c9a227' : '#3a4a5d'}`,
              background: isActive ? '#4a3f1f' : '#3a4a5d',
              color: '#fff',
            }}
          >
            {hero.imageUrl && (
              <img
                src={hero.imageUrl}
                alt={hero.name}
                style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }}
              />
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15 }}>{hero.name}</span>
            </span>
            <span style={{ flexShrink: 0, textAlign: 'right' }}>
              <span style={{ display: 'block', color: '#c9a227', fontWeight: 'bold', fontSize: 16 }}>
                {hero.points}
              </span>
              <span style={{ display: 'block', fontSize: 11, opacity: 0.6 }}>очк.</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const renderUnitCatalog = () => {
    if (!selection.heroSlug) {
      return <div style={{ opacity: 0.6, fontSize: 14 }}>Выберите лидера, чтобы увидеть армию.</div>;
    }

    if (detailLoading) {
      return <div style={{ opacity: 0.7, fontSize: 14 }}>Загрузка армии лидера…</div>;
    }

    if (!heroDetail) return null;

    // Тело строки вынесено в функцию, чтобы каталог собирался единым списком:
    // спутники встают сразу под своим родителем, а не отдельной секцией.
    const renderUnitRow = (unit: HeroUnitDto) => {
      const quantity = quantityOf(selection, unit.slug);
      const verdict = canAddUnit(selection, unit);
      const conflict = uniqConflictFor(selection, unit);

      return (
        <div
          key={unit.slug}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#3a4a5d',
            padding: 10,
            borderRadius: 8,
            border: quantity > 0 ? '1px solid #c9a227' : '1px solid transparent',
            opacity: conflict ? 0.55 : 1,
          }}
        >
          <button
            onClick={() => setPreviewUnitSlug(unit.slug)}
            title={`Открыть карточку: ${unit.name}`}
            aria-label={`Открыть карточку: ${unit.name}`}
            style={{
              flexShrink: 0,
              padding: 0,
              width: 44,
              height: 44,
              border: '1px solid #55708a',
              borderRadius: 6,
              background: '#1a2634',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            {unit.imageUrl ? (
              <img
                src={unit.imageUrl}
                alt={unit.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: 10, opacity: 0.7 }}>карта</span>
            )}
          </button>

          <div style={{ flex: '1 1 200px', minWidth: 160 }}>
            <div style={{ fontSize: 15 }}>
              <button
                onClick={() => setPreviewUnitSlug(unit.slug)}
                style={unitNameButtonStyle}
              >
                {unit.name}
              </button>{' '}
              <span style={{ color: '#c9a227', fontWeight: 'bold' }}>{unit.points} очк.</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
              Доступно: {unit.limit}
              {unit.requires.length > 0 && (
                <> · требует: {unit.requires.map(item => item.name).join(', ')}</>
              )}
            </div>
            {(verdict.reason || conflict) && (
              <div style={{ fontSize: 11, color: '#e0a0a0', marginTop: 2 }}>
                {conflict ? `Взаимоисключающий вариант: ${conflict}` : verdict.reason}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => patchSelection(current => removeUnit(current, unit.slug))}
              disabled={quantity === 0}
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                border: 'none',
                cursor: quantity === 0 ? 'not-allowed' : 'pointer',
                opacity: quantity === 0 ? 0.4 : 1,
                background: '#55708a',
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              −
            </button>
            <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 'bold' }}>{quantity}</span>
            <button
              onClick={() => patchSelection(current => addUnit(current, unit))}
              disabled={!verdict.allowed}
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                border: 'none',
                cursor: verdict.allowed ? 'pointer' : 'not-allowed',
                opacity: verdict.allowed ? 1 : 0.4,
                background: PLAYER_META[activePlayer].accent,
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              +
            </button>
          </div>
        </div>
      );
    };

    // Спутник выводится сразу под родителем и виден всегда; добавить его
    // можно только после покупки родителя (canAddCompanion).
    const renderCompanionRow = (companion: HeroCompanionDto) => {
      const quantity = companionQuantityOf(selection, companion.slug);
      const verdict = canAddCompanion(selection, companion);
      const limit = companionLimitFor(selection, companion);

      return (
        <div
          key={`companion:${companion.slug}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            // Спутник визуально вложен в родителя, как на armybuilder.
            marginLeft: 28,
            background: '#33404f',
            padding: 10,
            borderRadius: 8,
            border: quantity > 0 ? '1px dashed #c9a227' : '1px dashed transparent',
            opacity: limit < 1 ? 0.55 : 1,
          }}
        >
          {/* Иконка спутника тоже открывает карточку — даже пока он
              недоступен: посмотреть карту можно всегда. */}
          <button
            onClick={() => setPreviewUnitSlug(companion.slug)}
            title={`Открыть карточку: ${companion.name}`}
            aria-label={`Открыть карточку: ${companion.name}`}
            style={{
              flexShrink: 0,
              padding: 0,
              width: 44,
              height: 44,
              border: '1px solid #55708a',
              borderRadius: 6,
              background: '#1a2634',
              cursor: 'pointer',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {companion.imageUrl ? (
              <img
                src={companion.imageUrl}
                alt={companion.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: 10, opacity: 0.7 }}>карта</span>
            )}
          </button>

          <div style={{ flex: '1 1 200px', minWidth: 160 }}>
            <div style={{ fontSize: 15 }}>
              <button
                onClick={() => setPreviewUnitSlug(companion.slug)}
                style={unitNameButtonStyle}
              >
                {companion.name}
              </button>{' '}
              <span style={{ color: '#c9a227', fontWeight: 'bold' }}>
                {companion.points} очк.
              </span>{' '}
              <span style={{ color: '#8fb8a0', fontSize: 12 }}>спутник</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
              Привязан к «{companion.parentName}» · доступно: {limit}
            </div>
            {verdict.reason && (
              <div style={{ fontSize: 11, color: '#e0a0a0', marginTop: 2 }}>{verdict.reason}</div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => patchSelection(current => removeCompanion(current, companion.slug))}
              disabled={quantity === 0}
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                border: 'none',
                cursor: quantity === 0 ? 'not-allowed' : 'pointer',
                opacity: quantity === 0 ? 0.4 : 1,
                background: '#55708a',
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              −
            </button>
            <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 'bold' }}>{quantity}</span>
            <button
              onClick={() => patchSelection(current => addCompanion(current, companion))}
              disabled={!verdict.allowed}
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                border: 'none',
                cursor: verdict.allowed ? 'pointer' : 'not-allowed',
                opacity: verdict.allowed ? 1 : 0.4,
                background: PLAYER_META[activePlayer].accent,
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              +
            </button>
          </div>
        </div>
      );
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {catalogRows.map(row =>
          row.kind === 'unit' ? renderUnitRow(row.unit) : renderCompanionRow(row.companion),
        )}

        {catalogRows.length === 0 && (
          <div style={{ opacity: 0.6, fontSize: 14 }}>Нет юнитов под фильтр.</div>
        )}
      </div>
    );
  };

  const renderOptions = () => {
    if (!heroDetail) return null;

    // Кому можно надеть снаряжение: лидер, выбранные юниты и спутники.
    // armybuilder не публикует ограничений по носителю, поэтому список
    // строится из текущего ростера.
    const bearerOptions = rosterBearers(selection);

    // Количество заклинаний строго фиксировано: 10 — обязательный минимум
    // и максимум одновременно.
    const spellCount = selectionSpellCount(selection);
    const slotsLeft = spellSlotsLeft(selection);

    /** Иконка карты — открывает модальную карточку заклинания/снаряжения. */
    const renderOptionIcon = (
      imageUrl: string | null,
      name: string,
      onOpen: () => void,
      size = 34,
    ) => (
      <button
        onClick={onOpen}
        title={`Открыть карточку: ${name}`}
        aria-label={`Открыть карточку: ${name}`}
        style={{
          flexShrink: 0,
          padding: 0,
          width: size,
          height: size,
          border: '1px solid #55708a',
          borderRadius: 5,
          background: '#1a2634',
          cursor: 'pointer',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: 9, opacity: 0.7 }}>карта</span>
        )}
      </button>
    );

    return (
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>
            Заклинания (бесплатно){' '}
            <span
              style={{
                fontSize: 13,
                fontWeight: 'bold',
                color: spellCount === SPELLS_PER_ROSTER ? '#8fce8f' : '#c9a227',
              }}
            >
              {spellCount} / {SPELLS_PER_ROSTER}
            </span>
          </h3>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6, lineHeight: 1.4 }}>
            {slotsLeft === 0
              ? 'Набор полон — игру можно начинать.'
              : `Нужно ровно ${SPELLS_PER_ROSTER} заклинаний: доберите ещё ${slotsLeft}.`}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {heroDetail.spells.map(spell => {
              const quantity = spellQuantityOf(selection, spell.slug);
              const verdict = canAddSpell(selection, spell);

              // Снять карту можно всегда, даже когда общий лимит уже набран:
              // иначе набор из 10 заклинаний нельзя было бы поменять.
              const clickable = verdict.allowed || quantity > 0;

              return (
                <div
                  key={spell.slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    fontSize: 13,
                    borderRadius: 6,
                    background: '#3a4a5d',
                    border: quantity > 0 ? '1px solid #c9a227' : '1px solid transparent',
                    opacity: verdict.allowed || quantity > 0 ? 1 : 0.55,
                  }}
                >
                  {renderOptionIcon(spell.imageUrl, spell.name, () =>
                    setPreviewSpellSlug(spell.slug),
                  )}

                  <button
                    onClick={() => setPreviewSpellSlug(spell.slug)}
                    style={{ ...unitNameButtonStyle, flex: '1 1 auto', minWidth: 0, textAlign: 'left' }}
                  >
                    {spell.name}
                  </button>

                  <button
                    onClick={() => patchSelection(current => toggleSpell(current, spell))}
                    disabled={!clickable}
                    title={verdict.reason ?? 'Щёлкните, чтобы взять или убрать'}
                    style={{
                      flexShrink: 0,
                      minWidth: 40,
                      padding: '4px 8px',
                      fontSize: 12,
                      borderRadius: 5,
                      border: 'none',
                      background: quantity > 0 ? '#c9a227' : '#55708a',
                      color: quantity > 0 ? '#000' : '#fff',
                      cursor: clickable ? 'pointer' : 'not-allowed',
                      opacity: clickable ? 1 : 0.5,
                    }}
                  >
                    {quantity > 0 ? `${quantity}/${spell.limit}` : `+ ${spell.limit}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>Снаряжение</h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {heroDetail.equipment.map(item => {
              const quantity = equipmentQuantityOf(selection, item.slug);
              const verdict = canAddEquipment(selection, item);
              const bearers = equipmentBearersOf(selection, item.slug);

              return (
                <div
                  key={item.slug}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    padding: '6px 8px',
                    fontSize: 13,
                    borderRadius: 6,
                    background: '#3a4a5d',
                    border: quantity > 0 ? '1px solid #c9a227' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {renderOptionIcon(item.imageUrl, item.name, () =>
                      setPreviewEquipmentSlug(item.slug),
                    )}

                    <button
                      onClick={() => setPreviewEquipmentSlug(item.slug)}
                      style={{
                        ...unitNameButtonStyle,
                        flex: '1 1 auto',
                        minWidth: 0,
                        textAlign: 'left',
                      }}
                    >
                      {item.name} <span style={{ color: '#c9a227' }}>{item.points}</span>
                    </button>

                    <span
                      style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                    >
                      <button
                        onClick={() =>
                          patchSelection(current => removeEquipment(current, item.slug))
                        }
                        disabled={quantity === 0}
                        style={{
                          width: 22,
                          height: 22,
                          border: 'none',
                          borderRadius: 4,
                          background: '#55708a',
                          color: '#fff',
                          cursor: quantity === 0 ? 'not-allowed' : 'pointer',
                          opacity: quantity === 0 ? 0.4 : 1,
                        }}
                      >
                        −
                      </button>
                      <span style={{ minWidth: 30, textAlign: 'center' }}>
                        {quantity}/{item.limit}
                      </span>
                      <button
                        onClick={() => patchSelection(current => addEquipment(current, item))}
                        disabled={!verdict.allowed}
                        style={{
                          width: 22,
                          height: 22,
                          border: 'none',
                          borderRadius: 4,
                          background: PLAYER_META[activePlayer].accent,
                          color: '#fff',
                          cursor: verdict.allowed ? 'pointer' : 'not-allowed',
                          opacity: verdict.allowed ? 1 : 0.4,
                        }}
                      >
                        +
                      </button>
                    </span>
                  </div>

                  {/* На кого надето: список только из выбранных персонажей. */}
                  {quantity > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ opacity: 0.7, flexShrink: 0 }}>Носитель:</span>
                      <select
                        value={bearers[0]?.slug ?? ''}
                        onChange={event =>
                          patchSelection(current =>
                            assignEquipmentBearer(
                              current,
                              item.slug,
                              event.target.value === '' ? null : event.target.value,
                            ),
                          )
                        }
                        title={
                          bearerOptions.length === 0
                            ? 'Сначала выберите лидера и юнитов'
                            : 'Кому надеть снаряжение'
                        }
                        style={{
                          flex: '1 1 auto',
                          minWidth: 0,
                          padding: '4px 6px',
                          fontSize: 12,
                          background: '#243243',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                        }}
                      >
                        <option value="">— в запасе —</option>
                        {bearerOptions.map(bearer => (
                          <option key={bearer.slug} value={bearer.slug}>
                            {bearer.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {verdict.reason && quantity > 0 && (
                    <div style={{ fontSize: 11, color: '#e0a0a0' }}>{verdict.reason}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderSelectionSummary = () => {
    const meta = PLAYER_META[activePlayer];
    const usedPercent = Math.min(100, Math.round((rosterPoints / formatPoints) * 100));

    return (
      <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>
            {meta.title} <span style={{ fontSize: 13, opacity: 0.7 }}>({meta.side})</span>
          </h3>
          <button
            onClick={() =>
              setRosters(previous => ({
                ...previous,
                [activePlayer]: createEmptySelection(previous[activePlayer].formatPoints),
              }))
            }
            style={smallButtonStyle}
          >
            Очистить
          </button>
        </div>

        <div style={{ fontSize: 14, opacity: 0.85 }}>
          {selection.heroName ?? 'Лидер не выбран'} · {rosterPoints} / {formatPoints} очков ·{' '}
          {selectionUnitCount(selection)} моделей
        </div>

        <div style={{ height: 6, borderRadius: 3, background: '#1a2634', overflow: 'hidden' }}>
          <div
            style={{
              width: `${usedPercent}%`,
              height: '100%',
              background: rosterPoints > formatPoints ? '#a33' : meta.accent,
              transition: 'width 180ms ease',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
          {selection.units.length === 0 && (
            <div style={{ opacity: 0.55 }}>Юниты не выбраны.</div>
          )}

          {selection.units.map(unit => (
            <div
              key={unit.slug}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                background: '#3a4a5d',
                padding: '5px 8px',
                borderRadius: 4,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {unit.quantity}× {unit.name}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ opacity: 0.7, fontSize: 12 }}>{unit.points * unit.quantity}</span>
                <button
                  onClick={() => patchSelection(current => removeUnitAll(current, unit.slug))}
                  aria-label={`Убрать ${unit.name}`}
                  style={{
                    width: 20,
                    height: 20,
                    border: 'none',
                    borderRadius: 4,
                    background: '#a33',
                    color: '#fff',
                    cursor: 'pointer',
                    lineHeight: '16px',
                  }}
                >
                  ×
                </button>
              </span>
            </div>
          ))}
          {selection.companions.map(companion => (
            <div
              key={`companion:${companion.slug}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                background: '#33404f',
                padding: '5px 8px',
                borderRadius: 4,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {companion.quantity}× {companion.name}{' '}
                <span style={{ fontSize: 11, opacity: 0.65 }}>(к «{companion.parentName}»)</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ opacity: 0.7, fontSize: 12 }}>
                  {companion.points * companion.quantity}
                </span>
                <button
                  onClick={() => patchSelection(current => removeCompanion(current, companion.slug))}
                  aria-label={`Убрать ${companion.name}`}
                  style={{
                    width: 20,
                    height: 20,
                    border: 'none',
                    borderRadius: 4,
                    background: '#a33',
                    color: '#fff',
                    cursor: 'pointer',
                    lineHeight: '16px',
                  }}
                >
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>

        {selection.spells.length > 0 && (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Заклинания: {selection.spells.map(spell => `${spell.name} (${spell.quantity})`).join(', ')}
          </div>
        )}

        {selection.equipment.length > 0 && (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Снаряжение:{' '}
            {selection.equipment
              .map(item => {
                const bearers = equipmentBearersOf(selection, item.slug);
                const bearerNote =
                  bearers.length > 0 ? ` → ${bearers.map(bearer => bearer.name).join(', ')}` : '';

                return `${item.name} (${item.quantity}${bearerNote})`;
              })
              .join(', ')}
          </div>
        )}

        {problems.length > 0 && (
          <div style={{ fontSize: 12, color: '#e0a0a0' }}>
            {problems.map(problem => (
              <div key={problem}>• {problem}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        padding: 20,
        fontFamily: 'sans-serif',
        background: '#0a1220',
        minHeight: '100vh',
        color: '#fff',
      }}
    >
      <h1 style={{ marginTop: 0, marginBottom: 4, fontSize: 32 }}>Сборка Ростера</h1>
      <p style={{ margin: 0, opacity: 0.7, fontSize: 15, lineHeight: 1.5 }}>
        Правила набора повторяют{' '}
        <a href="https://armybuilder.torn-world.com" style={{ color: '#7fb0d8' }}>
          armybuilder.torn-world.com
        </a>
        : домен → фракция → лидер → юниты с лимитами, заклинания и снаряжение. Каталог из{' '}
        <code style={{ background: '#1a2634', padding: '2px 6px', borderRadius: 4 }}>
          {API_BASE_URL}/api
        </code>
        .
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

      <div style={{ marginTop: 16, maxWidth: 520 }}>
        {renderPlayerTabs()}

        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, opacity: 0.8 }}>Формат:</span>
          {formats.map(format => {
            const isActive = format.points === formatPoints;

            return (
              <button
                key={format.id}
                onClick={() => applyFormat(format.points)}
                style={{
                  padding: '6px 14px',
                  fontSize: 14,
                  cursor: 'pointer',
                  borderRadius: 6,
                  border: `1px solid ${isActive ? '#c9a227' : '#3a4a5d'}`,
                  background: isActive ? '#4a3f1f' : '#1a2634',
                  color: '#fff',
                  fontWeight: isActive ? 'bold' : 'normal',
                }}
              >
                {format.points}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{ display: 'flex', gap: 20, marginTop: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}
      >
        {/* Каталог */}
        <div style={{ flex: '2 1 620px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={panelStyle}>
            <h2 style={{ marginTop: 0, fontSize: 20 }}>1. Домен и фракция</h2>

            <select
              value={selection.domainSlug ?? ''}
              onChange={event => selectDomain(event.target.value)}
              disabled={loading || domains.length === 0}
              style={{ ...selectStyle, marginBottom: 10 }}
            >
              <option value="">Выберите домен…</option>
              {domains.map(domain => (
                <option key={domain.id} value={domain.slug}>
                  {domain.name}
                </option>
              ))}
            </select>

            <select
              value={selection.factionSlug ?? ''}
              onChange={event => selectFaction(event.target.value)}
              disabled={!selection.domainSlug || factions.length === 0}
              style={selectStyle}
            >
              <option value="">Выберите фракцию…</option>
              {factions.map(faction => (
                <option key={faction.id} value={faction.slug}>
                  {faction.name}
                </option>
              ))}
            </select>

            {domains.length === 0 && !error && (
              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.6 }}>
                Каталог пуст. Запустите npm run db:seed.
              </div>
            )}
          </div>

          <div style={panelStyle}>
            <h2 style={{ marginTop: 0, fontSize: 20 }}>2. Лидер</h2>
            {renderHeroPicker()}
          </div>

          <div style={panelStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
                marginBottom: 10,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20 }}>3. Юниты</h2>
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Поиск по названию…"
                style={{ ...selectStyle, width: 220 }}
              />
            </div>
            {renderUnitCatalog()}
          </div>

          <div style={panelStyle}>
            <h2 style={{ marginTop: 0, fontSize: 20 }}>4. Заклинания и снаряжение</h2>
            {heroDetail ? renderOptions() : (
              <div style={{ opacity: 0.6, fontSize: 14 }}>Сначала выберите лидера.</div>
            )}
          </div>
        </div>

        {/* Ростеры */}
        <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {renderSelectionSummary()}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: 13,
              opacity: 0.75,
            }}
          >
            <span>Синие: {selectionPoints(rosters.player1)} очк.</span>
            <span>Красные: {selectionPoints(rosters.player2)} очк.</span>
          </div>

          <button
            onClick={startGame}
            disabled={!canStart}
            title={
              canStart
                ? 'Перейти на игровое поле'
                : 'У каждого игрока должен быть лидер и хотя бы один юнит в пределах бюджета'
            }
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
              Оба игрока должны выбрать лидера и юнитов в пределах бюджета.
            </div>
          )}

          <div style={{ fontSize: 12, opacity: 0.45, textAlign: 'center' }}>
            Доменов: {domains.length} · форматов: {formats.length}
            {heroDetail ? ` · у лидера ${heroDetail.units.length} юнитов` : ''}
          </div>
        </div>
      </div>

      {previewTarget && (
        <UnitCardModal
          // Смена юнита должна открывать карточку снова с лицевой стороны.
          key={previewTarget.unit.slug}
          unit={previewTarget.unit}
          quantity={previewTarget.quantity}
          canAdd={previewTarget.canAdd}
          blockedReason={previewTarget.blockedReason}
          factionName={selection.factionName}
          heroName={selection.heroName}
          onAdd={previewTarget.add}
          onClose={() => setPreviewUnitSlug(null)}
        />
      )}

      {previewSpellCard && (
        <OptionCardModal
          kind="spell"
          option={previewSpellCard}
          quantity={spellQuantityOf(selection, previewSpellCard.slug)}
          factionName={selection.factionName}
          heroName={selection.heroName}
          onClose={() => setPreviewSpellSlug(null)}
        />
      )}

      {previewEquipmentCard && (
        <OptionCardModal
          kind="equipment"
          option={previewEquipmentCard}
          quantity={equipmentQuantityOf(selection, previewEquipmentCard.slug)}
          factionName={selection.factionName}
          heroName={selection.heroName}
          bearerSection={{
            bearers: equipmentBearersOf(selection, previewEquipmentCard.slug),
            candidates: rosterBearers(selection),
            onAssign: bearerSlug =>
              patchSelection(current =>
                assignEquipmentBearer(current, previewEquipmentCard.slug, bearerSlug),
              ),
          }}
          onClose={() => setPreviewEquipmentSlug(null)}
        />
      )}
    </div>
  );
};

export default ArmyBuilder;
