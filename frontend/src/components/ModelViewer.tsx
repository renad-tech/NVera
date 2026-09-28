/** 3D viewer built on react-three-fiber: isometric camera, studio lighting, soft contact
 *  shadows, glow - plus NVera's restyle (material, palette, ground, sky, light). */

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  Bounds, ContactShadows, Environment, Lightformer, OrbitControls, useGLTF, useProgress,
} from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { applyRestyle, groundMaterial, LIGHTS, type Restyle } from "../lib/restyle";
import { exportGlb } from "../lib/exportGlb";

/** Every model is scaled to about this size, so lights, shadows and fog behave the same. */
const TARGET = 10;
const CAMERA_DISTANCE = 30;

export interface ViewerHandle {
  /** Download the restyled model (with its ground) as a .glb. */
  exportGlb: (filename: string) => Promise<void>;
  /** Save exactly what the viewer shows (light, sky, fog, glow included) as a .png. */
  saveImage: (filename: string) => void;
}

interface Loaded {
  object: THREE.Object3D;  // the model, in its original units
  scale: number;           // original units -> viewer units
  footprint: number;       // ground size, viewer units
}

// Model

function Model({ url, restyle, onLoaded }: { url: string; restyle: Restyle; onLoaded: (l: Loaded) => void }) {
  const { scene } = useGLTF(url);

  const loaded = useMemo<Loaded>(() => {
    const object = cloneSkinned(scene);  // the loader caches `scene`; never mutate the shared one
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.set(-center.x, -box.min.y, -center.z);  // centered, standing on y = 0
    const scale = TARGET / (Math.max(size.x, size.y, size.z) || 1);
    return { object, scale, footprint: Math.max(size.x, size.z) * scale * 1.7 };
  }, [scene]);

  useLayoutEffect(() => applyRestyle(loaded.object, restyle), [loaded, restyle]);
  useEffect(() => onLoaded(loaded), [loaded, onLoaded]);

  return (
    <group scale={loaded.scale}>
      <primitive object={loaded.object} />
    </group>
  );
}

// Ground

function Ground({ restyle, size, meshRef }: {
  restyle: Restyle; size: number; meshRef: React.RefObject<THREE.Mesh | null>;
}) {
  const material = useMemo(() => groundMaterial(restyle.ground), [restyle.ground]);
  useEffect(() => () => material?.dispose(), [material]);
  if (!material) return null;
  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position-y={-0.02} material={material} receiveShadow>
      {/* a round "diorama" base rather than a square that fills the whole view */}
      <circleGeometry args={[size / 2, 96]} />
    </mesh>
  );
}

// Lights & environment (procedural - nothing is downloaded)

function Lights({ restyle }: { restyle: Restyle }) {
  const l = LIGHTS[restyle.lighting];
  const elev = THREE.MathUtils.degToRad(l.elev);
  return (
    <>
      <hemisphereLight args={[l.sky, l.ground, l.hemi]} />
      <directionalLight color={l.sun} intensity={l.sunI}
        position={[Math.cos(elev) * 20, Math.sin(elev) * 20, 8]} />
      <Environment resolution={256} environmentIntensity={l.env}>
        <Lightformer form="rect" intensity={2} color={l.sky} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={1.2} color={l.sun} position={[-10, 4, -6]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#ffffff" position={[10, 3, 8]} scale={[8, 3, 1]} />
      </Environment>
    </>
  );
}

// Loading & errors

/** Plain DOM overlay (outside the canvas) - the loader store is global, so no <Html> needed. */
function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="w-40">
        <div className="h-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full transition-all" style={{ width: `${progress}%`, background: "#00ff88" }} />
        </div>
        <p className="font-mono mt-2 text-center text-[10px] uppercase tracking-[0.2em] text-white/40">
          Loading model {Math.round(progress)}%
        </p>
      </div>
    </div>
  );
}

class ViewerErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="grid h-full place-items-center text-sm text-red-300/80">Could not load the 3D model.</div>
      : this.props.children;
  }
}

// Viewer

export default function ModelViewer({ url, restyle, className = "", handleRef, overlay, attribution }: {
  url: string;
  restyle: Restyle;
  /** Written into exported GLBs (glTF "extras") so the creator credit follows the file. */
  attribution?: Record<string, string>;
  className?: string;
  handleRef?: React.RefObject<ViewerHandle | null>;
  /** Buttons shown in the viewer's top-right corner. */
  overlay?: ReactNode;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const groundRef = useRef<THREE.Mesh>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interior = restyle.view === "interior";

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      exportGlb: async (filename) => {
        if (!loaded) throw new Error("The model is still loading — try again in a moment.");
        if (attribution) loaded.object.userData.attribution = attribution;
        const parts: THREE.Object3D[] = [loaded.object];
        if (groundRef.current) {  // ground goes back to the model's original units
          const g = groundRef.current.clone();
          g.scale.setScalar(1 / loaded.scale);
          g.position.y = -0.02 / loaded.scale;
          parts.push(g);
        }
        await exportGlb(parts, filename);
      },
      saveImage: (filename) => {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("The viewer isn't ready yet.");
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
        a.click();
      },
    };
  }, [handleRef, loaded, attribution]);

  const iso = CAMERA_DISTANCE / Math.sqrt(3);
  return (
    <div className={`relative ${className}`}>
      <ViewerErrorBoundary>
        <Canvas
          orthographic
          dpr={[1, 2]}
          gl={{ preserveDrawingBuffer: true }}  // lets "Save image" read the last frame
          onCreated={({ gl }) => { canvasRef.current = gl.domElement; }}
          camera={{ position: [iso, iso * (interior ? 1.9 : 0.85), iso], zoom: 30, near: 0.1, far: 500 }}
          className="cursor-grab active:cursor-grabbing"
        >
          <color attach="background" args={[restyle.sky]} />
          {restyle.fog && <fog attach="fog" args={[restyle.sky, CAMERA_DISTANCE - 6, CAMERA_DISTANCE + 16]} />}
          <Lights restyle={restyle} />

          <Suspense fallback={null}>
            <Bounds fit clip observe margin={interior ? 1.05 : 1.2}>
              <Model url={url} restyle={restyle} onLoaded={setLoaded} />
            </Bounds>
            {loaded && (
              <>
                <Ground restyle={restyle} size={loaded.footprint} meshRef={groundRef} />
                <ContactShadows position-y={0.01} scale={loaded.footprint} far={TARGET}
                  blur={2.4} opacity={restyle.lighting === "night" ? 0.35 : 0.55} resolution={1024} frames={1} />
              </>
            )}
          </Suspense>

          <OrbitControls makeDefault autoRotate={autoRotate} autoRotateSpeed={0.6} enableDamping
            onStart={() => setAutoRotate(false)} minZoom={5} maxZoom={400} />

          <EffectComposer multisampling={4}>
            <Bloom intensity={restyle.bloom ? 1.3 : 0.15} luminanceThreshold={restyle.bloom ? 0.55 : 0.95} mipmapBlur />
            <Vignette offset={0.3} darkness={0.55} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        </Canvas>
      </ViewerErrorBoundary>
      <Loader />
      {overlay && <div className="absolute right-3 top-3 flex gap-2">{overlay}</div>}
    </div>
  );
}
