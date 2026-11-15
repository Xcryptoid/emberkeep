// Headless smoke test: imports the pure-logic modules in Node and steps
// seeded runs, asserting the core loop works with no browser.
import { createWorld, updateWorld, damageEnemy } from '../game/src/world.js';
import { offerLevelUpCards, applyCard, gainXp } from '../game/src/levelup.js';

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failures += 1;
}

function autoPickLevelUps(world) {
  let count = 0;
  while (world.levelUp) {
    count += 1;
    applyCard(world, world.levelUp.cards[0]);
    world.levelUp = null;
    if (world.pendingLevels > 0) {
      world.pendingLevels -= 1;
      world.levelUp = offerLevelUpCards(world);
    }
  }
  return count;
}

function autopilotMove(world) {
  const player = world.player;
  const cx = 640;
  const cy = 360;
  const dx = player.x - cx;
  const dy = player.y - cy;
  const d = Math.hypot(dx, dy) || 1;
  let mx = -dy / d + ((260 - d) / 260) * (dx / d);
  let my = dx / d + ((260 - d) / 260) * (dy / d);
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

function runWorld(seed, seconds) {
  const world = createWorld(seed, false);
  let levelUps = 0;
  let maxEnemies = 0;
  for (let i = 0; i < seconds * 60; i++) {
    updateWorld(world, autopilotMove(world));
    levelUps += autoPickLevelUps(world);
    maxEnemies = Math.max(maxEnemies, world.enemies.length);
    if (world.state !== 'playing') break;
  }
  return { world, levelUps, maxEnemies };
}

// 1. A 120 s run: enemies spawn and die, XP accrues, gems are collected.
const run = runWorld(7, 120);
check('run steps 120 s without throwing', run.world.time > 60);
check('enemies spawned (peak > 5)', run.maxEnemies > 5);
check('kills happened', run.world.stats.kills > 0);
check('gems collected', run.world.stats.gemsCollected > 0);
check('level-ups offered and picked', run.levelUps > 0);
check('player level rose', run.world.player.level >= 2);

// 2. Level-up cards: exactly 3, distinct.
const cardWorld = createWorld(11, false);
gainXp(cardWorld, 100);
const offer = offerLevelUpCards(cardWorld);
check('level-up offers 3 cards', offer.cards.length === 3);
check('cards are distinct', new Set(offer.cards.map((c) => `${c.type}:${c.id}`)).size === 3);

// 3. Boss: spawns at 5:00, killing it wins the run.
const bossWorld = createWorld(99, false);
bossWorld.time = 299.5;
for (let i = 0; i < 300 && !bossWorld.boss; i++) {
  updateWorld(bossWorld, { x: 0, y: 0 });
}
check('boss spawns at 5:00', !!bossWorld.boss);
if (bossWorld.boss) {
  damageEnemy(bossWorld, bossWorld.boss, 99999, false);
  check('killing the boss wins the run', bossWorld.state === 'won');
}

// 4. Seeds matter: two seeds give different early runs.
const first = runWorld(1, 60);
const second = runWorld(2, 60);
const firstShape = JSON.stringify(first.world.enemies.slice(0, 5).map((e) => [e.kind, Math.round(e.x), Math.round(e.y)]));
const secondShape = JSON.stringify(second.world.enemies.slice(0, 5).map((e) => [e.kind, Math.round(e.x), Math.round(e.y)]));
check('different seeds give different runs', firstShape !== secondShape);

// 5. A demo world never ends (title backdrop).
const demo = createWorld(5, true);
for (let i = 0; i < 300 * 60; i++) {
  updateWorld(demo, { x: Math.cos(i / 60), y: Math.sin(i / 60) });
  autoPickLevelUps(demo);
}
check('demo world survives a full 5:00', demo.state === 'playing' && demo.time >= 299);

console.log(failures === 0 ? 'SMOKE OK' : `SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
