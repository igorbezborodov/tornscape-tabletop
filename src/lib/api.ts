// Типизированный клиент для REST API бэкенда (server/index.ts).
// Фронтенд обращается к API напрямую: на сервере включён `cors()`,
// поэтому прокси в vite.config.ts не нужен.
//
// Структура ответов повторяет публичный каталог armybuilder.torn-world.com:
// домен → фракция → лидер → доступные юниты / заклинания / снаряжение.

export type DomainDto = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  factionCount: number;
};

export type FactionDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  domainId: string | null;
  domainSlug: string | null;
  sortOrder: number;
  heroCount: number;
};

export type HeroSummaryDto = {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  points: number;
  imageUrl: string | null;
  cardImageUrl: string | null;
  factionId: string;
  factionSlug: string;
  factionName: string;
  domainSlug: string | null;
  unitCount: number;
  spellCount: number;
  equipmentCount: number;
};

export type UnitRequirementDto = {
  slug: string;
  name: string;
  limit: number;
  points: number | null;
  /** Порядок в списке у armybuilder (по возрастанию). */
  weight: number;
};

export type HeroUnitDto = {
  optionId: string;
  unitId: string;
  slug: string;
  name: string;
  points: number;
  limit: number;
  /** Порядок в списке выбора: armybuilder сортирует по weight по возрастанию. */
  weight: number;
  uniqKey: string | null;
  imageUrl: string | null;
  cardImageUrl: string | null;
  /** Обратная сторона двусторонней карты. */
  cardBackImageUrl: string | null;
  specialRules: string | null;
  requires: UnitRequirementDto[];
};

export type HeroSpellDto = {
  optionId: string;
  spellId: string;
  slug: string;
  name: string;
  limit: number;
  /** Порядок в списке заклинаний (по возрастанию). */
  weight: number;
  domainSlug: string | null;
  imageUrl: string | null;
};

export type HeroEquipmentDto = {
  optionId: string;
  equipmentId: string;
  slug: string;
  name: string;
  points: number;
  limit: number;
  /** Порядок в списке снаряжения (по возрастанию). */
  weight: number;
  imageUrl: string | null;
};

/** Привязанный юнит: открывается только после добавления родителя. */
export type HeroCompanionDto = {
  slug: string;
  name: string;
  /** Стоимость одной модели в очках. */
  points: number;
  parentSlug: string;
  parentName: string;
  /** weight родителя — спутник выводится сразу под ним. */
  parentWeight: number;
  limit: number;
  /** Собственный weight спутника (порядок среди «детей» родителя). */
  weight: number;
  imageUrl: string | null;
  cardImageUrl: string | null;
  cardBackImageUrl: string | null;
};

export type HeroDetailDto = {
  hero: HeroSummaryDto;
  units: HeroUnitDto[];
  companions: HeroCompanionDto[];
  spells: HeroSpellDto[];
  equipment: HeroEquipmentDto[];
};

export type RosterFormatDto = {
  id: string;
  points: number;
  isDefault: boolean;
};

export type CatalogSummaryDto = {
  domains: number;
  factions: number;
  heroes: number;
  units: number;
  spells: number;
  equipment: number;
  formats: RosterFormatDto[];
};

/**
 * Базовый адрес API. Переопределяется через `VITE_API_URL`
 * (например, при деплое бэкенда на другой домен).
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * Человеко-читаемая причина сетевой ошибки: помогает отличить
 * «бэкенд не запущен» от ошибки самого API.
 */
const describeNetworkError = (path: string): string => {
  const hint = API_BASE_URL.includes('localhost')
    ? ' Проверьте, что бэкенд запущен (npm run dev:back, порт 3001).'
    : ` Проверьте, что API доступен по адресу ${API_BASE_URL}.`;
  return `Не удалось получить данные (${path}).${hint}`;
};

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(describeNetworkError(path));
  }

  if (!response.ok) {
    throw new Error(`API вернул ошибку ${response.status} при запросе ${path}.`);
  }

  return (await response.json()) as T;
}

export const fetchDomains = (signal?: AbortSignal): Promise<DomainDto[]> =>
  request<DomainDto[]>('/api/domains', signal);

export const fetchFactions = (domainSlug?: string, signal?: AbortSignal): Promise<FactionDto[]> =>
  request<FactionDto[]>(
    domainSlug ? `/api/factions?domainSlug=${encodeURIComponent(domainSlug)}` : '/api/factions',
    signal,
  );

export const fetchHeroes = (factionSlug?: string, signal?: AbortSignal): Promise<HeroSummaryDto[]> =>
  request<HeroSummaryDto[]>(
    factionSlug ? `/api/heroes?factionSlug=${encodeURIComponent(factionSlug)}` : '/api/heroes',
    signal,
  );

export const fetchHeroDetail = (heroSlug: string, signal?: AbortSignal): Promise<HeroDetailDto> =>
  request<HeroDetailDto>(`/api/heroes/${encodeURIComponent(heroSlug)}`, signal);

export const fetchFormats = (signal?: AbortSignal): Promise<RosterFormatDto[]> =>
  request<RosterFormatDto[]>('/api/formats', signal);

export const fetchCatalogSummary = (signal?: AbortSignal): Promise<CatalogSummaryDto> =>
  request<CatalogSummaryDto>('/api/catalog', signal);
