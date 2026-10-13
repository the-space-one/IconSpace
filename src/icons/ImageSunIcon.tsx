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
 * ANIMATION STORYBOARD — the sun rises out from behind the
 * ridge, holds, and sets again (one-shot, hover)
 *
 * REST IS THE SUPPLIED DRAWING, UNTOUCHED. The sun is parked
 * below the skyline, so the static icon is just a framed
 * landscape — two peaks and no sun. Everything the animation
 * does is give it somewhere to come from.
 *
 *      0ms  rest: the sun sits at cy 15.50, nested exactly
 *           in the valley between the two peaks. It is
 *           drawn, it is just not visible.
 *   0-332ms RISE. cy travels 15.50 → 9.00, straight up out
 *           of the notch, so the first thing you see is a
 *           crown splitting the skyline where the ridges
 *           meet. Eased with a back-out, so it overshoots
 *           0.64 units past its mark and drops back — the
 *           pop of something breaking free rather than
 *           sliding to a stop.
 * 332-579ms HOLD. Full sun in the sky.
 * 579-950ms SET. Back down behind the ridge on a symmetric
 *           ease, slower than the rise: things fall away
 *           more gently than they spring up, and a sunset
 *           that snapped would undo the whole mood.
 *
 * THE OCCLUSION IS THE TRICK, and it costs nothing. The two
 * mountain shapes are filled with PAPER and painted OVER the
 * sun, so the ridge is a mask: the sun is always drawn, at
 * full size, and the peaks simply cover whatever part of it
 * is below the skyline. No clip path, no mask element, no
 * opacity fade — the reveal is geometry, which is why the
 * crown appears as a hard, clean arc instead of ghosting in.
 *
 * PAINT ORDER IS LOAD-BEARING: sun, then the two paper
 * fills, then the outline on top. Move the sun after the
 * fills and it floats over the mountains; move the outline
 * under them and the ridge lines vanish.
 *
 * THE FILL ALONE IS ENOUGH TO HIDE IT, which is what makes
 * the rest pose safe. The near peak's fill begins at y 13.75
 * at the sun's x, and the disc's crown sits at exactly
 * 13.75 — tangent, covered, with the ridge strokes painted
 * over the top as further margin. Nothing here depends on
 * stroke width to conceal the sun, so the rest pose cannot
 * spring a leak if weights are retuned.
 *
 * THE FILLS ARE PAPER, NOT WHITE. They were `fill="white"`
 * as supplied, which is a white wedge on this canvas's dark
 * tiles. var(--icon-paper) is the set's convention for
 * exactly this — an opaque fill whose job is to occlude, not
 * to be seen (BookmarkIcon's ribbon, Calendar2's sheets).
 * The sun is filled with it too, so the ridge lines behind
 * it do not show through the disc.
 *
 * cy IS AN ATTRIBUTE, NOT A TRANSFORM. Translating the sun
 * would work here, but writing the number keeps the stroke
 * at a true 1.5 viewBox units and keeps every pose valid
 * geometry for the scrubber — the same reason CallIcon's
 * rings carry their radius in the path.
 *
 * Everything poses off one progress value, so hover play and
 * the Scrub Lab cannot drift apart, and rest is exact at
 * both ends of the timeline (§0.2).
 * ───────────────────────────────────────────────────────── */

const STROKE = 1.5;

/** Opaque fill whose job is to hide what is behind it, never to be seen. */
const PAPER = "var(--icon-paper, white)";

/** The frame, and the two ridges inside it — the supplied outline, verbatim. */
const FRAME_D =
  "M0.75 12.25V2.25C0.75 1.42157 1.42157 0.75 2.25 0.75H15.25C16.0784 0.75 16.75 1.42157 16.75 2.25V9.75M0.75 12.25V15.25C0.75 16.0784 1.42157 16.75 2.25 16.75H10.25M0.75 12.25L2.18934 10.8107C2.77513 10.2249 3.72487 10.2249 4.31066 10.8107L7.25 13.75M10.25 16.75H15.25C16.0784 16.75 16.75 16.0784 16.75 15.25V9.75M10.25 16.75L7.25 13.75M7.25 13.75L12.2031 7.55866C12.7616 6.86055 13.8029 6.80287 14.435 7.43504L16.75 9.75";

/** The near peak, filled — the left half of the mask. */
const RIDGE_NEAR_D = "M0.75 16.1667V11.5L3.25 9.75L10.25 16.75L0.75 16.1667Z";
/** The far peak, filled — the right half, and the edge the sun crests. */
const RIDGE_FAR_D = "M16.25 16.1667L16.75 9.75L13.25 6.75L5.75 16.25L16.25 16.1667Z";

/* ── The sun ──────────────────────────────────────────────────────────────── */

/** Dead on the valley: the two ridges meet at x 7.25, so the sun rises out of
 *  the notch between the peaks rather than through the side of one. */
const SUN_X = 7.25;
const SUN_R = 1.25;
/**
 * Lighter than the 1.5 the frame is drawn at, but not by as much as the 0.5 it
 * was supplied at — that read as a hairline against the rest of the glyph.
 *
 * 1 is close to the ceiling here, and the limit is geometry rather than taste:
 * the disc's outer radius is SUN_R + half this, and its parked position is set
 * by keeping that radius tangent to the valley, so a heavier stroke pushes the
 * disc DOWN as well as outward. At 1.5 the bottom reaches y 17.75 and clears
 * the frame's outer edge, leaving a sliver of sun showing under the picture at
 * rest. At 1 it stops at 17.25, comfortably covered, and the ring still has a
 * 0.75 hole rather than closing to a dot.
 */
const SUN_STROKE = 1;
/**
 * Not a round number, and not a free one: the disc's outer edge is
 * SUN_R + half its stroke = 1.75, so parking at cy 15.5 lands the crown on
 * y 13.75 — EXACTLY the valley where the two ridges meet. The sun sits nested
 * in the notch, hidden by the near peak's fill on its own, with the ridge
 * strokes over the top as margin.
 *
 * DERIVED FROM THE OTHER TWO. The drawing supplied this as 15.25 against a 0.5
 * stroke, which is the same tangency; thickening the stroke to 1 grew the
 * outer radius by 0.25 and the park point had to follow, or the crown would
 * have surfaced 0.25 above the valley and the sun would peek at rest. Change
 * SUN_R or SUN_STROKE and this has to move again.
 */
const SUN_REST_Y = 15.5;
/**
 * Where it climbs to, taken off the reference: the disc centre sits a little
 * over halfway up the frame, clear of the valley it came out of but well short
 * of the top. An earlier pass ran it to cy 5, which parked the sun up against
 * the frame's ceiling and read as a balloon escaping rather than a sun in a
 * sky. The picture needs the headroom above it more than the sun needs the
 * altitude.
 */
const SUN_PEAK_Y = 9;

/**
 * Shortened with the climb. The rise is 6.25 units now rather than 10.25, and
 * holding the old 1.15s would have paced it at 61% of the original speed —
 * the same move, visibly dragging. Retimed so the rise keeps its old pace:
 * 332ms up, 247ms held, 371ms down.
 */
const DURATION = 0.95;

/** Rise done, and hold done, as fractions of the timeline. */
const RISE_END = 0.35;
const HOLD_END = 0.61;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Back-out: overshoots the target and falls back into it.
 *
 * The textbook constant. Over the 6.5-unit climb it throws the sun 0.64 units
 * past its mark — 10% of the journey, which reads as a buoyant settle rather
 * than a bounce — and the shorter climb leaves 5.1 units of clearance under
 * the frame, so nothing here is near the ceiling any more. An earlier, larger
 * sun on a longer climb had to run this at 0.7 to stay inside the picture.
 */
const BACK = 1.70158;
const easeOutBack = (t: number) => {
  const u = t - 1;
  return 1 + (BACK + 1) * u * u * u + BACK * u * u;
};
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** The sun's centre at progress `p`. Rest at both ends, exactly. */
function sunY(p: number): number {
  if (p <= RISE_END)
    return lerp(SUN_REST_Y, SUN_PEAK_Y, easeOutBack(clamp01(p / RISE_END)));
  if (p <= HOLD_END) return SUN_PEAK_Y;
  return lerp(
    SUN_PEAK_Y,
    SUN_REST_Y,
    easeInOut(clamp01((p - HOLD_END) / (1 - HOLD_END))),
  );
}

function buildSequence(progress: MotionValue<number>): AnimationSequence {
  // Linear: the shaping lives in sunY, so easing the driver would double-ease.
  return [[progress, [0, 1], { duration: DURATION, ease: "linear" }]];
}

export const ImageSunIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const sunRef = useRef<SVGCircleElement>(null);

  const cy = useTransform(progress, sunY);
  useMotionValueEvent(cy, "change", (v) =>
    sunRef.current?.setAttribute("cy", v.toFixed(3)),
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
        // its last scrubbed position; reset so the sun recomputes to rest.
        () => progress.jump(0),
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
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      ref={scope}
      {...props}
    >
      {/* Painted first so the ridges below can cover it. Filled with paper so
          the mountain lines behind the disc do not show through it. Rest value
          in JSX because makeScrubber pauses before the first paint. */}
      <circle
        ref={sunRef}
        cx={SUN_X}
        cy={SUN_REST_Y}
        r={SUN_R}
        strokeWidth={SUN_STROKE}
        fill={PAPER}
      />
      {/* The mask: two filled peaks over the sun, no stroke of their own — the
          outline below draws every visible ridge line. */}
      <path d={RIDGE_NEAR_D} fill={PAPER} stroke="none" />
      <path d={RIDGE_FAR_D} fill={PAPER} stroke="none" />
      {/* Frame and ridges, on top of everything. */}
      <path d={FRAME_D} />
    </svg>
  );
});

ImageSunIcon.displayName = "ImageSunIcon";
