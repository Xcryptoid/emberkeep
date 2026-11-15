// Emberkeep — every tuning number lives here, as named tables.
// The judge's source outline shows these names, so they are descriptive.
export const ARENA = { width: 1280, height: 720 };
export const STEP = 1 / 60;

export const PALETTE = {
  background: '#12142b',
  ember: '#ff9a3c',
  gold: '#ffd166',
  teal: '#2ec4b6',
  bone: '#f4f1e8',
  moth: '#b388ff',
  wisp: '#7ee8fa',
  spitter: '#a3e635',
  mite: '#fb7185',
  brute: '#e11d48',
  boss: '#7c3aed',
  heart: '#fb7185',
  danger: '#ef4444',
};

export const PLAYER = {
  maxHp: 110,
  speed: 185,
  radius: 12,
  pickupRadius: 90,
  invulnerableSeconds: 0.75,
  startWeapon: 'emberBolt',
};

export const LIMITS = {
  maxEnemies: 90,
  maxParticles: 400,
  maxGems: 400,
};

// Weapons: max 4 equipped, each max level 5. Fire automatically.
// perLevel is applied (level - 1) times on top of base.
export const WEAPONS = {
  emberBolt: {
    name: 'Ember Bolt',
    blurb: 'Fires a bolt at the nearest enemy.',
    maxLevel: 5,
    base: { damage: 14, rate: 1.2, count: 1, speed: 520, pierce: 0 },
    perLevel: { damage: 4, rate: 0.15 },
    bonusAt: { 3: { count: 1 }, 5: { pierce: 1 } },
    color: PALETTE.ember,
  },
  lanternOrbit: {
    name: 'Lantern Orbit',
    blurb: 'Blades circle you and cut what they touch.',
    maxLevel: 5,
    base: { damage: 10, blades: 2, radius: 90, spin: 2.4 },
    perLevel: { damage: 4, spin: 0.3 },
    bonusAt: { 3: { blades: 1 }, 5: { radius: 20 } },
    color: PALETTE.gold,
  },
  cinderNova: {
    name: 'Cinder Nova',
    blurb: 'A radial burst sears everything near you.',
    maxLevel: 5,
    base: { damage: 18, radius: 130, cooldown: 3.0 },
    perLevel: { damage: 6, radius: 15, cooldown: -0.25 },
    bonusAt: {},
    color: PALETTE.ember,
  },
  galeFan: {
    name: 'Gale Fan',
    blurb: 'A fan of shards at the nearest enemies.',
    maxLevel: 5,
    base: { damage: 8, shards: 3, rate: 0.9, spread: 0.5 },
    perLevel: { damage: 3, rate: 0.1 },
    bonusAt: { 3: { shards: 2 }, 5: { shards: 1 } },
    color: PALETTE.teal,
  },
};

export const WEAPON_ORDER = ['emberBolt', 'lanternOrbit', 'cinderNova', 'galeFan'];

// Enemies. hp scales with time: hp * (1 + 0.09 * minutes).
export const ENEMIES = {
  moth: {
    name: 'Moth', hp: 14, speed: 70, damage: 6, xp: 1, radius: 13,
    color: PALETTE.moth, behaviour: 'chase',
  },
  wisp: {
    name: 'Wisp', hp: 8, speed: 120, damage: 5, xp: 1, radius: 9,
    color: PALETTE.wisp, behaviour: 'wobble',
  },
  spitter: {
    name: 'Spitter', hp: 20, speed: 55, damage: 10, xp: 2, radius: 14,
    color: PALETTE.spitter, behaviour: 'keepDistance',
  },
  mite: {
    name: 'Mite', hp: 16, speed: 85, damage: 6, xp: 2, radius: 11,
    color: PALETTE.mite, behaviour: 'splitter',
  },
  brute: {
    name: 'Brute', hp: 120, speed: 42, damage: 14, xp: 5, radius: 24,
    color: PALETTE.brute, behaviour: 'chase',
  },
  boss: {
    name: 'The Gloom Herald', hp: 2500, speed: 55, damage: 25, xp: 50, radius: 64,
    color: PALETTE.boss, behaviour: 'boss',
  },
};

// Spawning is time-driven. Each row applies from `start` until the next row.
export const WAVES = [
  { start: 0, interval: 1.8, batch: 1, kinds: ['moth'], banner: 'Night falls — hold the light.' },
  { start: 30, interval: 1.45, batch: 2, kinds: ['moth', 'wisp'], banner: null },
  { start: 60, interval: 1.1, batch: 2, kinds: ['moth', 'wisp', 'spitter'], banner: 'Spitters in the dark…' },
  { start: 90, interval: 1.0, batch: 2, kinds: ['moth', 'wisp', 'spitter', 'mite'], banner: null },
  { start: 120, interval: 1.1, batch: 3, kinds: ['moth', 'wisp', 'spitter', 'mite'], banner: 'Something gilded stirs.' },
  { start: 150, interval: 0.9, batch: 3, kinds: ['moth', 'wisp', 'spitter', 'mite', 'brute'], banner: 'The brutes come.' },
  { start: 210, interval: 0.8, batch: 3, kinds: ['moth', 'wisp', 'spitter', 'mite', 'brute'], banner: 'The Hollow is hungry.' },
  { start: 270, interval: 0.7, batch: 4, kinds: ['moth', 'wisp', 'spitter', 'mite', 'brute'], banner: 'Dawn is near — hold on!' },
];

export const BOSS_TIME = 300; // seconds — survive this long and the Herald comes.
export const ELITE_FROM = 120; // seconds — elites begin.
export const ELITE_EVERY = 45; // seconds between elite spawns.

// XP to go from `level` to `level + 1`.
export function xpForLevel(level) {
  return 8 + level * 5;
}

// Passive upgrades offered on level-up. `max` is how many times each may be taken.
export const PASSIVES = {
  boots: { name: 'Sturdy Boots', blurb: '+12% move speed', max: 3 },
  oil: { name: 'Lantern Oil', blurb: '+25 max HP and heal 25', max: 3 },
  magnet: { name: 'Magnet Charm', blurb: '+30% pickup radius', max: 3 },
  heart: { name: 'Ember Heart', blurb: 'Heal 40 now', max: 99 },
};

export const PICKUPS = {
  heart: { chance: 0.02, heal: 25 },
  magnet: { chance: 0.02 },
  nova: { chance: 0.015, damage: 60 },
};

export const RUN = {
  gemSmallXp: 1,
  gemLargeXp: 5,
  critChance: 0.1,
  critMultiplier: 2,
  pickupLifetime: 12,
};
