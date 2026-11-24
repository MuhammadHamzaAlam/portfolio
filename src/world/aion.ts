import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type Clip = 'Idle' | 'Walk' | 'Stop' | 'TurnLeft90' | 'LookAround' | 'Greet' | 'Point' | 'Explain' | 'Present' | 'Speak';
const WALK_SPEED = 1.45; // m/s, matched to the Walk clip stride (1.1 s cycle)

/**
 * AION controller. Uses only clips verified in the supplied GLB:
 * Idle, Walk, Stop, TurnLeft90, LookAround, Greet, Point, Explain, Present, Speak (FaceGlyph scale only).
 */
export class Aion {
  root = new THREE.Group();
  model!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  actions: Partial<Record<Clip, THREE.AnimationAction>> = {};
  current: THREE.AnimationAction | null = null;
  currentName: Clip | null = null;
  ready = false;
  private neck?: THREE.Bone;
  private head?: THREE.Bone;
  private neckRest = new THREE.Quaternion();
  private headRest = new THREE.Quaternion();
  private gaze = new THREE.Vector2(); // smoothed yaw/pitch (radians)
  gazeTarget: THREE.Vector3 | null = null; // world point to attend to
  pointerOffset = new THREE.Vector2(); // -1..1 viewport pointer
  pointerActive = 0; // seconds since pointer moved
  private idleGlance = new THREE.Vector2();
  private glanceTimer = 2;
  // reveal (MOLT-inspired materialisation)
  private revealUniform = { value: -1 };
  private edgeUniform = { value: new THREE.Color('#36E4FF') };
  // path following
  private path: THREE.CurvePath<THREE.Vector3> | null = null;
  private pathLen = 0;
  private pathS = 0;
  private turning = false;
  paused = false;
  onArrive: (() => void) | null = null;
  heading = 0;
  private oneShotTimer = 0;

  async load(url: string) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    this.model = gltf.scene;
    // normalise to 1.9 m
    const box = new THREE.Box3().setFromObject(this.model);
    const h = box.max.y - box.min.y;
    const s = 1.9 / h;
    this.model.scale.setScalar(s);
    this.model.position.y = -box.min.y * s;
    this.root.add(this.model);
    this.model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const patched = mats.map((mm) => this.patchReveal(mm.clone()));
        mesh.material = Array.isArray(mesh.material) ? patched : patched[0];
      }
      if ((o as THREE.Bone).isBone) {
        if (o.name === 'Neck') this.neck = o as THREE.Bone;
        if (o.name === 'Head') this.head = o as THREE.Bone;
      }
    });
    if (this.neck) this.neckRest.copy(this.neck.quaternion);
    if (this.head) this.headRest.copy(this.head.quaternion);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) {
      if (clip.name === 'Walk' || clip.name === 'Stop') {
        // strip horizontal root drift: movement is driven along the route instead
        for (const t of clip.tracks) {
          if (t.name.startsWith('Hips') && t.name.endsWith('.position')) {
            const v = t.values;
            const x0 = v[0], z0 = v[2];
            for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
          }
        }
      }
      const a = this.mixer.clipAction(clip);
      this.actions[clip.name as Clip] = a;
    }
    this.mixer.addEventListener('finished', (e) => {
      const name = (e.action as THREE.AnimationAction).getClip().name;
      if (name === 'Speak') return;
      if (this.path && !this.paused) return;
      if (this.currentName === name && name !== 'Idle') this.play('Idle', 0.5);
    });
    this.play('Idle', 0);
    this.ready = true;
    return this;
  }

  private patchReveal(mat: THREE.Material) {
    const reveal = this.revealUniform, edge = this.edgeUniform;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uReveal = reveal;
      sh.uniforms.uEdge = edge;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vRevealY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvRevealY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vRevealY;\nuniform float uReveal;\nuniform vec3 uEdge;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float band = uReveal - vRevealY;
          if (uReveal > -0.5 && band < 0.0) discard;
          if (uReveal > -0.5 && band < 0.07) gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge * 3.0, 1.0 - band / 0.07);`);
    };
    mat.needsUpdate = true;
    return mat;
  }

  /** reveal height in metres above the platform (0 = hidden, 2 = fully visible); -1 disables */
  setReveal(worldY: number) { this.revealUniform.value = worldY; }

  play(name: Clip, fade = 0.35, once = false) {
    const a = this.actions[name];
    if (!a) return;
    if (name === 'Speak') { a.reset().setLoop(THREE.LoopRepeat, Infinity).play(); return; }
    if (this.current === a && !once) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    this.currentName = name;
  }
  /** non-audio attention indicator: pulses the FaceGlyph while AION presents text */
  presenting(on: boolean) {
    const a = this.actions.Speak;
    if (!a) return;
    if (on) a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
    else a.fadeOut(0.3);
  }
  gesture(name: 'Greet' | 'Point' | 'Explain' | 'Present' | 'LookAround') {
    if (this.path) return;
    this.play(name, 0.35, true);
  }

  setPosition(x: number, z: number, y = 0) { this.root.position.set(x, y, z); }
  face(angle: number) { this.heading = angle; this.root.rotation.y = angle; }
  faceTowards(x: number, z: number) { this.face(Math.atan2(x - this.root.position.x, z - this.root.position.z)); }

  /** walk along route points (y = ground). Smooth CatmullRom; arc-length parameterised. */
  walk(points: THREE.Vector3[], onArrive?: () => void) {
    if (points.length < 2) { onArrive?.(); return; }
    const c = new THREE.CurvePath<THREE.Vector3>();
    // Catmull-Rom through corners, with centripetal param to avoid overshoot
    c.add(new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5));
    this.path = c;
    this.pathLen = c.getLength();
    this.pathS = 0;
    this.onArrive = onArrive ?? null;
    this.paused = false;
    const t0 = c.getTangentAt(0.001);
    const desired = Math.atan2(t0.x, t0.z);
    this.turning = Math.abs(angDiff(desired, this.heading)) > 0.9;
    this.play('Walk', 0.3);
  }
  stopWalking(arrived = true) {
    if (!this.path) return;
    const end = this.path.getPointAt(1);
    this.root.position.set(end.x, 0, end.z);
    this.path = null;
    this.play('Stop', 0.3, true);
    const cb = this.onArrive;
    this.onArrive = null;
    if (arrived) cb?.();
  }
  get walking() { return !!this.path; }
  get progress() { return this.path ? this.pathS / this.pathLen : 0; }
  /** point ahead along the path (for the camera) */
  lookAhead(dist: number, out: THREE.Vector3) {
    if (!this.path) return out.copy(this.root.position);
    return out.copy(this.path.getPointAt(Math.min(1, (this.pathS + dist) / this.pathLen)));
  }

  update(dt: number, camera: THREE.Camera, reduced: boolean) {
    if (!this.ready) return;
    // --- locomotion
    if (this.path && !this.paused) {
      const tangent = this.path.getTangentAt(Math.min(0.999, this.pathS / this.pathLen + 0.0005));
      const desired = Math.atan2(tangent.x, tangent.z);
      const d = angDiff(desired, this.heading);
      if (this.turning) {
        this.heading += Math.sign(d) * Math.min(Math.abs(d), dt * 2.4);
        if (Math.abs(d) < 0.08) this.turning = false;
        this.actions.Walk!.timeScale = 0.6;
      } else {
        this.actions.Walk!.timeScale = 1;
        this.heading += d * Math.min(1, dt * 5);
        this.pathS += WALK_SPEED * dt;
        const p = this.path.getPointAt(Math.min(1, this.pathS / this.pathLen));
        this.root.position.set(p.x, 0, p.z);
        if (this.pathS >= this.pathLen) this.stopWalking(true);
      }
      this.root.rotation.y = this.heading;
    } else if (this.path && this.paused) {
      if (this.currentName === 'Walk') this.play('Idle', 0.4);
    }

    // --- restore head/neck to rest so mixer output is the base (avoid accumulating offsets)
    if (this.neck) this.neck.quaternion.copy(this.neckRest);
    if (this.head) this.head.quaternion.copy(this.headRest);
    this.mixer.update(dt);

    // --- attention / gaze (SCOWLBY-inspired), additive on top of the animation
    if (this.head && this.neck && !reduced) {
      let yaw = 0, pitch = 0;
      const tgt = this.gazeTarget ?? camera.position;
      const local = this.root.worldToLocal(tgt.clone());
      const headY = 1.7;
      yaw = Math.atan2(local.x, local.z);
      pitch = -Math.atan2(local.y - headY, Math.hypot(local.x, local.z));
      if (Math.abs(yaw) > 1.6) yaw = 0; // target behind: don't break the neck
      this.pointerActive += dt;
      if (this.pointerActive < 2.5 && !this.gazeTarget) {
        yaw += -this.pointerOffset.x * 0.35;
        pitch += -this.pointerOffset.y * 0.2;
      } else if (!this.gazeTarget) {
        this.glanceTimer -= dt;
        if (this.glanceTimer < 0) { this.glanceTimer = 2.5 + Math.random() * 3; this.idleGlance.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.15); }
        yaw += this.idleGlance.x; pitch += this.idleGlance.y;
      }
      if (this.path && !this.paused) { yaw *= 0.3; pitch *= 0.3; }
      const maxYaw = THREE.MathUtils.degToRad(18), maxPitch = THREE.MathUtils.degToRad(10);
      yaw = THREE.MathUtils.clamp(yaw, -maxYaw, maxYaw);
      pitch = THREE.MathUtils.clamp(pitch, -maxPitch, maxPitch);
      this.gaze.x = THREE.MathUtils.damp(this.gaze.x, yaw, 5, dt);
      this.gaze.y = THREE.MathUtils.damp(this.gaze.y, pitch, 5, dt);
      const qn = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.gaze.y * 0.4, this.gaze.x * 0.4, 0, 'YXZ'));
      const qh = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.gaze.y * 0.6, this.gaze.x * 0.6, 0, 'YXZ'));
      this.neck.quaternion.multiply(qn);
      this.head.quaternion.multiply(qh);
    }
  }
}

export function angDiff(a: number, b: number) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
