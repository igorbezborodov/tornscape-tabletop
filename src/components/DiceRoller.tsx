import { useState } from 'react';
import { DIE_META, FACE_LABEL, countAnySuccess, countCriticals, countSuccesses, rollPool } from '../lib/dice';
import type { DicePool, DieResult, DieType } from '../types/game';

// Виды кубиков в порядке отображения — по правилам их четыре.
const DIE_ORDER: DieType[] = ['attack', 'defense', 'agility', 'mastery'];

const faceSymbol = (face: DieResult['face']): string =>
  face === 'critical' ? '✷' : face === 'success' ? '✔' : '·';

const faceCaption = (face: DieResult['face']): string =>
  face === 'critical' ? 'Крит' : face === 'success' ? 'Успех' : '—';

// Свободный бросок пула: нужен, когда кубики бросаются вне конкретной атаки
// (Тест на Панику, Тест Ловкости, проверки сценария).
const DiceRoller = () => {
  const [pool, setPool] = useState<DicePool>({ attack: 2, defense: 0, agility: 0, mastery: 0 });
  const [results, setResults] = useState<DieResult[] | null>(null);
  const [rolling, setRolling] = useState(false);

  const change = (type: DieType, value: number) => {
    setPool(previous => ({ ...previous, [type]: Math.max(0, Math.min(10, value)) }));
  };

  const roll = () => {
    setRolling(true);
    setResults(null);
    setTimeout(() => {
      setResults(rollPool(pool));
      setRolling(false);
    }, 350);
  };

  const empty = DIE_ORDER.every(type => (pool[type] ?? 0) === 0);

  return (
    <div style={{ padding: 18, background: '#2a3a4d', borderRadius: 8, minWidth: 280, fontSize: 17 }}>
      <h3 style={{ marginTop: 0, color: '#fff', fontSize: 22 }}>Кубики Торна</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 12 }}>
        {DIE_ORDER.map(type => {
          const meta = DIE_META[type];
          return (
            <div key={type} style={{ display: 'contents' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dbeafe' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: meta.color,
                    border: '1px solid #0a1220',
                  }}
                />
                {meta.glyph} {meta.label}
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={pool[type] ?? 0}
                onChange={event => change(type, Number(event.target.value) || 0)}
                style={{ width: 58, padding: '6px 8px', fontSize: 16 }}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={roll}
        disabled={rolling || empty}
        style={{
          width: '100%',
          padding: '10px 18px',
          fontSize: 17,
          cursor: rolling || empty ? 'not-allowed' : 'pointer',
          opacity: rolling || empty ? 0.6 : 1,
          borderRadius: 8,
          border: '1px solid #55708a',
          background: '#c9a227',
          color: '#101820',
          fontWeight: 'bold',
        }}
      >
        {rolling ? 'Бросок…' : 'Бросить пул'}
      </button>

      {results && !rolling && (
        <div style={{ marginTop: 14, color: '#fff' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {results.map(die => {
              const meta = DIE_META[die.type];
              return (
                <span
                  key={die.id}
                  title={`${meta.label}: ${FACE_LABEL[die.face]}`}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 46,
                    borderRadius: 6,
                    fontSize: 16,
                    lineHeight: 1.1,
                    color: die.type === 'defense' ? '#101820' : '#fff',
                    background: meta.color,
                    border: die.face === 'critical' ? '2px solid #c9a227' : '1px solid #0a1220',
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 'bold' }}>{faceSymbol(die.face)}</span>
                  <span style={{ fontSize: 10, opacity: 0.9 }}>{faceCaption(die.face)}</span>
                </span>
              );
            })}
          </div>

          <div style={{ marginTop: 10, fontSize: 15, opacity: 0.85 }}>
            Успехи: {countSuccesses(results)} · Криты: {countCriticals(results)} · Любой успех:{' '}
            {countAnySuccess(results)}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.6 }}>
            Крит на Кубике Защиты отменяет любой успех атаки; Крит на Кубике Атаки даёт Маркер Веры.
          </div>
        </div>
      )}
    </div>
  );
};

export default DiceRoller;
