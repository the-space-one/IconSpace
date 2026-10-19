import { useEffect, useEffectEvent, useRef, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  useReducedMotion,
  type AnimationPlaybackControls,
  type AnimationSequence,
} from "motion/react";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — alarm clock easter egg (interactive)
 *
 * AT REST
 *   completely still — nothing animates until hovered.
 *
 * HOVER — one ring of the alarm, in two beats (a single timeline)
 *   BEAT 1: the HANDS SPIN in circular motion from t=0 — the
 *   hour hand takes one full lap, the minute hand two —
 *   landing on the REAL current time via springs (stiffness
 *   250 / damping 25 / mass 1.2), while the clock still sits
 *   at rest. BEAT 2 (~0.65s in, once the hands have landed):
 *   the whole clock lifts half a unit and tilts to -3° with a
 *   -4° overshoot; the face vibrates side to side for THREE
 *   full cycles; the bells rise while each leg buzzes three
 *   cycles in opposite phase (the right leg folds in -8° to
 *   keep facing the clock). Plays ONCE and holds. No click
 *   behavior at all — hover is the whole show, so the timeline
 *   is built fresh per hover to read the clock.
 *
 * MOUSE LEAVE — smooth unwind (per the reference spec)
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
 * Self-contained interactive component: own hover handlers,
 * no IconHandle, not scrubbable.
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

export function ClockIcon({ ringing, ...props }: SVGProps<SVGSVGElement> & {
  /** Ring (true) and unwind (false) as if hovered, for a copy no pointer reaches. */
  ringing?: boolean;
}) {
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  // The one-shot ring timeline. Kept so mouse-leave can reverse it and a
  // re-entry mid-reverse can flip it forward again.
  const ring = useRef<AnimationPlaybackControls | null>(null);

  useEffect(
    () => () => {
      ring.current?.stop();
      ring.current = null;
    },
    []
  );

  const handleMouseEnter = () => {
    if (reduced) return;

    // Interrupt whatever is in flight (an unwind, or a previous ring) and
    // start a fresh ring from the current values — the null first keyframes
    // in the sequence make the pickup seamless.
    ring.current?.stop();
    ring.current = animate(buildRingSequence());
  };

  const handleMouseLeave = () => {
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
      HANDS_SPRING
    );
    animate("[data-animate='minute-hand']", { rotate: 0 }, HANDS_SPRING);

    // Every group eases back to rest in parallel.
    animate(
      "[data-animate='clock-and-bells']",
      { transform: REST_POSE },
      { duration: 0.3, ease: "easeOut" }
    );
    animate("[data-animate='clock']", { x: 0 }, { duration: 0.2, ease: "easeOut" });
    animate("[data-animate='bells']", { y: 0 }, { duration: 0.3, ease: "easeOut" });
    animate(
      "[data-animate='bell'][data-index='0']",
      { x: 0 },
      { duration: 0.2, ease: "easeOut" }
    );
    animate(
      "[data-animate='bell'][data-index='1']",
      { x: 0, rotate: 0 },
      { duration: 0.2, ease: "easeOut" }
    );
  };

  const follow = useEffectEvent((on: boolean) => (on ? handleMouseEnter() : handleMouseLeave()));
  useEffect(() => {
    if (ringing !== undefined) follow(ringing);
  }, [ringing]);

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
      {...props}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
}

ClockIcon.displayName = "ClockIcon";
