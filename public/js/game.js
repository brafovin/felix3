// ─────────────────────────────────────────────────────────────────────────────
// GTA Online Clone — Client (v2 — Owner Edition)
// ─────────────────────────────────────────────────────────────────────────────
const socket = io();

// DOM
const lobby      = document.getElementById('lobby');
const nameInput  = document.getElementById('name-input');
const playBtn    = document.getElementById('play-btn');
const canvas     = document.getElementById('canvas');
const ctx        = canvas.getContext('2d');
const hud        = document.getElementById('hud');
const mmCv       = document.getElementById('mm-canvas');
const mmCtx      = mmCv.getContext('2d');
const hpFill     = document.getElementById('hp-fill');
const armorWrap  = document.getElementById('armor-wrap');
const armorFill  = document.getElementById('armor-fill');
const vhpWrap    = document.getElementById('vhp-wrap');
const vhpFill    = document.getElementById('vhp-fill');
const vehInd     = document.getElementById('veh-ind');
const moneyEl    = document.getElementById('money');
const wantedStars= [1,2,3,4,5].map(i => document.getElementById('s'+i));
const scoreList  = document.getElementById('score-list');
const deadEl     = document.getElementById('dead');
const weaponHud  = document.getElementById('weapon-hud');
const storePrompt= document.getElementById('store-prompt');
const notifs     = document.getElementById('notifs');
const ownerPanel = document.getElementById('owner-panel');
const btnGodmode = document.getElementById('btn-godmode');
const btnRefill  = document.getElementById('btn-refill');
const btnClearW  = document.getElementById('btn-clearwanted');
const btnMaxMon  = document.getElementById('btn-maxmoney');

// State
let myId = null;
let worldW = 4000, worldH = 4000;
let roads = [], stores = [], vehicles = [], players = {}, bullets = [];
let weaponPickups = [], armorPickups = [];
let weaponDefs = {}, vehicleTypes = {};
let myPlayer = null;
let gameStarted = false;
let isOwner = false;
let godmodeOn = false;
const explosionFX = []; // { x, y, r, maxR, life, maxLife }
const interpTargets = {};

// Camera
const cam = { x: 0, y: 0, zoom: 1 };

// Input
const keys = {};
let mouseScreen = { x: 0, y: 0 };
let mouseWorld  = { x: 0, y: 0 };
let mouseDown   = false;
let lastShotTs  = 0;
let enterCarQ   = false;
let robStoreQ   = false;
let toggleGodQ  = null;
let clearWantedQ= false;
let refillWepsQ = false;
let spawnVehQ   = null;
let maxMoneyQ   = false;

// Weapon slot icons
const WEAPON_ICONS = { pistol:'🔫', smg:'🔫', ak47:'🔫', sniper:'🎯', shotgun:'💥', rpg:'🚀' };
const WEAPON_ORDER = ['pistol','smg','ak47','sniper','shotgun','rpg'];

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

// ── Socket ────────────────────────────────────────────────────────────────────
socket.on('init', d => {
  myId = d.id;
  worldW = d.worldW; worldH = d.worldH;
  roads = d.roads; stores = d.stores;
  vehicles = d.vehicles;
  weaponPickups = d.weaponPickups;
  armorPickups  = d.armorPickups;
  weaponDefs    = d.weaponDefs;
  vehicleTypes  = d.vehicleTypes;
  for (const p of d.players) players[p.id] = p;
  myPlayer = players[myId];
  if (myPlayer) { cam.x = myPlayer.x; cam.y = myPlayer.y; }
  buildWeaponHUD();
});

socket.on('playerJoined',   p    => { players[p.id] = p; showNotif(`${p.name} ist beigetreten`, '#3498db'); });
socket.on('playerLeft',     id   => { delete players[id]; delete interpTargets[id]; });
socket.on('playerUpdate',   p    => { players[p.id] = p; });
socket.on('playerDied',    ({id}) => { if (players[id]) players[id].dead = true; });
socket.on('playerRespawned', p   => {
  players[p.id] = p;
  if (p.id === myId) { deadEl.classList.remove('show'); myPlayer = p; }
});
socket.on('ownerGranted', () => {
  isOwner = true;
  ownerPanel.style.display = 'block';
  showNotif('👑 WILLKOMMEN, OWNER! Du hast alles.', '#FFD700');
});
socket.on('state', d => {
  for (const p of d.players) {
    if (p.id === myId) {
      if (myPlayer) {
        myPlayer.hp = p.hp; myPlayer.armor = p.armor;
        myPlayer.money = p.money; myPlayer.wanted = p.wanted;
        myPlayer.dead = p.dead; myPlayer.kills = p.kills; myPlayer.deaths = p.deaths;
        myPlayer.weapons = p.weapons; myPlayer.currentWeapon = p.currentWeapon;
        myPlayer.godmode = p.godmode;
        godmodeOn = p.godmode;
      }
    } else {
      interpTargets[p.id] = p;
      if (!players[p.id]) players[p.id] = p;
    }
  }
  vehicles = d.vehicles;
  bullets  = d.bullets;
  weaponPickups = d.weaponPickups;
  armorPickups  = d.armorPickups;
  for (const ex of (d.explosions || [])) spawnExplosionFX(ex.x, ex.y, ex.radius);
});
socket.on('notification', ({ msg, color }) => showNotif(msg, color));

// ── Input ─────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (!gameStarted) return;
  if (k === 'e') enterCarQ = true;
  if (k === 'f') robStoreQ = true;
  // Weapon switch 1-6
  const wIdx = parseInt(e.key) - 1;
  if (wIdx >= 0 && wIdx < WEAPON_ORDER.length && myPlayer) {
    const wk = WEAPON_ORDER[wIdx];
    if (myPlayer.weapons && myPlayer.weapons[wk] !== 0) {
      myPlayer.currentWeapon = wk;
      pendingWeaponSwitch = wk;
    }
  }
  // Owner keys
  if (isOwner) {
    if (k === 'g') { toggleGodQ = !godmodeOn; }
    if (k === 'x') clearWantedQ = true;
    if (k === 'r') refillWepsQ = true;
  }
  e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousemove', e => { mouseScreen.x = e.clientX; mouseScreen.y = e.clientY; });
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  cam.zoom = Math.max(0.3, Math.min(2.2, cam.zoom - e.deltaY * 0.001));
}, { passive: true });
window.addEventListener('resize', resizeCanvas);

// Owner panel buttons (pointer-events: all in CSS)
btnGodmode.addEventListener('click', () => { toggleGodQ = !godmodeOn; });
btnRefill .addEventListener('click', () => { refillWepsQ = true; });
btnClearW .addEventListener('click', () => { clearWantedQ = true; });
btnMaxMon .addEventListener('click', () => { maxMoneyQ = true; });
document.querySelectorAll('.vbtn').forEach(btn => {
  btn.addEventListener('click', () => { spawnVehQ = btn.dataset.v; });
});

let pendingWeaponSwitch = null;

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

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

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (!myPlayer || myPlayer.dead) return;

  const inCar = !!myPlayer.inVehicle;
  let carDef = null;
  if (inCar) {
    const v = vehicles.find(v => v.id === myPlayer.inVehicle);
    if (v) carDef = vehicleTypes[v.type] || vehicleTypes.sedan;
  }
  const maxSpeed = carDef ? carDef.maxSpeed : (keys['shift'] ? 3.0 : 1.9);
  const accel    = carDef ? carDef.accel    : 0.35;
  const friction = carDef ? 0.06 : 0.2;

  // Mouse angle
  const dx = mouseScreen.x - canvas.width / 2;
  const dy = mouseScreen.y - canvas.height / 2;
  const targetAngle = Math.atan2(dy, dx);

  if (inCar) {
    const fwd = keys['w'] || keys['arrowup'];
    const bck = keys['s'] || keys['arrowdown'];
    const lft = keys['a'] || keys['arrowleft'];
    const rgt = keys['d'] || keys['arrowright'];
    const spd = keys['shift'] ? maxSpeed * 1.4 : maxSpeed;

    myPlayer.speed = myPlayer.speed || 0;
    if (fwd) myPlayer.speed = Math.min(spd, myPlayer.speed + accel);
    else if (bck) myPlayer.speed = Math.max(-spd * 0.5, myPlayer.speed - accel);
    else myPlayer.speed *= (1 - friction);

    const tf = carDef ? carDef.turnFactor : 0.045;
    if (Math.abs(myPlayer.speed) > 0.05) {
      const dir = myPlayer.speed > 0 ? 1 : -1;
      if (lft) myPlayer.angle -= tf * Math.abs(myPlayer.speed) / spd * dir;
      if (rgt) myPlayer.angle += tf * Math.abs(myPlayer.speed) / spd * dir;
    }
    myPlayer.x += Math.cos(myPlayer.angle) * myPlayer.speed;
    myPlayer.y += Math.sin(myPlayer.angle) * myPlayer.speed;
  } else {
    let vx = 0, vy = 0;
    if (keys['w'] || keys['arrowup'])    vy -= 1;
    if (keys['s'] || keys['arrowdown'])  vy += 1;
    if (keys['a'] || keys['arrowleft'])  vx -= 1;
    if (keys['d'] || keys['arrowright']) vx += 1;
    if (vx || vy) {
      const len = Math.sqrt(vx*vx + vy*vy);
      myPlayer.x += (vx/len) * maxSpeed;
      myPlayer.y += (vy/len) * maxSpeed;
    }
    myPlayer.angle = targetAngle;
  }

  myPlayer.x = Math.max(10, Math.min(worldW - 10, myPlayer.x));
  myPlayer.y = Math.max(10, Math.min(worldH - 10, myPlayer.y));

  // Camera
  cam.x += (canvas.width/2  - myPlayer.x * cam.zoom - cam.x) * 0.1;
  cam.y += (canvas.height/2 - myPlayer.y * cam.zoom - cam.y) * 0.1;

  // Mouse world
  mouseWorld.x = (mouseScreen.x - cam.x) / cam.zoom;
  mouseWorld.y = (mouseScreen.y - cam.y) / cam.zoom;

  // Shooting
  const wKey = myPlayer.currentWeapon || 'pistol';
  const wDef = weaponDefs[wKey];
  const now  = performance.now();
  let shooting = false;
  if (mouseDown && wDef && now - lastShotTs > wDef.cooldown) {
    const ammo = myPlayer.weapons ? myPlayer.weapons[wKey] : 0;
    if (ammo !== 0) {
      lastShotTs = now;
      shooting = true;
      // Client-side bullet prediction (visual only)
      const sa = Math.atan2(mouseWorld.y - myPlayer.y, mouseWorld.x - myPlayer.x);
      for (let s = 0; s < Math.min(wDef.shots || 1, 3); s++) {
        const spread = (Math.random() - 0.5) * (wDef.spread || 0);
        clientBullets.push({
          x: myPlayer.x, y: myPlayer.y,
          vx: Math.cos(sa + spread) * wDef.speed,
          vy: Math.sin(sa + spread) * wDef.speed,
          life: wDef.life, weaponType: wKey, rocket: wDef.rocket,
        });
      }
    }
  }

  // Interpolate others
  for (const [id, tgt] of Object.entries(interpTargets)) {
    if (id === myId) continue;
    const p = players[id];
    if (!p) continue;
    p.x += (tgt.x - p.x) * 0.25;
    p.y += (tgt.y - p.y) * 0.25;
    p.angle += angleDiff(tgt.angle, p.angle) * 0.25;
    Object.assign(p, { hp: tgt.hp, armor: tgt.armor, money: tgt.money,
      wanted: tgt.wanted, dead: tgt.dead, inVehicle: tgt.inVehicle });
  }

  // Explosion FX tick
  for (let i = explosionFX.length - 1; i >= 0; i--) {
    const fx = explosionFX[i];
    fx.life--;
    if (fx.life <= 0) explosionFX.splice(i, 1);
  }

  // Client bullets tick
  for (let i = clientBullets.length - 1; i >= 0; i--) {
    const b = clientBullets[i];
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.life <= 0) clientBullets.splice(i, 1);
  }

  // Dead check
  if (myPlayer.dead) deadEl.classList.add('show');

  // Store proximity
  const nearStore = stores.find(s => dist(myPlayer, {x:s.x,y:s.y}) < 90);
  storePrompt.style.display = nearStore ? 'block' : 'none';

  // Send input
  const sa = Math.atan2(mouseWorld.y - myPlayer.y, mouseWorld.x - myPlayer.x);
  const inputData = {
    x: myPlayer.x, y: myPlayer.y,
    angle: myPlayer.angle, speed: myPlayer.speed || 0,
    shooting, shootAngle: sa,
    weapon: pendingWeaponSwitch || wKey,
    enterCar: enterCarQ, robStore: robStoreQ,
  };
  if (isOwner) {
    if (toggleGodQ !== null)  inputData.toggleGodmode = toggleGodQ;
    if (clearWantedQ)         inputData.clearWanted   = true;
    if (refillWepsQ)          inputData.refillWeapons  = true;
    if (spawnVehQ)            inputData.spawnVehicle   = spawnVehQ;
    if (maxMoneyQ)            inputData.maxMoney        = true;
  }
  socket.emit('input', inputData);

  enterCarQ = false; robStoreQ = false;
  toggleGodQ = null; clearWantedQ = false;
  refillWepsQ = false; spawnVehQ = null;
  pendingWeaponSwitch = null; maxMoneyQ = false;
}

// Client-side bullet FX (prediction)
const clientBullets = [];

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  ctx.save();
  ctx.fillStyle = '#2c5f25';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.zoom, cam.zoom);

  drawWorld();
  drawPickups();
  drawVehicles();
  drawBulletsFX();
  drawPlayers();
  drawStores();
  drawExplosions();

  ctx.restore();
  drawMinimap();
}

function drawWorld() {
  // Roads
  for (const r of roads) {
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // Dashed center line
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([35, 25]);
    ctx.beginPath();
    if (r.w > r.h) {
      ctx.moveTo(r.x, r.y + r.h/2); ctx.lineTo(r.x + r.w, r.y + r.h/2);
    } else {
      ctx.moveTo(r.x + r.w/2, r.y); ctx.lineTo(r.x + r.w/2, r.y + r.h);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Sidewalk
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  drawBuildings();
  ctx.strokeStyle = '#1a3a14'; ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, worldW, worldH);
}

const BLOCKS = [
  {x:100,y:100,w:240,h:240},{x:520,y:100,w:420,h:240},{x:1140,y:100,w:600,h:240},{x:1940,y:100,w:600,h:240},{x:2740,y:100,w:600,h:240},{x:3540,y:100,w:360,h:240},
  {x:100,y:540,w:240,h:400},{x:520,y:540,w:420,h:400},{x:1140,y:540,w:600,h:400},{x:1940,y:540,w:600,h:400},{x:2740,y:540,w:600,h:400},{x:3540,y:540,w:360,h:400},
  {x:100,y:1140,w:240,h:600},{x:520,y:1140,w:420,h:600},{x:1140,y:1140,w:600,h:600},{x:1940,y:1140,w:600,h:600},{x:2740,y:1140,w:600,h:600},{x:3540,y:1140,w:360,h:600},
  {x:100,y:1940,w:240,h:600},{x:520,y:1940,w:420,h:600},{x:1140,y:1940,w:600,h:600},{x:1940,y:1940,w:600,h:600},{x:2740,y:1940,w:600,h:600},{x:3540,y:1940,w:360,h:600},
  {x:100,y:2740,w:240,h:600},{x:520,y:2740,w:420,h:600},{x:1140,y:2740,w:600,h:600},{x:1940,y:2740,w:600,h:600},{x:2740,y:2740,w:600,h:600},{x:3540,y:2740,w:360,h:600},
  {x:100,y:3540,w:240,h:360},{x:520,y:3540,w:420,h:360},{x:1140,y:3540,w:600,h:360},{x:1940,y:3540,w:600,h:360},{x:2740,y:3540,w:600,h:360},{x:3540,y:3540,w:360,h:360},
];
const BCOLS = ['#8e7f6e','#7a6f5e','#6e6355','#9e8f7e','#857870','#7d7265'];

function drawBuildings() {
  for (let i = 0; i < BLOCKS.length; i++) {
    const b = BLOCKS[i];
    ctx.fillStyle = BCOLS[i % BCOLS.length];
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(200,230,255,0.12)';
    for (let wx = b.x+15; wx < b.x+b.w-10; wx += 32) {
      for (let wy = b.y+15; wy < b.y+b.h-10; wy += 32) {
        ctx.fillRect(wx, wy, 12, 12);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  // Parks
  ctx.fillStyle = '#357a2a';
  ctx.fillRect(2200, 2200, 360, 360);
  ctx.fillStyle = '#4a9a3f';
  ctx.beginPath(); ctx.arc(2380, 2380, 65, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#357a2a';
  ctx.fillRect(700, 2200, 250, 360);
}

function drawStores() {
  for (const s of stores) {
    ctx.save();
    ctx.shadowColor = '#f39c12'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#f39c12';
    ctx.fillRect(s.x - 22, s.y - 22, 44, 44);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000'; ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.label, s.x, s.y);
    ctx.restore();
  }
}

function drawPickups() {
  const t = performance.now() / 1000;
  // Weapon pickups
  for (const pu of weaponPickups) {
    if (!pu.active) continue;
    const pulse = 0.7 + 0.3 * Math.sin(t * 3 + pu.id);
    ctx.save();
    ctx.shadowColor = '#2ecc71'; ctx.shadowBlur = 12 * pulse;
    ctx.fillStyle = `rgba(46,204,113,${0.25 * pulse})`;
    ctx.beginPath(); ctx.arc(pu.x, pu.y, 18, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pu.x, pu.y, 18, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const wn = weaponDefs[pu.type] ? weaponDefs[pu.type].name : pu.type;
    ctx.fillText(wn.slice(0,4), pu.x, pu.y);
    ctx.restore();
  }
  // Armor pickups
  for (const pu of armorPickups) {
    if (!pu.active) continue;
    const pulse = 0.7 + 0.3 * Math.sin(t * 2.5 + pu.id.charCodeAt(0));
    ctx.save();
    ctx.shadowColor = '#3498db'; ctx.shadowBlur = 12 * pulse;
    ctx.fillStyle = `rgba(52,152,219,${0.25 * pulse})`;
    ctx.beginPath(); ctx.arc(pu.x, pu.y, 16, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#3498db'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pu.x, pu.y, 16, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🛡️', pu.x, pu.y);
    ctx.restore();
  }
}

function drawVehicles() {
  for (const v of vehicles) {
    if (v.x < -9000) continue;
    const def = vehicleTypes[v.type] || vehicleTypes.sedan || { w:40, h:20 };
    const hw = def.w / 2, hh = def.h / 2;

    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(-hw-2, -hh-2, def.w+4, def.h+4);

    // Body
    const damaged = v.hp / (v.maxHp || 100) < 0.3;
    ctx.fillStyle = damaged ? '#888' : v.color;
    ctx.fillRect(-hw, -hh, def.w, def.h);

    if (v.type === 'tank') {
      // Tank turret
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(-hw, -hh, def.w, def.h);
      ctx.fillStyle = '#1e8449';
      ctx.fillRect(-hw+5, -hh+5, def.w-10, def.h-10);
      ctx.fillStyle = '#145a32';
      ctx.fillRect(0, -4, hw+10, 8);
    } else {
      // Windshield
      ctx.fillStyle = 'rgba(150,220,255,0.5)';
      ctx.fillRect(-hw*0.1, -hh+2, def.w*0.35, def.h-4);
      // Wheels
      ctx.fillStyle = '#1a1a1a';
      const wr = 5, wl = 9;
      ctx.fillRect(-hw-2, -hh+2, wl, wr);
      ctx.fillRect(-hw-2,  hh-7, wl, wr);
      ctx.fillRect( hw-7, -hh+2, wl, wr);
      ctx.fillRect( hw-7,  hh-7, wl, wr);
      if (v.type === 'bike') {
        ctx.fillStyle = '#333';
        ctx.fillRect(-hw, -3, def.w, 6);
      }
      // Headlights
      ctx.fillStyle = '#fff8b0';
      ctx.fillRect(hw-4, -hh+3, 4, 4);
      ctx.fillRect(hw-4,  hh-7, 4, 4);
    }

    // Damage smoke
    if (v.hp / (v.maxHp || 100) < 0.4) {
      ctx.fillStyle = `rgba(90,90,90,${0.4 * (1 - v.hp / (v.maxHp||100))})`;
      ctx.beginPath(); ctx.arc(0, 0, hw, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();

    // Vehicle type label + driver
    if (v.driverId) {
      const dp = players[v.driverId];
      const label = dp ? dp.name : '';
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width + 10;
      ctx.fillRect(v.x - tw/2, v.y - def.h/2 - 20, tw, 14);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, v.x, v.y - def.h/2 - 9);
    }

    // HP bar above vehicle
    if (v.hp < (v.maxHp || 100)) {
      const bw = def.w;
      const hpPct = v.hp / (v.maxHp || 100);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(v.x - bw/2, v.y - def.h/2 - 8, bw, 4);
      ctx.fillStyle = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(v.x - bw/2, v.y - def.h/2 - 8, bw * hpPct, 4);
    }
  }
}

function drawPlayers() {
  for (const [id, p] of Object.entries(players)) {
    if (p.inVehicle || p.dead) continue;
    const isMe = id === myId;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(2, 7, 10, 5, 0, 0, Math.PI*2); ctx.fill();

    // Body glow for owner
    if (p.isOwner || p.godmode) {
      ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 18;
    }

    // Body circle
    ctx.fillStyle = isMe ? '#ffffff' : p.color;
    if (p.isOwner) ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Armor ring
    if (p.armor > 0) {
      ctx.strokeStyle = `rgba(52,152,219,${p.armor/100 * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.stroke();
    }

    // Aim arm + weapon
    ctx.rotate(p.angle);
    ctx.fillStyle = isMe ? '#e74c3c' : 'rgba(220,60,60,.85)';
    ctx.fillRect(9, -3, 10, 6);
    const wk = p.currentWeapon || 'pistol';
    if (wk === 'rpg') {
      ctx.fillStyle = '#555';
      ctx.fillRect(14, -3, 14, 6);
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(26, -2, 4, 4);
    } else if (wk === 'sniper') {
      ctx.fillStyle = '#333';
      ctx.fillRect(13, -2, 18, 4);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(21, -4, 2, 8);
    } else if (wk === 'shotgun') {
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(13, -3, 12, 6);
    } else {
      ctx.fillStyle = '#333';
      ctx.fillRect(13, -2, 12, 4);
    }

    ctx.restore();

    // Nametag
    ctx.textAlign = 'center';
    let nameY = p.y - 24;
    if (p.wanted > 0) {
      ctx.fillStyle = '#f1c40f';
      ctx.font = '9px Arial';
      ctx.fillText('★'.repeat(p.wanted), p.x, nameY - 10);
    }
    if (p.isOwner) {
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 11px Arial';
      ctx.fillText('👑 ' + (p.name || 'OWNER'), p.x, nameY);
    } else {
      ctx.fillStyle = isMe ? '#fff' : '#ccc'; ctx.font = 'bold 11px Arial';
      ctx.fillText(p.name || 'Player', p.x, nameY);
    }

    // HP bar
    const bw = 44;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(p.x - bw/2, nameY + 4, bw, 4);
    const hpPct = Math.max(0, p.hp / 100);
    ctx.fillStyle = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(p.x - bw/2, nameY + 4, bw * hpPct, 4);
  }
}

function drawBulletsFX() {
  // Server-authoritative bullets
  for (const b of bullets) {
    const col = b.weaponType === 'sniper' ? '#88ccff'
              : b.weaponType === 'rpg'    ? '#ff6600'
              : b.weaponType === 'shotgun'? '#ffaaaa'
              : '#ffe066';
    if (b.rocket) {
      ctx.save();
      ctx.fillStyle = '#ff6600';
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#ff4400'; ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.weaponType === 'sniper' ? 2 : 3, 0, Math.PI*2); ctx.fill();
    }
  }
  // Client prediction bullets
  for (const b of clientBullets) {
    const col = b.weaponType === 'sniper' ? '#88ccff' : b.weaponType === 'rpg' ? '#ff6600' : '#ffe066';
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawExplosions() {
  for (const fx of explosionFX) {
    const t = 1 - fx.life / fx.maxLife;
    const r = fx.maxR * (0.3 + t * 0.7);
    const alpha = (1 - t) * 0.9;
    ctx.save();
    // Outer blast
    const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
    g.addColorStop(0,   `rgba(255,255,180,${alpha})`);
    g.addColorStop(0.3, `rgba(255,120,0,${alpha * 0.8})`);
    g.addColorStop(0.7, `rgba(200,50,0,${alpha * 0.5})`);
    g.addColorStop(1,   `rgba(100,100,100,0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI*2); ctx.fill();
    // Smoke ring
    if (t > 0.3) {
      ctx.strokeStyle = `rgba(80,80,80,${(1-t)*0.4})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r * 1.2, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }
}

function spawnExplosionFX(x, y, radius) {
  explosionFX.push({ x, y, maxR: radius, life: 25, maxLife: 25 });
}

// ── Minimap ────────────────────────────────────────────────────────────────────
function drawMinimap() {
  const mw = 170, mh = 170;
  const scale = mw / worldW;
  mmCtx.clearRect(0, 0, mw, mh);

  mmCtx.fillStyle = '#1a2a1a';
  mmCtx.beginPath(); mmCtx.arc(mw/2, mh/2, mw/2, 0, Math.PI*2); mmCtx.fill();

  mmCtx.save();
  mmCtx.beginPath(); mmCtx.arc(mw/2, mh/2, mw/2-2, 0, Math.PI*2); mmCtx.clip();

  mmCtx.fillStyle = '#444';
  for (const r of roads) mmCtx.fillRect(r.x*scale, r.y*scale, r.w*scale, r.h*scale);

  mmCtx.fillStyle = '#f39c12';
  for (const s of stores) mmCtx.fillRect(s.x*scale-2, s.y*scale-2, 4, 4);

  for (const pu of weaponPickups) {
    if (!pu.active) continue;
    mmCtx.fillStyle = '#2ecc71';
    mmCtx.fillRect(pu.x*scale-1.5, pu.y*scale-1.5, 3, 3);
  }

  for (const [id, p] of Object.entries(players)) {
    if (p.dead) continue;
    const isMe = id === myId;
    mmCtx.fillStyle = p.isOwner ? '#FFD700' : isMe ? '#fff' : p.color || '#e74c3c';
    mmCtx.beginPath();
    mmCtx.arc(p.x*scale, p.y*scale, isMe ? 4 : 3, 0, Math.PI*2);
    mmCtx.fill();
  }
  for (const v of vehicles) {
    if (v.driverId || v.x < -9000) continue;
    mmCtx.fillStyle = v.color;
    mmCtx.fillRect(v.x*scale-2, v.y*scale-1.5, 4, 3);
  }
  mmCtx.restore();
}

// ── HUD ────────────────────────────────────────────────────────────────────────
function buildWeaponHUD() {
  weaponHud.innerHTML = '';
  WEAPON_ORDER.forEach((wk, i) => {
    const d = weaponDefs[wk];
    if (!d) return;
    const el = document.createElement('div');
    el.className = 'wslot';
    el.id = 'wslot_' + wk;
    el.innerHTML = `<span class="wkey">${i+1}</span><span class="wicon">${WEAPON_ICONS[wk]||'🔫'}</span><span class="wammo" id="wammo_${wk}">–</span>`;
    weaponHud.appendChild(el);
  });
}

function updateHUD() {
  if (!myPlayer) return;

  const hp = Math.max(0, myPlayer.hp);
  hpFill.style.width = hp + '%';
  hpFill.style.background = hp > 50 ? 'linear-gradient(90deg,#2ecc71,#27ae60)'
    : hp > 25 ? 'linear-gradient(90deg,#f39c12,#e67e22)' : 'linear-gradient(90deg,#e74c3c,#c0392b)';

  const armor = myPlayer.armor || 0;
  armorWrap.style.display = armor > 0 ? 'block' : 'none';
  armorFill.style.width = armor + '%';

  moneyEl.textContent = '$' + (myPlayer.money || 0).toLocaleString();

  for (let i = 0; i < 5; i++) wantedStars[i].classList.toggle('on', i < (myPlayer.wanted || 0));

  // Vehicle HP
  if (myPlayer.inVehicle) {
    const v = vehicles.find(v => v.id === myPlayer.inVehicle);
    if (v) {
      vhpWrap.style.display = 'block';
      vhpFill.style.width = Math.max(0, (v.hp / (v.maxHp||100)) * 100) + '%';
      const def = vehicleTypes[v.type] || {};
      vehInd.style.display = 'block';
      vehInd.textContent = `🚗 ${def.label || v.type} — E zum Aussteigen`;
    }
  } else {
    vhpWrap.style.display = 'none';
    vehInd.style.display = 'none';
  }

  // Weapon slots
  const weps = myPlayer.weapons || {};
  const cur  = myPlayer.currentWeapon || 'pistol';
  WEAPON_ORDER.forEach(wk => {
    const slot  = document.getElementById('wslot_' + wk);
    const ammoEl= document.getElementById('wammo_' + wk);
    if (!slot) return;
    const ammo = weps[wk];
    const empty = ammo === 0;
    slot.classList.toggle('active', wk === cur);
    slot.classList.toggle('empty',  empty);
    if (ammoEl) ammoEl.textContent = ammo === Infinity ? '∞' : (ammo ?? 0);
  });

  // Owner panel godmode button
  if (isOwner) {
    btnGodmode.textContent = godmodeOn ? '🛡️ Godmode: AN' : '🛡️ Godmode: AUS';
    btnGodmode.classList.toggle('active', godmodeOn);
    document.getElementById('godmode-status').textContent =
      godmodeOn ? '⚡ Unverwundbar — kein Schaden' : '';
  }

  // Scoreboard
  const sorted = Object.values(players).sort((a,b) => b.money - a.money).slice(0, 8);
  scoreList.innerHTML = sorted.map(p =>
    `<div class="srow">
      <span style="color:${p.isOwner?'#FFD700':p.id===myId?'#fff':p.color}">${p.isOwner?'👑 ':''} ${p.name||'?'}</span>
      <span class="k">${p.kills||0}K</span>
      <span class="m">$${(p.money||0).toLocaleString()}</span>
    </div>`
  ).join('');
}

// ── Notifications ─────────────────────────────────────────────────────────────
function showNotif(msg, color = '#e74c3c') {
  const el = document.createElement('div');
  el.className = 'notif';
  el.style.borderLeftColor = color;
  el.textContent = msg;
  notifs.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 3500);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function dist(a, b) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }
function angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= Math.PI*2;
  while (d < -Math.PI) d += Math.PI*2;
  return d;
}

// Handle maxMoney on server side
socket.on('maxMoney', () => { if (myPlayer) myPlayer.money = 9999999; });

resizeCanvas();
