// Emberkeep boot + fixed-step loop + screen state machine.
// Screens: title → playing ⇄ levelup / paused → victory | gameover.
import { ARENA, STEP } from './config.js';
import { input } from './input.js';
import { loadBest, saveBest, formatTime } from './storage.js';
import { createWorld, updateWorld } from './world.js';
import { applyCard, offerLevelUpCards } from './levelup.js';
import { drawFrame, uiRects } from './render.js';
import { audio } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);

// Screenshot staging (?shot=…) runs instead of the normal game.
if (params.get('shot')) {
  stageShot(ctx, params);
} else {
  boot();
}

function boot() {
  input.attach(canvas);
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'playing') setScreen('paused');
  });

  let screen = 'title';
  let world = createWorld(newSeed(), true);
  let best = loadBest();
  let newBest = false;

  function newSeed() {
    return (Math.random() * 2 ** 31) | 0;
  }

  function setScreen(next) {
    screen = next;
  }

  function startRun() {
    audio.unlock();
    audio.startMusic('normal');
    world = createWorld(newSeed(), false);
    newBest = false;
    setScreen('playing');
  }

  function finishRun(won) {
    const stats = {
      timeSec: Math.floor(world.time),
      kills: world.stats.kills,
      level: world.player.level,
      gems: world.stats.gemsCollected,
      damage: world.stats.damageDealt,
    };
    const record = best || { bestTimeSec: 0, bestKills: 0, bestLevel: 0, wins: 0, gamesPlayed: 0 };
    record.gamesPlayed += 1;
    if (won) record.wins += 1;
    if (stats.timeSec > record.bestTimeSec) { record.bestTimeSec = stats.timeSec; newBest = true; }
    if (stats.kills > record.bestKills) { record.bestKills = stats.kills; newBest = true; }
    if (stats.level > record.bestLevel) { record.bestLevel = stats.level; newBest = true; }
    best = record;
    saveBest(record);
    audio.stopMusic();
    audio.sfx(won ? 'victory' : 'defeat');
    world.results = { ...stats, newBest };
    setScreen(won ? 'victory' : 'gameover');
  }

  function resize() {
    const scale = Math.min(window.innerWidth / ARENA.width, window.innerHeight / ARENA.height);
    const width = Math.floor(ARENA.width * scale);
    const height = Math.floor(ARENA.height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const rect = canvas.getBoundingClientRect();
    input.setView(rect.width / ARENA.width, rect.left, rect.top);
  }

  function pointIn(rect) {
    return rect && input.mouse.x >= rect.x && input.mouse.x <= rect.x + rect.width
      && input.mouse.y >= rect.y && input.mouse.y <= rect.y + rect.height;
  }

  function handleClick() {
    if (!input.clicked()) return;
    audio.unlock();
    if (screen === 'title' && pointIn(uiRects.start)) startRun();
    else if (screen === 'playing') {
      if (pointIn(uiRects.mute)) audio.toggleMute();
      else if (pointIn(uiRects.pause)) setScreen('paused');
    } else if (screen === 'paused') {
      if (pointIn(uiRects.resume)) setScreen('playing');
      else if (pointIn(uiRects.restart)) startRun();
      else if (pointIn(uiRects.quitToTitle)) setScreen('title');
      else if (pointIn(uiRects.mute)) audio.toggleMute();
    } else if (screen === 'levelup') {
      const index = uiRects.cards.findIndex((rect) => pointIn(rect));
      if (index >= 0) pickCard(index);
    } else if ((screen === 'victory' || screen === 'gameover') && pointIn(uiRects.restart)) {
      startRun();
    }
  }

  function pickCard(index) {
    const cards = world.levelUp ? world.levelUp.cards : [];
    if (!cards[index]) return;
    audio.sfx('pick');
    applyCard(world, cards[index]);
    world.levelUp = null;
    if (world.pendingLevels > 0) {
      world.pendingLevels -= 1;
      world.levelUp = offerLevelUpCards(world);
      if (!world.levelUp) setScreen('playing');
    } else {
      setScreen('playing');
    }
  }

  function handleKeys() {
    if (input.pressed('Enter') || input.pressed('Space')) {
      if (screen === 'title' || screen === 'victory' || screen === 'gameover') startRun();
    }
    if (input.pressed('KeyM')) audio.toggleMute();
    if (input.pressed('KeyP') || input.pressed('Escape')) {
      if (screen === 'playing') setScreen('paused');
      else if (screen === 'paused') setScreen('playing');
    }
    if (screen === 'levelup') {
      if (input.pressed('Digit1')) pickCard(0);
      if (input.pressed('Digit2')) pickCard(1);
      if (input.pressed('Digit3')) pickCard(2);
    }
  }

  // Drain one frame of world events into sound.
  function playEvents() {
    for (const event of world.events) audio.sfx(event);
    world.events.length = 0;
  }

  // Title-screen demo: the world idles behind the title, driven by a slow
  // circling autopilot so the backdrop is alive.
  function demoInput() {
    const t = world.time;
    return {
      x: Math.cos(t * 0.35),
      y: Math.sin(t * 0.35),
    };
  }

  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min((now - last) / 1000, 0.1);
    last = now;
    handleKeys();
    handleClick();

    if (screen === 'playing') {
      accumulator += elapsed;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        updateWorld(world, input.moveVector());
        accumulator -= STEP;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
      playEvents();
      if (world.levelUp) setScreen('levelup');
      else if (world.state === 'won') finishRun(true);
      else if (world.state === 'lost') finishRun(false);
    } else if (screen === 'title') {
      accumulator += elapsed;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        updateWorld(world, demoInput());
        accumulator -= STEP;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
      world.events.length = 0;
    }

    drawFrame(ctx, {
      world,
      screen,
      best,
      newBest,
      formatTime,
      muted: audio.muted,
      mouseInCard: screen === 'levelup'
        ? uiRects.cards.findIndex((rect) => rect
          && input.mouse.x >= rect.x && input.mouse.x <= rect.x + rect.width
          && input.mouse.y >= rect.y && input.mouse.y <= rect.y + rect.height)
        : -1,
    });
    input.endFrame();
  }

  requestAnimationFrame(frame);
}
