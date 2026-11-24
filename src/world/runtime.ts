import * as THREE from 'three';
import gsap from 'gsap';
import { buildSite, PLAZA_R, MONUMENT_PLATFORM_R } from './site';
import { buildBuilding } from './buildings';
import { Monument } from './monument';
import { Aion } from './aion';
import { M } from './materials';
import type { Door } from './kit';
import { DESTINATIONS, DEST, DOMAINS, rotYOf, doorOf, frontOf, findRoute, nearestNode, nodeFor, NAV_NODES, type DestId, type Domain } from '../data/registry';
import { getState, setState, onCmd, type Quality } from '../state/store';

// Journeys must complete even on slow GPUs: only smooth lag for frames longer than 1.5 s.
gsap.ticker.lagSmoothing(1500, 250);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PAD = NAV_NODES.find((n) => n.id === 'aion-pad')!.p;

interface Placed { id: DestId; group: THREE.Group; doors: Door[]; proxy: THREE.Mesh; doorWorld: THREE.Vector3; front: THREE.Vector3; side: THREE.Vector3 }

export type Projected = { x: number; y: number; visible: boolean };
export const frameHooks = new Set<() => void>();

/**
 * Imperative city runtime. One persistent scene; React only drives UI.
 * Owns: environment, buildings, monument, AION, camera modes, picking, explore physics.
 */
export class CityRuntime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  dom: HTMLElement;
  monument!: Monument;
  aion = new Aion();
  placed: Placed[] = [];
  colliders: { x: number; z: number; r: number }[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-9, -9);
  private dragging = false;
  private dragMoved = 0;
  private lastPt = new THREE.Vector2();
  // camera controller
  camPos = V(0, 1.75, -152);
  camLook = V(0, 6, 0);
  private camPosT = this.camPos.clone();
  private camLookT = this.camLook.clone();
  private camDamp = 2.2;
  private orbit = { theta: Math.PI - 0.3, phi: 1.33, radius: 30 };
  private orbitT = { ...this.orbit };
  private cine: gsap.core.Timeline | null = null;
  private explore = { yaw: 0, pitch: 0, keys: new Set<string>(), joy: new THREE.Vector2() };
  private routeLine: THREE.Mesh | null = null;
  private marker!: THREE.Mesh;
  private rimLight!: THREE.SpotLight;
  private dispose: (() => void)[] = [];
  projected: Record<string, Projected> = {};
  private time = 0;
  private sun!: THREE.DirectionalLight;
  ready = false;
  private decals: THREE.Object3D[] = [];
  private hemi!: THREE.HemisphereLight;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.dom = renderer.domElement;
  }

  async init(quality: Quality) {
    const { scene } = this;
    scene.background = new THREE.Color('#05070B');
    scene.fog = new THREE.FogExp2('#0b1422', 0.0032);
    scene.add(skyDome());
    scene.environment = nightEnvironment(this.renderer);
    scene.environmentIntensity = 0.55;

    // lights (spec 6.1.6 three layers)
    this.hemi = new THREE.HemisphereLight('#3a5277', '#0a0c10', 0.9);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#a9bde0', 0.55));
    sun.position.set(-90, 140, 70);
    sun.castShadow = quality !== 'low';
    sun.shadow.mapSize.setScalar(quality === 'high' ? 4096 : 2048);
    Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 420 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    // monument key (warm), rim (cool), fill
    const key = new THREE.SpotLight('#ffd6a6', 14, 70, 0.4, 0.7, 0);
    key.position.set(16, 24, -20);
    key.target.position.set(0, 7, 0);
    key.castShadow = quality === 'high';
    key.shadow.mapSize.setScalar(1024);
    scene.add(key, key.target);
    const rim = new THREE.SpotLight('#9fe6ff', 6, 60, 0.26, 0.8, 0);
    rim.position.set(-12, 22, 24);
    rim.target.position.set(0, 10, 0);
    scene.add(rim, rim.target);
    const fill = new THREE.PointLight('#cfd8e6', 2.2, 40, 0);
    fill.position.set(0, 4, -18);
    // warm platform glow (uplights around the monument base)
    const base = new THREE.PointLight('#ffb978', 3.0, 22, 1.2);
    base.position.set(0, 1.4, 0);
    scene.add(base);
    scene.add(fill);
    // AION rim light (CINDER): warm amber from behind the pad
    this.rimLight = new THREE.SpotLight('#ffa654', 0, 14, 0.55, 0.6, 1.4);
    this.rimLight.position.set(PAD[0] - 2.5, 4.5, PAD[1] + 3.5);
    this.rimLight.target.position.set(PAD[0], 1.2, PAD[1]);
    scene.add(this.rimLight, this.rimLight.target);

    // site + buildings
    const site = buildSite(quality);
    scene.add(site.group);
    this.decals = site.decals;
    site.colliders.forEach((c) => this.colliders.push(c));
    this.colliders.push({ x: 0, z: 0, r: MONUMENT_PLATFORM_R + 0.4 });
    for (const d of DESTINATIONS) {
      if (d.id === 'plaza') continue;
      const kit = buildBuilding(d.id, d.half[0] * 2, d.half[1] * 2);
      const g = kit.build(quality !== 'low');
      g.position.set(d.pos[0], 0, d.pos[1]);
      g.rotation.y = rotYOf(d);
      scene.add(g);
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(d.half[0] * 2, 26, d.half[1] * 2), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.position.set(d.pos[0], 13, d.pos[1]);
      proxy.rotation.y = rotYOf(d);
      proxy.userData.dest = d.id;
      scene.add(proxy);
      const [dx, dz] = doorOf(d);
      const [fx, fz] = frontOf(d);
      this.placed.push({ id: d.id, group: g, doors: kit.doors, proxy, doorWorld: V(dx, 0, dz), front: V(fx, 0, fz), side: V(fz, 0, -fx) });
      // warm entrance light spill
      const pl = new THREE.PointLight('#ffc994', 60, 22, 1.6);
      pl.position.set(dx + fx * 3, 4, dz + fz * 3);
      scene.add(pl);
    }

    this.monument = new Monument();
    scene.add(this.monument.group);

    // location marker + route line material
    this.marker = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#36E4FF', transparent: true, opacity: 0.9, toneMapped: false }));
    this.marker.visible = false;
    scene.add(this.marker);

    // AION
    await this.aion.load('/models/aion.glb');
    this.aion.setPosition(PAD[0], PAD[1], 0.44);
    this.aion.face(Math.atan2(0 - PAD[0], -40 - PAD[1]));
    this.aion.setReveal(0.44); // hidden until the intro materialises it
    scene.add(this.aion.root);

    this.bindInput();
    this.dispose.push(onCmd((c) => this.onCommand(c)));
    this.ready = true;
    // remount (e.g. quality change): restore the visitor's place in the city
    const st = getState();
    if (st.introDone) {
      this.aion.setReveal(-1);
      this.rimLight.intensity = 45;
      this.monument.setState('idle');
      if (st.location === 'plaza') this.toPlaza();
      else { const sp = this.arrivalSpot(st.location); this.aion.setPosition(sp.x, sp.z); this.arrive(st.location); }
      const c = st.location === 'plaza' ? null : this.arrivalCamera(st.location);
      if (c) { this.camPos.copy(c.pos); this.camLook.copy(c.look); }
    }
    setState({ aionReady: true });
    this.applyCamera(1);
  }

  // ------------------------------------------------------------------ commands from UI
  private onCommand(c: Parameters<Parameters<typeof onCmd>[0]>[0]) {
    switch (c.type) {
      case 'skipIntro': return this.finishIntro(true);
      case 'go': return this.goTo(c.dest, c.how);
      case 'skip': return this.skipJourney();
      case 'selectDomain': return this.selectDomain(c.domain);
      case 'plazaView': return this.toPlaza();
      case 'explore': return this.setExplore(c.on);
    }
  }

  // ------------------------------------------------------------------ intro (UMBRAL / PARROT / CINDER / MOLT)
  startIntro() {
    const reduced = getState().reducedMotion;
    setState({ started: true, mode: 'intro' });
    if (reduced) return this.finishIntro(true);
    const pathPos = new THREE.CatmullRomCurve3([V(0, 1.75, -152), V(0, 1.9, -124), V(0, 2.3, -104), V(0, 3.6, -76), V(0, 6.5, -50), V(-6, 6.2, -33)]);
    const pathLook = new THREE.CatmullRomCurve3([V(0, 5, 0), V(0, 6, 0), V(0, 7, 0), V(0, 8, 0), V(0, 8.5, 0), V(-2, 6.5, 0)]);
    const p = { t: 0 };
    const tl = gsap.timeline();
    this.cine = tl;
    tl.to(p, {
      t: 1, duration: 11, ease: 'power1.inOut',
      onUpdate: () => { this.camPosT.copy(pathPos.getPointAt(p.t)); this.camLookT.copy(pathLook.getPointAt(p.t)); setState({ hint: p.t < 0.35 ? 'gate' : p.t < 0.8 ? 'approach' : 'plaza' }); },
    });
    tl.call(() => this.monument.setState('awakening'), [], 4.5);
    tl.call(() => this.monument.setState('idle'), [], 8.5);
    // Shot E — AION appearance on its platform
    const aionCam = { t: 0 };
    tl.to(aionCam, {
      t: 1, duration: 3.2, ease: 'power2.inOut',
      onUpdate: () => {
        this.camPosT.lerpVectors(V(-6, 6.2, -33), V(PAD[0] + 1.5, 2.2, PAD[1] - 7.2), aionCam.t);
        this.camLookT.lerpVectors(V(-2, 6.5, 0), V(PAD[0], 1.5, PAD[1]), aionCam.t);
      },
    });
    tl.call(() => this.materializeAion());
    tl.to({}, { duration: 4.6 });
    tl.call(() => this.finishIntro(false));
  }

  materializeAion() {
    const r = { y: 0.44, rim: 0 };
    this.aion.faceTowards(this.camera.position.x, this.camera.position.z);
    gsap.timeline()
      .to(r, { rim: 160, duration: 1.0, onUpdate: () => { this.rimLight.intensity = r.rim; } })
      .to(r, { y: 2.5, duration: 2.6, ease: 'power2.inOut', onUpdate: () => this.aion.setReveal(r.y) }, 0.3)
      .call(() => { this.aion.setReveal(-1); this.aion.gesture('Greet'); })
      .to(r, { rim: 45, duration: 1.4, onUpdate: () => { this.rimLight.intensity = r.rim; } });
  }

  finishIntro(skipped: boolean) {
    if (getState().introDone) return;
    this.cine?.kill();
    this.monument.setState('idle');
    if (skipped) {
      this.aion.setReveal(-1);
      this.rimLight.intensity = 45;
      this.aion.faceTowards(0, -30);
    }
    this.toPlaza();
    setState({ introDone: true, started: true, aionText: DEST.plaza.aionIntro, aionOpen: true });
    this.aion.presenting(true);
    setTimeout(() => this.aion.presenting(false), 5000);
  }

  // ------------------------------------------------------------------ plaza inspection (VALMORA views)
  toPlaza() {
    if (getState().mode === 'explore') document.exitPointerLock?.();
    const small = innerWidth < 760;
    this.orbitT = { theta: Math.PI - 0.34, phi: 1.36, radius: small ? 38 : 33 };
    setState({ mode: 'plaza', location: 'plaza', target: null, selectedDomain: null, mapSelection: null });
    this.monument.select(null);
    this.camDamp = 2;
    this.setRoute(null);
  }

  selectDomain(d: Domain | null) {
    const s = getState();
    if (s.mode !== 'plaza') this.toPlaza();
    setState({ selectedDomain: d });
    this.monument.select(d);
    if (!d) { this.orbitT.radius = 31; this.orbitT.phi = 1.36; return; }
    // View D — focus the selected terminal, keeping the core in frame
    const a = this.monument.anchorOf(d);
    const az = Math.atan2(a.x, a.z);
    this.orbitT = { theta: az + 0.55, phi: 1.25, radius: 21 };
    // AION turns toward the Monument and gestures at the branch
    if (!this.aion.walking) {
      this.aion.faceTowards(a.x, a.z);
      this.aion.gazeTarget = a.clone();
      this.aion.gesture('Point');
      setTimeout(() => (this.aion.gazeTarget = null), 3000);
    }
    const dom = DOMAINS.find((x) => x.id === d)!;
    setState({ aionText: DEST[dom.dest].aionIntro, aionOpen: true });
  }

  // ------------------------------------------------------------------ journeys
  goTo(dest: DestId, how: 'guided' | 'direct') {
    const s = getState();
    if (s.mode === 'explore') { document.exitPointerLock?.(); this.setExplore(false); }
    this.closeDoors();
    if (dest === 'plaza' && how === 'direct') { this.travelCamera(dest); return; }
    const dom = DOMAINS.find((x) => x.dest === dest);
    if (dom) this.monument.navigate(dom.id);
    setState({ target: dest, mapSelection: null, journeyPaused: false, aionText: null, aionOpen: false, menu: null });
    if (how === 'direct') return this.travelCamera(dest);
    // Guided: AION walks the route; the camera follows (EARSHOT)
    const a = this.aion.root.position;
    const from = nearestNode(a.x, a.z);
    const pts = findRoute(from, nodeFor(dest)).map(([x, z]) => V(x, 0, z));
    pts.unshift(a.clone().setY(0));
    const arrival = this.arrivalSpot(dest);
    pts.push(arrival);
    const clean = dedupe(pts);
    this.setRoute(clean);
    setState({ mode: 'guided', location: s.location });
    this.camDamp = 1.6;
    // AION acknowledges: turns toward the first leg, then walks
    this.aion.presenting(false);
    this.aion.walk(clean, () => this.arrive(dest));
  }

  private arrivalSpot(dest: DestId) {
    if (dest === 'plaza') return V(PAD[0], 0, PAD[1]);
    const p = this.placed.find((x) => x.id === dest)!;
    return p.doorWorld.clone().addScaledVector(p.front, 4.2).addScaledVector(p.side, 3.2);
  }

  travelCamera(dest: DestId) {
    // Direct travel: an authored flight above the actual street network (no teleport)
    const a = this.camera.position;
    const from = nearestNode(a.x, a.z);
    const route = findRoute(from, nodeFor(dest)).map(([x, z]) => V(x, 0, z));
    const pts = dedupe([a.clone(), ...route.map((p, i) => p.clone().setY(i === 0 ? a.y : 16))]);
    const finalCam = this.arrivalCamera(dest);
    pts.push(finalCam.pos);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    this.setRoute(route);
    setState({ mode: 'travel', target: dest });
    // AION meets the visitor there (same instance, moved while off-camera)
    const spot = this.arrivalSpot(dest);
    const p = { t: 0 };
    this.cine?.kill();
    const reduced = getState().reducedMotion;
    this.cine = gsap.timeline().to(p, {
      t: 1, duration: reduced ? 0.01 : THREE.MathUtils.clamp(len / 28, 2.5, 7), ease: 'power2.inOut',
      onUpdate: () => {
        this.camPosT.copy(curve.getPointAt(p.t));
        const ahead = curve.getPointAt(Math.min(1, p.t + 0.08));
        this.camLookT.lerpVectors(ahead.setY(4), finalCam.look, THREE.MathUtils.smoothstep(p.t, 0.55, 1));
        setState({ journeyProgress: p.t });
        if (p.t > 0.5 && this.aion.root.position.distanceTo(spot) > 1 && dest !== 'plaza') {
          this.aion.setPosition(spot.x, spot.z);
        }
      },
      onComplete: () => (dest === 'plaza' ? this.toPlaza() : this.arrive(dest)),
    });
    this.camDamp = 6;
  }

  private arrivalCamera(dest: DestId) {
    if (dest === 'plaza') return { pos: V(Math.sin(Math.PI - 0.34) * 33, 9, Math.cos(Math.PI - 0.34) * 33), look: V(0, 7, 0) };
    const p = this.placed.find((x) => x.id === dest)!;
    const d = DEST[dest];
    const H: Record<string, number> = { 'earth-observation-center': 11, 'knowledge-library': 11, 'communication-tower': 20, 'smart-warehouse': 6.5, 'data-center': 10, 'career-pavilion': 7 };
    const centre = V(d.pos[0], 0, d.pos[1]);
    const span = Math.max(d.half[0], d.half[1]);
    const small = innerWidth < 760;
    const dist = span * (small ? 2.6 : 1.75) + (dest === 'communication-tower' ? 34 : 14);
    // 3/4 establishing view; offset sideways so the info card (left) does not cover the entrance
    const sideSign = dest === 'knowledge-library' ? 1 : -1;
    const pos = centre.clone().addScaledVector(p.front, dist + d.half[1]).addScaledVector(p.side, sideSign * dist * 0.42).setY(dest === 'communication-tower' ? 9 : 5.5);
    const look = centre.clone().addScaledVector(p.front, d.half[1] * 0.6).addScaledVector(p.side, sideSign * span * 0.35).setY(H[dest]);
    return { pos, look };
  }

  arrive(dest: DestId) {
    if (dest === 'plaza') {
      this.toPlaza();
      this.aion.faceTowards(this.camera.position.x, this.camera.position.z);
      setState({ aionText: DEST.plaza.aionIntro, aionOpen: true });
      return;
    }
    const p = this.placed.find((x) => x.id === dest)!;
    const cam = this.arrivalCamera(dest);
    this.camPosT.copy(cam.pos);
    this.camLookT.copy(cam.look);
    this.camDamp = 1.4;
    setState({ mode: 'arrived', location: dest, target: null, journeyProgress: 1, doorOpen: dest, aionText: DEST[dest].aionIntro, aionOpen: true });
    this.setRoute(null);
    this.openDoors(dest);
    // AION turns to the visitor, gestures to the entrance, presents
    const spot = this.arrivalSpot(dest);
    if (this.aion.root.position.distanceTo(spot) > 0.5 && !this.aion.walking) this.aion.setPosition(spot.x, spot.z);
    this.aion.faceTowards(cam.pos.x, cam.pos.z);
    this.aion.gazeTarget = null;
    setTimeout(() => {
      this.aion.gesture('Present');
      this.aion.presenting(true);
      setTimeout(() => this.aion.presenting(false), 4500);
    }, 600);
    void p;
  }

  skipJourney() {
    const s = getState();
    if (s.mode === 'guided' && s.target) {
      const dest = s.target;
      this.aion.stopWalking(false);
      const spot = this.arrivalSpot(dest);
      this.aion.setPosition(spot.x, spot.z);
      this.arrive(dest);
    } else if (s.mode === 'travel') {
      this.cine?.progress(1);
    } else if (s.mode === 'intro') this.finishIntro(true);
  }
  setPaused(p: boolean) { this.aion.paused = p; setState({ journeyPaused: p }); }

  openDoors(dest: DestId) {
    const p = this.placed.find((x) => x.id === dest);
    p?.doors.forEach((d) => gsap.to(d, { open: 1, duration: getState().reducedMotion ? 0 : 1.6, ease: 'power2.inOut' }));
  }
  closeDoors() {
    this.placed.forEach((p) => p.doors.forEach((d) => d.open > 0 && gsap.to(d, { open: 0, duration: 1.2, ease: 'power2.inOut' })));
    setState({ doorOpen: null });
  }

  // ------------------------------------------------------------------ map mode
  openMap(on: boolean) {
    if (on) {
      if (getState().mode === 'explore') { document.exitPointerLock?.(); this.setExplore(false); }
      setState({ mode: 'map', menu: null });
      this.camDamp = 2.4;
    } else {
      const loc = getState().location;
      if (loc === 'plaza') this.toPlaza();
      else this.arrive(loc);
      setState({ mapSelection: null });
      this.setRoute(null);
    }
  }
  previewRoute(dest: DestId | null) {
    setState({ mapSelection: dest });
    if (!dest) return this.setRoute(null);
    const a = this.aion.root.position;
    this.setRoute(findRoute(nearestNode(a.x, a.z), nodeFor(dest)).map(([x, z]) => V(x, 0, z)));
  }

  private setRoute(pts: THREE.Vector3[] | null) {
    if (this.routeLine) { this.scene.remove(this.routeLine); this.routeLine.geometry.dispose(); this.routeLine = null; }
    if (!pts || pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(0.25)), false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, Math.max(40, pts.length * 30), getState().mode === 'map' ? 0.7 : 0.045, 6, false);
    this.routeLine = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#36E4FF').multiplyScalar(1.1), toneMapped: false, transparent: true, opacity: 0.85 }));
    this.scene.add(this.routeLine);
  }

  // ------------------------------------------------------------------ explore mode
  setExplore(on: boolean) {
    if (on) {
      const p = this.camera.position;
      // start on foot near the current view, outside any collider
      const start = getState().location === 'plaza' ? V(PAD[0] - 3, 1.7, PAD[1] - 10) : this.placed.find((x) => x.id === getState().location)!.doorWorld.clone().add(V(0, 1.7, 0)).addScaledVector(this.placed.find((x) => x.id === getState().location)!.front, 14);
      this.camPos.copy(start);
      this.camPosT.copy(start);
      const look = getState().location === 'plaza' ? V(0, 6, 0) : this.placed.find((x) => x.id === getState().location)!.doorWorld;
      this.explore.yaw = Math.atan2(look.x - start.x, look.z - start.z);
      this.explore.pitch = 0.05;
      void p;
      setState({ mode: 'explore' });
      this.closeDoors();
      this.setRoute(null);
    } else if (getState().mode === 'explore') {
      const near = this.nearestDest(this.camera.position);
      setState({ location: near });
      if (near === 'plaza') this.toPlaza(); else this.arrive(near);
    }
  }
  nearestDest(p: THREE.Vector3): DestId {
    let best: DestId = 'plaza', bd = Math.hypot(p.x, p.z) - 20;
    for (const d of DESTINATIONS) if (d.id !== 'plaza') { const dd = Math.hypot(p.x - d.pos[0], p.z - d.pos[1]) - Math.max(...d.half); if (dd < bd) { bd = dd; best = d.id; } }
    return best;
  }
  setJoystick(x: number, y: number) { this.explore.joy.set(x, y); }
  lookDelta(dx: number, dy: number) {
    this.explore.yaw -= dx * 0.0032;
    this.explore.pitch = THREE.MathUtils.clamp(this.explore.pitch - dy * 0.0028, -0.9, 0.9);
  }

  private collide(p: THREE.Vector3) {
    // buildings (oriented boxes)
    for (const d of DESTINATIONS) {
      if (d.id === 'plaza') continue;
      const ry = rotYOf(d);
      const dx = p.x - d.pos[0], dz = p.z - d.pos[1];
      const lx = dx * Math.cos(ry) - dz * Math.sin(ry), lz = dx * Math.sin(ry) + dz * Math.cos(ry);
      const hx = d.half[0] + 0.6, hz = d.half[1] + 0.6;
      if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
        const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
        let nlx = lx, nlz = lz;
        if (px < pz) nlx = Math.sign(lx) * hx; else nlz = Math.sign(lz) * hz;
        p.x = d.pos[0] + nlx * Math.cos(ry) + nlz * Math.sin(ry);
        p.z = d.pos[1] - nlx * Math.sin(ry) + nlz * Math.cos(ry);
      }
    }
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz);
      if (l < c.r + 0.4) { p.x = c.x + (dx / (l || 1)) * (c.r + 0.4); p.z = c.z + (dz / (l || 1)) * (c.r + 0.4); }
    }
    // reflecting pools ring (outside openings) — treat water as non-walkable
    const r = Math.hypot(p.x, p.z);
    if (r > PLAZA_R + 1.2 && r < PLAZA_R + 6.8) {
      const a = Math.atan2(p.x, p.z);
      const open = NAV_NODES.filter((n) => n.id.startsWith('ring')).length; void open;
    }
    const lim = 175;
    if (r > lim) { p.x *= lim / r; p.z *= lim / r; }
  }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const el = this.dom;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.aion.pointerOffset.copy(this.pointer);
      this.aion.pointerActive = 0;
      const mode = getState().mode;
      if (this.dragging) {
        const dx = e.clientX - this.lastPt.x, dy = e.clientY - this.lastPt.y;
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        this.lastPt.set(e.clientX, e.clientY);
        if (mode === 'plaza') {
          this.orbitT.theta -= dx * 0.005;
          this.orbitT.phi = THREE.MathUtils.clamp(this.orbitT.phi - dy * 0.003, 1.0, 1.48);
        } else if (mode === 'explore' && e.pointerType !== 'mouse') this.lookDelta(dx, dy);
      }
    };
    const onDown = (e: PointerEvent) => {
      this.dragging = true; this.dragMoved = 0; this.lastPt.set(e.clientX, e.clientY);
      if (getState().mode === 'explore' && e.pointerType === 'mouse' && document.pointerLockElement !== el) el.requestPointerLock?.();
    };
    const onUp = (e: PointerEvent) => {
      const wasClick = this.dragging && this.dragMoved < 6;
      this.dragging = false;
      if (wasClick) this.click(e);
    };
    const onLockMove = (e: MouseEvent) => { if (document.pointerLockElement === el) this.lookDelta(e.movementX, e.movementY); };
    const onWheel = (e: WheelEvent) => { if (getState().mode === 'plaza') this.orbitT.radius = THREE.MathUtils.clamp(this.orbitT.radius + e.deltaY * 0.02, 16, 44); };
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (down) this.explore.keys.add(k); else this.explore.keys.delete(k);
      if (down && getState().mode === 'explore' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (down && k === 'e' && getState().mode === 'explore') {
        const near = this.nearestDest(this.camera.position);
        if (near !== 'plaza') {
          const pl = this.placed.find((p) => p.id === near)!;
          if (pl.doorWorld.distanceTo(this.camera.position.clone().setY(0)) < 12) { this.openDoors(near); setState({ doorOpen: near, location: near, aionText: DEST[near].aionIntro, aionOpen: true }); }
        }
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true), ku = (e: KeyboardEvent) => onKey(e, false);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    document.addEventListener('mousemove', onLockMove);
    el.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.dispose.push(() => {
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerdown', onDown); window.removeEventListener('pointerup', onUp);
      document.removeEventListener('mousemove', onLockMove); el.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    });
  }

  private pick(objs: THREE.Object3D[]) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objs, false)[0];
  }

  private click(_e: PointerEvent) {
    const s = getState();
    if (s.mode === 'plaza') {
      const hit = this.pick(this.monument.hitTargets);
      if (hit) return this.selectDomain(hit.object.userData.domain as Domain);
      const aionHit = this.pickAion();
      if (aionHit) { setState({ aionOpen: true, aionText: DEST.plaza.aionIntro }); this.aion.gesture('Greet'); return; }
      const b = this.pick(this.placed.map((p) => p.proxy));
      if (b) { this.openMap(true); this.previewRoute(b.object.userData.dest); }
    } else if (s.mode === 'map') {
      const b = this.pick(this.placed.map((p) => p.proxy));
      if (b) this.previewRoute(b.object.userData.dest);
      else if (this.pointer.length() < 0.3) this.previewRoute('plaza');
    } else if (s.mode === 'arrived') {
      if (this.pickAion()) { setState({ aionOpen: true, aionText: DEST[s.location].aionIntro }); this.aion.gesture('Explain'); }
    }
  }
  private pickAion() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const box = new THREE.Box3().setFromCenterAndSize(this.aion.root.position.clone().add(V(0, 1, 0)), V(1.2, 2.1, 1.2));
    return this.raycaster.ray.intersectsBox(box);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt: number) {
    if (!this.ready) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const s = getState();
    const reduced = s.reducedMotion;
    this.monument.update(dt, reduced);
    this.aion.update(dt, this.camera, reduced);
    // ground height: AION stands on the raised arrival platform when on it
    { const ap = this.aion.root.position; const onPad = Math.hypot(ap.x - PAD[0], ap.z - PAD[1]) < 2.7; ap.y = THREE.MathUtils.damp(ap.y, onPad ? 0.44 : 0, 12, dt); }

    // hover on monument terminals
    if (s.mode === 'plaza' && !this.dragging) {
      const hit = this.pick(this.monument.hitTargets);
      const d = (hit?.object.userData.domain as Domain) ?? null;
      if (d !== s.hoverDomain) { setState({ hoverDomain: d }); this.monument.setHover(d); }
      this.dom.style.cursor = d ? 'pointer' : this.pickAion() ? 'pointer' : 'grab';
    } else if (s.mode === 'map') {
      const b = this.pick(this.placed.map((p) => p.proxy));
      this.dom.style.cursor = b ? 'pointer' : 'default';
    } else if (s.hoverDomain) { setState({ hoverDomain: null }); this.monument.setHover(null); }

    // door animation
    for (const p of this.placed) for (const d of p.doors) {
      d.left.position.x = -d.width / 4 - d.open * (d.width / 2 - 0.05);
      d.right.position.x = d.width / 4 + d.open * (d.width / 2 - 0.05);
    }
    // explore proximity doors
    if (s.mode === 'explore') {
      for (const p of this.placed) {
        const near = p.doorWorld.distanceTo(this.camera.position.clone().setY(0)) < 9;
        for (const d of p.doors) d.open = THREE.MathUtils.damp(d.open, near ? 1 : 0, 3, dt);
      }
    }

    this.applyCamera(dt);

    for (const d of this.decals) d.visible = s.mode !== 'map';
    this.hemi.intensity = THREE.MathUtils.damp(this.hemi.intensity, s.mode === 'map' ? 3.2 : 0.9, 2, dt);
    // marker: visitor location
    const markerOn = s.mode === 'map';
    this.marker.visible = markerOn;
    if (markerOn) {
      const ap = this.aion.root.position;
      this.marker.position.set(ap.x, 0.3, ap.z);
      const sc = 3 + Math.sin(this.time * 3) * 0.6;
      this.marker.scale.setScalar(sc);
    }
    if (s.mode === 'guided') setState({ journeyProgress: this.aion.progress });

    // project annotation anchors (KATANA): monument terminals + building labels for map
    const w = this.dom.clientWidth, h = this.dom.clientHeight;
    const proj = (id: string, v: THREE.Vector3) => {
      const p = v.clone().project(this.camera);
      const toCam = v.clone().sub(this.camera.position);
      const inFront = toCam.dot(this.camera.getWorldDirection(new THREE.Vector3())) > 0;
      this.projected[id] = { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible: inFront && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 };
    };
    for (const b of this.monument.branches) proj(b.domain, b.anchor);
    for (const p of this.placed) proj(p.id, V(DEST[p.id].pos[0], p.id === 'communication-tower' ? 56 : 28, DEST[p.id].pos[1]));
    proj('plaza', V(0, 16, 0));
    proj('aion', this.aion.root.position.clone().add(V(0, 2.25, 0)));
    frameHooks.forEach((f) => f());
  }

  /** test/inspection hook: pin the camera to an authored view */
  override: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  view(pos: number[] | null, look?: number[]) { this.override = pos ? { pos: V(...(pos as [number, number, number])), look: V(...(look as [number, number, number])) } : null; }

  private applyCamera(dt: number) {
    const s = getState();
    const cam = this.camera;
    if (this.override) { cam.position.copy(this.override.pos); cam.lookAt(this.override.look); return; }
    if (s.mode === 'plaza') {
      const o = this.orbit, t = this.orbitT;
      o.theta = THREE.MathUtils.damp(o.theta, t.theta, 3, dt);
      o.phi = THREE.MathUtils.damp(o.phi, t.phi, 3, dt);
      o.radius = THREE.MathUtils.damp(o.radius, t.radius, 3, dt);
      const look = s.selectedDomain ? this.monument.anchorOf(s.selectedDomain).clone().multiplyScalar(0.45).setY(8.2) : V(0, 7.2, 0);
      this.camPosT.set(Math.sin(o.theta) * Math.sin(o.phi) * o.radius, Math.cos(o.phi) * o.radius + 1.5, Math.cos(o.theta) * Math.sin(o.phi) * o.radius);
      this.camLookT.copy(look);
    } else if (s.mode === 'guided') {
      const a = this.aion.root.position;
      const ahead = this.aion.lookAhead(9, V());
      const dir = ahead.clone().sub(a).setY(0);
      if (dir.lengthSq() < 0.01) dir.set(Math.sin(this.aion.heading), 0, Math.cos(this.aion.heading));
      dir.normalize();
      this.camPosT.copy(a).addScaledVector(dir, -7.5).add(V(dir.z * 1.6, 3.4, -dir.x * 1.6));
      this.camLookT.copy(ahead).setY(2.2);
    } else if (s.mode === 'map') {
      const small = innerWidth < 760;
      this.camPosT.set(small ? 20 : 40, small ? 600 : 470, small ? -330 : -300);
      this.camLookT.set(small ? 0 : -42, 0, small ? -20 : -12);
    } else if (s.mode === 'explore') {
      const k = this.explore.keys;
      const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + this.explore.joy.y;
      const r = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + this.explore.joy.x;
      const sp = (k.has('shift') ? 9 : 4.6) * dt;
      const fwd = V(Math.sin(this.explore.yaw), 0, Math.cos(this.explore.yaw));
      const right = V(-fwd.z, 0, fwd.x);
      this.camPos.addScaledVector(fwd, f * sp).addScaledVector(right, -r * sp);
      this.collide(this.camPos);
      this.camPos.y = 1.7 + (f || r ? Math.sin(this.time * 9) * 0.03 : 0);
      this.camPosT.copy(this.camPos);
      cam.position.copy(this.camPos);
      cam.lookAt(this.camPos.clone().add(V(Math.sin(this.explore.yaw) * Math.cos(this.explore.pitch), Math.sin(this.explore.pitch), Math.cos(this.explore.yaw) * Math.cos(this.explore.pitch))));
      cam.fov = THREE.MathUtils.damp(cam.fov, 62, 4, dt);
      cam.updateProjectionMatrix();
      return;
    }
    const k = this.camDamp;
    this.camPos.x = THREE.MathUtils.damp(this.camPos.x, this.camPosT.x, k, dt);
    this.camPos.y = THREE.MathUtils.damp(this.camPos.y, this.camPosT.y, k, dt);
    this.camPos.z = THREE.MathUtils.damp(this.camPos.z, this.camPosT.z, k, dt);
    this.camLook.x = THREE.MathUtils.damp(this.camLook.x, this.camLookT.x, k * 1.2, dt);
    this.camLook.y = THREE.MathUtils.damp(this.camLook.y, this.camLookT.y, k * 1.2, dt);
    this.camLook.z = THREE.MathUtils.damp(this.camLook.z, this.camLookT.z, k * 1.2, dt);
    if (dt >= 1) { this.camPos.copy(this.camPosT); this.camLook.copy(this.camLookT); }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    const targetFov = s.mode === 'map' ? 30 : s.mode === 'intro' && !s.started ? 46 : 48;
    cam.fov = THREE.MathUtils.damp(cam.fov, targetFov, 3, dt);
    cam.updateProjectionMatrix();
  }

  /** test hook: advance simulation without rendering so automated screenshots show settled frames */
  settle(steps = 120, dt = 1 / 30) { for (let i = 0; i < steps; i++) this.update(dt); }

  destroy() { this.dispose.forEach((f) => f()); this.cine?.kill(); }
}

function dedupe(pts: THREE.Vector3[]) {
  const out: THREE.Vector3[] = [];
  for (const p of pts) if (!out.length || out[out.length - 1].distanceTo(p) > 1.5) out.push(p);
  return out;
}

// ------------------------------------------------------------------ sky + environment
function skyDome() {
  const geo = new THREE.SphereGeometry(900, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color('#04060a') }, uMid: { value: new THREE.Color('#0d1a2e') }, uHorizon: { value: new THREE.Color('#25344d') }, uGlow: { value: new THREE.Color('#3a3540') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uTop,uMid,uHorizon,uGlow;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float y = vP.y;
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.18, y));
        c = mix(c, uTop, smoothstep(0.18, 0.75, y));
        c += uGlow * exp(-max(y,0.)*22.) * 0.6;
        vec3 q = floor(vP*420.); float s = step(0.9975, h(q)) * smoothstep(0.12, 0.5, y);
        c += vec3(s)*0.55;
        gl_FragColor = vec4(c,1.); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  return m;
}

function nightEnvironment(renderer: THREE.WebGLRenderer) {
  const s = new THREE.Scene();
  s.add(skyDome());
  // a few warm/cool "city light" cards for reflections
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcc99').multiplyScalar(3) });
  const cool = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fc4ff').multiplyScalar(1.5) });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 8), i % 3 ? warm : cool);
    m.position.set(Math.sin(a) * 300, 20, Math.cos(a) * 300);
    m.lookAt(0, 20, 0);
    s.add(m);
  }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color('#2c3a52') }));
  top.position.y = 400; top.rotation.x = Math.PI / 2;
  s.add(top);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return tex;
}

export { M };
