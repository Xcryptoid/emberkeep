// All canvas drawing: background, entities, HUD, banners, screens.
// HUD is drawn in canvas (no DOM HUD) so screenshots capture it exactly.
// uiRects is filled on every draw with the clickable rects of the current
// screen; main.js hit-tests mouse clicks against it.
import { ARENA, PALETTE, WEAPONS, WEAPON_ORDER } from './config.js';

export const uiRects = {
  start: null,
  mute: null,
  pause: null,
  resume: null,
  restart: null,
  quitToTitle: null,
  cards: [],
};

const FONT = '"Trebuchet MS", Verdana, sans-serif';

function text(ctx, str, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, fraction, fill, background) {
  ctx.fillStyle = background;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (fraction > 0) {
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, Math.max(h, w * Math.min(1, fraction)), h, h / 2);
    ctx.fill();
  }
}

function glowCircle(ctx, x, y, radius, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawFrame(ctx, view) {
  const { world, screen } = view;
  ctx.save();
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);

  // Screen shake (trauma decays in world update; render only reads it).
  const trauma = world.shake || 0;
  if (trauma > 0.01 && screen !== 'title') {
    const magnitude = trauma * trauma * 14;
    ctx.translate(
      (world.rng.next() * 2 - 1) * magnitude,
      (world.rng.next() * 2 - 1) * magnitude,
    );
  }

  drawBackground(ctx, world);
  drawGems(ctx, world);
  drawPickups(ctx, world);
  drawEnemies(ctx, world);
  drawPlayer(ctx, world);
  drawProjectiles(ctx, world);
  drawParticles(ctx, world);
  drawNumbers(ctx, world);
  if (screen !== 'title') drawHud(ctx, view);
  drawBanner(ctx, world);

  ctx.restore();

  uiRects.cards = [];
  uiRects.start = null;
  uiRects.resume = null;
  uiRects.restart = null;
  uiRects.quitToTitle = null;
  if (screen === 'title') drawTitle(ctx, view);
  else if (screen === 'levelup') drawLevelUp(ctx, view);
  else if (screen === 'paused') drawPaused(ctx, view);
  else if (screen === 'victory') drawEndScreen(ctx, view, true);
  else if (screen === 'gameover') drawEndScreen(ctx, view, false);

  // Low-HP edge pulse.
  if (screen === 'playing' && world.player.hp > 0 && world.player.hp < 30) {
    const pulse = 0.12 + 0.1 * Math.sin(performance.now() / 150);
    ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, ARENA.width - 10, ARENA.height - 10);
  }
}

function drawBackground(ctx, world) {
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(-20, -20, ARENA.width + 40, ARENA.height + 40);
  const bg = world.background;
  ctx.fillStyle = '#e8ecff';
  for (const star of bg.stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;
  for (const mote of bg.motes) {
    glowCircle(ctx, mote.x, mote.y, mote.size, PALETTE.ember, mote.alpha);
  }
  // Lantern glow around the player.
  const glow = ctx.createRadialGradient(
    world.player.x, world.player.y, 10,
    world.player.x, world.player.y, 260,
  );
  glow.addColorStop(0, 'rgba(255, 154, 60, 0.14)');
  glow.addColorStop(1, 'rgba(255, 154, 60, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  // Arena border.
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, ARENA.width - 2, ARENA.height - 2);
}

function drawGems(ctx, world) {
  for (const gem of world.gems) {
    const bob = Math.sin(world.time * 3 + gem.phase) * 2;
    if (gem.large) {
      ctx.save();
      ctx.translate(gem.x, gem.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    } else {
      glowCircle(ctx, gem.x, gem.y + bob, 7, PALETTE.gold, 0.35);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(gem.x, gem.y + bob, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPickups(ctx, world) {
  for (const pickup of world.pickups) {
    const blink = pickup.ttl < 3 ? (Math.sin(world.time * 10) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    const bob = Math.sin(world.time * 4 + pickup.x) * 3;
    if (pickup.kind === 'heart') {
      ctx.fillStyle = PALETTE.heart;
      ctx.beginPath();
      ctx.arc(pickup.x - 4, pickup.y + bob - 2, 5, 0, Math.PI * 2);
      ctx.arc(pickup.x + 4, pickup.y + bob - 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(pickup.x - 8, pickup.y + bob);
      ctx.lineTo(pickup.x, pickup.y + bob + 9);
      ctx.lineTo(pickup.x + 8, pickup.y + bob);
      ctx.closePath();
      ctx.fill();
    } else if (pickup.kind === 'magnet') {
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y + bob, 8, Math.PI, 0);
      ctx.stroke();
    } else {
      ctx.fillStyle = PALETTE.ember;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? 11 : 5;
        const px = pickup.x + Math.cos(angle) * r;
        const py = pickup.y + bob + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawEnemyShape(ctx, enemy, time) {
  const { x, y } = enemy;
  ctx.fillStyle = enemy.color;
  if (enemy.kind === 'moth') {
    const flap = Math.sin(time * 10 + enemy.phase) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(enemy.angle);
    ctx.fillStyle = enemy.color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(-8, -6 - flap * 4, 9, 5, -0.5, 0, Math.PI * 2);
    ctx.ellipse(8, -6 - flap * 4, 9, 5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (enemy.kind === 'wisp') {
    glowCircle(ctx, x, y, enemy.radius + 6, enemy.color, 0.3);
    ctx.beginPath();
    ctx.arc(x, y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === 'spitter') {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + time;
      const r = i % 2 === 0 ? enemy.radius + 5 : enemy.radius;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (enemy.kind === 'mite') {
    ctx.beginPath();
    ctx.arc(x - 5, y - 3, 7, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 3, 7, 0, Math.PI * 2);
    ctx.arc(x, y + 5, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === 'brute') {
    ctx.beginPath();
    ctx.arc(x, y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.moveTo(x - enemy.radius + 4, y - enemy.radius + 8);
    ctx.lineTo(x - enemy.radius - 6, y - enemy.radius - 8);
    ctx.lineTo(x - enemy.radius + 12, y - enemy.radius + 2);
    ctx.closePath();
    ctx.moveTo(x + enemy.radius - 4, y - enemy.radius + 8);
    ctx.lineTo(x + enemy.radius + 6, y - enemy.radius - 8);
    ctx.lineTo(x + enemy.radius - 12, y - enemy.radius + 2);
    ctx.closePath();
    ctx.fill();
  } else {
    // Boss: crowned wisp.
    glowCircle(ctx, x, y, enemy.radius + 18, enemy.color, 0.35);
    ctx.beginPath();
    ctx.arc(x, y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(x - 30, y - enemy.radius + 6);
    ctx.lineTo(x - 30, y - enemy.radius - 18);
    ctx.lineTo(x - 15, y - enemy.radius - 2);
    ctx.lineTo(x, y - enemy.radius - 22);
    ctx.lineTo(x + 15, y - enemy.radius - 2);
    ctx.lineTo(x + 30, y - enemy.radius - 18);
    ctx.lineTo(x + 30, y - enemy.radius + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - 14, y - 8, 6, 0, Math.PI * 2);
    ctx.arc(x + 14, y - 8, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (enemy.elite) {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, enemy.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Damage flash.
  if (enemy.flash > 0) {
    ctx.globalAlpha = Math.min(1, enemy.flash * 10);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Mini HP bar for brutes, elites and the boss.
  if ((enemy.kind === 'brute' || enemy.elite) && enemy.kind !== 'boss' && enemy.hp < enemy.maxHp) {
    bar(ctx, x - 18, y - enemy.radius - 12, 36, 5, enemy.hp / enemy.maxHp, '#ef4444', 'rgba(0,0,0,0.5)');
  }
}

function drawEnemies(ctx, world) {
  for (const enemy of world.enemies) drawEnemyShape(ctx, enemy, world.time);
}

function drawPlayer(ctx, world) {
  const player = world.player;
  if (player.invuln > 0 && Math.floor(world.time * 12) % 2 === 0) return; // blink while invulnerable
  glowCircle(ctx, player.x, player.y, 26, PALETTE.ember, 0.4);
  ctx.fillStyle = PALETTE.ember;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 6, 0, Math.PI * 2);
  ctx.fill();
  // Facing tick.
  ctx.strokeStyle = PALETTE.bone;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + Math.cos(player.facing) * 18, player.y + Math.sin(player.facing) * 18);
  ctx.stroke();
  // Orbit blades are drawn as part of the weapon visuals in drawProjectiles.
}

function drawProjectiles(ctx, world) {
  for (const projectile of world.projectiles) {
    if (projectile.kind === 'bolt') {
      glowCircle(ctx, projectile.x, projectile.y, 9, PALETTE.ember, 0.4);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (projectile.kind === 'shard') {
      ctx.save();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      ctx.fillStyle = PALETTE.teal;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, -4);
      ctx.lineTo(-5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (projectile.kind === 'orb') {
      glowCircle(ctx, projectile.x, projectile.y, 10, PALETTE.spitter, 0.4);
      ctx.fillStyle = PALETTE.spitter;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Orbit blades.
  for (const blade of world.orbitBlades) {
    ctx.save();
    ctx.translate(blade.x, blade.y);
    ctx.rotate(blade.angle);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.quadraticCurveTo(0, -10, -12, 0);
    ctx.quadraticCurveTo(0, 10, 14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Nova rings.
  for (const ring of world.novaRings) {
    ctx.globalAlpha = Math.max(0, ring.ttl / ring.maxTtl) * 0.8;
    ctx.strokeStyle = PALETTE.ember;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawParticles(ctx, world) {
  for (const particle of world.particles) {
    ctx.globalAlpha = Math.max(0, particle.ttl / particle.maxTtl);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function drawNumbers(ctx, world) {
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const number of world.numbers) {
    ctx.globalAlpha = Math.max(0, number.ttl / number.maxTtl);
    ctx.fillStyle = number.color;
    ctx.font = `bold ${number.size}px ${FONT}`;
    ctx.fillText(number.text, number.x, number.y);
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx, view) {
  const { world, formatTime } = view;
  const player = world.player;
  // HP bar, top-left.
  bar(ctx, 16, 16, 260, 20, player.hp / player.maxHp, '#f97316', 'rgba(0,0,0,0.55)');
  text(ctx, `${Math.ceil(player.hp)} / ${player.maxHp}`, 146, 27, 13, PALETTE.bone, 'center');
  // Timer, top-centre.
  const timeLeft = Math.max(0, 300 - world.time);
  const timerColor = world.boss ? PALETTE.boss : (timeLeft <= 30 ? PALETTE.gold : PALETTE.bone);
  text(ctx, formatTime(world.time), ARENA.width / 2, 28, 30, timerColor, 'center');
  // Kills + level, top-right.
  text(ctx, `☠ ${world.stats.kills}`, ARENA.width - 130, 24, 16, PALETTE.bone, 'right');
  text(ctx, `Lv ${player.level}`, ARENA.width - 130, 46, 16, PALETTE.gold, 'right');
  // Mute + pause buttons.
  drawSmallButton(ctx, ARENA.width - 52, 14, 34, 'M', view.muted);
  uiRects.mute = { x: ARENA.width - 52, y: 14, width: 34, height: 34 };
  drawSmallButton(ctx, ARENA.width - 96, 14, 34, 'II', false);
  uiRects.pause = { x: ARENA.width - 96, y: 14, width: 34, height: 34 };
  // Boss bar.
  if (world.boss) {
    const boss = world.boss;
    bar(ctx, ARENA.width / 2 - 300, 56, 600, 14, boss.hp / boss.maxHp, PALETTE.boss, 'rgba(0,0,0,0.55)');
    text(ctx, 'THE GLOOM HERALD', ARENA.width / 2, 78, 13, '#c4b5fd', 'center');
  }
  // XP bar, bottom.
  bar(ctx, 16, ARENA.height - 30, ARENA.width - 32, 14, player.xp / player.xpNext, PALETTE.gold, 'rgba(0,0,0,0.55)');
  text(ctx, `Lv ${player.level}   ${player.xp} / ${player.xpNext} XP`, ARENA.width / 2, ARENA.height - 22, 12, PALETTE.bone, 'center');
  // Weapon slots above the XP bar.
  let slotX = 16;
  for (const weaponId of WEAPON_ORDER) {
    const owned = player.weapons.find((w) => w.id === weaponId);
    const size = 40;
    const y = ARENA.height - 82;
    ctx.fillStyle = owned ? 'rgba(255, 209, 102, 0.16)' : 'rgba(255,255,255,0.05)';
    roundRect(ctx, slotX, y, size, size, 6);
    ctx.fill();
    ctx.strokeStyle = owned ? WEAPONS[weaponId].color : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, slotX, y, size, size, 6);
    ctx.stroke();
    if (owned) {
      ctx.fillStyle = WEAPONS[weaponId].color;
      ctx.beginPath();
      ctx.arc(slotX + size / 2, y + size / 2 - 4, 8, 0, Math.PI * 2);
      ctx.fill();
      for (let pip = 0; pip < owned.level; pip++) {
        ctx.fillStyle = PALETTE.gold;
        ctx.fillRect(slotX + 6 + pip * 6, y + size - 9, 4, 4);
      }
    }
    slotX += size + 8;
  }
}

function drawSmallButton(ctx, x, y, size, label, active) {
  ctx.fillStyle = active ? 'rgba(46, 196, 182, 0.35)' : 'rgba(255,255,255,0.08)';
  roundRect(ctx, x, y, size, size, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, size, size, 6);
  ctx.stroke();
  text(ctx, label, x + size / 2, y + size / 2 + 1, 14, PALETTE.bone, 'center');
}

function drawBanner(ctx, world) {
  if (!world.banner) return;
  const alpha = Math.min(1, world.banner.ttl / 0.5, (2.5 - world.banner.ttl) / 0.5 + 1);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  text(ctx, world.banner.text, ARENA.width / 2, 150, 30, PALETTE.gold, 'center');
  ctx.globalAlpha = 1;
}

function drawTitle(ctx, view) {
  const { world, best } = view;
  ctx.fillStyle = 'rgba(10, 11, 28, 0.72)';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  text(ctx, 'EMBERKEEP', ARENA.width / 2, 200, 84, PALETTE.ember, 'center');
  text(ctx, 'Last Light of the Hollow', ARENA.width / 2, 262, 26, PALETTE.gold, 'center');
  text(ctx, 'Survive until dawn — 5:00 — and slay the Gloom Herald.', ARENA.width / 2, 320, 20, PALETTE.bone, 'center');
  text(ctx, 'Move: WASD / arrows · Pause: P · Mute: M · Pick upgrades: click or 1 / 2 / 3', ARENA.width / 2, 360, 16, '#9aa0c3', 'center');
  if (best && best.gamesPlayed > 0) {
    text(ctx, `Best: ${view.formatTime(best.bestTimeSec)} · ${best.bestKills} kills · Lv ${best.bestLevel} · Victories: ${best.wins}`, ARENA.width / 2, 398, 16, PALETTE.teal, 'center');
  }
  // Start button.
  const button = { x: ARENA.width / 2 - 130, y: 440, width: 260, height: 56 };
  ctx.fillStyle = PALETTE.ember;
  roundRect(ctx, button.x, button.y, button.width, button.height, 10);
  ctx.fill();
  text(ctx, 'BEGIN THE NIGHT', ARENA.width / 2, button.y + 29, 22, '#1a1206', 'center');
  uiRects.start = button;
  text(ctx, 'or press Enter', ARENA.width / 2, 522, 14, '#9aa0c3', 'center');
}

function drawLevelUp(ctx, view) {
  const { world } = view;
  ctx.fillStyle = 'rgba(10, 11, 28, 0.66)';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  text(ctx, 'LEVEL UP!', ARENA.width / 2, 150, 44, PALETTE.gold, 'center');
  text(ctx, 'Choose one — the night does not wait.', ARENA.width / 2, 196, 18, PALETTE.bone, 'center');
  const cards = world.levelUp ? world.levelUp.cards : [];
  const cardWidth = 280;
  const cardHeight = 200;
  const gap = 30;
  const totalWidth = cards.length * cardWidth + (cards.length - 1) * gap;
  let x = (ARENA.width - totalWidth) / 2;
  const y = 250;
  cards.forEach((card, index) => {
    const hover = view.mouseInCard === index;
    ctx.fillStyle = hover ? 'rgba(255, 209, 102, 0.22)' : 'rgba(255, 255, 255, 0.07)';
    roundRect(ctx, x, y, cardWidth, cardHeight, 12);
    ctx.fill();
    ctx.strokeStyle = card.color || PALETTE.gold;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, cardWidth, cardHeight, 12);
    ctx.stroke();
    text(ctx, card.name, x + cardWidth / 2, y + 44, 20, PALETTE.bone, 'center');
    text(ctx, card.blurb, x + cardWidth / 2, y + 88, 14, '#c9cde8', 'center');
    if (card.levelText) text(ctx, card.levelText, x + cardWidth / 2, y + 122, 14, PALETTE.gold, 'center');
    text(ctx, `[ ${index + 1} ]`, x + cardWidth / 2, y + 166, 14, '#9aa0c3', 'center');
    uiRects.cards[index] = { x, y, width: cardWidth, height: cardHeight };
    x += cardWidth + gap;
  });
}

function drawPaused(ctx, view) {
  ctx.fillStyle = 'rgba(10, 11, 28, 0.7)';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  text(ctx, 'PAUSED', ARENA.width / 2, 220, 48, PALETTE.bone, 'center');
  const resume = { x: ARENA.width / 2 - 130, y: 300, width: 260, height: 52 };
  const restart = { x: ARENA.width / 2 - 130, y: 368, width: 260, height: 52 };
  const quit = { x: ARENA.width / 2 - 130, y: 436, width: 260, height: 52 };
  drawMenuButton(ctx, resume, 'RESUME');
  drawMenuButton(ctx, restart, 'RESTART RUN');
  drawMenuButton(ctx, quit, 'BACK TO TITLE');
  uiRects.resume = resume;
  uiRects.restart = restart;
  uiRects.quitToTitle = quit;
}

function drawMenuButton(ctx, rect, label) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 10);
  ctx.stroke();
  text(ctx, label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1, 18, PALETTE.bone, 'center');
}

function drawEndScreen(ctx, view, won) {
  const { world } = view;
  const results = world.results || { timeSec: 0, kills: 0, level: 1, gems: 0, damage: 0, newBest: false };
  ctx.fillStyle = 'rgba(10, 11, 28, 0.78)';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  text(ctx, won ? 'THE LIGHT HOLDS' : 'THE LIGHT GOES OUT', ARENA.width / 2, 170, 52, won ? PALETTE.gold : PALETTE.danger, 'center');
  text(ctx, won ? 'Dawn breaks over the Hollow. The Herald is slain.' : 'The Hollow takes the lantern… this night.', ARENA.width / 2, 224, 18, PALETTE.bone, 'center');
  const lines = [
    ['Time survived', view.formatTime(results.timeSec)],
    ['Level reached', `Lv ${results.level}`],
    ['Creatures slain', `${results.kills}`],
    ['Embers gathered', `${results.gems}`],
    ['Damage dealt', `${results.damage}`],
  ];
  let y = 290;
  for (const [label, value] of lines) {
    text(ctx, label, ARENA.width / 2 - 140, y, 18, '#9aa0c3', 'left');
    text(ctx, value, ARENA.width / 2 + 140, y, 18, PALETTE.bone, 'right');
    y += 38;
  }
  if (results.newBest) {
    text(ctx, '★ NEW BEST! ★', ARENA.width / 2, y + 6, 20, PALETTE.gold, 'center');
  }
  const button = { x: ARENA.width / 2 - 130, y: 520, width: 260, height: 56 };
  ctx.fillStyle = PALETTE.ember;
  roundRect(ctx, button.x, button.y, button.width, button.height, 10);
  ctx.fill();
  text(ctx, won ? 'PLAY AGAIN' : 'TRY AGAIN', ARENA.width / 2, button.y + 29, 22, '#1a1206', 'center');
  uiRects.restart = button;
  text(ctx, 'or press Enter', ARENA.width / 2, 602, 14, '#9aa0c3', 'center');
}
