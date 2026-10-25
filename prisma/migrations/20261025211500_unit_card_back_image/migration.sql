-- Обратная сторона двусторонней карты юнита.
-- armybuilder отдаёт её в hero_details.json как card_back_image_path,
-- поэтому поле просто хранит готовый URL (как и cardImageUrl).
ALTER TABLE "units" ADD COLUMN "cardBackImageUrl" TEXT;
