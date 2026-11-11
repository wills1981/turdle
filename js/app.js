// Dynamic Game State & BFS Engine
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
  validWords: new Set(),
  isGameOver: false,
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
  loadStats();
  buildKeyboardUI();
  setupEventListeners();
  await loadPuzzleMode('daily');
  lucide.createIcons();
};

function setupEventListeners() {
  document.getElementById('btn-mode-toggle').addEventListener('click', toggleGameMode);
  document.getElementById('btn-help').addEventListener('click', () => showModal('modal-help'));
  document.getElementById('btn-stats').addEventListener('click', () => { updateStatsUI(); showModal('modal-stats'); });
  document.getElementById('btn-settings').addEventListener('click', () => showModal('modal-settings'));
  
  document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', hideModals));
  
  document.getElementById('btn-undo').addEventListener('click', handleUndo);
  document.getElementById('btn-hint').addEventListener('click', handleHint);
  document.getElementById('btn-giveup').addEventListener('click', handleGiveUp);
  document.getElementById('btn-share').addEventListener('click', handleShare);
  
  document.getElementById('btn-generate-freeplay').addEventListener('click', handleGenerateFreeplay);
  document.getElementById('btn-start-custom').addEventListener('click', handleStartCustom);

  document.querySelectorAll('.btn-len-select').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-len-select').forEach(b => {
        b.className = "btn-len-select p-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-700 text-slate-300";
      });
      e.target.className = "btn-len-select p-2 bg-cyan-600 text-white text-xs font-bold rounded-lg border border-cyan-500";
      gameState.freeplayLength = parseInt(e.target.dataset.len);
    });
  });

  window.addEventListener('keydown', handlePhysicalKeyboard);
}

// Data Fetching & Loaders
async function loadPuzzleMode(mode) {
  gameState.mode = mode;
  gameState.isGameOver = false;
  gameState.history = [];
  gameState.currentBuffer = "";

  document.getElementById('mode-label').innerText = mode === 'daily' ? 'Daily' : 'Free Play';

  if (mode === 'daily') {
    const todayStr = new Date().toISOString().split('T')[0];
    let dailyPair = null;

    try {
      const res = await fetch('puzzles.txt');
      if (res.ok) {
        const txt = await res.text();
        const lines = txt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        for (const line of lines) {
          const [d, s, t] = line.split('|');
          if (d === todayStr) {
            dailyPair = { start: s.toUpperCase(), target: t.toUpperCase() };
            break;
          }
        }
      }
    } catch (e) {
      console.log("Using built-in puzzle schedule");
    }

    if (!dailyPair) {
      const dayIdx = Math.abs(hashCode(todayStr)) % DEFAULT_SCHEDULE.length;
      dailyPair = DEFAULT_SCHEDULE[dayIdx];
    }

    gameState.startWord = dailyPair.start;
    gameState.targetWord = dailyPair.target;
    gameState.wordLength = dailyPair.start.length;
    document.getElementById('puzzle-date-badge').innerText = `Daily (${todayStr})`;
  }

  await loadDictionary(gameState.wordLength);
  initGameSession();
}

async function loadDictionary(length) {
  let wordArr = EMBEDDED_WORDS[length] || [];
  try {
    const res = await fetch(`dictionaries/dictionary-${length}.txt`);
    if (res.ok) {
      const txt = await res.text();
      const parsed = txt.split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(w => w.length === length);
      if (parsed.length > 0) wordArr = parsed;
    }
  } catch (e) {
    console.log(`Using fallback words for length ${length}`);
  }

  gameState.validWords = new Set(wordArr);
  gameState.validWords.add(gameState.startWord);
  gameState.validWords.add(gameState.targetWord);
}

function initGameSession() {
  gameState.history = [gameState.startWord];
  gameState.currentBuffer = "";
  
  const analysis = solveBFS(gameState.startWord, gameState.targetWord, gameState.validWords);
  gameState.parMoves = analysis.optimalSteps;
  gameState.optimalPaths = analysis.paths;

  document.getElementById('start-word-display').innerText = gameState.startWord;
  document.getElementById('target-word-display').innerText = gameState.targetWord;
  document.getElementById('word-len-badge').innerText = `${gameState.wordLength} Letters`;
  document.getElementById('par-badge').innerText = `Par: ${gameState.parMoves !== null ? gameState.parMoves : '--'}`;
  
  renderGrid();
  updateStepCounter();
}

// Graph Pathfinder Algorithm (BFS)
function solveBFS(start, target, dictSet) {
  if (start === target) return { optimalSteps: 0, paths: [[start]] };
  
  let queue = [[start]];
  let visited = new Set([start]);
  let shortestLen = null;
  let paths = [];

  while (queue.length > 0) {
    let levelSize = queue.length;
    let levelVisited = new Set();

    for (let i = 0; i < levelSize; i++) {
      let path = queue.shift();
      let curr = path[path.length - 1];

      if (curr === target) {
        if (shortestLen === null) shortestLen = path.length - 1;
        if (path.length - 1 === shortestLen) paths.push(path);
        continue;
      }

      if (shortestLen !== null && path.length - 1 >= shortestLen) continue;

      for (let word of dictSet) {
        if (!visited.has(word) && isOneDiff(curr, word)) {
          levelVisited.add(word);
          queue.push([...path, word]);
        }
      }
    }

    for (let w of levelVisited) visited.add(w);
    if (paths.length > 0) break;
  }

  return { optimalSteps: shortestLen, paths };
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

// User Action Handlers
function handleKeyInput(key) {
  if (gameState.isGameOver) return;

  if (key === 'BACKSPACE') {
    if (gameState.currentBuffer.length > 0) {
      gameState.currentBuffer = gameState.currentBuffer.slice(0, -1);
      renderGrid();
    }
    return;
  }

  if (key === 'ENTER') {
    submitWord();
    return;
  }

  if (/^[A-Z]$/.test(key)) {
    if (gameState.currentBuffer.length < gameState.wordLength) {
      gameState.currentBuffer += key;
      renderGrid();
    }
  }
}

function submitWord() {
  const word = gameState.currentBuffer;
  if (word.length !== gameState.wordLength) {
    showToast("Not enough letters", "shake");
    return;
  }

  const lastWord = gameState.history[gameState.history.length - 1];
  
  if (!isOneDiff(lastWord, word)) {
    showToast("Must change exactly 1 letter", "shake");
    return;
  }

  if (!gameState.validWords.has(word)) {
    showToast("Not in word list", "shake");
    return;
  }

  gameState.history.push(word);
  gameState.currentBuffer = "";
  renderGrid();
  updateStepCounter();

  if (word === gameState.targetWord) {
    gameState.isGameOver = true;
    const playerSteps = gameState.history.length - 1;
    const diff = playerSteps - gameState.parMoves;

    let msg = "Perfect!";
    if (diff > 0) msg = `${diff} step(s) over par!`;

    recordWin(diff);
    showToast(`🎉 Puzzle Complete! ${msg}`, "pop");
    setTimeout(() => { showModal('modal-stats'); updateStatsUI(); }, 1200);
  }
}

function handleUndo() {
  if (gameState.history.length > 1 && !gameState.isGameOver) {
    gameState.history.pop();
    gameState.currentBuffer = "";
    renderGrid();
    updateStepCounter();
  }
}

function handleHint() {
  if (gameState.isGameOver) return;
  const curr = gameState.history[gameState.history.length - 1];
  const sol = solveBFS(curr, gameState.targetWord, gameState.validWords);

  if (sol.paths.length > 0 && sol.paths[0].length > 1) {
    const nextWord = sol.paths[0][1];
    showToast(`Try moving towards: ${nextWord}`, "pop");
  } else {
    showToast("No valid route found from here!", "shake");
  }
}

function handleGiveUp() {
  if (gameState.isGameOver) return;
  if (gameState.optimalPaths.length > 0) {
    const path = gameState.optimalPaths[0].join(" ➔ ");
    showToast(`Solution: ${path}`, "pop");
  }
  gameState.isGameOver = true;
  recordLoss();
}

// UI Rendering
function renderGrid() {
  const grid = document.getElementById('ladder-grid');
  grid.innerHTML = "";

  gameState.history.forEach((word, idx) => {
    const isStart = idx === 0;
    const isTarget = word === gameState.targetWord;
    grid.appendChild(createRowElement(word, isStart ? "start" : isTarget ? "target" : "history"));
  });

  if (!gameState.isGameOver) {
    const padded = gameState.currentBuffer.padEnd(gameState.wordLength, " ");
    grid.appendChild(createRowElement(padded, "active"));
  }

  const area = document.getElementById('grid-scroll-area');
  area.scrollTop = area.scrollHeight;
}

function createRowElement(wordStr, type) {
  const row = document.createElement('div');
  row.className = "flex space-x-1 sm:space-x-2 justify-center w-full animate-pop";

  for (let i = 0; i < gameState.wordLength; i++) {
    const char = wordStr[i] || "";
    const tile = document.createElement('div');
    
    let baseClass = "w-10 h-10 sm:w-12 sm:h-12 border-2 rounded-xl flex items-center justify-center font-mono font-bold text-lg sm:text-xl uppercase transition";

    if (type === "start") {
      baseClass += " bg-slate-900 border-cyan-500/50 text-cyan-400";
    } else if (type === "target") {
      baseClass += " bg-emerald-950/60 border-emerald-500 text-emerald-400";
    } else if (type === "history") {
      baseClass += " bg-slate-900/90 border-slate-700 text-slate-200";
    } else if (type === "active") {
      baseClass += char !== " " ? " bg-slate-800 border-cyan-400 text-white tile-glow" : " bg-slate-950/40 border-slate-800 text-transparent";
    }

    tile.className = baseClass;
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
        btn.className = "key-btn h-12 px-2.5 sm:px-3 bg-cyan-600 hover:bg-cyan-500 rounded text-xs font-bold text-white transition";
        btn.innerText = "SUBMIT";
      } else if (k === 'BACKSPACE') {
        btn.className = "key-btn h-12 px-2.5 sm:px-3 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold text-slate-300 transition flex items-center justify-center";
        btn.innerHTML = `<i data-lucide="delete" class="w-4 h-4"></i>`;
      } else {
        btn.className = "key-btn h-12 flex-1 max-w-[38px] bg-slate-800 hover:bg-slate-700 rounded text-sm sm:text-base font-bold text-slate-200 transition";
        btn.innerText = k;
      }
      btn.addEventListener('click', () => handleKeyInput(k));
      container.appendChild(btn);
    });
  });
}

function handlePhysicalKeyboard(e) {
  if (e.key === 'Backspace') handleKeyInput('BACKSPACE');
  else if (e.key === 'Enter') handleKeyInput('ENTER');
  else if (/^[a-zA-Z]$/.test(e.key)) handleKeyInput(e.key.toUpperCase());
}

// Helpers & Analytics
function showToast(msg, anim = "") {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `px-4 py-2 bg-slate-800 border border-slate-700 text-cyan-300 font-semibold text-xs rounded-xl shadow-2xl transition animate-${anim}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModals() { document.querySelectorAll('.fixed').forEach(m => m.classList.add('hidden')); }

function loadStats() {
  const saved = localStorage.getItem('word_ladder_stats');
  if (saved) userStats = JSON.parse(saved);
}

function saveStats() {
  localStorage.setItem('word_ladder_stats', JSON.stringify(userStats));
}

function recordWin(parDiff) {
  userStats.played++;
  userStats.wins++;
  userStats.streak++;
  if (userStats.streak > userStats.maxStreak) userStats.maxStreak = userStats.streak;
  
  const key = parDiff <= 0 ? "Exact Par" : `+${parDiff}`;
  userStats.diffDistribution[key] = (userStats.diffDistribution[key] || 0) + 1;
  saveStats();
}

function recordLoss() {
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
}

function handleShare() {
  const steps = gameState.history.length - 1;
  const text = `Word Ladder (${gameState.mode})\n${gameState.startWord} ➔ ${gameState.targetWord}\nSolved in ${steps} steps (Par: ${gameState.parMoves})!\n\nPlay online!`;
  
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  
  showToast("Results copied to clipboard!", "pop");
}

async function handleGenerateFreeplay() {
  hideModals();
  gameState.mode = 'freeplay';
  gameState.wordLength = gameState.freeplayLength;
  await loadDictionary(gameState.wordLength);

  const arr = Array.from(gameState.validWords);
  let s = arr[Math.floor(Math.random() * arr.length)];
  let t = arr[Math.floor(Math.random() * arr.length)];

  let sol = solveBFS(s, t, gameState.validWords);
  let tries = 0;
  while ((!sol.optimalSteps || sol.optimalSteps < 2) && tries < 50) {
    s = arr[Math.floor(Math.random() * arr.length)];
    t = arr[Math.floor(Math.random() * arr.length)];
    sol = solveBFS(s, t, gameState.validWords);
    tries++;
  }

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
