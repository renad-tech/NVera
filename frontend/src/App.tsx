import { useState } from "react";
import { RotatingCube, WireframeCity, Particles } from "./components/Hero3D";
import Finder from "./components/Finder";

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({ onStart }: { onStart: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-8">
        <span />
        <div className="flex items-center gap-5">
          <a
            href="#how"
            className="hidden text-sm font-light text-white/60 transition-colors hover:text-neon-soft sm:inline"
          >
            How it works
          </a>
          <button
            onClick={onStart}
            className="rounded-full px-4 py-2 text-sm text-white/70 transition-all duration-300 hover:bg-white/5 hover:text-neon-soft"
            style={{ border: "1px solid rgba(255,255,255,0.10)" }}
          >
            Open finder
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section
      id="top"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
    >
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="aura absolute left-1/2 top-[42%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2" />
        <div
          className="grid-floor absolute inset-x-0 bottom-0 h-[46%] opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(53,226,154,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(53,226,154,0.10) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            transform: "perspective(560px) rotateX(66deg)",
            transformOrigin: "bottom",
            maskImage: "linear-gradient(to top, black, transparent 85%)",
          }}
        />
      </div>

      <Particles count={22} />
      <div className="opacity-45">
        <WireframeCity side="left" />
        <WireframeCity side="right" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <h1 className="nvera-title font-display mb-4 text-[8.5rem] font-black sm:text-[10rem] md:text-[12.5rem]">
          <span className="text-neon text-glow">NV</span>
          <span className="text-white/95">era</span>
        </h1>
        <h2 className="font-display max-w-4xl text-5xl font-black uppercase leading-[0.92] tracking-tight text-white/90 sm:text-6xl md:text-7xl">
          Find your{" "}
          <span className="text-neon text-glow">3D</span>{" "}
          <span className="word-3d text-white/95">world</span>
        </h2>

        <div className="relative my-12 flex items-center justify-center">
          <div className="aura absolute h-72 w-72" />
          <RotatingCube size={184} />
        </div>

        <button
          onClick={onStart}
          className="group font-display mt-12 inline-flex min-h-[56px] items-center gap-3 rounded-full bg-neon px-10 text-lg font-bold uppercase tracking-widest text-[#041a0d] glow-soft transition-all duration-300 hover:-translate-y-0.5 hover:bg-neon-soft"
        >
          Start Searching
          <Icon
            name="arrow"
            className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1"
          />
        </button>

      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/* ------------------------------------------------------------------ */

const STEPS = [
  { n: "01", title: "Describe", body: "Type the scene you need — the main thing plus a few details you want to see.", agent: "You" },
  { n: "02", title: "Understand", body: "Turns your words and settings into search terms and a must-have checklist.", agent: "Nemotron" },
  { n: "03", title: "Search", body: "Looks through Poly Haven, Sketchfab, Poly Pizza, the Smithsonian and more for ready-made models.", agent: "Tavily" },
  { n: "04", title: "Judge", body: "Looks at every preview side by side and picks the best match — honestly scored.", agent: "Kimi · Nemotron" },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl px-6 py-32 md:py-40">
      <div className="mb-16">
        <p className="font-mono mb-3 text-[10px] tracking-[0.3em] text-neon-soft/60 uppercase">How it works</p>
        <h2 className="font-display max-w-2xl text-5xl font-black uppercase leading-[0.9] tracking-tight text-white/90 md:text-6xl">
          We don't generate. <span className="text-neon">We find the best.</span>
        </h2>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/45">
          Millions of great 3D models already exist. NVera's AI team searches them for you and
          hands back the one that really matches — ready to drop into your game or project.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {STEPS.map((s) => (
          <div key={s.n} className="glow-card rounded-[24px] bg-panel/80 p-6">
            <p className="font-mono text-[11px] tracking-[0.2em] text-neon/70">{s.n}</p>
            <h3 className="font-display mt-3 text-3xl font-black uppercase tracking-tight text-white/95">{s.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/50">{s.body}</p>
            <p className="font-mono mt-5 text-[10px] uppercase tracking-[0.2em] text-neon-soft/60">{s.agent}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="px-6 pb-20 pt-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8">
        <span className="font-display text-xl font-black uppercase tracking-tight text-white/80">
          NVera
        </span>
        <p className="font-mono text-center text-[10px] tracking-[0.22em] text-white/40 uppercase">
          Built for the Nebius × NVIDIA Global AI Hackathon
        </p>
        <p className="max-w-md text-center text-[11px] leading-relaxed text-white/30">
          Models belong to their creators on Sketchfab, Poly Pizza and three.js — NVera shows each
          model's author and license so you can credit them.
        </p>
        <p className="font-mono text-[10px] tracking-[0.18em] text-white/25 uppercase">
          © 2026 NVera
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const [page, setPage] = useState<"home" | "finder">("home");

  if (page === "finder") {
    return <Finder onBack={() => setPage("home")} />;
  }

  return (
    <div className="min-h-screen bg-void font-body text-white">
      <Header onStart={() => setPage("finder")} />
      <main>
        <Hero onStart={() => setPage("finder")} />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
