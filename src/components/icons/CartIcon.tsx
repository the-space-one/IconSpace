"use client";

import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import { motion, useAnimate, type AnimationSequence } from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — rolling cart with speed lines
 *
 *    0ms  at rest: no speed lines visible              (f1)
 *  120ms  bump: basket tips                            (f2)
 *         speed line 1 fades in, streaking backward
 *  280ms  body rises 0.5 on its suspension             (f3)
 *         speed line 2 fades in, streaking backward
 *  430ms  body falls back                              (f4)
 *  750ms  both speed lines have streaked out           (gone)
 *  900ms  body settles to the exact rest pose          (f1)
 *
 * The whole cart also ROLLS horizontally: body + wheels translate together
 * — a small load backward, then a roll forward, then an ease back to rest —
 * so it reads as actually moving, not just tipping in place. It's a slide,
 * NO vertical hop (that read as jumping). The two speed lines behind the cart
 * reinforce the roll: invisible at rest, they only exist during the hover run
 * and end at opacity 0, so the loop seam stays invisible.
 *
 * Generated from 6 frames by scripts/parse-frames.mjs.
 * Path states are validated (identical command structure) - do not
 * hand-edit the d strings; re-export frames and re-run the parser.
 * ───────────────────────────────────────────────────────── */

const PATH_1_STATES = [
  "M0.5 0.5L2.664 0.897C3.013 0.961 3.303 1.205 3.424 1.539L3.773 2.5M6.5 10L15.072 10C15.493 10 15.868 9.737 16.012 9.342L18.012 3.842C18.124 3.535 18.079 3.194 17.891 2.926 17.704 2.659 17.398 2.5 17.072 2.5L3.772 2.5M6.5 10L3.773 2.5M6.5 10L5.877 10.952C5.676 11.259 5.659 11.652 5.834 11.975 6.008 12.298 6.346 12.5 6.713 12.5L15.773 12.5",
  "M0.5 0.5L2.664 0.897C3.013 0.961 3.303 1.205 3.424 1.539L3.773 2.5M6.5 10L15.018 10.627C15.464 10.66 15.878 10.392 16.031 9.971L18.035 4.461C18.144 4.162 18.104 3.829 17.928 3.565 17.751 3.3 17.46 3.135 17.142 3.12L3.772 2.5M6.5 10L3.773 2.5M6.5 10L5.877 10.952C5.676 11.259 5.659 11.652 5.834 11.975 6.008 12.298 6.346 12.5 6.713 12.5L15.773 12.5",
  "M0.5 0.5L2.527 0.5C2.948 0.5 3.323 0.763 3.467 1.158L3.773 2M6.5 9.5L15.018 10.127C15.464 10.16 15.878 9.892 16.031 9.471L18.035 3.961C18.144 3.662 18.104 3.329 17.928 3.065 17.751 2.8 17.46 2.635 17.142 2.62L3.772 2M6.5 9.5L3.773 2M6.5 9.5L5.877 10.452C5.676 10.759 5.659 11.152 5.834 11.475 6.008 11.798 6.346 12 6.713 12L15.773 12",
  "M0.5 0.5L2.664 0.897C3.013 0.961 3.303 1.205 3.424 1.539L3.773 2.5M6.5 10L15.018 10.627C15.464 10.66 15.878 10.392 16.031 9.971L18.035 4.461C18.144 4.162 18.104 3.829 17.928 3.565 17.751 3.3 17.46 3.135 17.142 3.12L3.772 2.5M6.5 10L3.773 2.5M6.5 10L5.877 10.952C5.676 11.259 5.659 11.652 5.834 11.975 6.008 12.298 6.346 12.5 6.713 12.5L15.773 12.5",
  "M0.5 0.5L2.664 0.897C3.013 0.961 3.303 1.205 3.424 1.539L3.773 2.5M6.5 10L15.072 10C15.493 10 15.868 9.737 16.012 9.342L18.012 3.842C18.124 3.535 18.079 3.194 17.891 2.926 17.704 2.659 17.398 2.5 17.072 2.5L3.772 2.5M6.5 10L3.773 2.5M6.5 10L5.877 10.952C5.676 11.259 5.659 11.652 5.834 11.975 6.008 12.298 6.346 12.5 6.713 12.5L15.773 12.5",
  "M0.5 0.5L2.664 0.897C3.013 0.961 3.303 1.205 3.424 1.539L3.773 2.5M6.5 10L15.072 10C15.493 10 15.868 9.737 16.012 9.342L18.012 3.842C18.124 3.535 18.079 3.194 17.891 2.926 17.704 2.659 17.398 2.5 17.072 2.5L3.772 2.5M6.5 10L3.773 2.5M6.5 10L5.877 10.952C5.676 11.259 5.659 11.652 5.834 11.975 6.008 12.298 6.346 12.5 6.713 12.5L15.773 12.5",
];

const PATH_2_STATES = [
  "M9.773 14.5C9.773 15.052 9.285 15.5 8.683 15.5 8.081 15.5 7.591 15.052 7.591 14.5 7.591 13.948 8.08 13.5 8.682 13.5 9.285 13.5 9.773 13.948 9.773 14.5Z",
];

const PATH_3_STATES = [
  "M15.227 14.5C15.227 15.052 14.739 15.5 14.137 15.5 13.535 15.5 13.045 15.052 13.045 14.5 13.045 13.948 13.534 13.5 14.136 13.5 14.739 13.5 15.227 13.948 15.227 14.5Z",
];

/**
 * The body run appends frame 1 as a 7th keyframe — replays always start and
 * end pixel-identical to rest (the EmailIcon loop-seam rule).
 *
 * Eases per segment (motion-craft named library): both segments into the
 * peak are ease-out so the body decelerates against the bump and hangs at
 * the top; the descent beats are ease-in-out (on-screen movement); and the
 * last beat uses the repo's settle curve so the body lands softly.
 */
const EASE_OUT_CUBIC = [0.215, 0.61, 0.355, 1] as const;
const EASE_OUT_QUAD = [0.25, 0.46, 0.45, 0.94] as const;
const EASE_IN_OUT_QUAD = [0.455, 0.03, 0.515, 0.955] as const;
const EASE_IN_OUT_CUBIC = [0.645, 0.045, 0.355, 1] as const;
const EASE_SETTLE = [0.22, 1, 0.36, 1] as const;

// The body's timeline; the wheels stay planted the whole run.
const DURATION = 0.9;
const TIMES = [0, 0.133, 0.311, 0.478, 0.633, 0.778, 1]; // 0/120/280/430/570/700/900ms
const EASES = [
  EASE_OUT_CUBIC, // f1->f2 bump kick
  EASE_OUT_QUAD, // f2->f3 rise to the peak, hangs
  EASE_IN_OUT_QUAD, // f3->f4 falling
  EASE_IN_OUT_QUAD, // f4->f5 almost home
  EASE_IN_OUT_CUBIC, // f5->f6 last dip
  EASE_SETTLE, // f6->f1 soft settle back to rest
];

const BODY_KEYFRAMES = [...PATH_1_STATES, PATH_1_STATES[0]];

/**
 * Speed lines: two short dashes trailing behind the cart (its handle side).
 * Invisible at rest — they pop in staggered during the run, streak backward
 * ~2.4 units while fading out, and both end (and rest) at opacity 0.
 */
// Both value arrays share TIMES entry-for-entry (Motion pairs them by index),
// so the drift keeps streaking for the whole window while opacity wraps it.
const SPEED_LINE_TIMES = [0, 0.2, 0.55, 1];
const SPEED_LINE_OPACITY = [0, 0.9, 0.9, 0];
const SPEED_LINE_X = [0, -0.9, -1.8, -2.4];

// The whole cart rolls horizontally over the same 0.9s window: it rolls FORWARD
// first (as the speed lines streak), then recoils BACK past its start, then
// settles on the spot. Body + wheels share this translate so it slides as one;
// ends at x:0 to keep the loop seam pixel-identical to rest.
const ROLL_TIMES = [0, 0.35, 0.7, 1];
const ROLL_X = [0, 2.1, -0.9, 0];
const ROLL_EASES = [
  EASE_OUT_CUBIC, // rest->forward: roll out, decelerating at the far point
  EASE_IN_OUT_QUAD, // forward->back: recoil back past the start
  EASE_SETTLE, // back->rest: soft settle on the spot
];

const SEQUENCE: AnimationSequence = [
  [
    ".cart-icon-path-1",
    { d: BODY_KEYFRAMES },
    { at: 0, duration: DURATION, times: TIMES, ease: EASES },
  ],
  // The whole cart (body + wheels) rolls forward then back, then settles.
  [
    ".cart-roll",
    { x: ROLL_X },
    { at: 0, duration: DURATION, times: ROLL_TIMES, ease: ROLL_EASES },
  ],
  // Speed line 1 (upper, basket height): streaks out with the bump.
  [
    ".cart-icon-speed-1",
    { x: SPEED_LINE_X, opacity: SPEED_LINE_OPACITY },
    {
      at: 0.12,
      duration: 0.42,
      ease: EASE_OUT_QUAD,
      times: SPEED_LINE_TIMES,
    },
  ],
  // Speed line 2 (lower, near the wheels): follows 140ms later.
  [
    ".cart-icon-speed-2",
    { x: SPEED_LINE_X, opacity: SPEED_LINE_OPACITY },
    {
      at: 0.26,
      duration: 0.4,
      ease: EASE_OUT_QUAD,
      times: SPEED_LINE_TIMES,
    },
  ],
];

export const CartIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
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
        viewBox="-0.74 -2 20 20"
        fill="none"
        strokeWidth={1.5}
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        {/* Body + wheels roll together horizontally (no vertical hop). */}
        <motion.g className="cart-roll">
          <motion.path
            className="cart-icon-path-1"
            d={PATH_1_STATES[0]}
            stroke="currentColor"
            strokeLinecap="round"
          />
          <path
            className="cart-icon-path-2"
            d={PATH_2_STATES[0]}
            stroke="currentColor"
          />
          <path
            className="cart-icon-path-3"
            d={PATH_3_STATES[0]}
            stroke="currentColor"
          />
        </motion.g>
        {/* Speed lines: hidden at rest, animated only during the hover run. */}
        <motion.path
          className="cart-icon-speed-1"
          d="M2.8 6.5L1 6.5"
          stroke="currentColor"
          strokeLinecap="round"
          opacity={0}
        />
        <motion.path
          className="cart-icon-speed-2"
          d="M3.2 11.5L1.8 11.5"
          stroke="currentColor"
          strokeLinecap="round"
          opacity={0}
        />
      </svg>
    );
  },
);

CartIcon.displayName = "CartIcon";
