import HexGrid from './components/HexGrid';
import DiceRoller from './components/DiceRoller';
import { useGameStore } from './store/gameStore';

function App() {
  const { units, activeUnitId, currentPlayer, hasActivated, logs, endTurn } = useGameStore();
  const active = units.find(u => u.id === activeUnitId);

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', background: '#0a1220', minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 20 }}>
        Tornscape — Прототип
        <span style={{ fontSize: '18px', background: currentPlayer === 'player1' ? '#4a6a8a' : '#8a4a4a', padding: '5px 15px', borderRadius: '20px' }}>
          Ход: {currentPlayer === 'player1' ? 'Игрок 1 (Синие)' : 'Игрок 2 (Красные)'}
        </span>
      </h1>
      
      <p style={{ opacity: 0.7 }}>
        Кликните по своему юниту. Синие гексы — движение, Красные — атака. После действия нажмите "Завершить ход".
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 20 }}>
        <div style={{ flex: '1 1 600px' }}>
          <HexGrid />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '320px' }}>
          {hasActivated ? (
             <button onClick={endTurn} style={{ padding: '15px', fontSize: '18px', background: '#c9a227', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
               Завершить ход
             </button>
          ) : (
            <div style={{ padding: '15px', textAlign: 'center', background: '#2a3a4d', borderRadius: '8px', opacity: 0.7 }}>
              {active ? 'Выберите гекс для движения или атаки' : 'Выберите юнита'}
            </div>
          )}

          <div style={{ padding: 16, background: '#2a3a4d', borderRadius: 8, flex: 1, maxHeight: '400px', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Активный юнит</h3>
            {active ? (
              <div>
                <div><b>{active.name}</b></div>
                <div>HP: {active.hp}/{active.maxHp}</div>
                <div>Движение: {active.movement}</div>
                <div>Атака: {active.attack} / Защита: {active.defense}</div>
              </div>
            ) : <div style={{ opacity: 0.6 }}>Никто не выбран</div>}

            <h3 style={{ marginTop: 20, borderTop: '1px solid #444', paddingTop: 10 }}>Журнал боя</h3>
            <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {logs.map(log => (
                <div key={log.id} style={{ opacity: 0.9, borderBottom: '1px solid #3a4a5d', paddingBottom: 4 }}>
                  {log.text}
                </div>
              ))}
            </div>
          </div>
          
          <DiceRoller />
        </div>
      </div>
    </div>
  );
}

export default App;