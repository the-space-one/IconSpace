"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { Egg } from "@/components/easter-eggs";

// Deterministic pseudo-random (sin-based) so server and client render identically.
function rand(seed: number) {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

// ...but only once rounded. Two things break the "identically" above at full
// precision: `Math.sin` is not required to agree to the last bit between
// Node and the browser's engine, and Chrome's CSSOM rounds lengths as it
// parses the server HTML, so `4.6998192205501255px` comes back as
// `4.69982px`. Either is enough to fail hydration on 280 blades. Three
// decimals is far below a visible difference and serialises the same on both
// sides.
const fixed = (n: number) => Number(n.toFixed(3));

const BLADE_COUNT = 280;

const BLADES = Array.from({ length: BLADE_COUNT }, (_, i) => {
  const r1 = rand(i * 1.13 + 1);
  const r2 = rand(i * 2.31 + 7);
  const r3 = rand(i * 3.77 + 13);
  const r4 = rand(i * 5.19 + 19);

  const leftPct = (i / BLADE_COUNT) * 100 + (r1 - 0.5) * (150 / BLADE_COUNT);
  const height = 30 + r2 * 90; // 30–120px
  const width = 3 + r3 * 4; // 3–7px
  const base = (r4 - 0.5) * 12; // lean −6°…+6°
  const sway = 2 + r2 * 3 + height * 0.012; // taller blades sway a bit more
  const dur = 3.4 + r3 * 1.8; // 3.4–5.2s
  // x-based phase gives the "wind flowing across" wave; small jitter keeps it organic
  const delay = (leftPct / 100) * 2 + r1 * 0.3;

  return {
    leftPct: fixed(leftPct),
    height: fixed(height),
    width: fixed(width),
    base: fixed(base),
    sway: fixed(sway),
    dur: fixed(dur),
    delay: fixed(delay),
  };
});

// Mouse-interaction tuning
const INFLUENCE_RADIUS = 130; // px around the cursor that blades react within
const MAX_BEND = 42; // max degrees a blade bends away from the cursor
const VERTICAL_REACH = 210; // px above the grass where the effect ramps in

export function GrassFooter() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const wraps = Array.from(
      container.querySelectorAll<HTMLElement>(".grass-blade-wrap"),
    );
    const xs = wraps.map((w) => parseFloat(w.dataset.x ?? "0"));

    let raf = 0;
    let pending: { x: number; y: number } | null = null;
    const active = new Set<number>(); // blades currently bent

    const apply = () => {
      raf = 0;
      if (!pending) return;
      const rect = container.getBoundingClientRect();
      const mx = pending.x - rect.left;
      const my = pending.y - rect.top;

      // Fade the effect in as the cursor nears the grass from above.
      const above = -my;
      const vInf = above <= 0 ? 1 : Math.max(0, 1 - above / VERTICAL_REACH);

      const next = new Set<number>();
      if (vInf > 0) {
        for (let i = 0; i < wraps.length; i++) {
          const bladeX = (xs[i] / 100) * rect.width;
          const dx = bladeX - mx;
          if (Math.abs(dx) > INFLUENCE_RADIUS) continue;
          const hInf = 1 - Math.abs(dx) / INFLUENCE_RADIUS;
          const bend = MAX_BEND * Math.sign(dx) * hInf * vInf;
          wraps[i].style.setProperty("--bend", `${bend.toFixed(2)}deg`);
          next.add(i);
        }
      }

      // Reset blades that were bent last frame but aren't anymore.
      for (const i of active) {
        if (!next.has(i)) wraps[i].style.setProperty("--bend", "0deg");
      }
      active.clear();
      for (const i of next) active.add(i);
    };

    const onMove = (e: MouseEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      pending = null;
      for (const i of active) wraps[i].style.setProperty("--bend", "0deg");
      active.clear();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    // Last in the cascade, one step behind the credit line. Without this the
    // grass is the one thing already on screen while the logo is still out in
    // the middle of the viewport, which gives away that the page was there the
    // whole time.
    <div className="mx-auto w-full max-w-2xl px-6 sm:px-8">
      <div
        ref={ref}
        className="pointer-events-none relative w-full overflow-hidden"
        style={{ height: 140 }}
      >
        {/* easter egg, veiled by the grass in front of it */}
        <p className="absolute inset-x-0 top-[64%] -translate-y-1/2 px-4 text-center font-display text-base font-medium tracking-wide text-muted-foreground/10 sm:text-lg">
          touch some grass before you get lost in icons
        </p>

        {/* Three of the four, nested down in the lawn. They sit here rather
            than in page.tsx because the hiding depends on being UNDER the
            blades, and that is DOM order — everything here shares one stacking
            level, so whatever is rendered after paints in front. Low enough
            that the taller blades cut across them. */}
        <Egg index={0} size={17} className="bottom-1 left-[13%] -rotate-6" />
        <Egg index={2} size={25} className="bottom-3 left-[46%] rotate-8" />
        <Egg index={3} size={20} className="bottom-0 left-[79%] -rotate-11" />

        {BLADES.map((b, i) => (
          <span
            key={i}
            data-x={b.leftPct}
            className="grass-blade-wrap absolute bottom-0"
            style={{
              left: `${b.leftPct}%`,
              transformOrigin: "bottom center",
              transform: "rotate(var(--bend, 0deg))",
              transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <span
              // Brand periwinkle, the same #9FA1FF as the shelf glass and the
              // text selection — one colour for both themes, no dark variant
              // of the hue needed.
              //
              // That works because the brand blue channel is already pinned at
              // 255: composited over the white page it can only pull red and
              // green down, so the blades darken *into* lavender and every
              // step of alpha buys hue almost for free. Over the dark page the
              // same colour lifts blue fastest instead. Light lands on
              // (236,236,255), dark on (32,33,47).
              //
              // Alpha is the dial for how coloured the grass reads; the two
              // differ because in light mode it also controls how dark the
              // blades get, and in dark mode how bright.
              className="grass-blade block bg-[#9fa1ff]/20 dark:bg-[#9fa1ff]/15"
              style={
                {
                  width: `${b.width}px`,
                  height: `${b.height}px`,
                  clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
                  "--base": `${b.base}deg`,
                  "--sway": `${b.sway}deg`,
                  "--dur": `${b.dur}s`,
                  "--delay": `${b.delay}s`,
                } as CSSProperties
              }
            />
          </span>
        ))}

        {/* ground line */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-border" />
      </div>
    </div>
  );
}
