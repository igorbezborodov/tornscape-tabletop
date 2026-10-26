import { playerTitle, useGameStore } from '../store/gameStore';
import { describeDice } from '../lib/dice';
import { scenarioById } from '../lib/scenarios';
import { SETUP_STAGE_LABEL, type DeploymentZoneId } from '../types/game';

/**
 * Экран подготовки партии: Шаги 1–3 (structure_game.txt).
 *
 *  Шаг 1 — сценарий и подготовка поля по его «Схеме Расстановки»;
 *  Шаг 2 — бросок инициативы тремя Кубиками Атаки и выбор Атакующего Игрока;
 *  Шаг 3 — выбор Зоны Расстановки и поочерёдное выставление Миниатюр
 *          (сама расстановка выполняется кликами по полю в `HexGrid`).
 */
const SetupPanel = () => {
  const {
    setupStage,
    scenario,
    initiativeRolls,
    setupInitiativeWinner,
    attacker,
    attackerZone,
    deploymentZones,
    deployingPlayer,
    units,
    rollSetupInitiative,
    chooseAttacker,
    chooseDeploymentZone,
    finishDeployment,
  } = useGameStore();

  if (setupStage === 'complete') return null;

  const definition = scenarioById(scenario);

  const pendingUnits = units.filter(unit => !unit.deployed && !unit.reserve);
  const reserveCount = units.filter(unit => unit.reserve).length;
  const placedCount = units.filter(unit => unit.deployed).length;

  const panel: React.CSSProperties = {
    padding: 16,
    background: '#2a3a4d',
    borderRadius: 8,
    fontSize: 16,
    border: '2px solid #c9a227',
  };

  const primary: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    fontSize: 16,
    fontWeight: 'bold',
    background: '#c9a227',
    color: '#101820',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  };

  const secondary = (active: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '10px 12px',
    fontSize: 15,
    textAlign: 'left',
    borderRadius: 6,
    border: `1px solid ${active ? '#c9a227' : '#55708a'}`,
    background: active ? '#33506d' : '#243141',
    color: '#fff',
    cursor: 'pointer',
  });

  const zoneCaption = (zoneId: DeploymentZoneId): string => {
    const zone = deploymentZones.find(item => item.id === zoneId);
    if (!zone) return zoneId === 'west' ? 'Западная зона' : 'Восточная зона';
    return `${zoneId === 'west' ? 'Западная' : 'Восточная'} зона · ${zone.hexsons.length} гексон(ов)`;
  };

  return (
    <div style={panel}>
      <div style={{ fontSize: 13, letterSpacing: 1, color: '#c9a227', marginBottom: 4 }}>
        ПОДГОТОВКА ПАРТИИ · {SETUP_STAGE_LABEL[setupStage]}
      </div>

      {setupStage === 'scenario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <b>Шаг 1: Подготовка к игре.</b> Поле собирается по «Схеме Расстановки»
            сценария «{definition.name}»: ландшафт, Эфирные Вихри, Маркеры Сценария и Зоны
            Расстановки.
          </div>
        </div>
      )}

      {setupStage === 'initiative' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <b>Шаг 2: Определение Инициативы.</b> Каждый игрок бросает три Кубика Атаки.
            Побеждает тот, у кого больше Критических Успехов; при их отсутствии или
            равенстве — у кого больше Успехов. Если все выпавшие значения равны, бросок
            повторяется.
          </div>
          <button type="button" onClick={rollSetupInitiative} style={primary}>
            Бросить инициативу (3 Кубика Атаки)
          </button>
        </div>
      )}

      {setupStage === 'attacker' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <b>Шаг 2: Выбор Атакующего Игрока.</b>{' '}
            {setupInitiativeWinner
              ? `${playerTitle(setupInitiativeWinner)} выиграл инициативу и выбирает, кто станет Атакующим Игроком.`
              : 'Победитель инициативы выбирает Атакующего Игрока.'}
          </div>
          <button
            type="button"
            onClick={() => chooseAttacker('player1')}
            style={secondary(attacker === 'player1')}
          >
            Атакующий — {playerTitle('player1')}
          </button>
          <button
            type="button"
            onClick={() => chooseAttacker('player2')}
            style={secondary(attacker === 'player2')}
          >
            Атакующий — {playerTitle('player2')}
          </button>
          <div style={{ fontSize: 14, opacity: 0.75 }}>
            Атакующий Игрок открывает первый Ход и первым выставляет Миниатюру.
          </div>
        </div>
      )}

      {setupStage === 'zone' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <b>Шаг 3: Зона Расстановки.</b>{' '}
            {attacker
              ? `${playerTitle(attacker)} выбирает одну из двух зон; вторая достаётся противнику.`
              : 'Атакующий Игрок выбирает зону расстановки.'}
          </div>
          <button
            type="button"
            onClick={() => chooseDeploymentZone('west')}
            style={secondary(attackerZone === 'west')}
          >
            {zoneCaption('west')}
          </button>
          <button
            type="button"
            onClick={() => chooseDeploymentZone('east')}
            style={secondary(attackerZone === 'east')}
          >
            {zoneCaption('east')}
          </button>
        </div>
      )}

      {setupStage === 'deployment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <b>Шаг 3: Расстановка.</b> Игроки выставляют по одной Миниатюре по очереди,
            начиная с Атакующего Игрока. Сейчас выставляет{' '}
            {deployingPlayer ? playerTitle(deployingPlayer) : '—'}.
          </div>
          <div style={{ fontSize: 14, opacity: 0.8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>Выставлено Миниатюр: {placedCount}</div>
            <div>Осталось в очереди: {pendingUnits.length}</div>
            <div>В Резерве: {reserveCount}</div>
          </div>
          <div style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.45 }}>
            Кликните миниатюру в панели на поле и затем гекс своей зоны. Крупная Миниатюра
            должна поместиться в зоне целиком; если подходящего гекса нет — отправьте её в
            Резерв (из Резерва она войдёт в игру при Активации с −1 Маркером Времени).
          </div>
          <button
            type="button"
            onClick={finishDeployment}
            style={{
              ...primary,
              background: pendingUnits.length === 0 ? '#4a8ad0' : '#243141',
              color: pendingUnits.length === 0 ? '#fff' : '#7a8a9a',
              cursor: pendingUnits.length === 0 ? 'pointer' : 'not-allowed',
            }}
            disabled={pendingUnits.length > 0}
          >
            {pendingUnits.length === 0
              ? 'Завершить расстановку и начать Ход 1'
              : 'Сначала выставьте все Миниатюры или отправьте их в Резерв'}
          </button>
        </div>
      )}

      {initiativeRolls.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 14, borderTop: '1px solid #3a4a5d', paddingTop: 8 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Броски инициативы</div>
          {initiativeRolls.map((roll, index) => (
            <div key={`${roll.player}-${index}`} style={{ opacity: 0.85 }}>
              {playerTitle(roll.player)}: {describeDice(roll.dice)} — {roll.criticals} крит.,{' '}
              {roll.successes} усп.
            </div>
          ))}
        </div>
      )}

      {definition && (
        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.7, lineHeight: 1.45 }}>
          {definition.summary}
        </div>
      )}
    </div>
  );
};

export default SetupPanel;
