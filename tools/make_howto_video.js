// Makes the How to play video (videos/how-to-play.mp4) and its poster (videos/how-to-play.jpg).
//
//   docker compose up            (the game must be running on localhost:8080)
//   node tools/make_howto_video.js
//
// It plays two demo puzzles in the real game (in preview mode, so nothing is saved), with a fake
// puzzles.txt so the demos never give away a real puzzle. Narration comes from edge-tts, and the
// ending ("That's a Turdle!") uses the mascot cut-out, the That's Font Folks! font and the sound from
// the original clip (tools/assets). Square, 720x720.
//
// Needs: ffmpeg, edge-tts, playwright-core (npm i playwright-core) and a Chromium: set CHROME to its
// executable, or it uses Playwright's cached Chrome for Testing on macOS.
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = process.env.SITE || 'http://localhost:8080';
const SIZE = 540;      // CSS pixels of the square stage (captured at 2x, encoded at OUT)
const OUT = 720;
const VOICE = ['--voice', 'en-GB-RyanNeural', '--pitch=-15Hz'];
const DEMO_DATE = '2026-11-11';
const REGULAR = ['GUNK', 'PITS'];   // par 4, not in the schedule
const STRETCHY = ['CHUMP', 'NUN'];  // par 5
const ENDING_AUDIO = { from: 0.9, to: 5.3, volume: 0.6 }; // the words start ~1.0s in; it's louder than the voice

// key: [what Ryan says, caption on screen]
const LINES = {
  welcome: ['Welcome to Turdle!', 'Welcome to Turdle!'],
  rules: ['Change the start word into the target word, one letter at a time.', 'Change one letter at a time'],
  real: ['Every step has to be a real word.', 'Every step must be a real word'],
  green: ['Green letters are already in the right place.', 'Green = right letter, right place'],
  stretchy: ['On stretchy days, you can change, add, or remove a letter. Words can be three to seven letters long.',
    'Stretchy days: change, add or remove a letter (3–7 letters)'],
  par: ['Finish the game on par, and...', 'Finish on par and…'],
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'turdle-howto-'));
const b64 = f => fs.readFileSync(path.join(ROOT, f)).toString('base64');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const duration = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// 1. Narration
const voice = {};
for (const [key, [text]] of Object.entries(LINES)) {
  const file = path.join(tmp, `${key}.mp3`);
  execFileSync('edge-tts', [...VOICE, '--text', text, '--write-media', file], { stdio: 'ignore' });
  voice[key] = { file, secs: duration(file) };
}

const ORANGE_BG = 'radial-gradient(circle at 50% 42%, #ff9a3c 0%, #fb7a1e 55%, #ee5a0f 100%)';
const stage = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&display=swap" rel="stylesheet">
<style>
  @font-face { font-family: Folks; src: url(data:font/ttf;base64,${b64('tools/assets/thats-font-folks.ttf')}); }
  html, body { margin: 0; width: ${SIZE}px; height: ${SIZE}px; overflow: hidden; background: ${ORANGE_BG}; font-family: Fredoka, sans-serif; }
  .scene { position: absolute; inset: 0; opacity: 0; transition: opacity .35s; }
  .scene.on { opacity: 1; }
  .scene:not(.on) { pointer-events: none; }
  .face { position: absolute; left: 50%; transform: translateX(-50%); animation: bob 2.4s ease-in-out infinite; }
  @keyframes bob { 0%,100% { transform: translateX(-50%) translateY(0) rotate(-1deg); } 50% { transform: translateX(-50%) translateY(-8px) rotate(1deg); } }
  .folks { font-family: Folks, cursive; color: #fff; text-align: center; position: absolute; left: 0; right: 0;
    text-shadow: 0 4px 0 #8a3a10, 0 8px 18px rgba(0,0,0,.25); }
  #title .face { top: 150px; width: 330px; }
  #title .folks { top: 34px; font-size: 64px; }
  #end .face { top: 140px; width: 360px; }
  #end .folks { top: 30px; font-size: 66px; transform: scale(0) rotate(-12deg); }
  #end.on .folks.pop { animation: pop .55s cubic-bezier(.2,1.6,.4,1) forwards; }
  @keyframes pop { to { transform: scale(1) rotate(-4deg); } }
  #phone { position: absolute; left: 22px; top: 14px; width: 265px; height: 512px; border-radius: 26px; overflow: hidden;
    background: #fdf6ec; box-shadow: 0 0 0 6px #3b2a1e, 0 14px 30px rgba(0,0,0,.3); }
  #phone iframe { border: 0; width: 390px; height: 753px; transform: scale(.68); transform-origin: 0 0; }
  #side { position: absolute; left: 305px; right: 16px; top: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
  #side img { width: 150px; }
  #caption { background: #fdf6ec; color: #3b2a1e; border-radius: 22px; padding: 16px 18px; font-size: 25px; font-weight: 700; line-height: 1.2;
    text-align: center; box-shadow: 0 6px 0 #9c3f14; min-height: 90px; display: flex; align-items: center; justify-content: center; }
  #caption.swap { animation: swap .3s ease-out; }
  @keyframes swap { from { transform: scale(.85); opacity: 0; } }
</style></head><body>
  <div id="title" class="scene on"><img class="face" src="images/turdle-man-beard.png"><div class="folks">How to play</div></div>
  <div id="game" class="scene">
    <div id="phone"><iframe id="frame" src="about:blank"></iframe></div>
    <div id="side"><img src="images/turdle-man-beard.png"><div id="caption"></div></div>
  </div>
  <div id="end" class="scene"><img class="face" src="images/turdle-man-beard.png"><div class="folks">That's a Turdle!</div></div>
</body></html>`;

(async () => {
  const exe = process.env.CHROME || process.env.HOME +
    '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  const browser = await chromium.launch({ executablePath: exe });
  // Block the service worker so our fake puzzles.txt is what the game sees
  const ctx = await browser.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  let puzzle = REGULAR;
  await ctx.route('**/puzzles.txt*', r => r.fulfill({ body: `${DEMO_DATE}|${puzzle[0]}|${puzzle[1]}\n` }));
  await ctx.route('**/alerts.txt*', r => r.fulfill({ body: '' }));
  await ctx.route(`${SITE}/__howto.html`, r => r.fulfill({ contentType: 'text/html', body: stage }));
  const page = await ctx.newPage();
  await page.goto(`${SITE}/__howto.html`);
  await page.evaluate(() => document.fonts.ready);
  const game = page.frameLocator('#frame');

  async function loadPuzzle(pair) {
    puzzle = pair;
    await page.evaluate(src => new Promise(res => {
      const f = document.getElementById('frame'); f.onload = res; f.src = src;
    }), `${SITE}/?date=${DEMO_DATE}`);
    await game.locator('#kbd-row-1 button').first().waitFor();
    await page.frames()[1].addStyleTag({ content: `
      #preview-ribbon, header, #game-controls { display: none !important; }
      body { padding-top: 10px; }` });
    await sleep(800);
  }
  const key = k => game.getByRole('button', { name: k, exact: true });
  async function type(word, gap = 230) {
    for (const ch of word) { await key(ch).click({ delay: 80 }); await sleep(gap); }
  }
  async function submit() { await key('SUBMIT').click({ delay: 90 }); await sleep(700); }
  async function play(word) { await type(word); await sleep(150); await submit(); }

  // 2. Record: CDP screencast frames (only sent when something changes), timed on arrival with the
  //    same clock as the narration (the frames' own timestamps use a different clock)
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    frames.push({ t: Date.now() / 1000, data });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await loadPuzzle(REGULAR);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: SIZE * 2, maxHeight: SIZE * 2 });
  await sleep(300);
  const t0 = Date.now() / 1000;
  const audio = []; // [file, start seconds]
  const now = () => Date.now() / 1000 - t0;
  async function say(k) {
    audio.push([voice[k].file, now()]);
    await page.evaluate(text => {
      const c = document.getElementById('caption');
      c.textContent = text; c.classList.remove('swap'); void c.offsetWidth; c.classList.add('swap');
    }, LINES[k][1]);
    return voice[k].secs * 1000;
  }
  const scene = id => page.evaluate(id => document.querySelectorAll('.scene').forEach(s => s.classList.toggle('on', s.id === id)), id);

  // Title card
  await sleep(500);
  await sleep(await say('welcome') + 700);

  // Regular puzzle: GUNK → GUNS → (GUBS: not a word) GUTS → PUTS → PITS, on par
  await scene('game');
  let t = Date.now(), ms = await say('rules');
  await sleep(1800);
  await play('GUNS');
  await sleep(Math.max(0, ms - (Date.now() - t)) + 200);

  t = Date.now(); ms = await say('real');
  await play('GUBS');                       // "Not in word list"
  await sleep(500);
  for (let i = 0; i < 2; i++) { await key('Delete letter').click({ delay: 80 }); await sleep(160); }
  await sleep(Math.max(0, ms - (Date.now() - t)));
  await play('TS');                         // GUTS: T and S now match PITS

  t = Date.now(); ms = await say('green');
  await sleep(Math.max(0, ms - (Date.now() - t)) + 200);
  await play('PUTS');
  await play('PITS');
  await sleep(1100);                        // "Puzzle Complete!" toast

  // Stretchy puzzle: CHUMP → CHUM → HUM → GUM → GUN → NUN, on par
  await loadPuzzle(STRETCHY);
  t = Date.now(); ms = await say('stretchy');
  await sleep(1500);
  await play('CHUM');
  await play('HUM');
  await play('GUM');
  await sleep(Math.max(0, ms - (Date.now() - t)) + 200);
  await play('GUN');

  t = Date.now(); ms = await say('par');
  await type('NUN');
  await sleep(Math.max(0, ms - (Date.now() - t) - 400));
  await key('SUBMIT').click({ delay: 90 });
  await sleep(500);

  // Ending: "That's a Turdle!" with the original clip's sound
  await scene('end');
  const endAt = now();
  audio.push([path.join(ROOT, 'tools/assets/thats-a-turdle.m4a'), endAt, ENDING_AUDIO]);
  await sleep(100);
  await page.evaluate(() => document.querySelector('#end .folks').classList.add('pop'));
  await sleep((ENDING_AUDIO.to - ENDING_AUDIO.from) * 1000 - 100);
  const total = now();
  await cdp.send('Page.stopScreencast');
  await browser.close();

  // 3. Frames → video: each frame lasts until the next one (or the end)
  const shots = frames.filter(f => f.t >= t0);
  if (frames.some(f => f.t < t0)) shots.unshift({ ...frames.filter(f => f.t < t0).pop(), t: t0 });
  let list = '';
  shots.forEach((f, i) => {
    const file = path.join(tmp, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = i + 1 < shots.length ? shots[i + 1].t : t0 + total;
    list += `file '${file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
  });
  list += `file '${path.join(tmp, `f${String(shots.length - 1).padStart(5, '0')}.jpg`)}'\n`;
  fs.writeFileSync(path.join(tmp, 'frames.txt'), list);

  // 4. Audio: every clip placed at its start time
  const inputs = [], filters = [];
  audio.forEach(([file, at, trim], i) => {
    inputs.push('-i', file);
    const cut = trim ? `atrim=${trim.from}:${trim.to},asetpts=PTS-STARTPTS,volume=${trim.volume},` : '';
    const ms = Math.round(at * 1000);
    filters.push(`[${i + 1}:a]${cut}aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`);
  });
  filters.push(`${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length}:normalize=0,alimiter=limit=0.89,apad=whole_dur=${total.toFixed(3)}[aout]`);

  fs.mkdirSync(path.join(ROOT, 'videos'), { recursive: true });
  const outFile = path.join(ROOT, 'videos/how-to-play.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'frames.txt'), ...inputs,
    '-filter_complex', `[0:v]fps=30,scale=${OUT}:${OUT}:flags=lanczos,format=yuv420p[vout];${filters.join(';')}`,
    '-map', '[vout]', '-map', '[aout]', '-t', total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', outFile]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', outFile, '-frames:v', '1', '-q:v', '3',
    path.join(ROOT, 'videos/how-to-play.jpg')]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`videos/how-to-play.mp4: ${total.toFixed(1)}s, ${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
