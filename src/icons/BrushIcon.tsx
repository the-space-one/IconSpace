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
 * ANIMATION STORYBOARD — the brush paints a swoosh, then
 * lifts back to rest (one-shot, hover)
 *
 * One sentence: the brush sets down, draws the swoosh under
 * its own bristles, lifts off, and swings home.
 *
 * The sibling of PenLineIcon — same architecture, same four
 * beats (plant · stroke · lift · home), same "the ink is
 * read off the tip" rule. What differs is that the stroke is
 * a supplied piece of artwork with a loop in it, and that
 * changes three things:
 *
 *   · THE PATH IS PARAMETERIZED BY ARC LENGTH, NOT BY t. A
 *     cubic's natural parameter is not distance: feed it t
 *     and the tip races the long shallow middle and crawls
 *     the tight curl, which is exactly the stutter that
 *     reads as "not smooth". PAINT_LUT is a distance table
 *     built once at module load, so `paintAt(f)` means "f of
 *     the way ALONG the swoosh" and the tip travels at an
 *     even speed through all three segments.
 *   · THE BRUSH POINTS AT A FIXED HAND. The swoosh doubles
 *     back on itself, so there is no roll schedule that
 *     works for every part of it — a tangent-follower
 *     unwinds to nothing at the end and the handle sprawls
 *     off the right edge. HAND is instead a single point the
 *     brush always aims at: the tip runs the path, the grip
 *     stays put, and the angle falls out of the geometry.
 *     One consequence is worth the price of admission — the
 *     roll is a continuous function of position, so it is
 *     smooth across every beat boundary for free, and it is
 *     exactly 0 wherever the tip is at rest, which is what
 *     makes §0.2 hold without a special case.
 *   · THE PAINT IS EPHEMERAL (§5.4). Lucide `brush` has no
 *     stroke at rest, so unlike the pen's underline this ink
 *     cannot survive the loop. It grows under the bristles,
 *     is held through the lift, then fades while the brush
 *     swings home.
 *
 *      0ms  REST — identity. The plain Lucide glyph, no ink.
 *    180ms  PLANT — the brush has hopped clear of the paper
 *           and set its tip on the head of the swoosh.
 *    740ms  STROKE — the tip has run all 16.8 units of the
 *           swoosh and the ink has grown under it the whole
 *           way. This beat is over half the timeline; it is
 *           the only one carrying meaning.
 *    830ms  LIFT — bristles pulled 1.2 units clear of the
 *           wet paint. The ink is held, so it cannot un-draw
 *           itself on the way home.
 *   1000ms  REST again, pixel-identical, paint faded out.
 *
 * IT IS OFF-BOX MID-FLIGHT, AND THAT IS THE ONLY OPTION. The
 * resting glyph already spans x 1.4–22.3 of a 24 box, and
 * the handle is 24.2 units from tip to cap — longer than the
 * box is wide. Once the tip leaves its corner there is no
 * angle at all that keeps the cap inside, so the question is
 * only which way it leaves. Aiming at HAND spends that on
 * the right edge (peak x 28.2) and keeps the top nearly
 * clean (peak y -4.3), which is the cheaper of the two: the
 * stage tile has ~56px of padding against ~22px of spill at
 * render size, and it is never off-box at rest.
 * ───────────────────────────────────────────────────────── */

/** Lucide `brush`, unchanged — the ferrule line, the bristle blob, the handle. */
const FERRULE_D = "m11 10 3 3";
const BRISTLES_D =
  "M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z";
const HANDLE_D =
  "M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031";

/* ── The swoosh ───────────────────────────────────────────────────────────── */

type Pt = readonly [number, number];
/** A cubic segment as [start, control 1, control 2, end]. */
type Cubic = readonly [Pt, Pt, Pt, Pt];

/**
 * The supplied artwork, verbatim, still on its own 19x15 canvas. Left in
 * source coordinates and mapped by SWOOSH_FIT below rather than re-typed at
 * icon scale, so it stays diffable against the SVG it came from.
 */
const SWOOSH_SRC: readonly Cubic[] = [
  [
    [7.75, 13.7501],
    [5.74987, 13.2501],
    [0.750082, 11.3077],
    [0.75, 7.75012],
  ],
  [
    [0.75, 7.75012],
    [0.749884, 2.75012],
    [9.82358, 7.52529],
    [15.2498, 6.75012],
  ],
  [
    [15.2498, 6.75012],
    [19.2498, 6.17869],
    [19.7498, 3.75012],
    [13.2498, 0.750122],
  ],
];

/** Tight bounds of the CURVE, measured by sampling — not the bounds of its
 *  control points, which reach x 19.75 and would leave the fit undersized. */
const SWOOSH_BOUNDS = { x0: 0.75, y0: 0.75, x1: 18.208, y1: 13.75 };

/**
 * Where the swoosh lands in the 24x24 icon box, aspect preserved.
 *
 * Height is what binds — the width is deliberately given more room than the
 * fit can use, so this reads as "6 units tall, along the bottom". Height is
 * also the expensive axis: every unit the swoosh climbs is a unit the tip ends
 * up higher, and a tip 6 units off the floor puts the far end of a 24-unit
 * handle well outside the box no matter how it is rolled.
 */
const SWOOSH_FIT = { x: 2, y: 16, w: 20, h: 6 };

const FIT_K = Math.min(
  SWOOSH_FIT.w / (SWOOSH_BOUNDS.x1 - SWOOSH_BOUNDS.x0),
  SWOOSH_FIT.h / (SWOOSH_BOUNDS.y1 - SWOOSH_BOUNDS.y0),
);
const FIT_X = SWOOSH_FIT.x - SWOOSH_BOUNDS.x0 * FIT_K;
const FIT_Y = SWOOSH_FIT.y - SWOOSH_BOUNDS.y0 * FIT_K;

const SWOOSH: readonly Cubic[] = SWOOSH_SRC.map(
  (seg) => seg.map(([x, y]) => [x * FIT_K + FIT_X, y * FIT_K + FIT_Y]) as unknown as Cubic,
);

const n = (v: number) => v.toFixed(3);
const PAINT_D =
  `M${n(SWOOSH[0][0][0])} ${n(SWOOSH[0][0][1])}` +
  SWOOSH.map(
    (seg) => `C${seg.slice(1).map((p) => `${n(p[0])} ${n(p[1])}`).join(" ")}`,
  ).join("");

/** Chunkier than the 1.75 glyph so it reads as laid-down paint rather than one
 *  more outline, but not so chunky that the loop fills in at 20px. */
const PAINT_WIDTH = 2;

/* ── Arc-length parameterization ──────────────────────────────────────────── */

const cubic = (a: number, b: number, c: number, d: number, s: number) => {
  const u = 1 - s;
  return u * u * u * a + 3 * u * u * s * b + 3 * u * s * s * c + s * s * s * d;
};

/** Samples per segment. At this path's size the samples land ~0.07 units
 *  apart, which is a third of a pixel at the largest size the icon renders. */
const LUT_STEPS = 80;

/**
 * Cumulative distance along the swoosh, sampled once at module load.
 *
 * This exists because a cubic's parameter t is NOT distance. On this path the
 * middle segment covers roughly twice the ground of the first for the same
 * span of t, so driving the tip by t makes it lurch between segments — the
 * "not smooth" failure. Walking this table instead means equal time is equal
 * distance, and the ink, which is measured in distance, stays locked to it.
 */
const PAINT_LUT: Array<{ l: number; x: number; y: number }> = (() => {
  const lut: Array<{ l: number; x: number; y: number }> = [];
  let total = 0;
  let prev: Pt | null = null;
  SWOOSH.forEach((seg, si) => {
    for (let i = si === 0 ? 0 : 1; i <= LUT_STEPS; i++) {
      const s = i / LUT_STEPS;
      const x = cubic(seg[0][0], seg[1][0], seg[2][0], seg[3][0], s);
      const y = cubic(seg[0][1], seg[1][1], seg[2][1], seg[3][1], s);
      if (prev) total += Math.hypot(x - prev[0], y - prev[1]);
      prev = [x, y];
      lut.push({ l: total, x, y });
    }
  });
  return lut;
})();

/** Total length of the swoosh — the dasharray, and the yardstick the ink is
 *  measured against. */
const PAINT_LEN = PAINT_LUT[PAINT_LUT.length - 1].l;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** The point `f` of the way ALONG the swoosh, by distance. */
function paintAt(f: number): { x: number; y: number } {
  const target = clamp01(f) * PAINT_LEN;
  let lo = 0;
  let hi = PAINT_LUT.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (PAINT_LUT[mid].l <= target) lo = mid;
    else hi = mid;
  }
  const a = PAINT_LUT[lo];
  const b = PAINT_LUT[hi];
  const t = b.l > a.l ? (target - a.l) / (b.l - a.l) : 0;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/* ── Geometry, in viewBox units ───────────────────────────────────────────── */

/**
 * The bristle contact point — the outer corner of the tail at the bottom-left
 * of the bristle blob, where the path's r=1 arc closes back to (3, 21). Every
 * rotation pivots here and every pose is stated as "put this point there",
 * because it is the only part of a brush that touches paper.
 */
const TIP_X = 2.4;
const TIP_Y = 20.6;

/**
 * The hand — roughly where a grip would sit on the upper third of the handle.
 * The brush always points at it, so the roll is whatever the geometry says
 * rather than a schedule to hand-tune.
 *
 * Because the roll is measured RELATIVE to where this aims at rest, it comes
 * out exactly 0 when the tip is home — for ANY HAND at all. What the position
 * buys is how MUCH the brush turns: a hand far off-frame barely turns it and
 * lets the handle sprawl past the right edge, a hand down near the ferrule
 * spins it hard and stands it out the top. This spot peaks at ~17° of roll for
 * 4.9 units of spill, which is the most turn the frame will pay for — the
 * next step up costs a unit of box for four more degrees.
 */
const HAND = { x: 16, y: 6 };
const HAND_AT_REST = Math.atan2(HAND.y - TIP_Y, HAND.x - TIP_X);

const rollAt = (x: number, y: number) =>
  ((Math.atan2(HAND.y - y, HAND.x - x) - HAND_AT_REST) * 180) / Math.PI;

/* ── The four beats ───────────────────────────────────────────────────────── */

const PLANT_AT = 0.18;
const LIFT_OFF_AT = 0.74;
const LIFTED_AT = 0.83;

const SWOOSH_START = paintAt(0);
const SWOOSH_END = paintAt(1);

/** Where the bristles go when they leave the paint. Small: the tip is already
 *  6 units off the floor here, and every unit of lift is another unit of
 *  handle out the top of the box. */
const LIFT_DX = 0.2;
const LIFT_DY = 1.2;

/**
 * How far the brush arcs off the paper on the two legs that touch REST, so it
 * travels through the air instead of skidding across the canvas. The way home
 * gets a fraction of the way out — the brush is already lifted clear by then,
 * and a hop only buys height it does not need.
 */
const HOP_OUT = 1.2;
const HOP_BACK = 0.5;

/** The paint fades between these — after the lift, before rest. */
const FADE_FROM = LIFTED_AT;
const FADE_TO = 0.97;

const DURATION = 1;

/**
 * The bristle tip at progress `p`, plus how much of the swoosh has been laid
 * down by then. Both come out of one function on purpose: during the stroke
 * the drawn fraction IS the tip's position along the path, so there is no way
 * for the ink to lag behind the brush or run ahead of it.
 */
function tipAt(p: number): { x: number; y: number; drawn: number } {
  if (p <= PLANT_AT) {
    const t = easeInOut(clamp01(p / PLANT_AT));
    return {
      x: lerp(TIP_X, SWOOSH_START.x, t),
      y: lerp(TIP_Y, SWOOSH_START.y, t) - Math.sin(Math.PI * t) * HOP_OUT,
      drawn: 0,
    };
  }
  if (p <= LIFT_OFF_AT) {
    const f = easeInOut(clamp01((p - PLANT_AT) / (LIFT_OFF_AT - PLANT_AT)));
    return { ...paintAt(f), drawn: f };
  }
  if (p <= LIFTED_AT) {
    const t = easeInOut(clamp01((p - LIFT_OFF_AT) / (LIFTED_AT - LIFT_OFF_AT)));
    return {
      x: SWOOSH_END.x + LIFT_DX * t,
      y: SWOOSH_END.y - LIFT_DY * t,
      drawn: 1,
    };
  }
  const t = easeInOut(clamp01((p - LIFTED_AT) / (1 - LIFTED_AT)));
  return {
    x: lerp(SWOOSH_END.x + LIFT_DX, TIP_X, t),
    y:
      lerp(SWOOSH_END.y - LIFT_DY, TIP_Y, t) -
      Math.sin(Math.PI * t) * HOP_BACK,
    drawn: 1,
  };
}

/**
 * rotate() takes the bristle tip as its origin, so the handle swings while the
 * tip stays put; the translate that follows is then just "put the tip here".
 * At p = 0 and p = 1 both resolve to the identity, so rest is the plain glyph.
 */
function brushTransform(p: number): string {
  const { x, y } = tipAt(p);
  return `translate(${(x - TIP_X).toFixed(3)} ${(y - TIP_Y).toFixed(3)}) rotate(${rollAt(x, y).toFixed(2)} ${TIP_X} ${TIP_Y})`;
}

/**
 * THE STROKE MUST BE ABLE TO BE FULLY HIDDEN, AND THAT IS FIDDLIER THAN IT
 * LOOKS. The obvious spelling — dasharray LEN, offset LEN — does not hide it,
 * for two compounding reasons:
 *
 *   · the offset is written to the DOM rounded, so "offset = LEN" lands a hair
 *     UNDER LEN and leaves a sliver of dash at the head of the path. Under a
 *     round cap a sliver is not a sliver, it is a full-width DOT — a blob of
 *     paint sitting on the canvas before the brush has drawn anything.
 *   · a bare `dasharray: LEN` means dash LEN, gap LEN, so the pattern repeats
 *     every 2·LEN. Overshooting the offset to clear the head then drags the
 *     NEXT dash onto the tail of the path instead.
 *
 * So both ends get slack. The dash is a MARGIN longer than the path and the
 * gap is twice the dash (putting the repeat out of reach), and "hidden" is
 * another MARGIN past that — 0.05 units, fifty times the rounding error and
 * 0.3% of the stroke, which is the entire cost: the ink starts flowing 0.3%
 * into the sweep instead of at 0.
 */
const PAINT_MARGIN = 0.05;
const PAINT_DASH = PAINT_LEN + PAINT_MARGIN;
const PAINT_HIDDEN = PAINT_DASH + PAINT_MARGIN;

/** How far the dash pattern is pushed back: PAINT_HIDDEN shows nothing,
 *  PAINT_MARGIN shows the whole swoosh. */
const dashAt = (p: number) => PAINT_HIDDEN - tipAt(p).drawn * PAINT_DASH;

/** Zero until the bristles land (nothing is drawn yet), then held while the
 *  stroke is laid down, then faded out so rest is the untouched glyph. */
function paintOpacityAt(p: number): number {
  if (p < PLANT_AT) return 0;
  if (p <= FADE_FROM) return 1;
  return 1 - clamp01((p - FADE_FROM) / (FADE_TO - FADE_FROM));
}

function buildSequence(progress: MotionValue<number>): AnimationSequence {
  // Linear: every beat's shaping lives in the functions above, so easing the
  // driver as well would double-ease the whole timeline.
  return [[progress, [0, 1], { duration: DURATION, ease: "linear" }]];
}

export const BrushIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();
    const shouldReduceMotion = useReducedMotion();
    const progress = useMotionValue(0);
    const bodyRef = useRef<SVGGElement>(null);
    const paintRef = useRef<SVGPathElement>(null);

    // Written to SVG ATTRIBUTES, not to style.transform — the attribute takes
    // `translate(x y)` unitless and `rotate(deg cx cy)` with a centre, while
    // CSS wants `translate(xpx, ypx)` and a one-argument `rotate(Ndeg)`.
    // Feeding attribute syntax to the CSS property invalidates the whole
    // declaration and nothing moves at all. Going through the attribute also
    // keeps the rotation centre on the bristle tip for free, with no
    // transformBox/transformOrigin pair to get backwards.
    const bodyTf = useTransform(progress, brushTransform);
    useMotionValueEvent(bodyTf, "change", (t) =>
      bodyRef.current?.setAttribute("transform", t),
    );

    // No transform touches the paint, so its stroke stays a true PAINT_WIDTH
    // viewBox units at every rendered size.
    const dash = useTransform(progress, dashAt);
    useMotionValueEvent(dash, "change", (d) =>
      paintRef.current?.setAttribute("stroke-dashoffset", d.toFixed(3)),
    );

    const paintOpacity = useTransform(progress, paintOpacityAt);
    useMotionValueEvent(paintOpacity, "change", (o) =>
      paintRef.current?.setAttribute("opacity", o.toFixed(3)),
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
          // its last scrubbed position; reset so both recompute to rest.
          () => progress.jump(0),
        );
      },
    }));

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        // The handle leaves the box mid-stroke — see the storyboard.
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        {/* The paint, drawn behind the brush so the bristles ride over their own
            ink rather than under it. Rest values in JSX because makeScrubber
            pauses before the first paint. */}
        <path
          ref={paintRef}
          d={PAINT_D}
          strokeWidth={PAINT_WIDTH}
          strokeDasharray={`${PAINT_DASH} ${PAINT_DASH * 2}`}
          strokeDashoffset={PAINT_HIDDEN}
          opacity={0}
        />
        {/* One group, so the brush turns as a single object — splitting it
            would let the handle and the bristles drift apart. */}
        <g ref={bodyRef} transform={brushTransform(0)}>
          <path d={FERRULE_D} />
          <path d={BRISTLES_D} />
          <path d={HANDLE_D} />
        </g>
      </svg>
    );
  },
);

BrushIcon.displayName = "BrushIcon";
