"use client";

import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import { motion, useAnimate, type AnimationSequence } from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — flash, then strike down (one-shot, hover)
 *
 * A real bolt: it BLINKS hard and fast, and STRETCHES diagonally
 * downward like it's falling out of the sky, then whips back.
 *
 * Everything is driven by transform + opacity on the single bolt
 * path (the generated `d` is never touched), so the /scrub route
 * seeks cleanly — no springs, all keyframes.
 *
 *      0ms   rest: full bolt, opaque, no transform
 *  0-240ms   BLINK — opacity strobes down/up several times, very
 *            fast, like an electric flash flickering
 *  70-300ms  STRIKE — the bolt stretches DOWN from its top edge
 *            (scaleY↑, scaleX↓ so it thins) and leans on skewX, so
 *            the tip shoots down-and-to-the-right: a diagonal fall.
 *            A last hard flash lands right as it reaches full stretch.
 *  300-700ms WHIP BACK — skew overshoots the other way a touch, then
 *            everything settles to rest. Ends pixel-identical to 0ms
 *            so replays and scrubbing are seamless.
 *
 * The bolt's transform origin sits at its TOP-CENTER, so the stretch
 * grows downward (a strike falling) rather than from the middle.
 * overflow:visible lets the tip spill past the tile as it falls.
 * ───────────────────────────────────────────────────────── */

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;
const EASE_OUT_QUAD = [0.25, 0.46, 0.45, 0.94] as const;
const EASE_SETTLE = [0.22, 1, 0.36, 1] as const;

const DURATION = 0.7;

// Blink — a fast strobe. Sharp dips, near-instant (linear) so it reads as
// a flicker rather than a fade. The last dip (~0.44) is synced to the strike
// landing, so the hardest flash and the full stretch hit together.
const FLICKER = [1, 0.2, 1, 0.05, 1, 0.35, 1, 0.45, 1, 1];
const FLICKER_TIMES = [0, 0.05, 0.09, 0.14, 0.2, 0.27, 0.34, 0.44, 0.52, 1];

// Strike — shared timeline for every transform track so the stretch, the
// thinning and the lean stay locked together.
//   hold at rest | shoot down/lean | tiny overshoot | settle back
const STRIKE_TIMES = [0, 0.1, 0.42, 0.56, 1];
// Typed so "linear" keeps its literal type instead of widening to `string`
// (which is not a valid Motion Easing) — the rest are bezier tuples.
const STRIKE_EASE: (readonly [number, number, number, number] | "linear")[] = [
  "linear",
  EASE_OUT_QUINT,
  EASE_OUT_QUAD,
  EASE_SETTLE,
];

/*
 * Generated from frames by scripts/parse-frames.mjs — do not hand-edit the
 * `d` string; re-export frames and re-run the parser. Only the rest pose is
 * used now; the strike is pure transform.
 */
const PATH_1_STATES = [
  "M14.183 8.222L8.985 8.222C8.868 8.22 8.757 8.173 8.676 8.089 8.594 8.005 8.549 7.893 8.551 7.776L8.551 1.203C8.551 0.763 7.994 0.589 7.756 0.956L0.822 10.861C0.63 11.157 0.836 11.554 1.182 11.554L6.382 11.554C6.621 11.554 6.815 11.754 6.815 12L6.815 18.31C6.815 18.751 7.372 18.924 7.61 18.558L14.544 8.914C14.736 8.618 14.53 8.222 14.183 8.222Z",
];

const [F_FULL] = PATH_1_STATES;

const SEQUENCE: AnimationSequence = [
  // Blink — the bolt strobes hard and fast, like a live flash.
  [
    ".lightning-icon-path-1",
    { opacity: FLICKER },
    { at: 0, duration: DURATION, times: FLICKER_TIMES, ease: "linear" },
  ],
  // Fall — stretch downward from the top edge (grows longer as it strikes).
  [
    ".lightning-icon-path-1",
    { scaleY: [1, 1, 1.45, 1.42, 1] },
    { at: 0, duration: DURATION, times: STRIKE_TIMES, ease: STRIKE_EASE },
  ],
  // …thinning across as it elongates, so it reads as a streak, not a bloat.
  [
    ".lightning-icon-path-1",
    { scaleX: [1, 1, 0.84, 1.03, 1] },
    { at: 0, duration: DURATION, times: STRIKE_TIMES, ease: STRIKE_EASE },
  ],
  // …leaning on skewX so the tip whips down-and-right: the diagonal fall.
  [
    ".lightning-icon-path-1",
    { skewX: [0, 0, 13, -2.5, 0] },
    { at: 0, duration: DURATION, times: STRIKE_TIMES, ease: STRIKE_EASE },
  ],
  // …and dropping a touch, so it doesn't just grow in place — it falls.
  [
    ".lightning-icon-path-1",
    { y: [0, 0, 2.5, 1, 0] },
    { at: 0, duration: DURATION, times: STRIKE_TIMES, ease: STRIKE_EASE },
  ],
];

export const LightningIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();

    useImperativeHandle(ref, () => ({
      async playAnimation() {
        await animate(SEQUENCE);
      },
      // Powers the /scrub route: the same sequence, created paused + seekable.
      createScrubber() {
        return makeScrubber(() => animate(SEQUENCE));
      },
    }));

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 20"
        fill="none"
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        <motion.path
          className="lightning-icon-path-1"
          d={F_FULL}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          // The strike stretches/leans about the bolt's TOP-CENTER, in its own
          // box — so it grows downward like a bolt falling, not from the middle.
          style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
        />
      </svg>
    );
  },
);

LightningIcon.displayName = "LightningIcon";
