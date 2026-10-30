/**
 * Love Letter — rules engine (2025 edition, 21 cards; Classic variant, 16 cards).
 * Pure logic, no DOM. Deck is stored bottom-first: the top card is at the end.
 */

export const FAVOR_TARGETS = Object.freeze({ 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 });

export const CARD_LIST = [
  {
    key: 'spy',
    value: 0,
    name: 'Spy',
    copies: 2,
    classicCopies: 0,
    target: null,
    subtitle: 'The Unseen',
    text: 'No effect. If you are the only suitor still in the round who played or discarded a Spy, gain 1 favor at the end of the round.',
    brief: 'If you alone played a Spy, gain a favor at round’s end.',
    flavor: 'Unseen, unheard, unforgettable.'
  },
  {
    key: 'guard',
    value: 1,
    name: 'Guard',
    copies: 6,
    classicCopies: 5,
    target: 'opponent',
    subtitle: 'The Gate',
    text: 'Choose another suitor and name a character other than the Guard. If they hold that card, they are out of the round.',
    brief: 'Name a character. If they hold it, they are out.',
    flavor: 'The gate is always watched.'
  },
  {
    key: 'priest',
    value: 2,
    name: 'Priest',
    copies: 2,
    classicCopies: 2,
    target: 'opponent',
    subtitle: 'The Confessor',
    text: 'Choose another suitor and secretly look at their hand.',
    brief: 'Secretly look at another suitor’s hand.',
    flavor: 'Secrets have a price.'
  },
  {
    key: 'baron',
    value: 3,
    name: 'Baron',
    copies: 2,
    classicCopies: 2,
    target: 'opponent',
    subtitle: 'The Pride',
    text: 'Choose another suitor. Compare hands; whoever holds the lower card is out of the round.',
    brief: 'Compare hands. The lower card is out.',
    flavor: 'Pride is measured in silks.'
  },
  {
    key: 'handmaid',
    value: 4,
    name: 'Handmaid',
    copies: 2,
    classicCopies: 2,
    target: null,
    subtitle: 'The Veil',
    text: 'Until the start of your next turn, other suitors cannot choose you for their card effects.',
    brief: 'No one may choose you until your next turn.',
    flavor: 'Discretion is a shield.'
  },
  {
    key: 'prince',
    value: 5,
    name: 'Prince',
    copies: 2,
    classicCopies: 2,
    target: 'any',
    subtitle: 'The Heir',
    text: 'Choose any suitor, including yourself. They discard their hand and draw a new one.',
    brief: 'A suitor discards their hand and draws anew.',
    flavor: 'A word from the throne.'
  },
  {
    key: 'chancellor',
    value: 6,
    name: 'Chancellor',
    copies: 2,
    classicCopies: 0,
    target: null,
    subtitle: 'The Ledger',
    text: 'Draw two cards. Keep one, then return the other two to the bottom of the deck in any order.',
    brief: 'Draw two. Keep one; return the rest to the bottom.',
    flavor: 'The ledger remembers.'
  },
  {
    key: 'king',
    value: 7,
    name: 'King',
    copies: 1,
    classicCopies: 1,
    target: 'opponent',
    subtitle: 'The Crown',
    text: 'Choose another suitor and trade hands with them.',
    brief: 'Trade hands with another suitor.',
    flavor: 'Crowns change hands.'
  },
  {
    key: 'countess',
    value: 8,
    name: 'Countess',
    copies: 1,
    classicCopies: 1,
    target: null,
    subtitle: 'The Etiquette',
    text: 'If you hold the King or the Prince, you must play the Countess. Otherwise she has no effect.',
    brief: 'Play her if you hold the King or Prince.',
    flavor: 'Etiquette is law.'
  },
  {
    key: 'princess',
    value: 9,
    name: 'Princess',
    copies: 1,
    classicCopies: 1,
    target: null,
    subtitle: 'The Prize',
    text: 'If you play or discard the Princess for any reason, you are immediately out of the round.',
    brief: 'If you play or discard her, you are out.',
    flavor: 'She is the prize.'
  }
];

export const CARDS = Object.freeze(
  Object.fromEntries(CARD_LIST.map((card) => [card.key, Object.freeze(card)]))
);

export const COURTIERS = Object.freeze([
  { name: 'Lady Vivienne', title: 'The Emerald Court', gem: '#7fa587' },
  { name: 'Lord Ashford', title: 'The Iron Ledger', gem: '#8a93a8' },
  { name: 'Dame Isolde', title: 'The Silver Tongue', gem: '#b08b9a' },
  { name: 'Sir Rowan', title: 'The Lionheart', gem: '#b28c5d' },
  { name: 'Baroness Celeste', title: 'The Gilded Rose', gem: '#c49a7e' },
  { name: 'Lord Ambrose', title: 'The Quiet Blade', gem: '#7c8fa0' }
]);

/** Deterministic PRNG for testing and repeatable rounds. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng) {
  const array = list.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function cardCounts(mode = 'court') {
  return Object.fromEntries(
    CARD_LIST.map((card) => [card.key, mode === 'classic' ? card.classicCopies : card.copies])
  );
}

export function deckSize(mode = 'court') {
  return Object.values(cardCounts(mode)).reduce((sum, n) => sum + n, 0);
}

/**
 * Builds a deck in bottom-first order. `nextUid` is a function returning unique ids.
 */
export function buildDeck(mode, nextUid) {
  const counts = cardCounts(mode);
  const deck = [];
  for (const card of CARD_LIST) {
    for (let i = 0; i < counts[card.key]; i += 1) {
      deck.push({ uid: nextUid(), type: card.key });
    }
  }
  return deck;
}

function playerName(player) {
  return player.isHuman ? 'You' : player.name;
}

function verb(player, base) {
  if (player.isHuman) return base;
  if (base.endsWith('s')) return base;
  return `${base}s`;
}

function be(player) {
  return player.isHuman ? 'are' : 'is';
}

function possessive(player) {
  return player.isHuman ? 'your' : `${player.name}'s`;
}

function listNames(players, humanIndexName = 'You') {
  const names = players.map((p) => (p.isHuman ? humanIndexName : p.name));
  if (names.length === 0) return 'No one';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export class LoveLetterGame {
  constructor({
    playerCount = 4,
    mode = 'court',
    humanName = 'You',
    humanIndex = 0,
    seed = Date.now(),
    favorTarget = null,
    courtiers = COURTIERS
  } = {}) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6) {
      throw new Error('Love Letter supports 2 to 6 players.');
    }
    if (mode === 'classic' && playerCount > 4) {
      throw new Error('Classic Love Letter supports 2 to 4 players.');
    }
    if (mode !== 'court' && mode !== 'classic') {
      throw new Error('Unknown edition.');
    }

    this.mode = mode;
    this.playerCount = playerCount;
    this.humanIndex = humanIndex;
    this.favorTarget = favorTarget ?? FAVOR_TARGETS[playerCount];
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.round = 0;
    this.turnClock = 0;
    this.phase = 'setup';
    this.current = humanIndex;
    this.drawn = false;
    this.pending = null;
    this.deck = [];
    this.setAsideHidden = null;
    this.setAsidePublic = [];
    this.roundResult = null;
    this.gameWinners = null;
    this.roundHistory = [];
    this.events = [];
    this.log = [];
    this.logSeq = 0;
    this.cardSeq = 0;
    this.nextFirstIndex = humanIndex;

    this.players = Array.from({ length: playerCount }, (_, index) => {
      const isHuman = index === humanIndex;
      const courtier = courtiers[(index - (index > humanIndex ? 1 : 0)) % courtiers.length];
      return {
        id: index,
        seat: index,
        isHuman,
        name: isHuman ? humanName.trim() || 'You' : courtier.name,
        title: isHuman ? 'The Hopeful Suitor' : courtier.title,
        gem: isHuman ? '#c9a24d' : courtier.gem,
        tokens: 0,
        hand: [],
        played: [],
        discarded: [],
        eliminated: false,
        protected: false,
        spyPlayed: false
      };
    });

    this.startRound(this.nextFirstIndex);
    this.events = [];
  }

  /* ------------------------------------------------------------------ */
  /* Setup & turn lifecycle                                              */
  /* ------------------------------------------------------------------ */

  startRound(firstIndex = this.nextFirstIndex) {
    if (this.phase === 'gameEnd') throw new Error('The game is over.');
    this.round += 1;
    this.phase = 'playing';
    this.drawn = false;
    this.pending = null;
    this.roundResult = null;
    this.setAsideHidden = null;
    this.setAsidePublic = [];
    this.setAsideHidden = null;
    this.turnClock = 0;
    this.events = [];

    for (const player of this.players) {
      player.hand = [];
      player.played = [];
      player.discarded = [];
      player.eliminated = false;
      player.protected = false;
      player.spyPlayed = false;
    }

    const makeUid = () => {
      this.cardSeq += 1;
      return `c${this.cardSeq}`;
    };
    this.deck = shuffle(buildDeck(this.mode, makeUid), this.rng);
    this.setAsideHidden = this.deck.pop() ?? null;
    if (this.playerCount === 2) {
      for (let i = 0; i < 3; i += 1) {
        const card = this.deck.pop();
        if (card) this.setAsidePublic.push(card);
      }
    }

    for (const player of this.players) {
      const card = this.deck.pop();
      if (card) player.hand.push(card);
    }

    const safeFirst =
      Number.isInteger(firstIndex) && this.players[firstIndex] ? firstIndex : this.humanIndex;
    this.current = safeFirst;
    this.nextFirstIndex = safeFirst;

    this.pushEvent('roundStart', {
      round: this.round,
      firstIndex: safeFirst,
      deckCount: this.deck.length,
      setAsidePublic: this.setAsidePublic.map((c) => ({ ...c }))
    });
    this.addLog(`Round ${roman(this.round)} begins. The court gathers.`, 'gold');
    const first = this.players[safeFirst];
    this.addLog(
      first.isHuman ? 'You take the first turn.' : `${first.name} takes the first turn.`,
      'muted'
    );
    return this;
  }

  beginTurn() {
    if (this.phase !== 'playing') throw new Error('The round is not in play.');
    if (this.pending) throw new Error('Resolve the pending card first.');
    if (this.drawn) throw new Error('A card has already been drawn this turn.');
    const player = this.players[this.current];
    if (!player || player.eliminated) throw new Error('No active player.');

    if (player.protected) {
      player.protected = false;
      this.pushEvent('unprotect', { playerId: player.id });
    }

    this.turnClock += 1;
    const card = this.deck.pop() ?? null;
    if (card) {
      player.hand.push(card);
      this.pushEvent('draw', {
        playerId: player.id,
        card: { ...card },
        hidden: !player.isHuman,
        reason: 'turn',
        deckCount: this.deck.length
      });
      this.addLog(
        player.isHuman ? 'You draw a card.' : `${player.name} draws a card.`,
        'muted'
      );
    } else {
      this.pushEvent('emptyDeck', { playerId: player.id });
    }

    this.drawn = true;
    if (this.deck.length === 0) {
      this.pushEvent('lastTurn', { playerId: player.id });
      this.addLog('The deck is spent. This is the final turn.', 'danger');
    }
    return this;
  }

  play(cardUid, options = {}) {
    if (this.phase !== 'playing') throw new Error('The round is not in play.');
    if (this.pending) throw new Error('Resolve the pending card first.');
    if (!this.drawn) throw new Error('Draw a card first.');
    const player = this.players[this.current];
    if (!player || player.eliminated) throw new Error('No active player.');

    const forced = this.getForcedCardUid(player);
    if (forced && forced !== cardUid) {
      throw new Error('The Countess must be played when held with the King or Prince.');
    }

    const index = player.hand.findIndex((card) => card.uid === cardUid);
    if (index === -1) throw new Error('That card is not in your hand.');
    const [card] = player.hand.splice(index, 1);
    player.played.push(card);
    if (card.type === 'spy') player.spyPlayed = true;

    const targetId =
      options.targetId === undefined || options.targetId === null || options.targetId === ''
        ? null
        : Number(options.targetId);
    const guess = options.guess ?? null;

    this.pushEvent('play', {
      playerId: player.id,
      card: { ...card },
      targetId,
      guess
    });
    this.addLog(
      player.isHuman
        ? `You play the ${CARDS[card.type].name}.`
        : `${player.name} plays the ${CARDS[card.type].name}.`,
      'neutral'
    );

    switch (card.type) {
      case 'guard':
        this.resolveGuard(player, targetId, guess);
        break;
      case 'priest':
        this.resolvePriest(player, targetId);
        break;
      case 'baron':
        this.resolveBaron(player, targetId);
        break;
      case 'handmaid':
        player.protected = true;
        this.pushEvent('protect', { playerId: player.id });
        this.addLog(
          player.isHuman
            ? 'You retire behind the Handmaid’s veil.'
            : `${player.name} retires behind the Handmaid’s veil.`,
          'secret'
        );
        break;
      case 'prince':
        this.resolvePrince(player, targetId);
        break;
      case 'chancellor':
        this.beginChancellor(player);
        if (this.pending) return { pending: true };
        break;
      case 'king':
        this.resolveKing(player, targetId);
        break;
      case 'countess':
        this.addLog(
          player.isHuman
            ? 'The Countess enters with a rustle of silk. She need do nothing.'
            : `${player.name} plays the Countess. She need do nothing.`,
          'secret'
        );
        break;
      case 'princess':
        this.eliminate(player, { cause: 'princess-played', byId: player.id });
        break;
      case 'spy':
        this.pushEvent('spy', { playerId: player.id });
        this.addLog(
          player.isHuman
            ? 'You slip a Spy into the shadows.'
            : `${player.name} slips a Spy into the shadows.`,
          'secret'
        );
        break;
      default:
        throw new Error('Unknown card.');
    }

    if (!this.pending) this.afterAction();
    return { pending: Boolean(this.pending) };
  }

  resolveChancellor(keepUid, bottomUids = null) {
    const pending = this.pending;
    if (!pending || pending.type !== 'chancellor') {
      throw new Error('No Chancellor choice is pending.');
    }
    const player = this.players[pending.playerId];
    const keep = player.hand.find((card) => card.uid === keepUid);
    if (!keep) throw new Error('Choose a card to keep.');

    const others = player.hand.filter((card) => card.uid !== keepUid);
    let ordered = Array.isArray(bottomUids)
      ? bottomUids
          .map((uid) => others.find((card) => card.uid === uid))
          .filter(Boolean)
      : [];
    if (ordered.length !== others.length) {
      ordered = others
        .slice()
        .sort((a, b) => CARDS[a.type].value - CARDS[b.type].value);
    }

    player.hand = [keep];
    // Deck is bottom-first. bottomUids is ordered first-drawn to last-drawn.
    this.deck.unshift(...ordered.slice().reverse());

    this.pushEvent('chancellorReturn', {
      playerId: player.id,
      keep: player.isHuman ? { ...keep } : null,
      returned: player.isHuman ? ordered.map((c) => ({ ...c })) : null,
      deckCount: this.deck.length
    });
    this.addLog(
      player.isHuman
        ? 'You keep one card and return the rest to the bottom of the deck.'
        : `${player.name} keeps one card and returns the rest to the bottom of the deck.`,
      'secret'
    );

    this.pending = null;
    this.afterAction();
  }

  afterAction() {
    if (this.phase !== 'playing' || this.pending) return;
    this.drawn = false;
    const ended = this.checkRoundEnd();
    if (!ended) {
      this.pushEvent('turnEnd', { playerId: this.current });
    }
  }

  advanceTurn() {
    if (this.phase !== 'playing') return;
    if (this.pending) throw new Error('Resolve the pending card first.');
    if (this.drawn) throw new Error('Finish the current turn first.');
    const alive = this.players.filter((p) => !p.eliminated);
    if (alive.length <= 1) {
      this.checkRoundEnd();
      return;
    }
    this.current = this.nextAliveIndex(this.current);
    this.pushEvent('advance', { playerId: this.current });
  }

  nextAliveIndex(from) {
    for (let step = 1; step <= this.players.length; step += 1) {
      const index = (from + step) % this.players.length;
      if (!this.players[index].eliminated) return index;
    }
    return from;
  }

  /* ------------------------------------------------------------------ */
  /* Card effects                                                        */
  /* ------------------------------------------------------------------ */

  resolveGuard(player, targetId, guess) {
    const target = this.pickTarget(player, targetId, { includeSelf: false });
    if (!target) {
      this.pushEvent('noEffect', { playerId: player.id, reason: 'noTarget' });
      this.addLog(
        player.isHuman
          ? 'Every other suitor is shielded. Your Guard can do nothing.'
          : `${player.name}’s Guard finds every other suitor shielded.`,
        'muted'
      );
      return;
    }
    if (!guess || !CARDS[guess] || guess === 'guard') {
      throw new Error('Name a character other than the Guard.');
    }
    const guessCard = CARDS[guess];
    this.pushEvent('guard', {
      playerId: player.id,
      targetId: target.id,
      guess,
      hit: target.hand.some((card) => card.type === guess)
    });
    this.addLog(
      `${playerName(player)} name${player.isHuman ? '' : 's'} the ${guessCard.name} against ${
        target.isHuman ? 'you' : target.name
      }.`,
      'neutral'
    );
    if (target.hand.some((card) => card.type === guess)) {
      this.eliminate(target, { cause: 'guard', byId: player.id, guess });
    } else {
      this.pushEvent('guardMiss', { playerId: player.id, targetId: target.id, guess });
      this.addLog(
        target.isHuman
          ? `You do not hold the ${guessCard.name}.`
          : `${target.name} does not hold the ${guessCard.name}.`,
        'muted'
      );
    }
  }

  resolvePriest(player, targetId) {
    const target = this.pickTarget(player, targetId, { includeSelf: false });
    if (!target) {
      this.pushEvent('noEffect', { playerId: player.id, reason: 'noTarget' });
      this.addLog(
        player.isHuman
          ? 'Every other suitor is shielded. Your Priest can do nothing.'
          : `${player.name}’s Priest finds every other suitor shielded.`,
        'muted'
      );
      return;
    }
    const card = target.hand[0] ?? null;
    this.pushEvent('priest', {
      playerId: player.id,
      targetId: target.id,
      card: card ? { ...card } : null
    });
    this.addLog(
      player.isHuman
        ? `You privately study ${target.isHuman ? 'your own' : `${target.name}’s`} hand.`
        : `${player.name} privately consults ${target.isHuman ? 'you' : target.name}.`,
      'secret'
    );
  }

  resolveBaron(player, targetId) {
    const target = this.pickTarget(player, targetId, { includeSelf: false });
    if (!target) {
      this.pushEvent('noEffect', { playerId: player.id, reason: 'noTarget' });
      this.addLog(
        player.isHuman
          ? 'Every other suitor is shielded. Your Baron can do nothing.'
          : `${player.name}’s Baron finds every other suitor shielded.`,
        'muted'
      );
      return;
    }
    const ownCard = player.hand[0] ?? null;
    const targetCard = target.hand[0] ?? null;
    const ownValue = ownCard ? CARDS[ownCard.type].value : -1;
    const targetValue = targetCard ? CARDS[targetCard.type].value : -1;

    this.pushEvent('baron', {
      playerId: player.id,
      targetId: target.id,
      actorCard: ownCard ? { ...ownCard } : null,
      targetCard: targetCard ? { ...targetCard } : null,
      reveal: player.isHuman || target.isHuman,
      actorValue: ownValue,
      targetValue
    });
    this.addLog(
      `${playerName(player)} and ${target.isHuman ? 'you' : target.name} compare hands in private.`,
      'secret'
    );

    if (ownValue < targetValue) {
      // The card user loses.
      this.eliminate(player, { cause: 'baron', byId: target.id });
    } else if (targetValue < ownValue) {
      this.eliminate(target, { cause: 'baron', byId: player.id });
    } else {
      this.pushEvent('baronTie', { playerId: player.id, targetId: target.id });
      this.addLog('The Baron finds the two evenly matched. Neither leaves.', 'secret');
    }
  }

  resolvePrince(player, targetId) {
    const target = this.pickTarget(player, targetId, { includeSelf: true });
    if (!target) {
      this.pushEvent('noEffect', { playerId: player.id, reason: 'noTarget' });
      return;
    }
    this.pushEvent('prince', { playerId: player.id, targetId: target.id });

    const discarded = target.hand.shift() ?? null;
    if (!discarded) {
      this.addLog(
        target.isHuman ? 'You have no hand to discard.' : `${target.name} has no hand to discard.`,
        'muted'
      );
      return;
    }
    target.discarded.push(discarded);
    if (discarded.type === 'spy') target.spyPlayed = true;
    this.pushEvent('discard', {
      playerId: target.id,
      card: { ...discarded },
      cause: 'prince'
    });
    this.addLog(
      `${target.isHuman ? 'You discard' : `${target.name} discards`} the ${
        CARDS[discarded.type].name
      }.`,
      'neutral'
    );

    if (discarded.type === 'princess') {
      this.eliminate(target, { cause: 'princess', byId: player.id });
      return;
    }

    const replacement = this.drawFromDeckOrSetAside();
    if (replacement) {
      target.hand.push(replacement);
      this.pushEvent('draw', {
        playerId: target.id,
        card: { ...replacement },
        hidden: !target.isHuman,
        reason: 'prince',
        deckCount: this.deck.length
      });
      this.addLog(
        target.isHuman ? 'You draw a new hand.' : `${target.name} draws a new hand.`,
        'muted'
      );
    } else {
      this.addLog(
        target.isHuman
          ? 'There is no card left to draw.'
          : `${target.name} finds no card left to draw.`,
        'danger'
      );
    }
  }

  resolveKing(player, targetId) {
    const target = this.pickTarget(player, targetId, { includeSelf: false });
    if (!target) {
      this.pushEvent('noEffect', { playerId: player.id, reason: 'noTarget' });
      this.addLog(
        player.isHuman
          ? 'Every other suitor is shielded. Your King can do nothing.'
          : `${player.name}’s King finds every other suitor shielded.`,
        'muted'
      );
      return;
    }
    const own = player.hand;
    player.hand = target.hand;
    target.hand = own;
    this.pushEvent('trade', { playerId: player.id, targetId: target.id });
    this.addLog(
      `${playerName(player)} trade${player.isHuman ? '' : 's'} hands with ${
        target.isHuman ? 'you' : target.name
      }.`,
      'secret'
    );
  }

  beginChancellor(player) {
    if (this.deck.length === 0) {
      this.pushEvent('noEffect', { playerId: player.id, reason: 'emptyDeck' });
      this.addLog(
        player.isHuman
          ? 'The Chancellor finds the deck empty.'
          : `${player.name}’s Chancellor finds the deck empty.`,
        'muted'
      );
      return;
    }
    let drawn = 0;
    while (drawn < 2 && this.deck.length > 0) {
      const card = this.deck.pop();
      if (!card) break;
      player.hand.push(card);
      drawn += 1;
      this.pushEvent('draw', {
        playerId: player.id,
        card: { ...card },
        hidden: !player.isHuman,
        reason: 'chancellor',
        deckCount: this.deck.length
      });
    }
    if (drawn === 0) {
      this.pushEvent('noEffect', { playerId: player.id, reason: 'emptyDeck' });
      return;
    }
    this.pending = {
      type: 'chancellor',
      playerId: player.id,
      cards: player.hand.map((card) => ({ ...card }))
    };
    this.pushEvent('chancellor', {
      playerId: player.id,
      drawn,
      cards: player.isHuman ? player.hand.map((c) => ({ ...c })) : null,
      handSize: player.hand.length
    });
    this.addLog(
      player.isHuman
        ? `You draw ${drawn === 2 ? 'two cards' : 'a card'} and consult the Chancellor’s ledger.`
        : `${player.name} draws ${drawn === 2 ? 'two cards' : 'a card'} and consults the Chancellor’s ledger.`,
      'neutral'
    );
  }

  drawFromDeckOrSetAside() {
    if (this.deck.length > 0) return this.deck.pop();
    if (this.setAsideHidden) {
      const card = this.setAsideHidden;
      this.setAsideHidden = null;
      return card;
    }
    return null;
  }

  eliminate(player, { cause = 'unknown', byId = null, guess = null } = {}) {
    if (player.eliminated) return;
    player.eliminated = true;
    player.protected = false;
    const hand = player.hand.splice(0);
    for (const card of hand) {
      player.discarded.push(card);
      if (card.type === 'spy') player.spyPlayed = true;
    }
    this.pushEvent('eliminate', {
      playerId: player.id,
      cause,
      byId,
      guess,
      hand: hand.map((card) => ({ ...card }))
    });

    const subject = player.isHuman ? 'You' : player.name;
    const reasons = {
      guard: `${subject} ${be(player)} unmasked.`,
      baron: `${subject} ${verb(player, 'hold')} the lower card and ${be(player)} out of the round.`,
      princess: `${subject} ${be(player)} undone by the Princess and out of the round.`,
      'princess-played': `${subject} ${verb(player, 'play')} the Princess and ${be(
        player
      )} undone by her.`,
      unknown: `${subject} ${be(player)} out of the round.`
    };
    this.addLog(reasons[cause] ?? reasons.unknown, 'danger');
  }

  /* ------------------------------------------------------------------ */
  /* Targeting & round end                                               */
  /* ------------------------------------------------------------------ */

  pickTarget(player, targetId, { includeSelf = false } = {}) {
    const legal = this.legalTargets(player, includeSelf);
    if (legal.length === 0) return null;
    if (targetId === null || targetId === undefined) {
      if (legal.length === 1) return legal[0];
      throw new Error('Choose a target.');
    }
    const target = legal.find((p) => p.id === Number(targetId));
    if (!target) throw new Error('That suitor cannot be chosen.');
    return target;
  }

  legalTargets(player, includeSelf = false) {
    return this.players.filter((p) => {
      if (p.eliminated) return false;
      if (p.id === player.id) return includeSelf;
      return !p.protected;
    });
  }

  targetsRequired(type) {
    return CARDS[type]?.target ?? null;
  }

  getForcedCardUid(player = this.players[this.current]) {
    if (!player) return null;
    const countess = player.hand.find((card) => card.type === 'countess');
    if (!countess) return null;
    const hasRoyal = player.hand.some(
      (card) => card.type === 'king' || card.type === 'prince'
    );
    return hasRoyal ? countess.uid : null;
  }

  getLegalCardUids(player = this.players[this.current]) {
    if (!player) return [];
    const forced = this.getForcedCardUid(player);
    return forced ? [forced] : player.hand.map((card) => card.uid);
  }

  checkRoundEnd() {
    if (this.phase !== 'playing') return true;
    const alive = this.players.filter((p) => !p.eliminated);
    if (alive.length === 0) {
      this.endRound([], 'noSurvivors');
      return true;
    }
    if (alive.length === 1) {
      this.endRound(alive, 'lastStanding');
      return true;
    }
    if (this.deck.length === 0) {
      const values = alive.map((p) => (p.hand[0] ? CARDS[p.hand[0].type].value : -1));
      const highest = Math.max(...values);
      const winners = alive.filter(
        (p) => (p.hand[0] ? CARDS[p.hand[0].type].value : -1) === highest
      );
      this.endRound(winners, 'deckEmpty');
      return true;
    }
    return false;
  }

  endRound(winners, reason) {
    if (this.phase !== 'playing') return;
    this.phase = 'roundEnd';
    this.drawn = false;
    this.pending = null;

    const alive = this.players.filter((p) => !p.eliminated);
    const awards = [];
    for (const winner of winners) {
      winner.tokens += 1;
      awards.push({ playerId: winner.id, amount: 1, reason: 'round' });
    }

    const spies = alive.filter((p) => p.spyPlayed);
    const spyPlayer = spies.length === 1 ? spies[0] : null;
    if (spyPlayer) {
      spyPlayer.tokens += 1;
      awards.push({ playerId: spyPlayer.id, amount: 1, reason: 'spy' });
    }

    const reasonText = {
      lastStanding: 'The last suitor standing carries the letter to the Princess.',
      deckEmpty: 'The deck is spent. The highest hand wins the favor of the Princess.',
      noSurvivors: 'No suitor remains to deliver a letter.'
    }[reason] ?? 'The round has ended.';

    this.addLog(reasonText, 'gold');
    for (const winner of winners) {
      this.addLog(
        winner.isHuman
          ? 'You win the round and gain 1 favor.'
          : `${winner.name} wins the round and gains 1 favor.`,
        'good'
      );
    }
    if (spyPlayer) {
      this.addLog(
        spyPlayer.isHuman
          ? 'You were the only suitor to play a Spy. You gain an extra favor.'
          : `${spyPlayer.name} was the only suitor to play a Spy and gains an extra favor.`,
        'good'
      );
    }

    let nextFirstIndex = this.current;
    if (winners.length > 0) {
      nextFirstIndex = winners[Math.floor(this.rng() * winners.length)].id;
    } else if (alive.length > 0) {
      nextFirstIndex = alive[Math.floor(this.rng() * alive.length)].id;
    }
    this.nextFirstIndex = nextFirstIndex;

    const hands = this.players.map((player) => ({
      playerId: player.id,
      card: player.hand[0] ? { ...player.hand[0] } : null,
      eliminated: player.eliminated
    }));

    this.roundResult = {
      round: this.round,
      reason,
      reasonText,
      winners: winners.map((p) => p.id),
      spyPlayer: spyPlayer ? spyPlayer.id : null,
      awards,
      hands,
      nextFirstIndex,
      deckEmpty: this.deck.length === 0,
      tokens: this.players.map((p) => ({ playerId: p.id, tokens: p.tokens }))
    };
    this.roundHistory.push(this.roundResult);

    const champions = this.players.filter((p) => p.tokens >= this.favorTarget);
    if (champions.length > 0) {
      this.phase = 'gameEnd';
      this.gameWinners = champions.map((p) => p.id);
      this.addLog(
        champions.length === 1
          ? champions[0].isHuman
            ? 'You have won the Princess’s favor.'
            : `${champions[0].name} has won the Princess’s favor.`
          : `${listNames(champions)} share the Princess’s favor.`,
        'gold'
      );
    }

    this.pushEvent('roundEnd', { result: this.roundResult });
    if (champions.length > 0) {
      this.pushEvent('gameEnd', { winners: this.gameWinners });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Views                                                               */
  /* ------------------------------------------------------------------ */

  getPlayerView(playerId) {
    const me = this.players[playerId];
    if (!me) throw new Error('Unknown player.');
    return {
      playerId,
      round: this.round,
      mode: this.mode,
      phase: this.phase,
      current: this.current,
      drawn: this.drawn,
      pending: this.pending ? { type: this.pending.type, playerId: this.pending.playerId } : null,
      favorTarget: this.favorTarget,
      deckCount: this.deck.length,
      hiddenSetAside: this.setAsideHidden ? 1 : 0,
      setAsidePublic: this.setAsidePublic.map((c) => ({ ...c })),
      ownHand: me.hand.map((c) => ({ ...c })),
      forcedUid: this.getForcedCardUid(me),
      players: this.players.map((p) => ({
        id: p.id,
        seat: p.seat,
        isHuman: p.isHuman,
        name: p.name,
        title: p.title,
        tokens: p.tokens,
        handCount: p.hand.length,
        played: p.played.map((c) => ({ ...c })),
        discarded: p.discarded.map((c) => ({ ...c })),
        eliminated: p.eliminated,
        protected: p.protected,
        spyPlayed: p.spyPlayed
      }))
    };
  }

  takeEvents() {
    const events = this.events.slice();
    this.events = [];
    return events;
  }

  pushEvent(kind, data = {}) {
    this.events.push({ kind, ...data });
  }

  addLog(text, tone = 'neutral') {
    this.logSeq += 1;
    this.log.push({ id: this.logSeq, round: this.round, text, tone });
    if (this.log.length > 260) this.log.splice(0, this.log.length - 260);
  }

  /* ------------------------------------------------------------------ */
  /* Convenience                                                         */
  /* ------------------------------------------------------------------ */

  get currentPlayer() {
    return this.players[this.current];
  }
}

export function roman(number) {
  const numerals = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ];
  let value = Math.max(1, Math.floor(number));
  let result = '';
  for (const [amount, symbol] of numerals) {
    while (value >= amount) {
      result += symbol;
      value -= amount;
    }
  }
  return result;
}
