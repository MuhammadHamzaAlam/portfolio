import * as THREE from 'three';
import { Kit } from './kit';
import { M } from './materials';
import { DOMAINS, DEST, type Domain } from '../data/registry';

export type MonumentState = 'dormant' | 'awakening' | 'idle' | 'hover' | 'selected' | 'navigating' | 'return';

/** Node graph of the monument (spec 7.6): core -> joint(s) -> terminal, one branch per domain. */
export interface MNode { id: string; category: 'core' | 'joint' | 'terminal'; pos: THREE.Vector3; links: string[]; dest?: string; domain?: Domain }

const CORE_Y = 8.6;
const TERMINAL_LAYOUT: Record<Domain, { elev: number; r: number }> = {
  cv: { elev: 9.4, r: 6.1 },
  rag: { elev: 12.6, r: 5.2 },
  voice: { elev: 11.0, r: 6.0 },
  ml: { elev: 6.9, r: 6.2 },
  data: { elev: 7.6, r: 6.0 },
};

interface Branch {
  domain: Domain;
  curve: THREE.CatmullRomCurve3;
  channel: THREE.Mesh; // emissive path, revealed progressively via drawRange
  channelCount: number;
  terminal: THREE.Group;
  indicator: THREE.MeshStandardMaterial;
  pulse: THREE.Mesh;
  pulseT: number;
  reveal: number;
  hot: number; // 0..1 highlight
  anchor: THREE.Vector3;
}

export class Monument {
  group = new THREE.Group();
  state: MonumentState = 'dormant';
  nodes: MNode[] = [];
  branches: Branch[] = [];
  hitTargets: THREE.Object3D[] = [];
  private rings: { obj: THREE.Object3D; speed: number }[] = [];
  private coreInner!: THREE.Group;
  private crystalMat!: THREE.MeshPhysicalMaterial;
  private coreLight!: THREE.PointLight;
  private ringChannelMat!: THREE.MeshStandardMaterial;
  private wake = 0;
  private speedMul = 1;
  hover: Domain | null = null;
  selected: Domain | null = null;
  private t = 0;
  private navT = -1;

  constructor() {
    const m = M();
    const kit = new Kit();
    // ---------------- platform: 3 tiers with recessed underlighting (spec 6.1.3)
    const tiers = [[7.6, 0.07], [7.0, 0.32], [6.4, 0.57]] as const;
    tiers.forEach(([r, y]) => {
      kit.cyl(m.graphiteMatte, r, r, 0.25, 0, y, 0, 96);
      kit.cyl(m.stoneDark, r - 0.02, r - 0.02, 0.02, 0, y + 0.25, 0, 96);
      kit.add(new THREE.RingGeometry(r - 0.05, r + 0.03, 128).rotateX(-Math.PI / 2), m.warmLight, [0, y + 0.03, 0], [0, 0, 0], 4, false);
    });
    kit.add(new THREE.CylinderGeometry(6.43, 6.43, 0.06, 96, 1, true), m.warmLight, [0, 0.62, 0], [0, 0, 0], 4, false);
    // top plate inlay
    kit.add(new THREE.RingGeometry(3.6, 3.7, 96).rotateX(-Math.PI / 2), m.champagne, [0, 0.83, 0], [0, 0, 0], 2);
    // ---------------- tripod pedestal (image 2)
    const legTop = new THREE.Vector3(0, 5.6, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const foot = new THREE.Vector3(Math.cos(a) * 3.3, 0.82, Math.sin(a) * 3.3);
      const len = foot.distanceTo(legTop);
      const g = new THREE.BoxGeometry(0.3, len, 0.62);
      g.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), legTop.clone().sub(foot).normalize());
      const e = new THREE.Euler().setFromQuaternion(q);
      // rotate the plate so its wide side faces outward
      const g2 = g.clone().rotateY(-a + Math.PI / 2);
      kit.add(g2, m.monumentMetal, [foot.x, foot.y, foot.z], [e.x, e.y, e.z], 2);
      kit.cyl(m.champagne, 0.5, 0.6, 0.18, foot.x, 0.82, foot.z, 24);
    }
    kit.cyl(m.monumentMetal, 0.75, 0.9, 1.0, 0, 5.3, 0, 32);
    kit.cyl(m.champagne, 0.82, 0.82, 0.1, 0, 6.3, 0, 32);
    kit.cyl(m.monumentMetal, 0.16, 0.16, CORE_Y - 6.4 - 1.4, 0, 6.4, 0, 16); // mast to core
    kit.cyl(m.monumentMetal, 0.1, 0.1, 3.8, 0, CORE_Y + 1.5, 0, 12); // mast above core
    this.group.add(kit.build());

    // ---------------- core (spec 7.3)
    const core = new THREE.Group();
    core.position.y = CORE_Y;
    this.group.add(core);
    // icosahedral frame of edges
    const ico = new THREE.IcosahedronGeometry(1.35, 0);
    const edges = new THREE.EdgesGeometry(ico);
    const ep = edges.attributes.position;
    const frame = new Kit();
    for (let i = 0; i < ep.count; i += 2) {
      const a = new THREE.Vector3().fromBufferAttribute(ep, i), b = new THREE.Vector3().fromBufferAttribute(ep, i + 1);
      const len = a.distanceTo(b);
      const g = new THREE.CylinderGeometry(0.045, 0.045, len, 8);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      const e = new THREE.Euler().setFromQuaternion(q);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      frame.add(g, m.monumentMetal, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
    }
    const vp = ico.attributes.position;
    const seen = new Set<string>();
    for (let i = 0; i < vp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(vp, i);
      const k = v.toArray().map((x) => x.toFixed(2)).join();
      if (seen.has(k)) continue;
      seen.add(k);
      frame.add(new THREE.IcosahedronGeometry(0.1, 1), m.champagne, [v.x, v.y, v.z]);
    }
    // separated outer shell segments (partial spheres) with gaps
    for (let i = 0; i < 4; i++) {
      const g = new THREE.SphereGeometry(1.62, 24, 10, (i / 4) * Math.PI * 2 + 0.18, Math.PI / 2 - 0.36, 0.55, 0.65);
      frame.add(g, m.monumentMetal, [0, 0, 0], [0, 0, 0], 2, false);
      const g2 = new THREE.SphereGeometry(1.62, 24, 10, (i / 4) * Math.PI * 2 + 0.18 + Math.PI / 4, Math.PI / 2 - 0.36, Math.PI - 1.2, 0.65);
      frame.add(g2, m.monumentMetal, [0, 0, 0], [0, 0, 0], 2, false);
    }
    // stabilisation struts
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.1, 0.1, 1.3);
      frame.add(g, m.champagne, [Math.cos(a) * 2.2, -0.2, Math.sin(a) * 2.2], [0, -a + Math.PI / 2, 0]);
    }
    core.add(frame.build());
    // inner crystal (rotates slowly, independent axis)
    this.coreInner = new THREE.Group();
    this.crystalMat = new THREE.MeshPhysicalMaterial({ color: '#0c3a44', emissive: new THREE.Color('#36E4FF'), emissiveIntensity: 0.15, roughness: 0.08, metalness: 0.1, transmission: 0.35, thickness: 0.6, clearcoat: 1 });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), this.crystalMat);
    crystal.scale.set(1, 1.25, 1);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.025, 8, 64), m.champagne);
    innerRing.rotation.x = Math.PI / 2;
    this.coreInner.add(crystal, innerRing);
    core.add(this.coreInner);
    this.coreLight = new THREE.PointLight('#36E4FF', 0, 9, 2);
    core.add(this.coreLight);

    // ---------------- three non-identical elliptical rings (spec 7.4)
    this.ringChannelMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color('#36E4FF'), emissiveIntensity: 0 });
    const mkRing = (rx: number, rz: number, tube: number, arc: number, tiltX: number, tiltZ: number, speed: number, opts: { channel?: boolean; markers?: number; mat?: THREE.Material }) => {
      const spin = new THREE.Group();
      spin.position.y = CORE_Y;
      const tilt = new THREE.Group();
      tilt.rotation.set(tiltX, 0, tiltZ);
      spin.add(tilt);
      const pts: THREE.Vector3[] = [];
      const N = 160;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * arc;
        pts.push(new THREE.Vector3(Math.cos(a) * rx, 0, Math.sin(a) * rz));
      }
      const curve = new THREE.CatmullRomCurve3(pts, arc >= Math.PI * 2 - 1e-3);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, tube, 12, arc >= Math.PI * 2 - 1e-3), opts.mat ?? m.monumentMetal);
      mesh.castShadow = true;
      tilt.add(mesh);
      // flat outer band to give rings a machined profile (not a plain torus)
      const band = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, tube * 0.55, 4, arc >= Math.PI * 2 - 1e-3), m.champagne);
      band.scale.set(1.012, 1, 1.012);
      band.position.y = tube * 0.6;
      tilt.add(band);
      if (opts.channel) {
        const ch = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, tube * 0.28, 6, true), this.ringChannelMat);
        ch.scale.set(0.985, 1, 0.985);
        ch.position.y = -tube * 0.5;
        tilt.add(ch);
      }
      for (let i = 0; i < (opts.markers ?? 0); i++) {
        const t = (i + 0.5) / (opts.markers ?? 1);
        const p = curve.getPointAt(t);
        const mk = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), m.champagne);
        mk.position.copy(p);
        mk.lookAt(0, 0, 0);
        tilt.add(mk);
      }
      this.group.add(spin);
      this.rings.push({ obj: spin, speed });
    };
    mkRing(5.1, 4.55, 0.2, Math.PI * 2, THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(8), 0.035, { markers: 6 }); // A
    mkRing(4.45, 3.95, 0.12, Math.PI * 2, THREE.MathUtils.degToRad(80), THREE.MathUtils.degToRad(-12), -0.05, { channel: true }); // B
    mkRing(3.35, 3.05, 0.08, Math.PI * 1.7, THREE.MathUtils.degToRad(-30), THREE.MathUtils.degToRad(55), 0.075, { markers: 5 }); // C (open)

    // ---------------- five domain arms + terminals (spec 7.5)
    this.nodes.push({ id: 'core', category: 'core', pos: new THREE.Vector3(0, CORE_Y, 0), links: [] });
    for (const d of DOMAINS) {
      const dest = DEST[d.dest];
      const az = Math.atan2(dest.pos[0], dest.pos[1]); // aim each arm at its real building
      const lay = TERMINAL_LAYOUT[d.id];
      const dir = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
      const start = new THREE.Vector3(0, CORE_Y, 0).addScaledVector(dir, 1.5);
      const end = dir.clone().multiplyScalar(lay.r).setY(lay.elev);
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, (lay.elev - CORE_Y) * 0.15 + 0.5, 0));
      const j1 = start.clone().lerp(mid, 0.6);
      const curve = new THREE.CatmullRomCurve3([start, j1, mid, end]);
      // structural arm + champagne joints
      const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.085, 10, false), m.monumentMetal);
      arm.castShadow = true;
      this.group.add(arm);
      const chMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color(d.color), emissiveIntensity: 2.2 });
      const chGeo = new THREE.TubeGeometry(curve, 96, 0.04, 6, false);
      const channel = new THREE.Mesh(chGeo, chMat);
      channel.geometry.setDrawRange(0, 0);
      this.group.add(channel);
      [j1, mid].forEach((p) => {
        const j = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), m.champagne);
        j.position.copy(p);
        this.group.add(j);
      });
      // terminal
      const indicator = new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color(d.color), emissiveIntensity: 0.35 });
      const terminal = buildTerminal(d.id, indicator);
      terminal.position.copy(end);
      terminal.scale.setScalar(1.45);
      terminal.lookAt(end.clone().add(dir));
      terminal.userData.domain = d.id;
      this.group.add(terminal);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(end);
      hit.userData.domain = d.id;
      this.group.add(hit);
      this.hitTargets.push(hit);
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color).multiplyScalar(2.5), toneMapped: false }));
      pulse.visible = false;
      this.group.add(pulse);
      this.branches.push({ domain: d.id, curve, channel, channelCount: chGeo.index!.count, terminal, indicator, pulse, pulseT: Math.random() * 6, reveal: 0, hot: 0, anchor: end.clone().add(new THREE.Vector3(0, 1.0, 0)) });
      this.nodes.push({ id: `${d.id}-j1`, category: 'joint', pos: j1, links: ['core', `${d.id}-j2`] });
      this.nodes.push({ id: `${d.id}-j2`, category: 'joint', pos: mid, links: [`${d.id}-j1`, `${d.id}-terminal`] });
      this.nodes.push({ id: `${d.id}-terminal`, category: 'terminal', pos: end, links: [`${d.id}-j2`], dest: d.dest, domain: d.id });
      this.nodes[0].links.push(`${d.id}-j1`);
    }
  }

  setState(s: MonumentState) { this.state = s; }
  setHover(d: Domain | null) { this.hover = d; if (this.state === 'idle' || this.state === 'hover') this.state = d ? 'hover' : 'idle'; }
  select(d: Domain | null) {
    this.selected = d;
    this.state = d ? 'selected' : 'return';
    this.branches.forEach((b) => { if (b.domain !== d) b.reveal = Math.min(b.reveal, 0); });
  }
  navigate(d: Domain) { this.selected = d; this.state = 'navigating'; this.navT = 0; }

  update(dt: number, reduced: boolean) {
    this.t += dt;
    const awake = this.state !== 'dormant';
    this.wake = THREE.MathUtils.damp(this.wake, awake ? 1 : 0, 1.2, dt);
    const focus = this.state === 'selected' || this.state === 'navigating';
    this.speedMul = THREE.MathUtils.damp(this.speedMul, focus ? 0.08 : this.wake, 1.5, dt);
    if (!reduced) for (const r of this.rings) r.obj.rotation.y += r.speed * dt * this.speedMul;
    if (!reduced) {
      this.coreInner.rotation.y += dt * 0.25 * this.wake;
      this.coreInner.rotation.x = Math.sin(this.t * 0.2) * 0.15;
    }
    const sel = this.branches.find((b) => b.domain === (this.selected ?? this.hover));
    const col = sel ? new THREE.Color(DOMAINS.find((d) => d.id === sel.domain)!.color) : new THREE.Color('#36E4FF');
    (this.crystalMat.emissive as THREE.Color).lerp(col, 1 - Math.exp(-dt * 3));
    this.crystalMat.emissiveIntensity = 0.1 + this.wake * (0.9 + 0.25 * Math.sin(this.t * 1.3));
    this.coreLight.color.copy(this.crystalMat.emissive);
    this.coreLight.intensity = this.wake * 6;
    this.ringChannelMat.emissiveIntensity = this.wake * 1.2;

    if (this.state === 'return' && this.branches.every((b) => b.hot < 0.02)) this.state = 'idle';
    if (this.navT >= 0) { this.navT += dt; if (this.navT > 2.2) { this.navT = -1; } }

    for (const b of this.branches) {
      const isSel = this.selected === b.domain && focus;
      const isHov = this.hover === b.domain;
      const dim = focus && !isSel;
      b.hot = THREE.MathUtils.damp(b.hot, isSel ? 1 : isHov ? 0.75 : 0, 4, dt);
      const targetReveal = isSel || isHov ? 1 : 0;
      b.reveal = reduced ? targetReveal : THREE.MathUtils.damp(b.reveal, targetReveal, isSel || isHov ? 2.6 : 5, dt);
      const cnt = Math.floor((b.reveal * b.channelCount) / 3) * 3;
      b.channel.geometry.setDrawRange(0, cnt);
      b.indicator.emissiveIntensity = (dim ? 0.12 : 0.35 * this.wake) + b.hot * 2.4;
      // idle data pulses travel along the real arm curve (arc-length param)
      b.pulseT += dt;
      const period = isSel ? 1.4 : 5 + b.domain.length;
      const phase = (b.pulseT % period) / 1.4;
      const active = this.wake > 0.6 && !dim && phase <= 1 && !reduced;
      b.pulse.visible = active;
      if (active) b.pulse.position.copy(b.curve.getPointAt(Math.min(phase, 1)));
    }
  }

  anchorOf(d: Domain) { return this.branches.find((b) => b.domain === d)!.anchor; }
}

function buildTerminal(d: Domain, ind: THREE.MeshStandardMaterial) {
  const m = M();
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const me = new THREE.Mesh(geo, mat);
    me.position.set(x, y, z);
    me.rotation.set(rx, ry, rz);
    me.castShadow = true;
    g.add(me);
    return me;
  };
  // common mount
  add(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 12), m.champagne, 0, 0, -0.1, Math.PI / 2);
  if (d === 'cv') {
    // imaging frame + sensor tiles
    const s = 1.15;
    for (const [x, y, w, h] of [[0, s / 2, s, 0.1], [0, -s / 2, s, 0.1], [s / 2, 0, 0.1, s], [-s / 2, 0, 0.1, s]]) add(new THREE.BoxGeometry(w, h, 0.18), m.monumentMetal, x, y, 0.15);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) add(new THREE.BoxGeometry(0.28, 0.28, 0.05), (i + j) % 2 ? ind : m.graphite, (i - 1) * 0.32, (j - 1) * 0.32, 0.12);
    add(new THREE.BoxGeometry(s + 0.1, s + 0.1, 0.03), ind, 0, 0, 0.26).scale.set(1, 1, 1);
    g.children[g.children.length - 1].visible = false;
  } else if (d === 'rag') {
    // layered document plates
    for (let i = 0; i < 3; i++) {
      add(new THREE.BoxGeometry(0.85, 1.12, 0.035), m.ceramic, -0.12 + i * 0.12, 0.1 - i * 0.1, i * 0.16);
      add(new THREE.BoxGeometry(0.87, 0.035, 0.04), ind, -0.12 + i * 0.12, 0.1 - i * 0.1 + 0.57, i * 0.16);
    }
    for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.5, 0.025, 0.01), m.graphite, 0.12, 0.25 - k * 0.12 - 0.2, 0.34);
  } else if (d === 'voice') {
    for (const [r, t] of [[0.62, 0.05], [0.45, 0.04], [0.28, 0.035]] as const) add(new THREE.TorusGeometry(r, t, 10, 48), r === 0.45 ? ind : m.monumentMetal, 0, 0, 0.12 + (0.62 - r) * 0.4);
    add(new THREE.SphereGeometry(0.11, 16, 12), ind, 0, 0, 0.35);
  } else if (d === 'ml') {
    // forecasting bars rising
    const hs = [0.35, 0.5, 0.42, 0.68, 0.9];
    hs.forEach((h, i) => add(new THREE.BoxGeometry(0.16, h, 0.16), i === 4 ? ind : m.champagne, -0.36 + i * 0.18, h / 2 - 0.45, 0.15));
    add(new THREE.BoxGeometry(1.0, 0.05, 0.3), m.monumentMetal, 0, -0.47, 0.15);
  } else {
    // aligned data modules with channels
    for (let i = 0; i < 4; i++) {
      add(new THREE.BoxGeometry(0.95, 0.2, 0.5), m.monumentMetal, 0, -0.33 + i * 0.25, 0.2);
      add(new THREE.BoxGeometry(0.7, 0.03, 0.02), ind, 0, -0.33 + i * 0.25, 0.46);
    }
  }
  return g;
}
