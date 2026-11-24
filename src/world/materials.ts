import * as THREE from 'three';

// --------------------------------------------------------------------------------------------
// Procedural surface textures (generated once on a canvas, tiled in world meters).
// Each surface family has an albedo map and a normal map derived from a height field.
// --------------------------------------------------------------------------------------------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

type HeightFn = (ctx: CanvasRenderingContext2D, size: number, r: () => number) => void;

function heightToNormal(h: ImageData, size: number, strength: number) {
  const out = new ImageData(size, size);
  const H = (x: number, y: number) => h.data[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  return out;
}

function noise(ctx: CanvasRenderingContext2D, size: number, r: () => number, amt: number, blobs = 900) {
  for (let i = 0; i < blobs; i++) {
    const x = r() * size, y = r() * size, rad = 2 + r() * size * 0.06;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() < 0.5 ? 0 : 255;
    g.addColorStop(0, `rgba(${v},${v},${v},${amt * r()})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const id = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (r() - 0.5) * 18 * amt * 4;
    id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n;
  }
  ctx.putImageData(id, 0, 0);
}

function makeSurface(seed: number, size: number, draw: HeightFn, normalStrength: number) {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  draw(ctx, size, r);
  const h = ctx.getImageData(0, 0, size, size);
  const n = document.createElement('canvas');
  n.width = n.height = size;
  n.getContext('2d')!.putImageData(heightToNormal(h, size, normalStrength), 0, 0);
  const albedo = new THREE.CanvasTexture(c);
  albedo.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(n);
  for (const t of [albedo, normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { albedo, normal };
}

// joints: horizontal lines every `rowH` px, vertical staggered every `colW`
function joints(ctx: CanvasRenderingContext2D, size: number, rowH: number, colW: number, stagger: boolean, w = 2, dark = 40) {
  ctx.fillStyle = `rgb(${dark},${dark},${dark})`;
  for (let y = 0; y < size; y += rowH) {
    ctx.fillRect(0, y, size, w);
    const off = stagger && (y / rowH) % 2 ? colW / 2 : 0;
    for (let x = off; x < size + colW; x += colW) ctx.fillRect(x % size, y, w, rowH);
  }
}

let cache: ReturnType<typeof build> | null = null;
export function getSurfaces() {
  return (cache ??= build());
}

function build() {
  // 1 tile = 4m for concrete (board formed panels 2m x 1m with tie holes)
  const concrete = makeSurface(11, 512, (ctx, s, r) => {
    noise(ctx, s, r, 0.12, 700);
    // board-formed horizontal grain
    for (let y = 0; y < s; y += 4) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},0,0,0)`;
      ctx.globalAlpha = 0.05 * r();
      ctx.fillStyle = r() < 0.5 ? '#000' : '#fff';
      ctx.fillRect(0, y, s, 2);
    }
    ctx.globalAlpha = 1;
    joints(ctx, s, s / 4, s / 2, false, 2, 70);
    ctx.fillStyle = '#3a3a3a';
    for (let y = s / 8; y < s; y += s / 4) for (let x = s / 8; x < s; x += s / 4) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); }
  }, 2.2);
  // stone cladding: 1 tile = 3m, slabs 1.5 x 0.6
  const stone = makeSurface(23, 512, (ctx, s, r) => {
    noise(ctx, s, r, 0.08, 1200);
    joints(ctx, s, s / 5, s / 2, true, 2, 95);
  }, 1.6);
  // paving: 1 tile = 4m, 1m x 0.5m pavers
  const paving = makeSurface(37, 512, (ctx, s, r) => {
    for (let y = 0; y < s; y += s / 8)
      for (let x = 0; x < s; x += s / 4) {
        const v = 118 + (r() - 0.5) * 26;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, s / 4, s / 8);
      }
    noise(ctx, s, r, 0.06, 500);
    joints(ctx, s, s / 8, s / 4, false, 2, 60);
  }, 1.4);
  // brushed metal: horizontal streaks, 1 tile = 2m
  const metal = makeSurface(41, 256, (ctx, s, r) => {
    for (let i = 0; i < 600; i++) {
      const v = 128 + (r() - 0.5) * 50;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(r() * s, r() * s, 20 + r() * 120, 1);
    }
  }, 0.6);
  // ribbed metal panels (ventilation / warehouse cladding), 1 tile = 2m
  const ribbed = makeSurface(53, 256, (ctx, s) => {
    for (let x = 0; x < s; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, '#5a5a5a'); g.addColorStop(0.5, '#b0b0b0'); g.addColorStop(1, '#5a5a5a');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 16, s);
    }
  }, 3);
  // acoustic / grass
  const grass = makeSurface(67, 256, (ctx, s, r) => {
    ctx.fillStyle = '#6e6e6e'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = 90 + r() * 90;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(r() * s, r() * s, 1, 2 + r() * 2);
    }
  }, 1.5);
  return { concrete, stone, paving, metal, ribbed, grass };
}

/** Rewrites UVs so textures tile in world meters (box-projection by dominant normal axis). */
export function worldUV(geo: THREE.BufferGeometry, tile = 4) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  if (!nor) geo.computeVertexNormals();
  const n = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// --------------------------------------------------------------------------------------------
// Material library (spec 6.0.3 / 1.3)
// --------------------------------------------------------------------------------------------
let mats: ReturnType<typeof buildMats> | null = null;
export const M = () => (mats ??= buildMats());

function foliageMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#33503c', roughness: 0.8, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vUnder;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvUnder = -normalize(mat3(modelMatrix) * objectNormal).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vUnder;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0,0.75,0.45) * (0.25 + 0.9 * clamp(vUnder, 0.0, 1.0));');
  };
  return m;
}
function std(p: THREE.MeshStandardMaterialParameters) { return new THREE.MeshStandardMaterial(p); }

/**
 * Facade wash: approximates warm ground-mounted uplights grazing vertical surfaces (and a faint
 * cool sky wash on upper floors) without adding real lights. Only affects near-vertical faces.
 */
export function wash<T extends THREE.MeshStandardMaterial>(mat: T, warm = 0.55, falloff = 3.2, cool = 0.05): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWashWarm = { value: warm };
    sh.uniforms.uWashFall = { value: falloff };
    sh.uniforms.uWashCool = { value: cool };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWashP; varying vec3 vWashN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWashP = (modelMatrix * vec4(transformed,1.0)).xyz; vWashN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWashP; varying vec3 vWashN; uniform float uWashWarm, uWashFall, uWashCool;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float vert = 1.0 - abs(vWashN.y);
        float g = exp(-max(vWashP.y, 0.0) / uWashFall);
        // periodic fixtures along the wall: brighter scallops
        float sc = 0.65 + 0.35 * pow(abs(sin((vWashP.x + vWashP.z) * 0.55)), 2.0);
        totalEmissiveRadiance += diffuseColor.rgb * vert * (vec3(1.0, 0.72, 0.45) * uWashWarm * g * sc + vec3(0.55, 0.7, 1.0) * uWashCool);`);
  };
  mat.customProgramCacheKey = () => 'wash' + warm + falloff + cool;
  return mat;
}

function buildMats() {
  const S = getSurfaces();
  const ns = (v = 1) => new THREE.Vector2(v, v);
  return {
    concrete: wash(std({ color: '#2a3038', map: S.concrete.albedo, normalMap: S.concrete.normal, normalScale: ns(0.6), roughness: 0.86, metalness: 0.02 }), 0.9, 3.5, 0.10),
    concreteDark: wash(std({ color: '#1a1f26', map: S.concrete.albedo, normalMap: S.concrete.normal, normalScale: ns(0.6), roughness: 0.88, metalness: 0.02 }), 0.9, 3.5, 0.10),
    concreteLight: wash(std({ color: '#6a6f75', map: S.concrete.albedo, normalMap: S.concrete.normal, normalScale: ns(0.5), roughness: 0.85 }), 0.7, 3.0, 0.08),
    stoneLight: wash(std({ color: '#d8d6cf', map: S.stone.albedo, normalMap: S.stone.normal, normalScale: ns(0.5), roughness: 0.72 }), 0.75, 3.6, 0.10),
    stoneIvory: wash(std({ color: '#e6dccb', map: S.stone.albedo, normalMap: S.stone.normal, normalScale: ns(0.5), roughness: 0.7 }), 0.85, 4.0, 0.10),
    stoneDark: wash(std({ color: '#262b31', map: S.stone.albedo, normalMap: S.stone.normal, normalScale: ns(0.5), roughness: 0.7 }), 0.8, 2.6, 0.08),
    paving: std({ color: '#3a4049', map: S.paving.albedo, normalMap: S.paving.normal, normalScale: ns(0.5), roughness: 0.78, metalness: 0.05 }),
    pavingDark: std({ color: '#23282f', map: S.paving.albedo, normalMap: S.paving.normal, normalScale: ns(0.5), roughness: 0.6, metalness: 0.1 }),
    graphite: std({ color: '#202831', map: S.metal.albedo, normalMap: S.metal.normal, normalScale: ns(0.3), roughness: 0.38, metalness: 0.78 }),
    graphiteMatte: std({ color: '#1b2128', roughness: 0.6, metalness: 0.5 }),
    ribbed: wash(std({ color: '#2b323b', map: S.ribbed.albedo, normalMap: S.ribbed.normal, normalScale: ns(0.8), roughness: 0.5, metalness: 0.6 }), 0.6, 3.2, 0.08),
    champagne: std({ color: '#C6A77B', roughness: 0.26, metalness: 0.85, envMapIntensity: 1.8 }),
    ceramic: std({ color: '#e9e6df', roughness: 0.22, metalness: 0.0, envMapIntensity: 1.2 }),
    monumentMetal: std({ color: '#182028', map: S.metal.albedo, normalMap: S.metal.normal, normalScale: ns(0.25), roughness: 0.32, metalness: 0.8, envMapIntensity: 2.2 }),
    glassDark: new THREE.MeshPhysicalMaterial({ color: '#0b1118', roughness: 0.06, metalness: 0.2, reflectivity: 0.6, clearcoat: 1, clearcoatRoughness: 0.05 }),
    mullion: std({ color: '#161b21', roughness: 0.45, metalness: 0.7 }),
    grass: std({ color: '#1d2a22', map: S.grass.albedo, normalMap: S.grass.normal, roughness: 0.95 }),
    soil: std({ color: '#15130f', roughness: 1 }),
    water: new THREE.MeshPhysicalMaterial({ color: '#071018', roughness: 0.04, metalness: 0.1, clearcoat: 1 }),
    warmLight: std({ color: '#000', emissive: new THREE.Color('#ffcf98'), emissiveIntensity: 2.2 }),
    warmLightSoft: std({ color: '#000', emissive: new THREE.Color('#ffd7a8'), emissiveIntensity: 1.1 }),
    coolLight: std({ color: '#000', emissive: new THREE.Color('#dfeeff'), emissiveIntensity: 2.0 }),
    cyan: std({ color: '#000', emissive: new THREE.Color('#36E4FF'), emissiveIntensity: 2.4 }),
    cyanSoft: std({ color: '#000', emissive: new THREE.Color('#36E4FF'), emissiveIntensity: 0.9 }),
    amber: std({ color: '#000', emissive: new THREE.Color('#e0a565'), emissiveIntensity: 1.8 }),
    green: std({ color: '#000', emissive: new THREE.Color('#86BC25'), emissiveIntensity: 1.2 }),
    bark: std({ color: '#2a2420', roughness: 0.9 }),
    foliage: foliageMat(),
    dark: std({ color: '#07090c', roughness: 0.9 }),
  };
}

// --------------------------------------------------------------------------------------------
// Lit-interior window texture: emissive map with warm cells, ceiling light strips, shelves.
// Used behind glazing so buildings "spill architectural light through windows".
// --------------------------------------------------------------------------------------------
const interiorCache: Record<string, THREE.CanvasTexture> = {};
export function interiorTexture(kind: 'office' | 'library' | 'warm' | 'cool' | 'warehouse', seed = 1) {
  const key = kind + seed;
  if (interiorCache[key]) return interiorCache[key];
  const r = rng(seed * 97 + kind.length);
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const base = kind === 'cool' ? [70, 95, 120] : kind === 'warehouse' ? [120, 100, 75] : [150, 112, 70];
  const grad = g.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, `rgb(${base[0] * 1.2},${base[1] * 1.2},${base[2] * 1.2})`);
  grad.addColorStop(1, `rgb(${base[0] * 0.35},${base[1] * 0.35},${base[2] * 0.35})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  // ceiling light strips
  g.fillStyle = kind === 'cool' ? 'rgba(230,245,255,0.95)' : 'rgba(255,238,210,0.95)';
  for (let i = 0; i < 4; i++) g.fillRect(20 + r() * 40 + i * 58, 10, 30, 4);
  if (kind === 'library') {
    for (let y = 40; y < s; y += 34) {
      g.fillStyle = 'rgba(40,28,18,0.9)';
      g.fillRect(0, y, s, 4);
      for (let x = 0; x < s; x += 3 + r() * 3) {
        const v = 60 + r() * 120;
        g.fillStyle = `rgb(${v},${v * 0.85},${v * 0.65})`;
        g.fillRect(x, y - 22 - r() * 6, 2.5, 22 + r() * 4);
      }
    }
  } else {
    // furniture silhouettes
    g.fillStyle = 'rgba(10,10,12,0.75)';
    for (let i = 0; i < 6; i++) g.fillRect(r() * s, s * 0.62 + r() * 20, 30 + r() * 50, 6);
    for (let i = 0; i < 5; i++) g.fillRect(r() * s, s * 0.55, 3, 50);
    if (kind === 'office' || kind === 'cool') {
      g.fillStyle = 'rgba(120,200,255,0.6)';
      for (let i = 0; i < 3; i++) g.fillRect(r() * s, s * 0.45, 22, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  interiorCache[key] = t;
  return t;
}

export function interiorMaterial(kind: Parameters<typeof interiorTexture>[0], seed = 1, intensity = 1.3) {
  const t = interiorTexture(kind, seed);
  return new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: t, emissiveIntensity: intensity, roughness: 1 });
}

// soft radial light pool texture for fake ground illumination under fixtures
let pool: THREE.CanvasTexture | null = null;
export function lightPoolTexture() {
  if (pool) return pool;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  pool = new THREE.CanvasTexture(c);
  return pool;
}
