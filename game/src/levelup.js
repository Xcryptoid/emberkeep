// XP, level-ups and card choices. Pure logic, no DOM.
import { WEAPONS, WEAPON_ORDER, PASSIVES, xpForLevel } from './config.js';

export function gainXp(world, amount) {
  const player = world.player;
  player.xp += amount;
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level += 1;
    player.xpNext = xpForLevel(player.level);
    world.pendingLevels += 1;
  }
}

// Build 3 distinct level-up cards from the weighted pool.
export function offerLevelUpCards(world) {
  const player = world.player;
  const pool = [];
  if (player.weapons.length < 4) {
    for (const id of WEAPON_ORDER) {
      if (!player.weapons.find((w) => w.id === id)) {
        pool.push({
          type: 'newWeapon', id, name: WEAPONS[id].name,
          blurb: `${WEAPONS[id].blurb} (new)`, levelText: 'Level 1',
          color: WEAPONS[id].color, weight: 3,
        });
      }
    }
  }
  for (const owned of player.weapons) {
    if (owned.level < WEAPONS[owned.id].maxLevel) {
      pool.push({
        type: 'weapon', id: owned.id, name: WEAPONS[owned.id].name,
        blurb: WEAPONS[owned.id].blurb, levelText: `Level ${owned.level} → ${owned.level + 1}`,
        color: WEAPONS[owned.id].color, weight: 3,
      });
    }
  }
  for (const [id, def] of Object.entries(PASSIVES)) {
    if (id === 'heart') continue; // Offered conditionally below, when hurt.
    if (player.passives[id] < def.max) {
      pool.push({
        type: 'passive', id, name: def.name, blurb: def.blurb,
        levelText: `Owned ${player.passives[id]} / ${def.max}`,
        color: '#2ec4b6', weight: 2,
      });
    }
  }
  if (player.hp < player.maxHp * 0.6) {
    pool.push({
      type: 'passive', id: 'heart', name: PASSIVES.heart.name,
      blurb: PASSIVES.heart.blurb, levelText: '',
      color: '#fb7185', weight: 4,
    });
  }
  if (pool.length === 0) {
    pool.push({
      type: 'feast', id: 'feast', name: 'Ember Feast',
      blurb: 'Heal 30 and gather 25 embers', levelText: '',
      color: '#ffd166', weight: 1,
    });
  }
  const cards = [];
  const bag = [...pool];
  while (cards.length < 3 && bag.length > 0) {
    const total = bag.reduce((sum, card) => sum + card.weight, 0);
    let roll = world.rng.next() * total;
    let index = 0;
    for (; index < bag.length; index++) {
      roll -= bag[index].weight;
      if (roll <= 0) break;
    }
    index = Math.min(index, bag.length - 1);
    cards.push(bag.splice(index, 1)[0]);
  }
  return { cards };
}

export function applyCard(world, card) {
  const player = world.player;
  if (card.type === 'newWeapon') {
    player.weapons.push({ id: card.id, level: 1, cooldown: 0, angle: 0 });
  } else if (card.type === 'weapon') {
    const owned = player.weapons.find((w) => w.id === card.id);
    if (owned) owned.level = Math.min(WEAPONS[card.id].maxLevel, owned.level + 1);
  } else if (card.type === 'passive') {
    if (card.id === 'heart') {
      player.hp = Math.min(player.maxHp, player.hp + 40);
    } else if (card.id === 'oil') {
      player.passives.oil += 1;
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 25);
    } else {
      player.passives[card.id] += 1;
    }
  } else if (card.type === 'feast') {
    player.hp = Math.min(player.maxHp, player.hp + 30);
    gainXp(world, 25);
  }
}
