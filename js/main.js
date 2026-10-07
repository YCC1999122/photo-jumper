/* ==========================================
   Photo Jumper - main.js
   照片竖起 → 亮度凸起成台阶 → 角色攀爬到顶
   ========================================== */

(function () {
'use strict';

// ===== Config =====
const CFG = {
  gravity: -0.035,
  jumpForce: 0.55,
  moveSpeed: 0.15,
  charRadius: 0.35,
  charHeight: 0.9,
  terrainWidth: 22,
  terrainHeight: 32,
  terrainSegments: 95,
  maxBumpDepth: 3.0,
  contactMarkerSize: 0.16,
  respawnY: -22,
  coyoteFrames: 6,
};

// ===== State =====
let scene, camera, renderer;
let character, star;
let terrain = null;
let terrainData = null;
let groundMesh = null;
let contactPoints = [];
let velocity = new THREE.Vector3();
let isGrounded = false;
let isJumping = false;
let coyoteTimer = 0;
const keys = {};
let gameState = 'upload';
let startTime = 0;
let model = null;
let photoImage = null;
let characterStart = new THREE.Vector3(0, -14, 3);
let starPos = new THREE.Vector3(0, 15, 3);

// DOM
const $ = id => document.getElementById(id);
const uploadScreen = $('uploadScreen');
const loadingScreen = $('loadingScreen');
const gameScreen = $('gameScreen');
const winScreen = $('winScreen');

// ===== Three.js Setup =====
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe0e7ef);
  scene.fog = new THREE.Fog(0xe0e7ef, 40, 100);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, -10, 18);
  camera.lookAt(0, -5, 0);

  const canvas = $('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(5, 8, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xb0c4de, 0.3);
  fill.position.set(-8, -5, 8);
  scene.add(fill);

  const hemi = new THREE.HemisphereLight(0xe0e7ef, 0xc0c0c0, 0.25);
  scene.add(hemi);

  // Ground plane for spatial reference (shows the wall is vertical)
  const groundGeo = new THREE.PlaneGeometry(80, 80);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xc8d2e0, roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -CFG.terrainHeight / 2 - 0.5;
  ground.receiveShadow = true;
  scene.add(ground);
  groundMesh = ground;

  window.addEventListener('resize', onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===== Character =====
function createCharacter() {
  const group = new THREE.Group();
  const mat = (c, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.1 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 12), mat(0x3b82f6));
  body.position.y = 0;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), mat(0x93c5fd));
  head.position.y = 0.45;
  head.castShadow = true;
  group.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.08, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.8 })
  );
  visor.position.set(0, 0.47, 0.16);
  group.add(visor);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x60a5fa, emissiveIntensity: 0.5 });
  for (const x of [-0.06, 0.06]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyeMat);
    eye.position.set(x, 0.49, 0.18);
    group.add(eye);
  }

  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16), mat(0x1e293b));
  ant.position.y = 0.72;
  group.add(ant);
  const antBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.6 })
  );
  antBall.position.y = 0.82;
  group.add(antBall);

  for (const x of [-0.3, 0.3]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), mat(0x3b82f6));
    arm.position.set(x, 0.05, 0.05);
    arm.castShadow = true;
    group.add(arm);
  }

  group.userData.body = body;
  group.userData.head = head;
  return group;
}

// ===== Star =====
function createStar() {
  const shape = new THREE.Shape();
  const outer = 0.55, inner = 0.22, spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  const mat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.2 });
  const star = new THREE.Mesh(geo, mat);
  star.castShadow = true;

  const light = new THREE.PointLight(0xfbbf24, 1.5, 10);
  star.add(light);

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

// ===== 2D Photo → Vertical 3D Climbing Wall =====
function generateLevelFromImage(img) {
  clearLevel();

  const W = CFG.terrainSegments + 1;
  const H = W;
  const tw = CFG.terrainWidth;
  const th = CFG.terrainHeight;

  // 1. Draw image to canvas, extract pixel brightness
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  const imageData = ctx.getImageData(0, 0, W, H);

  // 2. Build heightmap from brightness
  const heightMap = [];
  for (let y = 0; y < H; y++) {
    heightMap[y] = [];
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      heightMap[y][x] = brightness;
    }
  }

  // 3. Create VERTICAL terrain (PlaneGeometry default is vertical, no rotation)
  //    Z displacement = brightness → bright areas bulge out toward camera = climbable steps
  const geo = new THREE.PlaneGeometry(tw, th, CFG.terrainSegments, CFG.terrainSegments);
  const positions = geo.attributes.position;
  const bumpHeights = [];

  for (let i = 0; i < positions.count; i++) {
    const ix = i % W;
    const iy = Math.floor(i / W);

    // PlaneGeometry: iy=0 → Y=+th/2 (top), iy=H-1 → Y=-th/2 (bottom)
    // Image row 0 = top of image = top of terrain (high Y) — correct!
    // Z bulge: bright = bulge out toward camera (+Z)
    const bump = heightMap[iy][ix] * CFG.maxBumpDepth;
    positions.setZ(i, bump);
    bumpHeights.push(bump);
  }

  geo.computeVertexNormals();

  // 4. Apply original image as texture
  const tex = new THREE.TextureLoader().load(img.src);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  terrain = new THREE.Mesh(geo, mat);
  // NO rotation — terrain stays vertical like a wall
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  // 5. Backing plane (dark wall behind photo for depth)
  const backGeo = new THREE.PlaneGeometry(tw + 8, th + 8);
  const backMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
  const backWall = new THREE.Mesh(backGeo, backMat);
  backWall.position.z = -CFG.maxBumpDepth - 0.5;
  backWall.receiveShadow = true;
  scene.add(backWall);

  // 5b. Picture frame (border around photo — makes vertical orientation obvious)
  const frameDepth = 0.3;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.2 });
  // Top frame
  const fTop = new THREE.Mesh(new THREE.BoxGeometry(tw + 1.2, 0.6, frameDepth), frameMat);
  fTop.position.set(0, th / 2 + 0.3, -0.15);
  fTop.castShadow = true;
  scene.add(fTop);
  // Bottom frame
  const fBot = new THREE.Mesh(new THREE.BoxGeometry(tw + 1.2, 0.6, frameDepth), frameMat);
  fBot.position.set(0, -th / 2 - 0.3, -0.15);
  fBot.castShadow = true;
  scene.add(fBot);
  // Left frame
  const fLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, th + 1.2, frameDepth), frameMat);
  fLeft.position.set(-tw / 2 - 0.3, 0, -0.15);
  fLeft.castShadow = true;
  scene.add(fLeft);
  // Right frame
  const fRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, th + 1.2, frameDepth), frameMat);
  fRight.position.set(tw / 2 + 0.3, 0, -0.15);
  fRight.castShadow = true;
  scene.add(fRight);

  // 5c. Side pillars for 3D spatial reference
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
  for (const sx of [-(tw / 2 + 2), tw / 2 + 2]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, th + 2, 0.5), pillarMat);
    pillar.position.set(sx, 0, -1);
    pillar.castShadow = true;
    scene.add(pillar);
  }

  // Store terrain data for collision
  terrainData = {
    width: tw, height: th,
    segments: CFG.terrainSegments,
    W: W, H: H,
    heightMap: heightMap,
    bumps: bumpHeights,
    maxBump: CFG.maxBumpDepth,
  };

  // 6. Add climbing contact markers at local maxima (bright spots = bulges = steps)
  contactPoints = [];
  const step = 6;
  for (let y = 2; y < H - 2; y += step) {
    for (let x = 2; x < W - 2; x += step) {
      const v = heightMap[y][x];
      let isMax = true;
      for (let dy = -1; dy <= 1 && isMax; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (heightMap[y + dy] && heightMap[y + dy][x + dx] > v) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax && v > 0.3) {
        const wx = (x / (W - 1) - 0.5) * tw;
        // iy=0 → Y=+th/2, iy=H-1 → Y=-th/2
        const wy = (0.5 - y / (H - 1)) * th;
        const wz = v * CFG.maxBumpDepth + 0.15;

        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(CFG.contactMarkerSize, 10, 10),
          new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.7,
            metalness: 0.5,
            roughness: 0.3,
          })
        );
        marker.position.set(wx, wy, wz);
        marker.castShadow = true;
        scene.add(marker);
        contactPoints.push({ mesh: marker, x: wx, y: wy, z: wz });

        // Small ring on the surface
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.25, 0.025, 8, 16),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.4, transparent: true, opacity: 0.6 })
        );
        ring.position.set(wx, wy, wz - 0.05);
        scene.add(ring);
      }
    }
  }

  // 7. Place star at top of terrain
  starPos.set(0, th / 2 - 1.5, getTerrainBump(0, th / 2 - 1.5) + 1.5);
  star = createStar();
  star.position.copy(starPos);
  scene.add(star);

  // 8. Place character at LEFT side, on the ground, OUTSIDE the picture
  const startY = -th / 2;
  characterStart.set(-tw / 2 - 2, startY, CFG.charRadius + 0.1);
  character = createCharacter();
  character.position.copy(characterStart);
  scene.add(character);

  $('platformCount').textContent = contactPoints.length;
  velocity.set(0, 0, 0);
  isGrounded = false;
  isJumping = false;
  coyoteTimer = 0;
}

// Fallback: random vertical terrain
function generateFallbackLevel() {
  const W = CFG.terrainSegments + 1;
  const tw = CFG.terrainWidth;
  const th = CFG.terrainHeight;

  clearLevel();

  const geo = new THREE.PlaneGeometry(tw, th, CFG.terrainSegments, CFG.terrainSegments);
  const positions = geo.attributes.position;
  const bumpHeights = [];
  const heightMap = [];

  for (let y = 0; y < W; y++) {
    heightMap[y] = [];
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const noise = Math.sin(x * 0.25) * Math.cos(y * 0.2) * 0.4 + Math.sin(x * 0.6 + y * 0.4) * 0.3 + 0.5;
      const v = Math.max(0, Math.min(1, noise));
      const bump = v * CFG.maxBumpDepth * 0.8;
      positions.setZ(i, bump);
      bumpHeights.push(bump);
      heightMap[y][x] = v;
    }
  }

  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide });
  terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  const backGeo = new THREE.PlaneGeometry(tw + 8, th + 8);
  const backMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
  const backWall = new THREE.Mesh(backGeo, backMat);
  backWall.position.z = -CFG.maxBumpDepth - 0.5;
  scene.add(backWall);

  // Picture frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.2 });
  const fTop = new THREE.Mesh(new THREE.BoxGeometry(tw + 1.2, 0.6, 0.3), frameMat);
  fTop.position.set(0, th / 2 + 0.3, -0.15); scene.add(fTop);
  const fBot = new THREE.Mesh(new THREE.BoxGeometry(tw + 1.2, 0.6, 0.3), frameMat);
  fBot.position.set(0, -th / 2 - 0.3, -0.15); scene.add(fBot);
  const fLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, th + 1.2, 0.3), frameMat);
  fLeft.position.set(-tw / 2 - 0.3, 0, -0.15); scene.add(fLeft);
  const fRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, th + 1.2, 0.3), frameMat);
  fRight.position.set(tw / 2 + 0.3, 0, -0.15); scene.add(fRight);

  // Side pillars
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
  for (const sx of [-(tw / 2 + 2), tw / 2 + 2]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, th + 2, 0.5), pillarMat);
    pillar.position.set(sx, 0, -1);
    scene.add(pillar);
  }

  terrainData = {
    width: tw, height: th,
    segments: CFG.terrainSegments,
    W: W, H: W,
    heightMap: heightMap,
    bumps: bumpHeights,
    maxBump: CFG.maxBumpDepth,
  };

  contactPoints = [];
  for (let y = 3; y < W - 3; y += 5) {
    for (let x = 3; x < W - 3; x += 5) {
      if (heightMap[y][x] > 0.35) {
        const wx = (x / (W - 1) - 0.5) * tw;
        const wy = (0.5 - y / (W - 1)) * th;
        const wz = heightMap[y][x] * CFG.maxBumpDepth + 0.15;
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(CFG.contactMarkerSize, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.7 })
        );
        marker.position.set(wx, wy, wz);
        scene.add(marker);
        contactPoints.push({ mesh: marker, x: wx, y: wy, z: wz });

        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.25, 0.025, 8, 16),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.4, transparent: true, opacity: 0.6 })
        );
        ring.position.set(wx, wy, wz - 0.05);
        scene.add(ring);
      }
    }
  }

  starPos.set(0, th / 2 - 1.5, getTerrainBump(0, th / 2 - 1.5) + 1.5);
  star = createStar();
  star.position.copy(starPos);
  scene.add(star);

  const startY = -th / 2;
  characterStart.set(-tw / 2 - 2, startY, CFG.charRadius + 0.1);
  character = createCharacter();
  character.position.copy(characterStart);
  scene.add(character);

  $('platformCount').textContent = contactPoints.length;
  velocity.set(0, 0, 0);
  isGrounded = false;
  isJumping = false;
  coyoteTimer = 0;
}

function clearLevel() {
  if (terrain) { scene.remove(terrain); terrain = null; }
  if (character) { scene.remove(character); character = null; }
  if (star) { scene.remove(star); star = null; }
  contactPoints.forEach(cp => {
    scene.remove(cp.mesh);
  });
  // Remove all level-generated objects (rings, frames, pillars, backing walls, markers)
  // Keep lights and ground plane
  scene.children.slice().forEach(child => {
    if (child === groundMesh) return;
    if (child.isLight) return;
    scene.remove(child);
  });
  contactPoints = [];
  terrainData = null;
  isJumping = false;
  velocity.set(0, 0, 0);
}

// ===== Terrain Collision (vertical wall, Z bulge) =====
function getTerrainBump(worldX, worldY) {
  if (!terrainData) return 0;

  const td = terrainData;
  const tw = td.width;
  const th = td.height;
  const W = td.W, H = td.H;

  // PlaneGeometry: X ∈ [-tw/2, tw/2], Y ∈ [-th/2, th/2]
  // iy=0 → Y=+th/2 (top), iy=H-1 → Y=-th/2 (bottom)
  const fx = (worldX / tw + 0.5) * (W - 1);
  const fy = (0.5 - worldY / th) * (H - 1);

  if (fx < 0 || fx > W - 1 || fy < 0 || fy > H - 1) return 0;

  // Bilinear interpolation
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const tx = fx - x0, ty = fy - y0;

  const h00 = td.heightMap[y0][x0];
  const h10 = td.heightMap[y0][x1];
  const h01 = td.heightMap[y1][x0];
  const h11 = td.heightMap[y1][x1];

  const h0 = h00 * (1 - tx) + h10 * tx;
  const h1 = h01 * (1 - tx) + h11 * tx;
  return (h0 * (1 - ty) + h1 * ty) * td.maxBump;
}

// ===== Physics (3D platformer on vertical wall) =====
function updatePhysics() {
  if (!character || !terrainData) return;

  const p = character.position;
  const groundY = -CFG.terrainHeight / 2;

  // Input: A/D for left/right
  let mx = 0;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  velocity.x = mx * CFG.moveSpeed;

  // Jump (Space or W or Up arrow)
  if ((keys[' '] || keys['w'] || keys['arrowup']) && isGrounded) {
    velocity.y = CFG.jumpForce;
    isGrounded = false;
    isJumping = true;
    character.scale.set(0.75, 1.25, 0.75);
  }

  // Air physics: gravity + Z drift toward wall (reach for wall)
  if (!isGrounded) {
    velocity.y += CFG.gravity;
    if (velocity.y < -0.5) velocity.y = -0.5;
    velocity.z -= 0.012;
    if (velocity.z < -0.06) velocity.z = -0.06;
  } else {
    velocity.z = 0;
  }

  // Apply velocity
  p.x += velocity.x;
  p.y += velocity.y;
  p.z += velocity.z;

  // Wall collision: character can't go inside the wall
  const bump = getTerrainBump(p.x, p.y);
  if (bump + CFG.charRadius > p.z) {
    p.z = bump + CFG.charRadius;
    velocity.z = 0;

    // Landing: falling + step edge below (protrusion sticks out more below feet)
    if (!isGrounded && velocity.y <= 0) {
      const bumpBelow = getTerrainBump(p.x, p.y - 0.4);
      if (bumpBelow > bump + 0.06) {
        // Step edge — solid landing on top of the protrusion
        isGrounded = true;
        isJumping = false;
        velocity.y = 0;
      } else if (bump > 0.4 && velocity.y > -0.2) {
        // High protrusion + slow fall — grab landing
        isGrounded = true;
        isJumping = false;
        velocity.y = 0;
      }
    }
  }

  // Walked off a step? (only check when above ground level)
  if (isGrounded && p.y > groundY + 0.5) {
    const bumpBelow = getTerrainBump(p.x, p.y - 0.4);
    if (bumpBelow <= bump + 0.04) {
      // No step below — start falling
      isGrounded = false;
    }
  }

  // Ground collision (floor below the picture)
  if (p.y < groundY) {
    p.y = groundY;
    velocity.y = 0;
    isGrounded = true;
    isJumping = false;
    velocity.z = 0;
  }

  // When grounded, keep Z on the surface
  if (isGrounded) {
    const stepBump = getTerrainBump(p.x, p.y);
    p.z = Math.max(p.z, stepBump + CFG.charRadius * 0.9);
  }

  // Coyote time
  if (isGrounded) coyoteTimer = CFG.coyoteFrames;
  else if (coyoteTimer > 0) coyoteTimer--;

  // World bounds (allow movement outside picture edges)
  const halfW = CFG.terrainWidth / 2;
  if (p.x < -halfW - 5) p.x = -halfW - 5;
  if (p.x > halfW + 5) p.x = halfW + 5;
  if (p.y > CFG.terrainHeight / 2) p.y = CFG.terrainHeight / 2;

  // Fall → respawn
  if (p.y < CFG.respawnY) {
    respawn();
  }

  // Character facing (tilt with movement)
  if (mx !== 0) {
    character.rotation.z = Math.atan2(mx, 1) * 0.15;
  } else {
    character.rotation.z *= 0.9;
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
    if (dist < 2.0) {
      onWin();
    }
  }
}

function respawn() {
  character.position.copy(characterStart);
  velocity.set(0, 0, 0);
  isGrounded = false;
  isJumping = false;
  coyoteTimer = 0;
  showToast('掉落！重新开始');
}

// ===== Camera (angled view to show 3D depth of protrusions) =====
function updateCamera() {
  if (!character) return;
  // Camera follows character with slight angle for 3D depth perception
  const targetX = character.position.x * 0.2;
  const targetY = character.position.y + 3;
  const targetZ = 14;

  camera.position.x += (targetX - camera.position.x) * 0.06;
  camera.position.y += (targetY - camera.position.y) * 0.06;
  camera.position.z += (targetZ - camera.position.z) * 0.06;
  // Look at character slightly from above to see step tops
  camera.lookAt(character.position.x * 0.2, character.position.y - 1, 0);
}

// ===== Game Loop =====
let lastTime = 0;
function animate(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (gameState === 'playing') {
    updatePhysics();
    updateCamera();
    updateTimer();
    updateStar(dt);
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}

function updateTimer() {
  const elapsed = (performance.now() - startTime) / 1000;
  const min = Math.floor(elapsed / 60);
  const sec = Math.floor(elapsed % 60);
  $('timer').textContent = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
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

  $('demoBtn').addEventListener('click', () => {
    showScreen('loading');
    $('loadingText').textContent = '正在生成随机关卡...';
    setTimeout(() => {
      if (!scene) initThree();
      generateFallbackLevel();
      showScreen('game');
      gameState = 'playing';
      startTime = performance.now();
    }, 600);
  });

  $('resetBtn').addEventListener('click', () => {
    if (character) {
      character.position.copy(characterStart);
      velocity.set(0, 0, 0);
      isJumping = false;
      showToast('已重置位置');
    }
  });

  $('playAgainBtn').addEventListener('click', () => {
    if (character) {
      character.position.copy(characterStart);
      velocity.set(0, 0, 0);
      isGrounded = false;
      isJumping = false;
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

    $('loadingText').textContent = '正在分析图片内容...';
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
      try {
        detections = await model.detect(img);
      } catch (e) {
        detections = [];
      }
    }

    $('loadingText').textContent = '正在竖立照片 · 生成 3D 攀爬墙...';

    if (!scene) initThree();

    setTimeout(() => {
      generateLevelFromImage(img);

      if (detections.length > 0) {
        const labels = detections.slice(0, 5).map(d => d.class + ' ' + Math.round(d.score * 100) + '%').join('、');
        setTimeout(() => showToast('识别到: ' + labels), 500);
      } else {
        setTimeout(() => showToast('照片已竖立 · AD 移动 · Space 跳跃上台阶'), 500);
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
  $('winTime').textContent = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
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
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}

// ===== Init =====
setupInput();
requestAnimationFrame(animate);

})();
