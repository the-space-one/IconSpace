"use client";

import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import { motion, useAnimate, type AnimationSequence } from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — "a fresh ticket gets clipped"
 *
 * REST is the CLIPPED ticket (s2, notches in both edges) —
 * the classic ticket silhouette. Hover replays the clipping:
 *
 *      0ms   rest: clipped ticket (s2)
 *  0-200ms   notches SMOOTH OUT to a fresh flat ticket (s2 → s1),
 *            ease-in-out-cubic — quiet reset, "next ticket please"
 *  200-300ms beat — the clipper lines up
 *  300-450ms LEFT BITE (s1 → sLeft): left notch snaps in,
 *            ease-out-quint — near-instant, a clipper bite;
 *            ticket recoils +x (pushed by the bite), settles
 *  450-570ms beat — the clipper moves to the other side
 *  570-720ms RIGHT BITE (sLeft → s2): right notch snaps in,
 *            same attack; ticket recoils -x
 *  720-900ms HOLD clipped while the recoil settles
 *
 * Ends exactly at s2 = the rest pose, so replays are seamless.
 *
 * Generated from 2 frames by scripts/parse-frames.mjs.
 * Path states are validated (identical command structure) - do not
 * hand-edit the d strings; re-export frames and re-run the parser.
 * ───────────────────────────────────────────────────────── */

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;
const EASE_OUT_QUAD = [0.25, 0.46, 0.45, 0.94] as const;
const EASE_IN_OUT_CUBIC = [0.645, 0.045, 0.355, 1] as const;

const DURATION = 0.9;
// Beat boundaries as fractions of DURATION: unclip 200ms | beat 300ms |
// left bite 450ms | beat 570ms | right bite 720ms | settle 900ms.
const TIMES = [0, 200 / 900, 300 / 900, 450 / 900, 570 / 900, 720 / 900, 1];

const PATH_1_STATES = [
  "M7.75 12.75C10.417 12.75 13.083 12.75 15.75 12.75 16.682 12.75 17.148 12.75 17.515 12.598 18.005 12.395 18.395 12.005 18.598 11.515 18.75 11.148 18.75 10.682 18.75 9.75 18.75 8.75 18.75 7.75 18.75 6.75 18.75 5.75 18.75 4.75 18.75 3.75 18.75 2.818 18.75 2.352 18.598 1.985 18.395 1.495 18.005 1.105 17.515 0.902 17.148 0.75 16.682 0.75 15.75 0.75 11.75 0.75 7.75 0.75 3.75 0.75 2.818 0.75 2.352 0.75 1.984 0.902 1.494 1.105 1.105 1.495 0.902 1.985 0.75 2.352 0.75 2.818 0.75 3.75 0.75 4.75 0.75 5.75 0.75 6.75 0.75 7.75 0.75 8.75 0.75 9.75 0.75 10.682 0.75 11.148 0.902 11.515 1.105 12.005 1.494 12.395 1.984 12.598 2.352 12.75 2.818 12.75 3.75 12.75ZM7.75 0.75C7.75 4.75 7.75 8.75 7.75 12.75",
  "M7.75 12.75C10.417 12.75 13.083 12.75 15.75 12.75 16.682 12.75 17.148 12.75 17.515 12.598 18.005 12.395 18.395 12.005 18.598 11.515 18.75 11.148 18.75 10.682 18.75 9.75 17.093 9.75 15.75 8.407 15.75 6.75 15.75 5.093 17.093 3.75 18.75 3.75 18.75 2.818 18.75 2.352 18.598 1.985 18.395 1.495 18.005 1.105 17.515 0.902 17.148 0.75 16.682 0.75 15.75 0.75 11.75 0.75 7.75 0.75 3.75 0.75 2.818 0.75 2.352 0.75 1.984 0.902 1.494 1.105 1.105 1.495 0.902 1.985 0.75 2.352 0.75 2.818 0.75 3.75 2.407 3.75 3.75 5.093 3.75 6.75 3.75 8.407 2.407 9.75 0.75 9.75 0.75 10.682 0.75 11.148 0.902 11.515 1.105 12.005 1.494 12.395 1.984 12.598 2.352 12.75 2.818 12.75 3.75 12.75ZM7.75 0.75C7.75 4.75 7.75 8.75 7.75 12.75",
];

const [S1, S2] = PATH_1_STATES;

// The outline runs bottom edge → up the RIGHT edge → top edge → down the
// LEFT edge. These are the two left-edge cubic spans from the generated
// states above, so the "left already clipped, right still flat" middle pose
// is composed from validated geometry instead of a hand-written d string.
const LEFT_EDGE_FLAT =
  "0.75 4.75 0.75 5.75 0.75 6.75 0.75 7.75 0.75 8.75 0.75 9.75";
const LEFT_EDGE_CLIPPED =
  "2.407 3.75 3.75 5.093 3.75 6.75 3.75 8.407 2.407 9.75 0.75 9.75";
const S_LEFT = S1.replace(LEFT_EDGE_FLAT, LEFT_EDGE_CLIPPED);

const SEQUENCE: AnimationSequence = [
  // Unclip to a fresh ticket, then two separate bites: left, beat, right.
  [
    ".ticket-icon-path-1",
    { d: [S2, S1, S1, S_LEFT, S_LEFT, S2, S2] },
    {
      duration: DURATION,
      times: TIMES,
      ease: [
        EASE_IN_OUT_CUBIC,
        "linear",
        EASE_OUT_QUINT,
        "linear",
        EASE_OUT_QUINT,
        "linear",
      ],
    },
  ],
  // Impact garnish: each bite shoves the ticket away from the clipper —
  // +x for the left bite, -x for the right — then it settles during the beat.
  [
    ".ticket-icon-path-1",
    { x: [0, 0, 0, 0.45, 0, -0.45, 0] },
    {
      at: 0,
      duration: DURATION,
      times: TIMES,
      ease: [
        "linear",
        "linear",
        EASE_OUT_QUINT,
        EASE_OUT_QUAD,
        EASE_OUT_QUINT,
        EASE_OUT_QUAD,
      ],
    },
  ],
];

export const TicketIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
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
        viewBox="0 0 20 14"
        fill="none"
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        <motion.path
          className="ticket-icon-path-1"
          d={S2}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          // Recoil nudges are in viewBox units, from the ticket's own box.
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      </svg>
    );
  },
);

TicketIcon.displayName = "TicketIcon";
