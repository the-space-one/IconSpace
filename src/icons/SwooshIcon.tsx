import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  useAnimate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type AnimationSequence,
  type MotionValue,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — a trail that flies off into the
 * distance and comes back (one-shot, hover)
 *
 * THE WHOLE ICON IS A DEPTH CUE. The supplied art is one
 * stroked path at a flat 1.5, and a flat line cannot recede:
 * a stroke is the same weight at both ends no matter what
 * the curve does, so the eye reads it as a wire lying on
 * glass. There is no SVG property that tapers a stroke
 * along its length — `stroke-width` is one number for the
 * whole path — so the ribbon here is not stroked at all. It
 * is a FILLED outline, generated per frame, whose width is a
 * function of how far along the path you are.
 *
 * THE WIDTH IS TRUE PERSPECTIVE, not a linear fade. Apparent
 * size goes as 1/z, so the width is W_NEAR / (1 + K·u) with
 * u running 0 at the near end to 1 at the far end. That is
 * what makes the fall-off feel like distance rather than
 * like a brush stroke running out of paint: it drops fast
 * up close and then flattens, exactly as a receding object
 * does. A straight lerp from 2.3 to 0.6 covers the same two
 * endpoints and reads as a wedge.
 *
 * WHICH END IS NEAR IS NOT ARBITRARY. The path starts at
 * (7.75, 15.75), low and centre — the bottom of the frame is
 * where a viewer stands — and ends at (12.25, 0.75), high
 * and small. So u = 0 is the near end and gets the 2.3,
 * u = 1 is the far end and gets the 0.6.
 *
 *      0ms  rest: the full ribbon, thick at the near end,
 *           thinning as it climbs away.
 *   0-400ms FLY AWAY. The TAIL runs forward to the far end
 *           while the head stays put, so the ribbon shortens
 *           into the distance rather than being wiped off
 *           the screen. Because the taper is a function of
 *           POSITION, the surviving piece is thinner every
 *           frame — the thing genuinely gets smaller and
 *           further away, and the last visible sliver is a
 *           0.6-wide speck at the vanishing end. Eased in,
 *           so it accelerates away.
 * 400-480ms gone. A beat of empty frame, which is what makes
 *           the return read as a return.
 * 480-1000ms COME BACK. The head runs out from the near end
 *           on an ease-out: it bursts out of the foreground
 *           at full 2.3 width and settles as it reaches the
 *           distance. Lands on the rest pose exactly (§0.2).
 *
 * ONE PATH, REBUILT PER FRAME. The alternative — chopping
 * the curve into 60 little strokes of stepped width — gives
 * a faceted edge, 60 elements to update, and visible seams
 * where the widths step. Emitting one filled outline is both
 * cheaper and smoother, and the ends get real round caps
 * instead of butt joints.
 *
 * FIXED POINT COUNT, so every scrubbed millisecond lands on
 * valid geometry: the outline is always RIBBON_N points up
 * one side, CAP_N round the head, RIBBON_N back down the
 * other, CAP_N round the tail — whatever the window length,
 * including the degenerate empty one.
 * ───────────────────────────────────────────────────────── */

/** The supplied path, as its three cubics. */
const SEGS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [7.75, 15.75],
    [4.25, 14.5833],
    [0.75007, 13.75],
    [0.75, 9.75],
  ],
  [
    [0.75, 9.75],
    [0.749921, 5.22227],
    [9.32382, 9.52517],
    [14.75, 8.75],
  ],
  [
    [14.75, 8.75],
    [18.25, 8.25],
    [17.75, 4.75],
    [12.25, 0.75],
  ],
];

/* ── Perspective ──────────────────────────────────────────────────────────── */

/**
 * Width at the near end and at the far end, in viewBox units.
 *
 * 2.3 is the ceiling the box allows: the path starts at y 15.75, so half of
 * 2.3 puts the ribbon's edge at 16.90 inside a 17-unit box. 2.6 would push it
 * to 17.05 and crop the near end flat against the frame.
 */
const W_NEAR = 2.3;
const W_FAR = 0.6;
/** Perspective constant: w = W_NEAR / (1 + K·u) hits W_FAR exactly at u = 1. */
const K = W_NEAR / W_FAR - 1;

const widthAt = (u: number) => W_NEAR / (1 + K * u);

/* ── Arc-length parameterisation ──────────────────────────────────────────── */

/**
 * Sampling the cubics by their own t would bunch points where the curve is
 * slow and stretch them where it is fast, which shows up as a ribbon whose
 * edge wobbles. This walks the curve once at build time and stores distance,
 * so `at(u)` is evenly spaced along the LENGTH of the path.
 */
type Sample = { x: number; y: number; tx: number; ty: number; s: number };

const STEPS_PER_SEG = 160;

const cubic = (
  seg: ReadonlyArray<readonly [number, number]>,
  t: number,
  i: number,
) => {
  const u = 1 - t;
  return (
    u * u * u * seg[0][i] +
    3 * u * u * t * seg[1][i] +
    3 * u * t * t * seg[2][i] +
    t * t * t * seg[3][i]
  );
};
const cubicD = (
  seg: ReadonlyArray<readonly [number, number]>,
  t: number,
  i: number,
) => {
  const u = 1 - t;
  return (
    3 * u * u * (seg[1][i] - seg[0][i]) +
    6 * u * t * (seg[2][i] - seg[1][i]) +
    3 * t * t * (seg[3][i] - seg[2][i])
  );
};

const LUT: Sample[] = (() => {
  const out: Sample[] = [];
  let s = 0;
  let prev: [number, number] | null = null;
  SEGS.forEach((seg, si) => {
    for (let i = si === 0 ? 0 : 1; i <= STEPS_PER_SEG; i++) {
      const t = i / STEPS_PER_SEG;
      const x = cubic(seg, t, 0);
      const y = cubic(seg, t, 1);
      if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
      prev = [x, y];
      out.push({ x, y, tx: cubicD(seg, t, 0), ty: cubicD(seg, t, 1), s });
    }
  });
  const total = out[out.length - 1].s;
  return out.map((p) => ({ ...p, s: p.s / total }));
})();

/** Point and unit normal at normalised arc length `u`. */
function at(u: number): { x: number; y: number; nx: number; ny: number } {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  let lo = 0;
  let hi = LUT.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LUT[mid].s <= c) lo = mid;
    else hi = mid;
  }
  const a = LUT[lo];
  const b = LUT[hi];
  const span = b.s - a.s;
  const k = span > 0 ? (c - a.s) / span : 0;
  const x = a.x + (b.x - a.x) * k;
  const y = a.y + (b.y - a.y) * k;
  const tx = a.tx + (b.tx - a.tx) * k;
  const ty = a.ty + (b.ty - a.ty) * k;
  const len = Math.hypot(tx, ty) || 1;
  // Left-hand normal, taken the same way the whole length, so the two edges
  // never swap sides and pinch the ribbon shut.
  return { x, y, nx: -ty / len, ny: tx / len };
}

/* ── The ribbon ───────────────────────────────────────────────────────────── */

/** Samples along each edge, and points in each round cap. Both fixed. */
const RIBBON_N = 44;
const CAP_N = 8;

const f = (v: number) => Number(v.toFixed(3));

/**
 * The tapered ribbon between arc positions `a` and `b`, as a closed outline.
 *
 * Width is read from the ABSOLUTE position on the path, not from the position
 * within the window — that is the whole trick. It means a piece of ribbon
 * keeps whatever thickness its depth gives it, so as the window slides toward
 * the far end the surviving piece really does get thinner rather than just
 * shorter.
 */
function ribbonPath(a: number, b: number): string {
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i < RIBBON_N; i++) {
    const u = a + (b - a) * (i / (RIBBON_N - 1));
    const { x, y, nx, ny } = at(u);
    const h = widthAt(u) / 2;
    left.push(`${f(x + nx * h)} ${f(y + ny * h)}`);
    right.push(`${f(x - nx * h)} ${f(y - ny * h)}`);
  }

  /**
   * Half-circle round the end at `u`, swept from +normal to -normal, bulging
   * along `sign` × the tangent.
   *
   * The sign has to point AWAY from the ribbon at each end — forward at the
   * head, backward at the tail. Get it the wrong way round and the arc is
   * carved out of the body instead of added to it, which is invisible at the
   * 0.6-wide far end and an obvious diagonal bite out of the 2.3-wide near one.
   */
  const cap = (u: number, sign: number) => {
    const { x, y, nx, ny } = at(u);
    const h = widthAt(u) / 2;
    const tx = ny * sign;
    const ty = -nx * sign;
    const pts: string[] = [];
    for (let i = 1; i <= CAP_N; i++) {
      const th = (Math.PI * i) / (CAP_N + 1);
      const c = Math.cos(th);
      const s = Math.sin(th);
      pts.push(`${f(x + (nx * c + tx * s) * h)} ${f(y + (ny * c + ty * s) * h)}`);
    }
    return pts;
  };

  // Up the +normal edge, round the head, back down the -normal edge, round the
  // tail. The tail cap is reversed because the outline arrives at it from the
  // -normal side and has to come back to where the +normal edge started.
  const pts = [
    ...left,
    ...cap(b, 1),
    ...right.reverse(),
    ...cap(a, -1).reverse(),
  ];
  return `M${pts.join("L")}Z`;
}

const REST_D = ribbonPath(0, 1);

/* ── Timing ───────────────────────────────────────────────────────────────── */

const DURATION = 1;
/** Gone by here, back on its way by here. */
const AWAY_END = 0.4;
const BACK_START = 0.48;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Accelerating away. */
const easeIn = (t: number) => t * t * t;
/** Bursting back out of the foreground, settling into the distance. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** The visible window [tail, head] at progress `p`. */
function windowAt(p: number): [number, number] {
  if (p <= AWAY_END) return [easeIn(clamp01(p / AWAY_END)), 1];
  if (p < BACK_START) return [1, 1];
  return [0, easeOut(clamp01((p - BACK_START) / (1 - BACK_START)))];
}

function buildSequence(progress: MotionValue<number>): AnimationSequence {
  // Linear: the shaping lives in windowAt, so easing here would double-ease.
  return [[progress, [0, 1], { duration: DURATION, ease: "linear" }]];
}

export const SwooshIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const ribbonRef = useRef<SVGPathElement>(null);

  const d = useTransform(progress, (p) => {
    const [a, b] = windowAt(p);
    return ribbonPath(a, b);
  });
  useMotionValueEvent(d, "change", (v) =>
    ribbonRef.current?.setAttribute("d", v),
  );

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      progress.jump(0);
      await animate(buildSequence(progress));
    },
    createScrubber() {
      progress.jump(0);
      return makeScrubber(
        () => animate(buildSequence(progress)),
        // Sequence cancel restores DOM attributes, but the motion value keeps
        // its last scrubbed position; reset so the ribbon recomputes to rest.
        () => progress.jump(0),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="17"
      viewBox="0 0 18 17"
      fill="none"
      ref={scope}
      {...props}
    >
      {/* Filled, not stroked — the taper IS the geometry. Rest value in JSX
          because makeScrubber pauses before the first paint. */}
      <path ref={ribbonRef} d={REST_D} fill="currentColor" />
    </svg>
  );
});

SwooshIcon.displayName = "SwooshIcon";
