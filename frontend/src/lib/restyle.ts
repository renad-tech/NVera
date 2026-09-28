/** NVera's look system: repaints a found model (material, palette, ground, light).
 *  Everything is procedural - no texture downloads - and survives the GLB export. */

import * as THREE from "three";

export type Material =
  | "original" | "cardboard" | "paper" | "clay" | "wood"
  | "metal" | "toon" | "neon" | "hologram" | "lowpoly";
export type Ground = "none" | "sand" | "grass" | "water" | "snow" | "asphalt" | "paper" | "cardboard";
export type Lighting = "day" | "sunset" | "night";

export interface Restyle {
  material: Material;
  palette: string[];
  ground: Ground;
  sky: string;
  lighting: Lighting;
  fog: boolean;
  bloom: boolean;
  view: "interior" | "exterior";
}

export const DEFAULT_RESTYLE: Restyle = {
  material: "original", palette: [], ground: "none", sky: "#0b0f0c",
  lighting: "day", fog: false, bloom: false, view: "exterior",
};

export const MATERIALS: { value: Material; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "cardboard", label: "Cardboard" },
  { value: "paper", label: "Paper" },
  { value: "clay", label: "Clay" },
  { value: "wood", label: "Wood" },
  { value: "metal", label: "Metal" },
  { value: "toon", label: "Toon" },
  { value: "neon", label: "Neon" },
  { value: "hologram", label: "Hologram" },
  { value: "lowpoly", label: "Low-poly" },
];

export const GROUNDS: { value: Ground; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sand", label: "Sand" },
  { value: "grass", label: "Grass" },
  { value: "water", label: "Water" },
  { value: "snow", label: "Snow" },
  { value: "asphalt", label: "Asphalt" },
  { value: "paper", label: "Paper" },
  { value: "cardboard", label: "Cardboard" },
];

/** Default palettes when the AI didn't pick one. */
const MATERIAL_PALETTES: Partial<Record<Material, string[]>> = {
  cardboard: ["#c89b6d", "#b5875a", "#d6ae82"],
  paper: ["#f4f0e6", "#e9e2d0", "#f7f4ee"],
  clay: ["#d9c6b0", "#cdb59a", "#e2d3c1"],
  wood: ["#b07a4a", "#9a6a3e", "#c48b58"],
  metal: ["#b8bec6", "#8e959e", "#d4d8dd"],
  toon: ["#ff6b6b", "#ffd93d", "#6bcBef", "#8bd17c"],
  neon: ["#00ff88", "#ff2bd6", "#27e0ff", "#ffe600"],
  hologram: ["#40e0ff", "#7af5ff"],
  lowpoly: ["#8bd17c", "#f2c14e", "#e76f51", "#5fa8d3"],
};

export function isOriginal(r: Restyle) {
  return r.material === "original" && r.palette.length === 0 && r.ground === "none";
}

// Procedural textures (drawn once on a canvas, then cached)

const textureCache = new Map<string, THREE.CanvasTexture>();

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function canvasTexture(key: string, draw: (g: CanvasRenderingContext2D, n: number) => void, repeat = 2) {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const n = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  draw(canvas.getContext("2d")!, n);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  return tex;
}

function speckle(g: CanvasRenderingContext2D, n: number, count: number, alpha: number, seed: number, dark = true) {
  const r = rand(seed);
  for (let i = 0; i < count; i++) {
    const v = dark ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    g.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2);
  }
}

const TEXTURES = {
  cardboard: () => canvasTexture("cardboard", (g, n) => {
    g.fillStyle = "#d8b58c"; g.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 8) {          // corrugation ridges
      const grad = g.createLinearGradient(x, 0, x + 8, 0);
      grad.addColorStop(0, "rgba(90,60,30,0.10)");
      grad.addColorStop(0.5, "rgba(255,240,210,0.12)");
      grad.addColorStop(1, "rgba(90,60,30,0.10)");
      g.fillStyle = grad; g.fillRect(x, 0, 8, n);
    }
    speckle(g, n, 9000, 0.18, 7);
    const r = rand(3);                         // a few stains / tape marks
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(120,80,40,${0.05 + r() * 0.06})`;
      g.beginPath(); g.ellipse(r() * n, r() * n, 20 + r() * 50, 10 + r() * 30, r() * 3, 0, Math.PI * 2); g.fill();
    }
  }),
  paper: () => canvasTexture("paper", (g, n) => {
    g.fillStyle = "#fbf8f1"; g.fillRect(0, 0, n, n);
    speckle(g, n, 14000, 0.07, 11);
    const r = rand(5);                         // fibers
    g.strokeStyle = "rgba(0,0,0,0.035)";
    for (let i = 0; i < 400; i++) {
      const x = r() * n, y = r() * n, a = r() * Math.PI;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); g.stroke();
    }
  }, 3),
  wood: () => canvasTexture("wood", (g, n) => {
    g.fillStyle = "#c69463"; g.fillRect(0, 0, n, n);
    const r = rand(9);
    for (let y = 0; y < n; y += 2) {
      const wave = Math.sin(y * 0.05 + Math.sin(y * 0.013) * 3);
      g.fillStyle = `rgba(90,50,20,${0.08 + 0.08 * wave * wave + r() * 0.03})`;
      g.fillRect(0, y, n, 2);
    }
    speckle(g, n, 3000, 0.12, 13);
  }),
  sand: () => canvasTexture("sand", (g, n) => {
    g.fillStyle = "#e3c898"; g.fillRect(0, 0, n, n);
    speckle(g, n, 20000, 0.18, 17); speckle(g, n, 6000, 0.25, 19, false);
  }, 6),
  grass: () => canvasTexture("grass", (g, n) => {
    g.fillStyle = "#5f9e4a"; g.fillRect(0, 0, n, n);
    speckle(g, n, 18000, 0.25, 23); speckle(g, n, 5000, 0.18, 29, false);
  }, 6),
  snow: () => canvasTexture("snow", (g, n) => {
    g.fillStyle = "#f3f7fb"; g.fillRect(0, 0, n, n);
    speckle(g, n, 8000, 0.05, 31);
  }, 6),
  asphalt: () => canvasTexture("asphalt", (g, n) => {
    g.fillStyle = "#3a3c40"; g.fillRect(0, 0, n, n);
    speckle(g, n, 25000, 0.35, 37); speckle(g, n, 8000, 0.12, 41, false);
  }, 6),
};

// Materials

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

let toonGradient: THREE.DataTexture | null = null;
function toonRamp() {
  if (!toonGradient) {
    toonGradient = new THREE.DataTexture(new Uint8Array([80, 160, 230, 255]), 4, 1, THREE.RedFormat);
    toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
    toonGradient.needsUpdate = true;
  }
  return toonGradient;
}

function makeMaterial(r: Restyle, color: THREE.Color, index: number, original: THREE.Material): THREE.Material {
  const side = r.view === "interior" ? THREE.FrontSide : (original.side ?? THREE.FrontSide);
  switch (r.material) {
    case "cardboard":
      return new THREE.MeshStandardMaterial({ map: TEXTURES.cardboard(), color, roughness: 0.95, side });
    case "paper":
      return new THREE.MeshStandardMaterial({ map: TEXTURES.paper(), color, roughness: 1, side });
    case "wood":
      return new THREE.MeshStandardMaterial({ map: TEXTURES.wood(), color, roughness: 0.75, side });
    case "clay":
      return new THREE.MeshStandardMaterial({ color, roughness: 1, side });
    case "metal":
      return new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.28, side });
    case "toon":
      return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), side });
    case "lowpoly":
      return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, side });
    case "neon": {
      const glow = index % 3 === 0; // every third part glows; the rest stays a dark base
      return new THREE.MeshStandardMaterial({
        color: glow ? color : new THREE.Color("#101218"),
        emissive: glow ? color : new THREE.Color("#000000"),
        emissiveIntensity: glow ? 2.2 : 0,
        roughness: 0.4, metalness: 0.3, side,
      });
    }
    case "hologram":
      return new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 1.4, transparent: true, opacity: 0.35,
        depthWrite: false, side: THREE.DoubleSide,
      });
    default:
      return original;
  }
}

/** Repaint every mesh under `root`. Originals are remembered, so looks can change freely. */
export function applyRestyle(root: THREE.Object3D, r: Restyle) {
  const palette = (r.palette.length ? r.palette : MATERIAL_PALETTES[r.material] ?? []).map((c) => new THREE.Color(c));
  const textured = r.material === "cardboard" || r.material === "paper" || r.material === "wood";
  let index = 0;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.userData.nvOriginal) mesh.userData.nvOriginal = mesh.material;
    const originals = ([] as THREE.Material[]).concat(mesh.userData.nvOriginal);

    const next = originals.map((orig) => {
      const i = index++;
      const pick = palette.length ? palette[hashString(mesh.name || String(i)) % palette.length] : null;

      if (r.material === "original") {
        if (!pick && r.view !== "interior") return orig;
        const m = orig.clone() as THREE.MeshStandardMaterial;
        if (pick && m.color) m.color.lerp(pick, 0.3);
        if (r.view === "interior") m.side = THREE.FrontSide;
        return m;
      }
      // Textured materials keep light tints so the texture still shows through.
      const color = pick ? (textured ? new THREE.Color("#ffffff").lerp(pick, 0.45) : pick.clone())
                         : new THREE.Color("#ffffff");
      return makeMaterial(r, color, i, orig);
    });

    const old = ([] as THREE.Material[]).concat(mesh.material);
    mesh.material = Array.isArray(mesh.userData.nvOriginal) ? next : next[0];
    old.forEach((m) => { if (!originals.includes(m) && !next.includes(m)) m.dispose(); });
  });
}

// Ground

export function groundMaterial(ground: Ground): THREE.Material | null {
  switch (ground) {
    case "none": return null;
    case "water":
      return new THREE.MeshStandardMaterial({ color: "#2f7fb5", roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.9 });
    case "paper":
      return new THREE.MeshStandardMaterial({ map: TEXTURES.paper(), roughness: 1 });
    case "cardboard":
      return new THREE.MeshStandardMaterial({ map: TEXTURES.cardboard(), roughness: 0.95 });
    default:
      return new THREE.MeshStandardMaterial({ map: TEXTURES[ground](), roughness: 1 });
  }
}

// Light presets

export const LIGHTS: Record<Lighting, {
  sky: string; ground: string; hemi: number; sun: string; sunI: number; elev: number; env: number; exposure: number;
}> = {
  day:    { sky: "#ffffff", ground: "#8a7f6a", hemi: 0.55, sun: "#fff6e8", sunI: 1.7, elev: 50, env: 0.6, exposure: 1.0 },
  sunset: { sky: "#ffd2a1", ground: "#4a3322", hemi: 0.5, sun: "#ff9a4d", sunI: 2.2, elev: 16, env: 0.45, exposure: 1.0 },
  night:  { sky: "#7d93d6", ground: "#141a30", hemi: 0.5, sun: "#a9bcff", sunI: 1.1, elev: 50, env: 0.4, exposure: 1.0 },
};
