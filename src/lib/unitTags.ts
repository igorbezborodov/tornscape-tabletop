// Теги юнитов (то, что напечатано внизу обратной стороны карты).
//
// armybuilder не публикует теги ни в одном эндпоинте: в hero_details.json
// у юнита есть только id, tech_name, name, quantity, point_cost, image_path,
// card_image_path, card_back_image_path, requires_units и weight. Запросы
// unit_details.json / select_units.json отвечают 406/404, api/dict/v1/* — 404.
// Поэтому теги существуют только на изображении рубашки карты и не могут быть
// получены автоматически.
//
// Здесь — реестр ручных значений: ключ это slug юнита (tech_name), значение —
// список тегов ровно в том виде, как они напечатаны на карте. Заполнять по мере
// необходимости, UI подхватит изменения без миграций.

// Пример заполнения:
//   houndmaster: ['Пехота', 'Отряд'],
export const UNIT_TAGS: Record<string, string[]> = {};

/** Теги юнита, если они занесены в реестр. */
export const unitTagsOf = (slug: string): string[] => UNIT_TAGS[slug] ?? [];
