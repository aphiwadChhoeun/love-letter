import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDS,
  FAVOR_TARGETS,
  LoveLetterGame,
  cardCounts,
  deckSize
} from '../src/rules.js';

let uid = 0;
const C = (type) => ({ uid: `t${(uid += 1)}`, type });

function setupTurn(game, { hand = [], deck = ['spy'], setAside = null, current = 0 } = {}) {
  game.phase = 'playing';
  game.current = current;
  game.pending = null;
  game.drawn = true;
  game.events = [];
  game.log = [];
  for (const player of game.players) {
    player.hand = [];
    player.played = [];
    player.discarded = [];
    player.eliminated = false;
    player.protected = false;
    player.spyPlayed = false;
  }
  game.players[current].hand = hand.map(C);
  game.deck = deck.map(C);
  game.setAsideHidden = setAside ? C(setAside) : null;
  game.setAsidePublic = [];
  return game;
}

function make(players = 4, mode = 'court') {
  return new LoveLetterGame({ playerCount: players, mode, seed: 42, humanName: 'You' });
}

test('deck composition and favor targets match the 2025 rules', () => {
  assert.equal(deckSize('court'), 21);
  assert.equal(deckSize('classic'), 16);
  const court = cardCounts('court');
  assert.equal(court.guard, 6);
  assert.equal(court.spy, 2);
  assert.equal(court.chancellor, 2);
  assert.equal(court.princess, 1);
  const classic = cardCounts('classic');
  assert.equal(classic.guard, 5);
  assert.equal(classic.spy, 0);
  assert.equal(classic.chancellor, 0);
  assert.deepEqual(FAVOR_TARGETS, { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 });
});

test('setup sets aside one card, plus three face-up cards in a two-player game', () => {
  const two = make(2);
  assert.equal(two.setAsidePublic.length, 3);
  assert.ok(two.setAsideHidden);
  assert.equal(two.deck.length, 21 - 1 - 3 - 2);
  assert.equal(two.players.every((p) => p.hand.length === 1), true);

  const four = make(4);
  assert.equal(four.setAsidePublic.length, 0);
  assert.equal(four.deck.length, 21 - 1 - 4);
});

test('classic edition changes the deck and caps the table at four', () => {
  const four = make(4, 'classic');
  assert.equal(four.deck.length, 16 - 1 - 4);
  assert.throws(() => make(5, 'classic'), /2 to 4/);
});

test('the Countess must be played with the King or Prince', () => {
  const game = setupTurn(make(), { hand: ['countess', 'king'], deck: ['spy'] });
  const countess = game.players[0].hand.find((c) => c.type === 'countess');
  const king = game.players[0].hand.find((c) => c.type === 'king');
  assert.equal(game.getForcedCardUid(game.players[0]), countess.uid);
  assert.throws(() => game.play(king.uid), /Countess/);
  game.play(countess.uid);
  assert.equal(game.players[0].hand.length, 1);
});

test('Guard names a character and eliminates a matching hand', () => {
  const game = setupTurn(make(3), { hand: ['guard', 'priest'], deck: ['spy'] });
  game.players[1].hand = [C('princess')];
  const guard = game.players[0].hand[0];
  game.play(guard.uid, { targetId: 1, guess: 'princess' });
  assert.equal(game.players[1].eliminated, true);
  assert.equal(game.players[1].hand.length, 0);
  assert.equal(game.players[1].discarded[0].type, 'princess');
  assert.equal(game.players[0].eliminated, false);
});

test('Guard misses when the named card is not held', () => {
  const game = setupTurn(make(3), { hand: ['guard', 'priest'], deck: ['spy'] });
  game.players[1].hand = [C('baron')];
  const guard = game.players[0].hand[0];
  game.play(guard.uid, { targetId: 1, guess: 'princess' });
  assert.equal(game.players[1].eliminated, false);
});

test('a protected suitor cannot be chosen', () => {
  const game = setupTurn(make(3), { hand: ['guard', 'priest'], deck: ['spy'] });
  game.players[1].hand = [C('princess')];
  game.players[1].protected = true;
  const guard = game.players[0].hand[0];
  assert.throws(() => game.play(guard.uid, { targetId: 1, guess: 'princess' }), /cannot be chosen/);
});

test('when every other suitor is shielded, target cards have no effect', () => {
  const game = setupTurn(make(3), { hand: ['guard', 'priest'], deck: ['spy'] });
  game.players[1].text = '';
  game.players[1].protected = true;
  game.players[2].protected = true;
  game.players[1].hand = [C('princess')];
  game.players[2].hand = [C('king')];
  const guard = game.players[0].hand[0];
  game.play(guard.uid);
  assert.equal(game.players[1].eliminated, false);
  assert.equal(game.players[2].eliminated, false);
  assert.ok(game.log.some((entry) => entry.text.includes('shielded')));
});

test('Baron compares hands, handles ties, and can eliminate the user', () => {
  const tie = setupTurn(make(3), { hand: ['baron', 'spy'], deck: ['spy'] });
  tie.players[1].hand = [C('spy')];
  const baron = tie.players[0].hand.find((c) => c.type === 'baron');
  tie.play(baron.uid, { targetId: 1 });
  assert.equal(tie.players[0].eliminated, false);
  assert.equal(tie.players[1].eliminated, false);
  assert.ok(tie.log.some((entry) => entry.text.includes('evenly matched')));

  const lose = setupTurn(make(3), { hand: ['baron', 'guard'], deck: ['spy'] });
  lose.players[1].hand = [C('princess')];
  const baron2 = lose.players[0].hand.find((c) => c.type === 'baron');
  lose.play(baron2.uid, { targetId: 1 });
  assert.equal(lose.players[0].eliminated, true);
  assert.equal(lose.players[1].eliminated, false);
});

test('Prince forces a discard and eliminates the Princess holder', () => {
  const game = setupTurn(make(3), { hand: ['prince', 'spy'], deck: ['guard'] });
  game.players[1].hand = [C('princess')];
  const prince = game.players[0].hand.find((c) => c.type === 'prince');
  game.play(prince.uid, { targetId: 1 });
  assert.equal(game.players[1].eliminated, true);
  assert.equal(game.players[1].hand.length, 0);
  assert.equal(game.players[1].discarded[0].type, 'princess');
});

test('Prince draws the set-aside card when the deck is empty', () => {
  const game = setupTurn(make(3), { hand: ['prince', 'spy'], deck: [], setAside: 'princess' });
  game.players[1].hand = [C('guard')];
  const prince = game.players[0].hand.find((c) => c.type === 'prince');
  game.play(prince.uid, { targetId: 1 });
  assert.equal(game.players[1].hand[0].type, 'princess');
  assert.equal(game.setAsideHidden, null);
});

test('King trades hands without revealing them', () => {
  const game = setupTurn(make(3), { hand: ['king', 'priest'], deck: ['spy'] });
  game.players[1].hand = [C('princess')];
  const king = game.players[0].hand.find((c) => c.type === 'king');
  game.play(king.uid, { targetId: 1 });
  assert.equal(game.players[0].hand[0].type, 'princess');
  assert.equal(game.players[1].hand[0].type, 'priest');
});

test('Chancellor keeps one card and returns the rest to the bottom in order', () => {
  const game = setupTurn(make(3), {
    hand: ['chancellor', 'spy'],
    deck: ['guard', 'priest']
  });
  const chancellor = game.players[0].hand.find((c) => c.type === 'chancellor');
  game.play(chancellor.uid);
  assert.ok(game.pending);
  assert.equal(game.players[0].hand.length, 3);
  const keep = game.players[0].hand.find((c) => c.type === 'spy');
  const others = game.players[0].hand.filter((c) => c.uid !== keep.uid);
  game.resolveChancellor(keep.uid, [others[0].uid, others[1].uid]);
  assert.equal(game.players[0].hand.length, 1);
  assert.equal(game.players[0].hand[0].type, 'spy');
  assert.deepEqual(
    game.deck.map((c) => c.type),
    [others[1].type, others[0].type]
  );
  assert.equal(game.pending, null);
});

test('Handmaid protection ends at the start of the protected player’s next turn', () => {
  const game = setupTurn(make(3), { hand: ['handmaid', 'spy'], deck: ['guard', 'priest'] });
  const handmaid = game.players[0].hand.find((c) => c.type === 'handmaid');
  game.play(handmaid.uid);
  assert.equal(game.players[0].protected, true);
  game.current = 0;
  game.drawn = false;
  game.beginTurn();
  assert.equal(game.players[0].protected, false);
});

test('Spy grants a favor only to the sole surviving spy player', () => {
  const game = setupTurn(make(3), { hand: ['spy', 'guard'], deck: [] });
  game.players[1].hand = [C('priest')];
  game.players[2].hand = [C('princess')];
  const spy = game.players[0].hand.find((c) => c.type === 'spy');
  game.play(spy.uid);
  assert.equal(game.phase, 'roundEnd');
  assert.equal(game.players[0].tokens, 1);
  assert.equal(game.players[2].tokens, 1);
  assert.equal(game.roundResult.spyPlayer, 0);
});

test('the highest remaining hand wins when the deck runs out, with ties sharing', () => {
  const game = setupTurn(make(3), {
    hand: ['countess', 'spy'],
    deck: []
  });
  game.players[1].hand = [C('handmaid')];
  game.players[2].hand = [C('handmaid')];
  const countess = game.players[0].hand.find((c) => c.type === 'countess');
  game.play(countess.uid);
  assert.equal(game.phase, 'roundEnd');
  assert.deepEqual(game.roundResult.winners.sort(), [1, 2]);
  assert.equal(game.players[1].tokens, 1);
  assert.equal(game.players[2].tokens, 1);
  assert.equal(game.players[0].tokens, 0);
});

test('reaching the favor target ends the game, including simultaneous winners', () => {
  const game = setupTurn(make(3), {
    hand: ['countess', 'handmaid'],
    deck: []
  });
  game.players[0].tokens = 4;
  game.players[1].tokens = 4;
  game.players[1].hand = [C('handmaid')];
  game.players[2].hand = [C('spy')];
  const countess = game.players[0].hand.find((c) => c.type === 'countess');
  game.play(countess.uid);
  assert.equal(game.favorTarget, 5);
  assert.equal(game.phase, 'gameEnd');
  assert.deepEqual(game.gameWinners?.sort(), [0, 1]);
  assert.ok(game.players[0].tokens >= 5);
  assert.ok(game.players[1].tokens >= 5);
});

test('playing the Princess eliminates the player', () => {
  const game = setupTurn(make(3), { hand: ['princess', 'spy'], deck: ['guard'] });
  const princess = game.players[0].hand.find((c) => c.type === 'princess');
  game.play(princess.uid);
  assert.equal(game.players[0].eliminated, true);
  assert.equal(game.players[0].hand.length, 0);
});

test('the round ends immediately when only one suitor remains', () => {
  const game = setupTurn(make(3), { hand: ['guard', 'priest'], deck: ['spy', 'baron'] });
  game.players[1].hand = [C('princess')];
  game.players[2].eliminated = true;
  game.players[2].hand = [];
  const guard = game.players[0].hand.find((c) => c.type === 'guard');
  game.play(guard.uid, { targetId: 1, guess: 'princess' });
  assert.equal(game.phase, 'roundEnd');
  assert.deepEqual(game.roundResult.winners, [0]);
  assert.equal(game.roundResult.reason, 'lastStanding');
});

test('Chancellor cannot be used as a free draw when the deck is empty', () => {
  const game = setupTurn(make(3), {
    hand: ['chancellor', 'spy'],
    deck: []
  });
  const chancellor = game.players[0].hand.find((c) => c.type === 'chancellor');
  game.play(chancellor.uid);
  assert.equal(game.pending, null);
  assert.equal(game.players[0].hand.length, 1);
  assert.equal(game.phase, 'roundEnd');
});

test('the AI view does not expose other hands or the deck order', () => {
  const game = make(4);
  const view = game.getPlayerView(2);
  assert.equal(view.ownHand.length, 1);
  assert.equal(view.players[0].hand, undefined);
  assert.equal(view.deck, undefined);
  assert.equal(view.players[2].hand, undefined);
  assert.equal(view.deckCount, game.deck.length);
});
