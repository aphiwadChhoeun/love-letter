import test from 'node:test';
import assert from 'node:assert/strict';
import { LoveLetterGame, deckSize, CARD_LIST } from '../src/rules.js';
import { createAI } from '../src/ai.js';

const CARD_LIMIT = Object.fromEntries(CARD_LIST.map((c) => [c.key, c.copies]));

function assertCardCounts(game) {
  const seen = new Map();
  const add = (card) => {
    assert.ok(card, 'missing card in accounting');
    seen.set(card.uid, (seen.get(card.uid) ?? 0) + 1);
  };
  game.players.forEach((p) => {
    p.hand.forEach(add);
    p.played.forEach(add);
    p.discarded.forEach(add);
  });
  game.deck.forEach(add);
  game.setAsidePublic.forEach(add);
  if (game.setAsideHidden) add(game.setAsideHidden);

  const expected = deckSize(game.mode);
  assert.equal(seen.size, expected, `expected ${expected} unique cards, saw ${seen.size}`);
  for (const count of seen.values()) assert.equal(count, 1);
}

function simulate(seed, playerCount, mode) {
  const game = new LoveLetterGame({
    playerCount,
    mode,
    seed,
    humanName: 'You'
  });
  const ais = game.players.map((p) =>
    createAI({ playerId: p.id, difficulty: 'ruthless', seed: seed + p.id * 131 })
  );

  let steps = 0;
  let rounds = 0;
  while (steps < 5000 && rounds < 40) {
    if (game.phase === 'roundEnd') {
      assert.ok(game.roundResult, 'round must have a result');
      assert.ok(game.roundResult.winners.length >= 0);
      rounds += 1;
      game.startRound(game.nextFirstIndex);
      assertCardCounts(game);
      continue;
    }
    if (game.phase === 'gameEnd') break;

    if (!game.pending && !game.drawn) {
      game.beginTurn();
      assert.equal(game.players[game.current].hand.length <= 2, true);
      assertCardCounts(game);
      game.takeEvents();
    }

    if (game.pending) {
      const view = game.getPlayerView(game.current);
      const choice = ais[game.current].chooseChancellor(view);
      assert.ok(choice.keepUid);
      game.resolveChancellor(choice.keepUid, choice.bottomUids);
      game.takeEvents();
      assert.equal(game.pending, null);
      if (game.phase === 'playing') game.advanceTurn();
      steps += 1;
      continue;
    }

    const view = game.getPlayerView(game.current);
    const action = ais[game.current].chooseAction(view);
    assert.ok(action, `AI ${game.current} failed to choose an action`);

    const owned = game.players[game.current].hand.some((c) => c.uid === action.cardUid);
    assert.ok(owned, 'AI must play its own card');
    if (action.targetId !== null && action.targetId !== undefined) {
      const target = game.players[action.targetId];
      assert.ok(target, 'target must exist');
      assert.equal(target.eliminated, false, 'target must not be eliminated');
    }

    game.play(action.cardUid, action);
    assertCardCounts(game);
    game.takeEvents();

    if (game.phase === 'playing' && !game.pending) {
      game.advanceTurn();
      assert.equal(game.players[game.current].eliminated, false);
    }
    steps += 1;
  }

  assert.ok(steps < 5000, `seed ${seed} (${playerCount}p ${mode}) stalled`);
  assert.equal(game.phase, 'gameEnd', `seed ${seed} (${playerCount}p ${mode}) never ended`);
  assert.ok(game.gameWinners.length > 0);
  assert.ok(game.players.some((p) => p.tokens >= game.favorTarget));
  return { steps, rounds, winners: game.gameWinners };
}

test('AI simulations finish cleanly across all player counts and editions', () => {
  const configurations = [
    [2, 'court'],
    [3, 'court'],
    [4, 'court'],
    [5, 'court'],
    [6, 'court'],
    [2, 'classic'],
    [3, 'classic'],
    [4, 'classic']
  ];
  for (const [players, mode] of configurations) {
    for (let seed = 1; seed <= 8; seed += 1) {
      simulate(seed * 1009 + players * 31 + (mode === 'classic' ? 7 : 0), players, mode);
    }
  }
});

test('AI never chooses the Princess when another move is available', () => {
  const game = new LoveLetterGame({ playerCount: 4, seed: 7 });
  game.phase = 'playing';
  game.current = 1;
  game.drawn = true;
  game.pending = null;
  game.players.forEach((p) => {
    p.hand = [];
    p.played = [];
    p.discarded = [];
    p.eliminated = false;
    p.protected = false;
  });
  game.players[1].hand = [
    { uid: 'a', type: 'princess' },
    { uid: 'b', type: 'guard' }
  ];
  game.players[2].hand = [{ uid: 'c', type: 'spy' }];
  game.deck = [{ uid: 'd', type: 'priest' }];
  const ai = createAI({ playerId: 1, difficulty: 'ruthless', seed: 2 });
  const action = ai.chooseAction(game.getPlayerView(1));
  assert.notEqual(action.cardUid, 'a');
});

test('AI respects the forced Countess and never targets a shielded suitor', () => {
  const game = new LoveLetterGame({ playerCount: 4, seed: 11 });
  game.phase = 'playing';
  game.current = 1;
  game.drawn = true;
  game.pending = null;
  game.players.forEach((p) => {
    p.hand = [];
    p.played = [];
    p.discarded = [];
    p.eliminated = false;
    p.protected = false;
  });
  game.players[1].hand = [
    { uid: 'countess', type: 'countess' },
    { uid: 'king', type: 'king' }
  ];
  game.players[2].hand = [{ uid: 'spy', type: 'spy' }];
  game.players[2].protected = true;
  game.players[3].hand = [{ uid: 'priest', type: 'priest' }];
  game.deck = [{ uid: 'deck', type: 'guard' }];
  const ai = createAI({ playerId: 1, difficulty: 'ruthless', seed: 2 });
  const action = ai.chooseAction(game.getPlayerView(1));
  assert.equal(action.cardUid, 'countess');
});

test('AI Chancellor keeps one of its three cards and returns the rest', () => {
  const game = new LoveLetterGame({ playerCount: 4, seed: 18 });
  game.phase = 'playing';
  game.current = 1;
  game.drawn = true;
  game.pending = {
    type: 'chancellor',
    playerId: 1,
    cards: [
      { uid: 'low', type: 'guard' },
      { uid: 'high', type: 'princess' },
      { uid: 'mid', type: 'baron' }
    ]
  };
  game.players[1].hand = [
    { uid: 'low', type: 'guard' },
    { uid: 'high', type: 'princess' },
    { uid: 'mid', type: 'baron' }
  ];
  game.deck = [{ uid: 'd1', type: 'spy' }];
  const ai = createAI({ playerId: 1, difficulty: 'ruthless', seed: 4 });
  const choice = ai.chooseChancellor(game.getPlayerView(1));
  assert.equal(choice.keepUid, 'high');
  assert.deepEqual(new Set(choice.bottomUids), new Set(['low', 'mid']));
});
