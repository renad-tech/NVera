import { useState, useRef, useEffect } from "react";
import ModelViewer, { type ViewerHandle } from "./ModelViewer";
import { GROUNDS, MATERIALS, isOriginal, type Restyle } from "../lib/restyle";
import {
  findModel, confirmDownload, downloadModel, getUsage, modelUrl, restyleModel, sendFeedback,
  DEFAULT_SETTINGS, MAX_REFERENCE_IMAGES, type Choice, type SearchTrace, type TavilyResearch, type UsageStatus,
  type ConfirmRequest, type FindResult, type Outcome, type SearchSettings, type StepName,
} from "../lib/api";

// Constants

const SUGGESTIONS = [
  "A cyberpunk city street at night with neon signs",
  "A medieval castle with towers and a courtyard",
  "A cozy café with wooden tables and plants",
  "A low-poly forest with pine trees and a cabin",
];

const STEPS: { step: StepName; label: string; agent: string }[] = [
  { step: "analyze",  label: "Understanding your scene",  agent: "Nemotron" },
  { step: "research", label: "Researching the real thing", agent: "Tavily" },
  { step: "search",   label: "Searching 3D libraries",    agent: "Tavily + APIs" },
  { step: "inspect",  label: "Picking the best match",   agent: "Kimi · Nemotron" },
  { step: "download", label: "Downloading model",        agent: "Download" },
];

type SpaceSize  = SearchSettings["space_size"];
type ColorMode  = SearchSettings["color_mode"];

interface Msg {
  id:       string;
  role:     "user" | "assistant";
  text:     string;
  settings?: SearchSettings;
  loading?: boolean;
  step?:    StepName;
  stepMsg?: string;
  result?:  FindResult;
  confirm?: ConfirmRequest;
  error?:   string;
}

// Icon

function Ico({ n, size = 18 }: { n: string; size?: number }) {
  const P: Record<string, React.ReactNode> = {
    arrow:   <path d="M5 12h14M13 6l6 6-6 6" />,
    back:    <path d="M19 12H5M12 6l-6 6 6 6" />,
    plus:    <path d="M12 5v14M5 12h14" />,
    close:   <path d="M18 6L6 18M6 6l12 12" />,
    world:   (<><circle cx="12" cy="12" r="9" /><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18M3 12h18" /></>),
    upload:   (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>),
    download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
    help:     (<><circle cx="12" cy="12" r="9" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></>),
    settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
    mail:     (<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {P[n]}
    </svg>
  );
}

// Empty state

function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-36 text-center">
      <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl"
        style={{
          background: "rgba(0,255,136,0.07)",
          border: "1px solid rgba(0,255,136,0.14)",
          color: "#00ff88",
        }}>
        <Ico n="world" size={24} />
      </div>

      <h2 className="font-display mb-3 text-[2.6rem] font-black uppercase leading-none tracking-tight text-white/90">
        What world are you looking for?
      </h2>
      <p className="mb-10 max-w-md text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.40)" }}>
        Describe it and NVera searches Poly Haven, Sketchfab, Poly Pizza, the Smithsonian and more,
        then AI picks the best ready-made 3D model for you.
      </p>

      <div className="grid max-w-[480px] grid-cols-2 gap-2.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onSuggest(s)}
            className="rounded-xl px-4 py-3 text-left text-sm leading-snug transition-all duration-150"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.50)",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = "rgba(0,255,136,0.22)";
              el.style.color = "rgba(255,255,255,0.80)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = "rgba(255,255,255,0.07)";
              el.style.color = "rgba(255,255,255,0.50)";
            }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// Message bubbles

function UserMsg({ text, settings }: { text: string; settings?: SearchSettings }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[72%] rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.88)",
        }}>
        {text}
      </div>
      {settings && <SettingsChips s={settings} />}
    </div>
  );
}

function Avatar({ loading }: { loading?: boolean }) {
  return (
    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
      style={{
        background: "rgba(0,255,136,0.09)",
        border: "1px solid rgba(0,255,136,0.20)",
        color: "#00ff88",
      }}>
      {loading
        ? <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "#00ff88" }} />
        : <Ico n="world" size={13} />}
    </div>
  );
}

function Progress({ step, message }: { step?: StepName; message?: string }) {
  const current = STEPS.findIndex((s) => s.step === step);
  return (
    <div className="min-w-0 flex-1 space-y-2 py-1">
      {STEPS.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <div key={s.step} className="flex items-center gap-3 text-sm"
            style={{ color: state === "todo" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.75)" }}>
            <span className="grid h-4 w-4 shrink-0 place-items-center">
              {state === "done" && <span style={{ color: "#00ff88" }}>✓</span>}
              {state === "active" && <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "#00ff88" }} />}
              {state === "todo" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />}
            </span>
            <span className="flex-1">{state === "active" && message ? message : s.label}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: state === "todo" ? "rgba(255,255,255,0.15)" : "rgba(0,255,136,0.55)" }}>
              {s.agent}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function QualityBadge({ score }: { score: number }) {
  const good = score >= 6;
  return (
    <span className="font-mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        background: good ? "rgba(0,255,136,0.10)" : "rgba(255,190,80,0.10)",
        border: `1px solid ${good ? "rgba(0,255,136,0.25)" : "rgba(255,190,80,0.25)"}`,
        color: good ? "#00ff88" : "#ffbe50",
      }}>
      {good ? "✓" : "!"} {score}/10
    </span>
  );
}

/** "How NVera decided": every agent, model, time and cost + every candidate the judges compared. */
function TracePanel({ trace, cost }: { trace: SearchTrace; cost: FindResult["cost"] }) {
  const [open, setOpen] = useState(false);
  const short = (m: string) => m.split("/").pop()!.replace(/-\d+b-a\d+b$/i, "");
  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: "rgba(0,255,136,0.6)" }}>
          How NVera decided
        </span>
        <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          {trace.steps.length} steps · {trace.total_seconds}s · ${cost.nebius_usd.toFixed(3)} · {cost.tavily_credits} Tavily
          {" "}{open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          {trace.mock && <p className="text-[11px] text-[#ffbe50]">(mock mode — sample numbers)</p>}
          <div className="space-y-1">
            {trace.steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-[11px]">
                <span className="min-w-0 truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {s.agent} <span style={{ color: "rgba(255,255,255,0.3)" }}>· {short(s.model)}</span>
                </span>
                <span className="font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>{s.seconds}s</span>
                <span className="font-mono w-16 text-right" style={{ color: "rgba(0,255,136,0.6)" }}>
                  {s.usd > 0 ? `$${s.usd.toFixed(4)}` : s.tavily_credits > 0 ? `${s.tavily_credits} cr` : "free"}
                </span>
              </div>
            ))}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Candidates Kimi compared
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {trace.candidates.map((c) => (
              <div key={c.id} title={c.reason} className="overflow-hidden rounded-lg"
                style={{ border: `1px solid ${c.picked ? "rgba(0,255,136,0.6)" : "rgba(255,255,255,0.07)"}`, background: "#080808" }}>
                <div className="relative h-14 w-full" style={{ background: "#111" }}>
                  {c.thumbnail && <img src={c.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                  {c.score !== null && (
                    <span className="font-mono absolute right-1 top-1 rounded px-1 text-[10px]"
                      style={{ background: "rgba(0,0,0,0.7)", color: c.score >= 6 ? "#00ff88" : "#ffbe50" }}>{c.score}</span>
                  )}
                </div>
                <div className="px-1.5 py-1">
                  <p className="truncate text-[10px] text-white/75">{c.picked ? "★ " : ""}{c.name}</p>
                  <p className="truncate text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {c.source_label}{c.found_by === "tavily" ? " · Tavily" : ""}{c.editable ? "" : " · view-only"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** What Tavily found about the real thing - shown so users (and judges) see the grounding. */
function TavilyPanel({ research }: { research: TavilyResearch }) {
  if (!research.answer && research.images.length === 0) return null;
  return (
    <div className="space-y-2 rounded-xl px-3 py-3" style={{ background: "rgba(80,140,255,0.04)", border: "1px solid rgba(80,140,255,0.16)" }}>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: "rgba(140,180,255,0.8)" }}>
        Tavily research · the real thing
      </p>
      {research.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {research.images.map((img) => (
            <a key={img.url} href={img.url} target="_blank" rel="noreferrer" title={img.description}
              className="h-16 w-24 shrink-0 overflow-hidden rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <img src={img.url} alt={img.description || "Reference found by Tavily"} loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }} />
            </a>
          ))}
        </div>
      )}
      {research.answer && (
        <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{research.answer}</p>
      )}
      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.30)" }}>
        Kimi compared the models with these real-world photos.
        {research.sources.length > 0 && <> Sources: {research.sources.slice(0, 3).map((s, i) => (
          <span key={s.url}>{i > 0 && ", "}<a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-white/20 hover:text-white/60">
            {new URL(s.url).hostname.replace(/^www\./, "")}</a></span>
        ))}</>}
      </p>
    </div>
  );
}

/** Sketchfab winner that NVera may not download (API terms 4.6): official viewer + credits. */
function SketchfabEmbed({ url, title }: { url: string; title: string }) {
  return (
    <iframe title={title} src={url} className="h-96 w-full" allow="autoplay; fullscreen; xr-spatial-tracking"
      allowFullScreen style={{ border: 0, background: "#000" }} />
  );
}

function ViewOnlyActions({ result, onAlternative }: { result: FindResult; onAlternative: (jobId: string) => void }) {
  const alt = result.alternative;
  return (
    <div className="space-y-2.5 rounded-xl px-3 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
        This one is from <span className="text-white/80">Sketchfab</span> and only Sketchfab can hand out the
        file: open it there, sign in (free) and download. NVera checked every other source first and this was
        clearly the best match. If you'd rather edit it here, take the alternative below.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={result.model.url} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 rounded-lg px-3 py-[7px] text-xs font-semibold transition-opacity hover:opacity-85"
          style={{ background: "#00ff88", color: "#000" }}>
          <Ico n="download" size={13} />
          Download from Sketchfab
        </a>
        {alt && result.job_id && (
          <button onClick={() => onAlternative(result.job_id!)}
            className="rounded-lg px-3 py-[7px] text-left text-xs transition-colors hover:bg-white/[0.05]"
            style={{ border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.70)" }}>
            Editable alternative: {alt.name} · {alt.source_label} · {alt.score}/10
          </button>
        )}
      </div>
    </div>
  );
}

/** 👍/👎 - NVera remembers it and uses it on similar future searches. */
function FeedbackRow({ searchId, onSent }: { searchId: string; onSent: () => void }) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  async function send(r: "up" | "down", text = "") {
    try {
      await sendFeedback(searchId, r, text);
      setSent(true);
      onSent();
    } catch {
      setSent(false);
    }
  }

  if (sent) {
    return (
      <p className="text-[11px]" style={{ color: "rgba(0,255,136,0.7)" }}>
        Thanks — NVera will remember this for similar searches.
      </p>
    );
  }

  const btn = (active: boolean) => ({
    background: active ? "rgba(0,255,136,0.12)" : "rgba(255,255,255,0.03)",
    border: `1px solid ${active ? "rgba(0,255,136,0.35)" : "rgba(255,255,255,0.08)"}`,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-white/40">Good pick?</span>
        <button onClick={() => { setRating("up"); send("up"); }} className="rounded-md px-2 py-0.5 text-sm" style={btn(rating === "up")} aria-label="Good pick">👍</button>
        <button onClick={() => setRating("down")} className="rounded-md px-2 py-0.5 text-sm" style={btn(rating === "down")} aria-label="Bad pick">👎</button>
      </div>
      {rating === "down" && (
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") send("down", note); }}
            placeholder="What was wrong? e.g. “no furniture inside”, “too simple”"
            className="min-w-0 flex-1 bg-transparent px-1 text-xs text-white/85 outline-none placeholder:text-white/25" />
          <button onClick={() => send("down", note)}
            className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ background: "#00ff88", color: "#000" }}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}

/** Look editor under the viewer: instant presets (free) + an AI edit box (Restyler). */
function LookEditor({ result, restyle, setRestyle }: {
  result: FindResult;
  restyle: Restyle;
  setRestyle: (r: Restyle) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const original = result.scene.restyle;

  async function askAI() {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const out = await restyleModel(result, restyle, text);
      setRestyle(out.restyle);
      setNote({ text: out.message });
      setInstruction("");
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) => ({
    background: active ? "#00ff88" : "rgba(255,255,255,0.03)",
    color: active ? "#000" : "rgba(255,255,255,0.55)",
    border: `1px solid ${active ? "#00ff88" : "rgba(255,255,255,0.08)"}`,
    fontWeight: active ? 600 : 400,
  });

  return (
    <div className="space-y-3 rounded-xl px-3 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: "rgba(0,255,136,0.6)" }}>
          Edit the look
        </p>
        <button onClick={() => { setRestyle(original); setNote(null); }}
          className="text-[11px] text-white/35 hover:text-white/70">
          Reset
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {MATERIALS.map((m) => (
          <button key={m.value} onClick={() => setRestyle({ ...restyle, material: m.value, palette: m.value === restyle.material ? restyle.palette : [] })}
            className="rounded-full px-2.5 py-1 text-[11px] transition-colors" style={chip(restyle.material === m.value)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">Light</span>
          {(["day", "sunset", "night"] as const).map((l) => (
            <button key={l} onClick={() => setRestyle({ ...restyle, lighting: l, bloom: l === "night" || restyle.material === "neon" || restyle.material === "hologram" })}
              className="rounded-full px-2.5 py-1 text-[11px] capitalize" style={chip(restyle.lighting === l)}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">Ground</span>
          <select value={restyle.ground} onChange={(e) => setRestyle({ ...restyle, ground: e.target.value as Restyle["ground"] })}
            className="rounded-full bg-transparent px-2 py-1 text-[11px] text-white/60 outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {GROUNDS.map((g) => <option key={g.value} value={g.value} className="bg-black">{g.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-white/50">
          <input type="checkbox" checked={restyle.fog} onChange={(e) => setRestyle({ ...restyle, fog: e.target.checked })} />
          Fog
        </label>
      </div>

      {/* AI edit (Restyler) */}
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.08)" }}>
        <input value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={busy}
          onKeyDown={(e) => { if (e.key === "Enter") askAI(); }}
          placeholder="Ask AI to change the look… e.g. “cardboard at sunset with warm colors”"
          className="min-w-0 flex-1 bg-transparent px-1 text-xs text-white/85 outline-none placeholder:text-white/25" />
        <button onClick={askAI} disabled={busy || !instruction.trim()}
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-30"
          style={{ background: "#00ff88", color: "#000" }}>
          {busy ? "…" : "Apply"}
        </button>
      </div>
      {note && (
        <p className="text-[11px]" style={{ color: note.error ? "rgba(255,160,160,0.85)" : "rgba(255,255,255,0.5)" }}>
          {note.error ? note.text : <><span style={{ color: "rgba(0,255,136,0.7)" }}>Restyler:</span> {note.text}</>}
        </p>
      )}
    </div>
  );
}

function ResultCard({ result, onFeedback, onAlternative }: {
  result: FindResult;
  onFeedback: () => void;
  onAlternative: (jobId: string) => void;
}) {
  const { model, quality } = result;
  const viewOnly = Boolean(result.embed_url);
  const attribution = {
    title: model.name, author: model.author, author_url: model.author_url,
    license: model.license, source: model.source_label, source_url: model.url,
  };
  const [restyle, setRestyle] = useState<Restyle>(result.scene.restyle);
  const [saving, setSaving] = useState(false);
  const viewer = useRef<ViewerHandle | null>(null);
  const edited = !isOriginal(restyle);
  const filename = model.name.replace(/[^\w-]+/g, "_") || "NVera-model";

  async function download() {
    if (!edited) return downloadModel(result);
    setSaving(true);
    try {
      await viewer.current?.exportGlb(`${filename}_NVera`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function saveImage() {
    try {
      viewer.current?.saveImage(`${filename}_NVera`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const overlayBtn = "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur transition-opacity hover:opacity-85 disabled:opacity-50";
  const overlay = (
    <>
      <button onClick={saveImage} className={overlayBtn} title="Save what you see (light, sky, fog included) as a PNG"
        style={{ background: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.15)" }}>
        Save image
      </button>
      <button onClick={download} disabled={saving} className={overlayBtn}
        title={edited ? "Download the model with your material, colors and ground" : "Download the original model"}
        style={{ background: "#00ff88", color: "#000" }}>
        <Ico n="download" size={12} />
        {saving ? "Preparing…" : edited ? "Download edited" : "Download"}
      </button>
    </>
  );

  return (
    <div className="min-w-0 flex-1">
      <div className="overflow-hidden rounded-2xl rounded-tl-sm"
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
        {viewOnly
          ? <SketchfabEmbed url={result.embed_url!} title={model.name} />
          : <ModelViewer url={modelUrl(result)} restyle={restyle} handleRef={viewer} overlay={overlay}
              attribution={attribution} className="h-96 w-full" />}

        <div className="space-y-3 px-4 py-3.5">
          {result.mock && (
            <p className="font-mono rounded-lg px-3 py-2 text-[11px]"
              style={{ background: "rgba(255,190,80,0.08)", border: "1px solid rgba(255,190,80,0.22)", color: "#ffbe50" }}>
              MOCK MODE — sample model, not generated from your prompt. Restart the backend without NVERA_MOCK=1 for real results.
            </p>
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white/90">{model.name}</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>
                by{" "}
                <a href={model.author_url} target="_blank" rel="noreferrer" className="underline decoration-white/20 hover:text-white/70">
                  {model.author}
                </a>
                {" · "}{model.license}{model.size_mb > 0 && <>{" · "}{model.size_mb} MB</>}
              </p>
              <p className="font-mono mt-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: "rgba(0,255,136,0.55)" }}>
                from {model.source_label}
                {model.source === "sketchfab" && (model.via_objaverse
                  ? " · originally published on Sketchfab · via Objaverse"
                  : " · model provided by Sketchfab")}
                {model.found_by === "tavily" && <span style={{ color: "rgba(140,180,255,0.85)" }}> · found by Tavily</span>}
              </p>
            </div>
            <QualityBadge score={quality.score} />
          </div>

          {(quality.has.length > 0 || quality.missing.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {quality.has.map((h) => (
                <span key={`h-${h}`} className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: "rgba(0,255,136,0.08)", color: "rgba(0,255,136,0.85)" }}>
                  ✓ {h}
                </span>
              ))}
              {quality.missing.map((m) => (
                <span key={`m-${m}`} className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)" }}>
                  ✗ {m}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
            <span style={{ color: "rgba(0,255,136,0.7)" }}>Inspector:</span> {quality.reason}
          </p>

          {result.scene.research && <TavilyPanel research={result.scene.research} />}

          {result.scene.trace && <TracePanel trace={result.scene.trace} cost={result.cost} />}

          {!result.mock && <FeedbackRow searchId={result.search_id} onSent={onFeedback} />}

          {viewOnly && <ViewOnlyActions result={result} onAlternative={onAlternative} />}

          {!viewOnly && <>
          <LookEditor result={result} restyle={restyle} setRestyle={setRestyle} />

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={download} disabled={saving}
              className="flex items-center gap-2 rounded-lg px-3 py-[7px] text-xs font-semibold transition-opacity duration-150 hover:opacity-80 disabled:opacity-50"
              style={{ background: "#00ff88", color: "#000" }}>
              <Ico n="download" size={13} />
              {saving ? "Preparing…" : edited ? "Download edited GLB" : "Download GLB"}
            </button>
            {edited && (
              <button onClick={() => downloadModel(result)}
                className="rounded-lg px-3 py-[7px] text-xs transition-colors hover:bg-white/[0.05]"
                style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                Original file
              </button>
            )}
            <button onClick={saveImage}
              className="rounded-lg px-3 py-[7px] text-xs transition-colors hover:bg-white/[0.05]"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
              Save image
            </button>
            <a href={model.url} target="_blank" rel="noreferrer"
              className="rounded-lg px-3 py-[7px] text-xs transition-colors hover:bg-white/[0.05]"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
              View on {model.source_label}
            </a>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.30)" }}>
            The GLB keeps the material, colors and ground. Light, sky, fog and glow are viewer settings —
            3D files don't store them, so use <span className="text-white/50">Save image</span> to keep that look.
            The creator credit and license are written into every exported GLB.
          </p>
          </>}
        </div>
      </div>
    </div>
  );
}

function ConfirmCard({ req, onAnswer }: {
  req: ConfirmRequest;
  onAnswer: (jobId: string, accept: boolean) => void;
}) {
  const { model, alternative } = req;
  return (
    <div className="min-w-0 flex-1 space-y-3 rounded-2xl rounded-tl-sm px-4 py-4"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,190,80,0.22)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono mb-1 text-[10px] uppercase tracking-[0.2em]" style={{ color: "#ffbe50" }}>
            Large model · {model.size_mb} MB
          </p>
          <p className="text-sm font-medium text-white/90">{model.name}</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>from {model.source_label}</p>
        </div>
        <QualityBadge score={model.score} />
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
        This is the best match, but it's a big file — it may take a while to download and load.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onAnswer(req.job_id, true)}
          className="flex items-center gap-2 rounded-lg px-3 py-[7px] text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: "#00ff88", color: "#000" }}>
          <Ico n="download" size={13} />
          Download anyway ({model.size_mb} MB)
        </button>
        {alternative && (
          <button onClick={() => onAnswer(req.job_id, false)}
            className="rounded-lg px-3 py-[7px] text-left text-xs transition-colors hover:bg-white/[0.05]"
            style={{ border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.65)" }}>
            Smaller instead: {alternative.name} · {alternative.size_mb > 0 ? `${alternative.size_mb} MB` : "small"} · {alternative.score}/10
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantMsg({ msg, onAnswer, onFeedback, onAlternative }: {
  msg: Msg;
  onAnswer: (jobId: string, accept: boolean) => void;
  onFeedback: () => void;
  onAlternative: (jobId: string) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar loading={msg.loading} />
      {msg.loading ? (
        <Progress step={msg.step} message={msg.stepMsg} />
      ) : msg.confirm ? (
        <ConfirmCard req={msg.confirm} onAnswer={onAnswer} />
      ) : msg.error ? (
        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm px-4 py-3 text-sm"
          style={{ background: "rgba(255,80,80,0.06)", border: "1px solid rgba(255,80,80,0.18)", color: "rgba(255,190,190,0.85)" }}>
          {msg.error}
        </div>
      ) : msg.result ? (
        <ResultCard result={msg.result} onFeedback={onFeedback} onAlternative={onAlternative} />
      ) : null}
    </div>
  );
}

// Search settings (always visible - reviewed before every search)

const SIZE_OPTIONS: { value: SpaceSize; label: string; hint: string }[] = [
  { value: "small",  label: "Object",      hint: "One item — a chair, a lamp, a car" },
  { value: "medium", label: "Room",        hint: "One room or building" },
  { value: "large",  label: "Environment", hint: "A whole city, landscape or level" },
];
const COLOR_OPTIONS: { value: ColorMode; label: string; hint: string }[] = [
  { value: "colored",    label: "Colored",    hint: "Textured, full color" },
  { value: "monochrome", label: "Monochrome", hint: "Untextured / clay / single color" },
];

/** Shrink an uploaded image in the browser before sending (keeps requests small). */
function toDataUrl(file: File, maxPx = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function SettingsPanel({ settings, update, disabled }: {
  settings: SearchSettings;
  /** Functional update - never loses a change made in quick succession. */
  update: (fn: (s: SearchSettings) => SearchSettings) => void;
  disabled: boolean;
}) {
  const refs = settings.reference_images;

  async function addImages(files: FileList | null) {
    if (!files) return;
    const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, MAX_REFERENCE_IMAGES);
    const urls = await Promise.all(picked.map((f) => toDataUrl(f)));
    update((s) => ({ ...s, reference_images: [...s.reference_images, ...urls].slice(0, MAX_REFERENCE_IMAGES) }));
  }

  const sizeHint = SIZE_OPTIONS.find((o) => o.value === settings.space_size)?.hint;
  const lookHint = COLOR_OPTIONS.find((o) => o.value === settings.color_mode)?.hint;

  // Compact strip: always visible, but never crowds out the results.
  return (
    <div className="mx-auto mb-2 max-w-2xl rounded-xl px-3 py-2"
      style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.07)", opacity: disabled ? 0.5 : 1 }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "rgba(0,255,136,0.6)" }}>
          Settings
        </span>
        <MiniSeg options={SIZE_OPTIONS} value={settings.space_size} disabled={disabled}
          onChange={(v) => update((s) => ({ ...s, space_size: v as SpaceSize }))} />
        <MiniSeg options={COLOR_OPTIONS} value={settings.color_mode} disabled={disabled}
          onChange={(v) => update((s) => ({ ...s, color_mode: v as ColorMode }))} />

        <div className="flex items-center gap-1.5">
          {refs.map((src, i) => (
            <div key={i} className="relative h-7 w-7 overflow-hidden rounded-md" style={{ border: "1px solid rgba(0,255,136,0.3)" }}>
              <img src={src} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" />
              <button disabled={disabled}
                onClick={() => update((s) => ({ ...s, reference_images: s.reference_images.filter((_, j) => j !== i) }))}
                className="absolute inset-0 grid place-items-center bg-black/60 text-white/90 opacity-0 transition-opacity hover:opacity-100"
                aria-label={`Remove reference ${i + 1}`}>
                <Ico n="close" size={10} />
              </button>
            </div>
          ))}
          {refs.length < MAX_REFERENCE_IMAGES && (
            <label title="Add a picture of what you have in mind (optional)"
              className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors ${disabled ? "" : "cursor-pointer hover:text-white/70"}`}
              style={{ border: "1px dashed rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.40)" }}>
              <input type="file" accept="image/*" multiple className="sr-only" disabled={disabled}
                onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
              <Ico n="upload" size={12} />
              Reference
            </label>
          )}
        </div>
      </div>
      <p className="mt-1.5 truncate text-[11px]" style={{ color: "rgba(255,255,255,0.30)" }}>
        {sizeHint} · {lookHint}{refs.length ? ` · ${refs.length} reference image${refs.length > 1 ? "s" : ""}` : ""}
      </p>
    </div>
  );
}

function MiniSeg({ options, value, onChange, disabled }: {
  options: { value: string; label: string; hint: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex overflow-hidden rounded-md" style={{ border: "1px solid rgba(255,255,255,0.09)" }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} disabled={disabled} title={o.hint}
          className="px-2.5 py-1 text-[11px] transition-all duration-150"
          style={{
            background: value === o.value ? "#00ff88" : "transparent",
            color:      value === o.value ? "#000000" : "rgba(255,255,255,0.50)",
            fontWeight: value === o.value ? 600 : 400,
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Compact summary of the settings a search used (shown on the user's message). */
function SettingsChips({ s }: { s: SearchSettings }) {
  const size = SIZE_OPTIONS.find((o) => o.value === s.space_size)?.label;
  const look = COLOR_OPTIONS.find((o) => o.value === s.color_mode)?.label;
  const refs = s.reference_images.length;
  return (
    <div className="mt-1.5 flex justify-end gap-1.5">
      {[size, look, refs ? `${refs} reference${refs > 1 ? "s" : ""}` : null].filter(Boolean).map((t) => (
        <span key={t} className="font-mono rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)" }}>
          {t}
        </span>
      ))}
    </div>
  );
}

// Budget left (header)

function UsageChip({ usage }: { usage: UsageStatus }) {
  const [open, setOpen] = useState(false);
  const { nebius: n, tavily: t, memory: m } = usage;
  const low = usage.searches_left < 50;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="font-mono whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.14em]"
        style={{
          background: low ? "rgba(255,190,80,0.10)" : "rgba(0,255,136,0.06)",
          border: `1px solid ${low ? "rgba(255,190,80,0.3)" : "rgba(0,255,136,0.2)"}`,
          color: low ? "#ffbe50" : "rgba(0,255,136,0.8)",
        }}>
        ≈ {usage.searches_left.toLocaleString()} searches left
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-72 space-y-2 rounded-xl p-3 text-[11px] leading-relaxed shadow-2xl"
          style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.6)" }}>
          <p><span className="text-white/85">Nebius</span> ≈ ${n.remaining_usd.toFixed(2)} of ${n.budget_usd} left
            · ~${n.avg_search_usd.toFixed(3)}/search → ≈ {n.searches_left.toLocaleString()} searches</p>
          {t && <p><span className="text-white/85">Tavily</span> {t.remaining.toLocaleString()} of {t.limit.toLocaleString()} credits
            → ≈ {t.searches_left.toLocaleString()} searches</p>}
          <p><span className="text-white/85">Memory</span> {m.searches} searches · {m.liked} 👍 · {m.disliked} 👎</p>
          <p className="text-white/35">Nebius is NVera's own estimate from its logs — the Nebius console has the exact balance.</p>
        </div>
      )}
    </div>
  );
}

// How to use (header help)

function HowToUse({ onClose }: { onClose: () => void }) {
  const tips = [
    ["Describe the scene", "Main thing + 2-4 visible details. e.g. “modern office with wooden desks, plants and big windows”."],
    ["Check the settings", "Scene size and look change what NVera searches for. Add a reference picture if you have one."],
    ["Review the pick", "✓ shows what the model has, ✗ what's missing. Big files ask before downloading."],
    ["Download", "Get the GLB and drop it into Unity, Unreal, Blender or three.js. Credit the author (license shown)."],
  ];
  return (
    <div className="absolute right-6 top-16 z-50 w-80 rounded-2xl p-4 shadow-2xl"
      style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.10)" }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: "#00ff88" }}>How to use</p>
        <button onClick={onClose} aria-label="Close" className="text-white/40 hover:text-white/80"><Ico n="close" size={14} /></button>
      </div>
      <ol className="space-y-3">
        {tips.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="font-mono text-xs" style={{ color: "rgba(0,255,136,0.6)" }}>{i + 1}</span>
            <div>
              <p className="text-sm text-white/85">{title}</p>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Finder

export default function Finder({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input,    setInput]    = useState("");
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SETTINGS);
  const [helpOpen, setHelpOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);

  /* auto-resize textarea */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  /* scroll to bottom on new messages */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const refreshUsage = () => { getUsage().then(setUsage); };
  useEffect(refreshUsage, []);

  const busy = messages.some((m) => m.loading);

  const patchMsg = (id: string, p: Partial<Msg>) =>
    setMessages((m) => m.map((msg) => msg.id === id ? { ...msg, ...p } : msg));

  /** Runs a backend call for message `id`, streaming its steps into the bubble. */
  async function track(id: string, call: (onStep: (s: StepName, m: string) => void) => Promise<Outcome>) {
    try {
      const out = await call((step, stepMsg) => patchMsg(id, { step, stepMsg }));
      patchMsg(id, out.kind === "result"
        ? { loading: false, result: out.data, confirm: undefined }
        : { loading: false, confirm: out.data });
    } catch (e) {
      const message = e instanceof TypeError
        ? "Can't reach the NVera server. Is the backend running on port 8000?"
        : (e as Error).message;
      patchMsg(id, { loading: false, confirm: undefined, error: message });
    } finally {
      refreshUsage();
    }
  }

  function submit() {
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    const uid = Date.now().toString();
    const lid = (Date.now() + 1).toString();
    const used = settings; // snapshot: exactly what the user saw when they pressed search

    setMessages((m) => [
      ...m,
      { id: uid, role: "user",      text: trimmed, settings: used },
      { id: lid, role: "assistant", text: "", loading: true },
    ]);
    setInput("");
    track(lid, (onStep) => findModel(trimmed, used, onStep));
  }

  function answer(id: string, jobId: string, choice: Choice) {
    patchMsg(id, { loading: true, confirm: undefined, step: "download", stepMsg: undefined });
    track(id, (onStep) => confirmDownload(jobId, choice, onStep));
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-black font-body text-white">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Header */}
        <header className="flex shrink-0 items-center gap-4 px-6 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <span className="font-display text-xl font-black tracking-tight">
              <span style={{ color: "#00ff88" }}>NV</span>
              <span className="text-white">era</span>
            </span>
            <span className="font-mono hidden text-[10px] uppercase tracking-[0.22em] sm:inline" style={{ color: "rgba(255,255,255,0.30)" }}>
              3D model finder
            </span>
          </div>

          <div className="flex-1" />

          {usage && <UsageChip usage={usage} />}

          <button onClick={() => setHelpOpen((o) => !o)} aria-label="How to use"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-150 hover:bg-white/[0.06]"
            style={{ color: "#00ff88" }}>
            <Ico n="help" size={16} />
            How to use
          </button>

          <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />

          <button onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all duration-150 hover:bg-white/[0.05]"
            style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.38)" }}>
            <Ico n="back" size={13} />
            Back to Home
          </button>
        </header>

        {helpOpen && <HowToUse onClose={() => setHelpOpen(false)} />}

        {/* Conversation */}
        <main className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onSuggest={(s) => { setInput(s); textareaRef.current?.focus(); }} />
          ) : (
            <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
              {messages.map((msg) =>
                msg.role === "user"
                  ? <UserMsg      key={msg.id} text={msg.text} settings={msg.settings} />
                  : <AssistantMsg key={msg.id} msg={msg} onFeedback={refreshUsage}
                      onAlternative={(jobId) => answer(msg.id, jobId, "editable")}
                      onAnswer={(jobId, accept) => answer(msg.id, jobId, accept ? "large" : "smaller")} />
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        {/* Settings + input — the settings are always in view before searching */}
        <div className="px-4 pb-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <SettingsPanel settings={settings} update={setSettings} disabled={busy} />

          <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl px-3 py-2.5"
            style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.09)" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="e.g. A cozy café with wooden tables, plants and warm lights"
              rows={1}
              className="flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-relaxed outline-none placeholder:text-white/25"
              style={{ color: "rgba(255,255,255,0.88)", maxHeight: "180px" }}
            />
            <button onClick={submit} disabled={!input.trim() || busy}
              className="mb-[3px] grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all duration-150 hover:opacity-85 disabled:opacity-20"
              style={{ background: "#00ff88", color: "#000" }}
              aria-label="Search">
              <Ico n="arrow" size={15} />
            </button>
          </div>

          <p className="font-mono mt-2 text-center text-[10px]"
            style={{ color: "rgba(255,255,255,0.16)" }}>
            Enter to search &nbsp;·&nbsp; Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
