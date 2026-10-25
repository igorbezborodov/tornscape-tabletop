// Типизированный клиент для REST API бэкенда (server/index.ts).
// Фронтенд обращается к API напрямую: на сервере включён `cors()`,
// поэтому прокси в vite.config.ts не нужен.

export type FactionDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type UnitDto = {
  id: string;
  name: string;
  factionId: string;
  hp: number;
  maxHp: number;
  movement: number;
  attack: number;
  defense: number;
  points: number;
  specialRules: string | null;
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

export const fetchFactions = (signal?: AbortSignal): Promise<FactionDto[]> =>
  request<FactionDto[]>('/api/factions', signal);

export const fetchUnits = (signal?: AbortSignal): Promise<UnitDto[]> =>
  request<UnitDto[]>('/api/units', signal);
