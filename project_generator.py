import os

# Define project structure and file contents
files = {
    "README.md": """# 💩 Turdle - Daily Word Shift Puzzle

A client-side daily Word Ladder puzzle web app powered by open-source dictionaries and dynamic pathfinding algorithms (BFS).
""",

    "puzzles.txt": """# Date (YYYY-MM-DD) | Start Word | Target Word
2026-11-11|BEER|POOP
2026-11-12|WARM|COLD
2026-11-13|FLIP|FLOP
2026-11-14|CATS|DOGS
2026-11-15|SMILE|FROWN
2026-11-16|PLANET|ROCKET
""",

    "index.html": """<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Word Ladder - Daily Puzzle Game</title>
  
  <!-- Tailwind CSS via CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  
  <!-- Custom Stylesheet -->
  <link rel="stylesheet" href="css/styles.css">
  
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#f0f9ff',
              400: '#38bdf8',
              500: '#06b6d4',
              600: '#0891b2',
              900: '#0f172a',
            }
          },
          animation: {
            'pop': 'pop 0.15s ease-in-out',
            'shake': 'shake 0.4s ease-in-out',
            'bounce-short': 'bounce 0.5s ease-in-out 2'
          },
          keyframes: {
            pop: {
              '0%': { transform: 'scale(0.95)' },
              '50%': { transform: 'scale(1.05)' },
              '100%': { transform: 'scale(1)' },
            },
            shake: {
              '0%, 100%': { transform: 'translateX(0)' },
              '20%, 60%': { transform: 'translateX(-6px)' },
              '40%, 80%': { transform: 'translateX(6px)' },
            }
          }
        }
      }
    };
  </script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans antialiased selection:bg-cyan-500 selection:text-white">

  <!-- Header Navigation -->
  <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
    <div class="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 font-black text-xl text-white">
          W
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">LADDER</h1>
          <p class="text-[10px] text-slate-400 font-medium tracking-widest uppercase">Word Shift Puzzle</p>
        </div>
      </div>

      <!-- Header Controls -->
      <div class="flex items-center space-x-1 sm:space-x-2">
        <button id="btn-mode-toggle" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition flex items-center space-x-1.5">
          <i data-lucide="zap" class="w-3.5 h-3.5"></i>
          <span id="mode-label">Daily</span>
        </button>

        <button id="btn-help" class="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition" title="How to Play">
          <i data-lucide="help-circle" class="w-5 h-5"></i>
        </button>
        <button id="btn-stats" class="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Statistics">
          <i data-lucide="bar-chart-2" class="w-5 h-5"></i>
        </button>
        <button id="btn-settings" class="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Settings & Free Play">
          <i data-lucide="settings" class="w-5 h-5"></i>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Game Container -->
  <main class="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col justify-between items-center">
    
    <!-- Target Header Info -->
    <div class="w-full text-center my-2">
      <div class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 mb-2">
        <span id="puzzle-date-badge">Today's Ladder</span>
        <span>•</span>
        <span id="word-len-badge">4 Letters</span>
        <span>•</span>
        <span id="par-badge" class="text-cyan-400 font-semibold">Par: --</span>
      </div>

      <!-- Target Words Banner -->
      <div class="flex items-center justify-center space-x-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div class="text-center">
          <div class="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Start</div>
          <div id="start-word-display" class="text-2xl sm:text-3xl font-black text-cyan-400 tracking-widest font-mono">----</div>
        </div>

        <div class="flex flex-col items-center px-2">
          <i data-lucide="arrow-right" class="w-6 h-6 text-slate-500"></i>
          <span id="step-counter" class="text-xs font-bold text-slate-400 mt-1">0 steps</span>
        </div>

        <div class="text-center">
          <div class="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Target</div>
          <div id="target-word-display" class="text-2xl sm:text-3xl font-black text-emerald-400 tracking-widest font-mono">----</div>
        </div>
      </div>
    </div>

    <!-- Toast Notification Container -->
    <div id="toast-container" class="fixed top-20 z-50 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center space-y-2"></div>

    <!-- Word Grid Container -->
    <div id="grid-scroll-area" class="w-full flex-1 flex flex-col items-center justify-start my-3 overflow-y-auto max-h-[380px] space-y-2 pr-1">
      <div id="ladder-grid" class="flex flex-col items-center space-y-2 w-full">
        <!-- Dynamic Word Rows Injected Here -->
      </div>
    </div>

    <!-- In-Game Action Bar -->
    <div id="game-controls" class="w-full flex items-center justify-between px-2 mb-3">
      <button id="btn-undo" class="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center space-x-1 transition disabled:opacity-40">
        <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
        <span>Undo</span>
      </button>

      <div class="flex items-center space-x-2">
        <button id="btn-hint" class="px-3 py-1.5 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg flex items-center space-x-1 transition">
          <i data-lucide="lightbulb" class="w-3.5 h-3.5"></i>
          <span>Hint</span>
        </button>
        <button id="btn-giveup" class="px-3 py-1.5 text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg flex items-center space-x-1 transition">
          <i data-lucide="flag" class="w-3.5 h-3.5"></i>
          <span>Give Up</span>
        </button>
      </div>
    </div>

    <!-- On-Screen Virtual Keyboard -->
    <div id="keyboard" class="w-full max-w-md select-none">
      <div id="kbd-row-1" class="flex justify-center space-x-1 mb-1.5"></div>
      <div id="kbd-row-2" class="flex justify-center space-x-1 mb-1.5"></div>
      <div id="kbd-row-3" class="flex justify-center space-x-1"></div>
    </div>
  </main>

  <!-- MODAL: How To Play -->
  <div id="modal-help" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
      <button class="modal-close absolute top-4 right-4 text-slate-400 hover:text-white">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
      <h3 class="text-xl font-bold text-slate-100 mb-3 flex items-center space-x-2">
        <i data-lucide="help-circle" class="w-5 h-5 text-cyan-400"></i>
        <span>How to Play</span>
      </h3>
      <div class="text-sm text-slate-300 space-y-3 leading-relaxed">
        <p>Change the <strong>Start Word</strong> into the <strong>Target Word</strong> by altering <strong>exactly one letter</strong> at a time.</p>
        <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
          <div class="flex items-center space-x-2 font-mono font-bold text-sm">
            <span class="px-2 py-1 bg-slate-800 text-slate-400 rounded">C A T S</span>
            <i data-lucide="arrow-right" class="w-4 h-4 text-slate-600"></i>
            <span class="px-2 py-1 bg-slate-800 text-cyan-400 rounded">C O T S</span>
          </div>
          <div class="flex items-center space-x-2 font-mono font-bold text-sm">
            <span class="px-2 py-1 bg-slate-800 text-cyan-400 rounded">C O T S</span>
            <i data-lucide="arrow-right" class="w-4 h-4 text-slate-600"></i>
            <span class="px-2 py-1 bg-slate-800 text-emerald-400 rounded">D O T S</span>
          </div>
        </div>
        <ul class="list-disc list-inside space-y-1 text-slate-400 text-xs">
          <li>Every step must be a valid English word.</li>
          <li>Solve the ladder in as few steps as possible!</li>
        </ul>
      </div>
      <button class="modal-close mt-5 w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-sm transition">Got it!</button>
    </div>
  </div>

  <!-- MODAL: Stats -->
  <div id="modal-stats" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
      <button class="modal-close absolute top-4 right-4 text-slate-400 hover:text-white">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
      <h3 class="text-xl font-bold text-slate-100 mb-4 flex items-center space-x-2">
        <i data-lucide="bar-chart-2" class="w-5 h-5 text-cyan-400"></i>
        <span>Statistics</span>
      </h3>
      
      <div class="grid grid-cols-4 gap-2 mb-5 text-center">
        <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
          <div id="stat-played" class="text-xl font-black text-slate-100">0</div>
          <div class="text-[10px] text-slate-400 font-medium uppercase">Played</div>
        </div>
        <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
          <div id="stat-winrate" class="text-xl font-black text-slate-100">0%</div>
          <div class="text-[10px] text-slate-400 font-medium uppercase">Win %</div>
        </div>
        <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
          <div id="stat-streak" class="text-xl font-black text-cyan-400">0</div>
          <div class="text-[10px] text-slate-400 font-medium uppercase">Current</div>
        </div>
        <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
          <div id="stat-maxstreak" class="text-xl font-black text-emerald-400">0</div>
          <div class="text-[10px] text-slate-400 font-medium uppercase">Max Streak</div>
        </div>
      </div>

      <button id="btn-share" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition flex items-center justify-center space-x-2">
        <i data-lucide="share-2" class="w-4 h-4"></i>
        <span>Share Results</span>
      </button>
    </div>
  </div>

  <!-- MODAL: Settings & Free Play -->
  <div id="modal-settings" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
      <button class="modal-close absolute top-4 right-4 text-slate-400 hover:text-white">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
      <h3 class="text-xl font-bold text-slate-100 mb-4 flex items-center space-x-2">
        <i data-lucide="settings" class="w-5 h-5 text-cyan-400"></i>
        <span>Settings & Freeplay</span>
      </h3>

      <div class="space-y-4">
        <!-- Free Play Generator -->
        <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-cyan-400">Free Play Generator</h4>
          <div>
            <label class="block text-xs text-slate-400 mb-1">Select Word Length</label>
            <div class="grid grid-cols-4 gap-2">
              <button data-len="3" class="btn-len-select p-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-700 text-slate-300">3</button>
              <button data-len="4" class="btn-len-select p-2 bg-cyan-600 text-white text-xs font-bold rounded-lg border border-cyan-500">4</button>
              <button data-len="5" class="btn-len-select p-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-700 text-slate-300">5</button>
              <button data-len="6" class="btn-len-select p-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-700 text-slate-300">6</button>
            </div>
          </div>
          <button id="btn-generate-freeplay" class="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition">
            Generate Random Puzzle
          </button>
        </div>

        <!-- Custom Match -->
        <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-cyan-400">Custom Match</h4>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] text-slate-400">START WORD</label>
              <input type="text" id="input-custom-start" placeholder="WARM" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 font-mono uppercase">
            </div>
            <div>
              <label class="text-[10px] text-slate-400">TARGET WORD</label>
              <input type="text" id="input-custom-target" placeholder="COLD" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 font-mono uppercase">
            </div>
          </div>
          <button id="btn-start-custom" class="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 text-xs font-bold rounded-lg transition">
            Play Custom Pair
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- JavaScript Entry -->
  <script src="js/app.js"></script>
</body>
</html>
""",

    "css/styles.css": """/* Scrollbar custom styles */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #0f172a;
}
::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #475569;
}

/* Subtle glow effect for current row tiles */
.tile-glow {
  box-shadow: 0 0 15px rgba(6, 182, 212, 0.35);
}
""",

    "js/app.js": """// Dynamic Game State & BFS Engine
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
        const lines = txt.split('\\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
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
      const parsed = txt.split(/\\r?\\n/).map(w => w.trim().toUpperCase()).filter(w => w.length === length);
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
  const text = `Word Ladder (${gameState.mode})\\n${gameState.startWord} ➔ ${gameState.targetWord}\\nSolved in ${steps} steps (Par: ${gameState.parMoves})!\\n\\nPlay online!`;
  
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
""",

    "dictionaries/dictionary-3.txt": """CAT
DOG
COT
DOT
GOD
COG
LOG
BAG
BUG
BOG
BAT
BAR
BAD
BED
RED
RAT
RAM
RAG
RUN
SUN
FUN
FAN
FIN
PIN
PEN
PET
POT
POP
TOP
TIP
TAP
MAP
MAN
MAT
MAD
MUD
MUG
HUG
HOT
HAT
HIT
FIT
FAT
FAR
FOR
FOX
BOX
BOY
TOY
DAY
WAY
PAY
SAY
SEE
SEA
TEA
TEN
TAN
TIN
WIN
WET
""",

    "dictionaries/dictionary-4.txt": """BEER
PEER
POOR
POOP
WARM
WARD
CARD
CORD
COLD
CATS
COTS
DOTS
DOGS
FLIP
FLOP
FLAP
FLAG
FLAT
SLAP
SLIP
SHIP
SHOP
SHOT
SHOE
FOOT
FOOD
FOLD
GOLD
GOLF
WOLF
TALK
WALK
WORK
WORD
WOOD
BOOT
BOAT
COAT
COAL
COOL
FOOL
FAIL
FALL
BALL
BELL
BELT
BEST
BEAT
BEAR
DEAR
DOOR
DEEP
KEEP
KING
RING
SING
SONG
LONG
LOVE
LIVE
LIKE
LAKE
MAKE
TAKE
TIME
TIDE
SIDE
SITE
SIZE
SAME
GAME
NAME
""",

    "dictionaries/dictionary-5.txt": """SMILE
SLIME
SHINE
WHITE
WRITE
WRONG
FROWN
CROWN
BROWN
BRAWN
BRAIN
GRAIN
TRAIN
TRAIL
TRIAL
SMART
START
STARE
SHARE
SHORE
SHORT
SPORT
SPOUT
SHOUT
SHRINE
PLANT
PLANE
PLATE
PLACE
PEACE
PEACH
BEACH
BENCH
BUNCH
LUNCH
MATCH
WATCH
CATCH
PITCH
PATCH
PATH
EARTH
HEART
""",

    "dictionaries/dictionary-6.txt": """PLANET
PLANTS
PLANES
PLATES
PLACES
PEACES
PEACHES
RACKET
ROCKET
POCKET
PACKET
JACKET
MARKET
MARBLE
STABLE
TABLES
TABLET
TALENT
SILENT
LISTEN
SPRING
STRING
STRONG
STROKE
STRIKE
STREAM
SCREAM
SCRAPE
SCRAPS
STRAPS
STRIPE
STRIPS
"""
}

def build_project():
    print("🚀 Extracting Word Ladder Game Project...")
    for filepath, content in files.items():
        dir_path = os.path.dirname(filepath)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  [✓] Created {filepath}")
    print("\n✨ Done! All project files have been built successfully.")

if __name__ == "__main__":
    build_project()