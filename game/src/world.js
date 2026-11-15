// Game state + one fixed simulation step. Pure logic: no window, no
// document, no audio — main.js wires those in, so Node can import this file
// for the headless smoke test.
import {
  ARENA, STEP, PLAYER, ENEMIES, WAVES, BOSS_TIME, ELITE_FROM, ELITE_EVERY,
  LIMITS, RUN, PICKUPS, xpForLevel,
} from './config.js';
import { createRandom } from './random.js';
import { fireWeapons, updateOrbitBlades, updateNovaRings } from './weapons.js';
import { createEnemy, updateEnemy } from './enemies.js';
import { offerLevelUpCards, gainXp, applyCard } from './levelup.js';
import { spawnBurst, spawnNumber, addTrauma, updateParticles } from './particles.js';

export function createWorld(seed, isDemo) {
  const rng = createRandom(seed);
  const stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({
      x: rng.range(0, ARENA.width),
      y: rng.range(0, ARENA.height),
      size: rng.pick([1, 1, 2]),
      alpha: rng.range(0.25, 0.8),
    });
  }
  const motes = [];
  for (let i = 0; i < 24; i++) {
    motes.push({
      x: rng.range(0, ARENA.width),
      y: rng.range(0, ARENA.height),
      size: rng.range(2, 5),
      alpha: rng.range(0.08, 0.25),
    });
  }
  return {
    seed,
    rng,
    demo: isDemo,
    time: 0,
    state: 'playing', // 'playing' | 'won' | 'lost'
    player: {
      x: ARENA.width / 2,
      y: ARENA.height / 2,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      speed: PLAYER.speed,
      radius: PLAYER.radius,
      pickupRadius: PLAYER.pickupRadius,
      level: 1,
      xp: 0,
      xpNext: xpForLevel(1),
      weapons: [{ id: PLAYER.startWeapon, level: 1, cooldown: 0, angle: 0 }],
      passives: { boots: 0, oil: 0, magnet: 0 },
      invuln: 0,
      facing: -Math.PI / 2,
    },
    enemies: [],
    projectiles: [],
    orbitBlades: [],
    novaRings: [],
    gems: [],
    pickups: [],
    particles: [],
    numbers: [],
    stats: { kills: 0, damageDealt: 0, gemsCollected: 0 },
    spawner: { timer: 1, eliteTimer: ELITE_FROM, shownBanners: new Set() },
    boss: null,
    bossSpawned: false,
    banner: null,
    shake: 0,
    levelUp: null,
    pendingLevels: 0,
    events: [],
    results: null,
    background: { stars, motes },
  };
}

function currentWave(world) {
  let row = WAVES[0];
  for (const candidate of WAVES) {
    if (world.time >= candidate.start) row = candidate;
    else break;
  }
  return row;
}

function spawnPosition(world) {
  const margin = 30;
  for (let attempt = 0; attempt < 3; attempt++) {
    const edge = world.rng.int(0, 3);
    let x;
    let y;
    if (edge === 0) { x = world.rng.range(0, ARENA.width); y = -margin; }
    else if (edge === 1) { x = world.rng.range(0, ARENA.width); y = ARENA.height + margin; }
    else if (edge === 2) { x = -margin; y = world.rng.range(0, ARENA.height); }
    else { x = ARENA.width + margin; y = world.rng.range(0, ARENA.height); }
    const dx = x - world.player.x;
    const dy = y - world.player.y;
    if (dx * dx + dy * dy > 200 * 200) return { x, y };
  }
  return { x: -margin, y: world.rng.range(0, ARENA.height) };
}

function spawnEnemyOfKind(world, kind, elite) {
  if (world.enemies.length >= LIMITS.maxEnemies) return;
  // Ranged and tank kinds must not accumulate: spitters keep their distance
  // and are rarely the nearest target, so an uncapped spitter count turns
  // into an undodgeable orb rain. Fall back to a moth when at the cap.
  if (kind === 'spitter' && world.enemies.filter((e) => e.kind === 'spitter').length >= 6) {
    kind = 'moth';
  }
  if (kind === 'brute' && world.enemies.filter((e) => e.kind === 'brute').length >= 4) {
    kind = 'moth';
  }
  const pos = spawnPosition(world);
  const minutes = world.time / 60;
  const enemy = createEnemy(kind, pos.x, pos.y, minutes, elite, world.rng);
  world.enemies.push(enemy);
}

function spawnWaveBatch(world) {
  const wave = currentWave(world);
  if (world.banner === null && wave.banner && !world.spawner.shownBanners.has(wave.start)) {
    world.spawner.shownBanners.add(wave.start);
    world.banner = { text: wave.banner, ttl: 2.5 };
    world.events.push('banner');
  }
  for (let i = 0; i < wave.batch; i++) {
    spawnEnemyOfKind(world, world.rng.pick(wave.kinds), false);
  }
}

function spawnBoss(world) {
  world.bossSpawned = true;
  const pos = { x: ARENA.width / 2, y: -80 };
  const boss = createEnemy('boss', pos.x, pos.y, world.time / 60, false, world.rng);
  world.enemies.push(boss);
  world.boss = boss;
  world.banner = { text: 'THE GLOOM HERALD', ttl: 3 };
  world.events.push('boss');
}

export function damageEnemy(world, enemy, amount, isCrit) {
  enemy.hp -= amount;
  enemy.flash = 0.06;
  world.stats.damageDealt += amount;
  spawnNumber(world, enemy.x, enemy.y - enemy.radius - 6, String(Math.round(amount)), isCrit ? '#ff9a3c' : '#ffd166', isCrit ? 18 : 13);
  spawnBurst(world, enemy.x, enemy.y, enemy.color, isCrit ? 6 : 3);
  world.events.push('hit');
  if (enemy.hp <= 0) killEnemy(world, enemy);
}

export function killEnemy(world, enemy) {
  enemy.dead = true;
  world.stats.kills += 1;
  spawnBurst(world, enemy.x, enemy.y, enemy.color, enemy.kind === 'brute' ? 14 : 8);
  world.events.push('die');
  // Gems.
  const large = enemy.kind === 'brute' || enemy.kind === 'boss' || enemy.elite;
  const gemCount = enemy.kind === 'boss' ? 10 : 1;
  for (let i = 0; i < gemCount; i++) {
    if (world.gems.length >= LIMITS.maxGems) break;
    world.gems.push({
      x: enemy.x + world.rng.range(-14, 14),
      y: enemy.y + world.rng.range(-14, 14),
      xp: large ? RUN.gemLargeXp : RUN.gemSmallXp,
      large,
      phase: world.rng.range(0, Math.PI * 2),
    });
  }
  // Splitter: two minis, no gems.
  if (enemy.kind === 'mite' && !enemy.mini) {
    for (let i = 0; i < 2; i++) {
      if (world.enemies.length >= LIMITS.maxEnemies) break;
      const mini = createEnemy('mite', enemy.x + world.rng.range(-10, 10), enemy.y + world.rng.range(-10, 10), world.time / 60, false, world.rng);
      mini.mini = true;
      mini.hp = 6;
      mini.maxHp = 6;
      mini.speed = 110;
      mini.damage = 5;
      mini.xp = 0;
      mini.radius = 8;
      world.enemies.push(mini);
    }
  }
  // Elites drop a random pickup.
  if (enemy.elite) {
    dropPickup(world, enemy.x, enemy.y, world.rng.pick(['heart', 'magnet', 'nova']));
  } else if (!enemy.mini && world.rng.chance(PICKUPS.heart.chance)) {
    dropPickup(world, enemy.x, enemy.y, 'heart');
  } else if (!enemy.mini && world.rng.chance(PICKUPS.magnet.chance)) {
    dropPickup(world, enemy.x, enemy.y, 'magnet');
  } else if (!enemy.mini && world.rng.chance(PICKUPS.nova.chance)) {
    dropPickup(world, enemy.x, enemy.y, 'nova');
  }
  if (enemy.kind === 'brute') addTrauma(world, 0.4);
  if (enemy.kind === 'boss') {
    addTrauma(world, 0.8);
    spawnBurst(world, enemy.x, enemy.y, '#ffffff', 80);
    world.boss = null;
    world.state = 'won';
    world.events.push('victory');
  }
}

function dropPickup(world, x, y, kind) {
  world.pickups.push({ x, y, kind, ttl: RUN.pickupLifetime });
}

function hurtPlayer(world, amount, fromX, fromY) {
  if (world.demo || world.player.invuln > 0) return;
  world.player.hp -= amount;
  world.player.invuln = PLAYER.invulnerableSeconds;
  // Knockback: a hit shoves the player away from the attacker, so a crowd
  // cannot pin the player in place and melt the whole HP bar at once.
  if (fromX !== undefined) {
    const dx = world.player.x - fromX;
    const dy = world.player.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    world.player.x = Math.max(PLAYER.radius, Math.min(ARENA.width - PLAYER.radius, world.player.x + (dx / dist) * 26));
    world.player.y = Math.max(PLAYER.radius, Math.min(ARENA.height - PLAYER.radius, world.player.y + (dy / dist) * 26));
  }
  spawnNumber(world, world.player.x, world.player.y - 24, `-${amount}`, '#ef4444', 16);
  spawnBurst(world, world.player.x, world.player.y, '#ef4444', 6);
  addTrauma(world, 0.25);
  world.events.push('hurt');
  if (world.player.hp <= 0) {
    world.player.hp = 0;
    world.state = 'lost';
    world.events.push('defeat');
  }
}

function separateEnemies(world) {
  const cell = 64;
  const grid = new Map();
  for (let i = 0; i < world.enemies.length; i++) {
    const enemy = world.enemies[i];
    const key = `${Math.floor(enemy.x / cell)},${Math.floor(enemy.y / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  for (let i = 0; i < world.enemies.length; i++) {
    const a = world.enemies[i];
    const cx = Math.floor(a.x / cell);
    const cy = Math.floor(a.y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = grid.get(`${gx},${gy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i) continue;
          const b = world.enemies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minDist = a.radius + b.radius - 2;
          const distSq = dx * dx + dy * dy;
          if (distSq > 0.01 && distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq);
            const push = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }
    }
  }
}

function updateProjectiles(world) {
  for (const projectile of world.projectiles) {
    projectile.x += projectile.vx * STEP;
    projectile.y += projectile.vy * STEP;
    projectile.ttl -= STEP;
    if (projectile.x < -40 || projectile.x > ARENA.width + 40
      || projectile.y < -40 || projectile.y > ARENA.height + 40) {
      projectile.ttl = 0;
    }
  }
  // Player projectiles vs enemies (and vs enemy orbs, which have 1 HP).
  for (const projectile of world.projectiles) {
    if (projectile.ttl <= 0 || projectile.from !== 'player') continue;
    for (const enemy of world.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - projectile.x;
      const dy = enemy.y - projectile.y;
      const reach = enemy.radius + projectile.radius;
      if (dx * dx + dy * dy < reach * reach) {
        const isCrit = world.rng.chance(RUN.critChance);
        damageEnemy(world, enemy, projectile.damage * (isCrit ? RUN.critMultiplier : 1), isCrit);
        projectile.pierce -= 1;
        if (projectile.pierce < 0) { projectile.ttl = 0; break; }
      }
    }
    if (projectile.ttl <= 0) continue;
    for (const orb of world.projectiles) {
      if (orb.from !== 'enemy' || orb.ttl <= 0) continue;
      const dx = orb.x - projectile.x;
      const dy = orb.y - projectile.y;
      if (dx * dx + dy * dy < (orb.radius + projectile.radius) ** 2) {
        orb.ttl = 0;
        spawnBurst(world, orb.x, orb.y, ENEMIES.spitter.color, 4);
        projectile.pierce -= 1;
        if (projectile.pierce < 0) { projectile.ttl = 0; break; }
      }
    }
  }
  // Enemy orbs vs the player.
  for (const projectile of world.projectiles) {
    if (projectile.ttl <= 0 || projectile.from !== 'enemy') continue;
    const dx = world.player.x - projectile.x;
    const dy = world.player.y - projectile.y;
    const reach = world.player.radius + projectile.radius;
    if (dx * dx + dy * dy < reach * reach) {
      projectile.ttl = 0;
      hurtPlayer(world, projectile.damage, projectile.x, projectile.y);
    }
  }
  world.projectiles = world.projectiles.filter((p) => p.ttl > 0);
}

function updateGemsAndPickups(world) {
  const player = world.player;
  const magnetRadius = player.pickupRadius * (1 + 0.3 * player.passives.magnet);
  for (const gem of world.gems) {
    const dx = player.x - gem.x;
    const dy = player.y - gem.y;
    const dist = Math.hypot(dx, dy);
    if (dist < magnetRadius + 40 && dist > 1) {
      const pull = 260 * STEP * (1 - dist / (magnetRadius + 40) + 0.3);
      gem.x += (dx / dist) * pull;
      gem.y += (dy / dist) * pull;
    }
    if (dist < player.pickupRadius) {
      gem.taken = true;
      world.stats.gemsCollected += 1;
      spawnBurst(world, gem.x, gem.y, '#ffd166', 2);
      world.events.push('gem');
      gainXp(world, gem.xp);
    }
  }
  world.gems = world.gems.filter((gem) => !gem.taken);
  for (const pickup of world.pickups) {
    pickup.ttl -= STEP;
    const dx = player.x - pickup.x;
    const dy = player.y - pickup.y;
    if (dx * dx + dy * dy < (player.radius + 14) ** 2) {
      pickup.taken = true;
      world.events.push('pickup');
      if (pickup.kind === 'heart') {
        player.hp = Math.min(player.maxHp, player.hp + PICKUPS.heart.heal);
        spawnNumber(world, player.x, player.y - 24, `+${PICKUPS.heart.heal}`, '#fb7185', 15);
      } else if (pickup.kind === 'magnet') {
        for (const gem of world.gems) {
          gem.x = player.x + world.rng.range(-20, 20);
          gem.y = player.y + world.rng.range(-20, 20);
        }
      } else if (pickup.kind === 'nova') {
        addTrauma(world, 0.7);
        spawnBurst(world, player.x, player.y, '#ff9a3c', 40);
        for (const enemy of world.enemies) {
          if (!enemy.dead) damageEnemy(world, enemy, PICKUPS.nova.damage, false);
        }
      }
    }
  }
  world.pickups = world.pickups.filter((pickup) => !pickup.taken && pickup.ttl > 0);
}

// One fixed 1/60 s simulation step. `move` is a normalised {x, y} vector.
export function updateWorld(world, move) {
  if (world.state !== 'playing') return;
  world.time += STEP;
  world.shake = Math.max(0, world.shake - STEP * 1.6);
  if (world.banner) {
    world.banner.ttl -= STEP;
    if (world.banner.ttl <= 0) world.banner = null;
  }
  const player = world.player;
  if (player.invuln > 0) player.invuln -= STEP;

  // Movement.
  const speed = player.speed * (1 + 0.12 * player.passives.boots);
  player.x = Math.max(player.radius, Math.min(ARENA.width - player.radius, player.x + move.x * speed * STEP));
  player.y = Math.max(player.radius, Math.min(ARENA.height - player.radius, player.y + move.y * speed * STEP));
  if (move.x !== 0 || move.y !== 0) player.facing = Math.atan2(move.y, move.x);

  // Spawner.
  if (!world.bossSpawned) {
    world.spawner.timer -= STEP;
    if (world.spawner.timer <= 0) {
      spawnWaveBatch(world);
      world.spawner.timer = currentWave(world).interval;
    }
    if (world.time >= ELITE_FROM) {
      world.spawner.eliteTimer -= STEP;
      if (world.spawner.eliteTimer <= 0) {
        world.spawner.eliteTimer = ELITE_EVERY;
        const wave = currentWave(world);
        spawnEnemyOfKind(world, world.rng.pick(wave.kinds), true);
        world.events.push('elite');
      }
    }
    if (world.time >= BOSS_TIME) spawnBoss(world);
  } else if (!world.boss) {
    // Boss fight: a slow trickle of moths/wisps only.
    world.spawner.timer -= STEP;
    if (world.spawner.timer <= 0) {
      world.spawner.timer = 2;
      spawnEnemyOfKind(world, world.rng.pick(['moth', 'wisp']), false);
    }
  }

  fireWeapons(world);
  updateOrbitBlades(world);
  updateNovaRings(world);

  for (const enemy of world.enemies) {
    if (!enemy.dead) updateEnemy(world, enemy);
  }
  separateEnemies(world);
  updateProjectiles(world);

  // Contact damage.
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const reach = player.radius + enemy.radius - 2;
    if (dx * dx + dy * dy < reach * reach) {
      hurtPlayer(world, enemy.damage, enemy.x, enemy.y);
      // Push the enemy back a little so it does not sit on the player.
      const dist = Math.max(1, Math.hypot(dx, dy));
      enemy.x -= (dx / dist) * 10;
      enemy.y -= (dy / dist) * 10;
      if (world.state !== 'playing') break;
    }
  }

  world.enemies = world.enemies.filter((enemy) => !enemy.dead);
  updateGemsAndPickups(world);
  updateParticles(world);

  // Level-ups queue: offer cards when the sim is running (main.js pauses).
  if (world.pendingLevels > 0 && !world.levelUp) {
    world.pendingLevels -= 1;
    world.levelUp = offerLevelUpCards(world);
    if (world.levelUp) world.events.push('levelup');
  }

  // Demo mode: the title backdrop never ends, and level-ups pick themselves.
  if (world.demo) {
    if (world.levelUp) {
      applyCard(world, world.levelUp.cards[0]);
      world.levelUp = null;
    }
    if (player.hp < player.maxHp) player.hp = player.maxHp;
    if (world.state !== 'playing') {
      world.state = 'playing';
      world.enemies = world.enemies.filter((e) => e.kind !== 'boss');
      world.boss = null;
      world.bossSpawned = false;
      world.time = Math.min(world.time, BOSS_TIME - 30);
    }
  }
}
