/** Neon wireframe hero visuals: rotating cube, perspective wireframe city, floating particles. */

import { useEffect, useRef, useState } from "react";

/**
 * Two-axis auto-tumbling cube (yaw + pitch). It also drifts gently toward the
 * pointer anywhere on screen - a small, slow lean, never a big swing. The lean
 * is applied to an outer wrapper so it layers on top of the continuous spin.
 */
export function RotatingCube({ size = 172 }: { size?: number }) {
  const half = size / 2;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [lean, setLean] = useState({ x: 0, y: 0 });

  const faces: React.CSSProperties[] = [
    { transform: `rotateY(0deg) translateZ(${half}px)` },
    { transform: `rotateY(90deg) translateZ(${half}px)` },
    { transform: `rotateY(180deg) translateZ(${half}px)` },
    { transform: `rotateY(-90deg) translateZ(${half}px)` },
    { transform: `rotateX(90deg) translateZ(${half}px)` },
    { transform: `rotateX(-90deg) translateZ(${half}px)` },
  ];

  useEffect(() => {
    let raf = 0;
    const MAX = 11; // degrees - subtle, never far
    const onMove = (e: PointerEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // normalize by viewport so distant motion still nudges a little
      const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setLean({ x: -dy * MAX, y: dx * MAX }));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="scene bob" style={{ width: size, height: size }} aria-hidden>
      {/* wrapper carries the gentle, slow mouse lean */}
      <div
        ref={wrapRef}
        style={{
          width: size,
          height: size,
          transformStyle: "preserve-3d",
          transform: `rotateX(${lean.x}deg) rotateY(${lean.y}deg)`,
          transition: "transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="cube" style={{ width: size, height: size }}>
          {faces.map((f, i) => (
            <div key={i} className="cube__face" style={f} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A single perspective-tilted skyline column made of pure wireframe strokes. */
function WireBuilding({ h, w }: { h: number; w: number }) {
  const floors = Math.max(4, Math.round(h / 22));
  const windows = Math.max(2, Math.round(w / 22));
  return (
    <div
      className="relative shrink-0 border border-[rgba(59,229,163,0.35)]"
      style={{
        width: w,
        height: h,
        background:
          "linear-gradient(180deg, rgba(59,229,163,0.06), rgba(59,229,163,0.01))",
        boxShadow:
          "inset 0 0 16px rgba(59,229,163,0.07), 0 0 10px rgba(59,229,163,0.08)",
      }}
    >
      {/* floor lines */}
      {Array.from({ length: floors }).map((_, i) => (
        <div
          key={`f${i}`}
          className="absolute left-0 right-0 border-t border-[rgba(59,229,163,0.22)]"
          style={{ top: `${((i + 1) / (floors + 1)) * 100}%` }}
        />
      ))}
      {/* vertical mullions */}
      {Array.from({ length: windows }).map((_, i) => (
        <div
          key={`v${i}`}
          className="absolute inset-y-0 w-px bg-[rgba(59,229,163,0.15)]"
          style={{ left: `${((i + 1) / (windows + 1)) * 100}%` }}
        />
      ))}
      {/* lit rooftop beacon */}
      <div className="absolute -top-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-neon pulse-soft" style={{ boxShadow: "0 0 6px rgba(59,229,163,0.6)" }} />
    </div>
  );
}

export function WireframeCity({ side }: { side: "left" | "right" }) {
  const buildings =
    side === "left"
      ? [
          { h: 420, w: 72 },
          { h: 300, w: 58 },
          { h: 470, w: 80 },
          { h: 240, w: 50 },
          { h: 360, w: 64 },
          { h: 200, w: 44 },
        ]
      : [
          { h: 210, w: 46 },
          { h: 360, w: 64 },
          { h: 250, w: 52 },
          { h: 470, w: 80 },
          { h: 300, w: 58 },
          { h: 420, w: 72 },
        ];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-0 hidden items-end gap-3.5 opacity-90 md:flex"
      style={{
        [side]: 0,
        transform: `perspective(780px) rotateY(${side === "left" ? 30 : -30}deg)`,
        transformOrigin: `${side} bottom`,
        maskImage:
          "linear-gradient(to top, black 78%, transparent), linear-gradient(to " +
          (side === "left" ? "right" : "left") +
          ", black 62%, transparent)",
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      {buildings.map((b, i) => (
        <WireBuilding key={i} h={b.h} w={b.w} />
      ))}
    </div>
  );
}

export function Particles({ count = 26 }: { count?: number }) {
  const dots = Array.from({ length: count }).map((_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    const rnd = seed / 233280;
    const rnd2 = ((i * 233280 + 12345) % 49297) / 49297;
    const rnd3 = ((i * 4523 + 7919) % 6971) / 6971;
    return {
      left: `${(rnd * 100).toFixed(2)}%`,
      top: `${(20 + rnd2 * 80).toFixed(2)}%`,
      size: 1.5 + rnd * 3.5,
      dur: `${9 + rnd2 * 9}s`,
      delay: `${(rnd3 * 10).toFixed(2)}s`,
      dx: `${(rnd - 0.5) * 60}px`,
      op: 0.25 + rnd * 0.4,
    };
  });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {dots.map((d, i) => (
        <span
          key={i}
          className="particle absolute rounded-full"
          style={
            {
              left: d.left,
              top: d.top,
              width: d.size,
              height: d.size,
              background:
                "radial-gradient(circle, rgba(127,240,192,0.95), rgba(53,226,154,0.15))",
              filter: "blur(0.3px)",
              "--dur": d.dur,
              "--delay": d.delay,
              "--dx": d.dx,
              "--op": d.op,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
