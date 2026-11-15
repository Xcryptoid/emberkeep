// Weapons: per-level stats, auto-fire, orbit blades, nova rings.
import { WEAPONS } from './config.js';
import { damageEnemy } from './world.js';

// Stats for `id` at `level`, from the config tables.
export function weaponStats(id, level) {
  const def = WEAPONS[id];
  const stats = { ...def.base };
  for (const [key, per] of Object.entries(def.perLevel)) {
    stats[key] = (stats[key] ?? 0) + per * (level - 1);
  }
  for (const [atLevel, bonus] of Object.entries(def.bonusAt)) {
    if (level >= Number(atLevel)) Object.assign(stats, bonus);
  }
  return stats;
}

function nearestEnemy(world, x, y, maxDist = Infinity) {
  let best = null;
  let bestDist = maxDist;
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    const dist = Math.hypot(enemy.x - x, enemy.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }
  return best;
}

function fireBolt(world, weapon, stats) {
  const target = nearestEnemy(world, world.player.x, world.player.y, 640);
  if (!target) return false;
  const baseAngle = Math.atan2(target.y - world.player.y, target.x - world.player.x);
  for (let i = 0; i < stats.count; i++) {
    const spread = (i - (stats.count - 1) / 2) * 0.16;
    const angle = baseAngle + spread;
    world.projectiles.push({
      x: world.player.x,
      y: world.player.y,
      vx: Math.cos(angle) * stats.speed,
      vy: Math.sin(angle) * stats.speed,
      damage: stats.damage,
      radius: 5,
      kind: 'bolt',
      from: 'player',
      pierce: stats.pierce,
      ttl: 1.6,
    });
  }
  return true;
}

function fireGaleFan(world, weapon, stats) {
  const target = nearestEnemy(world, world.player.x, world.player.y, 560);
  if (!target) return false;
  const baseAngle = Math.atan2(target.y - world.player.y, target.x - world.player.x);
  for (let i = 0; i < stats.shards; i++) {
    const spread = (i - (stats.shards - 1) / 2) * (stats.spread / Math.max(1, stats.shards - 1));
    const angle = baseAngle + spread;
    world.projectiles.push({
      x: world.player.x,
      y: world.player.y,
      vx: Math.cos(angle) * 460,
      vy: Math.sin(angle) * 460,
      damage: stats.damage,
      radius: 4,
      kind: 'shard',
      from: 'player',
      pierce: 0,
      ttl: 1.1,
    });
  }
  return true;
}

function fireNova(world, weapon, stats) {
  // Damage everything inside the final radius at once; the ring visual then
  // expands over 0.45 s (updateNovaRings only animates it).
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    const dx = enemy.x - world.player.x;
    const dy = enemy.y - world.player.y;
    if (dx * dx + dy * dy < stats.radius * stats.radius) {
      damageEnemy(world, enemy, stats.damage, false);
    }
  }
  world.novaRings.push({
    x: world.player.x,
    y: world.player.y,
    radius: 10,
    maxRadius: stats.radius,
    damage: stats.damage,
    ttl: 0.45,
    maxTtl: 0.45,
  });
  return true;
}

// Called once per simulation step: advance cooldowns and fire.
export function fireWeapons(world) {
  const dt = 1 / 60;
  for (const weapon of world.player.weapons) {
    weapon.cooldown -= dt;
    if (weapon.cooldown > 0) continue;
    const stats = weaponStats(weapon.id, weapon.level);
    let fired = false;
    if (weapon.id === 'emberBolt') fired = fireBolt(world, weapon, stats);
    else if (weapon.id === 'galeFan') fired = fireGaleFan(world, weapon, stats);
    else if (weapon.id === 'cinderNova') fired = fireNova(world, weapon, stats);
    // Lantern Orbit has no cooldown fire: its blades are continuous (see below).
    if (fired) {
      weapon.cooldown = weapon.id === 'cinderNova' ? stats.cooldown : 1 / stats.rate;
      if (weapon.id !== 'cinderNova') world.events.push('shoot');
      else world.events.push('nova');
    } else if (weapon.id !== 'lanternOrbit') {
      weapon.cooldown = 0.1; // No target: retry soon, do not spin the cooldown.
    }
  }
}

// Orbit blades: positions follow the player; damage on contact with a
// per-enemy re-hit timer stored on the enemy.
export function updateOrbitBlades(world) {
  const dt = 1 / 60;
  const owned = world.player.weapons.find((w) => w.id === 'lanternOrbit');
  world.orbitBlades = [];
  if (!owned) return;
  const stats = weaponStats('lanternOrbit', owned.level);
  owned.angle = (owned.angle || 0) + stats.spin * dt;
  for (let i = 0; i < stats.blades; i++) {
    const angle = owned.angle + (i / stats.blades) * Math.PI * 2;
    const bx = world.player.x + Math.cos(angle) * stats.radius;
    const by = world.player.y + Math.sin(angle) * stats.radius;
    world.orbitBlades.push({ x: bx, y: by, angle: angle + Math.PI / 2 });
    for (const enemy of world.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - bx;
      const dy = enemy.y - by;
      if (dx * dx + dy * dy < (enemy.radius + 14) ** 2) {
        enemy.orbitHitAt = enemy.orbitHitAt || 0;
        if (world.time - enemy.orbitHitAt >= 0.25) {
          enemy.orbitHitAt = world.time;
          damageEnemy(world, enemy, stats.damage, false);
        }
      }
    }
  }
}

// Nova rings expand visually; damage was applied at creation to everything
// inside the final radius, so this only animates the ring.
export function updateNovaRings(world) {
  const dt = 1 / 60;
  for (const ring of world.novaRings) {
    ring.ttl -= dt;
    const progress = 1 - Math.max(0, ring.ttl / ring.maxTtl);
    ring.radius = 10 + (ring.maxRadius - 10) * progress;
  }
  world.novaRings = world.novaRings.filter((ring) => ring.ttl > 0);
}
