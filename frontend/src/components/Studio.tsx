/** NVera Studio: one sentence -> a small 3D scene built from several free models.
 *  Nemotron 3 Ultra plans the objects and their places, NVera finds each one, and the scene shares
 *  one look. Click an object to move, turn, resize, copy or delete it; download everything as a
 *  ZIP with the scene (.glb) and a CREDITS.txt for every creator. */

import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, OrbitControls, TransformControls, useGLTF, useProgress } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Lights } from "./ModelViewer";
import { applyRestyle, DEFAULT_RESTYLE, groundMaterial, GROUNDS, MATERIALS, type Restyle } from "../lib/restyle";
import { findSceneItem, planScene, serverUrl, type SceneItemResult } from "../lib/api";
import { glbBlob, saveBlob } from "../lib/exportGlb";
import { makeZip } from "../lib/zip";
import { creditsText } from "../lib/credits";
import { withSpecGloss } from "../lib/specGloss";
import { modelBounds } from "../lib/fitModel";

const NEON = "#4fd69c";
const EXAMPLES = [
  "a cozy café at sunset with tables and plants",
  "a small park with benches, trees and a fountain",
  "a cardboard medieval village",
  "a campfire in a forest at night",
];

type Status = "searching" | "ready" | "failed";

interface Item {
  key: string;
  name: string;
  query: string;
  size_m: number;
  status: Status;
  result?: SceneItemResult;
  error?: string;
  tried: string[];  // model ids already used, skipped by "Try another"
}

interface Instance { id: string; itemKey: string; x: number; z: number; rot: number; scale: number }

/** A model found in the Finder, sent to the Studio. */
export interface StudioIncoming { result: SceneItemResult; size_m: number }

let counter = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;
const toRad = THREE.MathUtils.degToRad;
/** File-safe name: "Cozy café" -> "Cozy_cafe". */
const slug = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "NVera_scene";

// Small UI pieces

function Chip({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="rounded-full px-2.5 py-1 text-[11px] capitalize transition-colors"
      style={{
        background: active ? NEON : "rgba(255,255,255,0.03)",
        color: active ? "#000" : "rgba(255,255,255,0.6)",
        border: `1px solid ${active ? NEON : "rgba(255,255,255,0.08)"}`,
        fontWeight: active ? 600 : 400,
      }}>
      {children}
    </button>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="font-mono mb-2 text-[10px] uppercase tracking-[0.22em]" style={{ color: "rgba(79,214,156,0.6)" }}>{children}</p>;
}

function Dot({ status }: { status: Status }) {
  const color = status === "ready" ? NEON : status === "failed" ? "#ff7a7a" : "#ffd36a";
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${status === "searching" ? "animate-pulse" : ""}`} style={{ background: color }} />;
}

// 3D

class ObjectBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function SceneObject({ inst, item, restyle, onSelect }: {
  inst: Instance; item: Item; restyle: Restyle;
  onSelect: (id: string) => void;
}) {
  const result = item.result!;
  const { scene } = useGLTF(serverUrl(result.glb_path), undefined, undefined, withSpecGloss);

  // Each instance gets its own copy, standing on the ground, scaled to the object's real size.
  const object = useMemo(() => {
    const model = cloneSkinned(scene);
    const box = modelBounds(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    const fit = new THREE.Group();
    fit.add(model);
    fit.scale.setScalar(item.size_m / (Math.max(size.x, size.y, size.z) || 1));
    return fit;
  }, [scene, item.size_m]);

  useLayoutEffect(() => applyRestyle(object, restyle), [object, restyle]);

  const attribution = useMemo(() => ({
    title: result.model.name, author: result.model.author, author_url: result.model.author_url,
    license: result.model.license, source: result.model.source_label, source_url: result.model.url,
  }), [result]);

  return (
    <group name={item.name} position={[inst.x, 0, inst.z]} rotation-y={toRad(inst.rot)} scale={inst.scale}
      userData={{ nvInstance: inst.id, attribution }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(inst.id); }}>
      <primitive object={object} />
    </group>
  );
}

function Ground({ area, restyle, meshRef }: { area: number; restyle: Restyle; meshRef: React.RefObject<THREE.Mesh | null> }) {
  const material = useMemo(
    () => groundMaterial(restyle.ground) ?? new THREE.MeshStandardMaterial({ color: "#2b302c", roughness: 1 }),
    [restyle.ground],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh ref={meshRef} name="Ground" rotation-x={-Math.PI / 2} position-y={-0.01} material={material} receiveShadow>
      <planeGeometry args={[area, area]} />
    </mesh>
  );
}

/** Frames the whole ground whenever the scene size changes. */
function CameraFit({ area }: { area: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.zoom = Math.min(size.width, size.height) / (area * 1.55);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, area]);
  return null;
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 w-48 -translate-x-1/2">
      <div className="h-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div className="h-full transition-all" style={{ width: `${progress}%`, background: NEON }} />
      </div>
      <p className="font-mono mt-1.5 text-center text-[10px] uppercase tracking-[0.2em] text-white/50">Loading models {Math.round(progress)}%</p>
    </div>
  );
}

/** Move / turn handles for the selected object. Looks the object up in the live scene on every
 *  render, so the handles never hold on to an object that has left the scene. */
function SelectionGizmo({ id, mode, onDone }: { id: string; mode: "translate" | "rotate"; onDone: (obj: THREE.Object3D) => void }) {
  const scene = useThree((s) => s.scene);
  let target: THREE.Object3D | undefined;
  scene.traverse((o) => { if (!target && o.userData.nvInstance === id) target = o; });
  if (!target) return null;
  const obj = target;
  return (
    <TransformControls object={obj} mode={mode} size={1}
      showY={mode === "rotate"} showX={mode === "translate"} showZ={mode === "translate"}
      onMouseUp={() => onDone(obj)} />
  );
}

// Saved in the browser, so the scene survives leaving the Studio or reloading the page

const SAVE_KEY = "nvera-studio-scene";

interface Saved { title: string; area: number; restyle: Restyle; items: Item[]; instances: Instance[] }

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    // Searches that were still running when the page closed can't resume - keep found objects only.
    saved.items = saved.items.filter((it) => it.status === "ready" && it.result);
    saved.instances = saved.instances.filter((o) => saved.items.some((it) => it.key === o.itemKey));
    return saved.items.length ? saved : null;
  } catch {
    return null;
  }
}

// Page

export default function Studio({ onBack, incoming, onIncomingUsed }: {
  onBack: () => void;
  incoming: StudioIncoming[];
  onIncomingUsed: () => void;
}) {
  const [saved] = useState(loadSaved);
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState(saved?.title ?? "My NVera scene");
  const [area, setArea] = useState(saved?.area ?? 12);
  const [restyle, setRestyle] = useState<Restyle>(saved?.restyle ?? DEFAULT_RESTYLE);
  const [items, setItems] = useState<Item[]>(saved?.items ?? []);
  const [instances, setInstances] = useState<Instance[]>(saved?.instances ?? []);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"translate" | "rotate">("translate");
  const [addName, setAddName] = useState("");
  const [saving, setSaving] = useState(false);
  const groundRef = useRef<THREE.Mesh>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    try {
      if (items.length) localStorage.setItem(SAVE_KEY, JSON.stringify({ title, area, restyle, items, instances }));
      else localStorage.removeItem(SAVE_KEY);
    } catch { /* private mode or full storage: the scene just won't be remembered */ }
  }, [title, area, restyle, items, instances]);

  const updateItem = useCallback((key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it))), []);

  /** Find (or re-find) the model for one object. */
  const runItem = useCallback(async (key: string) => {
    const item = itemsRef.current.find((it) => it.key === key);
    if (!item) return;
    updateItem(key, { status: "searching", error: undefined });
    try {
      const result = await findSceneItem(item.name, item.query, item.tried);
      setItems((list) => list.map((it) => it.key === key
        ? { ...it, status: "ready", result, tried: [...it.tried, result.model.id] } : it));
    } catch (e) {
      updateItem(key, { status: "failed", error: (e as Error).message });
    }
  }, [updateItem]);

  /** Search several objects, three at a time. */
  const runAll = useCallback(async (keys: string[]) => {
    let next = 0;
    const worker = async () => { while (next < keys.length) await runItem(keys[next++]); };
    await Promise.all([worker(), worker(), worker()]);
  }, [runItem]);

  // Models sent from the Finder ("Add to Studio"). Each one is taken exactly once.
  const taken = useRef(new WeakSet<StudioIncoming>());
  useEffect(() => {
    const fresh = incoming.filter((x) => !taken.current.has(x));
    if (!fresh.length) return;
    fresh.forEach((x) => taken.current.add(x));
    const added: Item[] = fresh.map(({ result, size_m }) => ({
      key: uid("i"), name: result.name, query: result.name, size_m, status: "ready", result, tried: [result.model.id],
    }));
    setItems((list) => [...list, ...added]);
    setInstances((list) => [...list, ...added.map((it, i) => ({
      id: uid("o"), itemKey: it.key, x: (list.length + i) % 2 ? 2 : -2, z: 0, rot: 0, scale: 1,
    }))]);
    setArea((a) => Math.max(a, ...added.map((it) => it.size_m * 2.5)));
    onIncomingUsed();
  }, [incoming, onIncomingUsed]);

  async function build(text: string) {
    const request = text.trim();
    if (!request || planning) return;
    setPlanning(true);
    setError("");
    setSelected(null);
    try {
      const plan = await planScene(request);
      const planned: Item[] = plan.items.map((it) => ({
        key: uid("i"), name: it.name, query: it.query, size_m: it.size_m, status: "searching", tried: [],
      }));
      setTitle(plan.title);
      setArea(plan.area_m);
      setRestyle(plan.restyle);
      setItems(planned);
      itemsRef.current = planned;
      setInstances(plan.items.flatMap((it, i) => it.placements.map((p) => ({
        id: uid("o"), itemKey: planned[i].key, x: p.x, z: p.z, rot: p.rot, scale: 1,
      }))));
      setPlanning(false);
      await runAll(planned.map((it) => it.key));
    } catch (e) {
      setError((e as Error).message);
      setPlanning(false);
    }
  }

  async function addObject() {
    const name = addName.trim();
    if (name.length < 2) return;
    const item: Item = { key: uid("i"), name, query: name, size_m: 1.5, status: "searching", tried: [] };
    setItems((list) => [...list, item]);
    itemsRef.current = [...itemsRef.current, item];
    setInstances((list) => [...list, { id: uid("o"), itemKey: item.key, x: 0, z: 0, rot: 0, scale: 1 }]);
    setAddName("");
    await runItem(item.key);
  }

  function removeItem(key: string) {
    setItems((list) => list.filter((it) => it.key !== key));
    setInstances((list) => list.filter((o) => o.itemKey !== key));
    setSelected(null);
  }

  function copyInstance(id: string) {
    const src = instances.find((o) => o.id === id);
    if (!src) return;
    const copy = { ...src, id: uid("o"), x: src.x + 1.2, z: src.z + 1.2 };
    setInstances((list) => [...list, copy]);
  }

  function updateInstance(id: string, patch: Partial<Instance>) {
    setInstances((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function deleteInstance(id: string) {
    setInstances((list) => list.filter((o) => o.id !== id));
    setSelected(null);
  }

  /** The handles moved the object: write it back (always on the ground, turning around y only). */
  function syncSelected(o: THREE.Object3D) {
    if (!selected) return;
    o.position.y = 0;
    updateInstance(selected, {
      x: o.position.x, z: o.position.z,
      rot: THREE.MathUtils.radToDeg(o.rotation.y),
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selected || (e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "Delete" || e.key === "Backspace") deleteInstance(selected);
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const readyItems = items.filter((it) => it.status === "ready" && it.result);
  const placed = instances.filter((o) => readyItems.some((it) => it.key === o.itemKey));
  const searching = items.some((it) => it.status === "searching");

  async function downloadZip() {
    const scene = sceneRef.current;
    if (!scene || !placed.length) return;
    setSaving(true);
    try {
      const parts: THREE.Object3D[] = [];
      scene.traverse((obj) => { if (obj.userData.nvInstance) parts.push(obj); });
      if (groundRef.current) parts.push(groundRef.current);
      const glb = await glbBlob(parts);
      const credits = creditsText(title, readyItems.map((it) => it.result!.model));
      const name = slug(title);
      saveBlob(await makeZip([
        { name: `${name}.glb`, data: glb },
        { name: "CREDITS.txt", data: credits },
      ]), `${name}_NVera.zip`);
    } catch (e) {
      setError(`Couldn't export the scene: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function saveImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${slug(title)}.png`;
    a.click();
  }

  const selectedInst = selected ? instances.find((o) => o.id === selected) : undefined;
  const layoutKey = placed.map((o) => `${o.id}:${o.x.toFixed(2)},${o.z.toFixed(2)},${o.rot.toFixed(1)},${o.scale.toFixed(2)}`).join("|")
    + `|${area}|${readyItems.map((it) => it.result!.glb_path).join(",")}`;
  const iso = 40 / Math.sqrt(3);

  return (
    <div className="flex min-h-screen flex-col bg-void font-body text-white lg:h-screen lg:overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-black"><span className="text-neon">NV</span>era</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">Studio</span>
        </div>
        <button onClick={onBack} className="rounded-full px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
          ← Back to finder
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Side panel */}
        <aside className="order-2 w-full shrink-0 space-y-5 overflow-y-auto px-4 py-5 sm:px-6 lg:order-1 lg:w-[360px]"
          style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <Label>Describe a scene</Label>
            <textarea id="studio-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); build(prompt); } }}
              placeholder="e.g. a cozy café at sunset with tables and plants"
              className="w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-[rgba(79,214,156,0.4)]"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
            <button onClick={() => build(prompt)} disabled={planning || searching || prompt.trim().length < 2}
              className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: NEON, color: "#000" }}>
              {planning ? "Planning the scene…" : searching ? "Finding the models…" : "Build scene"}
            </button>
            {items.length > 0 && !planning && !searching && (
              <button onClick={() => { setItems([]); setInstances([]); setSelected(null); setTitle("My NVera scene"); setRestyle(DEFAULT_RESTYLE); setArea(12); setError(""); }}
                className="mt-2 w-full rounded-xl px-3 py-2 text-xs text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                Start a new scene
              </button>
            )}
            {!items.length && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => { setPrompt(ex); build(ex); }} disabled={planning}
                    className="rounded-full px-2.5 py-1 text-left text-[11px] text-white/55 transition-colors hover:bg-white/5 hover:text-white/80"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    {ex}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="mt-2 text-xs" style={{ color: "#ff9a9a" }}>{error}</p>}
          </div>

          {items.length > 0 && (
            <div>
              <Label>Objects · {title}</Label>
              <ul className="space-y-2">
                {items.map((it) => {
                  const count = instances.filter((o) => o.itemKey === it.key).length;
                  const m = it.result?.model;
                  return (
                    <li key={it.key} className="flex gap-2.5 rounded-xl px-3 py-2.5"
                      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <Dot status={it.status} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white/85">
                          {it.name}{count > 1 && <span className="text-white/40"> ×{count}</span>}
                        </p>
                        {it.status === "searching" && <p className="text-[11px] text-white/40">Nemotron VL is picking the best free model…</p>}
                        {it.status === "failed" && <p className="text-[11px]" style={{ color: "#ff9a9a" }}>{it.error}</p>}
                        {m && it.status === "ready" && (
                          <p className="truncate text-[11px] text-white/45" title={`${m.name} by ${m.author} · ${m.license}`}>
                            {m.name} · by{" "}
                            <a href={m.author_url} target="_blank" rel="noreferrer" className="underline decoration-white/20 hover:text-white/70">{m.author}</a>
                            {" · "}{m.license} · {m.source_label}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {it.status !== "searching" && (
                            <button onClick={() => runItem(it.key)} className="rounded-md px-2 py-0.5 text-[11px] text-white/55 hover:bg-white/5 hover:text-white/80"
                              style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                              {it.status === "failed" ? "Try again" : "Try another"}
                            </button>
                          )}
                          {it.status === "ready" && (
                            <button onClick={() => setInstances((list) => [...list, { id: uid("o"), itemKey: it.key, x: 0, z: 0, rot: 0, scale: 1 }])}
                              className="rounded-md px-2 py-0.5 text-[11px] text-white/55 hover:bg-white/5 hover:text-white/80"
                              style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                              + Add one
                            </button>
                          )}
                          <button onClick={() => removeItem(it.key)} className="rounded-md px-2 py-0.5 text-[11px] text-white/40 hover:bg-white/5 hover:text-white/70"
                            style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex items-center gap-2 rounded-xl px-2 py-1.5" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <input id="studio-add" value={addName} onChange={(e) => setAddName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addObject(); }}
                  placeholder="Add an object, e.g. a wooden bench"
                  className="min-w-0 flex-1 bg-transparent px-1 text-xs text-white/85 outline-none placeholder:text-white/25" />
                <button onClick={addObject} disabled={addName.trim().length < 2}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-30" style={{ background: NEON, color: "#000" }}>
                  Add
                </button>
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div>
              <Label>One look for the whole scene</Label>
              <div className="flex flex-wrap gap-1.5">
                {MATERIALS.map((m) => (
                  <Chip key={m.value} active={restyle.material === m.value}
                    onClick={() => setRestyle({ ...restyle, material: m.value, palette: m.value === restyle.material ? restyle.palette : [],
                      bloom: m.value === "neon" || m.value === "hologram" || restyle.lighting === "night" })}>
                    {m.label}
                  </Chip>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">Light</span>
                  {(["day", "sunset", "night"] as const).map((l) => (
                    <Chip key={l} active={restyle.lighting === l}
                      onClick={() => setRestyle({ ...restyle, lighting: l, bloom: l === "night" || restyle.material === "neon" || restyle.material === "hologram" })}>
                      {l}
                    </Chip>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="studio-ground" className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">Ground</label>
                  <select id="studio-ground" value={restyle.ground} onChange={(e) => setRestyle({ ...restyle, ground: e.target.value as Restyle["ground"] })}
                    className="rounded-full bg-transparent px-2 py-1 text-[11px] text-white/60 outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    {GROUNDS.map((g) => <option key={g.value} value={g.value} className="bg-black">{g.value === "none" ? "Plain" : g.label}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-white/50">
                  <input id="studio-fog" type="checkbox" checked={restyle.fog} onChange={(e) => setRestyle({ ...restyle, fog: e.target.checked })} />
                  Fog
                </label>
              </div>
            </div>
          )}

          {placed.length > 0 && (
            <div>
              <Label>Download</Label>
              <div className="flex flex-wrap gap-2">
                <button onClick={downloadZip} disabled={saving || searching}
                  className="rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
                  style={{ background: NEON, color: "#000" }}>
                  {saving ? "Preparing…" : "Download scene (.zip)"}
                </button>
                <button onClick={saveImage} className="rounded-lg px-3 py-2 text-xs text-white/55 hover:bg-white/5"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                  Save image
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                The ZIP has the whole scene as one GLB (with your look) and CREDITS.txt: every model, its creator and
                what its license asks of you. The credits are also written inside the GLB.
              </p>
            </div>
          )}
        </aside>

        {/* Scene */}
        <section className="relative order-1 h-[62vh] min-h-[360px] flex-none lg:order-2 lg:h-auto lg:min-h-0 lg:flex-1">
          <Canvas orthographic dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}
            camera={{ position: [iso, iso * 0.9, iso], zoom: 20, near: 0.1, far: 1000 }}
            onCreated={({ gl, scene }) => { canvasRef.current = gl.domElement; sceneRef.current = scene; }}
            onPointerMissed={() => setSelected(null)}>
            <color attach="background" args={[restyle.sky]} />
            {restyle.fog && <fog attach="fog" args={[restyle.sky, 40, 40 + area * 2]} />}
            <Lights restyle={restyle} />
            <CameraFit area={area} />
            <Ground area={area} restyle={restyle} meshRef={groundRef} />
            {/* Redrawn for a moment after every change (and while models load), then frozen. */}
            <ContactShadows key={layoutKey} position-y={0.005} scale={area} far={12} blur={2.2}
              opacity={restyle.lighting === "night" ? 0.35 : 0.5} resolution={1024} frames={90} />
            {placed.map((inst) => {
              const item = readyItems.find((it) => it.key === inst.itemKey)!;
              return (
                <ObjectBoundary key={`${inst.id}-${item.result!.glb_path}`}
                  onError={() => updateItem(item.key, { status: "failed", error: "Couldn't load this model. Try another." })}>
                  <Suspense fallback={null}>
                    <SceneObject inst={inst} item={item} restyle={restyle} onSelect={setSelected} />
                  </Suspense>
                </ObjectBoundary>
              );
            })}
            {selectedInst && <SelectionGizmo key={selected} id={selectedInst.id} mode={mode} onDone={syncSelected} />}
            <OrbitControls makeDefault enableDamping minZoom={2} maxZoom={400} maxPolarAngle={Math.PI / 2.1} />
            <EffectComposer multisampling={4}>
              <Bloom intensity={restyle.bloom ? 1.3 : 0.15} luminanceThreshold={restyle.bloom ? 0.55 : 0.95} mipmapBlur />
              <Vignette offset={0.3} darkness={0.5} />
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            </EffectComposer>
          </Canvas>
          <LoadingOverlay />

          {!items.length && !planning && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
              <div>
                <p className="font-display text-3xl font-black uppercase tracking-tight text-white/85 sm:text-4xl">Build a whole scene</p>
                <p className="mt-2 max-w-sm text-sm text-white/50">
                  Describe it in one sentence. Nemotron plans the objects and where they go, and NVera finds a free model for each one.
                </p>
              </div>
            </div>
          )}
          {planning && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <p className="font-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.2em]"
                style={{ background: "rgba(0,0,0,0.6)", color: NEON }}>
                Nemotron 3 Ultra is planning the scene…
              </p>
            </div>
          )}

          {/* Selected object toolbar */}
          {selectedInst && (
            <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 backdrop-blur"
              style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <Chip active={mode === "translate"} onClick={() => setMode("translate")}>Move</Chip>
              <Chip active={mode === "rotate"} onClick={() => setMode("rotate")}>Turn</Chip>
              <Chip onClick={() => updateInstance(selectedInst.id, { scale: Math.max(0.2, selectedInst.scale / 1.2) })} title="Smaller">−</Chip>
              <Chip onClick={() => updateInstance(selectedInst.id, { scale: Math.min(6, selectedInst.scale * 1.2) })} title="Bigger">+</Chip>
              <Chip onClick={() => copyInstance(selectedInst.id)}>Copy</Chip>
              <Chip onClick={() => deleteInstance(selectedInst.id)}>Delete</Chip>
            </div>
          )}
          {placed.length > 0 && !selected && (
            <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] text-white/60"
              style={{ background: "rgba(0,0,0,0.45)" }}>
              Click an object to move, turn or resize it
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
