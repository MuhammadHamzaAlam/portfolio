import * as THREE from 'three';
import { Kit, FONT } from './kit';
import { M, interiorMaterial } from './materials';
import type { DestId } from '../data/registry';

// All builders work in building-local space: centre at origin, front facade faces +Z at z = D/2.

export function buildBuilding(id: DestId, W: number, D: number): Kit {
  switch (id) {
    case 'earth-observation-center': return eoc(W, D);
    case 'knowledge-library': return library(W, D);
    case 'communication-tower': return tower(W, D);
    case 'smart-warehouse': return warehouse(W, D);
    case 'data-center': return dataCenter(W, D);
    case 'career-pavilion': return pavilion(W, D);
    default: return new Kit();
  }
}

// ------------------------------------------------------------- Earth Observation Center (image 3)
function eoc(W: number, D: number) {
  const k = new Kit();
  const m = M();
  const F = D / 2;
  // angled board-formed podium (front face leans back)
  k.extrude(m.concrete, [[-F, 0], [F, 0], [F - 1.6, 6.5], [-F, 6.5]], 30, [-4, 0, 0], [0, Math.PI / 2, 0], 0, 4);
  k.box(m.graphite, 30.2, 0.25, 0.3, -4, 6.55, F - 1.7);
  // central stone instrument block
  k.slab(m.concreteDark, 17, 23, 22, 7.5, 0, 0, 0, 4);
  k.slab(m.graphite, 17.4, 0.35, 22.4, 7.5, 23, 0);
  // podium right wing with glazing
  k.slab(m.concrete, 4.5, 8, 20, 17, 0, -1, 0, 4);
  k.glazing(19.27, 3.8, -1, 16, 5.5, Math.PI / 2, { interior: interiorMaterial('cool', 3), depth: 1.2 });
  // narrow vertical glazing strip on the block edge
  k.glazing(16.05, 15, 4, 6, 14, Math.PI / 2, { interior: interiorMaterial('cool', 5), cols: 3 });
  // cantilevered glass research chamber, overhanging the forecourt
  const cx = -9.5, cy = 15.5, cz = 3, cw = 19, ch = 12.5, cd = 18;
  k.slab(m.graphiteMatte, cw, 0.9, cd, cx, cy - ch / 2 - 0.9, cz); // floor plate / soffit
  k.slab(m.graphite, cw + 0.4, 0.6, cd + 0.4, cx, cy + ch / 2, cz);
  k.glazing(cx, cy, cz + cd / 2, cw, ch, 0, { interior: interiorMaterial('cool', 7), rows: 3, depth: 1.4 });
  k.glazing(cx - cw / 2, cy, cz, cd, ch, -Math.PI / 2, { interior: interiorMaterial('cool', 9), rows: 3, depth: 1.4 });
  k.glazing(cx, cy, cz - cd / 2, cw, ch, Math.PI, { interior: interiorMaterial('cool', 11), rows: 3, depth: 1.4 });
  for (let i = -3; i <= 3; i++) k.box(m.coolLight, 0.8, 0.05, 0.8, cx + i * 2.4, cy - ch / 2 - 1.36, cz + 6.5); // soffit downlights
  // observation aperture: an instrument, not a window (spec 6.2.2)
  const ax = 7.5, ay = 14.5, az = 11.02;
  k.add(new THREE.CylinderGeometry(6.4, 6.4, 0.6, 96).rotateX(Math.PI / 2), m.concrete, [ax, ay, az + 0.05], [0, 0, 0], 3);
  k.add(new THREE.TorusGeometry(5.5, 0.55, 20, 128), m.graphite, [ax, ay, az + 0.55]);
  k.add(new THREE.TorusGeometry(4.6, 0.22, 12, 128), m.monumentMetal, [ax, ay, az + 0.6]);
  k.add(new THREE.CircleGeometry(4.5, 96), m.dark, [ax, ay, az + 0.12], [0, 0, 0], 4, false);
  // segmented cyan tracking arcs
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2 + 0.06;
    if (i % 4 === 3) continue;
    k.add(new THREE.TorusGeometry(5.0, 0.07, 6, 24, Math.PI * 2 / 10 - 0.12), m.cyan, [ax, ay, az + 0.72], [0, 0, a0], 4, false);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.box(m.cyan, 0.08, 0.55, 0.08, ax + Math.cos(a) * 4.75, ay + Math.sin(a) * 4.75, az + 0.75, 0);
  }
  // sensor lens cluster on a mounting arm
  k.box(m.graphite, 1.2, 6.2, 1.2, ax, ay - 1.5, az + 0.9);
  const lenses: [number, number, number][] = [[0, 1.2, 1.05], [-1.6, -0.2, 0.85], [1.5, 0.1, 0.8], [0.2, -1.6, 0.9], [-0.9, 2.5, 0.55]];
  for (const [lx, ly, r] of lenses) {
    k.add(new THREE.CylinderGeometry(r, r * 1.08, 1.6, 40).rotateX(Math.PI / 2), m.graphite, [ax + lx, ay + ly, az + 1.6]);
    k.add(new THREE.TorusGeometry(r * 0.92, 0.06, 8, 40), m.champagne, [ax + lx, ay + ly, az + 2.42]);
    k.add(new THREE.CircleGeometry(r * 0.82, 40), m.glassDark, [ax + lx, ay + ly, az + 2.41], [0, 0, 0], 4, false);
    k.add(new THREE.CircleGeometry(r * 0.25, 24), m.cyanSoft, [ax + lx, ay + ly, az + 2.42], [0, 0, 0], 4, false);
  }
  // entrance recessed under the block, warm-lit soffit
  k.slab(m.graphite, 9, 0.5, 5, ax, 5.5, F + 0.5);
  for (let i = -1; i <= 1; i++) k.box(m.warmLight, 1.6, 0.05, 1.6, ax + i * 2.8, 5.48, F + 0.5);
  k.glazing(ax, 2.6, F - 2.0, 8, 5.2, 0, { interior: interiorMaterial('warm', 2), rows: 1, cols: 4 });
  k.door(ax, 0.06, F - 1.9, 3.6, 3.2, 0);
  k.sign('EARTH OBSERVATION CENTER — TERRATRACE AI', -6.5, 2.6, F - 0.02, 0, 0.55, { color: '#e3ddd2', spacing: 0.16, emissive: 0.5 });
  k.box(m.warmLightSoft, 18, 0.05, 0.05, -6.5, 1.85, F + 0.02);
  return k;
}

// ------------------------------------------------------------- Knowledge Library (image 6)
function library(W: number, D: number) {
  const k = new Kit();
  const m = M();
  const F = D / 2, H = 24;
  // two pale stone slabs
  k.slab(m.stoneLight, 11, H, D, -10.5, 0, 0, 0, 3);
  k.slab(m.stoneLight, 11, H, D, 10.5, 0, 0, 0, 3);
  // rear archive mass (lower), keeps silhouette layered
  k.slab(m.stoneDark, W, 15, 8, 0, 0, -F + 4, 0, 3);
  // deep dark metal frame between slabs
  k.slab(m.graphite, 10, 0.8, D - 1, 0, H - 0.8, -0.5);
  k.box(m.graphite, 0.6, H - 8, 4, -4.7, 8 + (H - 8) / 2, F - 2);
  k.box(m.graphite, 0.6, H - 8, 4, 4.7, 8 + (H - 8) / 2, F - 2);
  k.box(m.graphite, 10, 0.6, 4, 0, H - 1.1, F - 2);
  // tall screened archive window: glazing + lit shelves + vertical screen fins
  k.glazing(0, 15.6, F - 3.8, 8.6, 13.4, 0, { interior: interiorMaterial('library', 4, 1.6), rows: 3, cols: 4, depth: 1.8 });
  for (let i = 0; i < 22; i++) k.box(m.graphite, 0.05, 13.2, 0.18, -4.1 + i * 0.39, 15.6, F - 3.3);
  // thin deep canopy over the entrance
  k.slab(m.graphite, 18.5, 0.45, 6, 0, 7.6, F + 1.4);
  k.box(m.champagne, 18.5, 0.06, 0.06, 0, 7.84, F + 4.42);
  for (let i = -3; i <= 3; i++) k.box(m.warmLight, 1.4, 0.04, 0.5, i * 2.4, 7.58, F + 1.6);
  // warm glass lobby
  k.glazing(0, 3.6, F - 2.4, 9.4, 7.2, 0, { interior: interiorMaterial('warm', 6, 1.8), rows: 1, cols: 6, depth: 2.4 });
  k.box(m.dark, 9.4, 0.3, 2.4, 0, 0.15, F - 1.2);
  k.door(0, 0.08, F - 2.3, 3.4, 3.4, 0);
  // engraved name on the left slab (low, image 6)
  k.sign('KNOWLEDGE LIBRARY — RAG DOCUMENT QA', -10.5, 3.2, F + 0.02, 0, 0.42, { color: '#3a3f46', spacing: 0.18, emissive: 0.05, maxWidth: 10.5 });
  // narrow deep windows on side slabs
  for (const s of [-1, 1]) for (let y = 4; y < 22; y += 4.5) k.glazing(s * (W / 2 + 0.01), y, -2, 0.9, 3.2, s * Math.PI / 2, { interior: interiorMaterial('library', 8 + y, 1.2), cols: 1, rows: 1, depth: 0.6 });
  return k;
}

// ------------------------------------------------------------- Communication Tower (image 8)
function tower(W: number, D: number) {
  const k = new Kit();
  const m = M();
  const F = D / 2;
  // podium base
  k.slab(m.concrete, W, 7, D, 0, 0, 0, 0, 4);
  k.slab(m.graphite, W + 0.3, 0.3, D + 0.3, 0, 7, 0);
  // cantilevered canopy over the glass entrance (right half)
  k.slab(m.concreteLight, 14, 1.2, 7, 5.5, 6.2, F + 2.5, 0, 3);
  k.slab(m.concreteLight, 1.4, 6.2, 1.4, 12, 0, F + 5.2, 0, 3);
  for (let i = -2; i <= 2; i++) k.box(m.warmLight, 1.6, 0.05, 0.6, 5.5 + i * 2.6, 6.17, F + 2.8);
  k.glazing(4.8, 3.0, F + 0.02, 11, 6, 0, { interior: interiorMaterial('warm', 12, 1.9), rows: 1, cols: 6 });
  k.door(4.8, 0.06, F + 0.12, 3.2, 3.2, 0);
  k.glazing(-8, 3, F + 0.02, 4, 4.6, 0, { interior: interiorMaterial('warm', 14, 1.6), rows: 1, cols: 2 });
  k.sign('COMMUNICATION TOWER — VOXAI', 5, 5.3, F + 0.02, 0, 0.4, { color: '#e8e1d4', spacing: 0.18, emissive: 0.4 });
  // square shaft with vertical light slots
  const sx = -5.5, sz = -3, S = 6, TH = 44;
  k.slab(m.concreteDark, S, TH, S, sx, 7, sz, 0, 4);
  for (const side of [0, 1, 2, 3]) {
    const ry = (side * Math.PI) / 2;
    const nx = Math.sin(ry), nz = Math.cos(ry);
    for (const off of [-1.9, -1.6, 1.6]) {
      const tx = Math.cos(ry) * off, tz = -Math.sin(ry) * off;
      k.box(m.coolLight, 0.07, 16, 0.07, sx + nx * (S / 2 + 0.02) + tx, 16, sz + nz * (S / 2 + 0.02) + tz);
    }
  }
  // glass observation volume
  k.slab(m.graphiteMatte, 11, 0.7, 11, sx, 25.3, sz);
  k.slab(m.graphite, 11.4, 0.5, 11.4, sx, 29.6, sz);
  for (let s = 0; s < 4; s++) {
    const ry = (s * Math.PI) / 2;
    k.glazing(sx + Math.sin(ry) * 5.5, 27.8, sz + Math.cos(ry) * 5.5, 11, 3.6, ry, { interior: interiorMaterial('warm', 20 + s, 1.6), rows: 1, cols: 6, depth: 1.5 });
  }
  // offset structural rings with muted cyan light (spec 6.4.2)
  const rings: [number, number, number, number][] = [[35.5, 5.0, 0.05, 0], [38.2, 4.6, -0.07, 0.6], [40.6, 3.9, 0.04, 1.4]];
  for (const [y, r, tilt, yaw] of rings) {
    k.add(new THREE.TorusGeometry(r, 0.32, 16, 96).rotateX(Math.PI / 2), m.graphite, [sx, y, sz], [tilt, yaw, tilt * 0.6]);
    k.add(new THREE.TorusGeometry(r + 0.33, 0.07, 8, 96).rotateX(Math.PI / 2), m.cyan, [sx, y, sz], [tilt, yaw, tilt * 0.6], 4, false);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + yaw;
      k.box(m.graphite, r - 3, 0.25, 0.25, sx + Math.cos(a) * (r / 2 + 1.5), y, sz - Math.sin(a) * (r / 2 + 1.5), a);
    }
  }
  // crown + slim architectural spire (no antenna farm)
  k.slab(m.graphite, 4.6, 3, 4.6, sx, TH + 7, sz);
  for (let i = 0; i < 9; i++) k.box(m.coolLight, 0.05, 2.2, 0.05, sx - 2 + i * 0.5, TH + 8.5, sz + 2.31);
  k.cyl(m.graphite, 0.08, 0.35, 9, sx, TH + 10, sz, 12);
  return k;
}

// ------------------------------------------------------------- Smart Warehouse — NexoRa (image 9)
function warehouse(W: number, D: number) {
  const k = new Kit();
  const m = M();
  const F = D / 2;
  // main shed: concrete base + ribbed metal cladding
  k.slab(m.concrete, W, 3, D, 0, 0, 0, 0, 4);
  k.slab(m.ribbed, W, 8.5, D, 0, 3, 0, 0, 2);
  k.slab(m.graphite, W + 0.4, 0.4, D + 0.4, 0, 11.5, 0);
  // raised clerestory volumes on the roof with louvred parapets
  for (const [x, w] of [[-15, 10], [0, 13], [15, 9]] as [number, number][]) {
    k.slab(m.ribbed, w, 4, D - 8, x, 11.9, -2, 0, 2);
    k.slab(m.graphite, w + 0.3, 0.3, D - 7.7, x, 15.9, -2);
    k.glazing(x, 14.2, -2 + (D - 8) / 2 + 0.02, w - 1, 1.6, 0, { interior: interiorMaterial('warehouse', x + 40, 1.1), rows: 1 });
    for (let i = 0; i < 10; i++) k.box(m.graphiteMatte, w, 0.08, 0.3, x, 12.3 + i * 0.36, -2 + (D - 8) / 2 + 0.25);
  }
  // amber facade light bands
  k.box(m.amber, W + 0.1, 0.07, 0.07, 0, 9.2, F + 0.06);
  k.box(m.amber, 0.07, 0.07, D, W / 2 + 0.06, 9.2, 0);
  // loading bays with roll-up doors
  for (let i = 0; i < 4; i++) {
    const x = -20 + i * 5.2;
    k.slab(m.dark, 4.4, 6, 1.2, x, 0, F - 0.4);
    k.slab(m.ribbed, 4.0, 4.6, 0.12, x, 1.2, F - 0.9, 0, 1);
    k.box(m.warmLight, 3.6, 0.05, 0.6, x, 5.95, F - 0.4);
    k.box(m.amber, 0.06, 6, 0.06, x - 2.25, 3, F + 0.05);
    k.box(m.amber, 0.06, 6, 0.06, x + 2.25, 3, F + 0.05);
  }
  // open bay showing warm interior + crates
  k.glazing(-4.4, 3, F - 1.5, 4.0, 5.6, 0, { interior: interiorMaterial('warehouse', 3, 1.5), rows: 1, cols: 1 });
  // loading apron
  k.slab(m.concreteLight, 24, 0.05, 6, -12, 0.03, F + 3);
  // cantilevered glass control room at the corner (spec "central glass control volume")
  const cx = 9, cy = 8.6, cw = 18, ch = 5.6, cdp = 8;
  k.slab(m.graphite, cw + 0.6, 0.8, cdp + 0.6, cx, cy - ch / 2 - 0.8, F + cdp / 2 - 2.5);
  k.slab(m.graphite, cw + 0.6, 1.4, cdp + 0.6, cx, cy + ch / 2, F + cdp / 2 - 2.5);
  k.glazing(cx, cy, F + cdp - 2.5, cw, ch, 0, { interior: interiorMaterial('office', 5, 1.6), rows: 1, cols: 10, depth: 2.5 });
  k.glazing(cx + cw / 2, cy, F + cdp / 2 - 2.5, cdp, ch, Math.PI / 2, { interior: interiorMaterial('office', 7, 1.4), rows: 1, cols: 4, depth: 2.5 });
  k.box(m.amber, cw + 0.6, 0.06, 0.06, cx, cy - ch / 2 - 0.82, F + cdp - 2.15);
  // corner stone pier with lettering
  k.slab(m.concreteLight, 6.6, 5.6, 3, 16, 0, F + 1.3, 0, 3);
  k.sign('SMART WAREHOUSE', 16, 3.4, F + 2.82, 0, 0.36, { color: '#262b31', spacing: 0.14, emissive: 0.02 });
  k.sign('NEXORA', 16, 2.4, F + 2.82, 0, 0.95, { color: '#262b31', font: FONT.bold, spacing: 0.08, emissive: 0.02 });
  k.box(m.warmLightSoft, 6.2, 0.04, 0.12, 16, 0.12, F + 2.9);
  // staff entrance next to the pier
  k.glazing(8.5, 2.2, F + 0.02, 5, 4.2, 0, { interior: interiorMaterial('warm', 9, 1.7), rows: 1, cols: 3 });
  k.door(8.5, 0.06, F + 0.12, 3, 3.0, 0);
  k.slab(m.graphite, 6, 0.3, 2.5, 8.5, 4.2, F + 1.2);
  return k;
}

// ------------------------------------------------------------- Data Center (image 11, corrected to spec)
function dataCenter(W: number, D: number) {
  const k = new Kit();
  const m = M();
  const F = D / 2;
  // three stacked horizontal masses with setbacks + deep recesses
  const tiers = [[0, 7.5, 0], [8.4, 7, -1.4], [16.2, 6.2, -2.8]] as const;
  tiers.forEach(([y, h, set], i) => {
    k.slab(i === 1 ? m.concreteDark : m.concrete, W - i * 1.4, h, D + set * 2, 0, y, set, 0, 4);
    // recess band between tiers with ventilation panels
    k.slab(m.ribbed, W - i * 1.4 - 1.5, 0.9, D + set * 2 - 1.5, 0, y + h, set, 0, 1);
  });
  // vertical fin rhythm on the front with narrow window slots
  for (let i = 0; i < 15; i++) {
    const x = -W / 2 + 2 + i * ((W - 4) / 14);
    k.slab(m.concreteLight, 0.7, 22, 1.5, x, 0.6, F + 0.75, 0, 2);
    if (i < 14) {
      const sx = x + (W - 4) / 28;
      k.glazing(sx, 12.4, F - 0.05, 0.5, 17, 0, { interior: interiorMaterial('cool', 30 + i, 0.9), cols: 1, rows: 4, depth: 0.5 });
      if (i % 4 === 1) k.box(m.cyanSoft, 0.05, 14, 0.05, sx, 12.4, F + 0.15);
    }
  }
  // monumental entrance portal
  k.slab(m.graphite, 10, 0.8, 5, 0, 9.4, F + 2.5);
  k.slab(m.graphite, 0.8, 9.4, 5, -4.6, 0, F + 2.5);
  k.slab(m.graphite, 0.8, 9.4, 5, 4.6, 0, F + 2.5);
  for (let i = -1; i <= 1; i++) k.box(m.coolLight, 2.4, 0.05, 0.6, i * 2.8, 9.38, F + 2.6);
  k.glazing(0, 4.2, F + 0.03, 8.2, 8.2, 0, { interior: interiorMaterial('cool', 4, 1.5), rows: 2, cols: 4, depth: 2 });
  k.door(0, 0.06, F + 0.13, 3.4, 3.4, 0);
  k.sign('DATA CENTER — DATA ENGINEERING', 0, 10.9, F + 5.02, 0, 0.5, { color: '#e6edf3', spacing: 0.2, emissive: 0.4 });
  // rooftop plant equipment
  for (let i = 0; i < 4; i++) {
    const x = -10 + i * 6.5;
    k.slab(m.graphiteMatte, 4.6, 2.4, 4, x, 23.2, -5);
    k.cyl(m.graphite, 1.4, 1.4, 0.4, x, 25.6, -5, 24);
    k.add(new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2), m.dark, [x, 26.02, -5], [0, 0, 0], 4, false);
  }
  return k;
}

// ------------------------------------------------------------- Career & Credentials Pavilion (image 12)
function pavilion(W: number, D: number) {
  const k = new Kit();
  const m = M();
  const F = D / 2, H = 11;
  // ivory stone masses with vertical window slots + graphite panels
  k.slab(m.stoneIvory, W, H, D, 0, 0, 0, 0, 3);
  // graphite insets on the facade
  for (const x of [3, 9.5]) k.slab(m.graphiteMatte, 4.2, H - 1.5, 0.3, x, 0, F + 0.1);
  // tall vertical windows
  for (const x of [-8.5, -6.8, 3, 9.5, 13.5]) k.glazing(x, H / 2 + 0.6, F + 0.3, 1.2, H - 3.5, 0, { interior: interiorMaterial('warm', x + 20, 1.8), cols: 1, rows: 2, depth: 0.8 });
  // ground-level gallery windows showing exhibits
  for (const x of [3, 9.5]) k.glazing(x, 2.1, F + 0.32, 3.6, 3.6, 0, { interior: interiorMaterial('warm', x + 50, 2.0), cols: 2, rows: 1, depth: 1.5 });
  // carved entrance volume (stone canopy) at the front-left
  k.slab(m.stoneIvory, 9, 1.6, 6, -9, 4.6, F + 3, 0, 3);
  k.slab(m.stoneIvory, 1.6, 4.6, 6, -12.7, 0, F + 3, 0, 3);
  for (let i = -1; i <= 1; i++) k.box(m.warmLight, 1.6, 0.05, 1.6, -9 + i * 2.6, 4.58, F + 3);
  k.glazing(-8.5, 2.3, F + 0.32, 6.5, 4.5, 0, { interior: interiorMaterial('warm', 2, 2.2), cols: 4, rows: 1 });
  k.door(-8.5, 0.06, F + 0.42, 3, 3.2, 0);
  // sweeping roof plane: upturned front/back edges, deep dark soffit, champagne fascia
  const prof: [number, number][] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -F - 4 + t * (D + 8);
    prof.push([z, H + 0.6 + Math.pow(Math.abs(t - 0.5) * 2, 3) * 2.6]);
  }
  const top = prof.map(([z, y]) => [z, y + 0.55] as [number, number]);
  const shape: [number, number][] = [...prof, ...top.reverse()];
  k.extrude(m.graphite, shape.map(([z, y]) => [z, y]), W + 6, [0, 0, 0], [0, Math.PI / 2, 0], 0, 3);
  // soffit warm wash + fascia line
  k.box(m.champagne, W + 6, 0.08, 0.08, 0, H + 3.25, F + 4.05);
  k.box(m.warmLightSoft, W - 2, 0.05, 0.4, 0, H + 0.35, F + 1.5);
  // stone sign monolith in the forecourt
  k.slab(m.stoneDark, 7, 2.2, 0.8, 7, 0, F + 8.5, 0, 2);
  k.sign('CAREER & CREDENTIALS', 7, 1.45, F + 8.92, 0, 0.42, { color: '#eadfcd', spacing: 0.14, emissive: 0.35 });
  k.sign('PAVILION', 7, 0.85, F + 8.92, 0, 0.42, { color: '#eadfcd', spacing: 0.3, emissive: 0.35 });
  return k;
}
