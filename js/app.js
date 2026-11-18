// Dynamic Game State & BFS Engine

// Feature switches: flip to true to bring a feature back
const FEATURES = {
  freeplay: false, // Daily/Free Play toggle + Settings (free play & custom pairs)
  hint: false,     // Hint button
  undo: false      // Undo button
};

const EMBEDDED_WORDS = {
  3: ["CAT","DOG","COT","DOT","GOD","COG","LOG","BAG","BUG","BOG","BAT","BAR","BAD","BED","RED","RAT","RAM","RAG","RUN","SUN","FUN","FAN","FIN","PIN","PEN","PET","POT","POP","TOP","TIP","TAP","MAP","MAN","MAT","MAD","MUD","MUG","HUG","HOT","HAT","HIT","FIT","FAT","FAR","FOR","FOX","BOX","BOY","TOY","DAY","WAY","PAY","SAY","SEE","SEA","TEA","TEN","TAN","TIN","WIN","WET"],
  4: ["BEER","PEER","POOR","POOP","WARM","WARD","CARD","CORD","COLD","CATS","COTS","DOTS","DOGS","FLIP","FLOP","FLAP","FLAG","FLAT","SLAP","SLIP","SHIP","SHOP","SHOT","SHOE","FOOT","FOOD","FOLD","GOLD","GOLF","WOLF","TALK","WALK","WORK","WORD","WOOD","BOOT","BOAT","COAT","COAL","COOL","FOOL","FAIL","FALL","BALL","BELL","BELT","BEST","BEAT","BEAR","DEAR","DOOR","DEEP","KEEP","KING","RING","SING","SONG","LONG","LOVE","LIVE","LIKE","LAKE","MAKE","TAKE","TIME","TIDE","SIDE","SITE","SIZE","SAME","GAME","NAME"],
  5: ["SMILE","SLIME","SHINE","WHITE","WRITE","WRONG","FROWN","CROWN","BROWN","BRAWN","BRAIN","GRAIN","TRAIN","TRAIL","TRIAL","SMART","START","STARE","SHARE","SHORE","SHORT","SPORT","SPOUT","SHOUT","SHRINE","PLANT","PLANE","PLATE","PLACE","PEACE","PEACH","BEACH","BENCH","BUNCH","LUNCH","MATCH","WATCH","CATCH","PITCH","PATCH","PATH","EARTH","HEART"],
  6: ["PLANET","PLANTS","PLANES","PLATES","PLACES","PEACES","PEACHES","RACKET","ROCKET","POCKET","PACKET","JACKET","MARKET","MARBLE","STABLE","TABLES","TABLET","TALENT","SILENT","LISTEN","SPRING","STRING","STRONG","STROKE","STRIKE","STREAM","SCREAM","SCRAPE","SCRAPS","STRAPS","STRIPE","STRIPS"]
};

const DEFAULT_SCHEDULE = [
  { date: "2026-11-11", start: "BEER", target: "POOP" },
  { date: "2026-11-12", start: "WARM", target: "COLD" },
  { date: "2026-11-13", start: "CAT", target: "DOG" },
  { date: "2026-11-14", start: "SMILE", target: "FROWN" },
  { date: "2026-11-15", start: "PLANET", target: "ROCKET" }
];

let gameState = {
  mode: 'daily',
  wordLength: 4,
  startWord: "",
  targetWord: "",
  history: [],
  currentBuffer: "",
  parMoves: 0,
  optimalPaths: [],
  result: null,            // 'won' | 'gaveup' once the puzzle ends
  validWords: new Set(),   // every word accepted as a guess
  commonWords: new Set(),  // everyday words: Par, hints, Give Up, free-play picks
  isGameOver: false,
  stretchy: false,         // start and target differ in length: each turn may also add or drop a letter
  freeplayLength: 4
};

let userStats = {
  played: 0,
  wins: 0,
  streak: 0,
  maxStreak: 0,
  diffDistribution: {}
};

// Application Initialization
window.onload = async () => {
  setupInstall();
  applyFeatureFlags();
  loadStats();
  buildKeyboardUI();
  setupEventListeners();
  await loadPuzzleMode('daily');
  loadNotice();
};

function applyFeatureFlags() {
  const el = id => document.getElementById(id);
  if (!FEATURES.freeplay) {
    // Daily is the only mode, so the mode toggle and Settings have nothing to do
    el('btn-mode-toggle').classList.add('hidden');
    el('btn-settings').classList.add('hidden');
  }
  if (!FEATURES.hint) el('btn-hint').classList.add('hidden');
  if (!FEATURES.undo) el('btn-undo').classList.add('hidden');
}

function updateStepCounter() {
  const steps = gameState.history.length - 1;
  const par = gameState.parMoves;
  document.getElementById('step-counter').innerText = steps;
  document.getElementById('step-par').innerText = par !== null && par !== undefined ? `/${par} steps` : 'steps';
  const undo = document.getElementById('btn-undo');
  if (undo) undo.disabled = steps === 0 || gameState.isGameOver;
  document.getElementById('grid-hint').classList.toggle('hidden', steps > 0 || gameState.isGameOver);
}

function setupEventListeners() {
  document.getElementById('btn-mode-toggle').addEventListener('click', toggleGameMode);
  document.getElementById('btn-help').addEventListener('click', () => showModal('modal-help'));
  document.getElementById('btn-stats').addEventListener('click', () => { updateStatsUI(); showModal('modal-stats'); });
  document.getElementById('btn-settings').addEventListener('click', () => showModal('modal-settings'));
  
  document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', hideModals));
  
  document.getElementById('btn-undo').addEventListener('click', handleUndo);
  document.getElementById('btn-hint').addEventListener('click', handleHint);
  document.getElementById('btn-giveup').addEventListener('click', handleGiveUpTap);
  document.getElementById('btn-install').addEventListener('click', handleInstall);
  document.getElementById('btn-share').addEventListener('click', handleShare);
  document.getElementById('btn-share-whatsapp').addEventListener('click', handleShareWhatsApp);
  document.getElementById('btn-copy').addEventListener('click', handleCopy);
  const shareGrid = document.getElementById('share-grid');
  shareGrid.checked = shareGridOn();
  shareGrid.addEventListener('change', () => {
    try { localStorage.setItem(SHARE_GRID_KEY, shareGrid.checked ? 'on' : 'off'); } catch (e) { /* not remembered */ }
  });
  document.getElementById('btn-yesterday').addEventListener('click', showYesterday);
  document.getElementById('btn-next-ready').addEventListener('click', () => location.reload());
  document.getElementById('btn-theme').addEventListener('click', showTheme);
  // document.getElementById('btn-theme-stats').addEventListener('click', showTheme);
  document.getElementById('btn-yesterday-back').addEventListener('click', () => { hideModals(); updateStatsUI(); showModal('modal-stats'); });
  document.getElementById('btn-sound').addEventListener('click', toggleSound);
  document.getElementById('end-banner').addEventListener('click', togglePlayEndClip);
  document.getElementById('end-audio-play').addEventListener('click', togglePlayEndClip);
  document.getElementById('end-audio-restart').addEventListener('click', restartEndClip);
  document.getElementById('end-audio-progress').addEventListener('click', seekEndClip);
  updateSoundButton();
  // Native share sheet (WhatsApp, Messages, etc.) is mainly available on mobile
  if (!navigator.share) document.getElementById('btn-share').classList.add('hidden');
  
  document.getElementById('btn-generate-freeplay').addEventListener('click', handleGenerateFreeplay);
  document.getElementById('btn-start-custom').addEventListener('click', handleStartCustom);

  document.querySelectorAll('.btn-len-select').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-len-select').forEach(b => {
        b.className = "btn-len-select btn-3d btn-white h-10 text-sm";
      });
      e.target.className = "btn-len-select btn-3d btn-teal h-10 text-sm";
      gameState.freeplayLength = parseInt(e.target.dataset.len);
    });
  });

  window.addEventListener('keydown', handlePhysicalKeyboard);
}

// Puzzle #1 is the first day in puzzles.txt; numbers count days from there.
const FIRST_PUZZLE_DATE = '2026-11-11';

function puzzleNumber(dateStr) {
  const day = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((day(dateStr) - day(FIRST_PUZZLE_DATE)) / 86400000) + 1;
}

// The daily puzzle changes at midnight UK time (Europe/London: GMT in winter, BST in summer)
const UK_TZ = 'Europe/London';

function todayUK() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(new Date()); // YYYY-MM-DD
}

// Local testing only: ?date=YYYY-MM-DD plays that day's puzzle. Ignored anywhere but localhost,
// and nothing is saved while previewing (no stats, streak, progress or archive).
const PREVIEW_DATE = (() => {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return null;
  const d = new URLSearchParams(location.search).get('date');
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null;
})();
const puzzleDate = () => PREVIEW_DATE || todayUK();

function msUntilUKMidnight() {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: UK_TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date()).forEach(p => { parts[p.type] = +p.value; });
  const sinceMidnight = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + new Date().getMilliseconds();
  return Math.max(0, 86400000 - sinceMidnight);
}

// Every line of puzzles.txt by date (filled by loadPuzzleMode), used by the yesterday view
let scheduleByDate = {};

// The daily pair for a date: puzzles.txt, else the built-in fallback schedule
function pairForDate(dateStr) {
  return scheduleByDate[dateStr] || DEFAULT_SCHEDULE[Math.abs(hashCode(dateStr)) % DEFAULT_SCHEDULE.length];
}

// Data Fetching & Loaders
async function loadPuzzleMode(mode) {
  gameState.mode = mode;
  gameState.isGameOver = false;
  gameState.history = [];
  gameState.currentBuffer = "";
  gameState.stretchy = false;

  document.getElementById('mode-label').innerText = mode === 'daily' ? 'Daily' : 'Free Play';

  if (mode === 'daily') {
    const todayStr = puzzleDate();
    let dailyPair = null;

    try {
      const res = await fetch('puzzles.txt');
      if (res.ok) {
        const txt = await res.text();
        const lines = txt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        for (const line of lines) {
          const [d, s, t] = line.split('|');
          if (d && s && t) scheduleByDate[d] = { start: s.trim().toUpperCase(), target: t.trim().toUpperCase() };
        }
        dailyPair = scheduleByDate[todayStr] || null;
      }
    } catch (e) {
      console.log("Using built-in puzzle schedule");
    }

    if (!dailyPair) dailyPair = pairForDate(todayStr);

    gameState.startWord = dailyPair.start;
    gameState.targetWord = dailyPair.target;
    gameState.wordLength = dailyPair.start.length;
    gameState.stretchy = dailyPair.start.length !== dailyPair.target.length;
    document.getElementById('puzzle-date-badge').innerText = `Daily #${puzzleNumber(todayStr)} (${todayStr})`;
  }

  await loadDictionary(gameState.stretchy ? STRETCHY_LENGTHS : gameState.wordLength);
  initGameSession();
}

async function fetchWordList(path, length) {
  try {
    const res = await fetch(path);
    if (!res.ok) return [];
    const txt = await res.text();
    return txt.split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(w => w.length === length);
  } catch (e) {
    console.log(`Could not load ${path}`);
    return [];
  }
}

// One length (normal days) or several (stretchy days)
async function loadDictionary(lengths) {
  const { common, valid } = await mergedWordSets([].concat(lengths));
  gameState.commonWords = common;
  gameState.validWords = valid;
  gameState.validWords.add(gameState.startWord);
  gameState.validWords.add(gameState.targetWord);
}

function initGameSession() {
  gameState.history = [gameState.startWord];
  gameState.currentBuffer = "";
  gameState.isGameOver = false;
  gameState.result = null;
  
  const analysis = findRoute(gameState.startWord, gameState.targetWord);
  gameState.parMoves = analysis.optimalSteps;
  gameState.optimalPaths = analysis.paths;
  restoreProgress();

  document.getElementById('start-word-display').innerText = gameState.startWord;
  document.getElementById('target-word-display').innerText = gameState.targetWord;
  ['start-word-display', 'target-word-display'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.toggle('chip-long', el.innerText.length >= 7);
  });
  document.getElementById('word-len-badge').innerText = gameState.stretchy
    ? `Stretchy ${gameState.startWord.length}➔${gameState.targetWord.length}` : `${gameState.wordLength} Letters`;
  document.getElementById('par-badge').innerText = `Par: ${gameState.parMoves !== null ? gameState.parMoves : '--'}`;
  
  // Stretchy days keep their rules on screen all day
  document.getElementById('stretchy-rules').classList.toggle('hidden', !gameState.stretchy);
  if (PREVIEW_DATE && !document.getElementById('preview-ribbon')) {
    const ribbon = document.createElement('div');
    ribbon.id = 'preview-ribbon';
    ribbon.className = 'preview-ribbon';
    ribbon.innerText = `PREVIEW ${PREVIEW_DATE} · not saved`;
    document.body.appendChild(ribbon);
  }
  document.getElementById('grid-hint').innerText = gameState.stretchy
    ? 'Change, add or remove 1 letter!' : 'Change 1 letter to shift the word!';

  renderGrid();
  updateStepCounter();
}

// Graph Pathfinder Algorithm (BFS)
// Neighbours are generated by swapping each letter A-Z and checking the Set, so cost
// scales with word length rather than dictionary size. Returns one shortest path.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STRETCHY_LENGTHS = [3, 4, 5, 6, 7]; // dictionary lengths; stretchy words stay within them

// Every word one move from `word`: change a letter, and on stretchy days also add or drop one.
// (Mirrored in tools/puzzles.py and gen-puz/index.html.)
function neighbours(word, stretchy = gameState.stretchy) {
  const out = new Set();
  for (let i = 0; i < word.length; i++) {
    for (const c of ALPHABET) if (c !== word[i]) out.add(word.slice(0, i) + c + word.slice(i + 1));
  }
  if (stretchy) {
    if (word.length < STRETCHY_LENGTHS[STRETCHY_LENGTHS.length - 1]) {
      for (let i = 0; i <= word.length; i++) for (const c of ALPHABET) out.add(word.slice(0, i) + c + word.slice(i));
    }
    if (word.length > STRETCHY_LENGTHS[0]) {
      for (let i = 0; i < word.length; i++) out.add(word.slice(0, i) + word.slice(i + 1));
    }
  }
  return out;
}

function solveBFS(start, target, dictSet, stretchy = gameState.stretchy) {
  if (start === target) return { optimalSteps: 0, paths: [[start]] };

  const parent = new Map([[start, null]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const curr = queue[head];
    for (const next of neighbours(curr, stretchy)) {
      if (parent.has(next) || (next !== target && !dictSet.has(next))) continue;
      parent.set(next, curr);
      if (next === target) {
        const path = [next];
        while (parent.get(path[path.length - 1])) path.push(parent.get(path[path.length - 1]));
        path.reverse();
        return { optimalSteps: path.length - 1, paths: [path] };
      }
      queue.push(next);
    }
  }
  return { optimalSteps: null, paths: [] };
}

// Step distance from start to every word reachable through dictSet.
function distancesFrom(start, dictSet) {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const curr = queue[head];
    for (const next of neighbours(curr)) {
      if (!dist.has(next) && dictSet.has(next)) {
        dist.set(next, dist.get(curr) + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

// Prefer routes through everyday words; fall back to the full list so puzzles with
// obscure start/target words (or an obscure word the player has typed) still solve.
function findRoute(from, target, common = gameState.commonWords, valid = gameState.validWords, stretchy = gameState.stretchy) {
  const viaCommon = solveBFS(from, target, common, stretchy);
  if (viaCommon.paths.length > 0) return viaCommon;
  return solveBFS(from, target, valid, stretchy);
}

function isOneDiff(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) d++;
    if (d > 1) return false;
  }
  return d === 1;
}

// One legal move: a changed letter, or (stretchy days) one letter added or dropped anywhere
function isOneStep(a, b, stretchy = gameState.stretchy) {
  if (a.length === b.length) return isOneDiff(a, b);
  if (!stretchy || Math.abs(a.length - b.length) !== 1) return false;
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && long[i] === short[i]) i++;
  return long.slice(i + 1) === short.slice(i);
}

const lastWord = () => gameState.history[gameState.history.length - 1];

// Longest word the player may type next
function maxBufferLength() {
  if (!gameState.stretchy) return gameState.wordLength;
  return Math.min(STRETCHY_LENGTHS[STRETCHY_LENGTHS.length - 1], lastWord().length + 1);
}

// User Action Handlers
function handleKeyInput(key) {
  if (gameState.isGameOver) return;
  if (giveUpStage) resetGiveUp();

  if (key === 'BACKSPACE') {
    if (gameState.currentBuffer.length > 0) {
      gameState.currentBuffer = gameState.currentBuffer.slice(0, -1);
      renderGrid();
      saveProgress();
    }
    return;
  }

  if (key === 'ENTER') {
    submitWord();
    return;
  }

  if (/^[A-Z]$/.test(key)) {
    if (gameState.currentBuffer.length < maxBufferLength()) {
      gameState.currentBuffer += key;
      renderGrid();
      saveProgress();
    }
  }
}

function submitWord() {
  unlockAudio();
  const word = gameState.currentBuffer;
  const prev = lastWord();
  const minLength = gameState.stretchy ? Math.max(STRETCHY_LENGTHS[0], prev.length - 1) : gameState.wordLength;
  if (word.length < minLength) {
    showToast("Not enough letters", "shake");
    return;
  }

  if (!isOneStep(prev, word)) {
    showToast(gameState.stretchy ? "Change, add or remove exactly 1 letter" : "Must change exactly 1 letter", "shake");
    return;
  }

  if (!gameState.validWords.has(word)) {
    showToast("Not in word list", "shake");
    return;
  }

  gameState.history.push(word);
  gameState.currentBuffer = "";
  preloadSounds();
  saveProgress();
  renderGrid();
  updateStepCounter();

  if (word === gameState.targetWord) {
    gameState.isGameOver = true;
    gameState.result = 'won';
    saveProgress();
    updateStepCounter();
    renderGrid();
    const playerSteps = gameState.history.length - 1;
    const diff = playerSteps - gameState.parMoves;

    let msg = "Perfect!";
    if (diff > 0) msg = `${diff} step(s) over par!`;
    else if (diff < 0) msg = `${-diff} step(s) under par!`;

    recordWin(diff);
    showToast(`🎉 Puzzle Complete! ${msg}`, "pop");
    setTimeout(() => {
      showModal('modal-stats'); updateStatsUI();
      autoplayEndClip();
    }, 1200);
  }
}

function handleUndo() {
  if (!FEATURES.undo) return;
  if (gameState.history.length > 1 && !gameState.isGameOver) {
    gameState.history.pop();
    gameState.currentBuffer = "";
    saveProgress();
    renderGrid();
    updateStepCounter();
  }
}

function handleHint() {
  if (gameState.isGameOver) return;
  const curr = gameState.history[gameState.history.length - 1];
  const sol = findRoute(curr, gameState.targetWord);

  if (sol.paths.length > 0 && sol.paths[0].length > 1) {
    const nextWord = sol.paths[0][1];
    showToast(`Try moving towards: ${nextWord}`, "pop");
  } else {
    showToast("No valid route found from here!", "shake");
  }
}

// --- Progress persistence ----------------------------------------------------
// Saved per puzzle so a refresh (or reopening the installed app) resumes where you
// left off. A finished or given-up puzzle stays finished, so refreshing can't retry it.
const PROGRESS_KEY = 'turdle-progress';

function puzzleId() {
  const date = (document.getElementById('puzzle-date-badge').innerText.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
  return `${gameState.mode}|${date}|${gameState.startWord}|${gameState.targetWord}`;
}

function saveProgress() {
  if (PREVIEW_DATE) return; // previews never save
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      id: puzzleId(),
      history: gameState.history,
      buffer: gameState.currentBuffer,
      result: gameState.result
    }));
  } catch (e) { /* storage unavailable (private mode etc.): just don't persist */ }
  if (gameState.mode === 'daily') archiveGame(puzzleId(), gameState.history, gameState.result);
}

// --- Past daily games (for "yesterday's answer") ------------------------------
// A separate key, so turdle-progress and the stats are never touched. Keeps the last 7 days.
const PAST_KEY = 'turdle-past';

function loadPast() {
  try { return JSON.parse(localStorage.getItem(PAST_KEY)) || {}; } catch (e) { return {}; }
}

function archiveGame(id, history, result) {
  const [mode, date, start, target] = (id || '').split('|');
  if (mode !== 'daily' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(history)) return;
  try {
    const past = loadPast();
    past[date] = { start, target, history, result: result || null };
    for (const d of Object.keys(past).sort().slice(0, -7)) delete past[d];
    localStorage.setItem(PAST_KEY, JSON.stringify(past));
  } catch (e) { /* storage unavailable: no history */ }
}

// Copy whatever turdle-progress holds into the archive (e.g. yesterday's game, before today's
// first keypress replaces it). Read-only on turdle-progress itself.
function archiveSavedProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    if (saved) archiveGame(saved.id, saved.history, saved.result);
  } catch (e) { /* nothing saved */ }
}

function restoreProgress() {
  if (PREVIEW_DATE) return; // previews always start fresh and leave the real game alone
  archiveSavedProgress();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(PROGRESS_KEY)); } catch (e) { return; }
  if (!saved || saved.id !== puzzleId() || !Array.isArray(saved.history) || saved.history[0] !== gameState.startWord) return;
  // Only trust saved words that are still valid one-letter steps
  const history = [saved.history[0]];
  for (const w of saved.history.slice(1)) {
    if (!isOneStep(history[history.length - 1], w) || !gameState.validWords.has(w)) break;
    history.push(w);
  }
  gameState.history = history;
  gameState.currentBuffer = typeof saved.buffer === 'string' ? saved.buffer.slice(0, maxBufferLength()) : '';
  if (saved.result === 'won' && history[history.length - 1] === gameState.targetWord) {
    gameState.result = 'won';
    gameState.isGameOver = true;
  } else if (saved.result === 'gaveup') {
    gameState.result = 'gaveup';
    gameState.isGameOver = true;
  }
}

// Give Up needs three taps (two confirmations) so a stray tap can't end the game.
// The confirmation resets if the player doesn't tap again within a few seconds.
const GIVEUP_STAGES = ["Give Up", "Are you sure?", "Really give up?"];
let giveUpStage = 0;
let giveUpTimer = null;

function resetGiveUp() {
  clearTimeout(giveUpTimer);
  giveUpStage = 0;
  const btn = document.getElementById('btn-giveup');
  document.getElementById('giveup-label').innerText = GIVEUP_STAGES[0];
  btn.classList.remove('btn-confirm');
}

function handleGiveUpTap() {
  if (gameState.isGameOver) return;
  unlockAudio();
  clearTimeout(giveUpTimer);
  giveUpStage++;
  if (giveUpStage >= GIVEUP_STAGES.length) {
    resetGiveUp();
    handleGiveUp();
    return;
  }
  const btn = document.getElementById('btn-giveup');
  document.getElementById('giveup-label').innerText = GIVEUP_STAGES[giveUpStage];
  // Re-trigger the shake animation on each stage
  btn.classList.remove('btn-confirm'); void btn.offsetWidth; btn.classList.add('btn-confirm');
  giveUpTimer = setTimeout(resetGiveUp, 3000);
}

function handleGiveUp() {
  if (gameState.isGameOver) return;
  if (gameState.optimalPaths.length > 0) {
    const path = gameState.optimalPaths[0].join(" ➔ ");
    showToast(`Solution: ${path}`, "pop");
  }
  gameState.isGameOver = true;
  gameState.result = 'gaveup';
  saveProgress();
  recordLoss();
  updateStepCounter();
  renderGrid();
  setTimeout(() => {
    showModal('modal-stats'); updateStatsUI();
    autoplayEndClip();
  }, 2500);
}

// UI Rendering
function renderGrid() {
  const grid = document.getElementById('ladder-grid');
  grid.innerHTML = "";

  const { stretchy, history, currentBuffer } = gameState;
  history.forEach((word, idx) => {
    const type = word === gameState.targetWord && idx > 0 ? "target" : idx === 0 ? "start" : "history";
    grid.appendChild(stretchy
      ? createRowElement(word, type, gameState.targetWord, word.length, history[idx - 1] || null)
      : createRowElement(word, type));
  });

  if (!gameState.isGameOver) {
    // Stretchy: as wide as the last word, plus a spare slot while there's room to add a letter
    const len = stretchy
      ? Math.min(maxBufferLength(), Math.max(lastWord().length, currentBuffer.length + 1))
      : gameState.wordLength;
    grid.appendChild(createRowElement(currentBuffer, "active", gameState.targetWord, len));
  }

  // Give Up has nothing to do once the puzzle is over; drop the controls row if it's then empty
  document.getElementById('btn-giveup').classList.toggle('hidden', gameState.isGameOver);
  const controls = document.getElementById('game-controls');
  controls.classList.toggle('hidden', [...controls.children].every(b => b.classList.contains('hidden')));

  const area = document.getElementById('grid-scroll-area');
  area.scrollTop = area.scrollHeight;
}

// Index of the letter changed or added since prev (stretchy rows), or -1 (start row, or a dropped letter)
function changedIndex(prev, word) {
  if (!prev || word.length < prev.length) return -1;
  let i = 0;
  while (i < prev.length && prev[i] === word[i]) i++;
  return i < word.length ? i : -1;
}

// prev is given only on stretchy days: rows then also mark the changed/added letter, since
// letters shift position and the target matches alone don't show how the ladder moved.
function createRowElement(wordStr, type, target = gameState.targetWord, length = gameState.wordLength, prev) {
  const changed = prev === undefined ? -1 : changedIndex(prev, wordStr);
  const row = document.createElement('div');
  row.className = `flex gap-2 justify-center w-full tiles-${length}` + (type === "active" ? "" : " animate-pop");

  for (let i = 0; i < length; i++) {
    const char = wordStr[i] || "";
    const tile = document.createElement('div');
    let cls = "tile";

    if (type === "target") {
      cls += " tile-target";
    } else if (type === "start" || type === "history") {
      // Highlight letters already matching the target in the same position (progress)
      if (char && char === target[i]) cls += " tile-match";
      if (prev !== undefined && i === changed) cls += " tile-changed";
    } else if (type === "active") {
      if (char) cls += " tile-typed";
      else cls += i === wordStr.length ? " tile-empty tile-cursor" : " tile-empty";
    }

    tile.className = cls;
    tile.innerText = char;
    row.appendChild(tile);
  }

  return row;
}

function buildKeyboardUI() {
  const rows = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['ENTER', 'Z','X','C','V','B','N','M', 'BACKSPACE']
  ];

  rows.forEach((row, idx) => {
    const container = document.getElementById(`kbd-row-${idx + 1}`);
    container.innerHTML = "";
    row.forEach(k => {
      const btn = document.createElement('button');
      if (k === 'ENTER') {
        btn.className = "key-btn key-wide btn-3d btn-teal";
        btn.innerText = "SUBMIT";
      } else if (k === 'BACKSPACE') {
        btn.className = "key-btn key-wide btn-3d btn-white text-xl";
        btn.innerText = "⌫";
        btn.setAttribute('aria-label', 'Delete letter');
        btn.title = 'Delete letter';
      } else {
        btn.className = "key-btn key-letter btn-3d btn-white";
        btn.innerText = k;
      }
      btn.addEventListener('click', () => handleKeyInput(k));
      container.appendChild(btn);
    });
  });
}

function handlePhysicalKeyboard(e) {
  // Leave shortcuts (Cmd/Ctrl+R etc.) and typing in form fields alone
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select')) return;
  // Stop Enter/Space from also "clicking" whichever on-screen key last had focus
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Backspace') e.preventDefault();

  if (e.key === 'Backspace' || e.key === 'Delete') handleKeyInput('BACKSPACE');
  else if (e.key === 'Enter') handleKeyInput('ENTER');
  else if (/^[a-zA-Z]$/.test(e.key)) handleKeyInput(e.key.toUpperCase());
}

// --- Sounds ------------------------------------------------------------------
// Played when the stats window opens at the end of a game: on par one clip, otherwise an effect, then speech.
// Web Audio, unlocked during the tap/keypress that ends the game, so iOS allows the
// delayed playback. Any failure is silent: sound must never break the game.
// One clip and one banner (shown in the stats window, with play/pause, restart and seek) per end state; see endState().
const SOUND_FILES = {
  over: 'audio-files/too-many-turns.mp3',
  under: 'audio-files/under-par.mp3',
  par: 'audio-files/thats-an-on-par-turdle.mp3',
  gaveup: 'audio-files/you-gave-up.mp3'
};
const BANNER_FILES = {
  over: { src: 'turdle-crooner-banners/1-too-many-turns.png', alt: 'Too many turns' },
  under: { src: 'turdle-crooner-banners/2-under-par.png', alt: 'Under par' },
  par: { src: 'turdle-crooner-banners/3-on-par.png', alt: 'On par' },
  gaveup: { src: 'turdle-crooner-banners/4-gave-up.png', alt: 'Gave up' }
};

// 'over' | 'under' | 'par' | 'gaveup' once the puzzle has ended, else null.
// Under par is possible: guesses may use the full dictionary, par only everyday words.
function endState() {
  if (gameState.result === 'gaveup') return 'gaveup';
  if (gameState.result !== 'won') return null;
  const par = gameState.parMoves;
  if (par === null || par === undefined) return 'par';
  const diff = gameState.history.length - 1 - par;
  return diff > 0 ? 'over' : diff < 0 ? 'under' : 'par';
}
const SOUND_KEY = 'turdle-sound';
let audioCtx = null;
const soundData = {};    // name -> Promise<ArrayBuffer>
const soundBuffers = {}; // name -> Promise<AudioBuffer>

function soundOn() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; }
}

function unlockAudio(force = false) {
  if (!force && !soundOn()) return;
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    // Play through the iPhone silent switch, like a normal <audio> element (Safari 16.4+)
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    if (audioCtx.state === 'suspended' && clipState !== 'paused') audioCtx.resume(); // pause owns its own resume
    // A silent one-sample buffer, played inside the gesture, unlocks iOS
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination);
    src.start(0);
  } catch (e) { /* no audio */ }
}

function fetchSound(name) {
  if (!soundData[name]) {
    soundData[name] = fetch(SOUND_FILES[name]).then(r => (r.ok ? r.arrayBuffer() : Promise.reject()));
    soundData[name].catch(() => delete soundData[name]); // allow a retry later
  }
  return soundData[name];
}

function decodeSound(name) {
  if (!soundBuffers[name]) {
    // decodeAudioData detaches the ArrayBuffer, so decode a copy
    soundBuffers[name] = fetchSound(name).then(data => new Promise((ok, fail) =>
      audioCtx.decodeAudioData(data.slice(0), ok, fail)));
    soundBuffers[name].catch(() => delete soundBuffers[name]);
  }
  return soundBuffers[name];
}

// Download (not decode: that needs the AudioContext) once the player makes a first move.
// The clips are ~2 MB each, so a visit that never plays doesn't pay for them.
let soundsPreloaded = false;
function preloadSounds() {
  if (soundsPreloaded || !soundOn()) return;
  soundsPreloaded = true;
  Object.keys(SOUND_FILES).forEach(n => fetchSound(n).catch(() => {}));
}

// The end clip, played on the audio clock. Pause suspends the AudioContext (only this clip uses it),
// which also freezes currentTime, so the position stays currentTime - clip.startAt.
let clip = null;          // { name, buffer, startAt } for the clip last started
let clipState = 'idle';   // 'idle' | 'loading' | 'playing' | 'paused' | 'ended'
let clipDuration = {};    // name -> seconds, once decoded
let autoplayBlocked = false;
let playToken = 0;
let currentSources = [];
let progressFrame = 0;

async function playEndClip(name, offset = 0, force = false) {
  if ((!force && !soundOn()) || !audioCtx || !SOUND_FILES[name]) return;
  const token = ++playToken;
  setClipState('loading');
  try {
    const buffer = await decodeSound(name);
    if (token !== playToken) return;
    stopSound();
    playToken = token; // stopSound bumps it
    document.getElementById('theme-audio').pause();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    clipDuration[name] = buffer.duration;
    offset = Math.max(0, Math.min(offset, buffer.duration - 0.05));
    const at = audioCtx.currentTime + 0.05;
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);
    src.onended = () => { if (token === playToken) setClipState('ended'); };
    src.start(at, offset);
    currentSources.push(src);
    clip = { name, buffer, startAt: at - offset };
    autoplayBlocked = false;
    setClipState('playing');
  } catch (e) { /* missing or undecodable file: stay quiet */
    if (token === playToken) setClipState('idle');
  }
}

function stopSound() {
  playToken++;
  const sources = currentSources;
  currentSources = [];
  sources.forEach(src => { try { src.stop(); } catch (e) { /* already stopped */ } });
  // A paused clip leaves the context suspended; wake it so the next play isn't silent
  if (clipState === 'paused' && audioCtx) audioCtx.resume();
  clip = null;
  setClipState('idle');
}

function clipPosition() {
  if (clipState === 'ended') return clip ? clip.buffer.duration : 0;
  if (!clip || !audioCtx || (clipState !== 'playing' && clipState !== 'paused')) return 0;
  return Math.max(0, Math.min(clip.buffer.duration, audioCtx.currentTime - clip.startAt));
}

// Autoplay when the stats window opens at the end of a game. If the browser keeps the
// context suspended (no recent tap), say so, so the player knows to press play.
function autoplayEndClip() {
  const state = endState();
  if (!state || !soundOn()) return updateEndAudio();
  playEndClip(state);
  setTimeout(() => {
    if (clipState !== 'playing' && clipState !== 'loading' && soundOn() && endState()) {
      autoplayBlocked = !audioCtx || audioCtx.state !== 'running';
      updateEndAudio();
    }
  }, 600);
}

// Every control is an explicit tap, so it plays even when autoplay is muted
function togglePlayEndClip() {
  const state = endState();
  if (!state) return;
  if (clipState === 'playing') {
    audioCtx.suspend();
    setClipState('paused');
  } else if (clipState === 'paused') {
    audioCtx.resume();
    setClipState('playing');
  } else if (clipState !== 'loading') {
    unlockAudio(true);
    playEndClip(state, 0, true);
  }
}

function restartEndClip() {
  const state = endState();
  if (!state) return;
  unlockAudio(true);
  playEndClip(state, 0, true);
}

function seekEndClip(e) {
  const state = endState();
  const duration = clipDuration[state];
  if (!state || !duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  unlockAudio(true);
  playEndClip(state, fraction * duration, true);
}

function setClipState(s) {
  clipState = s;
  updateEndAudio();
  cancelAnimationFrame(progressFrame);
  if (s === 'playing') progressFrame = requestAnimationFrame(tickProgress);
}

function tickProgress() {
  renderProgress();
  if (clipState === 'playing') progressFrame = requestAnimationFrame(tickProgress);
}

function formatTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function renderProgress() {
  const duration = clipDuration[endState()] || 0;
  const pos = clipPosition();
  document.getElementById('end-audio-fill').style.width = duration ? `${(pos / duration) * 100}%` : '0%';
  document.getElementById('end-audio-time').innerText = duration ? `${formatTime(pos)} / ${formatTime(duration)}` : formatTime(pos);
}

// Controls, banner overlay and the "can you hear it?" hint. Device volume can't be read, so while
// the clip plays we just suggest turning it up.
function updateEndAudio() {
  const playing = clipState === 'playing' || clipState === 'loading';
  const play = document.getElementById('end-audio-play');
  play.innerText = playing ? '⏸' : '▶︎';
  play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  let hint = '';
  if (playing) hint = "Can't hear it? Turn your volume up 🔊 (and check silent mode)";
  else if (!soundOn()) hint = '🔇 Sound is off. Tap ▶︎ to hear the Crooner Keith, or 🔇 above to turn it back on.';
  else if (autoplayBlocked) hint = 'Tap ▶︎ to hear the Crooner Keith';
  const el = document.getElementById('end-audio-hint');
  el.innerText = hint;
  el.classList.toggle('hidden', !hint);
  renderProgress();
}

function updateEndBanner() {
  const state = endState();
  const btn = document.getElementById('end-banner');
  btn.classList.toggle('hidden', !state);
  document.getElementById('end-audio').classList.toggle('hidden', !state);
  if (!state) return;
  const img = btn.querySelector('img');
  if (img.getAttribute('src') !== BANNER_FILES[state].src) img.src = BANNER_FILES[state].src;
  img.alt = BANNER_FILES[state].alt;
  btn.setAttribute('aria-label', `${BANNER_FILES[state].alt}: play or pause the Turdle crooner`);
  updateEndAudio();
}

function updateSoundButton() {
  const on = soundOn();
  const btn = document.getElementById('btn-sound');
  btn.innerText = on ? '🔊' : '🔇';
  btn.title = on ? 'Sound on (tap to mute)' : 'Sound off (tap to unmute)';
  btn.setAttribute('aria-label', btn.title);
}

function toggleSound() {
  const on = !soundOn();
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
  if (on) unlockAudio(); else stopSound();
  updateSoundButton();
  updateEndAudio();
}

// --- Yesterday's answer --------------------------------------------------------
const wordListCache = {}; // length -> { common, valid }

// Fresh merged sets for several lengths, safe to add to
async function mergedWordSets(lengths) {
  const parts = await Promise.all(lengths.map(wordSetsFor));
  return {
    common: new Set(parts.flatMap(p => [...p.common])),
    valid: new Set(parts.flatMap(p => [...p.valid]))
  };
}

async function wordSetsFor(length) {
  // Own copies, so yesterday's start/target never become valid guesses today
  if (!wordListCache[length]) {
    let [valid, common] = await Promise.all([
      fetchWordList(`dictionaries/dictionary-${length}.txt`, length),
      fetchWordList(`dictionaries/common-${length}.txt`, length)
    ]);
    if (valid.length === 0) valid = EMBEDDED_WORDS[length] || [];
    if (common.length === 0) common = valid;
    wordListCache[length] = { common: new Set(common), valid: new Set([...valid, ...common]) };
  }
  return wordListCache[length];
}

function ladderElement(words, target) {
  const box = document.createElement('div');
  box.className = 'yesterday-ladder flex flex-col items-center gap-1.5';
  const stretchy = words[0].length !== target.length;
  words.forEach((w, idx) => {
    const type = w === target && idx > 0 ? 'target' : 'history';
    const row = stretchy
      ? createRowElement(w, type, target, w.length, words[idx - 1] || null)
      : createRowElement(w, type, target, target.length);
    row.classList.remove('animate-pop');
    box.appendChild(row);
  });
  return box;
}

async function showYesterday() {
  const date = dayBefore(puzzleDate());
  const el = id => document.getElementById(id);
  hideModals();
  showModal('modal-yesterday');

  if (puzzleNumber(date) < 1) {
    el('yesterday-title').innerText = 'Yesterday';
    el('yesterday-pair').innerText = '';
    el('yesterday-mine').classList.add('hidden');
    el('yesterday-route-wrap').classList.add('hidden');
    el('yesterday-note').innerText = 'There was no puzzle yesterday. Come back tomorrow!';
    el('yesterday-note').classList.remove('hidden');
    return;
  }

  const { start, target } = pairForDate(date);
  el('yesterday-title').innerText = `Yesterday · #${puzzleNumber(date)}`;
  el('yesterday-pair').innerText = `${start} ➔ ${target}  (${date})`;
  el('yesterday-route').innerHTML = '<div class="text-sm font-bold" style="color: var(--ink-soft)">Working it out…</div>';
  el('yesterday-route-wrap').classList.remove('hidden');

  const mine = loadPast()[date];
  const played = mine && mine.start === start && mine.target === target && mine.history.length > 1;
  el('yesterday-note').classList.toggle('hidden', played);
  el('yesterday-note').innerText = 'No game recorded for yesterday on this device.';

  const stretchy = start.length !== target.length;
  const { common, valid } = await mergedWordSets(stretchy ? STRETCHY_LENGTHS : [start.length]);
  valid.add(start); valid.add(target);
  const route = findRoute(start, target, common, valid, stretchy);
  const par = route.optimalSteps;

  el('yesterday-mine').classList.toggle('hidden', !played);
  if (played) {
    const steps = mine.history.length - 1;
    const verdict = mine.result === 'won'
      ? `Solved in ${steps} step${steps === 1 ? '' : 's'}${par === null ? '' : steps <= par ? ' ⛳ on par!' : ` (par ${par})`}`
      : mine.result === 'gaveup' ? `Gave up after ${steps} step${steps === 1 ? '' : 's'} 💩`
      : `Didn't finish (${steps} step${steps === 1 ? '' : 's'})`;
    el('yesterday-mine-verdict').innerText = verdict;
    el('yesterday-mine-ladder').replaceChildren(ladderElement(mine.history, target));
  }
  el('yesterday-route-label').innerText = par === null ? 'No route found' : `Par route · ${par} steps`;
  el('yesterday-route').replaceChildren(route.paths.length ? ladderElement(route.paths[0], target) : '');
}

// Helpers & Analytics
function showToast(msg, anim = "") {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `pill px-4 py-2 font-bold text-sm shadow-lg whitespace-nowrap ${anim ? 'animate-' + anim : ''}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModals() {
  if (!document.getElementById('modal-notice').classList.contains('hidden')) dismissNotice();
  stopCountdown();
  stopSound();
  document.querySelectorAll('[id^="modal-"]').forEach(m => m.classList.add('hidden'));
  document.getElementById('theme-audio').pause();
}

// --- Notice pop-up (alerts.txt) ------------------------------------------------
// Blocks are `KEY: "<html>";` where KEY is a UK date (YYYY-MM-DD) or a weekday (FRIDAY = every Friday).
// A dated notice beats a weekday one. Closing it hides it for the rest of the session (sessionStorage).
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const NOTICE_KEY = 'turdle-notice';
let noticeId = null;

function parseAlerts(txt) {
  const body = txt.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n');
  const re = new RegExp(`^\\s*(\\d{4}-\\d{2}-\\d{2}|${WEEKDAYS.join('|')})\\s*:\\s*"([\\s\\S]*?)"\\s*;\\s*$`, 'gmi');
  const alerts = {};
  for (const [, key, html] of body.matchAll(re)) alerts[key.toUpperCase()] = html.trim();
  return alerts;
}

async function loadNotice() {
  try {
    const res = await fetch('alerts.txt');
    if (!res.ok) return;
    const alerts = parseAlerts(await res.text());
    const today = puzzleDate();
    const weekday = WEEKDAYS[new Date(today + 'T12:00:00Z').getUTCDay()];
    const key = alerts[today] !== undefined ? today : alerts[weekday] !== undefined ? weekday : null;
    if (!key || !alerts[key]) return;
    noticeId = `${key}|${today}`;
    try { if (sessionStorage.getItem(NOTICE_KEY) === noticeId) return; } catch (e) {}
    showNotice(alerts[key]);
  } catch (e) {
    console.log('No notice today');
  }
}

function showNotice(html) {
  const box = document.getElementById('notice-content');
  box.innerHTML = html;
  // Images are filenames under images/ (subfolders allowed); full URLs are left alone
  box.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src');
    if (!/^(https?:|data:)/i.test(src)) img.setAttribute('src', 'images/' + src.replace(/^\/+/, '').replace(/^images\//, ''));
  });
  // Don't cover another window (e.g. a restored game's stats): wait until none is open
  const open = () => [...document.querySelectorAll('[id^="modal-"]')].some(m => !m.classList.contains('hidden'));
  const tryShow = () => (open() ? setTimeout(tryShow, 500) : showModal('modal-notice'));
  tryShow();
}

function dismissNotice() {
  try { if (noticeId) sessionStorage.setItem(NOTICE_KEY, noticeId); } catch (e) {}
}

// --- Turdle Theme ---------------------------------------------------------------
// The lyrics walk through puzzle #3's answer, so on that day they stay hidden until it's finished.
const LYRICS_SPOILER_DATE = '2026-11-13';

function themeLyricsLocked() {
  const date = (document.getElementById('puzzle-date-badge').innerText.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
  return gameState.mode === 'daily' && date === LYRICS_SPOILER_DATE && !gameState.result;
}

function showTheme() {
  hideModals();
  const locked = themeLyricsLocked();
  document.getElementById('theme-lyrics').classList.toggle('hidden', locked);
  document.getElementById('theme-lyrics-locked').classList.toggle('hidden', !locked);
  showModal('modal-theme');
}

function loadStats() {
  const saved = localStorage.getItem('word_ladder_stats');
  if (saved) userStats = JSON.parse(saved);
  // A missed day breaks the streak. lastDaily is the date of the last daily game counted;
  // stats saved before it existed have none, so those streaks carry on untouched.
  const today = todayUK();
  if (userStats.lastDaily && userStats.lastDaily < dayBefore(today) && userStats.streak) {
    userStats.streak = 0;
    saveStats();
  }
}

function dayBefore(dateStr) {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') - 86400000).toISOString().split('T')[0];
}

// For daily games: false if this puzzle's date was already counted (e.g. replayed after clearing
// turdle-progress), otherwise breaks the streak if the previous daily wasn't the day before.
function countDaily() {
  if (gameState.mode !== 'daily') return true;
  const date = (document.getElementById('puzzle-date-badge').innerText.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
  if (!date) return true;
  if (userStats.lastDaily === date) return false;
  if (userStats.lastDaily && userStats.lastDaily !== dayBefore(date)) userStats.streak = 0;
  userStats.lastDaily = date;
  return true;
}

function saveStats() {
  if (PREVIEW_DATE) return;
  localStorage.setItem('word_ladder_stats', JSON.stringify(userStats));
}

function recordWin(parDiff) {
  if (PREVIEW_DATE) return;
  if (!countDaily()) return;
  userStats.played++;
  userStats.wins++;
  userStats.streak++;
  if (userStats.streak > userStats.maxStreak) userStats.maxStreak = userStats.streak;
  
  const key = parDiff <= 0 ? "Exact Par" : `+${parDiff}`;
  userStats.diffDistribution[key] = (userStats.diffDistribution[key] || 0) + 1;
  saveStats();
}

function recordLoss() {
  if (PREVIEW_DATE) return;
  if (!countDaily()) return;
  userStats.played++;
  userStats.streak = 0;
  saveStats();
}

function updateStatsUI() {
  document.getElementById('stat-played').innerText = userStats.played;
  const rate = userStats.played > 0 ? Math.round((userStats.wins / userStats.played) * 100) : 0;
  document.getElementById('stat-winrate').innerText = `${rate}%`;
  document.getElementById('stat-streak').innerText = userStats.streak;
  document.getElementById('stat-maxstreak').innerText = userStats.maxStreak;
  // document.getElementById('btn-theme-stats').classList.toggle('hidden', !gameState.result);
  updateEndBanner();
  startCountdown();
}

// --- Countdown to the next daily puzzle (UK midnight), shown in the stats window ---
let countdownTimer = null;

function stopCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = null;
}

function startCountdown() {
  stopCountdown();
  const box = document.getElementById('next-wrap');
  box.classList.toggle('hidden', gameState.mode !== 'daily');
  if (gameState.mode !== 'daily') return;
  const shownDate = (document.getElementById('puzzle-date-badge').innerText.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
  const tick = () => {
    const ms = msUntilUKMidnight();
    // Past midnight, or the app was left open overnight: today's puzzle is waiting
    const ready = ms < 1000 || (shownDate && shownDate !== todayUK());
    document.getElementById('next-countdown-row').classList.toggle('hidden', ready);
    document.getElementById('btn-next-ready').classList.toggle('hidden', !ready);
    if (ready) return stopCountdown();
    const secs = Math.ceil(ms / 1000);
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('next-countdown').innerText =
      `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
  };
  tick();
  if (!document.getElementById('btn-next-ready').classList.contains('hidden')) return;
  countdownTimer = setInterval(tick, 1000);
}

// The 🟩/⬜ steps grid hints at which letters change, so it's opt-in (stats window checkbox)
const SHARE_GRID_KEY = 'turdle-share-grid';
function shareGridOn() {
  try { return localStorage.getItem(SHARE_GRID_KEY) === 'on'; } catch (e) { return false; }
}

function buildShareText() {
  const steps = gameState.history.length - 1;
  const par = gameState.parMoves;
  let label = 'Free Play', query = '';
  if (gameState.mode === 'daily') {
    const date = (document.getElementById('puzzle-date-badge').innerText.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
    label = date ? `#${puzzleNumber(date)} ${date}` : '';
    // A new URL per puzzle makes WhatsApp etc. fetch a fresh link preview instead of a cached one.
    // The weekday page (e.g. s/thu.html) carries that day's preview image and redirects to the game;
    // see tools/make_og_images.js.
    if (date) {
      const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(date + 'T00:00:00Z').getUTCDay()];
      query = `s/${day}.html?p=${puzzleNumber(date)}`;
    }
  }
  const lines = [`Turdle 💩 ${label}`.trim(),
    `${gameState.startWord} ➔ ${gameState.targetWord}${gameState.stretchy ? ' 🪗 stretchy' : ''}`];
  if (gameState.result === 'won') {
    const state = endState();
    const verdict = par === null || par === undefined ? ''
      : state === 'under' ? ` 🏆 under par! (par ${par})`
      : state === 'over' ? ` · over par (par ${par})`
      : ' ⛳ on par!';
    lines.push(`Solved in ${steps} step${steps === 1 ? '' : 's'}${verdict}`);
  } else {
    lines.push(`Gave up after ${steps} step${steps === 1 ? '' : 's'} 💩`);
  }
  // Spoiler-free path: one row per word, 🟩 where the letter already matches the target.
  // Stretchy days too: each row keeps its own word's length, matched by position.
  const target = gameState.targetWord;
  if (shareGridOn()) {
    for (const word of gameState.history) {
      lines.push([...word].map((c, i) => (c === target[i] ? '🟩' : '⬜')).join(''));
    }
  }
  lines.push('', location.origin + location.pathname.replace(/[^/]*$/, '') + query); // drop any index.html
  return lines.join('\n');
}

function canShare() {
  if (gameState.result) return true;
  showToast("Finish today's puzzle to share!", "shake");
  return false;
}

async function handleShare() {
  if (!canShare()) return;
  try {
    await navigator.share({ text: buildShareText() });
  } catch (e) {
    if (e.name !== 'AbortError') handleCopy();
  }
}

function handleShareWhatsApp() {
  if (!canShare()) return;
  window.open(`https://wa.me/?text=${encodeURIComponent(buildShareText())}`, '_blank', 'noopener');
}

async function handleCopy() {
  if (!canShare()) return;
  const text = buildShareText();
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Fallback for older browsers / non-secure contexts
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
  showToast("Results copied to clipboard!", "pop");
}

async function handleGenerateFreeplay() {
  hideModals();
  gameState.mode = 'freeplay';
  gameState.stretchy = false;
  gameState.wordLength = gameState.freeplayLength;
  await loadDictionary(gameState.wordLength);

  // Pick an everyday start word, then a target 3-8 steps away (or the furthest reachable)
  const pool = gameState.commonWords.size ? gameState.commonWords : gameState.validWords;
  const arr = Array.from(pool);
  let s, t;
  for (let tries = 0; tries < 20; tries++) {
    const a = arr[Math.floor(Math.random() * arr.length)];
    const dist = distancesFrom(a, pool);
    const ideal = [...dist].filter(([, d]) => d >= 3 && d <= 8).map(([w]) => w);
    const fallback = [...dist].filter(([, d]) => d >= 2).map(([w]) => w);
    const choices = ideal.length ? ideal : fallback;
    if (choices.length) {
      s = a;
      t = choices[Math.floor(Math.random() * choices.length)];
      if (ideal.length) break;
    }
  }
  if (!s) { s = arr[0]; t = arr[arr.length - 1]; }

  gameState.startWord = s;
  gameState.targetWord = t;
  document.getElementById('puzzle-date-badge').innerText = "Free Play";
  initGameSession();
}

async function handleStartCustom() {
  const s = document.getElementById('input-custom-start').value.trim().toUpperCase();
  const t = document.getElementById('input-custom-target').value.trim().toUpperCase();

  if (!s || !t || s.length !== t.length) {
    showToast("Words must be equal length!", "shake");
    return;
  }

  hideModals();
  gameState.mode = 'freeplay';
  gameState.stretchy = false;
  gameState.wordLength = s.length;
  gameState.startWord = s;
  gameState.targetWord = t;
  
  await loadDictionary(gameState.wordLength);
  gameState.validWords.add(s);
  gameState.validWords.add(t);
  
  document.getElementById('puzzle-date-badge').innerText = "Custom Match";
  initGameSession();
}

function toggleGameMode() {
  if (!FEATURES.freeplay) return;
  if (gameState.mode === 'daily') {
    handleGenerateFreeplay();
  } else {
    loadPuzzleMode('daily');
  }
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

// --- Install as an app (PWA) ---------------------------------------------
let deferredInstallPrompt = null;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac

function setupInstall() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.log('Service worker not registered', e));
  }
  const btn = document.getElementById('btn-install');
  if (isStandalone()) return; // already running as an app

  // Android / desktop Chrome & Edge: the browser offers a real install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    btn.classList.add('hidden');
    showToast('Turdle installed! 🎉', 'pop');
  });

  // iPhone / iPad: no prompt API, so show Add to Home Screen instructions instead
  if (isIOS()) btn.classList.remove('hidden');
}

async function handleInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') document.getElementById('btn-install').classList.add('hidden');
    deferredInstallPrompt = null;
  } else {
    showModal('modal-install');
  }
}
