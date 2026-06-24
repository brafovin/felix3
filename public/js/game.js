// ─────────────────────────────────────────────────────────────────────────────
// GTA Online Clone — Client
// ─────────────────────────────────────────────────────────────────────────────
const socket = io();

// DOM refs
const lobby      = document.getElementById('lobby');
const nameInput  = document.getElementById('name-input');
const playBtn    = document.getElementById('play-btn');
const canvas     = document.getElementById('canvas');
const ctx        = canvas.getContext('2d');
const hud        = document.getElementById('hud');
const minimapEl  = document.getElementById('minimap-canvas');
const mmCtx      = minimapEl.getContext('2d');
const healthFill = document.getElementById('health-fill');
const moneyEl    = document.getElementById('money');
const wantedStars= [1,2,3,4,5].map(i => document.getElementById('s'+i));
const scoreList  = document.getElementById('score-list');
const deadOverlay= document.getElementById('dead-overlay');
const vehicleInd = document.getElementById('vehicle-indicator');
const vhpWrap    = document.getElementById('vehicle-hp-wrap');
const vhpFill    = document.getElementById('vehicle-hp-fill');
const storePrompt= document.getElementById('store-prompt');
const notifWrap  = document.getElementById('notifications');

// Game state
let myId = null;
let worldW = 4000, worldH = 4000;
let roads = [], stores = [], vehicles = [], players = {}, bullets = [];
let myPlayer = null;
let gameStarted = false;

// Camera
const cam = { x: 0, y: 0, zoom: 1 };

// Input state
const keys = {};
let mouseWorld = { x: 0, y: 0 };
let mouseScreen = { x: 0, y: 0 };
let mouseDown = false;
let lastShot = 0;
const SHOT_COOLDOWN = 180; // ms

// Interpolation buffer for other players
const interpTargets = {};

// ── Lobby ─────────────────────────────────────────────────────────────────────
playBtn.addEventListener('click', startGame);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });

function startGame() {
  const name = nameInput.value.trim() || 'Player';
  lobby.style.display = 'none';
  hud.style.display = 'block';
  canvas.style.display = 'block';
  gameStarted = true;
  socket.emit('setName', name);
  resizeCanvas();
  requestAnimationFrame(loop);
}

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on('init', (data) => {
  myId    = data.id;
  worldW  = data.worldW;
  worldH  = data.worldH;
  roads   = data.roads;
  stores  = data.stores;
  vehicles = data.vehicles;
  for (const p of data.players) players[p.id] = p;
  myPlayer = players[myId];
  if (myPlayer) { cam.x = myPlayer.x; cam.y = myPlayer.y; }
});

socket.on('playerJoined', p  => { players[p.id] = p; showNotif(`${p.name} ist beigetreten`, '#3498db'); });
socket.on('playerLeft',   id => { delete players[id]; delete interpTargets[id]; });
socket.on('playerUpdate', p  => { players[p.id] = p; });
socket.on('playerDied',   ({ id }) => { if (players[id]) players[id].dead = true; });
socket.on('playerRespawned', p => { players[p.id] = p; if (p.id === myId) { deadOverlay.classList.remove('show'); myPlayer = p; } });

socket.on('state', (data) => {
  // Smooth-update other players
  for (const p of data.players) {
    if (p.id === myId) {
      // Merge server authority for hp/money/wanted
      if (myPlayer) {
        myPlayer.hp     = p.hp;
        myPlayer.money  = p.money;
        myPlayer.wanted = p.wanted;
        myPlayer.dead   = p.dead;
        myPlayer.kills  = p.kills;
        myPlayer.deaths = p.deaths;
      }
    } else {
      interpTargets[p.id] = p;
      if (!players[p.id]) players[p.id] = p;
    }
  }
  vehicles = data.vehicles;
  bullets  = data.bullets;
});

socket.on('notification', ({ msg, color }) => showNotif(msg, color));

// ── Input ─────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'e' && gameStarted) sendEnterCar();
  if (e.key.toLowerCase() === 'f' && gameStarted) sendRobStore();
  e.preventDefault();
});
window.addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousemove', e => {
  mouseScreen.x = e.clientX;
  mouseScreen.y = e.clientY;
});
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Zoom
canvas.addEventListener('wheel', e => {
  cam.zoom = Math.max(0.4, Math.min(2.0, cam.zoom - e.deltaY * 0.001));
}, { passive: true });

window.addEventListener('resize', resizeCanvas);
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ── Game loop ──────────────────────────────────────────────────────────────────
let lastFrame = 0;
function loop(ts) {
  if (!gameStarted) return;
  const dt = Math.min(ts - lastFrame, 50);
  lastFrame = ts;

  update(dt);
  render();
  updateHUD();
  requestAnimationFrame(loop);
}

// ── Update (client-side prediction) ──────────────────────────────────────────
function update(dt) {
  if (!myPlayer || myPlayer.dead) return;

  const inCar = !!myPlayer.inVehicle;
  const speed  = inCar ? (keys['shift'] ? 5.5 : 4) : (keys['shift'] ? 2.8 : 1.8);
  const accel  = inCar ? 0.18 : 0.3;
  const friction = inCar ? 0.06 : 0.18;

  // Angle toward mouse
  const dx = mouseScreen.x - canvas.width  / 2;
  const dy = mouseScreen.y - canvas.height / 2;
  const targetAngle = Math.atan2(dy, dx);

  if (inCar) {
    // In car: use arrow keys / WASD for steering
    const forward = keys['w'] || keys['arrowup'];
    const back    = keys['s'] || keys['arrowdown'];
    const left    = keys['a'] || keys['arrowleft'];
    const right   = keys['d'] || keys['arrowright'];

    myPlayer.speed = myPlayer.speed || 0;
    if (forward) myPlayer.speed = Math.min(speed, myPlayer.speed + accel);
    else if (back) myPlayer.speed = Math.max(-speed * 0.5, myPlayer.speed - accel);
    else myPlayer.speed *= (1 - friction);

    if (Math.abs(myPlayer.speed) > 0.05) {
      const turnSpeed = 0.045 * (myPlayer.speed > 0 ? 1 : -1);
      if (left)  myPlayer.angle -= turnSpeed * Math.abs(myPlayer.speed) / speed;
      if (right) myPlayer.angle += turnSpeed * Math.abs(myPlayer.speed) / speed;
    }

    myPlayer.x += Math.cos(myPlayer.angle) * myPlayer.speed;
    myPlayer.y += Math.sin(myPlayer.angle) * myPlayer.speed;
  } else {
    // On foot
    let vx = 0, vy = 0;
    if (keys['w'] || keys['arrowup'])    vy -= 1;
    if (keys['s'] || keys['arrowdown'])  vy += 1;
    if (keys['a'] || keys['arrowleft'])  vx -= 1;
    if (keys['d'] || keys['arrowright']) vx += 1;
    if (vx !== 0 || vy !== 0) {
      const len = Math.sqrt(vx*vx + vy*vy);
      myPlayer.x += (vx/len) * speed;
      myPlayer.y += (vy/len) * speed;
    }
    myPlayer.angle = targetAngle;
  }

  // Clamp
  myPlayer.x = Math.max(10, Math.min(worldW - 10, myPlayer.x));
  myPlayer.y = Math.max(10, Math.min(worldH - 10, myPlayer.y));

  // Smooth camera
  const tw = canvas.width / 2 - myPlayer.x * cam.zoom;
  const th = canvas.height / 2 - myPlayer.y * cam.zoom;
  cam.x += (tw - cam.x) * 0.1;
  cam.y += (th - cam.y) * 0.1;

  // Mouse world coords
  mouseWorld.x = (mouseScreen.x - cam.x) / cam.zoom;
  mouseWorld.y = (mouseScreen.y - cam.y) / cam.zoom;

  // Shoot
  const now = performance.now();
  if (mouseDown && !inCar && now - lastShot > SHOT_COOLDOWN) {
    lastShot = now;
    const sa = Math.atan2(mouseWorld.y - myPlayer.y, mouseWorld.x - myPlayer.x);
    sendInput(true, sa);
  } else {
    sendInput(false, 0);
  }

  // Interpolate other players
  for (const [id, target] of Object.entries(interpTargets)) {
    if (id === myId) continue;
    const p = players[id];
    if (!p) continue;
    p.x     += (target.x     - p.x)     * 0.25;
    p.y     += (target.y     - p.y)     * 0.25;
    p.angle += angleDiff(target.angle, p.angle) * 0.25;
    p.hp     = target.hp;
    p.money  = target.money;
    p.wanted = target.wanted;
    p.dead   = target.dead;
  }

  // Dead check
  if (myPlayer.dead) deadOverlay.classList.add('show');

  // Store proximity
  const nearStore = stores.find(s => dist(myPlayer, {x:s.x,y:s.y}) < 90);
  storePrompt.style.display = nearStore ? 'block' : 'none';
}

// ── Server communication ───────────────────────────────────────────────────────
let enterCarQueued = false;
let robStoreQueued = false;

function sendEnterCar()  { enterCarQueued = true; }
function sendRobStore()  { robStoreQueued = true; }

function sendInput(shooting, shootAngle) {
  if (!myPlayer) return;
  socket.emit('input', {
    x: myPlayer.x, y: myPlayer.y,
    angle: myPlayer.angle, speed: myPlayer.speed || 0,
    shooting, shootAngle,
    enterCar: enterCarQueued,
    robStore: robStoreQueued,
  });
  enterCarQueued = false;
  robStoreQueued = false;
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
  ctx.save();
  ctx.fillStyle = '#2d5a27'; // grass green base
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.zoom, cam.zoom);

  drawWorld();
  drawVehicles();
  drawBullets();
  drawPlayers();
  drawStores();

  ctx.restore();
  drawMinimap();
}

// Grass texture pattern
function drawWorld() {
  // Draw roads
  for (const r of roads) {
    // Road surface
    ctx.fillStyle = '#555';
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Lane markings
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.setLineDash([40, 30]);
    ctx.beginPath();
    if (r.w > r.h) {
      // horizontal road
      ctx.moveTo(r.x, r.y + r.h / 2);
      ctx.lineTo(r.x + r.w, r.y + r.h / 2);
    } else {
      // vertical road
      ctx.moveTo(r.x + r.w / 2, r.y);
      ctx.lineTo(r.x + r.w / 2, r.y + r.h);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Sidewalk edges
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 3;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  // Draw buildings in grid gaps
  drawBuildings();

  // World border
  ctx.strokeStyle = '#1a3a14';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, worldW, worldH);
}

function drawBuildings() {
  // Pre-defined building blocks between roads
  const blocks = [
    { x: 100, y: 100, w: 240, h: 240 },
    { x: 520, y: 100, w: 420, h: 240 },
    { x: 1140, y: 100, w: 600, h: 240 },
    { x: 1940, y: 100, w: 600, h: 240 },
    { x: 2740, y: 100, w: 600, h: 240 },
    { x: 100, y: 540, w: 240, h: 400 },
    { x: 520, y: 540, w: 420, h: 400 },
    { x: 1140, y: 540, w: 600, h: 400 },
    { x: 1940, y: 540, w: 600, h: 400 },
    { x: 2740, y: 540, w: 600, h: 400 },
    { x: 3540, y: 100, w: 360, h: 240 },
    { x: 3540, y: 540, w: 360, h: 400 },
    // Row 2
    { x: 100, y: 1140, w: 240, h: 600 },
    { x: 520, y: 1140, w: 420, h: 600 },
    { x: 1140, y: 1140, w: 600, h: 600 },
    { x: 1940, y: 1140, w: 600, h: 600 },
    { x: 2740, y: 1140, w: 600, h: 600 },
    { x: 3540, y: 1140, w: 360, h: 600 },
    // Row 3
    { x: 100, y: 1940, w: 240, h: 600 },
    { x: 520, y: 1940, w: 420, h: 600 },
    { x: 1140, y: 1940, w: 600, h: 600 },
    { x: 1940, y: 1940, w: 600, h: 600 },
    { x: 2740, y: 1940, w: 600, h: 600 },
    { x: 3540, y: 1940, w: 360, h: 600 },
    // Row 4
    { x: 100, y: 2740, w: 240, h: 600 },
    { x: 520, y: 2740, w: 420, h: 600 },
    { x: 1140, y: 2740, w: 600, h: 600 },
    { x: 1940, y: 2740, w: 600, h: 600 },
    { x: 2740, y: 2740, w: 600, h: 600 },
    { x: 3540, y: 2740, w: 360, h: 600 },
    // Row 5
    { x: 100, y: 3540, w: 240, h: 360 },
    { x: 520, y: 3540, w: 420, h: 360 },
    { x: 1140, y: 3540, w: 600, h: 360 },
    { x: 1940, y: 3540, w: 600, h: 360 },
    { x: 2740, y: 3540, w: 600, h: 360 },
    { x: 3540, y: 3540, w: 360, h: 360 },
  ];

  const buildingColors = ['#8e7f6e','#7a6f5e','#6e6355','#9e8f7e','#857870'];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const c = buildingColors[i % buildingColors.length];
    ctx.fillStyle = c;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // Windows
    ctx.fillStyle = 'rgba(200,230,255,0.15)';
    const wSize = 12, wGap = 20;
    for (let wx = b.x + 15; wx < b.x + b.w - 15; wx += wSize + wGap) {
      for (let wy = b.y + 15; wy < b.y + b.h - 15; wy += wSize + wGap) {
        ctx.fillRect(wx, wy, wSize, wSize);
      }
    }

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }

  // Park / green spaces
  ctx.fillStyle = '#3a7a30';
  ctx.fillRect(2200, 2200, 350, 350);
  ctx.fillStyle = '#4a9a40';
  ctx.beginPath();
  ctx.arc(2375, 2375, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3a7a30';
  ctx.fillRect(700, 2200, 250, 350);
}

function drawStores() {
  for (const s of stores) {
    // Store icon
    ctx.fillStyle = '#f39c12';
    ctx.fillRect(s.x - 20, s.y - 20, 40, 40);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.label, s.x, s.y);

    // Neon glow
    ctx.shadowColor = '#f39c12';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x - 20, s.y - 20, 40, 40);
    ctx.shadowBlur = 0;
  }
}

function drawVehicles() {
  for (const v of vehicles) {
    if (v.x < -9000) continue;

    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);

    // Car shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-22, -12, 44, 24);

    // Car body
    ctx.fillStyle = v.hp < 30 ? '#e74c3c' : v.color;
    ctx.fillRect(-20, -10, 40, 20);

    // Windshield
    ctx.fillStyle = 'rgba(150,220,255,0.5)';
    ctx.fillRect(-4, -8, 14, 16);

    // Wheels
    ctx.fillStyle = '#222';
    ctx.fillRect(-18, -13, 8, 6);
    ctx.fillRect(-18,  7,  8, 6);
    ctx.fillRect(10,  -13, 8, 6);
    ctx.fillRect(10,   7,  8, 6);

    // Headlights
    ctx.fillStyle = '#fff8b0';
    ctx.fillRect(18, -8, 4, 5);
    ctx.fillRect(18,  3, 4, 5);

    // Damage smoke
    if (v.hp < 40) {
      ctx.fillStyle = `rgba(100,100,100,${(40 - v.hp) / 80})`;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Driver name label
    if (v.driverId && players[v.driverId]) {
      const p = players[v.driverId];
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(p.name).width + 8;
      ctx.fillRect(v.x - tw/2, v.y - 38, tw, 14);
      ctx.fillStyle = '#fff';
      ctx.fillText(p.name, v.x, v.y - 27);
    }
  }
}

function drawPlayers() {
  for (const [id, p] of Object.entries(players)) {
    if (p.inVehicle || p.dead) continue;

    ctx.save();
    ctx.translate(p.x, p.y);

    const isMe = id === myId;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 6, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = isMe ? '#ffffff' : p.color;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator (aiming)
    ctx.rotate(p.angle);
    ctx.fillStyle = isMe ? '#e74c3c' : 'rgba(255,80,80,0.8)';
    ctx.fillRect(8, -3, 12, 6);

    // Gun
    ctx.fillStyle = '#333';
    ctx.fillRect(12, -1.5, 10, 3);

    ctx.restore();

    // Nametag
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Arial';

    // Wanted stars above name
    if (p.wanted > 0) {
      const starStr = '★'.repeat(p.wanted);
      ctx.fillStyle = '#f1c40f';
      ctx.font = '9px Arial';
      ctx.fillText(starStr, p.x, p.y - 30);
    }

    // Name
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = isMe ? '#fff' : '#ddd';
    ctx.fillText(p.name || 'Player', p.x, p.y - 20);

    // Health bar under name
    const bw = 40, bh = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(p.x - bw/2, p.y - 16, bw, bh);
    const hpPct = Math.max(0, p.hp / 100);
    ctx.fillStyle = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(p.x - bw/2, p.y - 16, bw * hpPct, bh);
  }
}

function drawBullets() {
  ctx.fillStyle = '#ffe066';
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
    // Tracer
    ctx.strokeStyle = 'rgba(255,220,80,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - (mouseWorld.x - b.x) * 0.01, b.y - (mouseWorld.y - b.y) * 0.01);
    ctx.stroke();
  }
}

// ── Minimap ───────────────────────────────────────────────────────────────────
function drawMinimap() {
  const mw = 180, mh = 180;
  const scale = mw / worldW;

  mmCtx.clearRect(0, 0, mw, mh);

  // BG
  mmCtx.fillStyle = '#1a2a1a';
  mmCtx.beginPath();
  mmCtx.arc(mw/2, mh/2, mw/2, 0, Math.PI*2);
  mmCtx.fill();

  // Clip to circle
  mmCtx.save();
  mmCtx.beginPath();
  mmCtx.arc(mw/2, mh/2, mw/2 - 2, 0, Math.PI*2);
  mmCtx.clip();

  // Roads
  mmCtx.fillStyle = '#555';
  for (const r of roads) {
    mmCtx.fillRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
  }

  // Stores
  mmCtx.fillStyle = '#f39c12';
  for (const s of stores) {
    mmCtx.fillRect(s.x * scale - 2, s.y * scale - 2, 4, 4);
  }

  // Players
  for (const [id, p] of Object.entries(players)) {
    mmCtx.fillStyle = id === myId ? '#fff' : p.color || '#e74c3c';
    mmCtx.beginPath();
    mmCtx.arc(p.x * scale, p.y * scale, id === myId ? 3.5 : 2.5, 0, Math.PI*2);
    mmCtx.fill();
  }

  // Vehicles (free ones)
  for (const v of vehicles) {
    if (v.driverId || v.x < -9000) continue;
    mmCtx.fillStyle = v.color;
    mmCtx.fillRect(v.x * scale - 2, v.y * scale - 2, 4, 3);
  }

  mmCtx.restore();
}

// ── HUD update ────────────────────────────────────────────────────────────────
function updateHUD() {
  if (!myPlayer) return;

  // Health
  const hpPct = Math.max(0, myPlayer.hp / 100) * 100;
  healthFill.style.width = hpPct + '%';
  healthFill.style.background = hpPct > 50
    ? 'linear-gradient(90deg,#2ecc71,#27ae60)'
    : hpPct > 25
    ? 'linear-gradient(90deg,#f39c12,#e67e22)'
    : 'linear-gradient(90deg,#e74c3c,#c0392b)';

  // Money
  moneyEl.textContent = '$' + myPlayer.money.toLocaleString();

  // Wanted stars
  for (let i = 0; i < 5; i++) {
    wantedStars[i].classList.toggle('active', i < myPlayer.wanted);
  }

  // Vehicle
  vehicleInd.style.display = myPlayer.inVehicle ? 'block' : 'none';
  if (myPlayer.inVehicle) {
    const v = vehicles.find(v => v.id === myPlayer.inVehicle);
    vhpWrap.style.display = v ? 'block' : 'none';
    if (v) vhpFill.style.width = v.hp + '%';
  } else {
    vhpWrap.style.display = 'none';
  }

  // Scoreboard
  const sorted = Object.values(players)
    .filter(p => !p.dead || true)
    .sort((a, b) => b.money - a.money)
    .slice(0, 8);
  scoreList.innerHTML = sorted.map(p =>
    `<div class="score-row">
      <span style="color:${p.id===myId?'#fff':p.color}">${p.name||'Player'}</span>
      <span class="kills">${p.kills||0}K</span>
      <span class="money-s">$${(p.money||0).toLocaleString()}</span>
    </div>`
  ).join('');
}

// ── Notifications ─────────────────────────────────────────────────────────────
function showNotif(msg, color = '#e74c3c') {
  const el = document.createElement('div');
  el.className = 'notif';
  el.style.borderLeftColor = color;
  el.textContent = msg;
  notifWrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }, 3000);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function dist(a, b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Initial canvas size
resizeCanvas();
