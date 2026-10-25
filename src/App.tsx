import { useState } from 'react';
import HexGrid from './components/HexGrid';
import DiceRoller from './components/DiceRoller';
import ArmyBuilder, { type RosterMap } from './components/ArmyBuilder';
import { playerTitle, useGameStore } from './store/gameStore';

function App() {
  const [isGameStarted, setIsGameStarted] = useState(false);
  // Ростеры держим в App, чтобы при возврате на экран сборки выбор не терялся.
  const [rosters, setRosters] = useState<RosterMap | undefined>(undefined);

  const { units, activeUnitId, currentPlayer, hasActivated, logs, endTurn, resetGame } = useGameStore();
  const active = units.find(u => u.id === activeUnitId);

  // Юниты попадают в стор только после старта — на экране сборки их нет
  const unitsP1 = units.filter(u => u.player === 'player1' && u.hp > 0).length;
  const unitsP2 = units.filter(u => u.player === 'player2' && u.hp > 0).length;

  const backToBuilder = () => {
    resetGame();
    setIsGameStarted(false);
  };

  if (!isGameStarted) {
    return (
      <ArmyBuilder
        initialRosters={rosters}
        onStart={selectedRosters => {
          setRosters(selectedRosters);
          setIsGameStarted(true);
        }}
      />
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', fontSize: 17, background: '#0a1220', minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 20, fontSize: 34 }}>
        Tornscape — Прототип
        <span style={{ fontSize: '22px', background: currentPlayer === 'player1' ? '#4a6a8a' : '#8a4a4a', padding: '7px 18px', borderRadius: '22px' }}>
          Ход: {playerTitle(currentPlayer)}
        </span>
        <button
          onClick={backToBuilder}
          style={{ marginLeft: 'auto', fontSize: 15, padding: '8px 16px', background: 'transparent', color: '#fff', border: '1px solid #55708a', borderRadius: 8, cursor: 'pointer' }}
        >
          Изменить ростер
        </button>
      </h1>
      
      <p style={{ opacity: 0.75, fontSize: 17, lineHeight: 1.5 }}>
        Поле состоит из гексонов — групп из 7 гексов, обведённых светлой линией по контуру.
        🛡️ — укрытие (+1 кубик к защите). Синие — движение, Красные — атака.
        Колесо мыши приближает и отдаляет поле относительно курсора, перетаскивание мышью двигает камеру.
      </p>

      <p style={{ opacity: 0.65, fontSize: 15, marginTop: -6 }}>
        В строю Игрока 1: {unitsP1} юн. · Игрока 2: {unitsP2} юн.
        {rosters
          ? ` (ростеры: ${rosters.player1.length} / ${rosters.player2.length} юн.)`
          : ''}
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 20 }}>
        <div style={{ flex: '1 1 600px' }}>
          <HexGrid />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '360px' }}>
          {hasActivated ? (
             <button onClick={endTurn} style={{ padding: '18px', fontSize: '21px', background: '#c9a227', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
               Завершить ход
             </button>
          ) : (
            <div style={{ padding: '18px', fontSize: 18, textAlign: 'center', background: '#2a3a4d', borderRadius: '8px', opacity: 0.75 }}>
              {active ? 'Выберите гекс для движения или атаки' : 'Выберите юнита'}
            </div>
          )}

          <div style={{ padding: 18, background: '#2a3a4d', borderRadius: 8, flex: 1, maxHeight: '460px', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, fontSize: 22 }}>Активный юнит</h3>
            {active ? (
              <div style={{ fontSize: 18, lineHeight: 1.6 }}>
                <div><b>{active.name}</b></div>
                <div>HP: {active.hp}/{active.maxHp}</div>
                <div>Движение: {active.movement}</div>
                <div>Атака: {active.attack} / Защита: {active.defense}</div>
              </div>
            ) : <div style={{ opacity: 0.6, fontSize: 18 }}>Никто не выбран</div>}

            <h3 style={{ marginTop: 20, borderTop: '1px solid #444', paddingTop: 10, fontSize: 22 }}>Журнал боя</h3>
            <div style={{ fontSize: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
