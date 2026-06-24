const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ─────────────────────────────────────────────────────────────────
const WORLD_W = 4000;
const WORLD_H = 4000;
const TICK_RATE = 30;
const CAR_ENTER_RADIUS = 65;
const RESPAWN_DELAY = 3000;
const STORE_RADIUS = 80;
const PICKUP_RADIUS = 40;
const OWNER_NAME = 'brafovin'; // <-- Owner-Name

// ── Weapon definitions ────────────────────────────────────────────────────────
const WEAPONS = {
  pistol:  { name: 'Pistole',    dmg: 30,  speed: 18, life: 65,  cooldown: 350,  ammoMax: Infinity, shots: 1, spread: 0,    explosive: false, radius: 0,   rocket: false, color: '#ffe066' },
  smg:     { name: 'MP5',        dmg: 18,  speed: 20, life: 50,  cooldown: 100,  ammoMax: 300,      shots: 1, spread: 0.06, explosive: false, radius: 0,   rocket: false, color: '#f0f0f0' },
  ak47:    { name: 'AK-47',      dmg: 45,  speed: 22, life: 75,  cooldown: 220,  ammoMax: 200,      shots: 1, spread: 0.04, explosive: false, radius: 0,   rocket: false, color: '#e67e22' },
  sniper:  { name: 'Sniper',     dmg: 150, speed: 55, life: 140, cooldown: 1400, ammoMax: 30,       shots: 1, spread: 0,    explosive: false, radius: 0,   rocket: false, color: '#3498db' },
  shotgun: { name: 'Shotgun',    dmg: 22,  speed: 15, life: 30,  cooldown: 750,  ammoMax: 60,       shots: 8, spread: 0.35, explosive: false, radius: 0,   rocket: false, color: '#e74c3c' },
  rpg:     { name: 'RPG',        dmg: 180, speed: 10, life: 200, cooldown: 2500, ammoMax: 10,       shots: 1, spread: 0,    explosive: true,  radius: 120, rocket: true,  color: '#ff4500' },
};

const WEAPON_ORDER = ['pistol', 'smg', 'ak47', 'sniper', 'shotgun', 'rpg'];

// ── Vehicle types ─────────────────────────────────────────────────────────────
const VEHICLE_TYPES = {
  sedan:  { label: 'Sedan',    maxSpeed: 5.0, accel: 0.18, hp: 100, w: 40, h: 20, turnFactor: 0.045 },
  sports: { label: 'Sports',   maxSpeed: 8.5, accel: 0.30, hp: 80,  w: 38, h: 17, turnFactor: 0.055 },
  truck:  { label: 'Truck',    maxSpeed: 3.5, accel: 0.10, hp: 250, w: 55, h: 28, turnFactor: 0.030 },
  bike:   { label: 'Motorrad', maxSpeed: 9.0, accel: 0.40, hp: 60,  w: 28, h: 12, turnFactor: 0.065 },
  tank:   { label: 'Panzer',   maxSpeed: 2.5, accel: 0.08, hp: 999, w: 60, h: 30, turnFactor: 0.020 },
};

// ── Map data ──────────────────────────────────────────────────────────────────
const roads = [
  { x: 0,    y: 400,  w: 4000, h: 80 },
  { x: 0,    y: 1000, w: 4000, h: 80 },
  { x: 0,    y: 1800, w: 4000, h: 80 },
  { x: 0,    y: 2600, w: 4000, h: 80 },
  { x: 0,    y: 3400, w: 4000, h: 80 },
  { x: 400,  y: 0,    w: 80, h: 4000 },
  { x: 1000, y: 0,    w: 80, h: 4000 },
  { x: 1800, y: 0,    w: 80, h: 4000 },
  { x: 2600, y: 0,    w: 80, h: 4000 },
  { x: 3400, y: 0,    w: 80, h: 4000 },
];

const stores = [
  { x: 700,  y: 650,  label: '24/7', reward: 2500 },
  { x: 1500, y: 1400, label: 'LTD',  reward: 3000 },
  { x: 2800, y: 700,  label: '24/7', reward: 2500 },
  { x: 3200, y: 2200, label: 'Ammu', reward: 4000 },
  { x: 600,  y: 3000, label: 'LTD',  reward: 3000 },
  { x: 2200, y: 3200, label: '24/7', reward: 2500 },
];

// Weapon pickup spawns
const weaponPickupDefs = [
  { x: 850,  y: 450,  type: 'smg'    },
  { x: 1200, y: 1050, type: 'ak47'   },
  { x: 2000, y: 450,  type: 'sniper' },
  { x: 2800, y: 1850, type: 'shotgun'},
  { x: 1850, y: 2650, type: 'rpg'    },
  { x: 3500, y: 1050, type: 'smg'    },
  { x: 550,  y: 1850, type: 'ak47'   },
  { x: 3500, y: 2650, type: 'sniper' },
  { x: 1200, y: 3450, type: 'shotgun'},
  { x: 2650, y: 3450, type: 'rpg'    },
  { x: 1050, y: 2650, type: 'smg'    },
  { x: 2650, y: 450,  type: 'ak47'   },
];
// Each pickup: id, x, y, type, active, respawnAt
let weaponPickups = weaponPickupDefs.map((d, i) => ({ ...d, id: i, active: true, respawnAt: 0 }));

// Armor pickups (blue circles)
const armorPickupDefs = [
  { x: 500,  y: 450  },
  { x: 1100, y: 1850 },
  { x: 1900, y: 1050 },
  { x: 2700, y: 2650 },
  { x: 3500, y: 450  },
  { x: 500,  y: 3450 },
];
let armorPickups = armorPickupDefs.map((d, i) => ({ ...d, id: `armor_${i}`, active: true, respawnAt: 0 }));

// ── Vehicles ──────────────────────────────────────────────────────────────────
let vehicleId = 0;
function spawnVehicle(type, x, y, color) {
  const def = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
  return {
    id: `car_${vehicleId++}`,
    type,
    label: def.label,
    x, y,
    angle: 0,
    color: color || randomColor(),
    driverId: null,
    speed: 0,
    hp: def.hp,
    maxHp: def.hp,
  };
}

function randomColor() {
  const cols = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#ecf0f1','#c0392b','#16a085'];
  return cols[Math.floor(Math.random() * cols.length)];
}

function makeVehicles() {
  const list = [];
  const layout = [
    // [type, x, y]
    ['sedan',  600,  500], ['sports', 1100, 500], ['sedan',  1900, 500], ['truck',  2700, 500], ['sports', 3500, 500],
    ['sedan',  600, 1100], ['bike',  1100,1100], ['sedan',  1900,1100], ['sedan',  2700,1100], ['sports', 3500,1100],
    ['truck',  600, 1900], ['sedan', 1100,1900], ['sports', 1900,1900], ['bike',   2700,1900], ['sedan',  3500,1900],
    ['sedan',  600, 2700], ['sports',1100,2700], ['sedan',  1900,2700], ['truck',  2700,2700], ['sedan',  3500,2700],
    ['bike',   600, 3500], ['sedan', 1100,3500], ['sports', 1900,3500], ['sedan',  2700,3500], ['sports', 3500,3500],
  ];
  for (const [type, x, y] of layout) list.push(spawnVehicle(type, x, y));
  return list;
}

// ── Game state ────────────────────────────────────────────────────────────────
const players = {};
const bullets  = [];
let vehicles   = makeVehicles();
let bulletId   = 0;
const storeRobCooldowns = {};
const explosions = []; // { x, y, radius, life } — for visual sync

// ── Helpers ───────────────────────────────────────────────────────────────────
function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function safeSpawn() {
  const pts = [
    {x:500,y:440},{x:1100,y:440},{x:1900,y:440},{x:2700,y:440},
    {x:500,y:1040},{x:1100,y:1040},{x:2700,y:1040},
    {x:500,y:1840},{x:1900,y:1840},{x:2700,y:1840},
  ];
  return pts[Math.floor(Math.random() * pts.length)];
}

function defaultWeapons() {
  return { pistol: Infinity, smg: 0, ak47: 0, sniper: 0, shotgun: 0, rpg: 0 };
}
function ownerWeapons() {
  return { pistol: Infinity, smg: 999, ak47: 999, sniper: 999, shotgun: 999, rpg: 99 };
}

function applyDamage(p, rawDmg) {
  if (p.godmode) return;
  const armorAbsorb = Math.min(p.armor, rawDmg * 0.5);
  p.armor = Math.max(0, p.armor - armorAbsorb);
  p.hp -= rawDmg - armorAbsorb;
}

function killPlayer(pid, killerId) {
  const p = players[pid];
  if (!p || p.dead) return;
  p.hp = 0;
  p.dead = true;
  const loot = Math.floor(p.money * 0.3);
  p.money = Math.max(0, p.money - loot);
  p.deaths++;

  const killer = players[killerId];
  if (killer) {
    killer.money += loot;
    killer.kills++;
    if (!killer.isOwner) {
      killer.wanted = Math.min(5, killer.wanted + 1);
      killer.wantedTimer = 400;
    }
    io.to(killerId).emit('notification', { msg: `Getötet! +$${loot}`, color: '#2ecc71' });
  }
  io.to(pid).emit('notification', { msg: `Du wurdest getötet! -$${loot}`, color: '#e74c3c' });
  io.emit('playerDied', { id: pid, killerId });

  if (p.inVehicle) {
    const v = vehicles.find(v => v.id === p.inVehicle);
    if (v) { v.driverId = null; v.speed = 0; }
    p.inVehicle = null;
  }

  setTimeout(() => {
    if (!players[pid]) return;
    const sp = safeSpawn();
    Object.assign(players[pid], { x: sp.x, y: sp.y, hp: 100, dead: false, wanted: 0, wantedTimer: 0, armor: 0 });
    if (players[pid].isOwner) { players[pid].armor = 100; players[pid].money = Math.max(players[pid].money, 999999); }
    io.emit('playerRespawned', players[pid]);
  }, RESPAWN_DELAY);
}

// ── Socket handlers ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);
  const sp = safeSpawn();

  players[socket.id] = {
    id: socket.id,
    name: 'Player',
    x: sp.x, y: sp.y,
    angle: 0, speed: 0,
    hp: 100, maxHp: 100,
    armor: 0,
    money: 1000,
    wanted: 0, wantedTimer: 0,
    inVehicle: null,
    dead: false,
    color: `hsl(${Math.random()*360},70%,55%)`,
    kills: 0, deaths: 0,
    weapons: defaultWeapons(),
    currentWeapon: 'pistol',
    isOwner: false,
    godmode: false,
  };

  socket.emit('init', {
    id: socket.id,
    roads, stores, worldW: WORLD_W, worldH: WORLD_H,
    vehicles, players: Object.values(players),
    weaponPickups, armorPickups,
    weaponDefs: WEAPONS, vehicleTypes: VEHICLE_TYPES,
  });
  socket.broadcast.emit('playerJoined', players[socket.id]);

  // ── Events ──────────────────────────────────────────────────────────────
  socket.on('setName', (rawName) => {
    const p = players[socket.id];
    if (!p) return;
    const name = String(rawName).slice(0, 20).trim() || 'Player';
    p.name = name;

    if (name.toLowerCase() === OWNER_NAME.toLowerCase()) {
      p.isOwner    = true;
      p.godmode    = false;
      p.color      = '#FFD700';
      p.money      = 9999999;
      p.armor      = 100;
      p.weapons    = ownerWeapons();
      p.wanted     = 0;
      socket.emit('ownerGranted');
      socket.emit('notification', { msg: '👑 OWNER-MODUS AKTIVIERT! Alle Waffen, unbegrenzt Geld.', color: '#FFD700' });
    }
    io.emit('playerUpdate', p);
  });

  socket.on('input', (data) => {
    const p = players[socket.id];
    if (!p || p.dead) return;

    p.x = Math.max(0, Math.min(WORLD_W, data.x));
    p.y = Math.max(0, Math.min(WORLD_H, data.y));
    p.angle = data.angle;
    p.speed = data.speed || 0;

    // Weapon switch
    if (data.weapon && WEAPONS[data.weapon] && p.weapons[data.weapon] !== undefined) {
      p.currentWeapon = data.weapon;
    }

    // Sync vehicle position
    if (p.inVehicle) {
      const v = vehicles.find(v => v.id === p.inVehicle);
      if (v) { v.x = p.x; v.y = p.y; v.angle = p.angle; v.speed = p.speed; }
    }

    // Shoot
    if (data.shooting && !p.inVehicle) {
      const wKey = p.currentWeapon;
      const wDef = WEAPONS[wKey];
      if (!wDef) return;
      const ammo = p.weapons[wKey];
      if (ammo === 0) return;

      const sa = data.shootAngle;
      for (let s = 0; s < wDef.shots; s++) {
        const spread = (Math.random() - 0.5) * wDef.spread;
        const angle = sa + spread;
        bullets.push({
          id: bulletId++,
          x: p.x, y: p.y,
          vx: Math.cos(angle) * wDef.speed,
          vy: Math.sin(angle) * wDef.speed,
          ownerId: socket.id,
          dmg: wDef.dmg,
          explosive: wDef.explosive,
          expRadius: wDef.radius,
          rocket: wDef.rocket,
          life: wDef.life,
          weaponType: wKey,
        });
      }

      // Consume ammo
      if (ammo !== Infinity && p.weapons[wKey] > 0) {
        p.weapons[wKey]--;
        if (p.weapons[wKey] === 0 && wKey !== 'pistol') {
          p.currentWeapon = 'pistol';
          socket.emit('notification', { msg: `Keine Munition mehr für ${wDef.name}!`, color: '#e74c3c' });
        }
      }
    }

    // Drive-by shooting (in car with pistol only)
    if (data.shooting && p.inVehicle) {
      const sa = data.shootAngle;
      bullets.push({
        id: bulletId++,
        x: p.x, y: p.y,
        vx: Math.cos(sa) * WEAPONS.pistol.speed,
        vy: Math.sin(sa) * WEAPONS.pistol.speed,
        ownerId: socket.id,
        dmg: WEAPONS.pistol.dmg * 0.6,
        explosive: false, expRadius: 0, rocket: false,
        life: WEAPONS.pistol.life,
        weaponType: 'pistol',
      });
    }

    // Enter / exit vehicle
    if (data.enterCar) {
      if (p.inVehicle) {
        const v = vehicles.find(v => v.id === p.inVehicle);
        if (v) { v.driverId = null; v.speed = 0; }
        p.inVehicle = null;
      } else {
        const nearby = vehicles
          .filter(v => !v.driverId && dist(p, v) < CAR_ENTER_RADIUS)
          .sort((a, b) => dist(p, a) - dist(p, b))[0];
        if (nearby) {
          nearby.driverId = socket.id;
          p.inVehicle = nearby.id;
          p.x = nearby.x; p.y = nearby.y;
        }
      }
    }

    // Rob store
    if (data.robStore) {
      const now = Date.now();
      if ((now - (storeRobCooldowns[socket.id] || 0)) > 8000) {
        const s = stores.find(s => dist(p, { x: s.x, y: s.y }) < STORE_RADIUS);
        if (s) {
          storeRobCooldowns[socket.id] = now;
          p.money += s.reward;
          if (!p.isOwner) { p.wanted = Math.min(5, p.wanted + 2); p.wantedTimer = 600; }
          socket.emit('notification', { msg: `${s.label} ausgeraubt! +$${s.reward}`, color: '#f39c12' });
        }
      }
    }

    // Owner commands
    if (p.isOwner) {
      if (data.toggleGodmode !== undefined) {
        p.godmode = !!data.toggleGodmode;
        socket.emit('notification', { msg: p.godmode ? '🛡️ GODMODE AN' : '💀 Godmode aus', color: '#FFD700' });
      }
      if (data.clearWanted) {
        p.wanted = 0; p.wantedTimer = 0;
        socket.emit('notification', { msg: '⭐ Wanted-Level gelöscht', color: '#FFD700' });
      }
      if (data.refillWeapons) {
        p.weapons = ownerWeapons();
        socket.emit('notification', { msg: '🔫 Alle Waffen nachgeladen!', color: '#FFD700' });
      }
      if (data.maxMoney) {
        p.money = 9999999;
        socket.emit('notification', { msg: '💰 $9.999.999 gutgeschrieben!', color: '#FFD700' });
      }
      if (data.spawnVehicle && VEHICLE_TYPES[data.spawnVehicle]) {
        const offset = 80;
        const nx = p.x + Math.cos(p.angle + Math.PI/2) * offset;
        const ny = p.y + Math.sin(p.angle + Math.PI/2) * offset;
        const colors = { sedan:'#c0392b', sports:'#f39c12', truck:'#2c3e50', bike:'#9b59b6', tank:'#27ae60' };
        const v = spawnVehicle(data.spawnVehicle, nx, ny, colors[data.spawnVehicle] || '#e74c3c');
        vehicles.push(v);
        socket.emit('notification', { msg: `🚗 ${VEHICLE_TYPES[data.spawnVehicle].label} gespawnt!`, color: '#FFD700' });
      }
    }
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p && p.inVehicle) {
      const v = vehicles.find(v => v.id === p.inVehicle);
      if (v) { v.driverId = null; v.speed = 0; }
    }
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// ── Server tick ───────────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    if (b.life <= 0 || b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) {
      if (b.explosive) doExplosion(b.x, b.y, b.expRadius, b.ownerId, b.dmg);
      bullets.splice(i, 1);
      continue;
    }

    let hit = false;

    // Hit players
    for (const [pid, p] of Object.entries(players)) {
      if (pid === b.ownerId || p.dead) continue;
      const hitRadius = p.inVehicle ? 28 : 18;
      if (dist(b, p) < hitRadius) {
        if (b.explosive) {
          doExplosion(b.x, b.y, b.expRadius, b.ownerId, b.dmg);
        } else {
          applyDamage(p, b.dmg);
          if (p.hp <= 0) killPlayer(pid, b.ownerId);
        }
        hit = true; break;
      }
    }

    // Hit vehicles
    if (!hit) {
      for (const v of vehicles) {
        if (v.x < -9000) continue;
        const def = VEHICLE_TYPES[v.type] || VEHICLE_TYPES.sedan;
        if (dist(b, v) < (def.w / 2 + 8)) {
          if (b.explosive) {
            doExplosion(b.x, b.y, b.expRadius, b.ownerId, b.dmg);
          } else {
            if (v.type !== 'tank') {
              v.hp = Math.max(0, v.hp - b.dmg * 0.2);
              if (v.hp === 0) destroyVehicle(v);
            }
          }
          hit = true; break;
        }
      }
    }

    if (hit) bullets.splice(i, 1);
  }

  // Weapon pickups respawn
  for (const pu of weaponPickups) {
    if (!pu.active && now >= pu.respawnAt) pu.active = true;
  }
  for (const pu of armorPickups) {
    if (!pu.active && now >= pu.respawnAt) pu.active = true;
  }

  // Players pick up weapons / armor
  for (const p of Object.values(players)) {
    if (p.dead) continue;
    for (const pu of weaponPickups) {
      if (!pu.active) continue;
      if (dist(p, pu) < PICKUP_RADIUS) {
        pu.active = false;
        pu.respawnAt = now + 30000; // respawn after 30s
        const wDef = WEAPONS[pu.type];
        p.weapons[pu.type] = Math.min((p.weapons[pu.type] || 0) + Math.floor(wDef.ammoMax * 0.5), wDef.ammoMax === Infinity ? Infinity : wDef.ammoMax);
        io.to(p.id).emit('notification', { msg: `${wDef.name} aufgehoben! (+${Math.floor(wDef.ammoMax * 0.5)} Munition)`, color: '#2ecc71' });
      }
    }
    for (const pu of armorPickups) {
      if (!pu.active) continue;
      if (dist(p, pu) < PICKUP_RADIUS) {
        pu.active = false;
        pu.respawnAt = now + 20000;
        p.armor = Math.min(100, p.armor + 50);
        io.to(p.id).emit('notification', { msg: '🛡️ Rüstung +50', color: '#3498db' });
      }
    }
  }

  // Wanted decay
  for (const p of Object.values(players)) {
    if (p.wantedTimer > 0) {
      p.wantedTimer--;
      if (p.wantedTimer === 0) {
        p.wanted = Math.max(0, p.wanted - 1);
        if (p.wanted > 0) p.wantedTimer = 300;
      }
    }
    if (p.isOwner) p.wanted = 0;
  }

  // Broadcast
  io.emit('state', {
    players: Object.values(players),
    bullets: bullets.map(b => ({ id: b.id, x: b.x, y: b.y, weaponType: b.weaponType, rocket: b.rocket })),
    vehicles,
    weaponPickups,
    armorPickups,
    explosions: [...explosions],
  });
  explosions.length = 0;
}, TICK_RATE);

function doExplosion(x, y, radius, ownerId, dmg) {
  explosions.push({ x, y, radius });
  for (const [pid, p] of Object.entries(players)) {
    if (p.dead) continue;
    const d = dist({ x, y }, p);
    if (d < radius) {
      const falloff = 1 - d / radius;
      applyDamage(p, dmg * falloff);
      if (p.hp <= 0) killPlayer(pid, ownerId);
    }
  }
  for (const v of vehicles) {
    if (v.x < -9000 || v.type === 'tank') continue;
    if (dist({ x, y }, v) < radius) {
      v.hp = Math.max(0, v.hp - dmg * 0.4);
      if (v.hp === 0) destroyVehicle(v);
    }
  }
}

function destroyVehicle(v) {
  if (v.driverId) {
    const dp = players[v.driverId];
    if (dp) { applyDamage(dp, 50); dp.inVehicle = null; if (dp.hp <= 0) killPlayer(dp.id, null); }
    v.driverId = null;
  }
  v.x = -9999; v.y = -9999; v.speed = 0;
  setTimeout(() => { v.hp = (VEHICLE_TYPES[v.type] || VEHICLE_TYPES.sedan).hp; const sp = safeSpawn(); v.x = sp.x + 120; v.y = sp.y; }, 12000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`GTA Online Clone → http://localhost:${PORT}`));
