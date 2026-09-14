"use client";

import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import { motion, useAnimate, type AnimationSequence } from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — calendar page opening (one-shot)
 *
 *    0ms  closed desk calendar: body rect, divider,
 *         two binder pegs                        (frame 1)
 * ~190ms  front page swung up around the divider
 *         hinge toward the viewer — trapezoid in
 *         perspective, body narrowed behind it,
 *         pegs pulled in                         (frame 2)
 * ~265ms  brief hold at the top of the swing
 *  550ms  page settles closed, identical to rest (frame 1)
 *
 * All three parts (pegs / body outline / front page) are
 * parser-validated d-morphs sharing ONE duration + easing —
 * the paired-elements rule: they move as a unit, they feel
 * like a unit. Snappy per motion-craft: the user-initiated
 * lift rides ease-out-quart (fast start = instant response,
 * ~190ms — interaction feedback under 200ms), then the
 * settle is the on-screen-movement case and glides home on
 * ease-in-out-cubic over the long tail. Stroke-only d
 * morphs: no layout properties, deterministic at any scrub
 * position. Reduced-motion is guarded at the trigger
 * (SidebarRow / Stage), as everywhere in the system.
 *
 * Generated from 2 frames by scripts/parse-frames.mjs.
 * Path states are validated (identical command structure) —
 * do not hand-edit the d strings; re-export frames and
 * re-run the parser.
 * ───────────────────────────────────────────────────────── */

const DURATION = 0.55;

/** rest → open → hold → rest */
const TIMES = [0, 0.35, 0.48, 1];

/** Per-segment easing: ease-out-quart lift, hold, ease-in-out-cubic settle. */
const EASES: ([number, number, number, number] | "linear")[] = [
  [0.165, 0.84, 0.44, 1],
  "linear",
  [0.645, 0.045, 0.355, 1],
];

/** Binder pegs: shift inward as the body tilts back in perspective. */
const PEGS_STATES = [
  "M5.614 2.807L5.614 0.75M14.886 2.807L14.886 0.75",
  "M6.266 2.579L6.266 0.75M14.508 2.579L14.508 0.75",
];

/** Body outline (bottom sliver + top arch): narrows behind the page. */
const BODY_STATES = [
  "M19.25 16.692C19.25 17.828 18.273 18.75 17.068 18.75L3.432 18.75C2.227 18.75 1.25 17.828 1.25 16.692M19.25 7.95L19.25 4.864C19.25 3.728 18.273 2.807 17.068 2.807L3.432 2.807C2.227 2.807 1.25 3.728 1.25 4.864L1.25 7.95",
  "M18.325 16.243C18.325 17.628 17.457 18.75 16.385 18.75L4.326 18.75C3.256 18.75 2.388 17.628 2.388 16.243M18.388 6.75L18.388 5.257C18.388 3.872 17.519 2.75 16.448 2.75L4.326 2.75C3.255 2.75 2.386 3.872 2.386 5.257L2.386 6.75",
];

/** Front page: lower half of the rect at rest, hinged at the divider;
 *  swings up into a bottom-wide trapezoid (perspective) when open. */
const PAGE_STATES = [
  "M19.05 7.95L1.45 7.95C1.342 7.955 1.255 8.042 1.25 8.15L1.25 16.692C1.249 17.26 1.483 17.804 1.896 18.193 2.309 18.583 2.865 18.785 3.432 18.75L17.068 18.75C17.635 18.785 18.191 18.583 18.604 18.193 19.017 17.804 19.251 17.26 19.25 16.692L19.25 8.15C19.245 8.042 19.158 7.955 19.05 7.95Z",
  "M17.616 6.75L3.566 6.75C2.861 6.75 2.252 7.241 2.101 7.929L0.786 13.929C0.689 14.372 0.798 14.836 1.082 15.19 1.367 15.544 1.796 15.75 2.25 15.75L18.615 15.75C19.056 15.75 19.475 15.556 19.76 15.22 20.045 14.883 20.168 14.438 20.095 14.003L19.095 8.003C18.974 7.28 18.348 6.75 17.615 6.75Z",
];

const keyframes = (states: string[]) => [
  states[0],
  states[1],
  states[1],
  states[0],
];

const SEQUENCE: AnimationSequence = [
  [
    ".calendar-pegs",
    { d: keyframes(PEGS_STATES) },
    { duration: DURATION, times: TIMES, ease: EASES, at: 0 },
  ],
  [
    ".calendar-body",
    { d: keyframes(BODY_STATES) },
    { duration: DURATION, times: TIMES, ease: EASES, at: 0 },
  ],
  [
    ".calendar-page",
    { d: keyframes(PAGE_STATES) },
    { duration: DURATION, times: TIMES, ease: EASES, at: 0 },
  ],
];

export const CalendarIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
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
      width="20"
      height="20"
      viewBox="0.25 -0.25 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      <motion.path className="calendar-pegs" d={PEGS_STATES[0]} />
      <motion.path className="calendar-body" d={BODY_STATES[0]} />
      <motion.path className="calendar-page" d={PAGE_STATES[0]} />
    </svg>
  );
});

CalendarIcon.displayName = "CalendarIcon";
