import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FilmPass } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/FilmPass.js";
import { ShaderPass } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/ShaderPass.js";

const canvas = document.getElementById("scene");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.FogExp2(0x0a0d14, 0.018);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(6, 8, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 80;
controls.maxPolarAngle = Math.PI * 0.48;

const quality = {
  high: {
    windParticles: 2400,
    weatherParticles: 1800,
    shadowMapSize: 2048,
    composer: true,
  },
  low: {
    windParticles: 900,
    weatherParticles: 900,
    shadowMapSize: 1024,
    composer: false,
  },
};

const state = {
  windSpeed: 12,
  windDirection: 45,
  gustiness: 0.35,
  turbulence: 0.45,
  rho: 1.225,
  groundRoughness: 0.42,
  weather: "clear",
  running: true,
  showForces: true,
  showWind: true,
  highQuality: true,
};

const clock = new THREE.Clock();

// Lighting
const hemiLight = new THREE.HemisphereLight(0x6f87ff, 0x0a0a0a, 0.5);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xf2f1e6, 1.2);
dirLight.position.set(-10, 18, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(quality.high.shadowMapSize, quality.high.shadowMapSize);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 80;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -10;
scene.add(dirLight);

const fillLight = new THREE.PointLight(0x66aaff, 0.35, 60);
fillLight.position.set(12, 6, -6);
scene.add(fillLight);

// Gradient dome to fake HDRI
function createGradientDome() {
  const geo = new THREE.SphereGeometry(120, 32, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x1e2c4f) },
      bottomColor: { value: new THREE.Color(0x05070d) },
      offset: { value: 0.0 },
      exponent: { value: 1.2 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld + offset).y;
        float f = max(pow(max(h, 0.0), exponent), 0.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geo, mat);
  scene.add(dome);
}
createGradientDome();

// Ground with procedural roughness/normal
function generateNoiseTexture(size = 256, intensity = 0.4) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n =
        Math.sin((x + y * 3.1) * 0.08) +
        Math.sin((x * 2.3 - y * 1.3) * 0.05) +
        Math.sin((x * 0.5 + y * 0.9) * 0.13);
      const v = ((n + 3) / 6) * 255 * intensity;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.anisotropy = 4;
  return tex;
}

function createGround() {
  const geo = new THREE.PlaneGeometry(200, 200, 256, 256);
  const noise = generateNoiseTexture(256, 0.7);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1c2534),
    roughness: 0.8,
    metalness: 0.08,
    roughnessMap: noise,
    normalMap: noise,
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.y = 0;
  ground.userData.ground = true;
  scene.add(ground);
  return ground;
}

const ground = createGround();

// Post-processing setup
let composer;
let bloomPass;
let vignettePass;
let filmPass;

function createComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.4, 0.9);
  bloomPass.enabled = true;
  filmPass = new FilmPass(0.35, 0.025, 648, false);
  filmPass.renderToScreen = true;
  vignettePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      offset: { value: 1.0 },
      darkness: { value: 1.2 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float offset;
      uniform float darkness;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D(tDiffuse, vUv);
        vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
        float vignette = smoothstep(0.9, 0.2, length(uv));
        gl_FragColor = vec4(texel.rgb * mix(1.0, vignette, darkness), texel.a);
      }
    `,
  });
  composer.addPass(bloomPass);
  composer.addPass(vignettePass);
  composer.addPass(filmPass);
}
createComposer();

// Wind field helpers
function hash(x, y, z) {
  return Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
}

function noise3(x, y, z) {
  const p = Math.floor;
  const f = (t) => t - p(t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const xi = p(x);
  const yi = p(y);
  const zi = p(z);
  const xf = f(x);
  const yf = f(y);
  const zf = f(z);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const n000 = hash(xi, yi, zi);
  const n001 = hash(xi, yi, zi + 1);
  const n010 = hash(xi, yi + 1, zi);
  const n011 = hash(xi, yi + 1, zi + 1);
  const n100 = hash(xi + 1, yi, zi);
  const n101 = hash(xi + 1, yi, zi + 1);
  const n110 = hash(xi + 1, yi + 1, zi);
  const n111 = hash(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(n000, n100, u);
  const x10 = lerp(n010, n110, u);
  const x01 = lerp(n001, n101, u);
  const x11 = lerp(n011, n111, u);
  const y0 = lerp(x00, x10, v);
  const y1 = lerp(x01, x11, v);
  return lerp(y0, y1, w);
}

function curlNoise(pos) {
  const e = 0.1;
  const dx = new THREE.Vector3(e, 0, 0);
  const dy = new THREE.Vector3(0, e, 0);
  const dz = new THREE.Vector3(0, 0, e);

  const sample = (p) => noise3(p.x, p.y, p.z);
  const p = pos.clone();
  const n1 = sample(p.clone().add(dy));
  const n2 = sample(p.clone().sub(dy));
  const n3 = sample(p.clone().add(dz));
  const n4 = sample(p.clone().sub(dz));
  const n5 = sample(p.clone().add(dx));
  const n6 = sample(p.clone().sub(dx));

  const x = n1 - n2 - (n3 - n4);
  const y = n3 - n4 - (n5 - n6);
  const z = n5 - n6 - (n1 - n2);
  return new THREE.Vector3(x, y, z);
}

function windVectorAt(position, time) {
  const dirRad = THREE.MathUtils.degToRad(state.windDirection);
  const baseDir = new THREE.Vector3(Math.sin(dirRad), 0, Math.cos(dirRad));
  const gust = 1 + Math.sin(time * 0.9 + position.x * 0.2) * state.gustiness * 0.6 + Math.cos(time * 1.3 + position.z * 0.25) * state.gustiness * 0.4;
  const baseSpeed = state.windSpeed * gust;
  const curl = curlNoise(position.clone().multiplyScalar(0.12).addScalar(time * 0.4)).multiplyScalar(state.turbulence * 4);
  const field = baseDir.clone().multiplyScalar(baseSpeed).add(curl);
  return field;
}

// Wind particles
let windParticles;
let windGeo;
let windMat;
let windVelocities;

function createWindParticles(count) {
  if (windParticles) {
    scene.remove(windParticles);
    windGeo.dispose();
    windMat.dispose();
  }
  windGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  windVelocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 80;
    positions[i * 3 + 1] = Math.random() * 12 + 0.2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    windVelocities[i * 3] = 0;
    windVelocities[i * 3 + 1] = 0;
    windVelocities[i * 3 + 2] = 0;
  }
  windGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  windGeo.setAttribute("aVelocity", new THREE.BufferAttribute(windVelocities, 3));

  windMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uShow: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aVelocity;
      uniform float uTime;
      varying float vSpeed;
      varying vec3 vVel;
      void main() {
        vVel = aVelocity;
        vSpeed = length(aVelocity);
        vec3 pos = position + normalize(aVelocity + vec3(0.0001)) * clamp(vSpeed * 0.04, -0.8, 0.8);
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float size = mix(6.0, 18.0, clamp(vSpeed / 28.0, 0.0, 1.0));
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vSpeed;
      varying vec3 vVel;
      void main() {
        vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
        float d = dot(uv, uv);
        float alpha = exp(-d * 2.2) * clamp(vSpeed / 30.0 + 0.35, 0.35, 1.0);
        vec3 c1 = vec3(0.3, 0.7, 1.0);
        vec3 c2 = vec3(0.9, 0.5, 0.2);
        float mixv = clamp(vSpeed / 30.0, 0.0, 1.0);
        vec3 color = mix(c1, c2, mixv);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  windParticles = new THREE.Points(windGeo, windMat);
  windParticles.frustumCulled = false;
  scene.add(windParticles);
}
createWindParticles(quality.high.windParticles);

// Stream ribbons
const ribbons = [];

function createRibbon(color) {
  const points = [];
  for (let i = 0; i < 24; i++) {
    points.push(new THREE.Vector3((Math.random() - 0.5) * 20, Math.random() * 6 + 1.5, (Math.random() - 0.5) * 20));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 100, 0.1, 8, false);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.55,
    emissive: color.clone().multiplyScalar(0.1),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, points, mat };
}

for (let i = 0; i < 5; i++) {
  const ribbon = createRibbon(new THREE.Color().setHSL(0.55 + Math.random() * 0.1, 0.8, 0.6));
  ribbons.push(ribbon);
  scene.add(ribbon.mesh);
}

function updateRibbon(ribbon, dt, time) {
  const points = ribbon.points;
  const head = points[0].clone();
  const wind = windVectorAt(head, time).multiplyScalar(0.06 * dt * 60);
  head.add(wind);
  head.y = THREE.MathUtils.clamp(head.y, 0.5, 10);
  points.pop();
  points.unshift(head);
  const curve = new THREE.CatmullRomCurve3(points);
  ribbon.mesh.geometry.dispose();
  ribbon.mesh.geometry = new THREE.TubeGeometry(curve, 80, 0.08, 6, false);
}

// Weather particles
let weatherSystem;
let weatherGeo;
let weatherMat;
let weatherVelocities;

function createWeatherParticles(count) {
  if (weatherSystem) {
    scene.remove(weatherSystem);
    weatherGeo.dispose();
    weatherMat.dispose();
  }
  weatherGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  weatherVelocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 100;
    positions[i * 3 + 1] = Math.random() * 40 + 6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
    weatherVelocities[i * 3] = 0;
    weatherVelocities[i * 3 + 1] = -5;
    weatherVelocities[i * 3 + 2] = 0;
  }
  weatherGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  weatherGeo.setAttribute("aVelocity", new THREE.BufferAttribute(weatherVelocities, 3));
  weatherMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uWeather: { value: 0 }, // 0 clear,1 rain,2 snow,3 storm
    },
    vertexShader: `
      attribute vec3 aVelocity;
      varying float vSpeed;
      void main() {
        vSpeed = length(aVelocity);
        vec3 pos = position + normalize(aVelocity + vec3(0.0001)) * 0.04 * vSpeed;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float size = mix(6.0, 18.0, clamp(vSpeed / 40.0, 0.0, 1.0));
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vSpeed;
      void main() {
        vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
        float len = length(uv * vec2(0.35, 1.0));
        float alpha = exp(-len * 2.5) * 0.8;
        vec3 color = mix(vec3(0.7, 0.8, 1.0), vec3(0.9, 0.9, 1.0), clamp(vSpeed / 40.0, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  weatherSystem = new THREE.Points(weatherGeo, weatherMat);
  weatherSystem.visible = state.weather !== "clear";
  scene.add(weatherSystem);
}
createWeatherParticles(quality.high.weatherParticles);

// Objects and physics
const objects = [];
let selectedObject = null;
const tempVec = new THREE.Vector3();

const prototypes = {
  paper: { label: "Paper sheet", mass: 0.02, area: 0.12, Cd: 1.1, friction: 0.4 },
  umbrella: { label: "Umbrella", mass: 0.5, area: 0.7, Cd: 1.2, friction: 0.6 },
  cone: { label: "Traffic cone", mass: 0.9, area: 0.18, Cd: 1.05, friction: 0.8 },
  bicycle: { label: "Bicycle", mass: 8, area: 0.9, Cd: 1.0, friction: 0.9 },
  bag: { label: "Plastic bag", mass: 0.08, area: 0.25, Cd: 1.3, friction: 0.35 },
  ball: { label: "Ball", mass: 0.45, area: 0.15, Cd: 0.47, friction: 0.6 },
  human: { label: "Human silhouette", mass: 70, area: 0.7, Cd: 1.0, friction: 0.95 },
  lightbox: { label: "Light box", mass: 4, area: 0.5, Cd: 1.05, friction: 0.75 },
};

function buildGeometry(type) {
  switch (type) {
    case "paper": {
      const geo = new THREE.PlaneGeometry(1, 0.7, 4, 4);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xe9e9ea,
        metalness: 0.05,
        roughness: 0.9,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      return mesh;
    }
    case "umbrella": {
      const group = new THREE.Group();
      const canopy = new THREE.ConeGeometry(1, 0.7, 12, 1, true);
      const canopyMesh = new THREE.Mesh(
        canopy,
        new THREE.MeshStandardMaterial({ color: 0x5e86ff, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide })
      );
      canopyMesh.rotation.x = Math.PI;
      canopyMesh.castShadow = true;
      group.add(canopyMesh);
      const pole = new THREE.CylinderGeometry(0.05, 0.05, 1.4);
      const poleMesh = new THREE.Mesh(pole, new THREE.MeshStandardMaterial({ color: 0x888b96 }));
      poleMesh.position.y = -0.8;
      poleMesh.castShadow = true;
      group.add(poleMesh);
      return group;
    }
    case "cone": {
      const geo = new THREE.ConeGeometry(0.45, 0.9, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff7b3f, roughness: 0.8, metalness: 0.05 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      return mesh;
    }
    case "bicycle": {
      const group = new THREE.Group();
      const frame = new THREE.TorusGeometry(0.6, 0.05, 8, 24);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.2, roughness: 0.6 });
      const w1 = new THREE.Mesh(frame, wheelMat);
      w1.position.set(-0.6, 0.6, 0);
      const w2 = w1.clone();
      w2.position.x = 0.6;
      group.add(w1, w2);
      const bar = new THREE.BoxGeometry(1.4, 0.08, 0.08);
      const barMesh = new THREE.Mesh(bar, new THREE.MeshStandardMaterial({ color: 0x6995ff, metalness: 0.4, roughness: 0.4 }));
      barMesh.position.y = 1.1;
      group.add(barMesh);
      const seat = new THREE.BoxGeometry(0.35, 0.05, 0.25);
      const seatMesh = new THREE.Mesh(seat, new THREE.MeshStandardMaterial({ color: 0x222 }));
      seatMesh.position.set(0, 1.25, 0);
      group.add(seatMesh);
      group.traverse((o) => (o.castShadow = true));
      return group;
    }
    case "bag": {
      const geo = new THREE.SphereGeometry(0.6, 12, 10);
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xd6f0ff,
        metalness: 0.0,
        roughness: 0.35,
        transmission: 0.3,
        thickness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(1, 0.7, 0.6);
      mesh.castShadow = true;
      return mesh;
    }
    case "ball": {
      const geo = new THREE.SphereGeometry(0.4, 24, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.15, roughness: 0.35 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      return mesh;
    }
    case "human": {
      const group = new THREE.Group();
      const body = new THREE.CapsuleGeometry(0.4, 1.4, 12, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0xa0b3ff, roughness: 0.5, metalness: 0.2 });
      const mesh = new THREE.Mesh(body, mat);
      mesh.castShadow = true;
      group.add(mesh);
      const head = new THREE.SphereGeometry(0.35, 16, 12);
      const headMesh = new THREE.Mesh(head, mat);
      headMesh.position.y = 1.1;
      headMesh.castShadow = true;
      group.add(headMesh);
      return group;
    }
    case "lightbox": {
      const geo = new THREE.BoxGeometry(1, 0.8, 0.6);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x88aaff,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      return mesh;
    }
    default:
      return new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  }
}

function addObject(type) {
  const data = prototypes[type];
  if (!data) return;
  const mesh = buildGeometry(type);
  mesh.position.set((Math.random() - 0.5) * 6, 1 + Math.random(), (Math.random() - 0.5) * 6);
  mesh.userData.type = type;
  mesh.userData.anchor = false;
  mesh.userData.mass = data.mass;
  mesh.userData.area = data.area;
  mesh.userData.Cd = data.Cd;
  mesh.userData.friction = data.friction;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), mesh.position, 1, 0x58c4ff);
  arrow.visible = state.showForces;
  scene.add(arrow);

  const body = {
    mesh,
    velocity: new THREE.Vector3(),
    force: new THREE.Vector3(),
    arrow,
  };
  scene.add(mesh);
  objects.push(body);
  return body;
}

function resetScene() {
  objects.forEach((obj) => {
    obj.mesh.geometry.dispose();
    if (Array.isArray(obj.mesh.material)) {
      obj.mesh.material.forEach((m) => m.dispose());
    } else {
      obj.mesh.material.dispose();
    }
    scene.remove(obj.mesh);
    scene.remove(obj.arrow);
  });
  objects.length = 0;
  selectedObject = null;
}

// UI wiring
const valueLabels = {};
document.querySelectorAll(".value").forEach((el) => {
  valueLabels[el.dataset.for] = el;
});

function bindSlider(id, prop) {
  const el = document.getElementById(id);
  el.addEventListener("input", () => {
    state[prop] = parseFloat(el.value);
    valueLabels[id].textContent = el.value;
    if (prop === "windSpeed" && state.weather === "storm") {
      bloomPass.strength = 1.1;
    }
  });
}

bindSlider("windSpeed", "windSpeed");
bindSlider("windDirection", "windDirection");
bindSlider("gustiness", "gustiness");
bindSlider("turbulence", "turbulence");
bindSlider("roughness", "groundRoughness");

document.getElementById("rho").addEventListener("change", (e) => {
  state.rho = parseFloat(e.target.value);
});

document.getElementById("weather").addEventListener("change", (e) => {
  state.weather = e.target.value;
  weatherSystem.visible = state.weather !== "clear";
});

document.querySelectorAll("[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = btn.dataset.preset;
    if (preset === "breeze") {
      state.windSpeed = 6;
      state.gustiness = 0.15;
      state.turbulence = 0.25;
    } else if (preset === "strong") {
      state.windSpeed = 16;
      state.gustiness = 0.35;
      state.turbulence = 0.5;
    } else if (preset === "gale") {
      state.windSpeed = 26;
      state.gustiness = 0.45;
      state.turbulence = 0.6;
    } else if (preset === "storm") {
      state.windSpeed = 32;
      state.gustiness = 0.6;
      state.turbulence = 0.75;
      state.weather = "storm";
      document.getElementById("weather").value = "storm";
    }
    document.getElementById("windSpeed").value = state.windSpeed;
    document.getElementById("gustiness").value = state.gustiness;
    document.getElementById("turbulence").value = state.turbulence;
    valueLabels["windSpeed"].textContent = state.windSpeed;
    valueLabels["gustiness"].textContent = state.gustiness;
    valueLabels["turbulence"].textContent = state.turbulence;
  });
});

document.getElementById("addObject").addEventListener("click", () => {
  const type = document.getElementById("objectType").value;
  const obj = addObject(type);
  if (obj) {
    selectedObject = obj;
    updateSelectedInfo();
  }
});

document.getElementById("resetScene").addEventListener("click", () => {
  resetScene();
});

document.getElementById("toggleRun").addEventListener("click", (e) => {
  state.running = !state.running;
  e.target.textContent = state.running ? "Pause" : "Play";
});

document.getElementById("showForces").addEventListener("change", (e) => {
  state.showForces = e.target.checked;
  objects.forEach((o) => (o.arrow.visible = state.showForces));
});

document.getElementById("showWind").addEventListener("change", (e) => {
  state.showWind = e.target.checked;
  windParticles.visible = state.showWind;
});

document.getElementById("highQuality").addEventListener("change", (e) => {
  state.highQuality = e.target.checked;
  applyQuality();
});

document.getElementById("anchorSelected").addEventListener("change", (e) => {
  if (selectedObject) {
    selectedObject.mesh.userData.anchor = e.target.checked;
  }
});

// Dragging
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let dragging = false;
let dragOffset = new THREE.Vector3();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function onPointerDown(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(objects.map((o) => o.mesh));
  if (intersects.length) {
    const hit = intersects[0];
    selectedObject = objects.find((o) => o.mesh === hit.object);
    updateSelectedInfo();
    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, hit.point.y, 0));
    const planeHit = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, planeHit);
    dragOffset.copy(planeHit).sub(selectedObject.mesh.position);
    dragging = true;
  }
}

function onPointerMove(event) {
  if (!dragging) return;
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const planeHit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
    planeHit.sub(dragOffset);
    planeHit.y = Math.max(0.3, planeHit.y);
    selectedObject.mesh.position.copy(planeHit);
    selectedObject.velocity.set(0, 0, 0);
  }
}

function onPointerUp() {
  dragging = false;
}

window.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);

// Tooltip for hover
const tooltip = document.getElementById("tooltip");
function updateTooltip(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(objects.map((o) => o.mesh), false)[0];
  if (hit) {
    const data = prototypes[hit.object.userData.type];
    tooltip.style.opacity = 1;
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
    tooltip.textContent = `${data.label} — m=${data.mass}kg, Cd=${data.Cd}`;
  } else {
    tooltip.style.opacity = 0;
  }
}
window.addEventListener("pointermove", updateTooltip);

// Weather control
function weatherIndex() {
  switch (state.weather) {
    case "rain":
      return 1;
    case "snow":
      return 2;
    case "storm":
      return 3;
    default:
      return 0;
  }
}

// Quality adjustments
function applyQuality() {
  const set = state.highQuality ? quality.high : quality.low;
  dirLight.shadow.mapSize.set(set.shadowMapSize, set.shadowMapSize);
  renderer.shadowMap.enabled = state.highQuality;
  bloomPass.enabled = set.composer;
  filmPass.enabled = set.composer;
  vignettePass.enabled = set.composer;
  createWindParticles(set.windParticles);
  windParticles.visible = state.showWind;
  createWeatherParticles(set.weatherParticles);
}

// Physics integration
function integrateObject(body, dt, time) {
  const mesh = body.mesh;
  const vel = body.velocity;
  const wind = windVectorAt(mesh.position, time);
  const relative = wind.clone().sub(vel);
  const speed = relative.length();
  const area = mesh.userData.area || 0.1;
  const Cd = mesh.userData.Cd || 1.0;
  const mass = mesh.userData.mass || 1.0;
  const dragMag = 0.5 * state.rho * Cd * area * speed * speed;
  const dragForce = relative.normalize().multiplyScalar(dragMag);
  const gravity = new THREE.Vector3(0, -9.81 * mass, 0);
  const totalForce = dragForce.add(gravity);
  body.force.copy(totalForce);

  if (!mesh.userData.anchor) {
    vel.add(totalForce.clone().multiplyScalar(dt / mass));
    mesh.position.add(vel.clone().multiplyScalar(dt));
  }

  if (mesh.position.y < 0.4) {
    mesh.position.y = 0.4;
    vel.y = Math.abs(vel.y) * 0.15;
    vel.x *= 1 - mesh.userData.friction * 0.05;
    vel.z *= 1 - mesh.userData.friction * 0.05;
  }

  const forceMag = totalForce.length();
  const arrowLen = THREE.MathUtils.clamp(forceMag * 0.02, 0.2, 6);
  body.arrow.position.copy(mesh.position);
  body.arrow.setDirection(totalForce.clone().normalize());
  body.arrow.setLength(arrowLen);
  body.arrow.visible = state.showForces;
}

// FPS counter
const fpsEl = document.getElementById("fps");
let frames = 0;
let fpsTime = performance.now();

function updateFPS() {
  frames++;
  const now = performance.now();
  if (now - fpsTime > 1000) {
    const fps = Math.round((frames * 1000) / (now - fpsTime));
    fpsEl.textContent = `FPS: ${fps}`;
    frames = 0;
    fpsTime = now;
  }
}

function updateSelectedInfo() {
  const info = document.getElementById("selectedInfo");
  if (!selectedObject) {
    info.textContent = "Select an object to inspect its forces.";
    document.getElementById("anchorSelected").checked = false;
    return;
  }
  const { type } = selectedObject.mesh.userData;
  const proto = prototypes[type];
  const force = selectedObject.force.length().toFixed(2);
  info.innerHTML = `
    <strong>${proto.label}</strong><br/>
    Mass: ${proto.mass} kg | Area: ${proto.area} m² | Cd: ${proto.Cd}<br/>
    Force: ${force} N | Anchor: ${selectedObject.mesh.userData.anchor ? "Yes" : "No"}
  `;
  document.getElementById("anchorSelected").checked = !!selectedObject.mesh.userData.anchor;
}

// Lightning effect
let lightningTimer = 0;

function updateLightning(dt) {
  if (state.weather !== "storm") {
    fillLight.intensity = 0.35;
    return;
  }
  lightningTimer -= dt;
  if (lightningTimer <= 0) {
    lightningTimer = 3 + Math.random() * 4;
    fillLight.intensity = 2.5;
    setTimeout(() => (fillLight.intensity = 0.35), 150 + Math.random() * 100);
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const time = performance.now() * 0.001;

  if (state.running) {
    updateWindParticles(dt, time);
    updateWeather(dt, time);
    objects.forEach((obj) => integrateObject(obj, dt, time));
    ribbons.forEach((r) => updateRibbon(r, dt, time));
  }

  updateSelectedInfo();
  controls.update();
  updateFPS();
  updateLightning(dt);

  if (state.highQuality && quality.high.composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

function updateWindParticles(dt, time) {
  const positions = windGeo.attributes.position.array;
  const velocities = windGeo.attributes.aVelocity.array;
  for (let i = 0; i < positions.length / 3; i++) {
    const pos = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const wind = windVectorAt(pos, time);
    const vel = new THREE.Vector3(velocities[i * 3], velocities[i * 3 + 1], velocities[i * 3 + 2]);
    vel.lerp(wind, 0.08);
    pos.add(vel.clone().multiplyScalar(dt));
    if (pos.x > 50 || pos.x < -50 || pos.z > 50 || pos.z < -50 || pos.y < 0.2 || pos.y > 18) {
      pos.set((Math.random() - 0.5) * 60, Math.random() * 10 + 1, (Math.random() - 0.5) * 60);
      vel.set(0, 0, 0);
    }
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    velocities[i * 3] = vel.x;
    velocities[i * 3 + 1] = vel.y;
    velocities[i * 3 + 2] = vel.z;
  }
  windGeo.attributes.position.needsUpdate = true;
  windGeo.attributes.aVelocity.needsUpdate = true;
}

function updateWeather(dt, time) {
  weatherMat.uniforms.uWeather.value = weatherIndex();
  weatherSystem.visible = state.weather !== "clear";
  const positions = weatherGeo.attributes.position.array;
  const velocities = weatherGeo.attributes.aVelocity.array;
  for (let i = 0; i < positions.length / 3; i++) {
    const pos = tempVec.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const baseDown = state.weather === "snow" ? -4 : -14;
    const wind = windVectorAt(pos, time).multiplyScalar(0.6);
    const vel = tempVec.set(velocities[i * 3], velocities[i * 3 + 1], velocities[i * 3 + 2]);
    vel.lerp(new THREE.Vector3(wind.x, baseDown, wind.z), 0.12);
    pos.add(vel.clone().multiplyScalar(dt));
    if (pos.y < 0) {
      pos.y = Math.random() * 30 + 12;
      pos.x = (Math.random() - 0.5) * 80;
      pos.z = (Math.random() - 0.5) * 80;
    }
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    velocities[i * 3] = vel.x;
    velocities[i * 3 + 1] = vel.y;
    velocities[i * 3 + 2] = vel.z;
  }
  weatherGeo.attributes.position.needsUpdate = true;
  weatherGeo.attributes.aVelocity.needsUpdate = true;

  if (state.weather === "storm") {
    scene.fog.density = 0.022;
    bloomPass.strength = 1.1;
  } else {
    scene.fog.density = 0.018;
    bloomPass.strength = 0.8;
  }
}

// Resize
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);
onResize();

// Initial objects
addObject("human");
addObject("bicycle");

animate();

// Instructions for local run
console.info("Tip: run a local server (e.g., python -m http.server 8000) and open http://localhost:8000 for ES module support.");
