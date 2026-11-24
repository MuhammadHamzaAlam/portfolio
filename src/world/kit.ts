import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// @ts-ignore - troika ships no types
import { Text } from 'troika-three-text';
import { M, worldUV } from './materials';

export const FONT = { sans: '/fonts/manrope-latin-600-normal.woff', bold: '/fonts/manrope-latin-800-normal.woff', mono: '/fonts/ibm-plex-mono-latin-500-normal.woff', serif: '/fonts/instrument-serif-latin-400-normal.woff' };

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

/** A door leaf pair that slides open. */
export interface Door { group: THREE.Group; left: THREE.Object3D; right: THREE.Object3D; width: number; open: number }

/**
 * Builder for static architecture. Geometry is baked into building-local space and merged per
 * material on build(), so a whole building costs a handful of draw calls.
 */
export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root = new THREE.Group();
  doors: Door[] = [];
  colliders: THREE.Box3[] = [];
  noShadow = new Set<THREE.Material>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], tile = 4, uv = true) {
    tmpQ.setFromEuler(tmpE.set(rot[0], rot[1], rot[2]));
    tmpM.compose(new THREE.Vector3(...pos), tmpQ, new THREE.Vector3(1, 1, 1));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(tmpM);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (uv) worldUV(g, tile);
    else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat)!.push(g);
    return this;
  }

  /** box positioned by its centre */
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, tile = 4) {
    return this.add(new THREE.BoxGeometry(w, h, d), mat, [x, y, z], [0, ry, 0], tile);
  }
  /** box positioned by its base (y = bottom) */
  slab(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, tile = 4) {
    return this.box(mat, w, h, d, x, y + h / 2, z, ry, tile);
  }
  cyl(mat: THREE.Material, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 40, open = false, tile = 4) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat, [x, y + h / 2, z], [0, 0, 0], tile);
  }
  /** extrude a 2D profile (in XY) by depth along Z, then place */
  extrude(mat: THREE.Material, pts: [number, number][], depth: number, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], bevel = 0, tile = 4, holes: [number, number][][] = []) {
    const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    for (const h of holes) s.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 48 });
    g.translate(0, 0, -depth / 2);
    return this.add(g, mat, pos, rot, tile);
  }

  /**
   * Curtain wall: dark reflective glass with a lit interior plane behind it and mullions.
   * Plane lies in local XY, facing +Z, centred at (x,y,z) rotated by ry.
   */
  glazing(x: number, y: number, z: number, w: number, h: number, ry: number, opts: { cols?: number; rows?: number; interior?: THREE.Material; depth?: number; mullion?: number; frame?: boolean } = {}) {
    const { cols = Math.max(1, Math.round(w / 1.8)), rows = Math.max(1, Math.round(h / 3.6)), interior, depth = 0.9, mullion = 0.08 } = opts;
    const m = M();
    const rot = new THREE.Matrix4().makeRotationY(ry);
    const at = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyMatrix4(rot).add(new THREE.Vector3(x, y, z));
    const P = (v: THREE.Vector3) => [v.x, v.y, v.z] as [number, number, number];
    if (interior) this.add(new THREE.PlaneGeometry(w, h), interior, P(at(0, 0, -depth)), [0, ry, 0], 4, false);
    // floor slabs visible through glass
    for (let r = 1; r < rows; r++) this.add(new THREE.BoxGeometry(w, 0.35, depth), m.graphiteMatte, P(at(0, -h / 2 + (r * h) / rows, -depth / 2)), [0, ry, 0]);
    this.add(new THREE.PlaneGeometry(w, h), glassPane(), P(at(0, 0, 0.01)), [0, ry, 0], 4, false);
    for (let c = 0; c <= cols; c++) this.add(new THREE.BoxGeometry(mullion, h, 0.18), m.mullion, P(at(-w / 2 + (c * w) / cols, 0, 0.06)), [0, ry, 0]);
    for (let r = 0; r <= rows; r++) this.add(new THREE.BoxGeometry(w, mullion * 1.4, 0.2), m.mullion, P(at(0, -h / 2 + (r * h) / rows, 0.07)), [0, ry, 0]);
    return this;
  }

  /** sliding double glass door; local front +Z. Returns door for animation. */
  door(x: number, y: number, z: number, w: number, h: number, ry: number, frameMat?: THREE.Material) {
    const m = M();
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const leafGeo = new THREE.BoxGeometry(w / 2, h, 0.06);
    const mk = () => {
      const leaf = new THREE.Group();
      const glass = new THREE.Mesh(leafGeo, glassPane(true));
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w / 2, h, 0.08), frameMat ?? m.mullion);
      frame.scale.set(1, 1, 1);
      // frame as 4 bars
      const bars = new THREE.Group();
      const bw = 0.07;
      [[0, h / 2 - bw / 2, w / 2, bw], [0, -h / 2 + bw / 2, w / 2, bw], [-w / 4 + bw / 2, 0, bw, h], [w / 4 - bw / 2, 0, bw, h]].forEach(([bx, by, bww, bh]) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bww, bh, 0.09), frameMat ?? m.mullion);
        b.position.set(bx, by, 0);
        bars.add(b);
      });
      leaf.add(glass, bars);
      return leaf;
    };
    const left = mk(), right = mk();
    left.position.set(-w / 4, h / 2, 0);
    right.position.set(w / 4, h / 2, 0);
    // warm vestibule glow behind the doors
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.2, h * 1.05), M().warmLightSoft);
    glow.position.set(0, h / 2, -1.6);
    g.add(left, right, glow);
    this.root.add(g);
    const d: Door = { group: g, left, right, width: w, open: 0 };
    this.doors.push(d);
    return d;
  }

  /** Engraved / applied architectural lettering (troika SDF text, real 3D mesh). */
  sign(text: string, x: number, y: number, z: number, ry: number, size: number, opts: { color?: string; font?: string; spacing?: number; anchor?: 'left' | 'center' | 'right'; emissive?: number; maxWidth?: number } = {}) {
    const t = new Text();
    t.text = text;
    t.font = opts.font ?? FONT.sans;
    t.fontSize = size;
    t.letterSpacing = opts.spacing ?? 0.12;
    t.anchorX = opts.anchor ?? 'center';
    t.anchorY = 'middle';
    if (opts.maxWidth) t.maxWidth = opts.maxWidth;
    t.textAlign = opts.anchor ?? 'center';
    const col = new THREE.Color(opts.color ?? '#d9d4ca');
    t.material = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: opts.emissive ?? 0.15, roughness: 0.4, metalness: 0.6 });
    t.position.set(x, y, z);
    t.rotation.y = ry;
    t.sync();
    this.root.add(t);
    return t;
  }

  /** Axis-aligned collider in building-local space (converted later). */
  collide(minX: number, minZ: number, maxX: number, maxZ: number) {
    this.colliders.push(new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, 10, maxZ)));
  }

  build(shadows = true) {
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      const emissive = (mat as THREE.MeshStandardMaterial).emissive?.getHex?.() && (mat as THREE.MeshStandardMaterial).color?.getHex?.() === 0;
      const transparent = (mat as THREE.Material).transparent;
      mesh.castShadow = shadows && !emissive && !transparent && !this.noShadow.has(mat);
      mesh.receiveShadow = !emissive;
      this.root.add(mesh);
    }
    this.parts.clear();
    return this.root;
  }
}

let glassCache: THREE.Material | null = null;
let glassDoorCache: THREE.Material | null = null;
/** Tinted glass: mostly reflection, lets the lit interior plane read through. */
export function glassPane(door = false) {
  if (door) return (glassDoorCache ??= new THREE.MeshPhysicalMaterial({ color: '#c8d6e0', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false }));
  return (glassCache ??= new THREE.MeshPhysicalMaterial({ color: '#0e1822', transparent: true, opacity: 0.42, roughness: 0.04, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4, depthWrite: false }));
}

/** circle of points helper */
export const ring = (r: number, n: number, y = 0) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); });
