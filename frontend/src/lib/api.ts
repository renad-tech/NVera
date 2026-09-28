/** Client for the NVera backend (see backend/main.py). */

import type { Restyle } from "./restyle";

// Same origin everywhere: in dev Vite proxies /api to the backend (vite.config.ts); in production
// the backend serves this site. VITE_API_BASE_URL can still override it if ever needed.
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, "");

// Access code (public deployments)

const CODE_KEY = "nvera-access-code";

function storedCode(): string {
  try { return localStorage.getItem(CODE_KEY) ?? ""; } catch { return ""; }
}

/** POST JSON with the access code; if the server asks for one, prompt once and retry. */
async function post(path: string, body: unknown): Promise<Response> {
  const send = () => fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Code": storedCode() },
    body: JSON.stringify(body),
  });
  let res = await send();
  if (res.status === 401) {
    const code = window.prompt("This NVera demo needs an access code:")?.trim();
    if (!code) return res;
    try { localStorage.setItem(CODE_KEY, code); } catch { /* private mode: code lasts this request */ }
    res = await send();
    if (res.status === 401) { try { localStorage.removeItem(CODE_KEY); } catch { /* ignore */ } }
  }
  return res;
}

/** Turns a failed response into a readable error (uses the server's `detail` when present). */
async function failure(res: Response): Promise<Error> {
  const detail = await res.json().then((d) => d?.detail).catch(() => null);
  return new Error(typeof detail === "string" ? detail : `Server error (${res.status})`);
}

export type StepName = "analyze" | "research" | "search" | "inspect" | "download";

/** Per-search execution record - "How NVera decided". */
export interface SearchTrace {
  steps: { key: string; agent: string; model: string; seconds: number; usd: number; tavily_credits: number }[];
  total_seconds: number;
  candidates: {
    id: string; name: string; source_label: string; found_by?: string | null; thumbnail: string | null;
    score: number | null; reason: string; editable: boolean; picked: boolean;
  }[];
  mock?: boolean;
}

export interface TavilyResearch {
  query: string;
  answer: string;
  images: { url: string; description: string }[];
  sources: { title: string; url: string }[];
}

/** Chosen by the user before every search (see SettingsPanel). */
export interface SearchSettings {
  space_size: "small" | "medium" | "large";
  color_mode: "colored" | "monochrome";
  /** JPEG data URLs, already shrunk in the browser. */
  reference_images: string[];
}

export const MAX_REFERENCE_IMAGES = 2;

export const DEFAULT_SETTINGS: SearchSettings = {
  space_size: "medium",
  color_mode: "colored",
  reference_images: [],
};

export interface FindResult {
  /** Used to send 👍/👎 feedback that NVera remembers. */
  search_id: string;
  prompt: string;
  /** Settings the search used (images are counted, not echoed). */
  settings: { space_size: SearchSettings["space_size"]; color_mode: SearchSettings["color_mode"]; reference_images: number };
  scene: {
    subject: string; setting: string; search_query: string; must_have: string[]; restyle: Restyle;
    /** What Tavily found about the real thing: photos + a short answer + sources. */
    research?: TavilyResearch;
    trace?: SearchTrace;
  };
  model: {
    id: string;
    source: "sketchfab" | "polyhaven" | "smithsonian" | "polypizza" | "threejs" | "web";
    /** Sketchfab model downloaded from Objaverse (Allen AI's open CC-licensed copy). */
    via_objaverse?: boolean;
    source_label: string;
    /** "tavily" when Tavily's web search found this model. */
    found_by?: "tavily";
    name: string;
    author: string;
    author_url: string;
    license: string;
    faces: number | null;
    url: string;
    size_mb: number;
  };
  /** Local GLB (null when the model may only be shown in Sketchfab's viewer). */
  glb_path: string | null;
  /** Sketchfab's official embed viewer - used when NVera may not download the model (API terms). */
  embed_url?: string | null;
  /** Remembered ranking, for follow-ups like "get an editable alternative". */
  job_id?: string;
  /** Best model NVera may download and edit, when the winner is view-only. */
  alternative?: ModelSummary | null;
  quality: { score: number; reason: string; has: string[]; missing: string[] };
  cost: { nebius_usd: number; tavily_credits: number };
  /** True when the backend runs with NVERA_MOCK=1 (always returns the same sample model). */
  mock?: boolean;
}

export interface ModelSummary {
  name: string;
  source_label: string;
  size_mb: number;
  score: number;
  reason: string;
}

/** The best model is large: the user decides whether to download it. */
export interface ConfirmRequest {
  job_id: string;
  model: ModelSummary;
  alternative: ModelSummary | null;
}

export type Outcome =
  | { kind: "result"; data: FindResult }
  | { kind: "confirm"; data: ConfirmRequest };

type Event =
  | { type: "step"; step: StepName; message: string }
  | { type: "result"; data: FindResult }
  | { type: "confirm"; data: ConfirmRequest }
  | { type: "error"; message: string };

type OnStep = (step: StepName, message: string) => void;

export function modelUrl(result: FindResult) {
  return `${SERVER_BASE}${result.glb_path ?? ""}`;
}

/** POST and read the NDJSON stream until a result / confirm / error event. */
async function streamOutcome(path: string, body: unknown, onStep: OnStep): Promise<Outcome> {
  const res = await post(path, body);
  if (!res.ok || !res.body) throw await failure(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as Event;
      if (event.type === "step") onStep(event.step, event.message);
      else if (event.type === "result") return { kind: "result", data: event.data };
      else if (event.type === "confirm") return { kind: "confirm", data: event.data };
      else if (event.type === "error") throw new Error(event.message);
    }
  }
  throw new Error("Connection closed before the result arrived");
}

/** Run the full search pipeline for a prompt with the user's settings. */
export function findModel(prompt: string, settings: SearchSettings, onStep: OnStep): Promise<Outcome> {
  return streamOutcome("/find", { prompt, settings }, onStep);
}

export type Choice = "large" | "smaller" | "editable";

/** Follow-up on a remembered ranking: download the large best model, a smaller one,
 *  or the best editable one (instead of a view-only Sketchfab winner). No AI calls. */
export function confirmDownload(jobId: string, choice: Choice, onStep: OnStep): Promise<Outcome> {
  return streamOutcome("/confirm", { job_id: jobId, choice }, onStep);
}

/** Download the GLB as a file (the `download` attribute is ignored cross-origin). */
export async function downloadModel(result: FindResult) {
  const blob = await (await fetch(modelUrl(result))).blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${result.model.name.replace(/[^\w-]+/g, "_") || "NVera-model"}.glb`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Chat edit of the look (material, colors, ground, sky, light). ~$0.001, free in mock mode. */
export async function restyleModel(
  result: FindResult, current: Restyle, instruction: string,
): Promise<{ restyle: Restyle; message: string }> {
  const res = await post("/restyle", {
    prompt: result.prompt,
    subject: `${result.model.name} (${result.scene.subject})`,
    restyle: current,
    instruction,
  });
  if (!res.ok) throw await failure(res);
  return res.json();
}

/** 👍/👎 on a result - NVera remembers it and learns for similar future searches. */
export async function sendFeedback(searchId: string, rating: "up" | "down", note = "") {
  const res = await post("/feedback", { search_id: searchId, rating, note });
  if (!res.ok) throw await failure(res);
}

export interface UsageStatus {
  searches_left: number;
  nebius: { spent_usd: number; budget_usd: number; remaining_usd: number; avg_search_usd: number; searches_left: number; searches_done: number };
  tavily: { used: number; limit: number; remaining: number; searches_left: number } | null;
  memory: { searches: number; liked: number; disliked: number };
}

/** Estimated searches left (Nebius ledger + live Tavily credits). */
export async function getUsage(): Promise<UsageStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/usage`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
