/**
 * Court AI — a principled but fallible suitor.
 *
 * The AI is given only a sanitized view (its own hand plus public information).
 * It reasons with card-count probabilities and the shape of the round.
 */
import { CARDS, CARD_LIST, cardCounts, mulberry32 } from './rules.js';

const DIFFICULTY = {
  gentle: { random: 0.34, jitter: 2.1, name: 'Gentle' },
  courtier: { random: 0.06, jitter: 0.75, name: 'Courtier' },
  ruthless: { random: 0, jitter: 0.18, name: 'Ruthless' }
};

export function createAI({ playerId, difficulty = 'courtier', seed = Date.now() + playerId * 97 }) {
  const rng = mulberry32(seed);
  const profile = DIFFICULTY[difficulty] ?? DIFFICULTY.courtier;
  return {
    playerId,
    difficulty,
    chooseAction(view) {
      return chooseAction(view, playerId, profile, rng);
    },
    chooseChancellor(view) {
      return chooseChancellor(view, profile, rng);
    }
  };
}

function unknownCounts(view) {
  const counts = cardCounts(view.mode);
  const subtract = (type) => {
    counts[type] = Math.max(0, (counts[type] ?? 0) - 1);
  };
  for (const card of view.ownHand) subtract(card.type);
  for (const player of view.players) {
    for (const card of player.played) subtract(card.type);
    for (const card of player.discarded) subtract(card.type);
  }
  for (const card of view.setAsidePublic) subtract(card.type);
  return counts;
}

function makeContext(view) {
  const me = view.players[view.playerId];
  const alive = view.players.filter((p) => !p.eliminated);
  const opponents = alive.filter((p) => p.id !== me.id);
  const counts = unknownCounts(view);
  const unknownSlots = Math.max(
    1,
    view.deckCount + opponents.length + view.hiddenSetAside
  );
  let valueSum = 0;
  let cardSum = 0;
  for (const [type, count] of Object.entries(counts)) {
    valueSum += count * CARDS[type].value;
    cardSum += count;
  }
  return {
    view,
    me,
    alive,
    opponents,
    counts,
    unknownSlots,
    avgValue: cardSum > 0 ? valueSum / cardSum : 5,
    willEnd: view.deckCount === 0,
    onlyTwo: alive.length === 2,
    forcedUid: view.forcedUid
  };
}

function generateActions(ctx) {
  const { view, forcedUid } = ctx;
  const actions = [];
  const cards = view.ownHand.filter((card) => !forcedUid || card.uid === forcedUid);

  for (const card of cards) {
    const def = CARDS[card.type];
    if (def.target === 'any') {
      const targets = view.players.filter(
        (p) => !p.eliminated && (p.id === view.playerId || !p.protected)
      );
      for (const target of targets) {
        actions.push({ cardUid: card.uid, targetId: target.id });
      }
    } else if (def.target === 'opponent') {
      const targets = ctx.opponents.filter((p) => !p.protected);
      if (targets.length === 0) {
        actions.push({ cardUid: card.uid, targetId: null });
      } else if (card.type === 'guard') {
        const guesses = CARD_LIST.filter(
          (c) => c.key !== 'guard' && (ctx.counts[c.key] ?? 0) > 0
        ).map((c) => c.key);
        if (guesses.length === 0) guesses.push('princess');
        for (const target of targets) {
          for (const guess of guesses) {
            actions.push({ cardUid: card.uid, targetId: target.id, guess });
          }
        }
      } else {
        for (const target of targets) {
          actions.push({ cardUid: card.uid, targetId: target.id });
        }
      }
    } else {
      actions.push({ cardUid: card.uid });
    }
  }
  return actions;
}

function scoreAction(action, ctx) {
  const { view, me, alive, opponents, counts, unknownSlots, avgValue, willEnd, onlyTwo } =
    ctx;
  const card = view.ownHand.find((c) => c.uid === action.cardUid);
  if (!card) return -1000;
  const other = view.ownHand.find((c) => c.uid !== action.cardUid) ?? null;
  const keptValue = other ? CARDS[other.type].value : 0;
  const target =
    action.targetId === null || action.targetId === undefined
      ? null
      : view.players[action.targetId];
  const threat = target ? target.tokens / view.favorTarget : 0;
  const baseKeep = keptValue * (willEnd ? 0.58 : 0.17);
  const probability = (type) => Math.min(1, (counts[type] ?? 0) / unknownSlots);
  const endgameWin = onlyTwo && willEnd ? 5.2 : onlyTwo ? 4.2 : 0;

  switch (card.type) {
    case 'guard': {
      if (!target) return -0.45 + baseKeep * 0.8;
      const p = probability(action.guess);
      const hitValue =
        2.5 + threat * 2.1 + endgameWin + (willEnd ? 0.45 : 0) + (target.protected ? -4 : 0);
      return 0.25 + p * hitValue + baseKeep * 0.55 - (1 - p) * 0.18;
    }

    case 'priest': {
      if (!target) return -0.35 + baseKeep * 0.7;
      return 0.28 + (willEnd ? -0.35 : 0.55) + threat * 0.35 + baseKeep * 0.45;
    }

    case 'baron': {
      if (!target) return -0.35 + baseKeep * 0.7;
      const own = keptValue;
      let pWin = 0;
      let pLose = 0;
      for (const [type, count] of Object.entries(counts)) {
        const value = CARDS[type].value;
        if (value < own) pWin += count;
        else if (value > own) pLose += count;
      }
      pWin = Math.min(1, pWin / unknownSlots);
      pLose = Math.min(1, pLose / unknownSlots);
      const winBonus = pWin * (2.7 + threat * 1.9 + (willEnd ? 1.0 : 0) + endgameWin);
      const loseRisk = pLose * (3.1 + (willEnd ? 1.5 : 0) + (onlyTwo ? 1.5 : 0));
      return 0.1 + winBonus - loseRisk;
    }

    case 'handmaid': {
      if (willEnd) return 0.15 + baseKeep * 0.82;
      return 0.7 + keptValue * 0.38 + (keptValue >= 7 ? 0.45 : 0) + threat * 0.1;
    }

    case 'prince': {
      if (!target) return -0.4 + baseKeep * 0.7;
      if (target.id === me.id) {
        if (keptValue === 9) return -80;
        if (view.deckCount === 0 && view.hiddenSetAside === 0) return -2.5 + baseKeep * 0.4;
        const gain = avgValue - keptValue;
        return -0.15 + gain * (willEnd ? 0.72 : 0.3) + baseKeep * 0.2;
      }
      const pPrincess = probability('princess');
      const princessValue = pPrincess * (4.4 + threat * 2.0 + (onlyTwo ? 5.0 : 0) + (willEnd ? 2.2 : 0));
      const noReplacement =
        view.deckCount === 0 && view.hiddenSetAside === 0 && onlyTwo ? 1.4 : 0;
      return (
        0.25 +
        threat * 0.55 +
        princessValue +
        noReplacement +
        baseKeep * 0.45 +
        (willEnd ? 0.2 : 0)
      );
    }

    case 'chancellor': {
      if (view.deckCount === 0) return -0.2 + baseKeep * 0.75;
      const selection = 0.65 + avgValue * 0.2 + (willEnd ? 0.0 : 0.35);
      const dumpPrincess = keptValue === 9 ? 1.1 : 0;
      return selection + dumpPrincess + keptValue * 0.12;
    }

    case 'king': {
      if (!target) return -0.35 + baseKeep * 0.7;
      const gain = avgValue - keptValue;
      let score = 0.1 + gain * (willEnd ? 0.95 : 0.42) + threat * 0.18;
      if (keptValue === 9) score -= willEnd ? 6.5 : 3.4;
      if (keptValue <= 2) score += 0.35;
      return score;
    }

    case 'countess': {
      return 0.05 + baseKeep * 0.7;
    }

    case 'princess': {
      return -900;
    }

    case 'spy': {
      let spyBonus = 0;
      const rivalSpy = alive.some((p) => p.id !== me.id && p.spyPlayed);
      if (!rivalSpy) {
        if (willEnd) spyBonus = 1.15;
        else if ((counts.spy ?? 0) > 0) spyBonus = 0.4;
        else spyBonus = 0.85;
      }
      return 0.18 + baseKeep * 0.5 + spyBonus;
    }

    default:
      return 0;
  }
}

function chooseAction(view, playerId, profile, rng) {
  const ctx = makeContext(view);
  let actions = generateActions(ctx);
  if (actions.length === 0) return null;

  if (ctx.forcedUid) {
    const forced = actions.find((a) => a.cardUid === ctx.forcedUid);
    if (forced) {
      // Still choose a target if the forced card needs one (Countess never does).
      return forced;
    }
  }

  const scored = actions.map((action) => {
    const base = scoreAction(action, ctx);
    const jitter = (rng() - 0.5) * profile.jitter;
    return { ...action, score: base + jitter };
  });
  scored.sort((a, b) => b.score - a.score);

  if (profile.random > 0 && rng() < profile.random) {
    const safe = scored.filter((a) => a.score > -80);
    if (safe.length > 0) return safe[Math.floor(rng() * safe.length)];
  }
  return scored[0];
}

function chooseChancellor(view, profile, rng) {
  const cards = view.ownHand.slice();
  if (cards.length <= 1) {
    return { keepUid: cards[0]?.uid ?? null, bottomUids: [] };
  }
  const score = (card) => {
    const value = CARDS[card.type].value;
    let utility = value;
    if (card.type === 'princess') {
      utility -= view.deckCount > 4 ? 1.15 : 0;
    }
    if (card.type === 'spy') {
      const rivalSpy = view.players.some(
        (p) => p.id !== view.playerId && !p.eliminated && p.spyPlayed
      );
      if (!rivalSpy) utility += 0.3;
    }
    return utility + (rng() - 0.5) * 0.35;
  };
  const ranked = cards
    .map((card) => ({ card, score: score(card) }))
    .sort((a, b) => b.score - a.score);
  const keep = ranked[0].card;
  const returned = cards
    .filter((card) => card.uid !== keep.uid)
    .sort((a, b) => CARDS[a.type].value - CARDS[b.type].value);
  return {
    keepUid: keep.uid,
    bottomUids: returned.map((card) => card.uid)
  };
}

export { DIFFICULTY };
