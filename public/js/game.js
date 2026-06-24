// GTA Online 3D — Three.js Client
'use strict';

const socket = io();

// ── DOM ───────────────────────────────────────────────────────────────────────
const lobby      = document.getElementById('lobby');
const nameInput  = document.getElementById('name-input');
const playBtn    = document.getElementById('play-btn');
const threeCanvas= document.getElementById('three-canvas');
const hud        = document.getElementById('hud');
const mmCv       = document.getElementById('mm-canvas');
const mmCtx      = mmCv.getContext('2d');
const hpFill     = document.getElementById('hp-fill');
const armorWrap  = document.getElementById('armor-wrap');
const armorFill  = document.getElementById('armor-fill');
const vhpWrap    = document.getElementById('vhp-wrap');
const vhpFill    = document.getElementById('vhp-fill');
const fuelWrap   = document.getElementById('fuel-wrap');
const fuelFill   = document.getElementById('fuel-fill');
const vehInd     = document.getElementById('veh-ind');
const moneyEl    = document.getElementById('money');
const wantedStars= [1,2,3,4,5].map(i => document.getElementById('s'+i));
const scoreList  = document.getElementById('score-list');
const deadEl     = document.getElementById('dead');
const weaponHud  = document.getElementById('weapon-hud');
const storePrompt= document.getElementById('store-prompt');
const fuelPrompt = document.getElementById('fuel-prompt');
const notifs     = document.getElementById('notifs');
const ownerPanel = document.getElementById('owner-panel');
const btnGodmode = document.getElementById('btn-godmode');
const btnRefill  = document.getElementById('btn-refill');
const btnClearW  = document.getElementById('btn-clearwanted');
const btnMaxMon  = document.getElementById('btn-maxmoney');
const weatherInd = document.getElementById('weather-ind');
const clockEl    = document.getElementById('clock');
const soundBtn   = document.getElementById('sound-btn');

// Reusable temp objects (avoid per-frame allocations)
const _tmpVec3 = new THREE.Vector3();
const _glowColor = new THREE.Color(0xaa7700);
const _buildingEmissive = new THREE.Color(0xffeeaa);

// ── Game State ────────────────────────────────────────────────────────────────
let myId = null, worldW = 4000, worldH = 4000;
let roads = [], stores = [], vehicles = [], players = {}, bullets = [];
let weaponPickups = [], armorPickups = [], npcs = [], policeUnits = [];
let weaponDefs = {}, vehicleTypes = {};
let myPlayer = null;
let gameStarted = false;
let isOwner = false, godmodeOn = false;
const interpTargets = {};
let worldTime = 0.3, weather = 'clear';

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
let mouseScreen = { x: window.innerWidth/2, y: window.innerHeight/2 };
let mouseDown = false;
let lastShotTs = 0;
let enterCarQ = false, robStoreQ = false, refuelQ = false;
let toggleGodQ = null, clearWantedQ = false, refillWepsQ = false;
let spawnVehQ = null, maxMoneyQ = false;
let pendingWeaponSwitch = null;

// Camera orbit state
let camYaw   = 0;      // horizontal orbit angle
let camPitch = 0.48;   // vertical angle (radians)
let camDist  = 260;    // distance from player
let rightMouseDown = false, lastRMX = 0, lastRMY = 0;
let aimAngle = 0;

const WEAPON_ICONS = { pistol:'🔫', smg:'🔫', ak47:'🔫', sniper:'🎯', shotgun:'💥', rpg:'🚀' };
const WEAPON_ORDER = ['pistol','smg','ak47','sniper','shotgun','rpg'];

const GAS_POSITIONS = [
  {x:450,y:450},{x:1950,y:1950},{x:3450,y:450},{x:450,y:3450},{x:3450,y:3450}
];

// ── Three.js Scene ─────────────────────────────────────────────────────────────
const scene    = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 1800, 4500);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth/window.innerHeight, 1, 6000);
camera.position.set(2000, 200, 2200);

const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lights
const ambLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambLight);

const sunLight = new THREE.DirectionalLight(0xfff5cc, 1.1);
sunLight.position.set(1000, 700, 500);
sunLight.castShadow = true;
sunLight.shadow.camera.near   = 1;
sunLight.shadow.camera.far    = 1400;
sunLight.shadow.camera.left   = -700;
sunLight.shadow.camera.right  = 700;
sunLight.shadow.camera.top    = 700;
sunLight.shadow.camera.bottom = -700;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.bias = -0.002;
scene.add(sunLight);
scene.add(sunLight.target);

// ── Static World Geometry ──────────────────────────────────────────────────────
const ROAD_DEFS = [
  {x:0,y:400,w:4000,h:80},{x:0,y:1000,w:4000,h:80},{x:0,y:1800,w:4000,h:80},
  {x:0,y:2600,w:4000,h:80},{x:0,y:3400,w:4000,h:80},
  {x:400,y:0,w:80,h:4000},{x:1000,y:0,w:80,h:4000},{x:1800,y:0,w:80,h:4000},
  {x:2600,y:0,w:80,h:4000},{x:3400,y:0,w:80,h:4000},
];

// Ground
const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(worldW, worldH),
  new THREE.MeshLambertMaterial({ color: 0x3a7a2a })
);
groundMesh.rotation.x = -Math.PI/2;
groundMesh.position.set(worldW/2, 0, worldH/2);
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Roads
const roadMat = new THREE.MeshLambertMaterial({ color: 0x484848 });
for (const r of ROAD_DEFS) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), roadMat);
  m.rotation.x = -Math.PI/2;
  m.position.set(r.x + r.w/2, 0.15, r.y + r.h/2);
  m.receiveShadow = true;
  scene.add(m);
}

// Road markings (center lines)
const markingMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
for (const r of ROAD_DEFS) {
  if (r.w > r.h) {
    // Horizontal road — vertical center line
    for (let sx = r.x + 50; sx < r.x + r.w - 50; sx += 80) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(50, 2), markingMat);
      m.rotation.x = -Math.PI/2;
      m.position.set(sx + 25, 0.2, r.y + r.h/2);
      scene.add(m);
    }
  } else {
    // Vertical road
    for (let sz = r.y + 50; sz < r.y + r.h - 50; sz += 80) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 50), markingMat);
      m.rotation.x = -Math.PI/2;
      m.position.set(r.x + r.w/2, 0.2, sz + 25);
      scene.add(m);
    }
  }
}

// Buildings
const BLOCKS = [
  {x:100,y:100,w:240,h:240},{x:520,y:100,w:420,h:240},{x:1140,y:100,w:600,h:240},{x:1940,y:100,w:600,h:240},{x:2740,y:100,w:600,h:240},{x:3540,y:100,w:360,h:240},
  {x:100,y:540,w:240,h:400},{x:520,y:540,w:420,h:400},{x:1140,y:540,w:600,h:400},{x:1940,y:540,w:600,h:400},{x:2740,y:540,w:600,h:400},{x:3540,y:540,w:360,h:400},
  {x:100,y:1140,w:240,h:600},{x:520,y:1140,w:420,h:600},{x:1140,y:1140,w:600,h:600},{x:1940,y:1140,w:600,h:600},{x:2740,y:1140,w:600,h:600},{x:3540,y:1140,w:360,h:600},
  {x:100,y:1940,w:240,h:600},{x:520,y:1940,w:420,h:600},{x:1140,y:1940,w:600,h:600},{x:1940,y:1940,w:600,h:600},{x:2740,y:1940,w:600,h:600},{x:3540,y:1940,w:360,h:600},
  {x:100,y:2740,w:240,h:600},{x:520,y:2740,w:420,h:600},{x:1140,y:2740,w:600,h:600},{x:1940,y:2740,w:600,h:600},{x:2740,y:2740,w:600,h:600},{x:3540,y:2740,w:360,h:600},
  {x:100,y:3540,w:240,h:360},{x:520,y:3540,w:420,h:360},{x:1140,y:3540,w:600,h:360},{x:1940,y:3540,w:600,h:360},{x:2740,y:3540,w:600,h:360},{x:3540,y:3540,w:360,h:360},
];
const BCOLS = [0x8e7f6e,0x7a6f5e,0x6e6355,0x9e8f7e,0x857870,0x7d7265,0x6a5d52,0x95867a];
const BHEIGHTS = BLOCKS.map((_, i) => [60, 140, 220, 100, 180, 80][(i * 7 + 3) % 6]);

const buildingMeshes = [];
for (let i = 0; i < BLOCKS.length; i++) {
  const b = BLOCKS[i];
  const bh = BHEIGHTS[i];
  const mat = new THREE.MeshLambertMaterial({ color: BCOLS[i % BCOLS.length] });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, bh, b.h), mat);
  mesh.position.set(b.x + b.w/2, bh/2, b.y + b.h/2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  buildingMeshes.push(mesh);
}

// Park
const parkMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(360, 360),
  new THREE.MeshLambertMaterial({ color: 0x2d7a22 })
);
parkMesh.rotation.x = -Math.PI/2;
parkMesh.position.set(2380, 0.2, 2380);
scene.add(parkMesh);

function addTree(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 4, 22, 6),
    new THREE.MeshLambertMaterial({ color: 0x5d3a1a })
  );
  trunk.position.set(x, 11, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const top = new THREE.Mesh(
    new THREE.ConeGeometry(20, 38, 7),
    new THREE.MeshLambertMaterial({ color: 0x2d6a14 })
  );
  top.position.set(x, 38, z);
  top.castShadow = true;
  scene.add(top);
}
[[2280,2280],[2330,2350],[2390,2260],[2440,2320],[2500,2280],
 [2300,2450],[2430,2470],[2490,2400],[2350,2390],[2490,2340]].forEach(([x,z])=>addTree(x,z));

// Stores (visible buildings)
const storeDefs = [
  {x:700,y:650},{x:1500,y:1400},{x:2800,y:700},
  {x:3200,y:2200},{x:600,y:3000},{x:2200,y:3200},
];
const storeBodyMat = new THREE.MeshLambertMaterial({ color: 0xd4870a });
const storeRoofMat = new THREE.MeshLambertMaterial({ color: 0xff9f1c });
for (const s of storeDefs) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(44, 32, 44), storeBodyMat);
  body.position.set(s.x, 16, s.y);
  body.castShadow = true;
  scene.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(52, 5, 52), storeRoofMat);
  roof.position.set(s.x, 34, s.y);
  scene.add(roof);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(36, 8, 2),
    new THREE.MeshLambertMaterial({ color: 0xf1c40f })
  );
  sign.position.set(s.x, 28, s.y + 23);
  scene.add(sign);
}

// Gas station canopies
const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2472a4 });
const poleMat   = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });
for (const gs of GAS_POSITIONS) {
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(90, 5, 60), canopyMat);
  canopy.position.set(gs.x, 26, gs.y);
  canopy.castShadow = true;
  scene.add(canopy);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 26, 8), poleMat);
  pole.position.set(gs.x, 13, gs.y);
  scene.add(pole);
  // Pump
  const pump = new THREE.Mesh(
    new THREE.BoxGeometry(10, 20, 8),
    new THREE.MeshLambertMaterial({ color: 0xe74c3c })
  );
  pump.position.set(gs.x + 20, 10, gs.y + 10);
  pump.castShadow = true;
  scene.add(pump);
}

// ── Aiming ────────────────────────────────────────────────────────────────────
const raycaster   = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint    = new THREE.Vector3();

function updateAimAngle() {
  if (!myPlayer) return;
  const nx =  (mouseScreen.x / window.innerWidth)  * 2 - 1;
  const ny = -(mouseScreen.y / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera({ x: nx, y: ny }, camera);
  if (raycaster.ray.intersectPlane(groundPlane, aimPoint)) {
    aimAngle = Math.atan2(aimPoint.z - myPlayer.y, aimPoint.x - myPlayer.x);
  }
}

// ── Mesh Pools & Maps ─────────────────────────────────────────────────────────
const playerMeshes  = {};   // id → { group, bodyMat, headMat }
const vehicleMeshes = {};   // id → group
const npcMeshes     = {};   // id → group
const pickupMeshes  = {};   // "wp_N" / "ap_N" → mesh
const bulletMeshes  = {};   // String(id) → mesh
const bulletPool    = [];   // recycled bullet meshes

const explosionFXList = [];

// Shared geometries/materials
const pBodyGeo    = new THREE.BoxGeometry(18, 24, 13);
const pHeadGeo    = new THREE.BoxGeometry(13, 13, 13);
const pArmGeo     = new THREE.BoxGeometry(22, 5, 5);
const npcBodyGeo  = new THREE.BoxGeometry(10, 16, 8);
const npcHeadGeo  = new THREE.BoxGeometry(8, 8, 8);
const bulletGeo   = new THREE.SphereGeometry(3.5, 5, 4);
const rocketGeo   = new THREE.CylinderGeometry(2.5, 2, 14, 6);
const bulletMat   = new THREE.MeshBasicMaterial({ color: 0xffee66 });
const rocketMat   = new THREE.MeshBasicMaterial({ color: 0xff6600 });
const wpPickupGeo = new THREE.BoxGeometry(13, 13, 13);
const arPickupGeo = new THREE.CylinderGeometry(10, 10, 6, 7);
const wpPickupMat = new THREE.MeshLambertMaterial({ color: 0x2ecc71, emissive: 0x0e4020, emissiveIntensity: 0.5 });
const arPickupMat = new THREE.MeshLambertMaterial({ color: 0x3498db, emissive: 0x0a2860, emissiveIntensity: 0.5 });

// ── Player Mesh Factory ───────────────────────────────────────────────────────
function getOrCreatePlayer(id, color, isOwnerFlag) {
  if (playerMeshes[id]) return playerMeshes[id];
  const col = isOwnerFlag ? 0xFFD700 : parseHex(color, 0x3498db);

  const skinMat  = new THREE.MeshLambertMaterial({ color: 0xf0c080 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: col });
  const pantsMat = new THREE.MeshLambertMaterial({ color: isOwnerFlag ? 0x1a1a00 : 0x1a1a3a });
  const shoeMat  = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const hairMat  = new THREE.MeshLambertMaterial({ color: isOwnerFlag ? 0xcc9900 : 0x222222 });

  const g = new THREE.Group();

  // Shoes
  [-4.5, 4.5].forEach(ox => {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 9), shoeMat);
    shoe.position.set(ox, 2, 1.5);
    g.add(shoe);
  });
  // Legs
  [-4.5, 4.5].forEach(ox => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(6, 15, 7), pantsMat);
    leg.position.set(ox, 11, 0);
    leg.castShadow = true;
    g.add(leg);
  });
  // Torso/shirt
  const torso = new THREE.Mesh(new THREE.BoxGeometry(20, 18, 10), shirtMat);
  torso.position.y = 26;
  torso.castShadow = true;
  g.add(torso);
  // Collar / neck
  const neck = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), skinMat);
  neck.position.y = 36;
  g.add(neck);
  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 12), skinMat);
  head.position.y = 46;
  head.castShadow = true;
  g.add(head);
  // Hair / cap
  const capBrim = new THREE.Mesh(new THREE.BoxGeometry(17, 3, 15), hairMat);
  capBrim.position.set(0, 53, 0);
  g.add(capBrim);
  const capTop  = new THREE.Mesh(new THREE.BoxGeometry(13, 7, 12), hairMat);
  capTop.position.set(0, 58, -1);
  g.add(capTop);
  // Arms (aiming group)
  const armGroup = new THREE.Group();
  armGroup.position.set(0, 28, 0);
  const armMat = new THREE.MeshLambertMaterial({ color: col });
  const upperArm = new THREE.Mesh(new THREE.BoxGeometry(6, 11, 6), armMat);
  upperArm.position.set(13, -2, 0);
  armGroup.add(upperArm);
  const foreArm  = new THREE.Mesh(new THREE.BoxGeometry(5, 10, 5), skinMat);
  foreArm.position.set(20, -7, 0);
  armGroup.add(foreArm);
  g.add(armGroup);

  // Crown for owner
  if (isOwnerFlag) {
    const crownMat = new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0xaa7700, emissiveIntensity: 0.4 });
    const crownBase = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 14), crownMat);
    crownBase.position.set(0, 64, 0);
    g.add(crownBase);
    [[-5, 69], [0, 72], [5, 69]].forEach(([cx, cy]) => {
      const spike = new THREE.Mesh(new THREE.BoxGeometry(3, 8, 3), crownMat);
      spike.position.set(cx, cy, 0);
      g.add(spike);
    });
  }

  scene.add(g);
  playerMeshes[id] = { group: g, shirtMat, headMat: skinMat, armGroup };
  return playerMeshes[id];
}

function removePlayerMesh(id) {
  if (!playerMeshes[id]) return;
  scene.remove(playerMeshes[id].group);
  delete playerMeshes[id];
}

// ── Vehicle Mesh Factory ───────────────────────────────────────────────────────
function makeVehicleGroup(type, colorHex, isPolice) {
  const g = new THREE.Group();
  const col = isPolice ? 0xf5f5f5 : colorHex;

  if (type === 'bike') {
    // Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.8 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(32, 5, 5), frameMat);
    frame.position.y = 9;
    frame.castShadow = true;
    g.add(frame);
    g.userData.body = frame;
    g.userData.origColor = col;
    // Handlebar
    const hbMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const hb = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 22), hbMat);
    hb.position.set(12, 15, 0);
    g.add(hb);
    // Engine block
    const eng = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 10),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.2 }));
    eng.position.set(0, 10, 0);
    g.add(eng);
    // Wheels
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const rimMat   = new THREE.MeshLambertMaterial({ color: 0x888888 });
    [-14, 14].forEach(wx => {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 5, 12), wheelMat);
      tire.rotation.z = Math.PI/2;
      tire.position.set(wx, 7, 0);
      tire.castShadow = true;
      g.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 5.5, 8), rimMat);
      rim.rotation.z = Math.PI/2;
      rim.position.set(wx, 7, 0);
      g.add(rim);
    });
    return g;
  }

  if (type === 'tank') {
    const hullMat  = new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.8, metalness: 0.3 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(64, 18, 32), hullMat);
    hull.position.y = 14;
    hull.castShadow = true;
    g.add(hull);
    g.userData.body = hull;
    g.userData.origColor = 0x2d5016;
    // Treads
    const treadMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    [-19, 19].forEach(wz => {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(68, 10, 8), treadMat);
      tread.position.set(0, 7, wz);
      g.add(tread);
      // Tread wheels
      for (let wx = -28; wx <= 28; wx += 14) {
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 7, 8), treadMat);
        tw.rotation.z = Math.PI/2;
        tw.position.set(wx, 7, wz);
        g.add(tw);
      }
    });
    // Turret
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x1e3a0a, roughness: 0.7 });
    const turret = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 28), turretMat);
    turret.position.set(4, 30, 0);
    turret.castShadow = true;
    g.add(turret);
    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2, 36, 8),
      new THREE.MeshLambertMaterial({ color: 0x0a0a0a }));
    barrel.rotation.z = Math.PI/2;
    barrel.position.set(30, 28, 0);
    g.add(barrel);
    // Commander hatch
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 4, 10), turretMat);
    hatch.position.set(-4, 37, 0);
    g.add(hatch);
    return g;
  }

  // Dimensions per type
  const dims = {
    sedan:  { bw:44, bh:13, bd:20, cw:26, ch:12, cd:18, cox:-3, cheight:19 },
    sports: { bw:44, bh:10, bd:20, cw:22, ch: 9, cd:17, cox: 2, cheight:15 },
    truck:  { bw:60, bh:20, bd:26, cw:26, ch:18, cd:24, cox:-14,cheight:28 },
  };
  const d = dims[type] || dims.sedan;

  const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.65 });

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(d.bw, d.bh, d.bd), bodyMat);
  body.position.y = d.bh/2 + 6;
  body.castShadow = true;
  g.add(body);
  g.userData.body = body;
  g.userData.origColor = col;

  // Cabin / roof
  const cabMat = new THREE.MeshStandardMaterial({ color: isPolice ? 0x1a1a1a : darken(col, 0.88), roughness: 0.4, metalness: 0.6 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(d.cw, d.ch, d.cd), cabMat);
  cab.position.set(d.cox, d.cheight, 0);
  cab.castShadow = true;
  g.add(cab);

  // Windshields (glass)
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.1 });
  // Front glass
  const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(d.cw - 4, d.ch - 2), glassMat);
  frontGlass.position.set(d.cox + d.cw/2, d.cheight, 0);
  frontGlass.rotation.y = Math.PI/2;
  g.add(frontGlass);
  // Rear glass
  const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(d.cw - 6, d.ch - 3), glassMat);
  rearGlass.position.set(d.cox - d.cw/2, d.cheight, 0);
  rearGlass.rotation.y = -Math.PI/2;
  g.add(rearGlass);

  // Side windows
  const sideGlassMat = glassMat.clone();
  [-d.bd/2, d.bd/2].forEach(wz => {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(d.cw - 8, d.ch - 4), sideGlassMat);
    sg.position.set(d.cox, d.cheight, wz);
    sg.rotation.y = wz < 0 ? Math.PI : 0;
    g.add(sg);
  });

  // Wheels with rims
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const rimMat   = new THREE.MeshLambertMaterial({ color: 0xbbbbbb });
  const wPos = [
    [d.bw/2+1, d.bd/2-5], [d.bw/2+1, -d.bd/2+5],
    [-d.bw/2-1, d.bd/2-5], [-d.bw/2-1, -d.bd/2+5],
  ];
  for (const [wx, wz] of wPos) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 7, 12), wheelMat);
    tire.rotation.z = Math.PI/2;
    tire.position.set(wx, 7, wz);
    tire.castShadow = true;
    g.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 7.5, 8), rimMat);
    rim.rotation.z = Math.PI/2;
    rim.position.set(wx + (wx > 0 ? 0.5 : -0.5), 7, wz);
    g.add(rim);
  }

  // Headlights
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
  const rlMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  [-d.bd/2+4, d.bd/2-4].forEach(wz => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 6), hlMat);
    hl.position.set(d.bw/2, d.bh/2+6, wz);
    g.add(hl);
    const rl = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 5), rlMat);
    rl.position.set(-d.bw/2, d.bh/2+6, wz);
    g.add(rl);
  });

  // Bumpers
  const bumperMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1a1a : 0x222222 });
  const fBumper = new THREE.Mesh(new THREE.BoxGeometry(4, 6, d.bd+4), bumperMat);
  fBumper.position.set(d.bw/2+2, 9, 0);
  g.add(fBumper);
  const rBumper = fBumper.clone();
  rBumper.position.x = -d.bw/2-2;
  g.add(rBumper);

  // Police-specific: black/white stripe + siren bar
  if (isPolice) {
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(d.bw+2, 5, d.bd+2), stripeMat);
    stripe.position.set(0, d.bh/2+6, 0);
    g.add(stripe);

    const sirenBarMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const sirenBar = new THREE.Mesh(new THREE.BoxGeometry(d.cw-4, 4, 6), sirenBarMat);
    sirenBar.position.set(d.cox, d.cheight + d.ch/2 + 4, 0);
    g.add(sirenBar);

    // Siren lights
    const sirenR = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0 }));
    sirenR.position.set(d.cox + 5, d.cheight + d.ch/2 + 4, 0);
    const sirenB = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x0022ff, emissive: 0x0022ff, emissiveIntensity: 0 }));
    sirenB.position.set(d.cox - 5, d.cheight + d.ch/2 + 4, 0);
    g.add(sirenR, sirenB);
    g.userData.sirenR = sirenR;
    g.userData.sirenB = sirenB;

    // Siren light
    const sirenLight = new THREE.PointLight(0xff2200, 0, 200);
    sirenLight.position.set(d.cox, d.cheight + d.ch/2 + 10, 0);
    g.add(sirenLight);
    g.userData.sirenLight = sirenLight;

    // Police star decal (box approximation on side)
    const starMat = new THREE.MeshLambertMaterial({ color: 0xf5d020 });
    [-1, 1].forEach(side => {
      const star = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 8), starMat);
      star.position.set(0, d.bh/2+9, side*(d.bd/2));
      g.add(star);
    });
  }

  // Headlight point light (for night driving)
  const headLight = new THREE.PointLight(0xffffcc, 0, 220);
  headLight.position.set(d.bw/2 + 8, d.bh/2 + 6, 0);
  g.add(headLight);
  g.userData.headLight = headLight;

  // Truck-specific: flat bed
  if (type === 'truck') {
    const bedMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const bed = new THREE.Mesh(new THREE.BoxGeometry(28, 4, 24), bedMat);
    bed.position.set(-20, d.bh + 4, 0);
    g.add(bed);
    // Bed rails
    [[0, 2, 12], [0, 2, -12], [-14, 4, 0]].forEach(([rx, ry, rz]) => {
      const railGeo = rz === 0
        ? new THREE.BoxGeometry(4, 8, 26)
        : new THREE.BoxGeometry(30, 6, 3);
      const rail = new THREE.Mesh(railGeo, bedMat);
      rail.position.set(bed.position.x + rx, d.bh + 4 + ry, rz);
      g.add(rail);
    });
  }

  return g;
}

function getOrCreateVehicle(id, type, colorHex, isPolice) {
  if (!vehicleMeshes[id]) {
    vehicleMeshes[id] = makeVehicleGroup(type, colorHex, isPolice);
    scene.add(vehicleMeshes[id]);
  }
  return vehicleMeshes[id];
}

// ── Bullet mesh pool ───────────────────────────────────────────────────────────
function getBulletMesh(isRocket) {
  for (let i = bulletPool.length - 1; i >= 0; i--) {
    if (bulletPool[i]._isRocket === isRocket) {
      const m = bulletPool.splice(i, 1)[0];
      m.visible = true;
      return m;
    }
  }
  const m = new THREE.Mesh(
    isRocket ? rocketGeo : bulletGeo,
    (isRocket ? rocketMat : bulletMat).clone()
  );
  m._isRocket = isRocket;
  m.castShadow = false;
  if (isRocket) m.rotation.z = Math.PI/2;
  scene.add(m);
  return m;
}

function returnBulletMesh(m) {
  m.visible = false;
  bulletPool.push(m);
}

// ── Explosion FX ───────────────────────────────────────────────────────────────
function spawnExplosion(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const particles = [];
  const colors = [0xff6600, 0xff8800, 0xffcc00, 0xff3300];
  for (let i = 0; i < 22; i++) {
    const r = 6 + Math.random() * 18;
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length], transparent: true, opacity: 0.92
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), mat);
    const a = Math.random() * Math.PI * 2;
    const sp = 3 + Math.random() * 9;
    mesh.userData.vx = Math.cos(a) * sp;
    mesh.userData.vy = 3 + Math.random() * 7;
    mesh.userData.vz = Math.sin(a) * sp;
    mesh.position.set(0, 4, 0);
    g.add(mesh);
    particles.push(mesh);
  }
  // Smoke ring
  for (let i = 0; i < 6; i++) {
    const sm = new THREE.Mesh(
      new THREE.SphereGeometry(10 + Math.random()*8, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 })
    );
    const a = (i / 6) * Math.PI * 2;
    sm.position.set(Math.cos(a)*20, 8, Math.sin(a)*20);
    sm.userData.vx = Math.cos(a) * 2;
    sm.userData.vy = 1.5;
    sm.userData.vz = Math.sin(a) * 2;
    g.add(sm);
    particles.push(sm);
  }
  const flash = new THREE.PointLight(0xff8800, 12, 350);
  flash.position.y = 30;
  g.add(flash);
  scene.add(g);
  explosionFXList.push({ group: g, life: 45, maxLife: 45, particles, flash });
}

function tickExplosions() {
  for (let i = explosionFXList.length - 1; i >= 0; i--) {
    const fx = explosionFXList[i];
    const t = 1 - fx.life / fx.maxLife;
    fx.life--;
    for (const p of fx.particles) {
      p.position.x += p.userData.vx;
      p.position.y += p.userData.vy;
      p.position.z += p.userData.vz;
      p.userData.vy -= 0.45;
      p.material.opacity = Math.max(0, 0.92 * (1 - t * 1.5));
      p.scale.setScalar(1 + t * 0.5);
    }
    fx.flash.intensity = Math.max(0, 12 * (1 - t * 3.5));
    if (fx.life <= 0) { scene.remove(fx.group); explosionFXList.splice(i, 1); }
  }
}

// ── Rain ──────────────────────────────────────────────────────────────────────
let rainMesh = null, rainPositions = null;
function ensureRain(on) {
  if (on && !rainMesh) {
    const COUNT = 3500;
    const geo = new THREE.BufferGeometry();
    rainPositions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      rainPositions[i*3]   = (Math.random()-0.5)*1000;
      rainPositions[i*3+1] = Math.random() * 320;
      rainPositions[i*3+2] = (Math.random()-0.5)*1000;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    rainMesh = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x99aacc, size: 1.8, transparent: true, opacity: 0.55 }));
    scene.add(rainMesh);
  } else if (!on && rainMesh) {
    scene.remove(rainMesh);
    rainMesh = null; rainPositions = null;
  }
}
function tickRain() {
  if (!rainMesh || !rainPositions) return;
  const cx = camera.position.x, cz = camera.position.z;
  for (let i = 0; i < rainPositions.length; i += 3) {
    rainPositions[i+1] -= 9;
    if (rainPositions[i+1] < 0) {
      rainPositions[i]   = cx + (Math.random()-0.5)*1000;
      rainPositions[i+1] = 320;
      rainPositions[i+2] = cz + (Math.random()-0.5)*1000;
    }
  }
  rainMesh.geometry.attributes.position.needsUpdate = true;
}

// ── Day / Night ───────────────────────────────────────────────────────────────
function applyDayNight(wt) {
  // wt: 0=midnight, 0.5=noon
  const sinT = Math.sin(wt * Math.PI * 2 - Math.PI/2); // -1 at midnight, +1 at noon
  const dayFactor = Math.max(0, sinT); // 0 at night, 1 at noon

  const nightSky  = new THREE.Color(0x080820);
  const noonSky   = new THREE.Color(0x87ceeb);
  const dawnSky   = new THREE.Color(0xffaa55);

  let skyColor;
  if (wt < 0.15 || wt > 0.85)      skyColor = nightSky;
  else if (wt < 0.30 || wt > 0.70) {
    const t = wt < 0.5 ? (wt-0.15)/0.15 : (0.85-wt)/0.15;
    skyColor = nightSky.clone().lerp(dawnSky, Math.min(1,t));
  } else                             skyColor = noonSky;

  scene.background.copy(skyColor);
  scene.fog.color.copy(skyColor);

  sunLight.intensity    = 0.1 + dayFactor * 1.1;
  ambLight.intensity    = 0.12 + dayFactor * 0.35;
  sunLight.color.setHSL(0.1, 0.5, 0.7 + dayFactor * 0.3);

  // Sun position
  const sa = wt * Math.PI * 2 - Math.PI/2;
  sunLight.position.set(
    myPlayer ? myPlayer.x + Math.cos(sa)*900 : 2000 + Math.cos(sa)*900,
    Math.max(10, Math.sin(sa)*700),
    myPlayer ? myPlayer.y + 500 : 2500
  );
  sunLight.target.position.set(myPlayer ? myPlayer.x : 2000, 0, myPlayer ? myPlayer.y : 2000);
  sunLight.target.updateMatrixWorld();

  // Night headlights on vehicles
  const needHL = dayFactor < 0.25;
  for (const g of Object.values(vehicleMeshes)) {
    if (g.userData.headLight) g.userData.headLight.intensity = needHL ? 2.0 : 0;
  }

  // Building window emissive glow at night
  const winGlow = Math.max(0, 0.18 * (1 - dayFactor));
  for (const m of buildingMeshes) {
    m.material.emissive = _buildingEmissive;
    m.material.emissiveIntensity = winGlow;
  }
}

function getTimeString(wt) {
  const mins = Math.floor(wt * 24 * 60);
  return `${String(Math.floor(mins/60) % 24).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
}

// ── Lobby ──────────────────────────────────────────────────────────────────────
playBtn.addEventListener('click', startGame);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });

function startGame() {
  const name = nameInput.value.trim() || 'Spieler';
  lobby.style.display = 'none';
  hud.style.display = 'block';
  gameStarted = true;
  Audio3D.init();
  socket.emit('setName', name);
  buildWeaponHUD();
  requestAnimationFrame(gameLoop);
}

// ── Socket ─────────────────────────────────────────────────────────────────────
socket.on('init', d => {
  myId         = d.id;
  worldW       = d.worldW  || 4000;
  worldH       = d.worldH  || 4000;
  stores       = d.stores  || [];
  vehicles     = d.vehicles || [];
  weaponPickups= d.weaponPickups || [];
  armorPickups = d.armorPickups  || [];
  weaponDefs   = d.weaponDefs    || {};
  vehicleTypes = d.vehicleTypes  || {};
  worldTime    = d.worldTime !== undefined ? d.worldTime : 0.3;
  weather      = d.weather || 'clear';
  for (const p of (d.players || [])) players[p.id] = p;
  myPlayer = players[myId];
  if (myPlayer) {
    camYaw = -myPlayer.angle - Math.PI/2;
    const cx = myPlayer.x - Math.sin(camYaw) * Math.cos(camPitch) * camDist;
    const cy = Math.sin(camPitch) * camDist;
    const cz = myPlayer.y - Math.cos(camYaw) * Math.cos(camPitch) * camDist;
    camera.position.set(cx, cy, cz);
    camera.lookAt(myPlayer.x, 18, myPlayer.y);
  }
});

socket.on('playerJoined', p  => { players[p.id] = p; showNotif(`${p.name} ist beigetreten`, '#3498db'); });
socket.on('playerLeft',   id => { delete players[id]; delete interpTargets[id]; removePlayerMesh(id); });
socket.on('playerUpdate', p  => { players[p.id] = p; });
socket.on('playerDied', ({id}) => { if (players[id]) players[id].dead = true; });
socket.on('playerRespawned', p => {
  players[p.id] = p;
  if (p.id === myId) { deadEl.classList.remove('show'); myPlayer = p; }
});
socket.on('ownerGranted', () => {
  isOwner = true;
  ownerPanel.style.display = 'block';
  showNotif('👑 WILLKOMMEN, OWNER! Du hast alles.', '#FFD700');
});
socket.on('state', d => {
  for (const p of (d.players || [])) {
    if (p.id === myId) {
      if (myPlayer) {
        myPlayer.hp = p.hp; myPlayer.armor = p.armor;
        myPlayer.money = p.money; myPlayer.wanted = p.wanted;
        myPlayer.dead = p.dead; myPlayer.kills = p.kills; myPlayer.deaths = p.deaths;
        myPlayer.weapons = p.weapons; myPlayer.currentWeapon = p.currentWeapon;
        myPlayer.godmode = p.godmode; myPlayer.inVehicle = p.inVehicle;
        godmodeOn = p.godmode;
      }
    } else {
      interpTargets[p.id] = p;
      if (!players[p.id]) players[p.id] = p;
    }
  }
  vehicles      = d.vehicles      || vehicles;
  bullets       = d.bullets       || [];
  weaponPickups = d.weaponPickups  || weaponPickups;
  armorPickups  = d.armorPickups   || armorPickups;
  npcs          = d.npcs          || [];
  policeUnits   = d.police        || [];
  worldTime     = d.worldTime !== undefined ? d.worldTime : worldTime;
  weather       = d.weather || weather;
  for (const ex of (d.explosions || [])) {
    spawnExplosion(ex.x, ex.y);
    Audio3D.explosion();
  }
});
socket.on('notification', ({ msg, color }) => showNotif(msg, color));

// ── Input ──────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (!gameStarted) return;
  if (k === 'e') enterCarQ = true;
  if (k === 'f') robStoreQ = true;
  if (k === 'g') refuelQ   = true;
  const wi = parseInt(e.key) - 1;
  if (wi >= 0 && wi < WEAPON_ORDER.length && myPlayer) {
    const wk = WEAPON_ORDER[wi];
    if (myPlayer.weapons && myPlayer.weapons[wk] !== 0) {
      myPlayer.currentWeapon = wk;
      pendingWeaponSwitch = wk;
    }
  }
  if (isOwner) {
    if (k === 'x') clearWantedQ = true;
    if (k === 'r') refillWepsQ  = true;
  }
  if (!['f5','f11','f12'].includes(k)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

threeCanvas.addEventListener('mousemove', e => {
  mouseScreen.x = e.clientX;
  mouseScreen.y = e.clientY;
  if (rightMouseDown) {
    camYaw   += (e.clientX - lastRMX) * 0.005;
    camPitch  = Math.max(0.08, Math.min(1.25, camPitch + (e.clientY - lastRMY) * 0.005));
    lastRMX = e.clientX; lastRMY = e.clientY;
  }
});
threeCanvas.addEventListener('mousedown', e => {
  Audio3D.resume();
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) { rightMouseDown = true; lastRMX = e.clientX; lastRMY = e.clientY; }
});
threeCanvas.addEventListener('mouseup',  e => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) rightMouseDown = false;
});
threeCanvas.addEventListener('contextmenu', e => e.preventDefault());
threeCanvas.addEventListener('wheel', e => {
  camDist = Math.max(70, Math.min(520, camDist + e.deltaY * 0.3));
}, { passive: true });

// Owner panel
btnGodmode.addEventListener('click', () => { toggleGodQ = !godmodeOn; });
btnRefill .addEventListener('click', () => { refillWepsQ = true; });
btnClearW .addEventListener('click', () => { clearWantedQ = true; });
btnMaxMon .addEventListener('click', () => { maxMoneyQ = true; });
document.querySelectorAll('.vbtn').forEach(btn => {
  btn.addEventListener('click', () => { spawnVehQ = btn.dataset.v; });
});
soundBtn.addEventListener('click', () => {
  soundBtn.textContent = Audio3D.toggle() ? '🔊 Ton' : '🔇 Stumm';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Client prediction bullets ──────────────────────────────────────────────────
const clientBullets = [];
let cbIdCtr = 0;

// ── Game Loop ──────────────────────────────────────────────────────────────────
let lastFrame = 0;
function gameLoop(ts) {
  if (!gameStarted) return;
  const dt = Math.min(ts - lastFrame, 50);
  lastFrame = ts;
  update(dt, ts);
  render3D(ts);
  updateHUD();
  requestAnimationFrame(gameLoop);
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt, ts) {
  if (!myPlayer) return;
  if (myPlayer.dead) { deadEl.classList.add('show'); return; }
  deadEl.classList.remove('show');

  const inCar = !!myPlayer.inVehicle;
  const myVeh = inCar ? vehicles.find(v => v.id === myPlayer.inVehicle) : null;
  const carDef = myVeh ? (vehicleTypes[myVeh.type] || vehicleTypes.sedan) : null;
  const maxSpeed = carDef
    ? carDef.maxSpeed * (keys['shift'] ? 1.35 : 1)
    : (keys['shift'] ? 3.0 : 1.9);
  const accel = carDef ? carDef.accel : 0.35;

  if (inCar) {
    const fwd = keys['w'] || keys['arrowup'];
    const bck = keys['s'] || keys['arrowdown'];
    const lft = keys['a'] || keys['arrowleft'];
    const rgt = keys['d'] || keys['arrowright'];
    myPlayer.speed = myPlayer.speed || 0;
    if (fwd)      myPlayer.speed = Math.min(maxSpeed, myPlayer.speed + accel);
    else if (bck) myPlayer.speed = Math.max(-maxSpeed*0.5, myPlayer.speed - accel);
    else          myPlayer.speed *= 0.94;

    const tf = carDef ? (carDef.turn || 0.045) : 0.045;
    if (Math.abs(myPlayer.speed) > 0.05) {
      const dir = myPlayer.speed > 0 ? 1 : -1;
      const spd = Math.abs(myPlayer.speed);
      if (lft) myPlayer.angle -= tf * spd / maxSpeed * dir;
      if (rgt) myPlayer.angle += tf * spd / maxSpeed * dir;
    }
    myPlayer.x += Math.cos(myPlayer.angle) * myPlayer.speed;
    myPlayer.y += Math.sin(myPlayer.angle) * myPlayer.speed;

    if (myVeh) {
      Audio3D.updateEngine(myPlayer.speed, maxSpeed);
      if (Math.abs(myPlayer.speed) > 1.5 && (keys['a'] || keys['d'])) {
        Audio3D.screech(Math.abs(myPlayer.speed) / maxSpeed);
      }
    }
    if (!Audio3D._engineOsc) Audio3D.startEngine();
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
      Audio3D.footstep();
    }
    myPlayer.speed = 0;
    myPlayer.angle = aimAngle;
    if (Audio3D._engineOsc) Audio3D.stopEngine();
  }

  myPlayer.x = Math.max(10, Math.min(worldW-10, myPlayer.x));
  myPlayer.y = Math.max(10, Math.min(worldH-10, myPlayer.y));

  // Always update aim (needed for drive-by too)
  updateAimAngle();

  // Shooting
  const wKey = myPlayer.currentWeapon || 'pistol';
  const wDef = weaponDefs[wKey];
  const now  = performance.now();
  let shooting = false;
  if (mouseDown && wDef && (now - lastShotTs) > wDef.cooldown) {
    const ammo = myPlayer.weapons ? myPlayer.weapons[wKey] : 0;
    if (ammo !== 0) {
      lastShotTs = now;
      shooting = true;
      Audio3D.shoot(wKey);
      for (let s = 0; s < Math.min(wDef.shots || 1, 3); s++) {
        const sp = (Math.random()-0.5) * (wDef.spread || 0);
        clientBullets.push({
          id: `cb_${cbIdCtr++}`,
          x: myPlayer.x, y: myPlayer.y,
          vx: Math.cos(aimAngle + sp) * wDef.speed,
          vy: Math.sin(aimAngle + sp) * wDef.speed,
          life: Math.min(wDef.life, 35),
          weaponType: wKey, rocket: wDef.rocket,
        });
      }
    }
  }

  // Tick client bullets
  for (let i = clientBullets.length-1; i >= 0; i--) {
    const b = clientBullets[i];
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.life <= 0) clientBullets.splice(i, 1);
  }

  // Interpolate other players
  for (const [id, tgt] of Object.entries(interpTargets)) {
    if (id === myId) continue;
    const p = players[id];
    if (!p) continue;
    p.x += (tgt.x - p.x) * 0.25;
    p.y += (tgt.y - p.y) * 0.25;
    p.angle = lerpAngle(p.angle, tgt.angle, 0.25);
    p.hp = tgt.hp; p.armor = tgt.armor; p.dead = tgt.dead;
    p.wanted = tgt.wanted; p.inVehicle = tgt.inVehicle;
    p.kills = tgt.kills; p.deaths = tgt.deaths;
    p.currentWeapon = tgt.currentWeapon;
  }

  // Camera follow
  if (!rightMouseDown && Math.abs(myPlayer.speed) > 0.3) {
    const targetYaw = -myPlayer.angle - Math.PI/2;
    camYaw = lerpAngle(camYaw, targetYaw, 0.04);
  }
  const distH = Math.cos(camPitch) * camDist;
  const distV = Math.sin(camPitch) * camDist;
  const tcx = myPlayer.x - Math.sin(camYaw) * distH;
  const tcy = distV;
  const tcz = myPlayer.y - Math.cos(camYaw) * distH;
  camera.position.lerp(_tmpVec3.set(tcx, tcy, tcz), 0.12);
  camera.lookAt(myPlayer.x, 18, myPlayer.y);

  // Police siren audio
  Audio3D.siren(policeUnits.length > 0);

  // Proximity prompts
  const nearStore = stores.find(s => dist2D(myPlayer, {x:s.x,y:s.y}) < 90);
  storePrompt.style.display = nearStore ? 'block' : 'none';
  const nearGas = inCar && GAS_POSITIONS.find(g => dist2D(myPlayer, {x:g.x,y:g.y}) < 100);
  fuelPrompt.style.display = nearGas ? 'block' : 'none';

  // Send input
  const inputData = {
    x: myPlayer.x, y: myPlayer.y,
    angle: myPlayer.angle, speed: myPlayer.speed || 0,
    shooting, shootAngle: aimAngle,
    weapon: pendingWeaponSwitch || wKey,
    enterCar: enterCarQ, robStore: robStoreQ, refuel: refuelQ,
  };
  if (isOwner) {
    if (toggleGodQ !== null) inputData.toggleGodmode = toggleGodQ;
    if (clearWantedQ)        inputData.clearWanted   = true;
    if (refillWepsQ)         inputData.refillWeapons  = true;
    if (spawnVehQ)           inputData.spawnVehicle   = spawnVehQ;
    if (maxMoneyQ)           inputData.maxMoney        = true;
  }
  socket.emit('input', inputData);

  enterCarQ = false; robStoreQ = false; refuelQ = false;
  toggleGodQ = null; clearWantedQ = false; refillWepsQ = false;
  spawnVehQ = null; pendingWeaponSwitch = null; maxMoneyQ = false;
}

// ── 3D Render ──────────────────────────────────────────────────────────────────
function render3D(ts) {
  applyDayNight(worldTime);
  ensureRain(weather === 'rain');
  if (weather === 'rain') tickRain();
  if (weather === 'fog') { scene.fog.near = 400; scene.fog.far = 1800; }
  else { scene.fog.near = 1800; scene.fog.far = 4500; }

  // -- Player meshes
  for (const [id, p] of Object.entries(players)) {
    if (p.dead || p.inVehicle) {
      if (playerMeshes[id]) playerMeshes[id].group.visible = false;
      continue;
    }
    const pm = getOrCreatePlayer(id, p.color, p.isOwner);
    pm.group.visible = true;
    pm.group.position.set(p.x, 0, p.y);
    pm.group.rotation.y = Math.PI/2 - p.angle;
    // Godmode/owner shimmer
    const glowI = (p.godmode || p.isOwner) ? (0.25 + 0.15 * Math.sin(ts * 0.006)) : 0;
    pm.shirtMat.emissive.copy(_glowColor);
    pm.shirtMat.emissiveIntensity = glowI;
  }
  // Remove stale player meshes
  for (const id of Object.keys(playerMeshes)) {
    if (!players[id]) removePlayerMesh(id);
  }

  // -- Vehicle meshes
  const activeVIds = new Set();
  for (const v of vehicles) {
    activeVIds.add(v.id);
    const col = parseHex(v.color, 0xe74c3c);
    const vm = getOrCreateVehicle(v.id, v.type, col, false);
    vm.visible = v.x > -9000;
    if (vm.visible) {
      vm.position.set(v.x, 0, v.y);
      vm.rotation.y = Math.PI/2 - v.angle;
      // Damage color
      const hpPct = v.hp / (v.maxHp || 100);
      if (vm.userData.body) {
        if (hpPct < 0.15) {
          vm.userData.body.material.color.setHex(0x333333);
        } else if (hpPct < 0.35) {
          vm.userData.body.material.color.setHex(0x777777);
        } else if (vm.userData.origColor !== undefined) {
          vm.userData.body.material.color.setHex(vm.userData.origColor);
        }
      }
      if (vm.userData.headLight) vm.userData.headLight.intensity = 0;
    }
  }
  // Remove retired vehicle meshes
  for (const id of Object.keys(vehicleMeshes)) {
    if (!activeVIds.has(id) && !policeUnits.find(c => c.id === id)) {
      scene.remove(vehicleMeshes[id]); delete vehicleMeshes[id];
    }
  }

  // -- Police vehicle meshes
  const policeFlash = Math.floor(ts / 180) % 2 === 0;
  for (const cop of policeUnits) {
    const vm = getOrCreateVehicle(cop.id, 'sedan', 0xecf0f1, true);
    vm.visible = cop.x > -9000;
    if (vm.visible) {
      vm.position.set(cop.x, 0, cop.y);
      vm.rotation.y = Math.PI/2 - cop.angle;
      if (vm.userData.sirenR && vm.userData.sirenB) {
        vm.userData.sirenR.material.emissiveIntensity = policeFlash ? 3.5 : 0;
        vm.userData.sirenB.material.emissiveIntensity = policeFlash ? 0 : 3.5;
        if (vm.userData.sirenLight) {
          vm.userData.sirenLight.color.set(policeFlash ? 0xff2200 : 0x0033ff);
          vm.userData.sirenLight.intensity = 4;
        }
      }
    }
  }

  // -- NPC meshes
  const npcShirtColors  = [0xcc3333, 0x3366cc, 0x33aa55, 0xcc8833, 0x8833cc, 0x33aacc, 0xcc33aa];
  const npcPantsColors  = [0x222244, 0x442222, 0x224422, 0x444422, 0x442244];
  const npcSkinColors   = [0xf0c080, 0xd4956a, 0xc47840, 0x8b5e3c, 0xffe0bd];
  function npcHash(id) { let h=0; for(let i=0;i<id.length;i++) h=(h*31+id.charCodeAt(i))>>>0; return h; }
  for (const npc of npcs) {
    if (!npcMeshes[npc.id]) {
      const g = new THREE.Group();
      const h = npcHash(npc.id);
      const shirtCol = npcShirtColors[h % npcShirtColors.length];
      const pantsCol = npcPantsColors[(h >> 4) % npcPantsColors.length];
      const skinCol  = npcSkinColors[(h >> 8)  % npcSkinColors.length];
      const shirtMat = new THREE.MeshLambertMaterial({ color: shirtCol });
      const pantsMat = new THREE.MeshLambertMaterial({ color: pantsCol });
      const skinMat  = new THREE.MeshLambertMaterial({ color: skinCol });
      const shoeMat  = new THREE.MeshLambertMaterial({ color: 0x111111 });
      // Legs
      [-3, 3].forEach(ox => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 5), pantsMat);
        leg.position.set(ox, 6, 0); leg.castShadow = true; g.add(leg);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 7), shoeMat);
        shoe.position.set(ox, 1.5, 1); g.add(shoe);
      });
      // Body/shirt
      const torso = new THREE.Mesh(new THREE.BoxGeometry(11, 14, 8), shirtMat);
      torso.position.y = 19; torso.castShadow = true; g.add(torso);
      // Head
      const head = new THREE.Mesh(npcHeadGeo, skinMat);
      head.position.y = 30; g.add(head);
      // Hat (random)
      if ((h & 1) === 0) {
        const hat = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 9),
          new THREE.MeshLambertMaterial({ color: shirtCol }));
        hat.position.y = 36; g.add(hat);
      }
      scene.add(g);
      npcMeshes[npc.id] = g;
    }
    const m = npcMeshes[npc.id];
    m.visible = npc.state !== 'dead';
    m.position.set(npc.x, 0, npc.y);
    m.rotation.y = Math.PI/2 - npc.angle;
    // Walk/flee bob animation
    if (npc.state === 'flee') {
      m.position.y = Math.abs(Math.sin(ts * 0.025)) * 4;
    } else {
      m.position.y = Math.abs(Math.sin(ts * 0.01 + npcHash(npc.id) * 0.3)) * 1.5;
    }
  }
  const npcIds = new Set(npcs.map(n => n.id));
  for (const id of Object.keys(npcMeshes)) {
    if (!npcIds.has(id)) { scene.remove(npcMeshes[id]); delete npcMeshes[id]; }
  }

  // -- Bullet meshes
  const allBullets = [
    ...bullets.map(b => ({ ...b, _client: false })),
    ...clientBullets.map(b => ({ ...b, _client: true })),
  ];
  const seenBulletIds = new Set();
  for (const b of allBullets) {
    const bid = String(b.id);
    seenBulletIds.add(bid);
    if (!bulletMeshes[bid]) {
      bulletMeshes[bid] = getBulletMesh(!!b.rocket);
    }
    const m = bulletMeshes[bid];
    m.visible = true;
    m.position.set(b.x, b.rocket ? 14 : 10, b.y);
    if (b.rocket && b._client) {
      m.rotation.y = Math.PI/2 - Math.atan2(b.vy, b.vx);
    }
  }
  for (const bid of Object.keys(bulletMeshes)) {
    if (!seenBulletIds.has(bid)) {
      returnBulletMesh(bulletMeshes[bid]);
      delete bulletMeshes[bid];
    }
  }

  // -- Pickup meshes
  const t = ts * 0.001;
  for (const pu of weaponPickups) {
    const pid = `wp_${pu.id}`;
    if (!pickupMeshes[pid]) {
      pickupMeshes[pid] = new THREE.Mesh(wpPickupGeo, wpPickupMat.clone());
      pickupMeshes[pid].castShadow = true;
      scene.add(pickupMeshes[pid]);
    }
    const m = pickupMeshes[pid];
    m.visible = !!pu.active;
    if (pu.active) {
      m.position.set(pu.x, 14 + Math.sin(t*2 + pu.id*0.7) * 5, pu.y);
      m.rotation.y = t + pu.id;
    }
  }
  for (const pu of armorPickups) {
    const pid = `ap_${pu.id}`;
    if (!pickupMeshes[pid]) {
      pickupMeshes[pid] = new THREE.Mesh(arPickupGeo, arPickupMat.clone());
      pickupMeshes[pid].castShadow = true;
      scene.add(pickupMeshes[pid]);
    }
    const m = pickupMeshes[pid];
    const seed = typeof pu.id === 'string' ? pu.id.charCodeAt(5)||0 : Number(pu.id);
    m.visible = !!pu.active;
    if (pu.active) {
      m.position.set(pu.x, 12 + Math.sin(t*2.2 + seed) * 4, pu.y);
      m.rotation.y = t * 1.3;
    }
  }

  // -- Explosions
  tickExplosions();

  renderer.render(scene, camera);
  drawMinimap();
}

// ── Minimap ────────────────────────────────────────────────────────────────────
function drawMinimap() {
  const mw = 160, mh = 160;
  const sc = mw / worldW;
  mmCtx.clearRect(0, 0, mw, mh);
  mmCtx.fillStyle = '#1a2a1a';
  mmCtx.beginPath(); mmCtx.arc(mw/2, mh/2, mw/2, 0, Math.PI*2); mmCtx.fill();
  mmCtx.save();
  mmCtx.beginPath(); mmCtx.arc(mw/2, mh/2, mw/2-2, 0, Math.PI*2); mmCtx.clip();

  // Grass
  mmCtx.fillStyle = '#2a4a22';
  mmCtx.fillRect(0, 0, mw, mh);

  // Roads
  mmCtx.fillStyle = '#555';
  for (const r of ROAD_DEFS) mmCtx.fillRect(r.x*sc, r.y*sc, r.w*sc, r.h*sc);

  // Buildings
  mmCtx.fillStyle = '#888';
  for (const b of BLOCKS) mmCtx.fillRect(b.x*sc, b.y*sc, b.w*sc, b.h*sc);

  // Stores
  mmCtx.fillStyle = '#f39c12';
  for (const s of stores) mmCtx.fillRect(s.x*sc-2, s.y*sc-2, 4, 4);

  // Gas stations
  mmCtx.fillStyle = '#3498db';
  for (const g of GAS_POSITIONS) mmCtx.fillRect(g.x*sc-2, g.y*sc-2, 4, 4);

  // Weapon pickups
  mmCtx.fillStyle = '#2ecc71';
  for (const pu of weaponPickups) {
    if (pu.active) mmCtx.fillRect(pu.x*sc-1.5, pu.y*sc-1.5, 3, 3);
  }

  // NPCs
  mmCtx.fillStyle = '#888';
  for (const n of npcs) {
    if (n.state !== 'dead') mmCtx.fillRect(n.x*sc-1, n.y*sc-1, 2, 2);
  }

  // Police
  mmCtx.fillStyle = '#4499ff';
  for (const cop of policeUnits) {
    mmCtx.beginPath(); mmCtx.arc(cop.x*sc, cop.y*sc, 3, 0, Math.PI*2); mmCtx.fill();
  }

  // Vehicles
  for (const v of vehicles) {
    if (v.x < -9000 || v.driverId) continue;
    mmCtx.fillStyle = v.color || '#e74c3c';
    mmCtx.fillRect(v.x*sc-2, v.y*sc-1.5, 4, 3);
  }

  // Other players
  for (const [id, p] of Object.entries(players)) {
    if (p.dead || id === myId) continue;
    mmCtx.fillStyle = p.isOwner ? '#FFD700' : (p.color || '#e74c3c');
    mmCtx.beginPath(); mmCtx.arc(p.x*sc, p.y*sc, 3, 0, Math.PI*2); mmCtx.fill();
  }

  // Me
  if (myPlayer && !myPlayer.dead) {
    mmCtx.fillStyle = '#ffffff';
    mmCtx.beginPath(); mmCtx.arc(myPlayer.x*sc, myPlayer.y*sc, 4, 0, Math.PI*2); mmCtx.fill();
    mmCtx.strokeStyle = '#fff'; mmCtx.lineWidth = 1.5;
    mmCtx.beginPath();
    mmCtx.moveTo(myPlayer.x*sc, myPlayer.y*sc);
    mmCtx.lineTo(myPlayer.x*sc + Math.cos(myPlayer.angle)*9, myPlayer.y*sc + Math.sin(myPlayer.angle)*9);
    mmCtx.stroke();
  }
  mmCtx.restore();
}

// ── HUD ────────────────────────────────────────────────────────────────────────
function buildWeaponHUD() {
  weaponHud.innerHTML = '';
  WEAPON_ORDER.forEach((wk, i) => {
    const el = document.createElement('div');
    el.className = 'wslot';
    el.id = 'wslot_' + wk;
    el.innerHTML = `<span class="wkey">${i+1}</span><span class="wicon">${WEAPON_ICONS[wk]||'🔫'}</span><span class="wammo" id="wammo_${wk}">–</span>`;
    weaponHud.appendChild(el);
  });
}

function updateHUD() {
  if (!myPlayer) return;
  const hp = Math.max(0, myPlayer.hp || 0);
  hpFill.style.width = hp + '%';
  hpFill.style.background = hp > 50
    ? 'linear-gradient(90deg,#2ecc71,#27ae60)'
    : hp > 25 ? 'linear-gradient(90deg,#f39c12,#e67e22)' : 'linear-gradient(90deg,#e74c3c,#c0392b)';

  const armor = myPlayer.armor || 0;
  armorWrap.style.display = armor > 0 ? 'block' : 'none';
  armorFill.style.width = armor + '%';
  moneyEl.textContent = '$' + (myPlayer.money || 0).toLocaleString();
  for (let i = 0; i < 5; i++) wantedStars[i].classList.toggle('on', i < (myPlayer.wanted || 0));

  if (myPlayer.inVehicle) {
    const v = vehicles.find(v => v.id === myPlayer.inVehicle);
    if (v) {
      vhpWrap.style.display = 'block';
      vhpFill.style.width = Math.max(0, (v.hp / (v.maxHp||100)) * 100) + '%';
      fuelWrap.style.display = 'block';
      fuelFill.style.width = Math.max(0, (v.fuel / (v.maxFuel||100)) * 100) + '%';
      const def = vehicleTypes[v.type] || {};
      vehInd.style.display = 'block';
      vehInd.textContent = `🚗 ${def.label || v.type} — E: Aussteigen`;
    }
  } else {
    vhpWrap.style.display = 'none';
    fuelWrap.style.display = 'none';
    vehInd.style.display = 'none';
  }

  const weps = myPlayer.weapons || {};
  const cur  = myPlayer.currentWeapon || 'pistol';
  WEAPON_ORDER.forEach(wk => {
    const slot   = document.getElementById('wslot_' + wk);
    const ammoEl = document.getElementById('wammo_' + wk);
    if (!slot) return;
    const ammo = weps[wk];
    slot.classList.toggle('active', wk === cur);
    slot.classList.toggle('empty',  ammo === 0);
    if (ammoEl) ammoEl.textContent = ammo === Infinity ? '∞' : (ammo ?? 0);
  });

  if (isOwner) {
    btnGodmode.textContent = godmodeOn ? '🛡️ Godmode: AN' : '🛡️ Godmode: AUS';
    btnGodmode.classList.toggle('active', godmodeOn);
  }

  const sorted = Object.values(players).sort((a,b) => (b.money||0) - (a.money||0)).slice(0, 8);
  scoreList.innerHTML = sorted.map(p =>
    `<div class="srow">
      <span style="color:${p.isOwner?'#FFD700':p.id===myId?'#fff':p.color||'#aaa'}">${p.isOwner?'👑 ':''} ${p.name||'?'}</span>
      <span class="k">${p.kills||0}K</span>
      <span class="m">$${(p.money||0).toLocaleString()}</span>
    </div>`
  ).join('');

  clockEl.textContent = getTimeString(worldTime);
  weatherInd.style.display = 'block';
  weatherInd.textContent = { clear:'☀️ Klar', rain:'🌧️ Regen', fog:'🌫️ Nebel' }[weather] || weather;
}

// ── Notifications ──────────────────────────────────────────────────────────────
function showNotif(msg, color = '#e74c3c') {
  const el = document.createElement('div');
  el.className = 'notif';
  el.style.borderLeftColor = color;
  el.textContent = msg;
  notifs.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .5s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 500);
  }, 3500);
}

// ── Utils ──────────────────────────────────────────────────────────────────────
function dist2D(a, b) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI*2;
  while (d < -Math.PI) d += Math.PI*2;
  return a + d * t;
}
function parseHex(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'number') return str;
  const s = str.replace('#','');
  const n = parseInt(s, 16);
  return isNaN(n) ? fallback : n;
}
function darken(hex, factor) {
  const r = ((hex >> 16) & 0xff) * factor | 0;
  const g = ((hex >>  8) & 0xff) * factor | 0;
  const b = ((hex >>  0) & 0xff) * factor | 0;
  return (r << 16) | (g << 8) | b;
}

socket.on('maxMoney', () => { if (myPlayer) myPlayer.money = 9999999; });
