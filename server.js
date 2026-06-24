const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── World constants ──────────────────────────────────────────────────────────
const WORLD_W = 4000;
const WORLD_H = 4000;
const TICK_RATE = 30; // ms per server tick
const BULLET_SPEED = 14;
const BULLET_LIFETIME = 80; // ticks
const CAR_ENTER_RADIUS = 60;
const RESPAWN_DELAY = 3000;
const STORE_RADIUS = 80;

// ── Map data ─────────────────────────────────────────────────────────────────
// Roads: array of { x, y, w, h }
const roads = [
  // Horizontal roads
  { x: 0,    y: 400,  w: 4000, h: 80 },
  { x: 0,    y: 1000, w: 4000, h: 80 },
  { x: 0,    y: 1800, w: 4000, h: 80 },
  { x: 0,    y: 2600, w: 4000, h: 80 },
  { x: 0,    y: 3400, w: 4000, h: 80 },
  // Vertical roads
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

// Initial vehicle spawns
function makeVehicles() {
  const colors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#ecf0f1'];
  const spawnPoints = [
    {x:600,y:500},{x:1100,y:500},{x:1900,y:500},{x:2700,y:500},{x:3500,y:500},
    {x:600,y:1100},{x:1100,y:1100},{x:1900,y:1100},{x:2700,y:1100},{x:3500,y:1100},
    {x:600,y:1900},{x:1100,y:1900},{x:1900,y:1900},{x:2700,y:1900},{x:3500,y:1900},
    {x:600,y:2700},{x:1100,y:2700},{x:1900,y:2700},{x:2700,y:2700},{x:3500,y:2700},
    {x:600,y:3500},{x:1100,y:3500},{x:1900,y:3500},{x:2700,y:3500},{x:3500,y:3500},
  ];
  return spawnPoints.map((p, i) => ({
    id: `car_${i}`,
    x: p.x, y: p.y,
    angle: 0,
    color: colors[i % colors.length],
    driverId: null,
    speed: 0,
    hp: 100,
  }));
}

// ── Game state ────────────────────────────────────────────────────────────────
const players = {};   // socketId → player
const bullets = [];   // { id, x, y, vx, vy, ownerId, life }
let vehicles = makeVehicles();
let bulletId = 0;
const storeRobCooldowns = {}; // playerId → timestamp

// ── Helpers ───────────────────────────────────────────────────────────────────
function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isOnRoad(x, y) {
  for (const r of roads) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

function safeSpawn() {
  // Find a road tile to spawn on
  const candidates = [
    {x:500,y:440},{x:1100,y:440},{x:1900,y:440},{x:2700,y:440},
    {x:500,y:1040},{x:1100,y:1040},{x:2700,y:1040},
    {x:500,y:1840},{x:1900,y:1840},{x:2700,y:1840},
  ];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function wantedColor(w) {
  if (w <= 1) return '#f1c40f';
  if (w <= 2) return '#e67e22';
  if (w <= 3) return '#e74c3c';
  return '#c0392b';
}

// ── Socket handlers ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  const spawn = safeSpawn();
  players[socket.id] = {
    id: socket.id,
    name: 'Player',
    x: spawn.x,
    y: spawn.y,
    angle: 0,
    hp: 100,
    maxHp: 100,
    money: 500,
    wanted: 0,
    wantedTimer: 0,
    speed: 0,
    inVehicle: null,
    dead: false,
    color: `hsl(${Math.random()*360},70%,55%)`,
    kills: 0,
    deaths: 0,
  };

  // Send initial world state
  socket.emit('init', {
    id: socket.id,
    roads,
    stores,
    worldW: WORLD_W,
    worldH: WORLD_H,
    vehicles,
    players: Object.values(players),
  });

  socket.broadcast.emit('playerJoined', players[socket.id]);

  // ── Client → Server events ─────────────────────────────────────────────
  socket.on('setName', (name) => {
    if (!players[socket.id]) return;
    players[socket.id].name = String(name).slice(0, 20);
    io.emit('playerUpdate', players[socket.id]);
  });

  socket.on('input', (data) => {
    const p = players[socket.id];
    if (!p || p.dead) return;

    // data: { x, y, angle, speed, shooting, shootAngle, enterCar, robStore }
    p.x = Math.max(0, Math.min(WORLD_W, data.x));
    p.y = Math.max(0, Math.min(WORLD_H, data.y));
    p.angle = data.angle;
    p.speed = data.speed || 0;

    if (p.inVehicle) {
      const v = vehicles.find(v => v.id === p.inVehicle);
      if (v) {
        v.x = p.x;
        v.y = p.y;
        v.angle = p.angle;
        v.speed = p.speed;
      }
    }

    // Shoot
    if (data.shooting) {
      const sa = data.shootAngle;
      bullets.push({
        id: bulletId++,
        x: p.x,
        y: p.y,
        vx: Math.cos(sa) * BULLET_SPEED,
        vy: Math.sin(sa) * BULLET_SPEED,
        ownerId: socket.id,
        life: BULLET_LIFETIME,
      });
    }

    // Enter / exit vehicle
    if (data.enterCar) {
      if (p.inVehicle) {
        // Exit
        const v = vehicles.find(v => v.id === p.inVehicle);
        if (v) { v.driverId = null; v.speed = 0; }
        p.inVehicle = null;
      } else {
        // Find nearest free car
        const nearby = vehicles
          .filter(v => !v.driverId && dist(p, v) < CAR_ENTER_RADIUS)
          .sort((a, b) => dist(p, a) - dist(p, b))[0];
        if (nearby) {
          nearby.driverId = socket.id;
          p.inVehicle = nearby.id;
          p.x = nearby.x;
          p.y = nearby.y;
        }
      }
    }

    // Rob store
    if (data.robStore) {
      const now = Date.now();
      const cooldown = storeRobCooldowns[socket.id] || 0;
      if (now - cooldown > 8000) {
        const nearby = stores.find(s => dist(p, { x: s.x, y: s.y }) < STORE_RADIUS);
        if (nearby) {
          storeRobCooldowns[socket.id] = now;
          p.money += nearby.reward;
          p.wanted = Math.min(5, p.wanted + 2);
          p.wantedTimer = 600;
          socket.emit('notification', { msg: `Du hast ${nearby.label} ausgeraubt! +$${nearby.reward}`, color: '#e74c3c' });
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
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

  // Move & age bullets, check hits
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    // Out of bounds or expired
    if (b.life <= 0 || b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) {
      bullets.splice(i, 1);
      continue;
    }

    // Hit player
    let hit = false;
    for (const [pid, p] of Object.entries(players)) {
      if (pid === b.ownerId || p.dead) continue;
      if (dist(b, p) < (p.inVehicle ? 28 : 18)) {
        const dmg = p.inVehicle ? 8 : 25;
        p.hp -= dmg;

        if (p.hp <= 0) {
          p.hp = 0;
          p.dead = true;
          const killer = players[b.ownerId];
          const loot = Math.floor(p.money * 0.3);
          p.money = Math.max(0, p.money - loot);
          if (killer) {
            killer.money += loot;
            killer.kills++;
            killer.wanted = Math.min(5, killer.wanted + 1);
            killer.wantedTimer = 400;
            io.to(b.ownerId).emit('notification', { msg: `Getötet! +$${loot}`, color: '#2ecc71' });
          }
          p.deaths++;
          io.to(pid).emit('notification', { msg: `Du wurdest getötet! -$${loot}`, color: '#e74c3c' });
          io.emit('playerDied', { id: pid, killerId: b.ownerId });

          // Release vehicle
          if (p.inVehicle) {
            const v = vehicles.find(v => v.id === p.inVehicle);
            if (v) { v.driverId = null; v.speed = 0; }
            p.inVehicle = null;
          }

          // Respawn
          setTimeout(() => {
            if (!players[pid]) return;
            const sp = safeSpawn();
            players[pid].x = sp.x;
            players[pid].y = sp.y;
            players[pid].hp = 100;
            players[pid].dead = false;
            players[pid].wanted = 0;
            players[pid].wantedTimer = 0;
            io.emit('playerRespawned', players[pid]);
          }, RESPAWN_DELAY);
        }
        hit = true;
        break;
      }
    }

    // Hit vehicle
    if (!hit) {
      for (const v of vehicles) {
        if (dist(b, v) < 32) {
          v.hp = Math.max(0, v.hp - 5);
          if (v.hp <= 0) {
            // Respawn vehicle after 10s
            const vid = v.id;
            const vcolor = v.color;
            if (v.driverId) {
              const dp = players[v.driverId];
              if (dp) { dp.inVehicle = null; dp.hp = Math.max(1, dp.hp - 30); }
              v.driverId = null;
            }
            v.x = -9999; v.y = -9999; // hide it
            setTimeout(() => {
              const rv = vehicles.find(x => x.id === vid);
              if (rv) { rv.hp = 100; const sp = safeSpawn(); rv.x = sp.x + 100; rv.y = sp.y; }
            }, 10000);
          }
          hit = true;
          break;
        }
      }
    }

    if (hit) bullets.splice(i, 1);
  }

  // Wanted level decay
  for (const p of Object.values(players)) {
    if (p.wantedTimer > 0) {
      p.wantedTimer--;
      if (p.wantedTimer === 0) {
        p.wanted = Math.max(0, p.wanted - 1);
        if (p.wanted > 0) p.wantedTimer = 300;
      }
    }
  }

  // Broadcast state
  io.emit('state', {
    players: Object.values(players),
    bullets: bullets.map(b => ({ id: b.id, x: b.x, y: b.y })),
    vehicles,
  });
}, TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`GTA Online Clone running on http://localhost:${PORT}`));
