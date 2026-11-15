// Deterministic screenshot scenes (?shot=<scene>&seed=<n>).
// Staging only: the real game path never reads ?shot except through main.js
// calling this module. Every scene simulates a fixed number of 1/60 s
// steps with a seeded RNG and a scripted autopilot, paints once, and sets
// window.__shotReady so the capture script knows the frame is final.
import { ARENA } from './config.js';
import { createWorld, updateWorld, damageEnemy } from './world.js';
import { applyCard, offerLevelUpCards } from './levelup.js';
import { drawFrame } from './render.js';
import { formatTime } from './storage.js';

const FAKE_BEST = { bestTimeSec: 252, bestKills: 214, bestLevel: 11, wins: 2, gamesPlayed: 9 };

// Autopilot: kite in a wide circle around the arena centre so the pack
// trails behind in a line; dodge only when something gets very close;
// grab gems only when the coast is clear. It plays cautiously — a human
// kites better, so this is a lower bound on how far a decent player gets.
function autopilotMove(world) {
  const player = world.player;
  const cx = ARENA.width / 2;
  const cy = ARENA.height / 2;
  const dx = player.x - cx;
  const dy = player.y - cy;
  const d = Math.hypot(dx, dy) || 1;
  // Tangential direction (counter-clockwise), pulled toward radius 260.
  let mx = -dy / d + ((260 - d) / 260) * (dx / d);
  let my = dx / d + ((260 - d) / 260) * (dy / d);
  // Dodge: if an enemy is within 70 px, flee from it.
  let nearest = null;
  let nearestDist = 70;
  for (const enemy of world.enemies) {
    const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = enemy;
    }
  }
  if (nearest) {
    const fx = player.x - nearest.x;
    const fy = player.y - nearest.y;
    const fd = Math.hypot(fx, fy) || 1;
    mx = fx / fd;
    my = fy / fd;
  } else {
    let closest = Infinity;
    for (const enemy of world.enemies) {
      closest = Math.min(closest, Math.hypot(enemy.x - player.x, enemy.y - player.y));
    }
    if (closest > 220) {
      let gem = null;
      let gemDist = Infinity;
      for (const candidate of world.gems) {
        const dist = Math.hypot(candidate.x - player.x, candidate.y - player.y);
        if (dist < gemDist) {
          gemDist = dist;
          gem = candidate;
        }
      }
      if (gem) {
        const gx = gem.x - player.x;
        const gy = gem.y - player.y;
        const gd = Math.hypot(gx, gy) || 1;
        mx = gx / gd;
        my = gy / gd;
      }
    }
  }
  const len = Math.hypot(mx, my) || 1;
  return { x: mx / len, y: my / len };
}

// Staging picks like a decent player would: crowd-clear weapons first,
// then weapon levels, then passives. (The real game lets the human choose.)
function pickBestCard(cards) {
  const score = (card) => {
    if (card.type === 'newWeapon' && card.id === 'lanternOrbit') return 100;
    if (card.type === 'newWeapon' && card.id === 'cinderNova') return 90;
    if (card.type === 'weapon' && card.id === 'lanternOrbit') return 80;
    if (card.type === 'weapon' && card.id === 'cinderNova') return 70;
    if (card.type === 'weapon') return 60;
    if (card.type === 'newWeapon') return 50;
    if (card.type === 'passive' && card.id === 'oil') return 40;
    if (card.type === 'passive' && card.id === 'magnet') return 30;
    if (card.type === 'passive') return 20;
    return 10;
  };
  return [...cards].sort((a, b) => score(b) - score(a))[0];
}

// One staged step: simulate, auto-pick the best level-up card, and keep
// the player alive (staging only — the real game never does this).
function stagedStep(world) {
  updateWorld(world, autopilotMove(world));
  while (world.levelUp) {
    applyCard(world, pickBestCard(world.levelUp.cards));
    world.levelUp = null;
    if (world.pendingLevels > 0) {
      world.pendingLevels -= 1;
      world.levelUp = offerLevelUpCards(world);
    }
  }
  if (world.player.hp < 50) world.player.hp = 100;
}

function simulateSeconds(world, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (world.state !== 'playing') break;
    stagedStep(world);
  }
}

function paint(ctx, world, screen, results) {
  if (results) world.results = results;
  drawFrame(ctx, {
    world,
    screen,
    best: FAKE_BEST,
    newBest: !!results?.newBest,
    formatTime,
    muted: false,
    mouseInCard: -1,
  });
  window.__shotReady = true;
}

export function stageShot(ctx, params) {
  const scene = params.get('shot');
  const seed = parseInt(params.get('seed') || '7', 10);

  if (scene === 'start') {
    const world = createWorld(seed, true);
    simulateSeconds(world, 12);
    paint(ctx, world, 'title');
    return;
  }

  const world = createWorld(seed, false);
  if (scene === 'play') {
    simulateSeconds(world, 55);
    paint(ctx, world, 'playing');
    return;
  }
  if (scene === 'late') {
    simulateSeconds(world, 260);
    paint(ctx, world, 'playing');
    return;
  }
  if (scene === 'win') {
    simulateSeconds(world, 300);
    // The boss is up (or the run already ended — re-stage if it did).
    if (world.state === 'playing' && world.boss) {
      damageEnemy(world, world.boss, 99999, false);
      stagedStep(world);
    }
    if (world.state === 'won') {
      paint(ctx, world, 'victory', {
        timeSec: 300,
        kills: world.stats.kills,
        level: world.player.level,
        gems: world.stats.gemsCollected,
        damage: world.stats.damageDealt,
        newBest: true,
      });
      return;
    }
    // Fallback: the autopilot died before the boss — paint the game-over
    // screen instead of a broken victory frame.
    paint(ctx, world, 'gameover', {
      timeSec: Math.floor(world.time),
      kills: world.stats.kills,
      level: world.player.level,
      gems: world.stats.gemsCollected,
      damage: world.stats.damageDealt,
      newBest: false,
    });
    return;
  }
  throw new Error(`unknown shot scene: ${scene}`);
}
