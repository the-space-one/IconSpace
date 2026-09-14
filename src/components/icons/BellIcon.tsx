"use client";

import { forwardRef, useId, useImperativeHandle, type SVGProps } from "react";
import { motion, useAnimate, type AnimationSequence } from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — bell ring (one-shot)
 *
 *    0ms  bell hangs at rest
 * 0-125ms WIND-UP: the whole bell lifts half a unit off its
 *         mount and kicks to +14° around the hanger point
 * 125-775ms RING: the swing decays through -11, +7, -4, +2
 *         like a real bell losing energy. The clapper hangs
 *         from the same crown pin and swings counter-phase
 *         (-11 → 8 → -5 → 2.5, 40ms behind the body), so the
 *         bowl visibly shuttles side to side under the mouth
 *         — the inside moves against the shell, the strike
 *         that makes a bell a bell. Whatever the swing tips
 *         above the mouth line is occluded by a clip that
 *         rides with the shell (see RIM_Y), so no stroke ever
 *         escapes the silhouette.
 * 775-900ms SETTLE: the lift eases back down and every
 *         rotation lands at 0 — pixel-identical to rest, so
 *         replays and scrubbing are clean.
 *
 * Ring recipe (decaying rotate keyframes + a lagged sub-part
 * in opposite phase) adapted from dimicx/animationsdev-hero
 * lib/variants/clock-variants.ts — the alarm-clock ring.
 *
 * Both parts pivot around the hanger point (8.75, 0.75): a
 * bell rotates about its mount, and a real clapper hangs
 * from the same pin — its rotation composes with the body's,
 * so only the RELATIVE angle (the lag) is visible, reading
 * as strikes against the rim. transformOrigin passes via
 * `initial`, not `style` (Motion overrides style-set origins
 * on SVG with its centered default); view-box makes the
 * pixel coordinates viewBox-relative.
 *
 * Class A per ICON-SYSTEM: rotate + translate only, no path
 * morphing. Glyph used as provided (already centerline
 * strokes at width 1.5) with currentColor.
 * ───────────────────────────────────────────────────────── */

const DURATION = 0.9;

/** Hanger point: top-center of the dome — the bell's mount pin. */
const PIVOT = "8.75px 0.75px";

/** Body swing: kick, then decaying oscillation, landing at 0. */
const SWING_KEYFRAMES = [0, 14, -11, 7, -4, 2, 0];
const SWING_TIMES = [0, 0.14, 0.34, 0.53, 0.71, 0.86, 1];

/** The clapper hangs from the same crown pin as the shell, counter-phase
 *  and trailing the body by 40ms — the bowl swings laterally under the
 *  mouth (sin 11° x 13.8 ≈ 2.6 units of visible shuttle, still inside the
 *  16-unit-wide mouth). Whatever tips above the mouth is clipped (see
 *  RIM_Y), so the throw stays expressive without strokes escaping. */
const CLAPPER_KEYFRAMES = [0, -11, 8, -5, 2.5, -1, 0];
const CLAPPER_LAG = 0.04;

/** The bell's mouth line (bottom edge of the body path). The clapper is
 *  clipped to below it — a real clapper is occluded by the bell above the
 *  mouth — and the cut seam hides under the rim's 1.5-wide stroke. */
const RIM_Y = 14.538;

/** The lift: up quickly with the wind-up, held while ringing, down at settle. */
const LIFT_KEYFRAMES = [0, -0.5, -0.5, 0];
const LIFT_TIMES = [0, 0.11, 0.8, 1];

/** First kick is ease-out (the strike is instant energy); every later
 *  segment is ease-in-out — accelerate through center, decelerate at the
 *  extremes, which is exactly pendulum motion. */
const PENDULUM_EASE = [
  "easeOut",
  "easeInOut",
  "easeInOut",
  "easeInOut",
  "easeInOut",
  "easeInOut",
] as const;

const SEQUENCE: AnimationSequence = [
  [
    ".bell-swing",
    { rotate: SWING_KEYFRAMES },
    { duration: DURATION, times: SWING_TIMES, ease: [...PENDULUM_EASE] },
  ],
  [
    ".bell-swing",
    { y: LIFT_KEYFRAMES },
    { at: 0, duration: DURATION, times: LIFT_TIMES, ease: "easeInOut" },
  ],
  [
    ".bell-clapper",
    { rotate: CLAPPER_KEYFRAMES },
    {
      at: CLAPPER_LAG,
      duration: DURATION - CLAPPER_LAG,
      times: SWING_TIMES,
      ease: [...PENDULUM_EASE],
    },
  ],
];

/** Bell body: dome, flared skirt, and mounting rim. */
const BODY_D =
  "M16.75 13.581a.966.966 0 0 1-.975.957H1.725a.966.966 0 0 1-.975-.957" +
  "c0-.152.037-.303.108-.438l1.2-2.281c.127-.24.2-.505.213-.776l.18-3.48" +
  "C2.617 3.327 5.388.75 8.75.75s6.132 2.576 6.3 5.857l.179 3.48" +
  "c.014.27.086.534.213.775l1.2 2.281a.94.94 0 0 1 .108.438";

/** Clapper bowl: the half-disc hanging under the rim. */
const CLAPPER_D =
  "M12.629 14.54c0 2.1-1.737 3.803-3.879 3.803s-3.879-1.703-3.879-3.804";

export const BellIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();
    // Unique per instance (the icon renders in several places at once);
    // colons stripped because they break url(#...) references.
    const clipId = `bell-mouth-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

    useImperativeHandle(ref, () => ({
      async playAnimation() {
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
        height="20"
        viewBox="0 0 18 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        {/* Whole bell (body + clapper) swings and lifts around the hanger. */}
        <motion.g
          className="bell-swing"
          initial={{ rotate: 0, y: 0, transformOrigin: PIVOT }}
          style={{ transformBox: "view-box" }}
        >
          <path d={BODY_D} />
          <defs>
            <clipPath id={clipId}>
              <rect x={-6} y={RIM_Y} width={30} height={14} />
            </clipPath>
          </defs>
          {/* The clip lives on a static wrapper INSIDE the swing group: it
              rides with the bell (mouth line stays glued to the rim) but not
              with the clapper's own rotation — anything the clapper tips
              above the mouth is occluded, exactly like a real bell. */}
          <g clipPath={`url(#${clipId})`}>
            {/* Clapper hangs from the crown pin, counter-phase to the body;
                the composed rotation makes the bowl visibly swing side to
                side under the mouth — the strike. */}
            <motion.g
              className="bell-clapper"
              initial={{ rotate: 0, transformOrigin: PIVOT }}
              style={{ transformBox: "view-box" }}
            >
              <path d={CLAPPER_D} />
            </motion.g>
          </g>
        </motion.g>
      </svg>
    );
  },
);

BellIcon.displayName = "BellIcon";
