import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — house bounce (one-shot, hover)
 *
 *    0ms  house at rest on the baseline
 * 0-223ms LAUNCH: springs up, stretching along travel as it
 *         accelerates away from the ground
 *  223ms  APEX — 3 units up, velocity ~0, back to natural
 *         proportions for a beat of hang time
 *  302ms  the impact squash starts building on the way down,
 *         so the landing is anticipated rather than sprung on
 *  446ms  IMPACT — lands and takes weight: 17% wider, 7%
 *         shorter, squashed from the baseline so the roof
 *         compresses down onto the walls. Restrained on
 *         purpose — a house is a geometric shape, and pushed
 *         further it reads as rubber rather than mass.
 *  691ms  squash fully released. The recovery takes 245ms
 *         against a 144ms build — mass takes weight fast and
 *         lets go slowly, and the slow half is what keeps the
 *         squash from snapping past in a single beat.
 * 691-720ms  still. Rest and end poses are pixel-identical, so
 *            replays and scrubbing are clean.
 *
 * ONE hop, ONE landing. No rebounds.
 *
 * ONE scalar `progress` runs 0→1 LINEARLY. Y, scaleX and
 * scaleY are pure functions of it — no integrator, no
 * per-frame state. That is what keeps it seekable, and it's
 * why makeScrubber can land on any pose. Add a velocity
 * accumulator here and /scrub will seek to poses that never
 * occurred.
 *
 * Squash is DERIVED FROM VELOCITY, not keyframed: a central
 * finite difference of the height curve (δ = 0.001). Fast
 * downward = fat and short; near-zero at the apex = neutral.
 * That's what makes it read as weight rather than as a scale
 * keyframe that happens to sit near the ground.
 *
 * X and Y squash factors are deliberately unequal (1.5 vs 0.6
 * on impact, 0.3 vs 0.6 airborne). True volume preservation
 * looks wrong — see the animate-bounce skill.
 *
 * A ballistic arc is symmetric, so the hop is the unit
 * parabola 4t(1-t) — rise and fall mirror each other. The
 * asymmetry people expect comes from the squash, not the path.
 *
 * NO vectorEffect on the path. non-scaling-stroke resolves
 * stroke width against the *viewport*, not the viewBox, so the
 * stroke would render at a fixed 1.5 device px and turn into a
 * hairline wherever the icon is drawn larger than 24px (the
 * export gallery draws it at 72). Stroke stays proportional.
 * ───────────────────────────────────────────────────────── */

const DURATION = 0.72;

/** Progress at which the house lands. Everything after is the settle. */
const CONTACT = 0.62;
/** Apex of the hop, in viewBox units. */
const HOP = 3;
/** Squash intensity — the one dial for the whole effect. The animate-bounce
    source ships 0.225, which lands at 34% wider and reads as rubber on a
    geometric house. 0.11 keeps the weight but not the cartoon: ~17% wider,
    ~7% shorter, ~5% airborne stretch. */
const INTENSITY = 0.11;
/* The impact window is ASYMMETRIC. A symmetric one builds and releases at the
   same rate, and the whole squash event snaps past in one beat. Real mass takes
   weight quickly and recovers slowly, so the release runs ~1.7× the onset.
   Both are wide enough to stay smooth: a narrow window ramps the full scale
   change through 2-3 frames, which is what reads as jitter. */
/** Build-up, before contact — 144ms. Also anticipates the landing. */
const IMPACT_IN = 0.2;
/** Recovery, after contact — 245ms. The slow half is what stops it snapping. */
const IMPACT_OUT = 0.34;
/** Progress over which the airborne stretch fades in from rest. A ballistic hop
    leaves the ground at PEAK speed, so without this the stretch snaps 0 → full
    between frame 0 and frame 1. */
const LAUNCH_RAMP = 0.06;
/** Speed (height units per unit progress) at which airborne stretch saturates.
    This hop peaks near 17.6. */
const SPEED_REF = 15;
/** Ceiling on airborne stretch, so a fast fall never becomes a needle. */
const MAX_STRETCH = INTENSITY * 0.8;

/** Unit parabola: peaks at 1.0 when t = 0.5, zero at both ends. */
const arc = (t: number) => 4 * t * (1 - t);
/** Smoothstep — zero slope at BOTH ends and at the peak. Used everywhere a
    weight ramps, because a corner in a weight is a corner in the scale, and the
    eye reads a slope break as a stutter even when the values are right. */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Height above the baseline, in viewBox units. One ballistic hop, then flat.
 * Returns 0 at p = 0 and p = 1 — starts and ends on the ground.
 */
function hopHeight(p: number): number {
  if (p <= 0 || p >= CONTACT) return 0;
  return HOP * arc(p / CONTACT);
}

/** SVG y grows downward, so up is negative. */
const offsetY = (p: number) => -hopHeight(p);

/** Central finite difference — unitless (height units per unit progress). */
function velocity(p: number): number {
  const d = 0.001;
  return (offsetY(Math.min(p + d, 1)) - offsetY(Math.max(p - d, 0))) / (2 * d);
}

/**
 * Squash and stretch, as a continuous function of progress.
 *
 * Airborne is the baseline: stretched along travel, capped so a fast fall never
 * becomes a needle. Around the landing the impact pose (fat and short) is
 * BLENDED IN on a smoothstepped weight, not switched to.
 *
 * Every part of that is load-bearing against jitter, and each was measured:
 *   - switching hard at the window edge jumped scaleX 0.39 in one frame
 *   - a LINEAR blend weight peaks at a corner: 0.26 accel spike at the landing
 *   - raw |velocity| has a corner at the apex:  0.19 accel spike
 * All three are C¹ discontinuities — the values either side are correct, but
 * the slope breaks, and that is what the eye catches as a stutter.
 */
function squash(p: number): { x: number; y: number } {
  if (p <= 0 || p >= 1) return { x: 1, y: 1 };

  // Airborne baseline. Speed is smoothstepped, NOT taken raw: |velocity| has a
  // sharp V wherever velocity crosses zero — i.e. at the apex — and that hitches
  // exactly where the icon should look weightless.
  const ramp = Math.min(p / LAUNCH_RAMP, 1);
  const n = Math.min(Math.abs(velocity(p)) / SPEED_REF, 1);
  const s = smoothstep(n) * MAX_STRETCH * ramp;
  const air = { x: 1 - s * 0.3, y: 1 + s * 0.6 };

  // Signed, so the onset and recovery can run at different rates. w reaches 1
  // at contact from both sides, so the two halves meet continuously.
  const offset = p - CONTACT;
  const span = offset < 0 ? IMPACT_IN : IMPACT_OUT;
  const dist = Math.abs(offset);
  if (dist >= span) return air;

  const w = smoothstep(1 - dist / span);
  const impactX = 1 + INTENSITY * 1.5;
  const impactY = 1 - INTENSITY * 0.6;

  return {
    x: air.x + (impactX - air.x) * w,
    y: air.y + (impactY - air.y) * w,
  };
}

/**
 * Stroke centerline recovered from the outline-expanded source: one closed
 * loop — up the left wall, over the r2 eave/apex fillets, down the right
 * wall, along the base, and through the door notch (r1 fillets into the
 * jambs, r2 quarter-arcs to the flat arch top).
 */
const HOUSE_D =
  "M3.75 9.905" +
  "A2 2 0 0 1 4.43 8.4" +
  "L10.68 2.91" +
  "A2 2 0 0 1 13.32 2.91" +
  "L19.57 8.4" +
  "A2 2 0 0 1 20.25 9.905" +
  "L20.25 18.25" +
  "A2 2 0 0 1 18.25 20.25" +
  "L15.25 20.25" +
  "A1 1 0 0 1 14.25 19.25" +
  "L14.25 16.75" +
  "A2 2 0 0 0 12.25 14.75" +
  "L11.75 14.75" +
  "A2 2 0 0 0 9.75 16.75" +
  "L9.75 19.25" +
  "A1 1 0 0 1 8.75 20.25" +
  "L5.75 20.25" +
  "A2 2 0 0 1 3.75 18.25" +
  "Z";

export const HomeIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();
    const shouldReduceMotion = useReducedMotion();
    const progress = useMotionValue(0);

    const y = useTransform(progress, offsetY);
    const sx = useTransform(progress, (p) => squash(p).x);
    const sy = useTransform(progress, (p) => squash(p).y);

    useImperativeHandle(ref, () => ({
      async playAnimation() {
        // Jump to the rest pose rather than early-returning, which would strand
        // a half-played frame if this fires mid-run.
        if (shouldReduceMotion) {
          progress.set(0);
          return;
        }
        progress.set(0);
        // Linear: all shaping lives in the transform functions.
        await animate(progress, 1, { duration: DURATION, ease: "linear" });
      },
      createScrubber() {
        return makeScrubber(() =>
          animate(progress, 1, { duration: DURATION, ease: "linear" })
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
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        {/* transformOrigin lives in `initial`, NOT `style`: Motion overrides a
            style-set origin on SVG elements with its own centered default,
            which makes the squash grow downward through the floor. Motion's own
            scaleX/scaleY/y props (fed MotionValues) are used for the same
            reason — a raw `transform` string loses this origin handling.
            fill-box + 50%/100% = scale origin at the base centre, so the squash
            compresses the house down onto its baseline. */}
        <motion.g
          className="home-body"
          initial={{
            scaleX: 1,
            scaleY: 1,
            transformOrigin: "50% 100%",
          }}
          style={{ y, scaleX: sx, scaleY: sy, transformBox: "fill-box" }}
        >
          <path d={HOUSE_D} />
        </motion.g>
      </svg>
    );
  }
);

HomeIcon.displayName = "HomeIcon";
