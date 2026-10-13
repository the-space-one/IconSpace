import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  useAnimate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type AnimationSequence,
  type Easing,
  type MotionValue,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — the two sparkles trade size, twice
 * (hover)
 *
 *    0ms  big sparkle bottom-left, small one top-right
 *         TRADE — they exchange on a spring: the big one
 *         shrinks to the small size while the small one grows
 *         to the big size. The spring overshoots, so at the
 *         peak the shrinking star goes a little SMALLER than
 *         its target and the growing one a little BIGGER,
 *         then both ring back.
 *         TRADE BACK — the same spring the other way:
 *         big → small → big, once.
 *  ~830ms settled, pixel-identical to rest (§0.2) — the back
 *         half IS the way home, so however many cycles run,
 *         the gesture ends on the rest pose.
 *
 * Measured in headless Chrome, not estimated: 2 crossings of
 * the halfway size and a final radius of exactly 4.80 (rest),
 * on both a mouse hover and a touch tap.
 *
 * SHARPNESS RIDES SIZE. Each star is parametric in two axes:
 * `r` (arm reach) and `pull` (where the flank curves' control
 * points sit, as a fraction of r — 1.0 puts them on the arm
 * tips for a blunt diamond, near 0 pulls them to the centre so
 * the flanks collapse and the arms become needles). pull is
 * interpolated alongside r, so whichever star is currently
 * big is also the sharper one. That is optical, not decorative:
 * stroke width is constant, so a small star drawn at the big
 * one's 0.30 waist would close its inner hole into a blob.
 * Matching them numerically would mismatch them optically.
 *
 * WHY THE STARS SIT ON A DIAGONAL, WELL APART. A full size
 * swap means BOTH seats have to be able to host the big star,
 * which rules out nesting the small one in the big one's
 * notch — mid-swap the two are near-equal and their arms
 * collide. Seats mirrored about the anti-diagonal give 1.6
 * units of clearance at the worst moment (both at r≈3.6) and
 * make the exchange read as a true swap, because the two
 * compositions are mirror images of each other.
 *
 * An earlier pass also spun each star 90° per swap — free in
 * principle, since a 4-fold-symmetric star maps onto itself
 * every 90°. It is not free here: at the halfway point that
 * puts every arm at 45°, pointing straight down the diagonal
 * at its neighbour, and the arms overlap. Size alone carries
 * the gesture.
 *
 * TWO CHOREOGRAPHIES (the GithubIcon / PlayIcon split):
 *   playAnimation()  → real springs — the hover feel
 *   createScrubber() → a keyframed twin, because makeScrubber
 *                      seeks by time and a spring's duration
 *                      is derived. Kept in sync by hand.
 *
 * SPRINGS GO IN DISCRETE animate() CALLS, NEVER IN AN
 * AnimationSequence. Written first as a two-segment sequence
 * with the second overlapped onto the first (`at: "-0.18"`),
 * this icon rendered ONE frame and never moved — verified in
 * headless Chrome, 93 samples, 1 distinct `d`. A sequence
 * pre-resolves a timeline, so a spring (whose duration is
 * derived, not declared) and two overlapping writes to the
 * same MotionValue have nothing coherent to resolve to. Every
 * other spring icon here — GithubIcon, PlayIcon, HomeDoorIcon
 * — awaits separate animate() calls and uses `delay` for the
 * beat between them. Sequences are for tweens (GlobeSpinIcon,
 * GemIcon), which do declare a duration.
 * ───────────────────────────────────────────────────────── */

/** Arm directions, in draw order: up, right, down, left. */
const ARMS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

const n = (v: number) => Number(v.toFixed(3));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A four-pointed sparkle. Each flank is one cubic from arm tip to arm tip
 * whose control points are those same tips pulled toward the centre by
 * `pull` — so the curve leaves each tip along its own axis and the tip stays
 * a true point at any sharpness. Always M C C C C Z, so every scrub seek
 * lands on valid geometry.
 */
function starD(cx: number, cy: number, r: number, pull: number): string {
  const at = (arm: readonly [number, number] | number[], k: number) =>
    `${n(cx + arm[0] * r * k)} ${n(cy + arm[1] * r * k)}`;
  let d = `M${at(ARMS[0], 1)}`;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    d += `C${at(ARMS[i], pull)} ${at(ARMS[j], pull)} ${at(ARMS[j], 1)}`;
  }
  return `${d}Z`;
}

/** The two seats, mirrored about the anti-diagonal. Each is far enough from
 *  its edges to host the BIG star, which is what makes a full swap possible. */
const SEAT_A = { cx: 6.1, cy: 11.9 } as const;
const SEAT_B = { cx: 11.9, cy: 6.1 } as const;

/** The two sizes being traded, and the waist that goes with each. */
const R_BIG = 4.8;
const R_SMALL = 2.4;
const PULL_BIG = 0.3;
const PULL_SMALL = 0.42;

/** swap = 0 → A is the big one; swap = 1 → B is. Spring overshoot pushes
 *  past both ends, which is exactly the pop that sells the exchange. */
const pathA = (s: number) =>
  starD(
    SEAT_A.cx,
    SEAT_A.cy,
    lerp(R_BIG, R_SMALL, s),
    lerp(PULL_BIG, PULL_SMALL, s),
  );

const pathB = (s: number) =>
  starD(
    SEAT_B.cx,
    SEAT_B.cy,
    lerp(R_SMALL, R_BIG, s),
    lerp(PULL_SMALL, PULL_BIG, s),
  );

/* ── Springs (playAnimation) ─────────────────────────────────────────────── */
/** Enough bounce to read as a pop, not a wobble. */
const SWAP_SPRING = {
  type: "spring",
  visualDuration: 0.2,
  bounce: 0.3,
} as const;
/** Beat at each end before it trades back. */
const HOLD = 0.03;
/** How many out-and-back cycles one hover plays: big→small→big, once.
 *  Raising this repeats the trade; the scrub twin below is generated from the
 *  same number, so the two choreographies stay the same length either way. */
const CYCLES = 1;

/* ── Scrub twin (createScrubber) — keyframes only ────────────────────────── */
/**
 * ONE cycle, hand-drawn as the spring's shape: overshoot past the target,
 * correct, settle — out, then back. Both halves start on easeOut (the spring's
 * launch) and correct on easeInOut.
 */
const CYCLE_VALUES = [1.14, 0.95, 1.02, 1, -0.14, 0.05, -0.02, 0];
/** Where each of those lands within its own cycle, as a fraction of it. */
const CYCLE_TIMES = [0.17, 0.28, 0.37, 0.44, 0.61, 0.72, 0.83, 1];
const CYCLE_EASES: Easing[] = [
  "easeOut",
  "easeInOut",
  "easeInOut",
  "easeInOut",
  "easeOut",
  "easeInOut",
  "easeInOut",
  "easeInOut",
];

/** Matches the measured length of the real spring run (~0.83s per cycle), so
 *  the Scrub Lab's timeline is the same length as the hover gesture. */
const SCRUB_TOTAL = 0.83 * CYCLES;
/** Repeated CYCLES times, so the twin tracks however many passes the springs
 *  play without the two definitions drifting apart by hand. */
const SCRUB_KEYFRAMES = [
  0,
  ...Array.from({ length: CYCLES }, () => CYCLE_VALUES).flat(),
];
const SCRUB_TIMES = [
  0,
  ...Array.from({ length: CYCLES }, (_, c) =>
    CYCLE_TIMES.map((t) => (c + t) / CYCLES),
  ).flat(),
];
const SCRUB_EASES: Easing[] = Array.from(
  { length: CYCLES },
  () => CYCLE_EASES,
).flat();

function buildScrubSequence(swap: MotionValue<number>): AnimationSequence {
  return [
    [
      swap,
      SCRUB_KEYFRAMES,
      { duration: SCRUB_TOTAL, times: SCRUB_TIMES, ease: SCRUB_EASES },
    ],
  ];
}

export const SparkleIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  const swap = useMotionValue(0);
  const aRef = useRef<SVGPathElement>(null);
  const bRef = useRef<SVGPathElement>(null);

  const aD = useTransform(swap, pathA);
  useMotionValueEvent(aD, "change", (d) => {
    aRef.current?.setAttribute("d", d);
  });

  const bD = useTransform(swap, pathB);
  useMotionValueEvent(bD, "change", (d) => {
    bRef.current?.setAttribute("d", d);
  });

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      swap.jump(0);
      // Discrete awaited springs, NOT an AnimationSequence — see the
      // storyboard note. Each pass is out (A shrinks, B grows) and back
      // again; the back half is also the way home, so however many cycles
      // run, the gesture ends on the rest pose.
      for (let i = 0; i < CYCLES; i++) {
        await animate(swap, 1, i === 0 ? SWAP_SPRING : { ...SWAP_SPRING, delay: HOLD });
        await animate(swap, 0, { ...SWAP_SPRING, delay: HOLD });
      }
    },
    createScrubber() {
      swap.jump(0);
      return makeScrubber(
        () => animate(buildScrubSequence(swap)),
        // Sequence cancel restores DOM attributes, but the motion value keeps
        // its last scrubbed value; reset so both stars recompute to rest.
        () => swap.jump(0),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* d is driven imperatively from the single swap value. */}
      <path ref={aRef} d={pathA(0)} />
      <path ref={bRef} d={pathB(0)} />
    </svg>
  );
});

SparkleIcon.displayName = "SparkleIcon";
