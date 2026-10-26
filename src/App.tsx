import { useState } from 'react';
import HexGrid from './components/HexGrid';
import DiceRoller from './components/DiceRoller';
import SetupPanel from './components/SetupPanel';
import ArmyBuilder, { type RosterMap } from './components/ArmyBuilder';
import { activeActions, playerTitle, useGameStore } from './store/gameStore';
import { type RosterSelection, selectionPoints, selectionUnitCount } from './lib/rosterRules';
import { SCENARIO_LIST, scenarioById, type ScenarioId } from './lib/scenarios';
import {
  ACTION_LABEL,
  MINI_STATUS_LABEL,
  SETUP_STAGE_LABEL,
  STATE_MARKER_ICON,
  STATE_MARKER_LABEL,
  TERRAIN_LABEL,
  TURN_PHASE_LABEL,
  type PlayerId,
} from './types/game';
import { hexKey } from './lib/hex';

// Краткая сводка по ростеру: лидер, число моделей и затраченные очки.
const describeRoster = (selection: RosterSelection): string => {
  const hero = selection.heroName || 'без лидера';
  const models = selectionUnitCount(selection);
  const points = selectionPoints(selection);
  return `${hero}, ${models} юн., ${points}/${selection.formatPoints} оч.`;
};

const panelStyle = {
  padding: 16,
  background: '#2a3a4d',
  borderRadius: 8,
  fontSize: 16,
} as const;

const actionButtonStyle = (enabled: boolean) => ({
  width: '100%',
  textAlign: 'left' as const,
  padding: '10px 12px',
  fontSize: 15,
  borderRadius: 6,
  border: '1px solid #55708a',
  background: enabled ? '#33506d' : '#243141',
  color: enabled ? '#fff' : '#7a8a9a',
  cursor: enabled ? 'pointer' : 'not-allowed',
  opacity: enabled ? 1 : 0.7,
});

const phaseButtonStyle = {
  width: '100%',
  padding: '14px',
  fontSize: 17,
  fontWeight: 'bold' as const,
  background: '#c9a227',
  color: '#101820',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

function App() {
  const [isGameStarted, setIsGameStarted] = useState(false);
  // Ростеры держим в App, чтобы при возврате на экран сборки выбор не терялся.
  const [rosters, setRosters] = useState<RosterMap | undefined>(undefined);

  const state = useGameStore();
  const {
    units,
    terrain,
    whirlwinds,
    setupStage,
    activeUnitId,
    activation,
    pendingAttack,
    phase,
    turn,
    currentPlayer,
    initiativeWinner,
    initiativeRolls,
    scenario,
    stats,
    faithMarkers,
    crystals,
    score,
    matchFinished,
    logs,
    advancePhase,
    rollInitiative,
    setScenario,
    selectAction,
    finishActivation,
    moveWhirlwinds,
    endTurn,
    finishMatch,
    resetGame,
  } = state;

  const active = units.find(u => u.id === activeUnitId);
  const tiles = activeActions(state);

  const unitsP1 = units.filter(u => u.player === 'player1' && u.hp > 0 && u.deployed).length;
  const unitsP2 = units.filter(u => u.player === 'player2' && u.hp > 0 && u.deployed).length;
  const reserveP1 = units.filter(u => u.player === 'player1' && u.reserve && !u.dead).length;
  const reserveP2 = units.filter(u => u.player === 'player2' && u.reserve && !u.dead).length;

  const backToBuilder = () => {
    resetGame();
    setIsGameStarted(false);
  };

  const playerChip = (player: PlayerId) => (
    <span
      style={{
        background: player === 'player1' ? '#4a6a8a' : '#8a4a4a',
        padding: '4px 12px',
        borderRadius: 16,
        fontSize: 15,
      }}
    >
      {playerTitle(player)}
    </span>
  );

  // Основная кнопка фазы: каждое действие строго соответствует шагу правил.
  const renderPhaseControls = () => {
    if (matchFinished) {
      return (
        <button type="button" onClick={backToBuilder} style={phaseButtonStyle}>
          Партия завершена — к ростеру
        </button>
      );
    }

    // Пока идут Шаги 1–3 (инициатива, атакующий, зоны, расстановка),
    // управление ходом недоступно: вместо него показывается экран подготовки.
    if (setupStage !== 'complete') {
      return <SetupPanel />;
    }

    switch (phase) {
      case 'startOfTurn':
        return (
          <button type="button" onClick={advancePhase} style={phaseButtonStyle}>
            Фаза I: начать ход (обновить Маркеры Времени)
          </button>
        );
      case 'drawGodCard':
        return (
          <button type="button" onClick={advancePhase} style={phaseButtonStyle}>
            Фаза II: взять карту Богов
          </button>
        );
      case 'initiative':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" onClick={rollInitiative} style={phaseButtonStyle}>
              Фаза III: бросить инициативу (3 Кубика Атаки)
            </button>
            {initiativeWinner && (
              <button
                type="button"
                onClick={advancePhase}
                style={{ ...phaseButtonStyle, background: '#4a8ad0', color: '#fff' }}
              >
                Перейти к Фазе IV — первым активируется {playerTitle(initiativeWinner)}
              </button>
            )}
          </div>
        );
      case 'activation':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 15, opacity: 0.8 }}>
              {activation
                ? 'Выполняйте Действия, затем завершите Активацию (Шаг 8).'
                : 'Кликните по своей миниатюре, чтобы начать Активацию.'}
            </div>
            {activation && (
              <button
                type="button"
                onClick={finishActivation}
                style={{ ...phaseButtonStyle, background: '#4a8ad0', color: '#fff' }}
              >
                Шаг 8: завершить Активацию
              </button>
            )}
            <button
              type="button"
              onClick={() => endTurn()}
              style={{ ...phaseButtonStyle, background: '#55708a', color: '#fff', fontSize: 15 }}
            >
              Завершить Фазу IV досрочно
            </button>
          </div>
        );
      case 'whirlwindMovement':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                moveWhirlwinds();
                advancePhase();
              }}
              style={phaseButtonStyle}
            >
              Фаза V: бросить 2 Кубика Атаки за каждый вихрь
            </button>
            <button
              type="button"
              onClick={advancePhase}
              style={{ ...phaseButtonStyle, background: '#55708a', color: '#fff', fontSize: 15 }}
            >
              Пропустить движение вихрей
            </button>
          </div>
        );
      case 'endOfTurn':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" onClick={advancePhase} style={phaseButtonStyle}>
              {turn >= 6 ? 'Фаза VI: завершить партию' : 'Фаза VI: закончить ход'}
            </button>
            <button
              type="button"
              onClick={finishMatch}
              style={{ ...phaseButtonStyle, background: '#8a4a4a', color: '#fff', fontSize: 15 }}
            >
              Подсчитать Победные Очки сейчас
            </button>
          </div>
        );
      default:
        return null;
    }
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

  const scenarioInfo = scenarioById(scenario);

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', fontSize: 17, background: '#0a1220', minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, flexWrap: 'wrap' }}>
        Tornscape — Прототип
        <span style={{ fontSize: '20px', background: currentPlayer === 'player1' ? '#4a6a8a' : '#8a4a4a', padding: '6px 16px', borderRadius: '22px' }}>
          Ход {turn}/6 · {playerTitle(currentPlayer)}
        </span>
        <span style={{ fontSize: 16, opacity: 0.85 }}>
          {setupStage === 'complete'
            ? TURN_PHASE_LABEL[phase]
            : `Подготовка · ${SETUP_STAGE_LABEL[setupStage]}`}
        </span>
        <button
          onClick={backToBuilder}
          style={{ marginLeft: 'auto', fontSize: 15, padding: '8px 16px', background: 'transparent', color: '#fff', border: '1px solid #55708a', borderRadius: 8, cursor: 'pointer' }}
        >
          Изменить ростер
        </button>
      </h1>

      <p style={{ opacity: 0.75, fontSize: 16, lineHeight: 1.5, marginTop: 0 }}>
        Поле из гексонов: гексон — «цветок» из 7 гексов в светлом контуре. 🛡️ руины и 💎 кристаллы дают Укрытие,
        🔥☠️🌀🌊 — Опасный Ландшафт. Клик по миниатюре начинает Активацию, затем выберите Действие справа.
        Активированные миниатюры обведены пунктиром.
        {setupStage !== 'complete' && (
          <>
            {' '}
            <b style={{ color: '#c9a227' }}>
              Партия на этапе подготовки (Шаги 1–3): сценарий, инициатива, атакующий, зоны и расстановка.
            </b>
          </>
        )}
      </p>

      <p style={{ opacity: 0.65, fontSize: 15, marginTop: -6 }}>
        В строю Игрока 1: {unitsP1} юн.{reserveP1 > 0 ? ` (+${reserveP1} в Резерве)` : ''} · Игрока 2:{' '}
        {unitsP2} юн.{reserveP2 > 0 ? ` (+${reserveP2} в Резерве)` : ''}
        {rosters
          ? ` · Ростеры: ${describeRoster(rosters.player1)} / ${describeRoster(rosters.player2)}`
          : ''}
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 16 }}>
        <div style={{ flex: '1 1 620px', minWidth: 320 }}>
          <HexGrid />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '400px', maxWidth: '100%' }}>
          {renderPhaseControls()}

          {/* Сценарий и ресурсы */}
          <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <b>Сценарий {scenarioInfo.number}:</b>
              <select
                value={scenario}
                onChange={event => setScenario(event.target.value as ScenarioId)}
                disabled={setupStage === 'deployment'}
                title={
                  setupStage === 'deployment'
                    ? 'После начала Расстановки сценарий изменить нельзя'
                    : 'Смена сценария пересобирает поле по его Схеме Расстановки'
                }
                style={{ flex: 1, padding: '6px 8px', fontSize: 15, borderRadius: 6 }}
              >
                {SCENARIO_LIST.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.number}. {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 8 }}>{scenarioInfo.summary}</div>
            <ul style={{ margin: '0 0 10px 0', paddingLeft: 18, fontSize: 14, opacity: 0.85 }}>
              {scenarioInfo.conditions.map(condition => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 14 }}>
              <div>
                {playerChip('player1')} 💎 {crystals.player1} · ✨ {faithMarkers.player1}
              </div>
              <div>
                {playerChip('player2')} 💎 {crystals.player2} · ✨ {faithMarkers.player2}
              </div>
              <div style={{ opacity: 0.8 }}>Потери: {stats.player1.lossesPoints} оч.</div>
              <div style={{ opacity: 0.8 }}>Потери: {stats.player2.lossesPoints} оч.</div>
              <div style={{ opacity: 0.8 }}>Вихри: {whirlwinds.length}</div>
              <div style={{ opacity: 0.8 }}>
                Лидер: {stats.player1.leaderAlive ? 'жив' : 'погиб'}
              </div>
            </div>

            {score && (
              <div style={{ marginTop: 10, padding: 8, background: '#1f2c3a', borderRadius: 6, fontSize: 15 }}>
                Победные Очки — Игрок 1: <b>{score.player1}</b>, Игрок 2: <b>{score.player2}</b> ·{' '}
                {score.winner === 'draw' ? 'ничья' : `победа ${playerTitle(score.winner)}`}
              </div>
            )}
          </div>

          {/* Инициатива */}
          {setupStage === 'complete' && initiativeRolls.length > 0 && (
            <div style={{ ...panelStyle, fontSize: 14 }}>
              <b>Бросок инициативы</b>
              {initiativeRolls.map(roll => (
                <div key={roll.player} style={{ opacity: 0.85 }}>
                  {playerTitle(roll.player)}: {roll.successes} успехов, {roll.criticals} критов
                </div>
              ))}
            </div>
          )}

          {/* Активная миниатюра и её Действия */}
          {setupStage === 'complete' && (
          <div style={{ ...panelStyle, maxHeight: '420px', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, fontSize: 20 }}>Активная миниатюра</h3>
            {active ? (
              <div style={{ fontSize: 15, lineHeight: 1.55 }}>
                <div><b>{active.name}</b> {active.isLeader ? '· Лидер' : ''}</div>
                <div>Жизни: {active.hp}/{active.maxHp} · Движение: {active.movement}</div>
                <div>
                  Защита: {active.defensePool.defense} щит + {active.defensePool.agility} ловк.
                  {active.defenseBonus > 0 ? ` (+${active.defenseBonus} от Реакции)` : ''}
                </div>
                <div>
                  Маркеры Времени: {'◆'.repeat(active.timeMarkers) || '—'} ({active.timeMarkers}/3)
                </div>
                {active.stateMarkers.length > 0 && (
                  <div>
                    Маркеры Состояний:{' '}
                    {active.stateMarkers
                      .map(marker => `${STATE_MARKER_ICON[marker]} ${STATE_MARKER_LABEL[marker]}`)
                      .join(', ')}
                  </div>
                )}
                {active.statuses.length > 0 && (
                  <div>
                    Статусы: {active.statuses.map(status => MINI_STATUS_LABEL[status]).join(', ')}
                  </div>
                )}
                {terrain.get(hexKey(active.position)) && (
                  <div style={{ opacity: 0.8 }}>
                    Ландшафт: {TERRAIN_LABEL[terrain.get(hexKey(active.position))!.type]}
                  </div>
                )}

                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tiles.map(tile => {
                    const isSelected = activation?.selectedActionId === tile.id;
                    const affordable = active.timeMarkers >= tile.timeCost;
                    return (
                      <button
                        key={tile.id}
                        type="button"
                        disabled={!affordable}
                        onClick={() => selectAction(tile.id)}
                        style={{
                          ...actionButtonStyle(affordable),
                          borderColor: isSelected ? '#c9a227' : '#55708a',
                        }}
                        title={tile.description ?? ACTION_LABEL[tile.kind]}
                      >
                        <b>{tile.name}</b> · {ACTION_LABEL[tile.kind]}
                        <span style={{ opacity: 0.8 }}>
                          {' '}
                          · ◆{tile.timeCost}
                          {tile.range > 0 ? ` · дист. ${tile.range}` : ''}
                          {tile.damage ? ` · урон ${tile.damage}` : ''}
                        </span>
                      </button>
                    );
                  })}
                  {tiles.length === 0 && <div style={{ opacity: 0.6 }}>Нет доступных Действий</div>}
                </div>

                {activation && activation.targetIds.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 14, color: '#ffb4a2' }}>
                    Выберите цель на поле: клик по подсвеченной вражеской миниатюре разрешает атаку.
                  </div>
                )}
                {activation && activation.reachable.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 14, color: '#9ecbff' }}>
                    Клик по синему гексу перемещает миниатюру ({activation.reachable.length} вариантов).
                  </div>
                )}
              </div>
            ) : (
              <div style={{ opacity: 0.6 }}>Миниатюра не выбрана</div>
            )}
          </div>
          )}

          {/* Результат атаки: 11 шагов */}
          {pendingAttack && (
            <div style={{ ...panelStyle, maxHeight: '320px', overflowY: 'auto' }}>
              <h3 style={{ marginTop: 0, fontSize: 19 }}>
                Атака: {pendingAttack.attackerName} → {pendingAttack.targetName}
              </h3>
              <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 8 }}>
                {pendingAttack.result.summary}
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pendingAttack.result.steps.map(step => (
                  <li key={`${step.step}-${step.title}`}>
                    <b>Шаг {step.step}: {step.title}</b>
                    <div style={{ opacity: 0.8 }}>{step.detail}</div>
                  </li>
                ))}
              </ol>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                Урон по цели: <b>{pendingAttack.result.damageToDefender}</b>
                {pendingAttack.result.damageToAttacker > 0 && (
                  <> · ответный урон: <b>{pendingAttack.result.damageToAttacker}</b></>
                )}
                {pendingAttack.result.mustEvade && ' · цель обязана была уклоняться'}
              </div>
            </div>
          )}

          {/* Журнал */}
          <div style={{ ...panelStyle, flex: 1, maxHeight: '420px', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, fontSize: 20 }}>Журнал партии</h3>
            <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {logs.map(entry => (
                <div key={entry.id} style={{ borderBottom: '1px solid #3a4a5d', paddingBottom: 4 }}>
                  {entry.step && (
                    <span
                      style={{
                        display: 'inline-block',
                        marginRight: 6,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: '#3a5a80',
                        fontSize: 12,
                      }}
                    >
                      {entry.step}
                    </span>
                  )}
                  <span style={{ opacity: 0.9 }}>{entry.text}</span>
                </div>
              ))}
              {logs.length === 0 && <div style={{ opacity: 0.6 }}>Журнал пуст</div>}
            </div>
          </div>

          <DiceRoller />
        </div>
      </div>
    </div>
  );
}

export default App;
