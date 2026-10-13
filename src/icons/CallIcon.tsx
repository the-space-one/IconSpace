import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  motion,
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
 * ANIMATION STORYBOARD — the phone buzzes and throws rings of
 * sound off its earpiece (hover)
 *
 * REST IS A BARE HANDSET. The rings sit at opacity 0, so the
 * static glyph is just the phone — they are the event, not
 * part of the object, and they leave the way they came in.
 *
 *      0ms  rest: handset only, level
 *   0-55ms  KICK — the handset snaps 5.5° counter-clockwise
 *           on an easeOut. The fastest leg of the buzz.
 *  55-430ms it rings down through +4.2°, -2.8°, +1.7°, -0.9°,
 *           +0.4°, each swing ~62% of the last and each
 *           reversal ~60ms apart — about 8Hz, which is a
 *           phone BUZZING. Slower and it reads as a pendulum
 *           swinging, which is what the first pass did.
 *   430ms   handset level and still; the rings carry the rest
 *  60/290/520ms  RING 1 / 2 / 3 leave the earpiece, 230ms
 *           apart. Each expands at CONSTANT speed from 2.4 to
 *           9 units out — a real wavefront does not
 *           accelerate — holding full strength across the
 *           middle of the trip and dissolving on the way out,
 *           because a ripple loses energy as it spreads.
 *           Only ~2 are alive at once, 3 units apart.
 *  1050ms   last ring gone; pixel-identical to rest (§0.2)
 *
 * ── WHAT CHANGED FROM THE FIRST PASS, AND WHY ─────────────
 *
 * THE RINGS NOW ACTUALLY TRAVEL. They used to be three arcs
 * at three FIXED radii, each scaling only 0.72→1.14 — ±14%,
 * barely a twitch. All the apparent outward motion came from
 * the stagger, so it read as three arcs blinking in turn
 * rather than one pulse moving. Now all three are the SAME
 * arc, and each makes the whole journey out from the earpiece.
 * That is what a ripple is: one shape, repeated, travelling.
 *
 * THE RINGS ARE NOT TRANSFORMED AT ALL — their RADIUS is a
 * number in the path. This is the third attempt at the stroke
 * problem and the only correct one:
 *
 *   1. Scaling the group scales its stroke, so a ring at 1.75×
 *      drew a 2.6-wide line. The original tried to dodge it by
 *      parking scale at exactly 1 while opacity was 1 — but
 *      that covered only 19–35% of each ring's life, so across
 *      the whole fade-out the ring was visible AND growing,
 *      and it thickened as it died.
 *   2. `vector-effect: non-scaling-stroke` looked like the fix
 *      and is a trap. It pins the stroke to the OUTERMOST
 *      VIEWPORT's units — screen pixels — ignoring the viewBox
 *      scale entirely. At viewBox 22 rendered at 128px that
 *      scale is 5.8×, so the handset's 1.5 drew ~8.7px while
 *      the rings drew 1.5px. Hairlines next to a chunky phone.
 *   3. Generating the arc from a radius means no transform
 *      touches the rings, so the stroke is exactly 1.5 viewBox
 *      units at every size — identical weight to the handset,
 *      at any rendered size — and the radius is free to travel
 *      as far as the motion wants.
 *
 * THE BUZZ IS TIGHTER AND FASTER. 8° swings 110ms apart read
 * as the whole icon rocking; 5.5° swings 60ms apart read as a
 * phone on a table. Amplitude went down, frequency went up,
 * and the shake now finishes at 430ms so the rings own the
 * back half instead of competing with it.
 *
 * ALL RINGS EXPAND ABOUT THE EARPIECE (10.828, 11.208) —
 * scale about anything else and they slide off their shared
 * source and stop reading as one origin.
 *
 * THE HANDSET TURNS ABOUT ITS OWN CENTRE (9.52, 12.48), which
 * is 1.83 units from the earpiece — so a 5.5° swing drags the
 * emission point by only 0.18 units. That is why the rings can
 * sit still while the phone buzzes under them: the source
 * barely moves. Pivot at the mouthpiece instead and the
 * earpiece swings ~1 unit, tearing the rings off it.
 *
 * Rotation is isometric, so strokeWidth never changes there.
 * ───────────────────────────────────────────────────────── */

/* ── GEOMETRY ──────────────────────────────────────────────
 * The supplied 22×22 glyph filled 97% of its box edge to edge,
 * where LockIcon sits at ~85% — it read a size larger than
 * everything beside it. Every handset coordinate below is the
 * original scaled 0.865 about the ink centre and recentred.
 * The stroke was deliberately NOT scaled with it: it stays
 * 1.5, so this is a smaller phone at the same weight rather
 * than the whole icon zoomed out.
 * ───────────────────────────────────────────────────────── */

/** The handset, one closed silhouette — the rest pose. */
const HANDSET_D =
  "M14.214 19.582C7.114 18.581 3.677 12.125 2.514 7.819" +
  "C2.283 6.962 2.83 6.118 3.687 5.885L5.357 5.429" +
  "C6.243 5.187 7.163 5.68 7.453 6.551L7.982 8.136" +
  "C8.141 8.615 8.084 9.14 7.824 9.573L7.669 9.831" +
  "C7.243 10.541 7.38 11.453 7.995 12.007L10.169 13.964" +
  "C10.799 14.53 11.746 14.558 12.407 14.029L12.559 13.907" +
  "C13.086 13.486 13.81 13.409 14.413 13.711L15.615 14.312" +
  "C16.352 14.68 16.727 15.519 16.51 16.314L15.947 18.377" +
  "C15.736 19.154 15.011 19.694 14.214 19.582Z";

/** The earpiece: where the sound leaves, and the rings' shared centre. */
const EAR_X = 10.828;
const EAR_Y = 11.208;
/** Circle constant — the quarter-arc control offset. */
const KAPPA = 0.5522847498307936;
/** How far the wavefront travels, in viewBox units from the earpiece. */
const RING_MIN = 2.4;
const RING_MAX = 9;

const f = (v: number) => Number(v.toFixed(3));

/**
 * ONE ring at radius `r`: a quarter arc over the earpiece's upper-right, the
 * direction the supplied glyph's arcs faced. Two cubic control points, no `A`
 * command (§2 bans arcs in anything animatable). All three rings share this
 * function; they differ only in when they start.
 */
function ringD(r: number): string {
  const k = r * KAPPA;
  return (
    `M${EAR_X} ${f(EAR_Y - r)}` +
    `C${f(EAR_X + k)} ${f(EAR_Y - r)} ` +
    `${f(EAR_X + r)} ${f(EAR_Y - k)} ` +
    `${f(EAR_X + r)} ${EAR_Y}`
  );
}

/** The handset's own ink centre: it buzzes in place, it does not swing. */
const HANDSET_PIVOT = "9.52px 12.48px";

const DURATION = 1.05;

/** First swing in degrees, then a ring-down at ~62% each. Reversals sit ~60ms
 *  apart — roughly 8Hz, which is a buzz rather than a swing. Fractions are
 *  rebased whenever DURATION changes so the buzz keeps its wall-clock speed. */
const SHAKE = [0, -5.5, 4.2, -2.8, 1.7, -0.9, 0.4, 0, 0];
const SHAKE_TIMES = [0, 0.052, 0.11, 0.167, 0.224, 0.281, 0.338, 0.41, 1];
/** Sharp attack, then a pendulum that runs down, then stillness. */
const SHAKE_EASE: Easing[] = [
  "easeOut",
  "easeInOut",
  "easeInOut",
  "easeInOut",
  "easeInOut",
  "easeInOut",
  "easeInOut",
  "linear",
];

/**
 * One ring's life, and how far apart the three are fired.
 *
 * THESE TWO SET THE GAP BETWEEN RINGS — it is not a free choice. Each ring
 * travels at (RING_MAX - RING_MIN) / RING_LIFE, so consecutive rings end up
 *
 *     separation = speed × RING_STAGGER
 *
 * apart on screen, and the visible gap is that MINUS the 1.5 stroke. At
 * life 0.62 / stagger 0.16 the separation was 1.65 against a 1.5 stroke —
 * 0.15 units of daylight, so the rings rendered as one thick smear. Now:
 * 13.2 u/s × 0.23 = 3.04 apart, a clear 1.54 between edges — about one stroke
 * width of space, which is what makes them read as three.
 */
const RING_LIFE = 0.5;
const RING_STAGGER = 0.23;
const RING_START = 0.06;
/**
 * Full strength across the middle of the journey, so the ring is BIG while it
 * is bright rather than brightest while it is still a stub at the earpiece.
 * Then a long dissolve — a ripple loses energy as it spreads.
 */
const RING_OPACITY = [0, 1, 1, 0];
const RING_OPACITY_TIMES = [0, 0.16, 0.45, 1];
const RING_OPACITY_EASE: Easing[] = ["easeOut", "linear", "easeIn"];

/**
 * Radius and opacity are two entries, not one, because they want different
 * shapes: the wavefront travels at CONSTANT speed (linear — a real wavefront
 * does not accelerate) while the brightness holds and then decays. Fold them
 * into one keyframe array and they are forced to share `times`, which is what
 * flattens a ripple into a blink.
 */
const ring = (index: number, radius: MotionValue<number>): AnimationSequence => {
  const at = RING_START + index * RING_STAGGER;
  return [
    [radius, [RING_MIN, RING_MAX], { at, duration: RING_LIFE, ease: "linear" }],
    [
      `.call-ring-${index + 1}`,
      { opacity: RING_OPACITY },
      {
        at,
        duration: RING_LIFE,
        times: RING_OPACITY_TIMES,
        ease: RING_OPACITY_EASE,
      },
    ],
  ];
};

function buildSequence(radii: MotionValue<number>[]): AnimationSequence {
  return [
    [
      ".call-handset",
      { rotate: SHAKE },
      { at: 0, duration: DURATION, times: SHAKE_TIMES, ease: SHAKE_EASE },
    ],
    ...ring(0, radii[0]),
    ...ring(1, radii[1]),
    ...ring(2, radii[2]),
  ];
}

export const CallIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();

  // One radius per ring, driving its `d` — no transform touches these paths,
  // which is what keeps the stroke at a true 1.5 viewBox units.
  const r1 = useMotionValue(RING_MIN);
  const r2 = useMotionValue(RING_MIN);
  const r3 = useMotionValue(RING_MIN);
  const radii = [r1, r2, r3];
  const p1 = useRef<SVGPathElement>(null);
  const p2 = useRef<SVGPathElement>(null);
  const p3 = useRef<SVGPathElement>(null);
  const paths = [p1, p2, p3];

  const d1 = useTransform(r1, ringD);
  useMotionValueEvent(d1, "change", (d) => p1.current?.setAttribute("d", d));
  const d2 = useTransform(r2, ringD);
  useMotionValueEvent(d2, "change", (d) => p2.current?.setAttribute("d", d));
  const d3 = useTransform(r3, ringD);
  useMotionValueEvent(d3, "change", (d) => p3.current?.setAttribute("d", d));

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      radii.forEach((r) => r.jump(RING_MIN));
      await animate(buildSequence(radii));
    },
    createScrubber() {
      radii.forEach((r) => r.jump(RING_MIN));
      return makeScrubber(
        () => animate(buildSequence(radii)),
        // Sequence cancel restores DOM attributes, but the motion values keep
        // their last scrubbed value; reset so the rings recompute to rest.
        () => radii.forEach((r) => r.jump(RING_MIN)),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      // The outermost ring drifts past the box as it dies, at low opacity.
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* transformOrigin lives in `initial` because Motion overwrites a
          style-level origin with its 50%/50% SVG default; transformBox lives
          in `style`, and is what makes those pixels mean viewBox units.
          Backwards, and every part spins about its own bbox instead. The rest
          values are in `initial` too, so makeScrubber's pre-paint pause holds
          a level handset and hidden rings until the first seek. */}
      <motion.path
        className="call-handset"
        d={HANDSET_D}
        initial={{ rotate: 0, transformOrigin: HANDSET_PIVOT }}
        style={{ transformBox: "view-box" }}
      />
      {/* No transform, no scale, no vector-effect — `d` carries the radius, so
          the stroke is a true 1.5 viewBox units at every size. Invisible at
          rest: the rings are the event, not the object. */}
      {paths.map((pathRef, i) => (
        <motion.path
          key={i}
          ref={pathRef}
          className={`call-ring-${i + 1}`}
          d={ringD(RING_MIN)}
          initial={{ opacity: 0 }}
        />
      ))}
    </svg>
  );
});

CallIcon.displayName = "CallIcon";
