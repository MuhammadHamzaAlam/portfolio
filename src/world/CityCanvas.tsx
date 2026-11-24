import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CityRuntime } from './runtime';
import { getState, useStore } from '../state/store';

export let runtime: CityRuntime | null = null;

function Runtime({ onReady }: { onReady: () => void }) {
  const { scene, camera, gl } = useThree();
  const ref = useRef<CityRuntime | null>(null);
  useEffect(() => {
    const rt = new CityRuntime(scene, camera as THREE.PerspectiveCamera, gl);
    ref.current = rt;
    runtime = rt;
    (window as any).__hrz = rt; // test hook for automated browser verification
    rt.init(getState().quality).then(onReady).catch((e) => { console.error(e); (window as any).__hrzError = String(e); });
    return () => { rt.destroy(); runtime = null; };
  }, []);
  useFrame((_, dt) => {
    const rt = ref.current;
    if (!rt) return;
    rt.update(dt);
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density = THREE.MathUtils.damp(fog.density, getState().mode === 'map' ? 0.0011 : 0.0032, 2, dt);
  });
  return null;
}

export default function CityCanvas({ onReady }: { onReady: () => void }) {
  const quality = useStore((s) => s.quality);
  const dpr = quality === 'high' ? Math.min(window.devicePixelRatio, 1.75) : quality === 'balanced' ? Math.min(window.devicePixelRatio, 1.25) : 0.85;
  return (
    <Canvas
      className="city-canvas"
      shadows={quality !== 'low' ? { type: THREE.PCFSoftShadowMap } : false}
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, preserveDrawingBuffer: true }}
      camera={{ fov: 46, near: 0.2, far: 1600, position: [0, 1.75, -152] }}
      aria-label="HRZ AI Innovation City — interactive 3D view. All content is also available through the Menu."
    >
      <Runtime onReady={onReady} />
      {quality !== 'low' ? (
        <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
          <Bloom mipmapBlur intensity={0.55} luminanceThreshold={1.0} luminanceSmoothing={0.2} radius={0.6} />
          <Vignette offset={0.25} darkness={0.55} />
          {quality === 'balanced' ? <SMAA /> : <></>}
        </EffectComposer>
      ) : <></>}
    </Canvas>
  );
}
