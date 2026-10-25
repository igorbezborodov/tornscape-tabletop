import { useState } from 'react';
import { rollDice } from '../lib/dice';

const DiceRoller = () => {
  const [count, setCount] = useState(2);
  const [sides, setSides] = useState(6);
  const [results, setResults] = useState<number[] | null>(null);
  const [rolling, setRolling] = useState(false);

  const roll = () => {
    setRolling(true);
    setResults(null);
    setTimeout(() => {
      setResults(rollDice(count, sides));
      setRolling(false);
    }, 400);
  };

  const total = results?.reduce((s, v) => s + v, 0) ?? 0;

  return (
    <div style={{ padding: 18, background: '#2a3a4d', borderRadius: 8, minWidth: 280, fontSize: 17 }}>
      <h3 style={{ marginTop: 0, color: '#fff', fontSize: 22 }}>Кубики</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <input type="number" min={1} max={10} value={count}
               onChange={e => setCount(+e.target.value || 1)}
               style={{ width: 64, padding: '8px 10px', fontSize: 17 }} />
        <span style={{ color: '#fff' }}>× d</span>
        <input type="number" min={2} max={20} value={sides}
               onChange={e => setSides(+e.target.value || 6)}
               style={{ width: 64, padding: '8px 10px', fontSize: 17 }} />
      </div>
      <button onClick={roll} disabled={rolling}
              style={{ padding: '12px 24px', fontSize: 18, cursor: 'pointer' }}>
        {rolling ? 'Бросок...' : 'Бросить'}
      </button>
      {results && !rolling && (
        <div style={{ marginTop: 14, color: '#fff' }}>
          <div style={{ opacity: 0.8, fontSize: 17 }}>Кубики: [{results.join(', ')}]</div>
          <div style={{ fontSize: 26, fontWeight: 'bold' }}>Сумма: {total}</div>
        </div>
      )}
    </div>
  );
};

export default DiceRoller;