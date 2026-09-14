"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type SVGProps,
} from "react";
import {
  motion,
  useAnimate,
  useReducedMotion,
  type AnimationPlaybackControls,
  type AnimationSequence,
} from "motion/react";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — alarm clock easter egg (interactive)
 *
 * AT REST
 *   completely still — nothing animates until hovered.
 *
 * PLAY — the time, THEN one ring of the alarm (a single finite
 *   timeline, two beats)
 *   FIRST the HANDS SPIN in circular motion — the hour hand
 *   takes one full lap, the minute hand two — landing on the
 *   REAL current time via springs (stiffness 250 / damping 25 /
 *   mass 1.2), on a clock still sitting at rest. ONLY once that
 *   spring has mostly landed (RING_START) does it ring: the
 *   whole clock lifts half a unit and tilts to -3° with a -4°
 *   overshoot; the face vibrates side to side for THREE full
 *   cycles; the bells rise while each leg buzzes three cycles
 *   in opposite phase (the right leg folds in -8° to keep
 *   facing the clock). The time-reveal and the ring used to
 *   play together; keeping them as separate beats reads as
 *   "here's the time — now it goes off." Plays ONCE and holds.
 *   No click behavior at all — hover is the whole show, so the
 *   timeline is built fresh per play to read the clock.
 *
 * RESET — smooth unwind (per the reference spec)
 *   the ring timeline is stopped where it stands; the hands
 *   spring backwards around the dial to their rest angles on
 *   the same spring, while every group eases home in
 *   parallel. Springing to targets from current values (not
 *   reversed playback) is what keeps it smooth, and it works
 *   from any point — mid-ring or held.
 *
 * Adapted from the layered-artwork spec onto this flat icon:
 * no background layer (its tilt is folded into the clock
 * group), the top legs play the bells, and the rest-pose hand
 * (12 → 14.5,14.5) becomes the hour hand at 135°.
 *
 * Driven from the outside via IconHandle, so the whole shelf
 * tile is the hover target rather than the icon's own box —
 * matching the other icons. `reset()` is the extra beat the
 * plain IconHandle has no room for: this animation holds its
 * end pose instead of returning to rest on its own, so the
 * caller has to unwind it on mouse-leave. Not scrubbable —
 * the timeline is rebuilt per play to read the clock.
 * ───────────────────────────────────────────────────────── */

const CLOCK_CENTER = "12px 12px";
const INITIAL_HOUR_ROTATION = 135; // rest pose: hand pointing at 14.5,14.5

const REST_POSE = "translateY(0px) rotate(0deg) scale(1)";
const HOVER_POSE = "translateY(-0.5px) rotate(-3deg) scale(1)";

const HANDS_SPRING = {
  type: "spring",
  stiffness: 250,
  damping: 25,
  mass: 1.2,
} as const;

// When the alarm starts ringing, in seconds. The hands spin to the current
// time first (from t=0); the lift/shake/bells hold off until the hand spring
// has mostly landed (~0.5s), so the timeline reads as two beats — the hands
// show the time, THEN it rings — instead of both playing on top of each other.
const RING_START = 0.65;

/** One ring of the alarm — beat 2 of the timeline: every track fires together
 *  at RING_START (after the hands have shown the time) and lands on the held
 *  hover pose. First keyframes are `null` (= current value) so a hover that
 *  interrupts the unwind picks up smoothly instead of snapping to rest, and so
 *  the group holds at rest through beat 1 before the ring starts. The hand-spin
 *  tracks are prepended per hover (they land on the actual current time), see
 *  buildRingSequence(). */
const RING_BASE: AnimationSequence = [
  // Lift + tilt (the spec's background wobble folded into the one group).
  [
    "[data-animate='clock-and-bells']",
    {
      transform: [
        null,
        "translateY(-0.5px) rotate(-4deg) scale(0.99)",
        HOVER_POSE,
      ],
    },
    { duration: 0.3, ease: "easeOut", at: RING_START },
  ],
  // The face vibrates side to side — three full cycles.
  [
    "[data-animate='clock']",
    { x: [null, -0.27, 0.27, -0.27, 0.27, -0.27, 0.27, 0] },
    { duration: 0.75, ease: "linear", at: RING_START },
  ],
  // Bells rise and hold; each leg buzzes three cycles in opposite phase,
  // and the right leg folds in -8° to keep facing the clock as it rises.
  [
    "[data-animate='bells']",
    { y: [null, -1.25] },
    { duration: 1, ease: "easeOut", at: RING_START },
  ],
  [
    "[data-animate='bell'][data-index='0']",
    { x: [null, -0.31, 0.31, -0.31, 0.31, -0.31, 0.31, 0] },
    { duration: 0.75, ease: "linear", at: RING_START },
  ],
  [
    "[data-animate='bell'][data-index='1']",
    { x: [null, 0.31, -0.31, 0.31, -0.31, 0.31, -0.31, 0] },
    { duration: 0.75, ease: "linear", at: RING_START },
  ],
  [
    "[data-animate='bell'][data-index='1']",
    { rotate: [null, -8] },
    { duration: 1, ease: "easeOut", at: RING_START },
  ],
];

/** The full timeline, built per hover: the hands spin FIRST (from t=0) in
 *  circular motion — hour one full lap, minute two — landing on the time it is
 *  right now, while the clock still sits at rest. The explicit first keyframe
 *  means the spin always starts its lap from the rest angle. RING_BASE then
 *  rings the alarm from RING_START, once the hands have landed, so the
 *  time-reveal and the ring read as two separate beats. */
const buildRingSequence = (): AnimationSequence => {
  const now = new Date();
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const hourRotation = hours * 30 + minutes * 0.5; // 360° / 12h
  const minuteRotation = minutes * 6 + seconds * 0.1; // 360° / 60min

  return [
    // Beat 1 — the hands sweep to the current time (at t=0).
    [
      "[data-animate='hour-hand']",
      { rotate: [INITIAL_HOUR_ROTATION, 360 * 1 + hourRotation] },
      { ...HANDS_SPRING, at: 0 },
    ],
    [
      "[data-animate='minute-hand']",
      { rotate: [0, 360 * 2 + minuteRotation] },
      { ...HANDS_SPRING, at: 0 },
    ],
    // Beat 2 — it rings (every RING_BASE track is pinned to RING_START).
    ...RING_BASE,
  ];
};

/** The clock holds its end pose instead of settling back on its own, so the
 *  caller owns both hover edges: `playAnimation()` on enter, `reset()` on
 *  leave. */
export interface ClockIconHandle extends IconHandle {
  /** Unwind to rest. Safe to call from any point: mid-ring, held, mid-spin. */
  reset(): void;
}

export const ClockIcon = forwardRef<ClockIconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();
    const reduced = useReducedMotion();
    // The one-shot ring timeline. Kept so reset() can stop it where it stands
    // and a re-entry mid-unwind can pick it back up.
    const ring = useRef<AnimationPlaybackControls | null>(null);

    useEffect(
      () => () => {
        ring.current?.stop();
        ring.current = null;
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        // Not awaited: stop() on an in-flight ring leaves its promise unsettled,
        // so awaiting here would hang whenever a hover interrupts a hover.
        async playAnimation() {
          if (reduced) return;

          // Interrupt whatever is in flight (an unwind, or a previous ring) and
          // start a fresh ring from the current values — the null first
          // keyframes in the sequence make the pickup seamless.
          ring.current?.stop();
          ring.current = animate(buildRingSequence());
        },

        reset() {
          if (reduced) return;

          // Stop the ring where it stands and retarget everything home from its
          // current value — springs/tweens to targets, not reversed playback.
          // This is the reference repo's reset recipe and stays smooth from any
          // point: mid-ring, held, or mid-spin.
          ring.current?.stop();
          ring.current = null;

          // The hands spring backwards around the dial to their rest angles.
          animate(
            "[data-animate='hour-hand']",
            { rotate: INITIAL_HOUR_ROTATION },
            HANDS_SPRING,
          );
          animate("[data-animate='minute-hand']", { rotate: 0 }, HANDS_SPRING);

          // Every group eases back to rest in parallel.
          animate(
            "[data-animate='clock-and-bells']",
            { transform: REST_POSE },
            { duration: 0.3, ease: "easeOut" },
          );
          animate(
            "[data-animate='clock']",
            { x: 0 },
            { duration: 0.2, ease: "easeOut" },
          );
          animate(
            "[data-animate='bells']",
            { y: 0 },
            { duration: 0.3, ease: "easeOut" },
          );
          animate(
            "[data-animate='bell'][data-index='0']",
            { x: 0 },
            { duration: 0.2, ease: "easeOut" },
          );
          animate(
            "[data-animate='bell'][data-index='1']",
            { x: 0, rotate: 0 },
            { duration: 0.2, ease: "easeOut" },
          );
        },
      }),
      [animate, reduced],
    );

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="2 1.75 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ overflow: "visible" }}
        {...props}
      >
        <g ref={scope}>
          {/* transformOrigin lives in `initial`, not `style`: Motion overrides a
            style origin with its 50%/50% SVG default. view-box makes the
            pixel coordinates viewBox-relative. */}
          <motion.g
            data-animate="clock-and-bells"
            initial={{ transform: REST_POSE, transformOrigin: CLOCK_CENTER }}
            style={{ transformBox: "view-box" }}
          >
            <motion.g data-animate="clock" initial={{ x: 0 }}>
              <circle cx="12" cy="12" r="9.25" />
              <motion.line
                data-animate="minute-hand"
                x1="12"
                y1="12"
                x2="12"
                y2="8"
                initial={{ rotate: 0, transformOrigin: CLOCK_CENTER }}
                style={{ transformBox: "view-box" }}
              />
              <motion.line
                data-animate="hour-hand"
                x1="12"
                y1="12"
                x2="12"
                y2="8.464"
                initial={{
                  rotate: INITIAL_HOUR_ROTATION,
                  transformOrigin: CLOCK_CENTER,
                }}
                style={{ transformBox: "view-box" }}
              />
            </motion.g>

            {/* The bells swing around the clock center (view-box origin), but
              each leg buzzes/folds around its own bbox. */}
            <motion.g
              data-animate="bells"
              initial={{ rotate: 0, y: 0, transformOrigin: CLOCK_CENTER }}
              style={{ transformBox: "view-box" }}
            >
              <motion.line
                data-animate="bell"
                data-index="0"
                x1="2"
                y1="5.25"
                x2="5"
                y2="2.25"
                initial={{ x: 0, rotate: 0 }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
              <motion.line
                data-animate="bell"
                data-index="1"
                x1="22"
                y1="5.25"
                x2="19"
                y2="2.25"
                initial={{ x: 0, rotate: 0 }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            </motion.g>
          </motion.g>
        </g>
      </svg>
    );
  },
);

ClockIcon.displayName = "ClockIcon";
