import {
  CARDS,
  CARD_LIST,
  FAVOR_TARGETS,
  LoveLetterGame,
  cardCounts,
  deckSize,
  roman
} from './rules.js';
import { createAI } from './ai.js';
import { audio } from './audio.js';

/* ==================================================================
   Constants & state
   ================================================================== */

const STORAGE_KEY = 'love-letter.settings.v1';
const DEFAULT_SETTINGS = {
  players: 4,
  mode: 'court',
  difficulty: 'courtier',
  name: '',
  sound: true,
  music: true,
  speed: 'normal'
};

const settings = loadSettings();

const state = {
  game: null,
  ais: [],
  seq: 0,
  busy: false,
  humanIndex: 0,
  selectedUid: null,
  targetMode: false,
  lastPlay: null,
  effect: null,
  effectTimer: null,
  roundResolved: false,
  modalCloseable: true,
  title: true,
  starting: false,
  paused: false,
  pauseWaiters: []
};

let modalCloseResolve = null;

const dom = {
  body: document.body,
  title: document.getElementById('title-screen'),
  titleRules: document.getElementById('btn-title-rules'),
  begin: document.getElementById('btn-begin'),
  setup: document.getElementById('setup'),
  setupPlayers: document.getElementById('setup-players'),
  setupMode: document.getElementById('setup-mode'),
  setupDifficulty: document.getElementById('setup-difficulty'),
  setupName: document.getElementById('setup-name'),
  setupSummary: document.getElementById('setup-summary'),
  roundMeta: document.getElementById('round-meta'),
  deckPanel: document.getElementById('deck-panel'),
  favorPanel: document.getElementById('favor-panel'),
  chronicle: document.getElementById('chronicle'),
  chronicleKicker: document.getElementById('chronicle-kicker'),
  opponents: document.getElementById('opponents'),
  stageCenter: document.getElementById('stage-center'),
  turnBanner: document.getElementById('turn-banner'),
  effectBanner: document.getElementById('effect-banner'),
  humanZone: document.getElementById('human-zone'),
  toastLayer: document.getElementById('toast-layer'),
  modalLayer: document.getElementById('modal-layer'),
  btnRules: document.getElementById('btn-rules'),
  btnJournal: document.getElementById('btn-journal'),
  btnSound: document.getElementById('btn-sound'),
  btnMenu: document.getElementById('btn-menu'),
  brand: document.getElementById('brand'),
  sidebarClose: document.getElementById('sidebar-close'),
  journalBackdrop: document.getElementById('journal-backdrop')
};

/* ==================================================================
   Tiny utilities
   ================================================================== */

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* A court without a memory is still a court. */
  }
}

function speedFactor() {
  return settings.speed === 'brisk' ? 0.55 : 1;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms * speedFactor())));
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function artFor(type) {
  return `assets/art/cards/${type}.webp`;
}

function defOf(card) {
  return CARDS[card.type];
}

function playerName(player) {
  return player.isHuman ? 'You' : player.name;
}

function verb(player, base) {
  return player.isHuman ? base : `${base}s`;
}

function initialOf(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return (parts[parts.length - 1] || '?').charAt(0).toUpperCase();
}

function pipsHTML(player, target, extraClass = '') {
  let html = '';
  for (let i = 0; i < target; i += 1) {
    html += `<i class="pip ${i < player.tokens ? 'is-filled' : ''} ${extraClass}"></i>`;
  }
  return html;
}

function copiesHTML(type) {
  const def = CARDS[type];
  const count = state.game?.mode === 'classic' ? def.classicCopies : def.copies;
  return Array.from({ length: count }, () => '<i class="is-on"></i>').join('');
}

function medallionHTML(player, extraClass = '') {
  return `<span class="medallion ${extraClass}" style="--gem:${esc(player.gem)}">
    <span class="medallion__initial">${esc(initialOf(player.name))}</span>
  </span>`;
}

function shieldIcon() {
  return '<svg><use href="#i-shield"></use></svg>';
}

function heartIcon() {
  return '<svg><use href="#i-heart"></use></svg>';
}

function cardMarkup(card, { interactive = true, extraClass = '', lock = null } = {}) {
  const def = defOf(card);
  const tag = interactive ? 'button' : 'div';
  const attrs = interactive
    ? `type="button" data-uid="${esc(card.uid)}" ${lock ? 'disabled' : ''}`
    : '';
  const label = `${def.name}, value ${def.value}. ${def.text}`;
  const classes = `card ${interactive ? '' : 'card--static'} ${extraClass}${
    lock ? ' is-disabled' : ''
  }`;
  return `<${tag} class="${classes}" ${attrs}
      ${interactive ? `aria-label="${esc(label)}"` : 'aria-hidden="true"'}
      ${lock ? `data-lock="${esc(lock)}"` : ''}>
    <span class="card__frame">
      <span class="card__art" data-type="${card.type}" style="background-image:url('${artFor(card.type)}')">
        <span class="card__value">${def.value}</span>
        <span class="card__copies">${copiesHTML(card.type)}</span>
        <span class="card__plate">
          <span class="card__name">${esc(def.name)}</span>
          <span class="card__sub">${esc(def.subtitle)}</span>
        </span>
      </span>
      <span class="card__body">
        <span class="card__text">${esc(def.brief)}</span>
        <span class="card__flavor">${esc(def.flavor)}</span>
      </span>
      <span class="card__corner card__corner--tl"></span>
      <span class="card__corner card__corner--tr"></span>
      <span class="card__corner card__corner--bl"></span>
      <span class="card__corner card__corner--br"></span>
    </span>
  </${tag}>`;
}

function miniCardMarkup(card, { latest = false, discarded = false, className = '' } = {}) {
  const def = defOf(card);
  return `<span class="mini-card ${discarded ? 'is-discarded' : ''} ${
    latest ? 'is-latest' : ''
  } ${className}" data-type="${card.type}" style="background-image:url('${artFor(
    card.type
  )}')" data-value="${def.value}" title="${esc(`${def.name} — ${def.text}`)}"></span>`;
}

function revealCardMarkup(card, { winner = false, width = null } = {}) {
  const def = defOf(card);
  return `<div class="reveal-card ${winner ? 'is-winner' : ''}" ${
    width ? `style="width:${width}px;max-width:100%"` : ''
  }>
    <div class="reveal-card__art" style="background-image:url('${artFor(card.type)}')" data-value="${
      def.value
    }"></div>
    <span class="reveal-card__name">${esc(def.name)}</span>
  </div>`;
}

function selectedCard() {
  if (!state.game || !state.selectedUid) return null;
  return state.game.players[state.humanIndex].hand.find((c) => c.uid === state.selectedUid) ?? null;
}

function legalTargetsFor(card) {
  if (!card || !state.game) return [];
  const def = defOf(card);
  if (!def.target) return [];
  return state.game.legalTargets(
    state.game.players[state.humanIndex],
    def.target === 'any'
  );
}

function canTarget(playerId) {
  const card = selectedCard();
  if (!card || !state.targetMode) return false;
  return legalTargetsFor(card).some((p) => p.id === playerId);
}

function humanCanAct() {
  const g = state.game;
  return Boolean(
    g &&
      g.phase === 'playing' &&
      g.current === state.humanIndex &&
      g.drawn &&
      !g.pending &&
      !state.busy &&
      !g.players[state.humanIndex].eliminated
  );
}

function clearSelection() {
  state.selectedUid = null;
  state.targetMode = false;
  renderAll();
}

/* ==================================================================
   Sound & settings
   ================================================================== */

function updateSoundIcon() {
  const use = dom.btnSound.querySelector('use');
  if (use) use.setAttribute('href', settings.sound ? '#i-sound' : '#i-mute');
  dom.btnSound.classList.toggle('is-off', !settings.sound);
  dom.btnSound.setAttribute('aria-pressed', String(settings.sound));
}

function setSound(value) {
  settings.sound = Boolean(value);
  saveSettings();
  audio.init();
  audio.setEnabled(settings.sound);
  if (settings.sound) audio.play('click');
  updateSoundIcon();
}

function setMusic(value) {
  settings.music = Boolean(value);
  saveSettings();
  audio.init();
  audio.setMusicEnabled(settings.music);
}

/* ==================================================================
   Setup / title
   ================================================================== */

function renderSetup() {
  if (settings.mode === 'classic' && settings.players > 4) settings.players = 4;
  const groups = [
    [dom.setupPlayers, String(settings.players)],
    [dom.setupMode, settings.mode],
    [dom.setupDifficulty, settings.difficulty]
  ];
  for (const [group, value] of groups) {
    if (!group) continue;
    for (const button of group.querySelectorAll('button[data-value]')) {
      button.classList.toggle('is-active', button.dataset.value === value);
      if (group === dom.setupPlayers) {
        button.disabled = settings.mode === 'classic' && ['5', '6'].includes(button.dataset.value);
      }
    }
  }
  if (dom.setupName && document.activeElement !== dom.setupName) {
    dom.setupName.value = settings.name;
  }
  const target = FAVOR_TARGETS[settings.players];
  const cards = deckSize(settings.mode);
  const edition = settings.mode === 'classic' ? 'Classic' : 'Full Court';
  const setAside = settings.players === 2 ? ' · 3 cards set aside face up' : '';
  if (dom.setupSummary) {
    dom.setupSummary.textContent = `${settings.players} suitors · ${cards} cards · ${edition} · first to ${target} favors${setAside}`;
  }
  saveSettings();
}

function bindTitle() {
  dom.setupPlayers?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button || button.disabled) return;
    settings.players = Number(button.dataset.value);
    audio.init();
    audio.play('click');
    renderSetup();
  });

  dom.setupMode?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    settings.mode = button.dataset.value;
    audio.init();
    audio.play('click');
    renderSetup();
  });

  dom.setupDifficulty?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    settings.difficulty = button.dataset.value;
    audio.init();
    audio.play('click');
    renderSetup();
  });

  dom.setupName?.addEventListener('input', () => {
    settings.name = dom.setupName.value;
    saveSettings();
  });

  dom.begin?.addEventListener('click', () => {
    audio.init();
    audio.resume();
    audio.play('seal');
    startNewGame();
  });

  dom.titleRules?.addEventListener('click', () => {
    audio.init();
    audio.play('page');
    openRulesModal();
  });
}

/* ==================================================================
   Game lifecycle
   ================================================================== */

async function startNewGame() {
  if (state.starting) return;
  state.starting = true;
  state.seq += 1;
  const seq = state.seq;
  closeModal();
  clearToasts();
  closeJournal();
  state.busy = false;
  state.roundResolved = false;
  state.selectedUid = null;
  state.targetMode = false;
  state.lastPlay = null;
  clearEffect();

  if (settings.mode === 'classic' && settings.players > 4) settings.players = 4;
  const count = settings.mode === 'classic' ? Math.min(4, settings.players) : settings.players;
  const humanName = settings.name.trim() || 'You';

  state.game = new LoveLetterGame({
    playerCount: count,
    mode: settings.mode,
    humanName,
    humanIndex: 0,
    seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
  });
  state.humanIndex = 0;
  state.ais = state.game.players.map((player, index) =>
    createAI({
      playerId: player.id,
      difficulty: settings.difficulty,
      seed: (Date.now() + index * 7919 + 13) >>> 0
    })
  );

  dom.body.classList.remove('is-title');
  dom.title.classList.add('is-hidden');
  audio.init();
  audio.setEnabled(settings.sound);
  audio.setMusicEnabled(settings.music);
  updateSoundIcon();

  renderAll();
  await showRoundSplash();
  state.starting = false;
  if (seq !== state.seq) return;
  continueGame();
}

function showTitle() {
  state.seq += 1;
  state.starting = false;
  state.game = null;
  state.ais = [];
  state.busy = false;
  state.selectedUid = null;
  state.targetMode = false;
  state.lastPlay = null;
  state.roundResolved = false;
  closeModal();
  clearToasts();
  clearEffect();
  closeJournal();
  clearGameUI();
  renderSetup();
  dom.body.classList.add('is-title');
  dom.title.classList.remove('is-hidden');
  dom.title.scrollTop = 0;
  audio.play('page');
}

async function startNextRound() {
  if (!state.game || state.game.phase !== 'roundEnd') return;
  state.seq += 1;
  const seq = state.seq;
  state.roundResolved = false;
  state.selectedUid = null;
  state.targetMode = false;
  state.lastPlay = null;
  clearEffect();
  state.game.startRound(state.game.nextFirstIndex);
  state.game.takeEvents();
  renderAll();
  await showRoundSplash();
  if (seq !== state.seq) return;
  continueGame();
}

async function showRoundSplash() {
  if (!state.game) return;
  const first = state.game.players[state.game.nextFirstIndex] ?? state.game.players[0];
  const splash = document.createElement('div');
  splash.className = 'round-splash';
  splash.innerHTML = `<div class="round-splash__inner">
      <p class="round-splash__round">Round ${roman(state.game.round)}</p>
      <h2 class="round-splash__title">${state.game.round === 1 ? 'The Court Assembles' : 'A New Letter'}</h2>
      <p class="round-splash__first">${first.isHuman ? 'You take' : `${esc(first.name)} takes`} the first turn.</p>
    </div>`;
  document.body.append(splash);
  audio.play('page');
  await delay(1020);
  splash.classList.add('is-leaving');
  await delay(420);
  splash.remove();
}

/* ==================================================================
   Turn engine (UI orchestration)
   ================================================================== */

async function continueGame() {
  if (state.busy || !state.game) return;
  const seq = state.seq;
  state.busy = true;

  try {
    while (state.game && state.game.phase === 'playing' && seq === state.seq) {
      const game = state.game;
      await waitIfPaused();
      if (seq !== state.seq) return;

      if (!game.pending && !game.drawn) {
        game.beginTurn();
        const events = absorbEvents();
        clearEffect();
        renderAll();
        await presentEvents(events, seq);
        if (seq !== state.seq) return;
      }

      if (game.pending) {
        if (game.current === state.humanIndex) {
          state.busy = false;
          openChancellorModal();
          return;
        }
        const ai = state.ais[game.current];
        const choice = ai.chooseChancellor(game.getPlayerView(game.current));
        await delay(520);
        await waitIfPaused();
        if (seq !== state.seq) return;
        game.resolveChancellor(choice.keepUid, choice.bottomUids);
        const events = absorbEvents();
        renderAll();
        await presentEvents(events, seq);
        if (seq !== state.seq) return;
        if (game.phase !== 'playing') break;
        game.advanceTurn();
        continue;
      }

      if (game.current === state.humanIndex) {
        state.busy = false;
        audio.play('turn');
        renderAll();
        return;
      }

      renderAll();
      await delay(560);
      await waitIfPaused();
      if (seq !== state.seq) return;

      const ai = state.ais[game.current];
      if (!ai) break;
      let action = null;
      try {
        action = ai.chooseAction(game.getPlayerView(game.current));
      } catch (error) {
        console.error(error);
      }
      if (!action) break;

      await waitIfPaused();
      if (seq !== state.seq) return;
      try {
        game.play(action.cardUid, action);
      } catch (error) {
        console.error(error);
        break;
      }
      audio.play('play');
      const events = absorbEvents();
      renderAll();
      await presentEvents(events, seq);
      if (seq !== state.seq) return;

      if (game.pending) {
        const aiChoice = ai.chooseChancellor(game.getPlayerView(game.current));
        await delay(460);
        await waitIfPaused();
        if (seq !== state.seq) return;
        game.resolveChancellor(aiChoice.keepUid, aiChoice.bottomUids);
        audio.play('chancellor');
        const moreEvents = absorbEvents();
        renderAll();
        await presentEvents(moreEvents, seq);
        if (seq !== state.seq) return;
      }

      if (game.phase !== 'playing') break;
      await waitIfPaused();
      if (seq !== state.seq) return;
      game.advanceTurn();
      await delay(180);
    }
  } catch (error) {
    console.error(error);
    state.busy = false;
    showToast({
      text: 'The court falters for a moment. Your move — try again.',
      tone: 'danger',
      icon: 'shield'
    });
    return;
  }

  state.busy = false;
  if (seq === state.seq && state.game && (state.game.phase === 'roundEnd' || state.game.phase === 'gameEnd')) {
    await finishRound();
  }
}

function absorbEvents() {
  if (!state.game) return [];
  const events = state.game.takeEvents();
  const play = events.find((event) => event.kind === 'play');
  if (play) {
    state.lastPlay = {
      playerId: play.playerId,
      card: play.card,
      round: state.game.round
    };
  }
  return events;
}

async function playSelected(targetId = null, guess = null) {
  if (state.busy || !state.game) return;
  const card = selectedCard();
  if (!card) return;
  const seq = state.seq;
  state.busy = true;
  let result;
  try {
    result = state.game.play(card.uid, { targetId, guess });
  } catch (error) {
    state.busy = false;
    showToast({ text: esc(error.message), tone: 'danger', icon: 'shield' });
    audio.play('error');
    return;
  }

  state.selectedUid = null;
  state.targetMode = false;
  audio.play('play');
  const events = absorbEvents();
  renderAll();
  await presentEvents(events, seq);
  if (seq !== state.seq) return;

  if (result?.pending || state.game.pending) {
    state.busy = false;
    openChancellorModal();
    return;
  }

  if (state.game.phase === 'playing') {
    state.game.advanceTurn();
    state.busy = false;
    continueGame();
  } else {
    state.busy = false;
    finishRound();
  }
}

/* ==================================================================
   Event presentation
   ================================================================== */

function setEffect(html, tone = 'neutral', ms = 2800) {
  state.effect = { html, tone };
  if (state.effectTimer) clearTimeout(state.effectTimer);
  if (!dom.effectBanner) return;
  dom.effectBanner.innerHTML = html;
  dom.effectBanner.className = `effect-banner is-visible tone-${tone}`;
  state.effectTimer = setTimeout(() => {
    state.effect = null;
    dom.effectBanner.classList.remove('is-visible');
  }, ms * speedFactor());
}

function clearEffect() {
  state.effect = null;
  if (state.effectTimer) clearTimeout(state.effectTimer);
  state.effectTimer = null;
  if (dom.effectBanner) {
    dom.effectBanner.className = 'effect-banner';
    dom.effectBanner.innerHTML = '';
  }
}

async function presentEvents(events, seq) {
  for (const event of events) {
    if (seq !== state.seq) return;
    await waitIfPaused();
    if (seq !== state.seq) return;
    switch (event.kind) {
      case 'play':
        renderStage();
        await delay(340);
        break;

      case 'draw':
        if (event.playerId === state.humanIndex) audio.play('draw');
        break;

      case 'guard': {
        const actor = state.game.players[event.playerId];
        const target = state.game.players[event.targetId];
        const guess = CARDS[event.guess]?.name ?? 'character';
        setEffect(
          `<strong>${esc(playerName(actor))}</strong> ${verb(actor, 'name')} the <strong>${esc(
            guess
          )}</strong> against ${target.isHuman ? 'you' : `<strong>${esc(target.name)}</strong>`}.`,
          'neutral',
          2200
        );
        audio.play('reveal');
        await delay(420);
        break;
      }

      case 'guardMiss': {
        const target = state.game.players[event.targetId];
        const guess = CARDS[event.guess]?.name ?? 'character';
        setEffect(
          `${target.isHuman ? 'You do' : `<strong>${esc(target.name)}</strong> does`} not hold the <strong>${esc(
            guess
          )}</strong>.`,
          'muted',
          1800
        );
        await delay(360);
        break;
      }

      case 'priest': {
        if (event.playerId === state.humanIndex) {
          await openPriestModal(event);
        } else {
          const actor = state.game.players[event.playerId];
          const target = state.game.players[event.targetId];
          setEffect(
            `<strong>${esc(playerName(actor))}</strong> studies ${
              target.isHuman ? 'your' : `<strong>${esc(target.name)}</strong>’s`
            } hand in private.`,
            'secret',
            2000
          );
          await delay(380);
        }
        break;
      }

      case 'baron': {
        if (event.reveal) {
          await openBaronModal(event);
        } else {
          const actor = state.game.players[event.playerId];
          const target = state.game.players[event.targetId];
          setEffect(
            `<strong>${esc(playerName(actor))}</strong> and <strong>${esc(
              target.name
            )}</strong> compare hands in private.`,
            'secret',
            1900
          );
          await delay(380);
        }
        break;
      }

      case 'baronTie':
        setEffect('The Baron finds the two evenly matched. Neither leaves.', 'secret', 1800);
        await delay(320);
        break;

      case 'prince': {
        const target = state.game.players[event.targetId];
        setEffect(
          `The Prince turns his attention to ${
            target.isHuman ? '<strong>you</strong>' : `<strong>${esc(target.name)}</strong>`
          }.`,
          'neutral',
          1900
        );
        await delay(340);
        break;
      }

      case 'discard': {
        const target = state.game.players[event.playerId];
        const card = CARDS[event.card.type];
        setEffect(
          `${target.isHuman ? 'You discard' : `<strong>${esc(target.name)}</strong> discards`} the <strong>${esc(
            card.name
          )}</strong>.`,
          event.card.type === 'princess' ? 'danger' : 'neutral',
          2200
        );
        await delay(420);
        break;
      }

      case 'trade': {
        const actor = state.game.players[event.playerId];
        const target = state.game.players[event.targetId];
        setEffect(
          `<strong>${esc(playerName(actor))}</strong> and <strong>${esc(
            target.name
          )}</strong> trade hands.`,
          'secret',
          2000
        );
        await delay(380);
        break;
      }

      case 'protect': {
        const player = state.game.players[event.playerId];
        setEffect(
          `<strong>${esc(playerName(player))}</strong> ${
            player.isHuman ? 'are' : 'is'
          } shielded by the Handmaid.`,
          'secret',
          1900
        );
        audio.play('seal');
        await delay(340);
        break;
      }

      case 'eliminate': {
        const player = state.game.players[event.playerId];
        let detail = 'Their letter will not reach the Princess.';
        if (event.cause === 'guard') detail = 'The Guard unmasked them.';
        if (event.cause === 'baron') detail = 'They held the lower card.';
        if (event.cause === 'princess' || event.cause === 'princess-played') {
          detail = 'The Princess undid them.';
        }
        audio.play('eliminate');
        dom.body.classList.add('is-shaking');
        setTimeout(() => dom.body.classList.remove('is-shaking'), 450);
        await showToast({
          text: `<strong>${esc(playerName(player))}</strong> ${
            player.isHuman ? 'are' : 'is'
          } out of the round.<br><span class="toast__detail">${detail}</span>`,
          tone: 'danger',
          icon: 'shield',
          duration: 1700
        });
        await delay(220);
        break;
      }

      case 'chancellor': {
        if (event.playerId !== state.humanIndex) {
          const player = state.game.players[event.playerId];
          setEffect(
            `<strong>${esc(playerName(player))}</strong> consults the Chancellor’s ledger.`,
            'neutral',
            1900
          );
          audio.play('chancellor');
          await delay(360);
        }
        break;
      }

      case 'chancellorReturn': {
        const player = state.game.players[event.playerId];
        setEffect(
          `<strong>${esc(playerName(player))}</strong> ${
            player.isHuman ? 'return' : 'returns'
          } the rest to the bottom of the deck.`,
          'secret',
          1800
        );
        await delay(320);
        break;
      }

      case 'spy': {
        const player = state.game.players[event.playerId];
        setEffect(
          `<strong>${esc(playerName(player))}</strong> ${
            player.isHuman ? 'slip' : 'slips'
          } a Spy into the shadows.`,
          'secret',
          1800
        );
        await delay(300);
        break;
      }

      case 'noEffect': {
        setEffect('The card finds no mark and is played without effect.', 'muted', 1800);
        await delay(280);
        break;
      }

      case 'lastTurn':
        setEffect('The deck is spent. This is the final turn.', 'danger', 2400);
        await delay(700);
        break;

      default:
        break;
    }
  }
}

/* ==================================================================
   Rendering
   ================================================================== */

function renderAll() {
  if (!state.game) {
    clearGameUI();
    return;
  }
  renderTopbar();
  renderSidebar();
  renderOpponents();
  renderHuman();
  renderStage();
}

function renderTopbar() {
  const game = state.game;
  if (!game) {
    dom.roundMeta.innerHTML = '';
    return;
  }
  dom.roundMeta.innerHTML = `
    <span class="meta-round">Round <strong>${roman(game.round)}</strong></span>
    <i class="meta-dot"></i>
    <span class="meta-target"><span class="meta-first">First to </span><strong>${game.favorTarget}</strong> favors</span>
    <i class="meta-dot meta-dot--mode"></i>
    <span class="meta-mode">${game.mode === 'classic' ? 'Classic' : 'Full Court'}</span>
    <svg class="meta-heart"><use href="#i-heart"></use></svg>`;
}

function renderSidebar() {
  const game = state.game;
  if (!game) return;

  const setAside = [];
  if (game.setAsideHidden) {
    setAside.push(
      '<span class="setaside__mini" title="One card set aside face down, out of play"></span>'
    );
  }
  for (const card of game.setAsidePublic) {
    setAside.push(miniCardMarkup(card, { className: 'setaside__open' }));
  }
  const asideHTML = setAside.length
    ? `<div class="setaside"><span class="setaside__label">Set aside</span>${setAside.join('')}</div>`
    : '';

  dom.deckPanel.innerHTML = `
    <div class="deck-stack" aria-hidden="true">
      <div class="deck-stack__card"></div>
      <div class="deck-stack__card"></div>
      <div class="deck-stack__card"></div>
      <div class="deck-stack__count">${game.deck.length}</div>
    </div>
    <div class="deck-info">
      <p class="deck-info__label">The Court Deck</p>
      <div class="deck-info__count">${game.deck.length}<small>${game.deck.length === 1 ? 'card' : 'cards'}</small></div>
      <p class="deck-info__hint">${
        game.deck.length === 0
          ? 'The deck is spent. The round ends after this turn.'
          : game.deck.length <= 3
            ? 'The final cards are close.'
            : 'Played and discarded cards remain visible.'
      }</p>
      ${asideHTML}
    </div>`;

  dom.favorPanel.innerHTML = `
    <div class="panel__head">
      <h2>Favor</h2>
      <span class="panel__kicker">${game.favorTarget} to win</span>
    </div>
    <div class="favor-list">
      ${game.players
        .map(
          (player) => `<div class="favor-row ${player.isHuman ? 'is-you' : ''} ${
            player.eliminated ? 'is-out' : ''
          }">
            <i class="favor-row__gem" style="--gem:${esc(player.gem)}"></i>
            <span class="favor-row__name">${esc(player.isHuman ? player.name : player.name)}</span>
            <span class="favor-row__pips">${pipsHTML(player, game.favorTarget)}</span>
          </div>`
        )
        .join('')}
    </div>`;

  const entries = game.log.slice(-64);
  let lastRound = null;
  const chronicleHTML = entries
    .map((entry) => {
      let prefix = '';
      if (entry.round !== lastRound) {
        lastRound = entry.round;
        prefix = `<li class="is-round">Round ${roman(entry.round)}</li>`;
      }
      return `${prefix}<li class="tone-${entry.tone}">${esc(entry.text)}</li>`;
    })
    .join('');
  dom.chronicle.innerHTML = chronicleHTML;
  dom.chronicle.scrollTop = dom.chronicle.scrollHeight;
  dom.chronicleKicker.textContent =
    game.phase === 'playing' ? `Round ${roman(game.round)}` : 'The round is ended';
}

function renderOpponents() {
  const game = state.game;
  if (!game) return;
  const opponents = game.players.filter((p) => !p.isHuman);
  dom.opponents.style.setProperty('--opponents', String(Math.max(1, opponents.length)));
  dom.opponents.dataset.count = String(opponents.length);
  dom.opponents.innerHTML = opponents.map((player) => seatHTML(player)).join('');
}

function seatHTML(player) {
  const game = state.game;
  const current = game.phase === 'playing' && game.current === player.id;
  const targetable = canTarget(player.id);
  const cards = [
    ...player.played.map((card) => ({ card, discarded: false })),
    ...player.discarded.map((card) => ({ card, discarded: true }))
  ];
  const shown = cards.slice(-4);
  const overflow = cards.length - shown.length;
  const latestUid = cards.length ? cards[cards.length - 1].card.uid : null;

  const handBacks = Array.from(
    { length: Math.min(2, player.hand.length) },
    () => '<span class="mini-back"></span>'
  ).join('');
  const shortName = String(player.name).trim().split(/\s+/).pop();

  const played = shown.length
    ? shown
        .map(({ card, discarded }) =>
          miniCardMarkup(card, {
            latest: card.uid === latestUid,
            discarded
          })
        )
        .join('') + (overflow > 0 ? `<span class="mini-more">+${overflow}</span>` : '')
    : '';

  const badge = player.eliminated
    ? '<span class="seat__badge seat__badge--out">Out</span>'
    : player.protected
      ? `<span class="seat__badge seat__badge--shield">${shieldIcon()} Shielded</span>`
      : current
        ? '<span class="seat__badge">Playing</span>'
        : '';

  const attrs = targetable
    ? `data-player-id="${player.id}" role="button" tabindex="0" aria-label="Choose ${esc(player.name)}"`
    : `data-player-id="${player.id}"`;

  return `<article class="seat ${current ? 'is-current' : ''} ${
    player.eliminated ? 'is-out' : ''
  } ${targetable ? 'is-targetable' : ''}" ${attrs}>
    <div class="seat__top">
      ${medallionHTML(player)}
      <div class="seat__identity">
        <div class="seat__name">
          <span class="seat__name-full">${esc(player.name)}</span>
          <span class="seat__name-short">${esc(shortName)}</span>
        </div>
        <div class="seat__title">${esc(player.title)}</div>
      </div>
      <div class="seat__hand" title="${player.hand.length} card${
        player.hand.length === 1 ? '' : 's'
      } in hand">${handBacks}</div>
    </div>
    <div class="seat__meta">
      <div class="seat__pips">${pipsHTML(player, game.favorTarget)}</div>
      ${badge}
    </div>
    <div class="seat__played">${played}</div>
    ${player.eliminated ? '<span class="seat__out-stamp">Out of the Round</span>' : ''}
  </article>`;
}

function renderHuman() {
  const game = state.game;
  if (!game) return;
  const player = game.players[state.humanIndex];
  const card = selectedCard();
  const forced = game.getForcedCardUid(player);
  const humanTurn = game.phase === 'playing' && game.current === state.humanIndex;
  const locked = !humanTurn || state.busy || Boolean(game.pending);
  const selfTargetable = Boolean(
    state.targetMode && card && defOf(card).target === 'any' && canTarget(player.id)
  );

  let handHTML = '';
  if (player.eliminated) {
    handHTML = '<div class="hand is-empty"><p class="hand-out">Your letter was intercepted. The court plays on without you.</p></div>';
  } else {
    handHTML = `<div class="hand ${locked ? 'is-locked' : ''}">
      ${player.hand
        .map((held) => {
          const isSelected = held.uid === state.selectedUid;
          const isLocked = Boolean(forced && held.uid !== forced);
          return cardMarkup(held, {
            extraClass: `${isSelected ? 'is-selected' : ''}`,
            lock: isLocked ? 'Countess' : null
          });
        })
        .join('')}
    </div>`;
  }

  const profileBadge = player.eliminated
    ? '<span class="seat__badge seat__badge--out">Out</span>'
    : player.protected
      ? `<span class="seat__badge seat__badge--shield">${shieldIcon()} Shielded</span>`
      : '';

  dom.humanZone.innerHTML = `
    <div class="human-profile ${selfTargetable ? 'is-targetable' : ''}" ${
      selfTargetable ? `data-player-id="${player.id}" role="button" tabindex="0"` : ''
    }>
      ${medallionHTML(player, 'medallion--you')}
      <div class="human-profile__text">
        <div class="human-profile__name">${esc(player.name)}</div>
        <div class="human-profile__title">${esc(player.title)}</div>
        <div class="human-profile__pips">${pipsHTML(player, game.favorTarget)} ${profileBadge}</div>
      </div>
    </div>
    <div class="hand-area">
      ${handHTML}
      ${actionBarHTML(player, card)}
    </div>
    <div class="human-pile">
      <div class="human-pile__label">Your play</div>
      <div class="human-pile__cards">${humanPileHTML(player)}</div>
    </div>`;
}

function humanPileHTML(player) {
  const cards = [
    ...player.played.map((card) => ({ card, discarded: false })),
    ...player.discarded.map((card) => ({ card, discarded: true }))
  ].slice(-4);
  if (!cards.length) return '<span class="human-pile__empty">—</span>';
  return cards
    .map(({ card, discarded }, index) =>
      miniCardMarkup(card, {
        latest: index === cards.length - 1,
        discarded
      })
    )
    .join('');
}

function actionBarHTML(player, card) {
  const game = state.game;
  if (!player || !game) return '';

  if (player.eliminated) {
    return `<div class="action-bar"><span class="action-prompt">Your letter was intercepted. The court plays on.</span></div>`;
  }

  if (game.pending) {
    return `<div class="action-bar">
      <span class="action-prompt"><strong>The Chancellor awaits.</strong></span>
      <button class="btn btn--primary btn--small" type="button" data-action="open-chancellor">Open the Ledger</button>
    </div>`;
  }

  if (state.busy) {
    return `<div class="action-bar"><span class="action-prompt">The court is in session…</span></div>`;
  }

  if (game.current !== state.humanIndex || !game.drawn) {
    return `<div class="action-bar"><span class="action-prompt">${
      game.current === state.humanIndex
        ? 'Drawing your card…'
        : `<strong>${esc(playerName(game.players[game.current]))}</strong> is considering.`
    }</span></div>`;
  }

  if (!card) {
    const forced = game.getForcedCardUid(player);
    const anyTarget = player.hand.some((held) => Boolean(CARDS[held.type].target));
    return `<div class="action-bar">
      <span class="action-prompt ${forced ? 'is-warning' : ''}">${
        forced
          ? 'The Countess must be played.'
          : anyTarget
            ? '<strong>Choose a card</strong> · then a suitor'
            : '<strong>Choose a card</strong> to play'
      }</span>
    </div>`;
  }

  const def = defOf(card);
  const targets = legalTargetsFor(card);
  const cancel = '<button class="btn btn--ghost btn--small" type="button" data-action="cancel">Cancel</button>';

  if (!def.target) {
    return `<div class="action-bar">
      <span class="action-prompt">Play the <strong>${esc(def.name)}</strong>?</span>
      <button class="btn btn--primary btn--small" type="button" data-action="play">Play ${esc(
        def.name
      )}</button>
      ${cancel}
    </div>`;
  }

  if (targets.length === 0) {
    return `<div class="action-bar">
      <span class="action-prompt is-warning">Every other suitor is shielded. The <strong>${esc(
        def.name
      )}</strong> will have no effect.</span>
      <button class="btn btn--primary btn--small" type="button" data-action="play">Play anyway</button>
      ${cancel}
    </div>`;
  }

  const selfButton =
    def.target === 'any'
      ? '<button class="btn btn--ghost btn--small" type="button" data-action="self">Choose yourself</button>'
      : '';

  return `<div class="action-bar">
    <span class="action-prompt">Choose a suitor for the <strong>${esc(def.name)}</strong>.</span>
    ${selfButton}
    ${cancel}
  </div>`;
}

function renderStage() {
  const game = state.game;
  if (!game) return;

  if (game.phase === 'playing') {
    const current = game.players[game.current];
    let text = '';
    if (game.pending && game.current === state.humanIndex) {
      text = '<strong>The Chancellor’s ledger</strong> awaits your choice.';
    } else if (state.targetMode) {
      text = 'Choose a suitor.';
    } else if (game.current === state.humanIndex) {
      text = '<strong>Your turn</strong> · choose a card';
    } else {
      text = `<strong>${esc(current.name)}</strong> is considering <span class="thinking"><i></i><i></i><i></i></span>`;
    }
    if (game.deck.length === 0) text += ' <span class="meta-dot"></span> Final turn';
    dom.turnBanner.innerHTML = text;
    dom.turnBanner.classList.add('is-visible');
  } else {
    dom.turnBanner.classList.remove('is-visible');
  }

  const last = state.lastPlay;
  if (last && last.round === game.round) {
    const player = game.players[last.playerId];
    const card = last.card;
    dom.stageCenter.innerHTML = `<div class="spotlight">
      <div class="spotlight__caption"><span class="caption-line"></span>${
        player.isHuman ? 'You play' : `${esc(player.name)} plays`
      } the ${esc(CARDS[card.type].name)}<span class="caption-line"></span></div>
      <div class="spotlight__card">${cardMarkup(card, {
        interactive: false
      })}</div>
    </div>`;
  } else {
    const human = game.players[state.humanIndex];
    const humanTurn = game.phase === 'playing' && game.current === state.humanIndex;
    const firstLine =
      game.phase === 'playing'
        ? humanTurn
          ? 'The court awaits'
          : 'The court is in session'
        : 'The round is ended';
    const secondLine =
      game.phase === 'playing'
        ? humanTurn
          ? 'Your move'
          : human.eliminated
            ? 'Your letter has fallen'
            : 'Watch and wait'
        : 'The Princess waits';
    dom.stageCenter.innerHTML = `<div class="idle-crest">
      <img src="assets/crest.svg" alt="" />
      <p class="idle-crest__line">${firstLine}<br><strong>${secondLine}</strong></p>
    </div>`;
  }

  if (state.effect) {
    dom.effectBanner.innerHTML = state.effect.html;
    dom.effectBanner.className = `effect-banner is-visible tone-${state.effect.tone}`;
  } else {
    dom.effectBanner.className = 'effect-banner';
    dom.effectBanner.innerHTML = '';
  }
}

function clearGameUI() {
  dom.roundMeta.innerHTML = '';
  dom.deckPanel.innerHTML = '';
  dom.favorPanel.innerHTML = '';
  dom.chronicle.innerHTML = '';
  dom.chronicleKicker.textContent = '';
  dom.opponents.innerHTML = '';
  dom.stageCenter.innerHTML = '';
  dom.turnBanner.className = 'turn-banner';
  dom.turnBanner.innerHTML = '';
  dom.effectBanner.className = 'effect-banner';
  dom.effectBanner.innerHTML = '';
  dom.humanZone.innerHTML = '';
}

/* ==================================================================
   Toasts, modals, journal
   ================================================================== */

function showToast({ text, tone = 'neutral', icon = 'heart', duration = 2200 }) {
  const toast = document.createElement('div');
  toast.className = `toast tone-${tone}`;
  toast.innerHTML = `<span class="toast__icon"><svg><use href="#i-${icon}"></use></svg></span>
    <span class="toast__text">${text}</span>`;
  dom.toastLayer.append(toast);
  while (dom.toastLayer.children.length > 3) {
    dom.toastLayer.firstElementChild.remove();
  }
  const total = duration * speedFactor();
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 300);
  }, total);
  return new Promise((resolve) => setTimeout(resolve, total));
}

function clearToasts() {
  dom.toastLayer.innerHTML = '';
}

function pauseGame() {
  if (!state.game) return;
  state.paused = true;
}

function resumeGame() {
  state.paused = false;
  const waiters = state.pauseWaiters.splice(0);
  for (const resolve of waiters) resolve();
}

async function waitIfPaused() {
  if (!state.paused) return;
  await new Promise((resolve) => state.pauseWaiters.push(resolve));
}

function openModal({ eyebrow = '', title = '', body = '', actions = '', wide = false, closeable = true, className = '' }) {
  pauseGame();
  if (modalCloseResolve) {
    const resolve = modalCloseResolve;
    modalCloseResolve = null;
    resolve();
  }
  state.modalCloseable = closeable;
  dom.modalLayer.innerHTML = `<div class="modal ${wide ? 'modal--wide' : ''} ${className}" role="dialog" aria-modal="true">
    ${
      closeable
        ? '<button class="modal__close" type="button" data-modal-close aria-label="Close"><svg><use href="#i-close"></use></svg></button>'
        : ''
    }
    ${eyebrow ? `<p class="modal__eyebrow">${eyebrow}</p>` : ''}
    ${title ? `<h2 class="modal__title">${title}</h2>` : ''}
    ${body}
    ${actions}
  </div>`;
  dom.modalLayer.classList.add('is-open');
  dom.body.classList.add('modal-open');
  return dom.modalLayer.querySelector('.modal');
}

function closeModal() {
  dom.modalLayer.classList.remove('is-open');
  dom.body.classList.remove('modal-open');
  const resolve = modalCloseResolve;
  modalCloseResolve = null;
  setTimeout(() => {
    if (!dom.modalLayer.classList.contains('is-open')) dom.modalLayer.innerHTML = '';
  }, 320);
  resumeGame();
  if (resolve) resolve();
}

function waitForModalClose() {
  return new Promise((resolve) => {
    modalCloseResolve = resolve;
  });
}

function closeJournal() {
  dom.body.classList.remove('journal-open');
}

function openJournal() {
  if (window.innerWidth > 840) return;
  dom.body.classList.add('journal-open');
}

function toggleJournal() {
  if (window.innerWidth > 840) {
    audio.play('click');
    return;
  }
  dom.body.classList.toggle('journal-open');
  audio.play('page');
}

/* ==================================================================
   Specific modals
   ================================================================== */

async function openPriestModal(event) {
  const target = state.game.players[event.targetId];
  const card = event.card;
  if (!card) return;
  const modal = openModal({
    eyebrow: 'The Priest · A Secret Revealed',
    title: 'A Glimpse Behind the Veil',
    body: `<p class="modal__lede">You alone have seen the hand of <strong>${esc(
      target.name
    )}</strong>. The knowledge is yours to keep — or to use.</p>
      <div class="reveal-layout reveal-layout--single">
        <div class="reveal-person">
          ${revealCardMarkup(card)}
          <div class="reveal-person__name">${esc(CARDS[card.type].name)}</div>
          <div class="reveal-person__meta">value ${CARDS[card.type].value} · held by ${esc(
            target.name
          )}</div>
        </div>
      </div>`,
    actions: `<div class="modal__actions"><button class="btn btn--primary" type="button" data-ack>Keep the Secret</button></div>`
  });
  audio.play('reveal');
  modal.querySelector('[data-ack]').addEventListener('click', closeModal);
  await waitForModalClose();
}

async function openBaronModal(event) {
  const actor = state.game.players[event.playerId];
  const target = state.game.players[event.targetId];
  const actorCard = event.actorCard;
  const targetCard = event.targetCard;
  const actorOut = actor.eliminated;
  const targetOut = target.eliminated;
  let outcome = 'Evenly matched — neither leaves the round.';
  let danger = false;
  if (actorOut) {
    outcome = `${actor.isHuman ? 'You hold' : `${actor.name} holds`} the lower card and ${
      actor.isHuman ? 'are' : 'is'
    } out of the round.`;
    danger = true;
  } else if (targetOut) {
    outcome = `${target.isHuman ? 'You hold' : `${target.name} holds`} the lower card and ${
      target.isHuman ? 'are' : 'is'
    } out of the round.`;
    danger = true;
  }

  const modal = openModal({
    eyebrow: 'The Baron · Hands Compared',
    title: 'The Measure of Pride',
    body: `<p class="modal__lede">Silk and steel are laid bare. The lower card must leave the court.</p>
      <div class="reveal-layout">
        <div class="reveal-person">
          ${actorCard ? revealCardMarkup(actorCard) : '<div class="hand-reveal__empty">—</div>'}
          <div class="reveal-person__name">${esc(playerName(actor))}</div>
          <div class="reveal-person__meta">value ${event.actorValue}</div>
        </div>
        <div class="reveal-versus">versus</div>
        <div class="reveal-person">
          ${targetCard ? revealCardMarkup(targetCard) : '<div class="hand-reveal__empty">—</div>'}
          <div class="reveal-person__name">${esc(playerName(target))}</div>
          <div class="reveal-person__meta">value ${event.targetValue}</div>
        </div>
      </div>
      <p class="reveal-outcome ${danger ? 'is-danger' : ''}">${esc(outcome)}</p>`,
    actions: `<div class="modal__actions"><button class="btn btn--primary" type="button" data-ack>Continue</button></div>`
  });
  audio.play('reveal');
  modal.querySelector('[data-ack]').addEventListener('click', closeModal);
  await waitForModalClose();
}

function unseenForHuman(type) {
  const game = state.game;
  const counts = cardCounts(game.mode);
  const subtract = (card) => {
    counts[card.type] = Math.max(0, (counts[card.type] ?? 0) - 1);
  };
  for (const player of game.players) {
    for (const card of player.played) subtract(card);
    for (const card of player.discarded) subtract(card);
  }
  for (const card of game.setAsidePublic) subtract(card);
  for (const card of game.players[state.humanIndex].hand) subtract(card);
  return counts[type] ?? 0;
}

function openGuessModal(targetId) {
  const game = state.game;
  const target = game.players[targetId];
  const card = selectedCard();
  if (!card || card.type !== 'guard') return;
  const options = CARD_LIST.filter((def) => def.key !== 'guard').sort(
    (a, b) => b.value - a.value
  );
  const rows = options
    .map((def) => {
      const unseen = unseenForHuman(def.key);
      return `<button class="guess-card" type="button" data-guess="${def.key}" ${
        unseen === 0 ? 'disabled' : ''
      }>
        <span class="guess-card__art" style="background-image:url('${artFor(def.key)}')"></span>
        <span>
          <span class="guess-card__name">${esc(def.name)}</span>
          <span class="guess-card__meta">value ${def.value} · ${esc(def.subtitle)}</span>
        </span>
        <span class="guess-card__count">${unseen === 0 ? 'none left' : `${unseen} unseen`}</span>
      </button>`;
    })
    .join('');

  const modal = openModal({
    eyebrow: 'The Guard · Name a Character',
    title: `What does ${esc(target.name)} hold?`,
    body: `<p class="modal__lede">Name a character other than the Guard. If <strong>${esc(
      target.name
    )}</strong> holds it, they are out of the round. A name already spent is a wasted guess.</p>
      <div class="guess-grid">${rows}</div>`,
    actions: `<div class="modal__actions"><button class="btn btn--ghost" type="button" data-modal-close>Back</button></div>`
  });
  audio.play('page');

  modal.querySelectorAll('[data-guess]').forEach((button) => {
    button.addEventListener('click', () => {
      const guess = button.dataset.guess;
      closeModal();
      playSelected(targetId, guess);
    });
  });
}

function openChancellorModal() {
  const game = state.game;
  if (!game || !game.pending || game.pending.type !== 'chancellor') return;
  const pending = game.pending;
  const cards = pending.cards.slice();
  let keepUid = null;
  let order = [];

  const modal = openModal({
    eyebrow: 'The Chancellor · The Ledger',
    title: 'Choose What the Court Remembers',
    body: '<div id="chancellor-body"></div>',
    actions: '',
    wide: true,
    closeable: false
  });

  function paint() {
    const kept = keepUid ? cards.find((c) => c.uid === keepUid) : null;
    let returned = keepUid ? cards.filter((c) => c.uid !== keepUid) : [];
    if (keepUid) {
      if (order.length !== returned.length) {
        order = returned
          .slice()
          .sort((a, b) => CARDS[a.type].value - CARDS[b.type].value)
          .map((c) => c.uid);
      }
      returned = order.map((uid) => returned.find((c) => c.uid === uid)).filter(Boolean);
    }

    const cardGrid = cards
      .map(
        (card) =>
          `<div data-keep="${card.uid}" role="button" tabindex="0" aria-label="Keep ${esc(
            CARDS[card.type].name
          )}">${cardMarkup(card, {
            interactive: false,
            extraClass: keepUid === card.uid ? 'is-keep' : ''
          })}</div>`
      )
      .join('');

    const returnSlots = returned
      .map(
        (card, index) => `<div class="return-slot">
          <span class="return-slot__num">${index + 1}</span>
          <span class="return-slot__art" style="background-image:url('${artFor(card.type)}')"></span>
          <span class="return-slot__name">${esc(CARDS[card.type].name)}</span>
        </div>`
      )
      .join('');

    const body = `
      <p class="modal__lede">The Chancellor sets three cards before you. Keep one. The other ${
        cards.length - 1 === 1 ? 'card returns' : 'two return'
      } to the bottom of the deck — ${
        cards.length - 1 === 1 ? 'it will be drawn after the rest' : 'the first will be drawn before the second'
      }.</p>
      <div class="chancellor-hand" style="grid-template-columns:repeat(${cards.length},minmax(0,1fr))">${cardGrid}</div>
      ${
        kept
          ? `<div class="chancellor-return">
              <div class="chancellor-return__head">
                <span class="chancellor-return__label">Bottom of the deck · 1 is drawn before 2</span>
                ${
                  returned.length > 1
                    ? '<button class="btn btn--ghost btn--small" type="button" data-chancellor-swap>Swap order</button>'
                    : ''
                }
              </div>
              <div class="return-order">${returnSlots}</div>
            </div>`
          : '<p class="modal__hint" style="text-align:center;margin-top:16px">Select one card to keep.</p>'
      }
      <div class="modal__actions">
        <span class="modal__hint">${
          kept ? `You will keep the ${esc(CARDS[kept.type].name)}.` : 'A choice is required.'
        }</span>
        <button class="btn btn--primary" type="button" data-chancellor-confirm ${
          kept ? '' : 'disabled'
        }>Return to the Bottom</button>
      </div>`;
    modal.querySelector('#chancellor-body').innerHTML = body;
  }

  paint();

  const selectKeep = (uid) => {
    if (!uid || keepUid === uid) return;
    keepUid = uid;
    order = [];
    audio.play('select');
    paint();
  };

  modal.addEventListener('click', async (event) => {
    const keep = event.target.closest('[data-keep]');
    if (keep) {
      selectKeep(keep.dataset.keep);
      return;
    }
    const swap = event.target.closest('[data-chancellor-swap]');
    if (swap) {
      order.reverse();
      audio.play('click');
      paint();
      return;
    }
    const confirm = event.target.closest('[data-chancellor-confirm]');
    if (confirm && keepUid && !state.busy) {
      audio.play('chancellor');
      state.busy = true;
      closeModal();
      const seq = state.seq;
      try {
        state.game.resolveChancellor(
          keepUid,
          order.length ? order : cards.filter((c) => c.uid !== keepUid).map((c) => c.uid)
        );
      } catch (error) {
        state.busy = false;
        showToast({ text: esc(error.message), tone: 'danger', icon: 'shield' });
        return;
      }
      const events = absorbEvents();
      renderAll();
      await presentEvents(events, seq);
      if (seq !== state.seq) return;
      state.busy = false;
      if (state.game.phase === 'playing') {
        state.game.advanceTurn();
        continueGame();
      } else {
        finishRound();
      }
    }
  });

  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const keep = event.target.closest('[data-keep]');
    if (!keep) return;
    event.preventDefault();
    selectKeep(keep.dataset.keep);
  });
}

function openRulesModal() {
  const sorted = CARD_LIST.slice().sort((a, b) => b.value - a.value);
  const cardRows = sorted
    .map((def) => {
      const count = settings.mode === 'classic' ? def.classicCopies : def.copies;
      return `<div class="rules-card">
        <span class="rules-card__art" style="background-image:url('${artFor(def.key)}')"></span>
        <div class="rules-card__body">
          <p class="rules-card__name">${esc(def.name)} <span>${def.value}</span> · ${
            count === 1 ? '1 copy' : `${count} copies`
          }</p>
          <p class="rules-card__text">${esc(def.text)}</p>
        </div>
      </div>`;
    })
    .join('');

  const favorRows = Object.entries(FAVOR_TARGETS)
    .map(
      ([count, target]) =>
        `<div class="token-cell"><strong>${target}</strong><span>${count} player${
          Number(count) === 1 ? '' : 's'
        }</span></div>`
    )
    .join('');

  const overview = `<div class="rules-section">
    <p>Love Letter is played over several rounds. Each round, one suitor’s letter reaches the Princess. The first suitor to collect enough <strong>favor</strong> wins the court.</p>
    <h3>Setup</h3>
    <ol>
      <li>Shuffle the deck and set one card aside face down. In a two-player game, set three more aside face up.</li>
      <li>Deal one card to each suitor. The rest is the draw deck.</li>
      <li>In this digital court, you take the first turn. Afterwards, the winner of the previous round begins.</li>
    </ol>
    <h3>Your turn</h3>
    <ol>
      <li>Draw one card. You now hold two.</li>
      <li>Play one card face up and resolve its effect. The other stays in your hand.</li>
      <li>If you hold the Countess with the King or Prince, you must play the Countess.</li>
    </ol>
    <h3>End of the round</h3>
    <p>If the deck is empty after any turn, everyone still in the round reveals their hand. The highest card wins; ties all win. If only one suitor remains, they win immediately. Each winner gains 1 favor.</p>
    <h3>Favors to win</h3>
    <div class="token-table">${favorRows}</div>
    <h3>Special notes</h3>
    <ul>
      <li><strong>Spy:</strong> at the end of the round, if you are the only suitor still in the round who played or discarded a Spy, gain 1 extra favor. This is separate from winning the round.</li>
      <li><strong>Handmaid:</strong> protection lasts until the start of your next turn. If every other suitor is shielded when you play a target card, it has no effect (for the Prince, choose yourself).</li>
      <li><strong>Princess:</strong> playing or discarding her removes you from the round.</li>
    </ul>
    <h3>Classic edition</h3>
    <p>The classic variant removes 1 Guard, both Chancellors, and both Spies, and supports 2–4 players. All other rules are unchanged.</p>
  </div>`;

  const characters = `<div class="rules-section">
    <p>Each card lists its value, its copies in this edition, and its effect. Higher values are stronger at the end of the round, but more dangerous to hold.</p>
    <div class="rules-cards">${cardRows}</div>
    <p class="modal__hint" style="margin-top:16px">Art: public-domain portraits from Wikimedia Commons, after Velázquez, Bronzino, Holbein, Raphael, Vermeer, Hals, El Greco, Rembrandt, Caravaggio, and Rigaud. A digital tribute to Seiji Kanai’s Love Letter.</p>
  </div>`;

  const modal = openModal({
    eyebrow: 'The Rules of the Court',
    title: 'How to <em>Play</em>',
    body: `<div class="rules-tabs">
      <button class="rules-tab is-active" type="button" data-rules-tab="overview">The Round</button>
      <button class="rules-tab" type="button" data-rules-tab="characters">The Characters</button>
    </div>
    <div id="rules-overview">${overview}</div>
    <div id="rules-characters" hidden>${characters}</div>`,
    actions: `<div class="modal__actions"><button class="btn btn--primary" type="button" data-modal-close>Close</button></div>`,
    wide: true
  });
  audio.play('page');

  modal.querySelectorAll('[data-rules-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const key = tab.dataset.rulesTab;
      modal.querySelectorAll('[data-rules-tab]').forEach((t) => {
        t.classList.toggle('is-active', t === tab);
      });
      modal.querySelector('#rules-overview').hidden = key !== 'overview';
      modal.querySelector('#rules-characters').hidden = key !== 'characters';
      modal.scrollTop = 0;
      audio.play('page');
    });
  });
}

function openMenu() {
  const pause = state.game && state.game.phase === 'playing';
  const soundOn = settings.sound;
  const musicOn = settings.music;
  const modal = openModal({
    eyebrow: 'The Court',
    title: 'Pause & <em>Consider</em>',
    body: `<p class="modal__lede">${
      pause ? 'The court waits while you collect your thoughts.' : 'Every court has its customs.'
    }</p>
    <div class="menu-list">
      <button class="menu-item" type="button" data-menu="resume">
        <span>Return to the table</span><span class="menu-item__value">Resume</span>
      </button>
      <button class="menu-item" type="button" data-menu="rules">
        <span>How to play</span><span class="menu-item__value">Rules</span>
      </button>
      <button class="menu-item ${soundOn ? 'is-on' : ''}" type="button" data-menu="sound" aria-pressed="${soundOn}">
        <span>Sound effects</span><span class="menu-toggle" aria-hidden="true"></span>
      </button>
      <button class="menu-item ${musicOn ? 'is-on' : ''}" type="button" data-menu="music" aria-pressed="${musicOn}">
        <span>Court music</span><span class="menu-toggle" aria-hidden="true"></span>
      </button>
      <button class="menu-item" type="button" data-menu="pace">
        <span>Pace</span><span class="menu-item__value" data-pace>${settings.speed === 'brisk' ? 'Brisk' : 'Normal'}</span>
      </button>
      <button class="menu-item" type="button" data-menu="new">
        <span>New game</span><span class="menu-item__value">Set up</span>
      </button>
      <button class="menu-item is-danger" type="button" data-menu="title">
        <span>Return to title</span><span class="menu-item__value">Leave</span>
      </button>
    </div>`,
    actions: `<div class="modal__actions"><button class="btn btn--ghost" type="button" data-modal-close>Back to the Court</button></div>`
  });
  audio.play('page');

  modal.querySelector('[data-menu="resume"]').addEventListener('click', closeModal);
  modal.querySelector('[data-menu="rules"]').addEventListener('click', openRulesModal);
  modal.querySelector('[data-menu="sound"]').addEventListener('click', (event) => {
    setSound(!settings.sound);
    event.currentTarget.classList.toggle('is-on', settings.sound);
    event.currentTarget.setAttribute('aria-pressed', String(settings.sound));
  });
  modal.querySelector('[data-menu="music"]').addEventListener('click', (event) => {
    setMusic(!settings.music);
    event.currentTarget.classList.toggle('is-on', settings.music);
    event.currentTarget.setAttribute('aria-pressed', String(settings.music));
  });
  modal.querySelector('[data-menu="pace"]').addEventListener('click', (event) => {
    settings.speed = settings.speed === 'brisk' ? 'normal' : 'brisk';
    saveSettings();
    event.currentTarget.querySelector('[data-pace]').textContent =
      settings.speed === 'brisk' ? 'Brisk' : 'Normal';
    audio.play('click');
  });
  modal.querySelector('[data-menu="new"]').addEventListener('click', () => {
    confirmLeave('Begin a new game?', 'The current round will be set aside, and you will return to the title to choose a new court.', 'Choose a New Court', () => {
      closeModal();
      showTitle();
    });
  });
  modal.querySelector('[data-menu="title"]').addEventListener('click', () => {
    confirmLeave('Return to the title?', 'The current round will be set aside. The chronicle will be lost.', 'Return to Title', () => {
      closeModal();
      showTitle();
    });
  });
}

function confirmLeave(title, text, label, onConfirm) {
  const modal = openModal({
    eyebrow: 'A Parting Word',
    title,
    body: `<p class="modal__lede">${esc(text)}</p>`,
    actions: `<div class="modal__actions modal__actions--split">
      <button class="btn btn--ghost" type="button" data-modal-close>Stay</button>
      <button class="btn btn--danger" type="button" data-confirm>${esc(label)}</button>
    </div>`,
    closeable: true
  });
  modal.querySelector('[data-confirm]').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

/* ==================================================================
   Round & game end
   ================================================================== */

async function finishRound() {
  const game = state.game;
  if (!game || state.roundResolved) return;
  if (game.phase !== 'roundEnd' && game.phase !== 'gameEnd') return;
  state.roundResolved = true;
  state.selectedUid = null;
  state.targetMode = false;
  clearEffect();
  renderAll();
  if (game.phase === 'gameEnd') {
    audio.play('win');
    openGameEndModal();
  } else {
    audio.play('seal');
    openRoundEndModal();
  }
}

function openRoundEndModal() {
  const game = state.game;
  const result = game.roundResult;
  if (!result) return;
  const winners = result.winners.map((id) => game.players[id]);
  const spy = result.spyPlayer !== null ? game.players[result.spyPlayer] : null;
  const title =
    winners.length === 0
      ? 'A Round of Silence'
      : winners.length > 1
        ? 'The Letter is Shared'
        : 'The Letter is Delivered';

  const winnerHTML = winners
    .map((player) => {
      const awards = result.awards.filter((a) => a.playerId === player.id).length;
      return `<div class="winner">
        ${medallionHTML(player)}
        <div class="winner__name">${esc(player.name)}</div>
        <div class="winner__award"><i class="pip is-filled"></i> gains ${awards} favor${
          awards === 1 ? '' : 's'
        }</div>
      </div>`;
    })
    .join('');

  const handsHTML = game.players
    .map((player) => {
      const hand = result.hands.find((h) => h.playerId === player.id);
      const isWinner = result.winners.includes(player.id);
      const card = hand?.card;
      return `<div class="hand-reveal">
        ${
          card
            ? revealCardMarkup(card, { winner: isWinner })
            : '<div class="hand-reveal__empty">out</div>'
        }
        <div class="hand-reveal__name ${player.isHuman ? 'is-you' : ''}">${esc(
          player.name
        )}</div>
        <div class="hand-reveal__name">${player.tokens} / ${game.favorTarget} favors</div>
      </div>`;
    })
    .join('');

  const spyHTML = spy
    ? `<div class="awards-line"><i class="pip is-filled"></i> <strong>${esc(
        playerName(spy)
      )}</strong> alone played a Spy and gained an extra favor.</div>`
    : '';

  const modal = openModal({
    eyebrow: `Round ${roman(result.round)} · Concluded`,
    title,
    body: `<div class="round-end">
      <p class="round-end__reason">${esc(result.reasonText)}</p>
      ${
        winners.length
          ? `<div class="round-end__winners">${winnerHTML}</div>`
          : '<p class="round-end__reason">No suitor remains to carry a letter.</p>'
      }
      ${spyHTML}
      <div class="hands-reveal" style="--players:${game.players.length}">${handsHTML}</div>
      <div class="awards-line">The Princess is still waiting. The next round begins with ${
        game.players[result.nextFirstIndex]?.isHuman
          ? 'you'
          : esc(game.players[result.nextFirstIndex]?.name ?? 'the court')
      }.</div>
    </div>`,
    actions: `<div class="modal__actions"><button class="btn btn--primary" type="button" data-next-round>Begin the Next Round</button></div>`,
    wide: true,
    closeable: false,
    className: 'round-end-modal'
  });
  audio.play('token');
  modal.querySelector('[data-next-round]').addEventListener('click', () => {
    closeModal();
    startNextRound();
  });
}

function openGameEndModal() {
  const game = state.game;
  const champions = game.gameWinners.map((id) => game.players[id]);
  const names = champions.map((p) => p.name);
  let winnerText;
  if (champions.length > 1) {
    winnerText = `${names.slice(0, -1).join(', ')} and ${
      names[names.length - 1]
    } share the Princess’s confidence.`;
  } else {
    const champion = champions[0];
    const verb = champion.isHuman && champion.name === 'You' ? 'have' : 'has';
    winnerText = `${names[0]} ${verb} won the Princess’s confidence.`;
  }

  const standings = game.players
    .map(
      (player) => `<div class="favor-row ${player.isHuman ? 'is-you' : ''}">
        <i class="favor-row__gem" style="--gem:${esc(player.gem)}"></i>
        <span class="favor-row__name">${esc(player.isHuman ? player.name : player.name)}</span>
        <span class="favor-row__pips">${pipsHTML(player, game.favorTarget)}</span>
      </div>`
    )
    .join('');

  const modal = openModal({
    eyebrow: `The Court · ${game.round} round${game.round === 1 ? '' : 's'}`,
    title: 'The Princess’s <em>Favor</em>',
    body: `<div class="game-end">
      <div class="confetti" aria-hidden="true"></div>
      <img class="game-end__crown" src="assets/crest.svg" alt="" />
      <div class="round-end__winners">
        ${champions
          .map(
            (player) => `<div class="winner">
              ${medallionHTML(player, 'medallion--you')}
              <div class="winner__name">${esc(player.name)}</div>
              <div class="winner__award"><i class="pip is-filled"></i> ${player.tokens} favors</div>
            </div>`
          )
          .join('')}
      </div>
      <p class="round-end__reason">${esc(winnerText)}</p>
      <div class="hands-reveal" style="--players:1">
        <div class="reveal-card is-winner" style="width:112px;margin:0 auto">
          <div class="reveal-card__art" style="background-image:url('${artFor('princess')}')" data-value="9"></div>
          <span class="reveal-card__name">The Princess</span>
        </div>
      </div>
      <div class="favor-list" style="margin-top:10px">${standings}</div>
    </div>`,
    actions: `<div class="modal__actions modal__actions--split">
      <button class="btn btn--ghost" type="button" data-title>Return to Title</button>
      <button class="btn btn--primary" type="button" data-again>Play Again</button>
    </div>`,
    wide: true,
    closeable: false,
    className: 'game-end-modal'
  });

  const confetti = modal.querySelector('.confetti');
  const colors = ['#efd28a', '#c9a24d', '#8f2637', '#f0e2c6', '#5c8a83'];
  for (let i = 0; i < 34; i += 1) {
    const piece = document.createElement('i');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 1.6}s`;
    piece.style.animationDuration = `${2.8 + Math.random() * 2.4}s`;
    piece.style.opacity = `${0.45 + Math.random() * 0.5}`;
    piece.style.setProperty('--drift', `${-60 + Math.random() * 120}px`);
    confetti.append(piece);
  }

  modal.querySelector('[data-again]').addEventListener('click', () => {
    closeModal();
    startNewGame();
  });
  modal.querySelector('[data-title]').addEventListener('click', () => {
    closeModal();
    showTitle();
  });
}

/* ==================================================================
   Interaction
   ================================================================== */

function selectCard(uid) {
  if (!humanCanAct()) {
    if (state.game && state.game.phase === 'playing' && !state.busy) {
      const player = state.game.players[state.humanIndex];
      const held = player.hand.find((c) => c.uid === uid);
      if (held && state.game.getForcedCardUid(player) && held.uid !== state.game.getForcedCardUid(player)) {
        showToast({
          text: 'The Countess must be played while you hold the King or Prince.',
          tone: 'danger',
          icon: 'shield'
        });
        audio.play('error');
      }
    }
    return;
  }
  const player = state.game.players[state.humanIndex];
  const card = player.hand.find((c) => c.uid === uid);
  if (!card) return;
  const forced = state.game.getForcedCardUid(player);
  if (forced && card.uid !== forced) {
    showToast({
      text: 'The Countess must be played while you hold the King or Prince.',
      tone: 'danger',
      icon: 'shield'
    });
    audio.play('error');
    return;
  }
  if (state.selectedUid === uid) {
    clearSelection();
    audio.play('click');
    return;
  }
  state.selectedUid = uid;
  const def = defOf(card);
  const targets = def.target ? legalTargetsFor(card) : [];
  state.targetMode = Boolean(def.target) && targets.length > 0;
  audio.play('select');
  renderAll();
}

async function chooseTarget(playerId) {
  if (!humanCanAct()) return;
  const card = selectedCard();
  if (!card || !state.targetMode) return;
  if (!canTarget(playerId)) {
    showToast({ text: 'That suitor cannot be chosen.', tone: 'danger', icon: 'shield' });
    audio.play('error');
    return;
  }
  if (card.type === 'guard') {
    openGuessModal(playerId);
    return;
  }
  await playSelected(playerId);
}

function bindGameInteractions() {
  dom.opponents.addEventListener('click', (event) => {
    const seat = event.target.closest('[data-player-id]');
    if (!seat) return;
    chooseTarget(Number(seat.dataset.playerId));
  });

  dom.opponents.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const seat = event.target.closest('.seat.is-targetable[data-player-id]');
    if (!seat) return;
    event.preventDefault();
    chooseTarget(Number(seat.dataset.playerId));
  });

  dom.humanZone.addEventListener('click', (event) => {
    const card = event.target.closest('.card[data-uid]');
    if (card) {
      selectCard(card.dataset.uid);
      return;
    }

    const self = event.target.closest('[data-player-id]');
    if (self && state.targetMode) {
      chooseTarget(Number(self.dataset.playerId));
      return;
    }

    const action = event.target.closest('[data-action]');
    if (!action) return;
    const kind = action.dataset.action;
    if (kind === 'cancel') {
      clearSelection();
      audio.play('click');
    } else if (kind === 'play') {
      const held = selectedCard();
      if (!held) return;
      const targets = legalTargetsFor(held);
      if (defOf(held).target && targets.length > 0) return;
      playSelected(null);
    } else if (kind === 'self') {
      playSelected(state.humanIndex);
    } else if (kind === 'open-chancellor') {
      openChancellorModal();
    }
  });

  dom.btnRules.addEventListener('click', () => {
    audio.init();
    audio.play('page');
    openRulesModal();
  });
  dom.btnJournal.addEventListener('click', toggleJournal);
  dom.sidebarClose?.addEventListener('click', closeJournal);
  dom.journalBackdrop?.addEventListener('click', closeJournal);
  dom.btnSound.addEventListener('click', () => {
    audio.init();
    setSound(!settings.sound);
  });
  dom.btnMenu.addEventListener('click', () => {
    audio.init();
    audio.play('page');
    openMenu();
  });
  dom.brand.addEventListener('click', () => {
    audio.init();
    audio.play('page');
    openMenu();
  });

  dom.modalLayer.addEventListener('click', (event) => {
    if (event.target.closest('[data-modal-close]')) {
      closeModal();
      return;
    }
    if (event.target === dom.modalLayer && state.modalCloseable) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (dom.modalLayer.classList.contains('is-open')) {
        if (state.modalCloseable) closeModal();
      } else if (!state.busy) {
        clearSelection();
      }
      return;
    }
    if (dom.modalLayer.classList.contains('is-open') || state.busy) return;
    if (!state.game || state.game.phase !== 'playing' || state.game.current !== state.humanIndex) return;

    if (event.key === 'Enter') {
      if (event.target.closest('button, input, textarea, select, [role="button"]')) return;
      const card = selectedCard();
      if (!card) return;
      const targets = legalTargetsFor(card);
      if (!defOf(card).target || targets.length === 0) {
        event.preventDefault();
        playSelected(null);
      }
      return;
    }

    if (event.key === '1' || event.key === '2') {
      const player = state.game.players[state.humanIndex];
      const index = Number(event.key) - 1;
      const card = player.hand[index];
      if (card) selectCard(card.uid);
    }
  });

  document.addEventListener('pointerdown', () => {
    audio.init();
    audio.setEnabled(settings.sound);
    audio.setMusicEnabled(settings.music);
  }, { once: true });

  document.addEventListener('pointerover', (event) => {
    if (event.target.closest('.card, .seat.is-targetable, .btn, .guess-card, .menu-item')) {
      audio.play('hover');
    }
  });
}

/* ==================================================================
   Boot
   ================================================================== */

function boot() {
  renderSetup();
  bindTitle();
  bindGameInteractions();
  updateSoundIcon();
  if (state.game) renderAll();
}

boot();
