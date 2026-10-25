import HexGrid from './components/HexGrid';
import DiceRoller from './components/DiceRoller';
import { useGameStore } from './store/gameStore';

function App() {
  const { units, activeUnitId } = useGameStore();
  const active = units.find(u => u.id === activeUnitId);

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', background: '#0a1220',
                  minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ marginTop: 0 }}>Tornscape — Прототип</h1>
      <p style={{ opacity: 0.7 }}>
        Кликните по юниту → подсветятся доступные гексы → кликните по одному из них для движения.
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 20 }}>
        <div>
          <h2>Поле</h2>
          <HexGrid />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 16, background: '#2a3a4d', borderRadius: 8, minWidth: 240 }}>
            <h3 style={{ marginTop: 0 }}>Активный юнит</h3>
            {active ? (
              <div>
                <div><b>{active.name}</b></div>
                <div>HP: {active.hp}/{active.maxHp}</div>
                <div>Движение: {active.movement}</div>
                <div>Атака: {active.attack} / Защита: {active.defense}</div>
              </div>
            ) : <div style={{ opacity: 0.6 }}>Никто не выбран</div>}
          </div>
          <DiceRoller />
        </div>
      </div>
    </div>
  );
}

export default App;