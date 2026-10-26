/**
 * Сквозная проверка движка правил Tornscape без браузера.
 *
 * Проходит полный цикл партии по правилам:
 *   Фаза I → Фаза II → Фаза III (инициатива) → Фаза IV (активация: шаги 1–8,
 *   действие, перемещение, 11-шаговая атака, Реакция) → Фаза V (движение
 *   Вихрей) → Фаза VI → новый ход → подсчёт Победных Очков.
 *
 * Запуск: npm run rules:sim
 */
import { describeDice } from '../src/lib/dice';
import { hexesOfHexson, hexKey, hexNeighbors } from '../src/lib/hex';
import {
  createEmptySelection,
  expandUnitsForBattle,
  type RosterSelection,
} from '../src/lib/rosterRules';
import { fitsInZone } from '../src/lib/setup';
import { activeActions, playerLosses, useGameStore } from '../src/store/gameStore';

const store = useGameStore;

/** Собирает ростер из трёх миниатюр: лидер + две линейные модели. */
const buildRoster = (tag: string): RosterSelection => {
  const selection = createEmptySelection(300);
  const picks = [
    { id: `${tag}-leader`, name: `Лидер ${tag}`, points: 120 },
    { id: `${tag}-warrior`, name: `Воин ${tag}`, points: 60 },
    { id: `${tag}-archer`, name: `Стрелок ${tag}`, points: 55 },
  ];

  picks.forEach((pick, index) => {
    selection.units.push({
      optionId: `option-${pick.id}`,
      unitId: pick.id,
      slug: pick.id,
      name: pick.name,
      points: pick.points,
      limit: 1,
      weight: index,
      uniqKey: null,
      imageUrl: null,
      cardImageUrl: null,
      cardBackImageUrl: null,
      specialRules: null,
      requires: [],
      quantity: 1,
    });
  });

  // Лидера Экспедиции `expandUnitsForBattle` помечает по имени персонажа ростера.
  selection.heroName = picks[0].name;
  return selection;
};

const p1 = expandUnitsForBattle(buildRoster('p1'));
const p2 = expandUnitsForBattle(buildRoster('p2'));

console.log(`Ростеры: ${p1.length} / ${p2.length} миниатюр`);
if (p1.some(unit => !unit.id)) throw new Error('у миниатюр нет id');
if (!p1.some(unit => unit.isLeader)) throw new Error('Лидер Экспедиции не помечен');

store.getState().startGameWithRosters(p1, p2, { scenario: 'meetingEngagement' });

let state = store.getState();
console.log(
  `Шаг 1: фаза ${state.phase}, этап ${state.setupStage}, юнитов ${state.units.length}, ` +
    `вихрей ${state.whirlwinds.length}, маркеров сценария ${state.scenarioMarkers.length}, ` +
    `зон расстановки ${state.deploymentZones.length}`,
);
if (state.units.length === 0) throw new Error('армии не созданы');
if (state.units.some(unit => !unit.id)) throw new Error('у миниатюр нет id');
if (state.units.some(unit => unit.deployed)) throw new Error('миниатюры выставлены до Расстановки');
if (state.deploymentZones.length !== 2) throw new Error('не созданы две Зоны Расстановки');
if (state.setupStage !== 'initiative') {
  throw new Error(`после Шага 1 ожидался этап initiative, получено ${state.setupStage}`);
}

// Шаг 2: бросок инициативы тремя Кубиками Атаки.
state.rollSetupInitiative();
state = store.getState();
console.log(
  `Шаг 2, инициатива: ${state.initiativeRolls
    .map(roll => `${roll.player} — ${describeDice(roll.dice)} (крит. ${roll.criticals})`)
    .join(' | ')} → ${state.setupInitiativeWinner}`,
);
if (!state.setupInitiativeWinner) throw new Error('победитель инициативы не определён');
if (state.setupStage !== 'attacker') {
  throw new Error(`после броска ожидался этап attacker, получено ${state.setupStage}`);
}

// Победитель инициативы назначает Атакующего Игрока (здесь — сам победитель).
const attacker = state.setupInitiativeWinner;
const other = attacker === 'player1' ? 'player2' : 'player1';
state.chooseAttacker(attacker);
state = store.getState();
if (state.attacker !== attacker) throw new Error('Атакующий Игрок не назначен');
if (state.setupStage !== 'zone') throw new Error('не перешли к выбору Зоны Расстановки');

// Шаг 3: Атакующий Игрок выбирает зону, вторая достаётся противнику.
state.chooseDeploymentZone('west');
state = store.getState();
if (state.setupStage !== 'deployment') throw new Error('Расстановка не началась');
if (state.deployingPlayer !== attacker) throw new Error('первым выставляет Атакующий Игрок');
const westOwner = state.deploymentZones.find(zone => zone.id === 'west')?.player;
const eastOwner = state.deploymentZones.find(zone => zone.id === 'east')?.player;
if (westOwner !== attacker || eastOwner !== other) {
  throw new Error(`зоны распределены неверно: west=${westOwner}, east=${eastOwner}`);
}

/**
 * Поочерёдное выставление: каждый игрок ставит по одной Миниатюре в свою зону.
 * Если подходящего свободного гекса нет — Миниатюра уходит в Резерв.
 */
const deployAllMiniatures = () => {
  for (let guard = 0; guard < 200; guard += 1) {
    const current = store.getState();
    if (current.setupStage !== 'deployment') return;

    const player = current.deployingPlayer;
    if (!player) return;

    const pending = current.units.find(
      unit => unit.player === player && !unit.deployed && !unit.reserve,
    );
    if (!pending) return;

    const zone = current.deploymentZones.find(item => item.player === player);
    if (!zone) {
      current.deployToReserve(pending.id);
      continue;
    }

    const taken = new Set(
      current.units.filter(unit => unit.deployed).map(unit => hexKey(unit.position)),
    );
    const spot = zone.hexsons
      .flatMap(center => hexesOfHexson(center))
      .find(hex => fitsInZone(zone, hex, pending.size) && !taken.has(hexKey(hex)));

    if (!spot) {
      current.deployToReserve(pending.id);
      continue;
    }

    if (!current.deployUnit(pending.id, spot)) {
      throw new Error(`не удалось выставить «${pending.name}» в зону ${zone.id}`);
    }
  }

  throw new Error('Расстановка не завершилась за отведённое число шагов');
};

deployAllMiniatures();
state = store.getState();
console.log(
  `Шаг 3, расстановка: на поле ${state.units.filter(unit => unit.deployed).length} мин., ` +
    `в Резерве ${state.units.filter(unit => unit.reserve).length} мин., ` +
    `очередь ${state.deployingPlayer ?? 'пуста'}`,
);
if (state.units.some(unit => !unit.deployed && !unit.reserve)) {
  throw new Error('остались не выставленные Миниатюры');
}

state.finishDeployment();
state = store.getState();
if (state.setupStage !== 'complete') throw new Error('подготовка не завершилась');
if (state.godCards.player1 < 2 || state.godCards.player2 < 2) {
  throw new Error('после Расстановки игроки не взяли по две карты Богов');
}

// Ход 1: Фаза I → Фаза II → сразу Фаза IV (Фаза III начинается со второго хода).
state.advancePhase();
state = store.getState();
if (state.phase !== 'drawGodCard') throw new Error(`ожидалась drawGodCard, получено ${state.phase}`);

state.advancePhase();
state = store.getState();
if (state.phase !== 'activation') {
  throw new Error(`на первом ходу Фаза III пропускается, получено ${state.phase}`);
}
if (state.currentPlayer !== attacker) {
  throw new Error('первый ход открывает Атакующий Игрок');
}

const activePick = state.units.find(
  unit => unit.player === attacker && unit.hp > 0 && unit.deployed,
);
if (!activePick) throw new Error('нет выставленных миниатюр для активации');

// Шаги 1–4: проверки, Маркеры Времени, срабатывание Маркеров Состояний.
state.beginActivation(activePick.id);
state = store.getState();
let active: typeof activePick | undefined = state.units.find(unit => unit.id === activePick.id);
if (!state.activation) throw new Error('активация не началась');
if (!active) throw new Error('активная миниатюра потерялась');
if (active.timeMarkers !== 2) {
  throw new Error(`ожидалось 2 Маркера Времени, получено ${active.timeMarkers}`);
}
console.log(`Активация «${active.name}»: Маркеров Времени ${active.timeMarkers}`);

const tiles = activeActions(state);
console.log(`Доступные Плитки Действий: ${tiles.map(tile => `${tile.name} (◆${tile.timeCost})`).join(', ')}`);
if (tiles.length === 0) throw new Error('нет доступных Плиток Действий');

// Шаги 5–6: заявление Действия «Шаг» и перемещение.
const stepTile = tiles.find(tile => tile.kind === 'step' || tile.kind === 'run');
if (!stepTile) throw new Error('нет Плитки Движения');
state.selectAction(stepTile.id);
state = store.getState();
const reachable = state.activation?.reachable ?? [];
console.log(`«${stepTile.name}»: достижимых гексов ${reachable.length}`);
if (reachable.length === 0) throw new Error('движение не дало достижимых гексов');

const moveOk = store.getState().moveActiveUnit(reachable[reachable.length - 1]);
state = store.getState();
active = state.units.find(unit => unit.id === activePick.id);
if (!moveOk) throw new Error('moveActiveUnit вернул false для достижимого гекса');
console.log(`Перемещение выполнено, Маркеров Времени осталось ${active?.timeMarkers}`);

// Шаги 7–11: атака. Сближаем миниатюры вручную, чтобы не зависеть от расстановки.
const attackerId = activePick.id;
const enemy = state.units.find(unit => unit.player === other && unit.hp > 0);
if (!enemy) throw new Error('у соперника нет миниатюр');

const attackerNow = state.units.find(unit => unit.id === attackerId);
if (!attackerNow) throw new Error('атакующий потерялся');

const occupied = (hex: { q: number; r: number }) =>
  state.units.some(unit => !unit.dead && unit.position.q === hex.q && unit.position.r === hex.r);
const spot = hexNeighbors(enemy.position).find(hex => !occupied(hex));
if (!spot) throw new Error('нет свободного гекса рядом с целью');

store.setState(current => ({
  units: current.units.map(unit =>
    unit.id === attackerId ? { ...unit, position: spot, timeMarkers: 3 } : unit,
  ),
}));
state = store.getState();

const attackTile = activeActions(state).find(
  tile => tile.kind === 'meleeAttack' || tile.kind === 'rangedAttack',
);
if (!attackTile) throw new Error('нет Плитки Атаки');

state.selectAction(attackTile.id);
state = store.getState();
const targetIds = state.activation?.targetIds ?? [];
console.log(`«${attackTile.name}»: доступных целей ${targetIds.length}`);
if (!targetIds.includes(enemy.id)) throw new Error('цель в радиусе не найдена');

store.getState().confirmAttack(enemy.id);
state = store.getState();
const attack = state.pendingAttack;
if (!attack) throw new Error('атака не разрешилась');
console.log(`Атака по 11 шагам: шагов ${attack.result.steps.length}`);
attack.result.steps.forEach(step => console.log(`  [Шаг ${step.step}] ${step.title} — ${step.detail}`));
console.log(`  Итог: ${attack.result.summary}`);
if (attack.result.steps.length < 10) throw new Error('в логе меньше 10 шагов атаки');

// Реакции: недоступны с Маркером Состояния, доступны «чистой» миниатюре.
const defenderUnit = state.units.find(
  unit => unit.player === other && unit.hp > 0 && !unit.activated && !unit.dead,
);
if (!defenderUnit) throw new Error('нет неактивированной миниатюры для Реакции');

// Ставим защитника на равнинный гекс вне Эфирных Вихрей, чтобы Реакция была легальна.
const isPlainFreeHex = (hex: { q: number; r: number }) => {
  const terrain = state.terrain.get(hexKey(hex));
  if (terrain && terrain.type !== 'plain') return false;
  return !state.whirlwinds.some(
    whirlwind =>
      Math.max(
        Math.abs(whirlwind.position.q - hex.q),
        Math.abs(whirlwind.position.r - hex.r),
        Math.abs(whirlwind.position.q + whirlwind.position.r - hex.q - hex.r),
      ) < 2,
  );
};
const safeSpot = state.grid.find(isPlainFreeHex);
if (safeSpot) {
  store.setState(current => ({
    units: current.units.map(unit =>
      unit.id === defenderUnit.id
        ? { ...unit, position: { q: safeSpot.q, r: safeSpot.r }, stateMarkers: ['bleeding'], defenseBonus: 0 }
        : unit,
    ),
  }));
  state = store.getState();
  console.log(`Защитник переставлен на равнинный гекс ${safeSpot.q},${safeSpot.r}.`);
}

// Правило: миниатюра с Маркером Состояния не может объявлять Реакции.
store.getState().declareReaction(defenderUnit.id, 'defend');
state = store.getState();
const blocked = state.units.find(unit => unit.id === defenderUnit.id);
console.log(`Реакция с Маркером Состояния: бонус Кубиков Защиты ${blocked?.defenseBonus ?? 0}`);
if (blocked?.defenseBonus !== 0) {
  throw new Error('Реакция должна быть недоступна с Маркером Состояния');
}

store.setState(current => ({
  units: current.units.map(unit =>
    unit.id === defenderUnit.id ? { ...unit, stateMarkers: [] } : unit,
  ),
}));
state = store.getState();

store.getState().declareReaction(defenderUnit.id, 'defend');
state = store.getState();
const defended = state.units.find(unit => unit.id === defenderUnit.id);
console.log(`Реакция «Защита»: бонус Кубиков Защиты ${defended?.defenseBonus ?? 0}`);
if (defended && defended.defenseBonus <= 0) {
  console.log(`  журнал: ${state.logs.slice(0, 1).map(entry => entry.text).join('')}`);
  throw new Error('Реакция «Защита» не дала бонус');
}
if (!defended?.activated) throw new Error('Реакция должна расходовать Активацию');

// Шаг 8: завершение Активации — миниатюра теряет все Маркеры Времени.
store.getState().finishActivation();
state = store.getState();
const finished = state.units.find(unit => unit.id === attackerId);
if (finished?.timeMarkers !== 0) throw new Error('Маркеры Времени не сброшены');
if (!finished?.activated) throw new Error('миниатюра не помечена активированной');
console.log(`Активация завершена: фаза ${state.phase}, активный игрок ${state.currentPlayer}`);

// Вихри двигаются только в Фазе V.
if (state.phase !== 'whirlwindMovement') {
  const before = state.whirlwinds.map(w => `${w.position.q},${w.position.r}`).join(' ');
  store.getState().moveWhirlwinds();
  state = store.getState();
  const after = state.whirlwinds.map(w => `${w.position.q},${w.position.r}`).join(' ');
  console.log(`Вихри до Фазы V не сдвинулись: ${before === after}`);
  if (before !== after) throw new Error('Эфирные Вихри сдвинулись вне Фазы V');
  if (state.phase !== 'whirlwindMovement') {
    store.getState().advancePhase();
    state = store.getState();
  }
}
if (state.phase !== 'whirlwindMovement') {
  throw new Error(`ожидалась whirlwindMovement, получено ${state.phase}`);
}

// Фаза V: 2 Кубика Атаки за каждый Вихрь.
const beforeWhirlwinds = state.whirlwinds.map(w => `${w.position.q},${w.position.r}`).join(' ');
store.getState().moveWhirlwinds();
state = store.getState();
console.log(
  `Вихри: ${state.whirlwinds
    .map(w => `${w.allegiance ?? 'нейтральный'}@${w.position.q},${w.position.r}`)
    .join(' | ')}`,
);
const afterWhirlwinds = state.whirlwinds.map(w => `${w.position.q},${w.position.r}`).join(' ');
if (beforeWhirlwinds === afterWhirlwinds) throw new Error('Фаза V не сдвинула Вихри');

store.getState().advancePhase();
state = store.getState();
if (state.phase !== 'endOfTurn') throw new Error(`ожидалась endOfTurn, получено ${state.phase}`);

// Фаза VI → следующий ход.
store.getState().advancePhase();
state = store.getState();
if (state.turn !== 2) throw new Error(`ожидался ход 2, получено ${state.turn}`);
if (state.phase !== 'startOfTurn') throw new Error(`ожидалась startOfTurn, получено ${state.phase}`);
console.log(`Новый ход ${state.turn}: фаза ${state.phase}`);

// Со второго хода Фаза III выполняется по-настоящему.
store.getState().advancePhase();
store.getState().advancePhase();
state = store.getState();
if (state.phase !== 'initiative') {
  throw new Error(`на втором ходу ожидалась Фаза III, получено ${state.phase}`);
}
store.getState().rollInitiative();
state = store.getState();
if (!state.initiativeWinner) throw new Error('победитель инициативы не определён');
if (state.currentPlayer !== state.initiativeWinner) {
  throw new Error('первым активируется победитель инициативы');
}
console.log(`Ход 2, Фаза III: инициативу выиграл ${state.initiativeWinner}`);

// Подсчёт Победных Очков.
store.getState().finishMatch();
state = store.getState();
console.log(
  `VP: Игрок 1 — ${state.score?.player1}, Игрок 2 — ${state.score?.player2}, ` +
    `победитель ${state.score?.winner ?? 'ничья'}`,
);
console.log(
  `Потери: Игрок 1 — ${playerLosses(state.units, 'player1')} оч., ` +
    `Игрок 2 — ${playerLosses(state.units, 'player2')} оч.`,
);
if (!state.score || !state.matchFinished) throw new Error('партия не завершена подсчётом VP');

const steps = new Set(
  state.logs.map(entry => entry.step).filter((step): step is string => Boolean(step)),
);
console.log(`Шаги правил в журнале: ${[...steps].join(', ')}`);
console.log(`Записей в журнале: ${state.logs.length}`);

console.log('\nOK: сквозной цикл правил прошёл без ошибок.');
