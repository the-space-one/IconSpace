"use client";

import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import { motion, useAnimate, type AnimationSequence } from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — discount seal spin (one-shot)
 *
 *    0ms  seal at rest, percent upright           (frame 1)
 * 0-1600ms the outer scalloped ring turns one full circle
 *          under ease-in-out-quart (power in/out): winds up
 *          slowly, rolls through the middle, brakes softly
 *          into the landing                     (frames 2-5)
 *  ~100ms+ the percent slash and the two dots do NOT ride
 *          the ring — they jitter in place (small irregular
 *          drifts/tilts from the reference frames) and settle
 *          back to rest as the ring lands
 * ~1620ms  invisible reset: 360° == 0°, so rotate snaps back
 *          to 0 while nothing moves — replay and scrubbing
 *          both land pixel-identical to rest.
 *
 * Trigger model: imperative IconHandle one-shot (hover plays
 * once via SidebarRow/Stage), same as the other icons.
 *
 * Transform-driven, NOT a path morph: the reference frames
 * can't parse (frame 4 lacks the inner parts, frame 3 is a
 * 23x23 export with different dot anchors). Frame 1 supplies
 * the geometry; the other frames set the jitter amplitudes.
 * ───────────────────────────────────────────────────────── */

/** Outer 8-lobe scalloped ring (stroked). */
const RING_D =
  "M2.424 6.704a3.602 3.602 0 0 1 4.301-4.293 3.6 3.6 0 0 1 6.064 0 3.598 3.598 0 0 1 4.3 4.302 3.6 3.6 0 0 1 0 6.067 3.6 3.6 0 0 1-4.29 4.302 3.6 3.6 0 0 1-6.074 0 3.598 3.598 0 0 1-4.3-4.293 3.6 3.6 0 0 1 0-6.085";

/** The percent sign's diagonal stroke. */
const SLASH_D = "m11.75 7.75-4 4";

/** Both percent dots (filled). */
const DOTS_D =
  "M8.5 7.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0m4.75 4.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0";

// ease-in-out-quart from the motion-craft library ("power in/out"): slow
// wind-up, fast middle, soft braking — the same curve as BookFlip's crest.
const POWER_EASE = [0.77, 0, 0.175, 1] as const;

const SPIN_DURATION = 1.6;

const SEQUENCE: AnimationSequence = [
  // Main action: the ring turns one full circle. 360° == 0°, so the landing
  // pose is pixel-identical to rest.
  [
    ".discount-ring",
    { rotate: [0, 360] },
    { duration: SPIN_DURATION, ease: [...POWER_EASE] },
  ],
  // The inner percent parts jitter in place while the ring spins — irregular
  // keyframes on offset clocks so the drift reads hand-nudged, ending at 0.
  // Amplitudes come from the reference frames: fractions of a unit, a few
  // degrees.
  [
    ".discount-slash",
    {
      x: [0, 0.45, -0.3, 0.2, 0],
      y: [0, 0.25, -0.2, 0.3, 0],
      rotate: [0, 4, -3, 2, 0],
    },
    { at: 0.1, duration: 1.4, times: [0, 0.3, 0.55, 0.8, 1], ease: "easeInOut" },
  ],
  [
    ".discount-dots",
    { x: [0, -0.4, 0.3, -0.15, 0], y: [0, 0.3, -0.35, 0.2, 0] },
    {
      at: 0.18,
      duration: 1.35,
      times: [0, 0.25, 0.6, 0.85, 1],
      ease: "easeInOut",
    },
  ],
  // Invisible reset: nothing is moving and 360° renders exactly like 0°.
  [".discount-ring", { rotate: [360, 0] }, { at: 1.62, duration: 0.001 }],
];

export const DiscountIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();

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
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        {/* Only the ring rotates; fill-box center keeps it turning in place. */}
        <motion.path
          className="discount-ring"
          d={RING_D}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <motion.path
          className="discount-slash"
          d={SLASH_D}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <motion.path
          className="discount-dots"
          d={DOTS_D}
          fill="currentColor"
          stroke="none"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      </svg>
    );
  },
);

DiscountIcon.displayName = "DiscountIcon";
