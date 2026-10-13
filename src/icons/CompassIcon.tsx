import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  useReducedMotion,
  type AnimationSequence,
  type Easing,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — one full sweep, then the needle
 * rings down onto the bearing (hover)
 *
 *    0ms  the needle rests on its NE bearing; the case is a
 *         plain ring and never moves.
 *  SWEEP  it breaks away and turns a COMPLETE LAP — 360° in
 *         about 400ms, accelerating out of rest, coasting
 *         through the middle, braking as the bearing comes
 *         back up. This is the "finding the direction" half:
 *         the needle has to go all the way round to sweep
 *         for it.
 *  DAMPEN it cannot stop on the mark. It overruns by 28° and
 *         then wiggles either side of the bearing — nine
 *         reversals, each about ¾ the size of the last, and
 *         each one taking LONGER than the one before. So the
 *         needle gets quieter and slower at the same time,
 *         visibly running out of energy.
 *  1100ms the final 2° drift home takes a full eighth of a
 *         second. It lands on 360° — the pose it started in —
 *         so the animation replays with no reset (§0.2).
 *
 * NO BIG SWING AT THE END. All the amplitude is spent in the
 * lap and the first overrun; from there it only shrinks. A
 * real needle rings down, it does not save a wide swing for
 * last.
 *
 * WHY 360 AND NOT 0. Motion's `rotate` is an unbounded number,
 * not an angle mod 360. Target the bare bearing and the tween
 * runs BACKWARDS the short way round instead of completing the
 * lap; every keyframe here therefore climbs past 360 and lands
 * there. 360 ≡ 0 visually, so the next play restarting from 0
 * is invisible.
 *
 * CENTRE ROTATION — the ClockIcon hand technique. The needle
 * pivots about the case centre, NOT its own bbox:
 *   transformOrigin ("9px 9px") lives in `initial`, because
 *   Motion overwrites a style-level origin with its 50%/50%
 *   SVG default; transformBox: "view-box" lives in `style`,
 *   and is what makes those pixels mean viewBox coordinates.
 *   Get these backwards and the needle spins around its own
 *   middle — which looks almost right at rest and obviously
 *   broken mid-lap.
 *
 * WHY KEYFRAMES, NOT A SPRING. ClockIcon springs its hands,
 * and an under-damped spring does ring down — but its period
 * is constant, so the swings get smaller without ever getting
 * slower. The slow-down IS the gesture here, so the timing has
 * to be authored. Keyframes also mean playAnimation() and
 * createScrubber() share ONE definition, instead of
 * GithubIcon's hand-synced spring/keyframe twins (a spring's
 * duration is derived, so makeScrubber cannot seek it).
 *
 * Only the needle moves. The case is a circle, so rotating it
 * would be invisible, and shaking it would be decoration.
 * ───────────────────────────────────────────────────────── */

const DURATION = 1.1;
/** Case centre in viewBox units — the needle's pivot. */
const COMPASS_CENTER = "9px 9px";

/**
 * Rotation in degrees. The first three keyframes are the lap (0 → 360, carried
 * to 388 by the overrun); the rest alternate either side of 360, decaying by
 * roughly ×0.76 per swing: 28 → 21 → 16 → 12 → 9 → 7 → 5 → 3.5 → 2 → 0.
 */
const SEEK = [0, 150, 300, 388, 339, 376, 348, 369, 353, 365, 356.5, 362, 360];
/**
 * The other half of the damping, and the part a spring cannot do: after the lap
 * the gaps between reversals GROW — 60ms at the start of the ring-down, 115ms
 * for the final drift home — so the needle slows as it quiets down.
 */
const SEEK_TIMES = [
  0, 0.14, 0.26, 0.355, 0.41, 0.465, 0.521, 0.582, 0.648, 0.722, 0.804, 0.896,
  1,
];
/** Wind up, coast the lap, brake past the bearing, then a pendulum through
 *  every reversal (zero velocity at each extreme, fastest crossing the mark). */
const SEEK_EASE: Easing[] = [
  "easeIn", // break away from rest
  "linear", // coast through the lap
  "easeOut", // brake, overrunning the bearing
  ...(Array(SEEK.length - 4).fill("easeInOut") as Easing[]),
];

const SEQUENCE: AnimationSequence = [
  [
    ".compass-needle",
    { rotate: SEEK },
    { at: 0, duration: DURATION, times: SEEK_TIMES, ease: SEEK_EASE },
  ],
];

/**
 * The needle body, as ONE closed outline. Reconstructed as a stroke centreline
 * from the supplied glyph (which shipped as a stroke-expanded fill), so it
 * inherits currentColor and strokeWidth like every other icon in the set.
 *
 * Two tips on the NE↔SW diagonal, two rounded shoulders where the flanks meet
 * the crossbar. The tips are NOT mitre/round joins of straight edges — the
 * centreline genuinely curves through each nose, running perpendicular to the
 * needle's own axis at the apex. Modelling them as corners leaves a visible
 * crescent of missing ink at both points.
 */
const NEEDLE_D =
  "M11.49099 5.49349C11.75771 5.40458 12.40362 5.07673 12.66341 5.33652" +
  "C12.9234 5.59651 12.59535 6.24244 12.50648 6.50905L11.7765 8.69897" +
  "C11.399 9.83162 11.2102 10.39795 10.80407 10.80407C10.39795 11.2102 " +
  "9.83162 11.399 8.69897 11.7765L6.50901 12.50651C6.24229 12.59542 " +
  "5.59638 12.92327 5.33659 12.66348C5.0766 12.40349 5.40465 11.75756 " +
  "5.49352 11.49095L6.22347 9.30103C6.60102 8.16839 6.7898 7.60206 " +
  "7.19593 7.19593C7.60206 6.7898 8.16839 6.60102 9.30103 6.22347Z";

/** The bar splitting the needle into its two halves — shoulder to shoulder,
 *  straight through the centre, perpendicular to the needle axis. */
const CROSSBAR_D = "M7.19593 7.19593L10.80407 10.80407";

export const CompassIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      await animate(SEQUENCE);
    },
    createScrubber() {
      return makeScrubber(() => animate(SEQUENCE));
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
      {/* The case: static. */}
      <circle cx="9" cy="9" r="7.5" />
      {/* Needle body + crossbar turn together about the case centre. Rest
          value (rotate: 0) is in `initial` so makeScrubber's pre-paint pause
          holds the bearing until the first seek. */}
      <motion.g
        className="compass-needle"
        initial={{ rotate: 0, transformOrigin: COMPASS_CENTER }}
        style={{ transformBox: "view-box" }}
      >
        <path d={NEEDLE_D} />
        <path d={CROSSBAR_D} />
      </motion.g>
    </svg>
  );
});

CompassIcon.displayName = "CompassIcon";
