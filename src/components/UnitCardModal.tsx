// Полноэкранная карточка юнита: изображение карты, стоимость, лимит
// и требования. armybuilder публикует только изображение карты — текста
// умений и параметров боя в API нет, поэтому они показываются как есть
// (или рассчитываются для прототипа настольной игры).
//
// Карты в Tornscape двусторонние: лицо с портретом и «рубашка» с текстом
// умений. Обе стороны приходят из API (card_image_path /
// card_back_image_path), поэтому карточку можно переворачивать.
//
// Внизу рубашки напечатаны теги юнита. Отдельного поля для них в API нет
// (проверены hero_details.json, unit_details.json, select_units.json и
// api/dict/v1/*), поэтому теги берутся из ручного реестра src/lib/unitTags.ts,
// а если их там ещё нет — показываем подсказку и ссылку на рубашку крупно.

import { useEffect, useState } from 'react';
import { deriveCombatStats, type RosterUnitOption } from '../lib/rosterRules';
import { unitTagsOf } from '../lib/unitTags';

type UnitCardModalProps = {
  unit: RosterUnitOption;
  /** Сколько моделей этого юнита уже в ростере. */
  quantity: number;
  /** Можно ли добавить ещё одну модель (лимит/очки/уникальность). */
  canAdd: boolean;
  /** Причина, по которой добавить нельзя. */
  blockedReason: string | null;
  factionName: string | null;
  heroName: string | null;
  onAdd: () => void;
  onClose: () => void;
};

const statLabels: { key: 'maxHp' | 'movement' | 'attack' | 'defense'; label: string }[] = [
  { key: 'maxHp', label: 'Здоровье' },
  { key: 'movement', label: 'Движение' },
  { key: 'attack', label: 'Атака' },
  { key: 'defense', label: 'Защита' },
];

const UnitCardModal = ({
  unit,
  quantity,
  canAdd,
  blockedReason,
  factionName,
  heroName,
  onAdd,
  onClose,
}: UnitCardModalProps) => {
  /** Какая сторона карты показана. */
  const [side, setSide] = useState<'front' | 'back'>('front');
  /** Показывать ли изображение стороны карты на весь экран (чтобы прочитать теги). */
  const [zoomed, setZoomed] = useState(false);

  // Escape сначала закрывает увеличенное изображение, затем саму карточку.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (zoomed) {
        setZoomed(false);
        return;
      }
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, zoomed]);

  const stats = deriveCombatStats(unit.points);
  const tags = unitTagsOf(unit.slug);
  const frontImage = unit.cardImageUrl ?? unit.imageUrl;
  const backImage = unit.cardBackImageUrl;
  const hasBack = Boolean(backImage);
  const shownSide: 'front' | 'back' = hasBack && side === 'back' ? 'back' : 'front';
  const card = shownSide === 'back' ? backImage : frontImage;

  /** Переключает сторону только если у карты действительно есть обратная. */
  const flip = () => {
    if (!hasBack) return;
    setSide(current => (current === 'front' ? 'back' : 'front'));
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(6, 12, 20, 0.78)',
        overflowY: 'auto',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unit-card-title"
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 860,
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          padding: 20,
          borderRadius: 12,
          background: '#243243',
          border: '1px solid #3a4a5d',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
      >
        <div
          style={{
            flex: '1 1 260px',
            minWidth: 240,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button
            onClick={flip}
            disabled={!hasBack}
            title={hasBack ? 'Перевернуть карточку' : 'Обратная сторона недоступна'}
            aria-label={hasBack ? 'Перевернуть карточку' : 'Обратная сторона недоступна'}
            style={{
              padding: 0,
              width: '100%',
              maxWidth: 320,
              display: 'block',
              border: 'none',
              background: 'transparent',
              cursor: hasBack ? 'pointer' : 'default',
            }}
          >
            {card ? (
              <img
                src={card}
                alt={`${unit.name} — ${shownSide === 'back' ? 'обратная сторона' : 'лицевая сторона'}`}
                style={{
                  width: '100%',
                  maxWidth: 320,
                  height: 'auto',
                  borderRadius: 10,
                  background: '#1a2634',
                  objectFit: 'contain',
                  display: 'block',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  maxWidth: 320,
                  minHeight: 320,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 10,
                  background: '#1a2634',
                  opacity: 0.6,
                  fontSize: 14,
                }}
              >
                Изображение недоступно
              </div>
            )}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ opacity: 0.6 }}>
              {shownSide === 'back' ? 'Обратная сторона' : 'Лицевая сторона'}
            </span>
            <button
              onClick={flip}
              disabled={!hasBack}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                borderRadius: 8,
                border: '1px solid #55708a',
                background: hasBack ? '#3a4a5d' : 'transparent',
                color: hasBack ? '#fff' : '#8b95a1',
                cursor: hasBack ? 'pointer' : 'not-allowed',
              }}
            >
              Перевернуть
            </button>
          </div>
        </div>

        <div style={{ flex: '2 1 320px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h2 id="unit-card-title" style={{ margin: 0, fontSize: 24 }}>
                {unit.name}
              </h2>
              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                {[factionName, heroName].filter(Boolean).join(' · ') || 'Без лидера'}
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Закрыть карточку"
              style={{
                width: 32,
                height: 32,
                flexShrink: 0,
                border: 'none',
                borderRadius: 6,
                background: '#3a4a5d',
                color: '#fff',
                fontSize: 18,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: '#3a4a5d',
                fontSize: 14,
              }}
            >
              Стоимость:{' '}
              <strong style={{ color: '#c9a227', fontSize: 18 }}>{unit.points}</strong> очк.
            </div>
            <div style={{ padding: '8px 14px', borderRadius: 8, background: '#3a4a5d', fontSize: 14 }}>
              Лимит: <strong>{unit.limit}</strong> шт.
            </div>
            <div style={{ padding: '8px 14px', borderRadius: 8, background: '#3a4a5d', fontSize: 14 }}>
              В ростере: <strong>{quantity}</strong>
            </div>
          </div>

          {unit.requires.length > 0 && (
            <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: '#33404f' }}>
              <div style={{ marginBottom: 4, opacity: 0.8 }}>Идёт в комплекте:</div>
              {unit.requires.map(item => (
                <div key={item.slug}>
                  • {item.name}
                  {item.limit > 0 ? ` — до ${item.limit} шт.` : ''}
                  {item.points !== null ? ` (${item.points} очк.)` : ''}
                </div>
              ))}
            </div>
          )}

          {unit.uniqKey && (
            <div style={{ fontSize: 13, color: '#e0c98a' }}>
              Взаимоисключающий вариант: можно взять только один юнит с ключом «{unit.uniqKey}».
            </div>
          )}

          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, opacity: 0.85 }}>
              Параметры боя (прототип)
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {statLabels.map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    minWidth: 86,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#1a2634',
                    fontSize: 13,
                  }}
                >
                  <div style={{ opacity: 0.65 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 'bold' }}>{stats[key]}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.5 }}>
              armybuilder публикует только стоимость и лимиты, поэтому боевые значения
              рассчитаны из цены юнита.
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, opacity: 0.85 }}>Умения</h3>
            <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
              {unit.specialRules ??
                (hasBack
                  ? 'Текст умений не публикуется API — переверните карточку, он напечатан на обратной стороне.'
                  : 'Текст умений не публикуется API — он есть только на изображении карты выше.')}
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, opacity: 0.85 }}>
              Теги <span style={{ opacity: 0.55, fontWeight: 'normal' }}>(внизу обратной стороны)</span>
            </h3>
            {tags.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tags.map(tag => (
                  <span
                    key={tag}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: '#1a2634',
                      border: '1px solid #55708a',
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
                API не отдаёт теги текстом — они напечатаны на изображении рубашки.{' '}
                {hasBack ? (
                  <button
                    onClick={() => {
                      setSide('back');
                      setZoomed(true);
                    }}
                    style={{
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: '#e0c98a',
                      fontSize: 12,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                  >
                    Открыть рубашку крупно
                  </button>
                ) : (
                  'У этой карты обратной стороны нет.'
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
            <button
              onClick={onAdd}
              disabled={!canAdd}
              style={{
                padding: '10px 18px',
                fontSize: 15,
                fontWeight: 'bold',
                border: 'none',
                borderRadius: 8,
                cursor: canAdd ? 'pointer' : 'not-allowed',
                background: canAdd ? '#c9a227' : '#5a5540',
                color: canAdd ? '#000' : '#bdbdbd',
              }}
            >
              Добавить в ростер
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '10px 18px',
                fontSize: 15,
                background: 'transparent',
                color: '#fff',
                border: '1px solid #55708a',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Закрыть
            </button>
            {!canAdd && blockedReason && (
              <span style={{ fontSize: 12, color: '#e0a0a0' }}>{blockedReason}</span>
            )}
          </div>
        </div>

        {zoomed && card && (
          <div
            role="presentation"
            onClick={() => setZoomed(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
              background: 'rgba(3, 7, 12, 0.94)',
              cursor: 'zoom-out',
            }}
          >
            <img
              src={card}
              alt={`${unit.name} — ${shownSide === 'back' ? 'обратная сторона' : 'лицевая сторона'} крупно`}
              style={{
                maxWidth: '98vw',
                maxHeight: '96vh',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: 8,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default UnitCardModal;
