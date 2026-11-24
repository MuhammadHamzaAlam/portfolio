import * as THREE from 'three';
import { Kit, FONT } from './kit';
import { M, lightPoolTexture, worldUV } from './materials';
import { NAV_EDGES, NAV_NODES, RING_R, DESTINATIONS, doorOf, frontOf } from '../data/registry';

const NODE = Object.fromEntries(NAV_NODES.map((n) => [n.id, n]));
export const PLAZA_R = 38;
export const MONUMENT_PLATFORM_R = 7.6;

/** returns ground-level objects + instanced vegetation/lamps, and a list of world colliders */
export function buildSite(quality: 'high' | 'balanced' | 'low') {
  const m = M();
  const group = new THREE.Group();
  const kit = new Kit();
  const colliders: { type: 'circle'; x: number; z: number; r: number }[] = [];

  // ---- terrain: dark lawn disc
  const ground = new THREE.Mesh(worldUV(new THREE.CircleGeometry(420, 96).rotateX(-Math.PI / 2), 6), m.grass);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- roads generated from the nav graph (excluding the plaza ring, which is paved)
  const lampSpots: { x: number; z: number; a: number }[] = [];
  const slitSpots: { x: number; z: number; a: number }[] = [];
  for (const [a, b] of NAV_EDGES) {
    if (a.startsWith('ring') && b.startsWith('ring')) continue;
    if (a === 'aion-pad' || b === 'aion-pad') continue;
    const A = NODE[a].p, B = NODE[b].p;
    const boulevard = a.startsWith('gate') || b.startsWith('gate');
    const w = boulevard ? 12 : 7;
    const dx = B[0] - A[0], dz = B[1] - A[1];
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const cx = (A[0] + B[0]) / 2, cz = (A[1] + B[1]) / 2;
    kit.box(m.paving, w, 0.06, len + w * 0.6, cx, 0.03, cz, ang, 4);
    // stone curbs
    for (const s of [-1, 1]) {
      const ox = Math.cos(ang) * (w / 2 + 0.25) * s, oz = -Math.sin(ang) * (w / 2 + 0.25) * s;
      kit.box(m.stoneDark, 0.5, 0.16, len, cx + ox, 0.08, cz + oz, ang, 2);
    }
    // lamps + inset floor light slits along the road
    const n = Math.floor(len / 15);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const px = A[0] + dx * t, pz = A[1] + dz * t;
      if (Math.hypot(px, pz) < PLAZA_R + 4) continue;
      for (const s of [-1, 1]) {
        const off = w / 2 + 1.4;
        lampSpots.push({ x: px + Math.cos(ang) * off * s, z: pz - Math.sin(ang) * off * s, a: ang });
      }
      if (boulevard || i % 2 === 0) slitSpots.push({ x: px, z: pz, a: ang });
    }
  }

  // ---- plaza paving: concentric rings (spec 6.1.2 / image 2)
  const disc = new THREE.Mesh(worldUV(new THREE.CircleGeometry(PLAZA_R, 128).rotateX(-Math.PI / 2), 4), m.pavingDark);
  disc.position.y = 0.065;
  disc.receiveShadow = true;
  group.add(disc);
  for (const [r, w] of [[11, 0.22], [15.5, 0.12], [16.1, 0.12], [22, 0.3], [RING_R - 3, 0.12], [RING_R + 3, 0.12], [PLAZA_R - 0.6, 0.5]] as [number, number][]) {
    kit.add(new THREE.RingGeometry(r - w / 2, r + w / 2, 160).rotateX(-Math.PI / 2), m.stoneLight, [0, 0.072, 0], [0, 0, 0], 2);
  }
  // radial seams
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    kit.box(m.stoneDark, 0.06, 0.01, PLAZA_R - 16, Math.sin(a) * (16 + (PLAZA_R - 16) / 2), 0.071, Math.cos(a) * (16 + (PLAZA_R - 16) / 2), a, 2);
  }
  // plaza edge step
  kit.add(new THREE.RingGeometry(PLAZA_R, PLAZA_R + 0.8, 160).rotateX(-Math.PI / 2), m.stoneDark, [0, 0.03, 0]);

  // which directions do roads leave the plaza? keep them open
  const openings: number[] = [];
  for (const [a, b] of NAV_EDGES) {
    const ra = a.startsWith('ring'), rb = b.startsWith('ring');
    if (ra === rb) continue;
    const r = ra ? NODE[a].p : NODE[b].p;
    openings.push(Math.atan2(r[0], r[1]));
  }
  const angDist = (x: number, y: number) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
  const blocked = (a: number, margin: number) => openings.some((o) => angDist(a, o) < margin);

  // reflecting pools + monolith pylons in the gaps between openings
  const pylonMat = m.stoneDark;
  for (let i = 0; i < 48; i++) {
    const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    if (blocked(mid, 0.24)) continue;
    const g = new THREE.RingGeometry(PLAZA_R + 1.4, PLAZA_R + 6.5, 6, 1, Math.PI / 2 - a1, a1 - a0).rotateX(-Math.PI / 2);
    kit.add(g, m.water, [0, 0.04, 0], [0, 0, 0], 4, false);
    // pool coping
    kit.add(new THREE.RingGeometry(PLAZA_R + 6.5, PLAZA_R + 7.1, 6, 1, Math.PI / 2 - a1, a1 - a0).rotateX(-Math.PI / 2), m.stoneLight, [0, 0.12, 0]);
  }
  const pylonAngles: number[] = [];
  for (let k = 0; k < 360; k += 3) {
    const a = (k * Math.PI) / 180;
    if (blocked(a, 0.34)) continue;
    if (pylonAngles.some((p) => angDist(p, a) < 0.75)) continue;
    pylonAngles.push(a);
  }
  pylonAngles.forEach((a, i) => {
    const r = PLAZA_R + 9.5;
    const h = 12 + (i % 3) * 2.2;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    kit.slab(pylonMat, 2.6, h, 2.6, x, 0, z, a, 3);
    kit.slab(m.champagne, 0.08, h - 1, 0.08, x - Math.cos(a) * 1.34, 0.5, z + Math.sin(a) * 1.34, a);
    kit.slab(m.warmLightSoft, 1.6, 0.05, 0.05, x - Math.sin(a) * 1.32, 0.15, z - Math.cos(a) * 1.32, a);
    colliders.push({ type: 'circle', x, z, r: 2 });
  });

  // long stone benches with underlight (middle ring)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    if (blocked(a, 0.25)) continue;
    const r = 25.5;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    kit.slab(m.stoneDark, 5, 0.45, 0.9, x, 0.07, z, a + Math.PI / 2, 2);
    kit.box(m.warmLight, 4.6, 0.04, 0.04, x + Math.sin(a) * 0.47, 0.12, z + Math.cos(a) * 0.47, a + Math.PI / 2);
    kit.box(m.warmLight, 4.6, 0.04, 0.04, x - Math.sin(a) * 0.47, 0.12, z - Math.cos(a) * 0.47, a + Math.PI / 2);
  }

  // ---- AION arrival platform (spec 6.1.5)
  const pad = NODE['aion-pad'].p;
  kit.cyl(m.stoneDark, 2.6, 2.75, 0.32, pad[0], 0.06, pad[1], 64);
  kit.cyl(m.graphite, 2.0, 2.0, 0.06, pad[0], 0.38, pad[1], 64);
  kit.add(new THREE.RingGeometry(2.62, 2.7, 96).rotateX(-Math.PI / 2), m.warmLight, [pad[0], 0.2, pad[1]], [0, 0, 0], 4, false);
  kit.add(new THREE.RingGeometry(1.2, 1.24, 96).rotateX(-Math.PI / 2), m.cyanSoft, [pad[0], 0.445, pad[1]], [0, 0, 0], 4, false);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    kit.box(m.graphiteMatte, 0.5, 0.05, 0.12, pad[0] + Math.cos(a) * 1.6, 0.43, pad[1] + Math.sin(a) * 1.6, -a);
  }
  // single vertical architectural light
  kit.slab(m.graphite, 0.32, 4.2, 0.32, pad[0] - 2.1, 0.38, pad[1] + 1.2);
  kit.slab(m.coolLight, 0.08, 3.6, 0.34, pad[0] - 2.1, 0.6, pad[1] + 1.2);

  // ---- gateway (spec 10.2)
  buildGateway(kit);

  // ---- road light slits
  const slitGeo = new THREE.BoxGeometry(0.12, 0.03, 2.4);
  const slits = new THREE.InstancedMesh(slitGeo, m.warmLightSoft, slitSpots.length * 2);
  const o = new THREE.Object3D();
  let si = 0;
  for (const s of slitSpots)
    for (const side of [-1, 1]) {
      o.position.set(s.x + Math.cos(s.a) * 2.2 * side, 0.07, s.z - Math.sin(s.a) * 2.2 * side);
      o.rotation.set(0, s.a, 0);
      o.updateMatrix();
      slits.setMatrixAt(si++, o.matrix);
    }
  group.add(slits);

  // ---- lamp posts (instanced) + light pools
  const poleGeo = new THREE.BoxGeometry(0.16, 4.2, 0.16).translate(0, 2.1, 0);
  const headGeo = new THREE.BoxGeometry(0.2, 0.9, 0.2).translate(0, 4.6, 0);
  const lampsPole = new THREE.InstancedMesh(poleGeo, m.graphite, lampSpots.length);
  const lampsHead = new THREE.InstancedMesh(headGeo, m.warmLight, lampSpots.length);
  lampSpots.forEach((l, i) => {
    o.position.set(l.x, 0, l.z);
    o.rotation.set(0, l.a, 0);
    o.updateMatrix();
    lampsPole.setMatrixAt(i, o.matrix);
    lampsHead.setMatrixAt(i, o.matrix);
  });
  lampsPole.castShadow = true;
  group.add(lampsPole, lampsHead);
  const poolMat = new THREE.MeshBasicMaterial({ map: lightPoolTexture(), color: new THREE.Color('#ffb877').multiplyScalar(0.32), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), poolMat, lampSpots.length);
  lampSpots.forEach((l, i) => { o.position.set(l.x, 0.09, l.z); o.rotation.set(0, 0, 0); o.updateMatrix(); pools.setMatrixAt(i, o.matrix); });
  group.add(pools);

  // ---- trees: sculptural, sparse; instanced (spec 6.1.2)
  const treeSpots: { x: number; z: number; s: number }[] = [];
  const rnd = mulberry(7);
  for (const s of lampSpots) if (rnd() < 0.55) treeSpots.push({ x: s.x + (s.x > 0 ? 1 : -1) * (2 + rnd() * 3), z: s.z + (rnd() - 0.5) * 4, s: 0.8 + rnd() * 0.5 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    if (blocked(a, 0.3)) continue;
    const r = PLAZA_R + 17 + rnd() * 6;
    treeSpots.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, s: 0.9 + rnd() * 0.5 });
  }
  // keep trees off roads/buildings: discard spots near building footprints
  const clear = treeSpots.filter((t) => DESTINATIONS.every((d) => d.id === 'plaza' || Math.hypot(t.x - d.pos[0], t.z - d.pos[1]) > Math.max(d.half[0], d.half[1]) + 6));
  const counts = quality === 'low' ? Math.floor(clear.length / 2) : clear.length;
  const tree = treeGeometry();
  const trunks = new THREE.InstancedMesh(tree.trunk, m.bark, counts);
  const crowns = new THREE.InstancedMesh(tree.crown, m.foliage, counts);
  const upl = new THREE.InstancedMesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), poolMat, counts);
  for (let i = 0; i < counts; i++) {
    const t = clear[i];
    o.position.set(t.x, 0, t.z);
    o.rotation.set(0, rnd() * 6.28, 0);
    o.scale.setScalar(t.s);
    o.updateMatrix();
    trunks.setMatrixAt(i, o.matrix);
    crowns.setMatrixAt(i, o.matrix);
    o.scale.setScalar(1);
    o.position.y = 0.1;
    o.updateMatrix();
    upl.setMatrixAt(i, o.matrix);
  }
  trunks.castShadow = crowns.castShadow = true;
  group.add(trunks, crowns, upl);

  // planting beds hugging each building front
  for (const d of DESTINATIONS) {
    if (d.id === 'plaza') continue;
    const [dx, dz] = doorOf(d);
    const [fx, fz] = frontOf(d);
    const ry = Math.atan2(fx, fz);
    for (const side of [-1, 1]) {
      const off = d.half[0] * 0.55;
      const cx = dx + fx * 5 + Math.cos(ry) * off * side, cz = dz + fz * 5 - Math.sin(ry) * off * side;
      kit.slab(m.stoneDark, d.half[0] * 0.6, 0.55, 3, cx, 0, cz, ry, 2);
      kit.slab(m.soil, d.half[0] * 0.6 - 0.4, 0.05, 2.6, cx, 0.52, cz, ry);
      kit.box(m.warmLightSoft, d.half[0] * 0.6 - 0.3, 0.04, 0.04, cx + fx * 1.53, 0.4, cz + fz * 1.53, ry);
    }
  }

  const built = kit.build();
  group.add(built);
  group.add(buildSkyline(quality));
  return { group, colliders, pylonAngles, decals: [pools, upl] as THREE.Object3D[] };
}

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function treeGeometry() {
  // slender sculptural tree: trunk, 4 rising limbs, sparse leaf clusters on limb tips
  const r = mulberry(3);
  const wood: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const clean = (g: THREE.BufferGeometry) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
  wood.push(clean(new THREE.CylinderGeometry(0.08, 0.15, 3.0, 7).translate(0, 1.5, 0)));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.6;
    const tilt = 0.35 + r() * 0.35;
    const len = 2.2 + r() * 1.0;
    const limb = new THREE.CylinderGeometry(0.035, 0.07, len, 5).translate(0, len / 2, 0);
    limb.rotateZ(tilt);
    limb.rotateY(a);
    limb.translate(0, 2.6 + r() * 0.4, 0);
    wood.push(clean(limb));
    const tip = new THREE.Vector3(0, len, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(new THREE.Vector3(0, 2.8, 0));
    for (let k = 0; k < 6; k++) {
      const c = new THREE.IcosahedronGeometry(0.38 + r() * 0.3, 0);
      c.scale(1, 0.7, 1);
      c.translate(tip.x + (r() - 0.5) * 1.5, tip.y + (r() - 0.3) * 0.9, tip.z + (r() - 0.5) * 1.5);
      leaves.push(clean(c));
    }
  }
  for (let k = 0; k < 5; k++) {
    const c = new THREE.IcosahedronGeometry(0.42 + r() * 0.25, 0);
    c.scale(1, 0.7, 1);
    c.translate((r() - 0.5) * 1.2, 4.6 + r() * 0.8, (r() - 0.5) * 1.2);
    leaves.push(clean(c));
  }
  return { trunk: _merge(wood)!, crown: _merge(leaves)! };
}
import { mergeGeometries as _merge } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ gateway
function buildGateway(kit: Kit) {
  const m = M();
  const z = -112;
  // two asymmetrical pylons (left heavier) — trapezoid profile extruded along Z
  const L = (x0: number, w: number, h: number, slope: number, d: number) =>
    kit.extrude(m.stoneLight, [[0, 0], [w, 0], [w, h - slope], [0, h]], d, [x0, 0, z], [0, 0, 0], 0, 3);
  L(-16.5, 9.5, 17, 2.2, 16); // left: x -16.5..-7
  L(7, 8, 14.5, -1.8, 16); // right: x 7..15
  // inner passage cladding: graphite with vertical light slots
  for (const s of [-1, 1]) {
    const x = s === -1 ? -7.02 : 7.02;
    kit.box(m.graphite, 0.08, 9, 15, x, 4.5, z, 0, 2);
    for (let i = -3; i <= 3; i++) kit.box(m.warmLightSoft, 0.1, 7.5, 0.08, x - s * 0.02, 4.2, z + i * 2.1);
  }
  // overhead connecting beam with sign band
  kit.slab(m.concreteDark, 25, 3.2, 12, 0, 11, z, 0, 3);
  kit.slab(m.graphite, 25.4, 0.3, 12.4, 0, 14.2, z);
  kit.box(m.graphite, 16, 1.3, 0.25, 0, 12.6, z - 6.1);
  kit.box(m.graphite, 16, 1.3, 0.25, 0, 12.6, z + 6.1);
  // recessed ceiling light lines in the passage
  for (let i = -2; i <= 2; i++) kit.box(m.warmLight, 13, 0.05, 0.25, 0, 10.97, z + i * 2.6);
  // chevron emblems on outer faces
  const chev: [number, number][] = [[-1.4, 0], [0, 1.3], [1.4, 0], [1.4, 0.45], [0, 1.75], [-1.4, 0.45]];
  for (const [x, y] of [[-11.75, 8], [11, 7]] as [number, number][]) {
    for (let k = 0; k < 3; k++) kit.extrude(m.champagne, chev, 0.14, [x, y + k * 0.75, z - 8.05], [0, 0, 0]);
    kit.box(m.warmLightSoft, 3.6, 0.04, 0.1, x, y - 0.6, z - 8.08);
  }
  // low wing walls extending outwards
  for (const s of [-1, 1]) {
    kit.slab(m.stoneLight, 18, 3.4, 2.4, s * 28.5, 0, z - 4, 0, 3);
    kit.slab(m.champagne, 17, 0.08, 0.08, s * 28.5, 2.7, z - 5.25);
    kit.slab(m.warmLightSoft, 17, 0.04, 0.04, s * 28.5, 0.1, z - 5.3);
  }
  // signage on both faces of the beam
  kit.sign('HRZ — AI INNOVATION CITY', 0, 12.65, z - 6.27, Math.PI, 0.72, { color: '#efe7d8', font: FONT.bold, spacing: 0.18, emissive: 0.6 });
  kit.sign('HRZ — AI INNOVATION CITY', 0, 12.65, z + 6.27, 0, 0.72, { color: '#efe7d8', font: FONT.bold, spacing: 0.18, emissive: 0.6 });
  kit.sign('ENTER THE MIND BEHIND THE MACHINE', 0, 11.95, z - 6.27, Math.PI, 0.32, { color: '#c6a77b', font: FONT.mono, spacing: 0.3 });
}

// ------------------------------------------------------------------ skyline (low detail, distant)
function buildSkyline(quality: string) {
  const r = mulberry(19);
  const geos: THREE.BufferGeometry[] = [];
  const n = quality === 'low' ? 24 : 46;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.08;
    const dist = 215 + r() * 110;
    const w = 14 + r() * 26, d = 14 + r() * 20, h = 14 + Math.pow(r(), 2) * 60;
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(Math.sin(a) * dist, h / 2, Math.cos(a) * dist);
    g.rotateY((r() - 0.5) * 0.2);
    geos.push(g);
  }
  const merged = _merge(geos)!;
  worldUV(merged, 24);
  const mat = new THREE.MeshStandardMaterial({ color: '#0d1218', roughness: 0.9, emissive: '#ffffff', emissiveMap: windowGrid(), emissiveIntensity: 0.9 });
  const mesh = new THREE.Mesh(merged, mat);
  return mesh;
}

function windowGrid() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  const r = mulberry(5);
  for (let y = 0; y < 256; y += 16)
    for (let x = 0; x < 256; x += 12) {
      if (r() < 0.22) {
        const warm = r() < 0.8;
        g.fillStyle = warm ? `rgba(255,${190 + r() * 40},${120 + r() * 50},${0.25 + r() * 0.4})` : `rgba(170,210,255,${0.2 + r() * 0.3})`;
        g.fillRect(x + 2, y + 4, 8, 8);
      }
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
