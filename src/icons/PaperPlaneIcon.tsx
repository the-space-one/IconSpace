import { forwardRef, useId, useImperativeHandle, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — the plane is drawn back like a dart,
 * thrown out of the frame, and comes round again (hover)
 *
 * The wind-up is ArrowIcon's dart, on a diagonal: same 299ms
 * easeOut draw-back, same held beat, same deliberate slow half
 * before anything fast happens. What follows is not the
 * arrow's — a dart stops 3 units past rest, this leaves.
 *
 *     0ms  plane at rest
 *  0-299ms DRAW BACK — it slides 2.2 units DOWN-LEFT along its
 *          own flight line, decelerating into the pull, and
 *          tips its nose up 9° as it gathers.
 *   299ms  HELD at the back for 58ms — the beat before release.
 *          Without it the throw reads as a twitch; the pause is
 *          what makes it read as a throw.
 * 357-525ms THROW. The hand accelerates it for the first 27ms and
 *          then LETS GO: from there the speed is constant, which
 *          is the difference between a throw and a rocket. It
 *          noses over 5° and has crossed the frame edge by
 *          497ms — well before the phase ends, which is what
 *          buys the empty beat; see FLIGHT_OUT.
 *          The arrow's expo-out is deliberately NOT reused here.
 *          That curve decelerates INTO its target, which is
 *          right for a dart landing 3 units past rest and wrong
 *          for something meant to leave and keep going.
 * 497-648ms EMPTY FRAME. Nothing on screen for 151ms, and that
 *          beat is load-bearing: without it the plane re-enters
 *          the same frame it left and the whole thing reads as a
 *          teleport glitch rather than as something flying away
 *          and coming back round.
 * 525-604ms OFF-FRAME, LEVELLING. The nose comes back down from
 *          5° to 0 here, out of sight. This beat exists so that
 *          straightening up never happens in front of the
 *          viewer — see flightTilt.
 *   604ms  WRAP — offset flips +34 → −34 in one frame. Both ends
 *          sit 5-6 units clear of the clip, so the jump cannot
 *          be seen; see FLIGHT_OUT.
 * 604-1050ms RETURN, flown entirely at rest attitude. It enters
 *          from the BOTTOM-LEFT, fast, and bleeds speed to drag
 *          all the way home. It only becomes visible at 648ms,
 *          44ms after it finished levelling, so the sole pose
 *          the frame ever shows on the way back is the resting
 *          one and all there is to watch is distance closing.
 *          Ends pixel-identical to 0ms — exactly, not
 *          approximately — so replays and scrub wraps are
 *          invisible (§0.2).
 *
 * NOTHING SCALES. The plane is the same size in every frame of
 * the gesture; it only ever translates and rotates.
 *
 * THE BOX IS A REAL EDGE HERE, and it is a clipPath rather
 * than overflow:hidden. The gesture needs the plane to
 * genuinely vanish past the top-right, stay gone, and reappear
 * at the bottom-left — nothing clips it otherwise, since
 * neither .stage nor the sidebar row sets overflow, so an
 * unclipped plane would sail out across the page and then be
 * seen snapping back. Clipping the flight group instead of the
 * <svg> keeps overflow:visible on the root, as §1 wants, and
 * keeps the clip travelling with the icon wherever it is
 * exported to rather than depending on a style on the root.
 *
 * ONE AXIS. Back, throw and return all run along the plane's
 * own crease — tail (5.54, 9.23) to nose (16.99, 0.95) — so
 * the whole gesture is a single scalar offset projected onto
 * that unit vector. The plane always travels the way it points,
 * which is the only reason a 34-unit throw still reads as one
 * object rather than a shape sliding across a tile. It is also
 * why the return arrives from the bottom-left without anything
 * having to aim it there: −34 along an axis pointing up-right
 * IS the bottom-left corner.
 *
 * Everything derives from ONE progress value through pure
 * functions, which is also what makes the wrap possible: a
 * keyframed +34 → −34 would TWEEN, flashing the plane back
 * across the frame. A sampled function just steps. It also
 * keeps the Scrub Lab seeking a fixed, reproducible timeline.
 * ───────────────────────────────────────────────────────── */

const DURATION = 1.05;

/** Flight axis: the plane's own crease, tail → nose, normalised. */
const CREASE = { x: 16.9912 - 5.53662, y: 0.953213 - 9.22908 };
const CREASE_LEN = Math.hypot(CREASE.x, CREASE.y);
const UX = CREASE.x / CREASE_LEN;
const UY = CREASE.y / CREASE_LEN;

/** Phase boundaries, as fractions of DURATION. */
const P_BACK = 0.285; // wind-up ends
const P_HOLD = 0.34; // held beat ends, throw begins
const P_GONE = 0.5; // throw ends; the plane left the frame a while back
const P_AWAY = 0.575; // off-frame beat ends — the wrap happens HERE

/**
 * How far back it gathers, in viewBox units along the flight axis.
 * ArrowIcon draws back 2.5 on a 24 grid; this is the same gesture scaled to a
 * 19-wide box.
 */
const PULL = -2.2;

/**
 * How much bigger than the viewBox the clip is, per side.
 *
 * It cannot be zero. The glyph is inscribed edge to edge — its ink stops
 * 0.001 units inside the box on the left and top — so a clip on the viewBox
 * itself shaves the tail off during the wind-up, before the plane has gone
 * anywhere. The pull is 2.2 units along an axis that is 0.81 horizontal and
 * the 9° nose-up swings the tail further left still, so at full cock the tail
 * tip sits about 2.1 units outside the box. Three units of breathing room
 * clears it with most of a unit spare.
 *
 * The cost is that the plane winks out a shade outside the tile rather than
 * exactly on its border. At icon sizes that is a fraction of a pixel; being
 * clipped mid-wind-up would not be.
 */
const CLIP_PAD = 3;

/**
 * How far out the throw carries — and, mirrored, how far out the return
 * starts. One number for both, so the wrap is a pure sign flip and the two
 * sides of it are the same distance out.
 *
 * The plane's ink spans x ∈ [0.0, 18.07] and the clip runs to x = 22, so
 * clearing the right edge takes about 28 units at full size. 34 leaves the
 * plane 5.4 units clear of the right edge and 6.4 clear of the left at the
 * moment of the jump, which is what makes the wrap unseeable.
 *
 * It has to overshoot the exit distance by a good margin, not just meet it.
 * The throw runs at constant speed, so the plane crosses the frame edge at a
 * FIXED fraction of the throw phase no matter how long that phase is —
 * lengthening the phase does not buy an empty-frame beat, only a longer
 * throw does.
 *
 * THE PLANE NEVER CHANGES SIZE. An earlier version scaled it by distance,
 * on the theory that something flying away should recede; at icon size that
 * does not read as depth, it reads as the icon growing on its way back in.
 * Translation and rotation only.
 */
const FLIGHT_OUT = 34;

/** Nose attitude, in degrees. Negative is nose-up (SVG y points down). */
const TILT_BACK = -9;
/** Where the nose ends up through the throw, before it levels off-frame. */
const TILT_THROW = 5;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * cubic-bezier(x1,y1,x2,y2) as a plain value-of-time function — the same
 * parameterization as CSS and Motion's array easing, so a curve can be lifted
 * straight out of another icon. X is monotonic for any valid easing, so
 * bisecting on it to recover the curve parameter is safe.
 *
 * These have to be functions rather than an `ease` option because the whole
 * gesture is sampled from one progress value; see the storyboard.
 */
const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const bez = (s: number, c1: number, c2: number) =>
    3 * (1 - s) ** 2 * s * c1 + 3 * (1 - s) * s * s * c2 + s ** 3;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (bez(mid, x1, x2) < t) lo = mid;
      else hi = mid;
    }
    return bez((lo + hi) / 2, y1, y2);
  };
};

/** Motion's "easeOut", which is what ArrowIcon pulls back on. */
const easeBack = cubicBezier(0, 0, 0.58, 1);

/**
 * The release. Velocity ramps from nothing to full over the first
 * THROW_ACCEL of the phase — the arm extending — and is then CONSTANT, which
 * is what "let go" means. Integrating that gives position; the result is
 * normalised so it still lands on 1.
 *
 * Starting from rest matters: the plane has been sitting still at the back of
 * the wind-up, so any curve with speed at t=0 reads as a cut rather than a
 * throw. Ending at full speed matters just as much — it leaves the frame
 * still travelling away from the hand, not settling.
 */
const THROW_ACCEL = 0.16;
const throwRelease = (() => {
  const raw = (t: number) =>
    t <= THROW_ACCEL
      ? t ** 3 / (3 * THROW_ACCEL * THROW_ACCEL)
      : THROW_ACCEL / 3 + (t - THROW_ACCEL);
  const atOne = raw(1);
  return (u: number) => raw(u) / atOne;
})();

/**
 * The arrival: viscous drag, i.e. speed decaying exponentially with time.
 * It comes in fast, bleeds off, and settles — no overshoot, because a paper
 * plane does not arrive past its target and get pulled back.
 *
 * DRAG is the decay rate. 2.4 gives an entry speed about 2.6× the average and
 * still spends the last tenth of the distance on a visible settle, without
 * the long crawl a heavier decay leaves behind. Normalised by its own value
 * at u = 1 so it lands on EXACTLY 1 — rest identity has to be exact, and a
 * curve that merely converges would leave the plane a hundredth of a unit
 * short of home forever.
 */
const DRAG = 2.4;
const glideIn = (() => {
  const atOne = 1 - Math.exp(-DRAG);
  return (u: number) => (1 - Math.exp(-DRAG * u)) / atOne;
})();

/** Progress within a phase, 0→1. */
const span = (p: number, from: number, to: number) => (p - from) / (to - from);

/**
 * Distance along the flight axis at progress `p`.
 *
 * The discontinuity at P_AWAY is the point of the whole thing — it is where
 * the plane teleports from beyond the top-right corner to beyond the
 * bottom-left one. Sampling a function rather than tweening keyframes is what
 * makes that legal: nothing interpolates across the gap, so the plane never
 * appears mid-frame during the swap.
 */
function flightOffset(p: number): number {
  if (p < P_BACK) return lerp(0, PULL, easeBack(span(p, 0, P_BACK)));
  if (p < P_HOLD) return PULL;
  if (p < P_GONE) {
    return lerp(PULL, FLIGHT_OUT, throwRelease(span(p, P_HOLD, P_GONE)));
  }
  // Out of sight and holding, at exactly the distance it comes back from.
  if (p < P_AWAY) return FLIGHT_OUT;
  return lerp(-FLIGHT_OUT, 0, glideIn(span(p, P_AWAY, 1)));
}

/**
 * Nose attitude. Tips up into the pull on the same curve the body rides,
 * noses over as it is flung, and then LEVELS OFF DURING THE OFF-FRAME BEAT.
 *
 * That placement is the point: straightening up is the one part of the
 * gesture that would look like the plane fixing itself in front of you, so it
 * happens in the phase that exists precisely because nothing is on screen.
 * The whole return is flown at rest attitude — by the time the clip lets the
 * plane be seen again it is already square, and only has distance left to
 * close.
 */
function flightTilt(p: number): number {
  if (p < P_BACK) return lerp(0, TILT_BACK, easeBack(span(p, 0, P_BACK)));
  if (p < P_HOLD) return TILT_BACK;
  if (p < P_GONE) {
    return lerp(TILT_BACK, TILT_THROW, throwRelease(span(p, P_HOLD, P_GONE)));
  }
  if (p < P_AWAY) {
    return lerp(TILT_THROW, 0, easeOutCubic(span(p, P_GONE, P_AWAY)));
  }
  return 0;
}

/** The glyph, exactly as supplied: body outline, tail fin, crease. */
const PLANE_D =
  "M10.0366 12.4015L5.53662 9.22908L1.16304 8.42474" +
  "C0.676297 8.33522 0.597387 7.67043 1.05218 7.47527" +
  "C4.1268 6.1559 11.2603 3.09476 16.6243 0.792984" +
  "C17.0021 0.630858 17.4006 0.968273 17.3021 1.36743" +
  "C16.0661 6.37687 14.3203 12.2874 13.7359 14.2395" +
  "C13.6378 14.5671 13.2484 14.6956 12.9701 14.4969L10.0366 12.4015Z" +
  "M5.53662 9.22908V15.2881C5.53662 15.7195 6.04635 15.9484 6.3688 15.6618" +
  "L10.0366 12.4015" +
  "M5.53662 9.22908C5.53662 9.22908 12.3003 4.40399 16.9912 0.953213";

export const PaperPlaneIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  // useId can contain colons, which are not safe inside url(#…) — strip them.
  const clipId = `paper-plane-clip-${useId().replace(/:/g, "")}`;

  const offset = useTransform(progress, flightOffset);
  const x = useTransform(offset, (d) => d * UX);
  const y = useTransform(offset, (d) => d * UY);
  const rotate = useTransform(progress, flightTilt);

  const play = (p: MotionValue<number>) => {
    p.jump(0);
    // Linear: every curve lives in the pure functions above, so easing the
    // tween as well would double-apply it.
    return animate(p, 1, { duration: DURATION, ease: "linear" });
  };

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      await play(progress);
    },
    createScrubber() {
      return makeScrubber(
        () => play(progress),
        () => progress.jump(0),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="19"
      height="17"
      viewBox="0 0 19 17"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* The frame edge, as geometry rather than a style on the root — see the
          storyboard, and CLIP_PAD for why it is not simply the viewBox. */}
      <defs>
        <clipPath id={clipId}>
          <rect
            x={-CLIP_PAD}
            y={-CLIP_PAD}
            width={19 + CLIP_PAD * 2}
            height={17 + CLIP_PAD * 2}
          />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <motion.g style={{ x, y, rotate }}>
          <path d={PLANE_D} />
        </motion.g>
      </g>
    </svg>
  );
});

PaperPlaneIcon.displayName = "PaperPlaneIcon";
