const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ─────────────────────────────────────────────────────────────────
const WORLD_W       = 4000;
const WORLD_H       = 4000;
const TICK_RATE     = 30;
const CAR_ENTER_R   = 65;
const STORE_R       = 80;
const PICKUP_R      = 40;
const PLAYER_R      = 14;
const OWNER_NAME    = 'brafovin';
const MAX_POLICE    = 4;
const NPC_COUNT     = 35;
const WORLD_TIME_SPEED = 1 / (15 * 60 * (1000 / TICK_RATE)); // full cycle in 15 min

// ── Buildings (matches client BLOCKS) ────────────────────────────────────────
const BUILDINGS = [
  {x:100,y:100,w:240,h:240},{x:520,y:100,w:420,h:240},{x:1140,y:100,w:600,h:240},{x:1940,y:100,w:600,h:240},{x:2740,y:100,w:600,h:240},{x:3540,y:100,w:360,h:240},
  {x:100,y:540,w:240,h:400},{x:520,y:540,w:420,h:400},{x:1140,y:540,w:600,h:400},{x:1940,y:540,w:600,h:400},{x:2740,y:540,w:600,h:400},{x:3540,y:540,w:360,h:400},
  {x:100,y:1140,w:240,h:600},{x:520,y:1140,w:420,h:600},{x:1140,y:1140,w:600,h:600},{x:1940,y:1140,w:600,h:600},{x:2740,y:1140,w:600,h:600},{x:3540,y:1140,w:360,h:600},
  {x:100,y:1940,w:240,h:600},{x:520,y:1940,w:420,h:600},{x:1140,y:1940,w:600,h:600},{x:1940,y:1940,w:600,h:600},{x:2740,y:1940,w:600,h:600},{x:3540,y:1940,w:360,h:600},
  {x:100,y:2740,w:240,h:600},{x:520,y:2740,w:420,h:600},{x:1140,y:2740,w:600,h:600},{x:1940,y:2740,w:600,h:600},{x:2740,y:2740,w:600,h:600},{x:3540,y:2740,w:360,h:600},
  {x:100,y:3540,w:240,h:360},{x:520,y:3540,w:420,h:360},{x:1140,y:3540,w:600,h:360},{x:1940,y:3540,w:600,h:360},{x:2740,y:3540,w:600,h:360},{x:3540,y:3540,w:360,h:360},
];

// ── Collision ─────────────────────────────────────────────────────────────────
function resolveCollision(x, y, r) {
  for (const b of BUILDINGS) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.01;
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    }
  }
  return { x: Math.max(r, Math.min(WORLD_W - r, x)), y: Math.max(r, Math.min(WORLD_H - r, y)) };
}

// ── Weapons ───────────────────────────────────────────────────────────────────
const WEAPONS = {
  pistol:  { name:'Pistole', dmg:30,  speed:18, life:65,  cd:350,  ammoMax:Infinity, shots:1, spread:0,    exp:false, expR:0,   rocket:false },
  smg:     { name:'MP5',     dmg:18,  speed:20, life:50,  cd:100,  ammoMax:300,      shots:1, spread:0.06, exp:false, expR:0,   rocket:false },
  ak47:    { name:'AK-47',   dmg:45,  speed:22, life:75,  cd:220,  ammoMax:200,      shots:1, spread:0.04, exp:false, expR:0,   rocket:false },
  sniper:  { name:'Sniper',  dmg:150, speed:55, life:140, cd:1400, ammoMax:30,       shots:1, spread:0,    exp:false, expR:0,   rocket:false },
  shotgun: { name:'Shotgun', dmg:22,  speed:15, life:30,  cd:750,  ammoMax:60,       shots:8, spread:0.35, exp:false, expR:0,   rocket:false },
  rpg:     { name:'RPG',     dmg:180, speed:10, life:200, cd:2500, ammoMax:10,       shots:1, spread:0,    exp:true,  expR:120, rocket:true  },
};
const WEAPON_ORDER = ['pistol','smg','ak47','sniper','shotgun','rpg'];

// ── Vehicle types ─────────────────────────────────────────────────────────────
const VEHICLE_TYPES = {
  sedan:  { label:'Sedan',    maxSpeed:5.0, accel:0.18, hp:100, w:40, d:20, turn:0.045, fuel:100 },
  sports: { label:'Sports',   maxSpeed:8.5, accel:0.30, hp:80,  w:38, d:17, turn:0.055, fuel:80  },
  truck:  { label:'Truck',    maxSpeed:3.5, accel:0.10, hp:250, w:55, d:28, turn:0.030, fuel:120 },
  bike:   { label:'Motorrad', maxSpeed:9.0, accel:0.40, hp:60,  w:28, d:12, turn:0.065, fuel:60  },
  tank:   { label:'Panzer',   maxSpeed:2.5, accel:0.08, hp:999, w:60, d:30, turn:0.020, fuel:200 },
};

// ── Map data ──────────────────────────────────────────────────────────────────
const roads = [
  {x:0,y:400,w:4000,h:80},{x:0,y:1000,w:4000,h:80},{x:0,y:1800,w:4000,h:80},
  {x:0,y:2600,w:4000,h:80},{x:0,y:3400,w:4000,h:80},
  {x:400,y:0,w:80,h:4000},{x:1000,y:0,w:80,h:4000},{x:1800,y:0,w:80,h:4000},
  {x:2600,y:0,w:80,h:4000},{x:3400,y:0,w:80,h:4000},
];

const stores = [
  {x:700,y:650,label:'24/7',reward:2500},{x:1500,y:1400,label:'LTD',reward:3000},
  {x:2800,y:700,label:'24/7',reward:2500},{x:3200,y:2200,label:'Ammu',reward:4000},
  {x:600,y:3000,label:'LTD',reward:3000},{x:2200,y:3200,label:'24/7',reward:2500},
];

const gasStations = [
  {x:450,y:450,label:'Gulf'},{x:1950,y:1950,label:'BP'},{x:3450,y:450,label:'Shell'},
  {x:450,y:3450,label:'Esso'},{x:3450,y:3450,label:'Total'},
];

const weaponPickupDefs = [
  {x:850,y:450,type:'smg'},{x:1200,y:1050,type:'ak47'},{x:2000,y:450,type:'sniper'},
  {x:2800,y:1850,type:'shotgun'},{x:1850,y:2650,type:'rpg'},{x:3500,y:1050,type:'smg'},
  {x:550,y:1850,type:'ak47'},{x:3500,y:2650,type:'sniper'},{x:1200,y:3450,type:'shotgun'},
  {x:2650,y:3450,type:'rpg'},{x:1050,y:2650,type:'smg'},{x:2650,y:450,type:'ak47'},
];
let weaponPickups = weaponPickupDefs.map((d,i) => ({...d,id:i,active:true,respawnAt:0}));

const armorPickupDefs = [
  {x:500,y:450},{x:1100,y:1850},{x:1900,y:1050},{x:2700,y:2650},{x:3500,y:450},{x:500,y:3450},
];
let armorPickups = armorPickupDefs.map((d,i) => ({...d,id:`armor_${i}`,active:true,respawnAt:0}));

// ── Vehicles ──────────────────────────────────────────────────────────────────
let vehicleIdCtr = 0;
function makeVehicle(type, x, y, color, isPolice = false) {
  const def = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
  return { id:`car_${vehicleIdCtr++}`, type, label:def.label, x, y, angle:0,
    color: color || randCol(), driverId:null, speed:0,
    hp:def.hp, maxHp:def.hp, fuel:def.fuel, maxFuel:def.fuel, isPolice };
}
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#ecf0f1','#c0392b','#16a085'];
function randCol() { return COLORS[Math.floor(Math.random()*COLORS.length)]; }

function initVehicles() {
  const layout = [
    ['sedan',600,500],['sports',1100,500],['sedan',1900,500],['truck',2700,500],['sports',3500,500],
    ['sedan',600,1100],['bike',1100,1100],['sedan',1900,1100],['sedan',2700,1100],['sports',3500,1100],
    ['truck',600,1900],['sedan',1100,1900],['sports',1900,1900],['bike',2700,1900],['sedan',3500,1900],
    ['sedan',600,2700],['sports',1100,2700],['sedan',1900,2700],['truck',2700,2700],['sedan',3500,2700],
    ['bike',600,3500],['sedan',1100,3500],['sports',1900,3500],['sedan',2700,3500],['sports',3500,3500],
  ];
  return layout.map(([t,x,y]) => makeVehicle(t,x,y));
}

// ── NPCs (Passanten) ─────────────────────────────────────────────────────────
let npcIdCtr = 0;
const npcSpawnPts = [
  {x:700,y:450},{x:1100,y:450},{x:1900,y:450},{x:2700,y:450},{x:3500,y:450},
  {x:450,y:700},{x:450,y:1100},{x:450,y:1900},{x:450,y:2700},{x:450,y:3500},
  {x:1050,y:700},{x:1050,y:1900},{x:1050,y:2700},{x:1900,y:1050},{x:1900,y:2700},
  {x:2700,y:700},{x:2700,y:2700},{x:3450,y:700},{x:3450,y:1900},{x:3450,y:2700},
  {x:1500,y:1050},{x:2500,y:1050},{x:1500,y:2650},{x:2500,y:2650},
  {x:700,y:1050},{x:700,y:2650},{x:3300,y:1050},{x:3300,y:2650},
  {x:1900,y:3450},{x:2700,y:3450},{x:1050,y:3450},{x:3450,y:3450},
  {x:1500,y:1840},{x:2500,y:1840},{x:1900,y:2640},
];

function initNPCs() {
  return npcSpawnPts.slice(0, NPC_COUNT).map((p,i) => ({
    id: `npc_${npcIdCtr++}`,
    x: p.x + (Math.random()-0.5)*60,
    y: p.y + (Math.random()-0.5)*60,
    angle: Math.random() * Math.PI * 2,
    speed: 0.6 + Math.random() * 0.4,
    state: 'walk', // 'walk' | 'flee' | 'dead'
    hp: 30,
    fleeTimer: 0,
    turnTimer: Math.floor(Math.random() * 150),
    deadTimer: 0,
  }));
}

// ── Game state ────────────────────────────────────────────────────────────────
const players  = {};
const bullets  = [];
let   vehicles = initVehicles();
let   npcs     = initNPCs();
const policeUnits = []; // { id, x, y, angle, speed, hp, targetId, shootCd }
let   bulletIdCtr = 0;
let   policeIdCtr = 0;
let   worldTime  = 0.3; // 0=midnight 0.25=dawn 0.5=noon 0.75=dusk
let   weather    = 'clear'; // 'clear' | 'rain' | 'fog'
let   weatherTimer = 1800; // ticks until weather change
const storeRobCd = {};
const explosions = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function dist2(a,b) { return (a.x-b.x)**2 + (a.y-b.y)**2; }
function dist(a,b)  { return Math.sqrt(dist2(a,b)); }

function safeSpawn() {
  const pts = [{x:500,y:440},{x:1100,y:440},{x:1900,y:440},{x:2700,y:440},
               {x:500,y:1040},{x:1100,y:1040},{x:2700,y:1040},
               {x:500,y:1840},{x:1900,y:1840},{x:2700,y:1840}];
  return pts[Math.floor(Math.random()*pts.length)];
}

function defaultWeapons() { return {pistol:Infinity,smg:0,ak47:0,sniper:0,shotgun:0,rpg:0}; }
function ownerWeapons()   { return {pistol:Infinity,smg:999,ak47:999,sniper:999,shotgun:999,rpg:99}; }

function applyDamage(p, dmg) {
  if (p.godmode) return;
  const abs = Math.min(p.armor, dmg * 0.5);
  p.armor = Math.max(0, p.armor - abs);
  p.hp   -= dmg - abs;
}

function killPlayer(pid, killerId) {
  const p = players[pid]; if (!p || p.dead) return;
  p.hp = 0; p.dead = true;
  const loot = Math.floor(p.money * 0.3);
  p.money = Math.max(0, p.money - loot);
  p.deaths++;
  const killer = players[killerId];
  if (killer) {
    killer.money += loot; killer.kills++;
    if (!killer.isOwner) { killer.wanted = Math.min(5, killer.wanted+1); killer.wantedTimer = 400; }
    io.to(killerId).emit('notification',{msg:`Getötet! +$${loot}`,color:'#2ecc71'});
  }
  io.to(pid).emit('notification',{msg:`Du wurdest getötet! -$${loot}`,color:'#e74c3c'});
  io.emit('playerDied',{id:pid,killerId});
  if (p.inVehicle) {
    const v = vehicles.find(v=>v.id===p.inVehicle);
    if (v) { v.driverId=null; v.speed=0; }
    p.inVehicle = null;
  }
  setTimeout(()=>{
    if (!players[pid]) return;
    const sp = safeSpawn();
    Object.assign(players[pid],{x:sp.x,y:sp.y,hp:100,dead:false,wanted:0,wantedTimer:0,armor:0});
    if (players[pid].isOwner) { players[pid].armor=100; players[pid].money=Math.max(players[pid].money,999999); }
    io.emit('playerRespawned',players[pid]);
  }, 3000);
}

function doExplosion(x, y, r, ownerId, dmg) {
  explosions.push({x,y,r});
  for (const [pid,p] of Object.entries(players)) {
    if (p.dead) continue;
    const d = dist({x,y},p);
    if (d < r) { const f = 1-d/r; applyDamage(p,dmg*f); if (p.hp<=0) killPlayer(pid,ownerId); }
  }
  for (const v of vehicles) {
    if (v.x<-9000||v.type==='tank') continue;
    if (dist({x,y},v) < r) { v.hp = Math.max(0,v.hp-dmg*0.4); if (v.hp<=0) destroyVehicle(v,ownerId); }
  }
  for (const n of npcs) {
    if (n.state==='dead') continue;
    if (dist({x,y},n) < r*0.6) { n.hp=0; n.state='dead'; n.deadTimer=900; }
  }
}

function destroyVehicle(v, killerId) {
  if (v.driverId) {
    const dp = players[v.driverId];
    if (dp) { applyDamage(dp,50); dp.inVehicle=null; if (dp.hp<=0) killPlayer(dp.id,killerId); }
    v.driverId = null;
  }
  v.x=-9999; v.y=-9999; v.speed=0;
  setTimeout(()=>{
    v.hp=v.maxHp; v.fuel=v.maxFuel;
    const sp=safeSpawn(); v.x=sp.x+100; v.y=sp.y;
  }, 12000);
}

// ── Police AI ─────────────────────────────────────────────────────────────────
function spawnPolice() {
  const sp = safeSpawn();
  policeUnits.push({
    id:`police_${policeIdCtr++}`,
    x:sp.x, y:sp.y, angle:0, speed:0,
    hp:200, maxHp:200,
    targetId:null, shootCd:0,
  });
}

function updatePolice() {
  // Find most wanted player
  const wantedPlayers = Object.values(players)
    .filter(p => !p.dead && p.wanted >= 2)
    .sort((a,b) => b.wanted - a.wanted);

  // Spawn police if needed
  while (policeUnits.length < Math.min(MAX_POLICE, wantedPlayers.length * 2) && wantedPlayers.length > 0) {
    spawnPolice();
  }

  for (let i = policeUnits.length - 1; i >= 0; i--) {
    const cop = policeUnits[i];
    if (cop.hp <= 0) { policeUnits.splice(i,1); continue; }

    // Find target
    if (!wantedPlayers.length) { cop.speed *= 0.95; continue; }
    const target = wantedPlayers[i % wantedPlayers.length];
    if (!target) continue;
    cop.targetId = target.id;

    const dx = target.x - cop.x, dy = target.y - cop.y;
    const d = Math.sqrt(dx*dx+dy*dy);
    const targetAngle = Math.atan2(dy, dx);
    let da = targetAngle - cop.angle;
    while (da >  Math.PI) da -= Math.PI*2;
    while (da < -Math.PI) da += Math.PI*2;
    cop.angle += da * 0.08;

    const def = VEHICLE_TYPES.sedan;
    if (d > 80) {
      cop.speed = Math.min(def.maxSpeed * 0.9, cop.speed + def.accel);
    } else {
      cop.speed *= 0.85;
    }
    cop.x += Math.cos(cop.angle) * cop.speed;
    cop.y += Math.sin(cop.angle) * cop.speed;

    // Collision
    const r = resolveCollision(cop.x, cop.y, 22);
    cop.x = r.x; cop.y = r.y;

    // Shoot at target
    if (d < 400 && cop.shootCd <= 0) {
      cop.shootCd = 100;
      const sa = Math.atan2(target.y-cop.y, target.x-cop.x) + (Math.random()-0.5)*0.2;
      bullets.push({
        id:bulletIdCtr++, x:cop.x, y:cop.y,
        vx:Math.cos(sa)*18, vy:Math.sin(sa)*18,
        ownerId:'police', dmg:20, exp:false, expR:0, rocket:false,
        life:60, weaponType:'pistol',
      });
    }
    if (cop.shootCd > 0) cop.shootCd--;

    // Ram player on foot
    for (const p of Object.values(players)) {
      if (p.dead || p.inVehicle) continue;
      if (dist(cop, p) < 25 && cop.speed > 2) {
        applyDamage(p, 15); if (p.hp <= 0) killPlayer(p.id, 'police');
      }
    }
  }

  // Remove police when no wanted players
  if (!wantedPlayers.length && policeUnits.length > 0) {
    policeUnits.splice(0);
  }
}

// ── NPC AI ────────────────────────────────────────────────────────────────────
function updateNPCs() {
  // Check if any gunfire is happening
  const hasGunfire = bullets.length > 0;

  for (const npc of npcs) {
    if (npc.state === 'dead') {
      npc.deadTimer--;
      if (npc.deadTimer <= 0) {
        // Respawn at random location
        const sp = npcSpawnPts[Math.floor(Math.random()*npcSpawnPts.length)];
        Object.assign(npc, { x:sp.x+(Math.random()-0.5)*60, y:sp.y+(Math.random()-0.5)*60,
          state:'walk', hp:30, fleeTimer:0, turnTimer:50 });
      }
      continue;
    }

    // Detect nearby threats
    if (npc.state === 'walk' && hasGunfire) {
      // Check if any bullet is nearby
      for (const b of bullets) {
        if (dist(npc,b) < 180) { npc.state='flee'; npc.fleeTimer=250; break; }
      }
      // Check if player is shooting nearby
      for (const p of Object.values(players)) {
        if (!p.dead && dist(npc,p) < 120) { npc.state='flee'; npc.fleeTimer=250; break; }
      }
    }

    if (npc.state === 'flee') {
      npc.fleeTimer--;
      if (npc.fleeTimer <= 0) npc.state = 'walk';
    }

    const spd = npc.state === 'flee' ? 2.2 : npc.speed;

    // Random direction change
    npc.turnTimer--;
    if (npc.turnTimer <= 0) {
      if (npc.state === 'flee') {
        // Run away from nearest threat
        let fx=0, fy=0;
        for (const b of bullets) { const d=dist(npc,b); if(d<250){fx+=npc.x-b.x;fy+=npc.y-b.y;} }
        if (fx||fy) { const l=Math.sqrt(fx*fx+fy*fy); npc.angle=Math.atan2(fy/l,fx/l); }
        else npc.angle += (Math.random()-0.5)*0.8;
      } else {
        npc.angle += (Math.random()-0.5)*1.5;
      }
      npc.turnTimer = 40 + Math.floor(Math.random()*120);
    }

    npc.x += Math.cos(npc.angle)*spd;
    npc.y += Math.sin(npc.angle)*spd;

    // Building collision
    const r2 = resolveCollision(npc.x, npc.y, 10);
    if (r2.x !== npc.x || r2.y !== npc.y) { npc.x=r2.x; npc.y=r2.y; npc.angle+=Math.PI*(0.5+Math.random()); }

    // Vehicle collision (get run over)
    for (const v of vehicles) {
      if (v.x<-9000||!v.driverId) continue;
      if (dist(npc,v)<20 && Math.abs(v.speed)>2.5) { npc.state='dead'; npc.hp=0; npc.deadTimer=600; }
    }
    for (const cop of policeUnits) {
      if (dist(npc,cop)<20) { npc.angle=Math.atan2(npc.y-cop.y,npc.x-cop.x); }
    }
  }
}

// ── Socket handlers ───────────────────────────────────────────────────────────
io.on('connection', socket => {
  const sp = safeSpawn();
  players[socket.id] = {
    id:socket.id, name:'Player',
    x:sp.x, y:sp.y, angle:0, speed:0,
    hp:100, maxHp:100, armor:0,
    money:1000, wanted:0, wantedTimer:0,
    inVehicle:null, dead:false,
    color:['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e','#e91e63','#00bcd4','#8bc34a','#ff5722'][Math.floor(Math.random()*12)],
    kills:0, deaths:0,
    weapons:defaultWeapons(), currentWeapon:'pistol',
    isOwner:false, godmode:false,
  };

  socket.emit('init',{
    id:socket.id, roads, stores, gasStations, worldW:WORLD_W, worldH:WORLD_H,
    vehicles, players:Object.values(players),
    weaponPickups, armorPickups, weaponDefs:WEAPONS, vehicleTypes:VEHICLE_TYPES,
    buildings:BUILDINGS, worldTime, weather,
  });
  socket.broadcast.emit('playerJoined', players[socket.id]);

  socket.on('setName', raw => {
    const p = players[socket.id]; if (!p) return;
    p.name = String(raw).slice(0,20).trim() || 'Player';
    if (p.name.toLowerCase() === OWNER_NAME.toLowerCase()) {
      Object.assign(p,{ isOwner:true, godmode:false, color:'#FFD700',
        money:9999999, armor:100, weapons:ownerWeapons(), wanted:0 });
      socket.emit('ownerGranted');
      socket.emit('notification',{msg:'👑 OWNER-MODUS! Alles freigeschaltet.',color:'#FFD700'});
    }
    io.emit('playerUpdate', p);
  });

  socket.on('input', data => {
    const p = players[socket.id]; if (!p||p.dead) return;

    p.x = Math.max(0, Math.min(WORLD_W, data.x));
    p.y = Math.max(0, Math.min(WORLD_H, data.y));
    p.angle = data.angle; p.speed = data.speed||0;

    // Building collision
    if (!p.inVehicle) {
      const r = resolveCollision(p.x, p.y, PLAYER_R);
      p.x=r.x; p.y=r.y;
    }

    // Weapon switch
    if (data.weapon && WEAPONS[data.weapon]) p.currentWeapon = data.weapon;

    // Sync vehicle
    if (p.inVehicle) {
      const v = vehicles.find(v=>v.id===p.inVehicle);
      if (v) {
        v.x=p.x; v.y=p.y; v.angle=p.angle; v.speed=p.speed;
        // Fuel drain
        if (Math.abs(v.speed)>0.1 && v.type!=='tank') {
          v.fuel = Math.max(0, v.fuel - 0.015);
          if (v.fuel<=0) { v.speed*=0.9; }
        }
        // Building collision for vehicle
        const vdef = VEHICLE_TYPES[v.type]||VEHICLE_TYPES.sedan;
        const vr = resolveCollision(v.x, v.y, vdef.w/2+4);
        if (vr.x!==v.x||vr.y!==v.y) { v.speed*=-0.3; v.x=vr.x; v.y=vr.y; p.x=vr.x; p.y=vr.y; }
      }
    }

    // Shoot on foot
    if (data.shooting && !p.inVehicle) {
      const wk = p.currentWeapon; const wd = WEAPONS[wk];
      if (!wd) return;
      const ammo = p.weapons[wk];
      if (ammo===0) return;
      for (let s=0; s<wd.shots; s++) {
        const sp2 = (Math.random()-0.5)*wd.spread;
        const a = data.shootAngle+sp2;
        bullets.push({ id:bulletIdCtr++, x:p.x, y:p.y,
          vx:Math.cos(a)*wd.speed, vy:Math.sin(a)*wd.speed,
          ownerId:socket.id, dmg:wd.dmg, exp:wd.exp, expR:wd.expR,
          rocket:wd.rocket, life:wd.life, weaponType:wk });
      }
      if (ammo!==Infinity && p.weapons[wk]>0) {
        p.weapons[wk]--;
        if (p.weapons[wk]===0 && wk!=='pistol') {
          p.currentWeapon='pistol';
          socket.emit('notification',{msg:`Keine Munition: ${wd.name}`,color:'#e74c3c'});
        }
      }
    }

    // Drive-by
    if (data.shooting && p.inVehicle) {
      const sa = data.shootAngle;
      bullets.push({ id:bulletIdCtr++, x:p.x, y:p.y,
        vx:Math.cos(sa)*18, vy:Math.sin(sa)*18,
        ownerId:socket.id, dmg:18, exp:false, expR:0, rocket:false,
        life:65, weaponType:'pistol' });
    }

    // Enter/exit vehicle
    if (data.enterCar) {
      if (p.inVehicle) {
        const v = vehicles.find(v=>v.id===p.inVehicle);
        if (v) { v.driverId=null; v.speed=0; }
        p.inVehicle=null;
      } else {
        const allVehicles = [...vehicles, ...policeUnits.map(c=>({id:c.id,x:c.x,y:c.y,driverId:c.driverId||null,type:'sedan'}))];
        const near = vehicles.filter(v=>!v.driverId&&dist(p,v)<CAR_ENTER_R&&v.x>-9000)
                             .sort((a,b)=>dist(p,a)-dist(p,b))[0];
        if (near) { near.driverId=socket.id; p.inVehicle=near.id; p.x=near.x; p.y=near.y; }
      }
    }

    // Rob store
    if (data.robStore) {
      const now=Date.now();
      if ((now-(storeRobCd[socket.id]||0))>8000) {
        const s=stores.find(s=>dist(p,{x:s.x,y:s.y})<STORE_R);
        if (s) {
          storeRobCd[socket.id]=now;
          p.money+=s.reward;
          if (!p.isOwner){p.wanted=Math.min(5,p.wanted+2);p.wantedTimer=600;}
          socket.emit('notification',{msg:`${s.label} ausgeraubt! +$${s.reward}`,color:'#f39c12'});
        }
      }
    }

    // Refuel at gas station
    if (data.refuel && p.inVehicle) {
      const v=vehicles.find(v=>v.id===p.inVehicle);
      if (v) {
        const gs=gasStations.find(g=>dist(p,{x:g.x,y:g.y})<60);
        if (gs && p.money>=50) {
          const need = v.maxFuel-v.fuel;
          const cost = Math.ceil(need*0.5);
          if (p.money>=cost && need>1) {
            v.fuel=v.maxFuel; p.money-=cost;
            socket.emit('notification',{msg:`${gs.label}: Vollgetankt! -$${cost}`,color:'#3498db'});
          }
        }
      }
    }

    // Owner commands
    if (p.isOwner) {
      if (data.toggleGodmode!==undefined) { p.godmode=!!data.toggleGodmode; socket.emit('notification',{msg:p.godmode?'🛡️ GODMODE AN':'💀 Godmode aus',color:'#FFD700'}); }
      if (data.clearWanted) { p.wanted=0; p.wantedTimer=0; socket.emit('notification',{msg:'⭐ Wanted gelöscht',color:'#FFD700'}); }
      if (data.refillWeapons) { p.weapons=ownerWeapons(); socket.emit('notification',{msg:'🔫 Alle Waffen voll!',color:'#FFD700'}); }
      if (data.maxMoney) { p.money=9999999; socket.emit('notification',{msg:'💰 $9.999.999!',color:'#FFD700'}); }
      if (data.spawnVehicle && VEHICLE_TYPES[data.spawnVehicle]) {
        const cols={sedan:'#c0392b',sports:'#f39c12',truck:'#2c3e50',bike:'#9b59b6',tank:'#27ae60'};
        const off=90;
        const v=makeVehicle(data.spawnVehicle, p.x+Math.cos(p.angle+Math.PI/2)*off, p.y+Math.sin(p.angle+Math.PI/2)*off, cols[data.spawnVehicle]);
        vehicles.push(v);
        socket.emit('notification',{msg:`🚗 ${VEHICLE_TYPES[data.spawnVehicle].label} gespawnt!`,color:'#FFD700'});
      }
    }
  });

  socket.on('disconnect', () => {
    const p=players[socket.id];
    if (p?.inVehicle) { const v=vehicles.find(v=>v.id===p.inVehicle); if(v){v.driverId=null;v.speed=0;} }
    delete players[socket.id];
    delete storeRobCd[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// ── Server tick ───────────────────────────────────────────────────────────────
setInterval(()=>{
  const now = Date.now();

  // World time & weather
  worldTime = (worldTime + WORLD_TIME_SPEED) % 1;
  weatherTimer--;
  if (weatherTimer<=0) {
    const opts = ['clear','clear','clear','rain','fog','rain'];
    weather = opts[Math.floor(Math.random()*opts.length)];
    weatherTimer = 900 + Math.floor(Math.random()*2700);
  }

  // Bullets
  for (let i=bullets.length-1; i>=0; i--) {
    const b=bullets[i];
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if (b.life<=0||b.x<0||b.x>WORLD_W||b.y<0||b.y>WORLD_H) {
      if (b.exp) doExplosion(b.x,b.y,b.expR,b.ownerId,b.dmg);
      bullets.splice(i,1); continue;
    }
    let hit=false;
    for (const [pid,p] of Object.entries(players)) {
      if (pid===b.ownerId||p.dead) continue;
      if (dist(b,p) < (p.inVehicle?28:18)) {
        if (b.exp) doExplosion(b.x,b.y,b.expR,b.ownerId,b.dmg);
        else { applyDamage(p,b.dmg); if(p.hp<=0) killPlayer(pid,b.ownerId); }
        hit=true; break;
      }
    }
    if (!hit) {
      for (const v of vehicles) {
        if (v.x<-9000) continue;
        const vd=VEHICLE_TYPES[v.type]||VEHICLE_TYPES.sedan;
        if (dist(b,v)<vd.w/2+8) {
          if (b.exp) doExplosion(b.x,b.y,b.expR,b.ownerId,b.dmg);
          else if (v.type!=='tank') { v.hp=Math.max(0,v.hp-b.dmg*0.2); if(v.hp<=0) destroyVehicle(v,b.ownerId); }
          hit=true; break;
        }
      }
    }
    if (!hit) {
      for (const cop of policeUnits) {
        if (dist(b,cop)<24 && b.ownerId!=='police') {
          cop.hp-=b.dmg*0.5; hit=true; break;
        }
      }
    }
    if (hit) bullets.splice(i,1);
  }

  // Police bullets can hit players
  // (already handled above via ownerId:'police')

  // Pickups
  for (const pu of weaponPickups) { if (!pu.active&&now>=pu.respawnAt) pu.active=true; }
  for (const pu of armorPickups)  { if (!pu.active&&now>=pu.respawnAt) pu.active=true; }
  for (const p of Object.values(players)) {
    if (p.dead) continue;
    for (const pu of weaponPickups) {
      if (!pu.active||dist(p,pu)>PICKUP_R) continue;
      pu.active=false; pu.respawnAt=now+30000;
      const wd=WEAPONS[pu.type];
      const add=wd.ammoMax===Infinity?Infinity:Math.floor(wd.ammoMax*0.5);
      p.weapons[pu.type]=wd.ammoMax===Infinity?Infinity:Math.min((p.weapons[pu.type]||0)+add,wd.ammoMax);
      io.to(p.id).emit('notification',{msg:`${wd.name} aufgehoben!`,color:'#2ecc71'});
    }
    for (const pu of armorPickups) {
      if (!pu.active||dist(p,pu)>PICKUP_R) continue;
      pu.active=false; pu.respawnAt=now+20000;
      p.armor=Math.min(100,p.armor+50);
      io.to(p.id).emit('notification',{msg:'🛡️ Rüstung +50',color:'#3498db'});
    }
  }

  // Wanted decay
  for (const p of Object.values(players)) {
    if (p.isOwner) { p.wanted=0; continue; }
    if (p.wantedTimer>0) { p.wantedTimer--; if(p.wantedTimer===0){p.wanted=Math.max(0,p.wanted-1);if(p.wanted>0)p.wantedTimer=300;} }
  }

  // NPC & Police
  updateNPCs();
  updatePolice();

  io.emit('state',{
    players:Object.values(players),
    bullets:bullets.map(b=>({id:b.id,x:b.x,y:b.y,weaponType:b.weaponType,rocket:b.rocket})),
    vehicles, weaponPickups, armorPickups,
    npcs:npcs.map(n=>({id:n.id,x:n.x,y:n.y,angle:n.angle,state:n.state})),
    police:policeUnits,
    explosions:[...explosions],
    worldTime, weather,
  });
  explosions.length=0;
}, TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log(`GTA 3D → http://localhost:${PORT}`));
