// Enemy definitions + steering behaviours. Pure logic, no DOM.
import { ARENA, ENEMIES } from './config.js';

let nextId = 1;

export function createEnemy(kind, x, y, minutes, elite, rng) {
  const def = ENEMIES[kind];
  const hpScale = 1 + 0.09 * minutes;
  const enemy = {
    id: nextId,
    kind,
    x,
    y,
    hp: Math.round(def.hp * hpScale * (elite ? 3 : 1)),
    maxHp: Math.round(def.hp * hpScale * (elite ? 3 : 1)),
    speed: def.speed * (elite ? 1.2 : 1),
    radius: def.radius,
    damage: def.damage + (elite ? 4 : 0),
    xp: def.xp,
    color: def.color,
    behaviour: def.behaviour,
    elite: !!elite,
    mini: false,
    angle: 0,
    phase: rng.range(0, Math.PI * 2),
    flash: 0,
    dead: false,
    shootTimer: rng.range(1, 2.2),
    burstTimer: 6,
    summonTimer: 12,
  };
  nextId += 1;
  return enemy;
}

function steerToward(enemy, targetX, targetY, speed, dt) {
  const dx = targetX - enemy.x;
  const dy = targetY - enemy.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  enemy.x += (dx / dist) * speed * dt;
  enemy.y += (dy / dist) * speed * dt;
  enemy.angle = Math.atan2(dy, dx);
}

export function updateEnemy(world, enemy) {
  const dt = 1 / 60;
  const player = world.player;
  if (enemy.flash > 0) enemy.flash -= dt;

  if (enemy.behaviour === 'chase' || enemy.behaviour === 'splitter') {
    steerToward(enemy, player.x, player.y, enemy.speed, dt);
  } else if (enemy.behaviour === 'wobble') {
    steerToward(enemy, player.x, player.y, enemy.speed, dt);
    const perpendicular = Math.sin(world.time * 6 + enemy.phase) * 40 * dt;
    enemy.x += -Math.sin(enemy.angle) * perpendicular;
    enemy.y += Math.cos(enemy.angle) * perpendicular;
  } else if (enemy.behaviour === 'keepDistance') {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 280) {
      steerToward(enemy, player.x, player.y, enemy.speed, dt);
    } else if (dist < 240 && dist > 1) {
      enemy.x -= (dx / dist) * enemy.speed * dt;
      enemy.y -= (dy / dist) * enemy.speed * dt;
    } else {
      // Strafe slowly around the player while in range.
      enemy.x += -dy * 0.25 * dt;
      enemy.y += dx * 0.25 * dt;
    }
    enemy.shootTimer -= dt;
    if (enemy.shootTimer <= 0 && dist < 420) {
      enemy.shootTimer = 2.2;
      const speed = 140;
      world.projectiles.push({
        x: enemy.x,
        y: enemy.y,
        vx: (dx / Math.max(1, dist)) * speed,
        vy: (dy / Math.max(1, dist)) * speed,
        damage: enemy.damage,
        radius: 6,
        kind: 'orb',
        from: 'enemy',
        pierce: 0,
        ttl: 5,
      });
      world.events.push('spit');
    }
  } else if (enemy.behaviour === 'boss') {
    steerToward(enemy, player.x, player.y, enemy.speed, dt);
    enemy.burstTimer -= dt;
    if (enemy.burstTimer <= 0) {
      enemy.burstTimer = 6;
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + enemy.phase;
        world.projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * 130,
          vy: Math.sin(angle) * 130,
          damage: 12,
          radius: 7,
          kind: 'orb',
          from: 'enemy',
          pierce: 0,
          ttl: 6,
        });
      }
      world.events.push('bossBurst');
    }
    enemy.summonTimer -= dt;
    if (enemy.summonTimer <= 0) {
      enemy.summonTimer = 12;
      for (let i = 0; i < 4; i++) {
        const angle = world.rng.range(0, Math.PI * 2);
        const wisp = createEnemy('wisp', enemy.x + Math.cos(angle) * 90, enemy.y + Math.sin(angle) * 90, world.time / 60, false, world.rng);
        if (world.enemies.length < 90) world.enemies.push(wisp);
      }
      world.events.push('summon');
    }
  }

  // Clamp inside the arena (enemies spawn outside, then walk in).
  enemy.x = Math.max(-60, Math.min(ARENA.width + 60, enemy.x));
  enemy.y = Math.max(-60, Math.min(ARENA.height + 60, enemy.y));
}
