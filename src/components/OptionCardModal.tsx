// Полноэкранная карточка заклинания или снаряжения.
//
// armybuilder публикует для них единственное изображение карты (imageUrl):
// обратной стороны и текста правил в API нет, поэтому карточка односторонняя
// и показывает то, что реально есть в базе — стоимость, лимит и количество,
// а также (для снаряжения) выбранного носителя.
//
// Компонент общий для заклинаний и снаряжения: набор полей у них совпадает,
// различаются только подписи и наличие блока «носитель».

import { useEffect } from 'react';

/** Поля, общие для карточки заклинания и карточки снаряжения. */
export type OptionCardData = {
  slug: string;
  name: string;
  /** Стоимость в очках; у заклинаний её нет — они бесплатны. */
  points: number | null;
  limit: number;
  imageUrl: string | null;
  /** Название домена — показывается у заклинаний. */
  domainName?: string | null;
};

type OptionCardModalProps = {
  kind: 'spell' | 'equipment';
  option: OptionCardData;
  /** Сколько экземпляров уже в ростере. */
  quantity: number;
  factionName: string | null;
  heroName: string | null;
  /** Блок носителей — только для снаряжения. */
  bearerSection?: {
    bearers: { slug: string; name: string }[];
    /** Персонажи ростера, из которых можно выбирать. */
    candidates: { slug: string; name: string }[];
    onAssign: (bearerSlug: string | null) => void;
  };
  onClose: () => void;
};

const OptionCardModal = ({
  kind,
  option,
  quantity,
  factionName,
  heroName,
  bearerSection,
  onClose,
}: OptionCardModalProps) => {
  // Escape закрывает карточку — то же поведение, что и у карточки юнита.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isSpell = kind === 'spell';
  const titleId = isSpell ? 'spell-card-title' : 'equipment-card-title';
  const assignedBearer = bearerSection?.bearers[0] ?? null;

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
        aria-labelledby={titleId}
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 760,
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
            flex: '1 1 240px',
            minWidth: 220,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {option.imageUrl ? (
            <img
              src={option.imageUrl}
              alt={`Карта: ${option.name}`}
              style={{
                width: '100%',
                maxWidth: 300,
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
                maxWidth: 300,
                minHeight: 300,
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

          <div style={{ fontSize: 12, opacity: 0.55, textAlign: 'center' }}>
            {isSpell
              ? 'У заклинаний армибилдер публикует только одну сторону карты.'
              : 'У снаряжения армибилдер публикует только одну сторону карты.'}
          </div>
        </div>

        <div
          style={{
            flex: '2 1 300px',
            minWidth: 250,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <div>
              <h2 id={titleId} style={{ margin: 0, fontSize: 24 }}>
                {option.name}
              </h2>
              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                {[isSpell ? 'Заклинание' : 'Снаряжение', factionName, heroName]
                  .filter(Boolean)
                  .join(' · ')}
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
              {option.points === null ? (
                <strong style={{ color: '#8fb8a0' }}>бесплатно</strong>
              ) : (
                <>
                  <strong style={{ color: '#c9a227', fontSize: 18 }}>{option.points}</strong> очк.
                </>
              )}
            </div>
            <div
              style={{ padding: '8px 14px', borderRadius: 8, background: '#3a4a5d', fontSize: 14 }}
            >
              Лимит: <strong>{option.limit}</strong> шт.
            </div>
            <div
              style={{ padding: '8px 14px', borderRadius: 8, background: '#3a4a5d', fontSize: 14 }}
            >
              В ростере: <strong>{quantity}</strong>
            </div>
          </div>

          {isSpell && option.domainName && (
            <div
              style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: '#33404f' }}
            >
              Домен: {option.domainName}
            </div>
          )}

          {!isSpell && bearerSection && (
            <div
              style={{ fontSize: 13, padding: '10px 12px', borderRadius: 8, background: '#33404f' }}
            >
              <div style={{ marginBottom: 6, opacity: 0.85 }}>На кого надето</div>

              {bearerSection.candidates.length === 0 ? (
                <div style={{ opacity: 0.7 }}>
                  Сначала выберите лидера и юнитов — носить снаряжение пока некому.
                </div>
              ) : (
                <select
                  value={assignedBearer?.slug ?? ''}
                  onChange={event =>
                    bearerSection.onAssign(event.target.value === '' ? null : event.target.value)
                  }
                  style={{
                    width: '100%',
                    padding: 8,
                    fontSize: 14,
                    background: '#3a4a5d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                  }}
                >
                  <option value="">— в запасе (не надето) —</option>
                  {bearerSection.candidates.map(candidate => (
                    <option key={candidate.slug} value={candidate.slug}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              )}

              {quantity > 1 && (
                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>
                  Экземпляров: {quantity}. Носитель назначается основному экземпляру.
                </div>
              )}
            </div>
          )}

          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, opacity: 0.85 }}>Правила</h3>
            <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
              {isSpell
                ? 'Текст заклинания не публикуется API армибилдера — он напечатан только на изображении карты выше.'
                : 'Описание снаряжения не публикуется API армибилдера — оно напечатано только на изображении карты выше.'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default OptionCardModal;
