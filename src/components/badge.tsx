"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Reflected } from "@/components/shelf";

// Every texture draws light marks on a transparent 110×110 canvas at time `t`
// (seconds). They're small takes on the pixel-perfect.space backgrounds.
type Texture = (ctx: CanvasRenderingContext2D, t: number, dpr: number) => void;

const SIZE = 110;
const INK = "rgba(255,255,255,";

// 4×4 ordered-dither thresholds.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (n) => (n + 0.5) / 16,
);

// Print-style dots that swell as unseen blobs drift underneath.
const halftone: Texture = (ctx, t) => {
  const blobs = [
    [55 + 32 * Math.sin(t * 0.7), 55 + 26 * Math.cos(t * 0.9)],
    [55 + 36 * Math.cos(t * 0.5 + 2), 55 + 30 * Math.sin(t * 0.6 + 1)],
    [55 + 22 * Math.sin(t * 1.1 + 4), 55 + 36 * Math.cos(t * 0.4 + 3)],
  ];
  ctx.fillStyle = `${INK}0.4)`;
  const step = 7;
  for (let row = 0, y = 0; y <= SIZE + step; row++, y += step * 0.87) {
    for (let x = row % 2 ? step / 2 : 0; x <= SIZE + step; x += step) {
      let v = 0;
      for (const [bx, by] of blobs) {
        v += Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / 900);
      }
      ctx.beginPath();
      ctx.arc(x, y, 0.5 + Math.min(v, 1) * 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

// Topographic lines over a slowly morphing landscape, every fifth one bolder.
const contour: Texture = (ctx, t, dpr) => {
  const w = Math.round(SIZE * dpr);
  const img = ctx.createImageData(w, w);
  const levels = 2.4;
  for (let py = 0; py < w; py++) {
    for (let px = 0; px < w; px++) {
      const x = px / dpr;
      const y = py / dpr;
      const a = x * 0.045 + t * 0.6;
      const b = y * 0.05 - t * 0.4;
      const c = (x - y) * 0.035 + t * 0.3;
      const f = (Math.sin(a) + Math.cos(b) + 0.6 * Math.sin(c)) * levels;
      const gx = 0.045 * Math.cos(a) + 0.021 * Math.cos(c);
      const gy = -0.05 * Math.sin(b) - 0.021 * Math.cos(c);
      const grad = Math.hypot(gx, gy) * levels + 1e-4;
      const frac = f - Math.floor(f);
      const dist = Math.min(frac, 1 - frac) / grad;
      const index = Math.round(f) % 5 === 0;
      const width = index ? 0.9 : 0.45;
      const cover = Math.min(Math.max((width - dist) / 0.7 + 0.5, 0), 1);
      if (cover > 0) {
        const i = (py * w + px) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = cover * (index ? 150 : 90);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
};

// A woven field of hard-edged dashes, switched on and off by drifting noise.
const dashes: Texture = (ctx, t) => {
  ctx.fillStyle = `${INK}0.42)`;
  const cell = 6;
  for (let j = 0; j < SIZE / cell + 1; j++) {
    for (let i = 0; i < SIZE / cell + 1; i++) {
      const x = i * cell;
      const y = j * cell;
      const n =
        0.5 +
        0.3 * Math.sin(x * 0.06 + t * 0.9) * Math.cos(y * 0.05 - t * 0.7) +
        0.2 * Math.sin((x + y) * 0.09 - t * 1.3);
      if (n < BAYER[(i % 4) + (j % 4) * 4]) continue;
      if ((i + j) % 2) ctx.fillRect(x + 1, y + 2.4, 4, 1.2);
      else ctx.fillRect(x + 2.4, y + 1, 1.2, 4);
    }
  }
};

// Drifting bands rendered as chunky Bayer-dithered pixels.
const bayerWave: Texture = (ctx, t) => {
  ctx.fillStyle = `${INK}0.34)`;
  const px = 3;
  for (let j = 0; j < SIZE / px; j++) {
    for (let i = 0; i < SIZE / px; i++) {
      const x = i * px;
      const y = j * px;
      const v =
        0.5 + 0.5 * Math.sin(y * 0.07 + 1.6 * Math.sin(x * 0.045 + t * 0.8) - t * 1.2);
      if (v > BAYER[(i % 4) + (j % 4) * 4]) ctx.fillRect(x, y, px, px);
    }
  }
};

type BadgeDef = {
  id: string;
  name: string;
  // Visits needed to unlock it.
  visits: number;
  color: string;
  texture: Texture;
};

export const BADGES: BadgeDef[] = [
  { id: "spark", name: "First Spark", visits: 1, color: "#a551e6", texture: halftone },
  { id: "regular", name: "Regular", visits: 5, color: "#9ac000", texture: contour },
  { id: "loyal", name: "Loyal", visits: 15, color: "#f65e61", texture: dashes },
  { id: "legend", name: "Legend", visits: 30, color: "#e651a0", texture: bayerWave },
];

// A visit-milestone badge: a glossy tile with a live generative texture. Locked badges are greyed out with a padlock.
export function Badge({
  badge,
  unlocked = true,
}: {
  badge: BadgeDef;
  unlocked?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(SIZE * dpr);
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

    // Each badge starts at its own point in time so they don't look in sync.
    let t = badge.visits * 1.7;
    let last = 0;
    let frame = 0;

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      badge.texture(ctx, t, dpr);
    };

    const tick = (now: number) => {
      t += Math.min(now - last, 50) / 1000;
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    // Animate continuously, but only while on screen. Locked badges and
    // reduced motion get a single still frame.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return stop();
      if (frame || !unlocked || reducedMotion.matches) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    });

    draw();
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [badge, unlocked]);

  const label = unlocked
    ? `${badge.name} badge, ${badge.visits} ${badge.visits === 1 ? "visit" : "visits"}`
    : `${badge.name} badge, locked until ${badge.visits} visits`;

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className="group relative size-[110px]"
    >
      <div
        style={{ "--badge": badge.color } as CSSProperties}
        className={`relative size-full overflow-hidden rounded-[32px] bg-(--badge) shadow-[0_10px_22px_-10px_var(--badge),0_2px_4px_rgba(0,0,0,0.08)] ${
          unlocked
            ? "transition-[translate,box-shadow] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-safe:group-hover:-translate-y-1.5 motion-safe:group-hover:shadow-[0_18px_28px_-12px_var(--badge),0_2px_4px_rgba(0,0,0,0.08)]"
            : "opacity-50 grayscale"
        }`}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute inset-0 size-full"
        />

        {/* Figma's category-icon finish: darker toward the bottom, white rim. */}
        <div className="absolute inset-0 rounded-[inherit] border border-white/32 bg-linear-to-b from-transparent to-black/48 mix-blend-overlay" />
        <div className="absolute inset-x-3 top-1 h-8 rounded-full bg-linear-to-b from-white/35 to-transparent" />

        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <span className="font-makenfy text-[52px] leading-none [text-shadow:0_0_2px_rgba(255,255,255,0.9),0_2px_6px_rgba(0,0,0,0.18)]">
            {badge.visits}
          </span>
          <span className="mt-0.5 font-froundy text-[11px] leading-none text-white/85">
            {badge.visits === 1 ? "visit" : "visits"}
          </span>
        </div>
      </div>

      {!unlocked && (
        <span className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_0_0_1px_#e5e5e5]">
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden>
            <rect x="3" y="7" width="10" height="7.5" rx="2" fill="#404040" />
            <path
              d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
              fill="none"
              stroke="#404040"
              strokeWidth="1.6"
            />
          </svg>
        </span>
      )}
    </div>
  );
}

// The full set, unlocked up to the visitor's visit count. Leave `visits` out
// to show every badge unlocked.
export function Badges({ visits = Infinity }: { visits?: number }) {
  return BADGES.map((badge) => (
    <Badge key={badge.id} badge={badge} unlocked={visits >= badge.visits} />
  ));
}

// Reflections of the set for the shelf beneath it: the face without its live
// texture, which the reflection's blur would hide anyway.
export function BadgeReflections({ visits = Infinity }: { visits?: number }) {
  return BADGES.map((badge) => (
    <Reflected key={badge.id} className="size-[110px]">
      <div
        style={{ background: badge.color }}
        className={`relative flex size-full flex-col items-center justify-center overflow-hidden rounded-[32px] text-white ${
          visits >= badge.visits ? "" : "opacity-50 grayscale"
        }`}
      >
        <div className="absolute inset-0 rounded-[inherit] border border-white/32 bg-linear-to-b from-transparent to-black/48 mix-blend-overlay" />
        <span className="relative font-makenfy text-[52px] leading-none">
          {badge.visits}
        </span>
        <span className="relative mt-0.5 font-froundy text-[11px] leading-none text-white/85">
          {badge.visits === 1 ? "visit" : "visits"}
        </span>
      </div>
    </Reflected>
  ));
}
