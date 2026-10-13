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
 * ANIMATION STORYBOARD — the arrow is drawn back like a dart,
 * then thrown; its wings spin up around the shaft (hover)
 *
 *     0ms  arrow at rest, wings open, stroke 2.5
 *  0-400ms DRAW BACK — the whole arrow slides 2.5 units LEFT,
 *          decelerating into the pull. The wings have barely
 *          started turning (~44° by here): the quiet half of
 *          the wind-up.
 *   400ms  held at the back for 70ms — the beat before release
 *   470ms  THROW — the arrow snaps a full 5.5 units forward,
 *          carrying 3 units PAST its rest spot, on an expo-out;
 *          the wings WHIP through 165° → 280° in the next
 *          fifth of a second
 *   745ms  the arrow eases back to rest as the spin finishes
 *  1200ms  wings land at 360°, arrow at 0 — pixel-identical
 *          to rest (§0.2)
 *
 * ONLY THE WINGS ROTATE, and that is forced rather than
 * chosen: the axis of rotation IS the shaft. Anything lying on
 * the axis is fixed under a rotation about it, so the shaft
 * cannot turn — it only slides, and only its THICKNESS reacts.
 *
 * ── Why this reads as 3D (docs/3D-ANIMATION.md) ────────────
 * The first version of this icon only foreshortened the wings
 * (spread = 7·cosθ) and left both strokes at 2.5. That is the
 * approach the doc explicitly rejects — "foreshorten only:
 * reads flat at every angle except the crossfaded instant" —
 * and it did. Nothing ever gained volume, so it read as a
 * chevron being squashed, not an object turning.
 *
 * The fix is thickness. The arrow is a PLATE of half-thickness
 * E lying in the icon plane, turning about the shaft. Its two
 * faces sit at ±E, so under the projection they separate in y
 * by 2E·sinθ, and every stroke becomes the hull of its own two
 * offset copies — i.e. the same stroke WIDENED. Per doc §3, a
 * rod lying ALONG the axis widens exactly:
 *
 *     width(θ) = w₀·|cosθ| + 2E·|sinθ|     (2.5 → 3.5 → 2.5)
 *
 * so edge-on the shaft is a solid 3.5-unit slab, not a 2.5
 * line. That swelling is the whole depth cue — geometry only,
 * one currentColor, no shading, no crossfade (§2.4).
 *
 * The wings are the same idea on a rod that is NOT on the
 * axis and whose direction changes as it turns, so the two
 * components have to be projected separately. In-plate the
 * wing runs (-7, +7) from the tip; at angle θ it projects to
 * (-7, 7cosθ), so with L = √(1+cos²θ):
 *
 *     width(θ) = [√2·w₀·|cosθ| + 2E·|sinθ|] / L
 *
 * — the first term is the wing's own stroke foreshortening,
 * the second the extrusion. It hits w₀ exactly at rest and 2E
 * exactly edge-on, where the wings lie flat along the axis and
 * vanish flush inside the shaft's slab: an arrow seen down its
 * own plane shows no head, exactly as KeyIcon's teeth vanish
 * into its blade.
 *
 * Skipped deliberately: the hull also stretches ALONG each
 * wing by 2E·|sinθcosθ|/L. Adding it would push the wings past
 * the tip and blunt the arrowhead's point; it peaks at 0.6
 * units near 45° and the round caps already cover most of it.
 *
 * LOOP: spread = 7·cosθ, so every multiple of 180° maps the
 * chevron onto itself (the wings simply swap, and the chevron
 * is symmetric) while both widths return to w₀. 360° therefore
 * lands on the rest pose exactly — §5 strategy 3, composition
 * hand-off, no fade and no clone.
 *
 * THE SPIN EASE IS THE POINT: [0.85, 0, 0.45, 1] stays flat
 * through the whole wind-up and then whips — 2° at 10% of the
 * way, 44° at 40%, 165° at 60%, 281° at 70%. Slow, then very
 * fast, with just enough curve in the tail to land instead of
 * hard-cutting. A plain easeIn would end at maximum speed and
 * stop dead.
 *
 * TWEENS IN A SEQUENCE, NOT SPRINGS. Springs must go in
 * discrete animate() calls (see SparkleIcon); tweens declare a
 * duration, so they resolve in a sequence and stay seekable —
 * one definition serves playAnimation() and the Scrub Lab.
 * ───────────────────────────────────────────────────────── */

const n = (v: number) => Number(v.toFixed(3));

/** The shaft — which is also the axis of rotation. */
const AXIS_Y = 12;
const TAIL_X = 5;
const TIP_X = 19;
/** Where the wings' trailing ends sit, and how far off the axis. */
const WING_X = 12;
const WING_SPREAD = 7;

const STROKE = 2.5;
/**
 * Half-thickness of the plate, viewBox units — the edge-on slab is 2E = 3.5.
 * The doc's rule of thumb is 2E ≈ 3 on a 24 grid; this glyph's stroke is a
 * heavy 2.5, so 3.5 keeps KeyIcon's slab-to-stroke ratio (~1.4×) and stays
 * legible as a swelling rather than reading as a 1-unit nudge.
 */
const EXTRUDE = 1.75;

/** Two collapse-and-reopen beats. Any multiple of 180 lands on rest. */
const SPIN_DEGREES = 360;
/** Dart travel, viewBox units: back on the wind-up, past rest on the throw. */
const DRAW_BACK = 2.5;
const THROW_PAST = 3;

/**
 * The whole glyph for one (slide, angle) pair. Both paths carry a per-frame
 * stroke-width — that widening IS the depth, so it is not optional garnish.
 */
function frame(dx: number, deg: number) {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const ac = Math.abs(cos);
  const as = Math.abs(sin);
  // Projected length factor of the wing's in-plate direction (-7, 7).
  const L = Math.sqrt(1 + cos * cos);
  const spread = WING_SPREAD * cos;

  return {
    // On-axis rod: doc §3 exactly. w₀ at rest, 2E edge-on. Widths are strings
    // because they go straight to setAttribute.
    shaftWidth: (STROKE * ac + 2 * EXTRUDE * as).toFixed(3),
    shaftD: `M${n(TAIL_X + dx)} ${AXIS_Y}H${n(TIP_X + dx)}`,
    // Off-axis diagonal rod: own stroke foreshortens, extrusion adds width.
    wingWidth: ((Math.SQRT2 * STROKE * ac + 2 * EXTRUDE * as) / L).toFixed(3),
    // Both wings as one polyline through the tip. Always M L L, so every
    // scrub seek lands on valid geometry. At dx=0, θ=0 this is the supplied
    // glyph's head exactly: M12 19L19 12L12 5.
    wingsD:
      `M${n(WING_X + dx)} ${n(AXIS_Y + spread)}` +
      `L${n(TIP_X + dx)} ${AXIS_Y}` +
      `L${n(WING_X + dx)} ${n(AXIS_Y - spread)}`,
  };
}

const REST = frame(0, 0);

const DURATION = 1.2;

/** Wind up slow, whip, short landing — see the storyboard note. */
const SPIN_EASE: Easing = [0.85, 0, 0.45, 1];

/** Pull back, hold, snap forward past rest, ease home. */
const SLIDE_KEYFRAMES = [0, -DRAW_BACK, -DRAW_BACK, THROW_PAST, 0];
const SLIDE_TIMES = [0, 0.33, 0.39, 0.62, 1];
const SLIDE_EASES: Easing[] = [
  "easeOut",
  "linear",
  [0.16, 1, 0.3, 1],
  "easeInOut",
];

function buildSequence(
  spin: MotionValue<number>,
  slide: MotionValue<number>,
): AnimationSequence {
  return [
    [spin, [0, 1], { duration: DURATION, ease: SPIN_EASE }],
    [
      slide,
      SLIDE_KEYFRAMES,
      { at: 0, duration: DURATION, times: SLIDE_TIMES, ease: SLIDE_EASES },
    ],
  ];
}

export const ArrowIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  const spin = useMotionValue(0);
  const slide = useMotionValue(0);
  const shaftRef = useRef<SVGPathElement>(null);
  const wingsRef = useRef<SVGPathElement>(null);

  // One computed frame feeds both paths, so the shaft and wings can never
  // disagree about the angle they are drawn at.
  const pose = useTransform(() => frame(slide.get(), spin.get() * SPIN_DEGREES));
  useMotionValueEvent(pose, "change", (f) => {
    const shaft = shaftRef.current;
    if (shaft) {
      shaft.setAttribute("d", f.shaftD);
      shaft.setAttribute("stroke-width", f.shaftWidth);
    }
    const wings = wingsRef.current;
    if (wings) {
      wings.setAttribute("d", f.wingsD);
      wings.setAttribute("stroke-width", f.wingWidth);
    }
  });

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      spin.jump(0);
      slide.jump(0);
      await animate(buildSequence(spin, slide));
    },
    createScrubber() {
      spin.jump(0);
      slide.jump(0);
      return makeScrubber(
        () => animate(buildSequence(spin, slide)),
        // Sequence cancel restores DOM attributes, but the motion values keep
        // their last scrubbed value; reset so both paths recompute to rest.
        () => {
          spin.jump(0);
          slide.jump(0);
        },
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      // The dart travel runs 2.5 left and 3 right of the glyph's own box.
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* d and stroke-width are both driven from the slide / spin values. */}
      <path ref={shaftRef} d={REST.shaftD} strokeWidth={REST.shaftWidth} />
      <path ref={wingsRef} d={REST.wingsD} strokeWidth={REST.wingWidth} />
    </svg>
  );
});

ArrowIcon.displayName = "ArrowIcon";
