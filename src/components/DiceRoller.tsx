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
    <div style={{ padding: 16, background: '#2a3a4d', borderRadius: 8, minWidth: 240 }}>
      <h3 style={{ marginTop: 0, color: '#fff' }}>Кубики</h3>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <input type="number" min={1} max={10} value={count}
               onChange={e => setCount(+e.target.value || 1)}
               style={{ width: 56, padding: 6 }} />
        <span style={{ color: '#fff' }}>× d</span>
        <input type="number" min={2} max={20} value={sides}
               onChange={e => setSides(+e.target.value || 6)}
               style={{ width: 56, padding: 6 }} />
      </div>
      <button onClick={roll} disabled={rolling}
              style={{ padding: '10px 20px', fontSize: 16, cursor: 'pointer' }}>
        {rolling ? 'Бросок...' : 'Бросить'}
      </button>
      {results && !rolling && (
        <div style={{ marginTop: 12, color: '#fff' }}>
          <div style={{ opacity: 0.8 }}>Кубики: [{results.join(', ')}]</div>
          <div style={{ fontSize: 22, fontWeight: 'bold' }}>Сумма: {total}</div>
        </div>
      )}
    </div>
  );
};

export default DiceRoller;