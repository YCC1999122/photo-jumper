/* ==========================================
   Photo Jumper - main.js
   照片 → AI 识别 → 3D 跳跃关卡
   ========================================== */

import * as THREE from 'three';

// ===== Config =====
const CFG = {
  gravity: -0.022,
  jumpForce: 0.40,
  moveSpeed: 0.13,
  charRadius: 0.45,
  charHeight: 1.0,
  worldScale: 30,
  platformStep: 2.6,
  maxPlatforms: 12,
  respawnY: -15,
  coyoteFrames: 6,
};

// COCO-SSD 类别 → 颜色映射
const CAT_COLORS = {
  person: 0x60a5fa, bicycle: 0x22d3ee, car: 0xef4444, motorcycle: 0xf97316,
  bus: 0xf59e0b, truck: 0xfb923c, bird: 0x34d399, cat: 0xa78bfa,
  dog: 0xf472b6, horse: 0xfb7185, sheep: 0x86efac, cow: 0xfde047,
  elephant: 0xd4d4d8, bear: 0x9ca3af, zebra: 0xf3f4f6, giraffe: 0xfbbf24,
  chair: 0xfde68a, couch: 0xfca5a5, 'potted plant': 0x4ade80,
  bed: 0xc4b5fd, 'dining table': 0xfdba74, toilet: 0x94a3b8,
  tv: 0x1e293b, laptop: 0x475569, mouse: 0x64748b, keyboard: 0x334155,
  'cell phone': 0x6366f1, microwave: 0x71717a, oven: 0x52525b,
  book: 0xfbbf24, clock: 0xf59e0b, vase: 0x06b6d4, scissors: 0xef4444,
  'teddy bear': 0xf9a8d4, bottle: 0x3b82f6, 'wine glass': 0xb45309,
  cup: 0x0ea5e9, fork: 0x94a3b8, knife: 0xa3a3a3, spoon: 0xbcbcbc,
  bowl: 0xfbbf24, banana: 0xfacc15, apple: 0xef4444, sandwich: 0xf59e0b,
  orange: 0xf97316, broccoli: 0x22c55e, carrot: 0xfb923c,
  'hot dog': 0xfbbf24, pizza: 0xef4444, donut: 0xf472b6, cake: 0xec4899,
  backpack: 0x8b5cf6, umbrella: 0x6366f1, handbag: 0xa78bfa, tie: 0x3b82f6,
  suitcase: 0x7c3aed, frisbee: 0x06b6d4, skis: 0x0ea5e9,
  snowboard: 0x38bdf8, 'sports ball': 0xf97316, kite: 0x34d399,
  'baseball bat': 0xfbbf24, 'baseball glove': 0xf59e0b, skateboard: 0xf472b6,
  surfboard: 0x06b6d4, 'tennis racket': 0xfbbf24,
  'traffic light': 0x22c55e, 'fire hydrant': 0xef4444, 'stop sign': 0xdc2626,
  'parking meter': 0x6366f1, bench: 0xfde68a,
};
const DEFAULT_COLOR = 0x818cf8;

// ===== State =====
let scene, camera, renderer;
let character, npcChar, star;
let platforms = [];
let decorModels = [];
let velocity = new THREE.Vector3();
let isGrounded = false;
let coyoteTimer = 0;
const keys = {};
let gameState = 'upload';
let startTime = 0;
let model = null;
let photoImage = null;
let characterStart = new THREE.Vector3(0, 1, 0);
let starPos = new THREE.Vector3(0, 20, 0);

// NPC
let npcVel = new THREE.Vector3();
let npcGrounded = true;
let npcTimer = 1;

// DOM
const $ = id => document.getElementById(id);
const uploadScreen = $('uploadScreen');
const loadingScreen = $('loadingScreen');
const gameScreen = $('gameScreen');
const winScreen = $('winScreen');

// ===== Three.js Setup =====
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 100);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 12, 20);
  camera.lookAt(0, 5, 0);

  const canvas = $('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(15, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x86efac, 0.3);
  scene.add(hemi);

  // Base ground
  const groundGeo = new THREE.PlaneGeometry(100, 100);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 0.9 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sky stars (decorative)
  const starGeo = new THREE.BufferGeometry();
  const starPosArr = [];
  for (let i = 0; i < 150; i++) {
    starPosArr.push(
      (Math.random() - 0.5) * 200,
      Math.random() * 60 + 25,
      (Math.random() - 0.5) * 200
    );
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPosArr, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.5 });
  scene.add(new THREE.Points(starGeo, starMat));

  window.addEventListener('resize', onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===== Character =====
function createCharacter(color, isNPC) {
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.1 });

  const bodyColor = isNPC ? 0xfb923c : 0x3b82f6;
  const headColor = isNPC ? 0xfed7aa : 0x93c5fd;

  // Body
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 12), mat(bodyColor));
  body.position.y = 0.4;
  body.castShadow = true;
  group.add(body);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), mat(headColor));
  head.position.y = 0.95;
  head.castShadow = true;
  group.add(head);

  // Visor (face)
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.1, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.8 })
  );
  visor.position.set(0, 0.96, 0.2);
  group.add(visor);

  // Eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x60a5fa, emissiveIntensity: 0.5 });
  for (const x of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeMat);
    eye.position.set(x, 0.98, 0.22);
    group.add(eye);
  }

  // Antenna
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2), mat(0x1e293b));
  ant.position.y = 1.28;
  group.add(ant);
  const antBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.6 })
  );
  antBall.position.y = 1.40;
  group.add(antBall);

  // Arms
  for (const x of [-0.38, 0.38]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.25, 4, 8), mat(bodyColor));
    arm.position.set(x, 0.45, 0);
    arm.castShadow = true;
    group.add(arm);
  }

  group.userData.body = body;
  group.userData.head = head;
  return group;
}

// ===== Object 3D Models =====
function createObjectModel(category) {
  const group = new THREE.Group();
  const m = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.1 });
  const add = (mesh, x, y, z, rx = 0, ry = 0, rz = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    group.add(mesh);
  };

  switch (category) {
    case 'person': {
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 8), m(0x60a5fa)), 0, 0.5, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), m(0xfbbf24)), 0, 0.95, 0);
      break;
    }
    case 'car': case 'truck': case 'bus': {
      add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.5), m(0xef4444)), 0, 0.3, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.25, 0.4), m(0x1e3a8a)), 0.1, 0.6, 0);
      for (const [wx, wz] of [[-0.38, -0.28], [0.38, -0.28], [-0.38, 0.28], [0.38, 0.28]]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), m(0x1f2937, 0.8));
        add(wheel, wx, 0.12, wz, Math.PI / 2);
      }
      break;
    }
    case 'chair': case 'couch': case 'bench': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.5), m(0xfde68a)), 0, 0.3, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.08), m(0xfde68a)), 0, 0.55, -0.21);
      for (const [lx, lz] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3), m(0x92400e)), lx, 0.15, lz);
      }
      break;
    }
    case 'bottle': case 'wine glass': case 'cup': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.6, 12), m(0x3b82f6, 0.2)), 0, 0.35, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12), m(0x1e40af)), 0, 0.66, 0);
      break;
    }
    case 'dog': case 'cat': case 'horse': case 'cow': case 'sheep': case 'elephant': case 'bear': case 'zebra': case 'giraffe': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.25), m(0xa78bfa)), 0, 0.3, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), m(0xc4b5fd)), 0.28, 0.35, 0);
      for (const [lx, lz] of [[-0.15, -0.08], [0.15, -0.08], [-0.15, 0.08], [0.15, 0.08]]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25), m(0x7c3aed)), lx, 0.12, lz);
      }
      break;
    }
    case 'potted plant': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.25, 12), m(0x92400e)), 0, 0.15, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), m(0x22c55e)), 0, 0.5, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), m(0x4ade80)), 0.15, 0.6, 0.1);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), m(0x4ade80)), -0.15, 0.6, -0.1);
      break;
    }
    case 'tv': case 'laptop': case 'monitor': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), m(0x1e293b)), 0, 0.45, 0);
      add(new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x3b82f6, emissiveIntensity: 0.3 })), 0, 0.45, 0.03);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.1), m(0x334155)), 0, 0.22, 0);
      break;
    }
    case 'clock': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 24), m(0x1e293b, 0.3)), 0, 0.4, 0, Math.PI / 2);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.01, 24), m(0xfafafa)), 0, 0.4, 0.03, Math.PI / 2);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.02), m(0x1e293b)), 0, 0.47, 0.03);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), m(0x1e293b), ), 0, 0.42, 0.03);
      break;
    }
    case 'teddy bear': {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), m(0xf9a8d4)), 0, 0.32, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), m(0xfbcfe8)), 0, 0.65, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), m(0xf9a8d4)), -0.15, 0.8, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), m(0xf9a8d4)), 0.15, 0.8, 0);
      break;
    }
    case 'book': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.3), m(0x3b82f6)), 0, 0.12, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.28), m(0x1e40af)), 0, 0.2, 0);
      break;
    }
    case 'sports ball': case 'apple': case 'orange': {
      const col = category === 'apple' ? 0xef4444 : category === 'orange' ? 0xf97316 : 0x60a5fa;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), m(col)), 0, 0.22, 0);
      break;
    }
    case 'bowl': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.15, 16, 1, true), m(0xfbbf24, 0.4)), 0, 0.15, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16), m(0xf59e0b)), 0, 0.08, 0);
      break;
    }
    default: {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), m(CAT_COLORS[category] || DEFAULT_COLOR)), 0, 0.25, 0);
      break;
    }
  }
  return group;
}

// ===== Star =====
function createStar() {
  const shape = new THREE.Shape();
  const outer = 0.6, inner = 0.25, spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  const mat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.2 });
  const star = new THREE.Mesh(geo, mat);
  star.castShadow = true;

  // Glow light
  const light = new THREE.PointLight(0xfbbf24, 1.5, 8);
  light.position.set(0, 0, 0);
  star.add(light);

  // Particles around star
  const pGeo = new THREE.BufferGeometry();
  const pPos = [];
  for (let i = 0; i < 20; i++) {
    pPos.push((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  }
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xfde68a, size: 0.08, transparent: true, opacity: 0.8 });
  const particles = new THREE.Points(pGeo, pMat);
  star.add(particles);
  star.userData.particles = particles;

  return star;
}

// ===== Level Generation =====
function generateLevel(detections, imgW, imgH) {
  clearLevel();

  // Filter and sort detections
  const valid = detections
    .filter(d => d.score > 0.35)
    .slice(0, CFG.maxPlatforms);

  if (valid.length === 0) {
    // Fallback: generate random platforms
    return generateFallbackLevel();
  }

  // Sort by image Y (top of image = higher platform) then by X
  const sorted = [...valid].sort((a, b) => a.bbox[1] - b.bbox[1]);

  // Map: image X → world X, height assigned by sorted order
  const scaleX = CFG.worldScale / imgW;
  const scaleZ = CFG.worldScale / imgH;

  sorted.forEach((det, i) => {
    const [bx, by, bw, bh] = det.bbox;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;

    // World position
    const wx = (cx - imgW / 2) * scaleX;
    const wz = (cy - imgH / 2) * scaleZ;
    const wy = (i + 1) * CFG.platformStep;

    // Platform size (mapped from bbox, clamped)
    const pw = Math.max(2, Math.min(bw * scaleX * 0.8, 5));
    const pd = Math.max(2, Math.min(bh * scaleZ * 0.8, 4));
    const ph = 0.6;

    const color = CAT_COLORS[det.class] || DEFAULT_COLOR;

    // Platform mesh
    const platGeo = new THREE.BoxGeometry(pw, ph, pd);
    const platMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15 });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(wx, wy, wz);
    platform.castShadow = true;
    platform.receiveShadow = true;

    // Store collision box
    platform.userData.box = {
      minX: wx - pw / 2, maxX: wx + pw / 2,
      minY: wy - ph / 2, maxY: wy + ph / 2,
      minZ: wz - pd / 2, maxZ: wz + pd / 2,
    };
    platform.userData.category = det.class;
    platform.userData.index = i;
    scene.add(platform);
    platforms.push(platform);

    // Decoration model on top
    const model = createObjectModel(det.class);
    model.position.set(wx, wy + ph / 2, wz);
    model.scale.setScalar(Math.min(pw, pd) * 0.3);
    scene.add(model);
    decorModels.push(model);

    // Label (sprite)
    const label = createLabel(det.class + ' ' + Math.round(det.score * 100) + '%');
    label.position.set(wx, wy + ph / 2 + 0.5, wz);
    label.scale.setScalar(2);
    scene.add(label);
    decorModels.push(label);

    // Update star position to top platform
    if (i === sorted.length - 1) {
      starPos.set(wx, wy + 2.5, wz);
    }
  });

  // Photo on ground
  if (photoImage) {
    const tex = new THREE.TextureLoader().load(photoImage.src);
    tex.colorSpace = THREE.SRGBColorSpace;
    const groundGeo = new THREE.PlaneGeometry(CFG.worldScale, CFG.worldScale * (imgH / imgW));
    const groundMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.35, roughness: 0.8 });
    const photoGround = new THREE.Mesh(groundGeo, groundMat);
    photoGround.rotation.x = -Math.PI / 2;
    photoGround.position.y = 0.02;
    photoGround.receiveShadow = true;
    scene.add(photoGround);
    decorModels.push(photoGround);
  }

  // Place star
  star = createStar();
  star.position.copy(starPos);
  scene.add(star);

  // Place character at lowest platform
  const first = platforms[0];
  if (first) {
    characterStart.set(first.position.x, first.userData.box.maxY + 0.6, first.position.z + 2);
  } else {
    characterStart.set(0, 1, 0);
  }

  character = createCharacter(0x3b82f6, false);
  character.position.copy(characterStart);
  scene.add(character);

  // NPC character
  const npcStart = platforms[Math.floor(platforms.length / 2)] || platforms[0];
  if (npcStart) {
    npcChar = createCharacter(0xfb923c, true);
    npcChar.position.set(npcStart.position.x, npcStart.userData.box.maxY + 0.6, npcStart.position.z);
    scene.add(npcChar);
  }

  // Update HUD
  $('platformCount').textContent = platforms.length;

  // Reset state
  velocity.set(0, 0, 0);
  isGrounded = false;
}

function generateFallbackLevel() {
  const cats = ['person', 'car', 'chair', 'bottle', 'dog', 'potted plant', 'tv', 'clock', 'teddy bear', 'book'];
  const count = 6 + Math.floor(Math.random() * 4);
  const detections = [];
  for (let i = 0; i < count; i++) {
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const w = 60 + Math.random() * 120;
    const h = 60 + Math.random() * 120;
    detections.push({
      class: cat,
      bbox: [Math.random() * 400, Math.random() * 300, w, h],
      score: 0.7 + Math.random() * 0.25,
    });
  }
  generateLevel(detections, 640, 480);
}

function clearLevel() {
  platforms.forEach(p => scene.remove(p));
  decorModels.forEach(d => scene.remove(d));
  if (character) scene.remove(character);
  if (npcChar) scene.remove(npcChar);
  if (star) scene.remove(star);
  platforms = [];
  decorModels = [];
  character = null;
  npcChar = null;
  star = null;
  velocity.set(0, 0, 0);
}

function createLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
  ctx.roundRect(0, 0, 256, 64, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px Space Grotesk, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  return new THREE.Sprite(mat);
}

// ===== Physics & Collision =====
function updatePhysics() {
  if (!character) return;

  // Input → horizontal velocity
  let mx = 0, mz = 0;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['w'] || keys['arrowup']) mz -= 1;
  if (keys['s'] || keys['arrowdown']) mz += 1;
  if (mx && mz) { mx *= 0.707; mz *= 0.707; }

  velocity.x = mx * CFG.moveSpeed;
  velocity.z = mz * CFG.moveSpeed;

  // Jump (with coyote time)
  if (keys[' '] && coyoteTimer > 0) {
    velocity.y = CFG.jumpForce;
    coyoteTimer = 0;
    isGrounded = false;
    // Stretch animation
    character.scale.set(0.75, 1.25, 0.75);
  }

  // Gravity
  velocity.y += CFG.gravity;
  if (velocity.y < -0.6) velocity.y = -0.6;

  // Apply velocity
  character.position.x += velocity.x;
  character.position.y += velocity.y;
  character.position.z += velocity.z;

  // Collision
  checkCollision();

  // Coyote time
  if (isGrounded) {
    coyoteTimer = CFG.coyoteFrames;
  } else if (coyoteTimer > 0) {
    coyoteTimer--;
  }

  // Fall → respawn
  if (character.position.y < CFG.respawnY) {
    respawn();
  }

  // Character facing
  if (mx !== 0 || mz !== 0) {
    const targetAngle = Math.atan2(mx, mz);
    let diff = targetAngle - character.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    character.rotation.y += diff * 0.2;
  }

  // Squash/stretch recovery
  if (isGrounded) {
    character.scale.x += (1 - character.scale.x) * 0.2;
    character.scale.y += (1 - character.scale.y) * 0.2;
    character.scale.z += (1 - character.scale.z) * 0.2;
  }

  // Check win
  if (star) {
    const dist = character.position.distanceTo(star.position);
    if (dist < 1.5) {
      onWin();
    }
  }
}

function checkCollision() {
  isGrounded = false;
  const p = character.position;
  const r = CFG.charRadius;
  const h = CFG.charHeight;

  const charBox = {
    minX: p.x - r, maxX: p.x + r,
    minY: p.y - h * 0.5, maxY: p.y + h * 0.5,
    minZ: p.z - r, maxZ: p.z + r,
  };

  for (const plat of platforms) {
    const box = plat.userData.box;
    if (!box) continue;

    // AABB overlap
    if (charBox.maxX <= box.minX || charBox.minX >= box.maxX) continue;
    if (charBox.maxY <= box.minY || charBox.minY >= box.maxY) continue;
    if (charBox.maxZ <= box.minZ || charBox.minZ >= box.maxZ) continue;

    // Find minimum penetration axis
    const ox = Math.min(charBox.maxX - box.minX, box.maxX - charBox.minX);
    const oy = Math.min(charBox.maxY - box.minY, box.maxY - charBox.minY);
    const oz = Math.min(charBox.maxZ - box.minZ, box.maxZ - charBox.minZ);

    const minO = Math.min(ox, oy, oz);

    if (minO === oy) {
      // Vertical resolution
      const platCenterY = (box.minY + box.maxY) / 2;
      if (p.y < platCenterY) {
        // Push down (hit head)
        p.y -= oy;
        if (velocity.y > 0) velocity.y = 0;
      } else {
        // Push up (land on top)
        p.y += oy;
        if (velocity.y < 0) velocity.y = 0;
        isGrounded = true;
      }
    } else if (minO === ox) {
      // X axis
      const platCenterX = (box.minX + box.maxX) / 2;
      p.x += (p.x < platCenterX ? -ox : ox);
      velocity.x = 0;
    } else {
      // Z axis
      const platCenterZ = (box.minZ + box.maxZ) / 2;
      p.z += (p.z < platCenterZ ? -oz : oz);
      velocity.z = 0;
    }
  }

  // Ground plane
  if (p.y < 0.5) {
    p.y = 0.5;
    if (velocity.y < 0) velocity.y = 0;
    isGrounded = true;
  }
}

function respawn() {
  character.position.copy(characterStart);
  velocity.set(0, 0, 0);
  isGrounded = false;
  coyoteTimer = 0;
  showToast('掉落！重新开始');
}

// ===== NPC =====
function updateNPC(dt) {
  if (!npcChar) return;
  const p = npcChar.position;

  npcTimer -= dt;
  if (npcTimer <= 0 && npcGrounded) {
    // Random jump
    npcVel.y = 0.3 + Math.random() * 0.15;
    npcVel.x = (Math.random() - 0.5) * 0.1;
    npcVel.z = (Math.random() - 0.5) * 0.1;
    npcGrounded = false;
    npcTimer = 0.8 + Math.random() * 1.5;
    npcChar.scale.set(0.8, 1.2, 0.8);
  }

  npcVel.y += CFG.gravity;
  if (npcVel.y < -0.5) npcVel.y = -0.5;

  p.x += npcVel.x;
  p.y += npcVel.y;
  p.z += npcVel.z;

  // Simple platform collision (top only)
  let landed = false;
  for (const plat of platforms) {
    const box = plat.userData.box;
    if (!box) continue;
    if (p.x > box.minX - 0.3 && p.x < box.maxX + 0.3 &&
        p.z > box.minZ - 0.3 && p.z < box.maxZ + 0.3 &&
        p.y < box.maxY + 0.1 && p.y > box.maxY - 0.5 && npcVel.y <= 0) {
      p.y = box.maxY + 0.5;
      npcVel.set(0, 0, 0);
      npcGrounded = true;
      landed = true;
      break;
    }
  }
  if (!landed && p.y < 0.5) {
    p.y = 0.5;
    npcVel.set(0, 0, 0);
    npcGrounded = true;
  }

  // Animation recovery
  if (npcGrounded) {
    npcChar.scale.x += (1 - npcChar.scale.x) * 0.15;
    npcChar.scale.y += (1 - npcChar.scale.y) * 0.15;
    npcChar.scale.z += (1 - npcChar.scale.z) * 0.15;
  }

  // Face movement direction
  if (npcVel.x !== 0 || npcVel.z !== 0) {
    npcChar.rotation.y = Math.atan2(npcVel.x, npcVel.z);
  }
}

// ===== Camera =====
function updateCamera() {
  if (!character) return;
  const target = new THREE.Vector3(
    character.position.x * 0.4,
    character.position.y + 7,
    character.position.z + 12
  );
  camera.position.lerp(target, 0.06);
  const look = new THREE.Vector3(
    character.position.x * 0.4,
    character.position.y + 1,
    character.position.z
  );
  camera.lookAt(look);
}

// ===== Game Loop =====
let lastTime = 0;
function animate(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (gameState === 'playing') {
    updatePhysics();
    updateNPC(dt);
    updateCamera();
    updateTimer();
    updateStar(dt);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateTimer() {
  const elapsed = (performance.now() - startTime) / 1000;
  const min = Math.floor(elapsed / 60);
  const sec = Math.floor(elapsed % 60);
  $('timer').textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function updateStar(dt) {
  if (!star) return;
  star.rotation.y += dt * 1.5;
  star.position.y = starPos.y + Math.sin(performance.now() * 0.002) * 0.3;
  if (star.userData.particles) {
    star.userData.particles.rotation.y += dt * 0.5;
    star.userData.particles.rotation.x += dt * 0.3;
  }
}

// ===== Input =====
function setupInput() {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Upload area
  const area = $('uploadArea');
  const input = $('fileInput');
  area.addEventListener('click', () => input.click());
  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('dragover');
  });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  // Demo button
  $('demoBtn').addEventListener('click', () => {
    showScreen('loading');
    $('loadingText').textContent = '正在生成随机关卡...';
    setTimeout(() => {
      initThree();
      gameState = 'loading';
      setTimeout(() => {
        generateFallbackLevel();
        showScreen('game');
        gameState = 'playing';
        startTime = performance.now();
      }, 600);
    }, 300);
  });

  // Reset button
  $('resetBtn').addEventListener('click', () => {
    if (character) {
      character.position.copy(characterStart);
      velocity.set(0, 0, 0);
      showToast('已重置位置');
    }
  });

  // Win buttons
  $('playAgainBtn').addEventListener('click', () => {
    if (character) {
      character.position.copy(characterStart);
      velocity.set(0, 0, 0);
      isGrounded = false;
      coyoteTimer = 0;
      startTime = performance.now();
      gameState = 'playing';
      showScreen('game');
    }
  });

  $('newPhotoBtn').addEventListener('click', () => {
    clearLevel();
    gameState = 'upload';
    showScreen('upload');
  });
}

// ===== File Upload =====
async function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('请上传图片文件');
    return;
  }

  showScreen('loading');
  $('loadingText').textContent = '正在读取图片...';

  const img = new Image();
  img.onload = async () => {
    photoImage = img;

    // Load COCO-SSD model
    $('loadingText').textContent = '正在加载 AI 模型...';
    if (!model) {
      try {
        model = await cocoSsd.load({ base: 'mobilenet_v2' });
      } catch (e) {
        console.warn('Model load failed:', e);
        model = null;
      }
    }

    let detections = [];
    if (model) {
      $('loadingText').textContent = '正在分析照片内容...';
      try {
        detections = await model.detect(img);
      } catch (e) {
        console.warn('Detection failed:', e);
        detections = [];
      }
    }

    $('loadingText').textContent = '正在生成 3D 关卡...';

    // Init Three.js if first time
    if (!scene) initThree();

    setTimeout(() => {
      if (detections.length === 0) {
        showToast('未检测到物体，使用随机生成关卡');
        generateFallbackLevel();
      } else {
        generateLevel(detections, img.width, img.height);
      }
      showScreen('game');
      gameState = 'playing';
      startTime = performance.now();
    }, 400);
  };
  img.src = URL.createObjectURL(file);
}

// ===== UI =====
function showScreen(name) {
  uploadScreen.classList.add('hidden');
  loadingScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');
  winScreen.classList.add('hidden');
  if (name === 'upload') uploadScreen.classList.remove('hidden');
  else if (name === 'loading') loadingScreen.classList.remove('hidden');
  else if (name === 'game') gameScreen.classList.remove('hidden');
  else if (name === 'win') winScreen.classList.remove('hidden');
}

function onWin() {
  gameState = 'won';
  const elapsed = (performance.now() - startTime) / 1000;
  const min = Math.floor(elapsed / 60);
  const sec = Math.floor(elapsed % 60);
  $('winTime').textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  showScreen('win');
  spawnConfetti();
}

function spawnConfetti() {
  const container = $('confetti');
  container.innerHTML = '';
  const colors = ['#3b82f6', '#8b5cf6', '#fbbf24', '#ef4444', '#22c55e', '#ec4899'];
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 0.5 + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 5000);
}

let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}

// ===== Init =====
setupInput();
requestAnimationFrame(animate);
