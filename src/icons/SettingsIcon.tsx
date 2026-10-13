import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type SVGProps,
} from "react";
import {
  motion,
  useAnimate,
  useReducedMotion,
  type AnimationSequence,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — shrink, THEN spin, then settle
 *
 * The outer ring has 4-fold rotational symmetry (4 teeth /
 * 4 valleys), so any multiple of 90° lands pixel-identical
 * to rest. The beats are strictly sequential — the shrink is
 * its own moment, not something riding along with the spin.
 *
 * HOVER IN   1. SHRINK  ring eases down to 0.8 (250ms)
 *            2. SPIN    while small, it turns LEFT two teeth
 *                       (0 → -180°) over 700ms, smooth
 *                       ease-in-out — no snap either end
 *            3. SETTLE  eases back up to full size (250ms),
 *                       then PARKS
 * HOVER OUT  same three beats mirrored: shrink, spin RIGHT
 *            back home (-180° → 0), settle.
 * The inner circle never moves.
 *
 * Interactive like ClockIcon: SettingsIcon carries its own
 * mouse handlers. A retarget stops the in-flight sequence and
 * starts the beats again from the current pose, so leaving
 * mid-turn reverses smoothly.
 *
 * SettingsPreviewIcon is the one-shot for /scrub and sidebar
 * rows: enter (0-1200ms) → dwell (1200-1500ms) → leave
 * (1500-2700ms).
 * ───────────────────────────────────────────────────────── */

/** Outer gear ring (4 teeth, 4 valleys). */
const RING_D =
  "m5.855 3.203-.7-.162A1.762 1.762 0 0 0 3.04 5.155l.162.7a1.99 1.99 0 0 1-.836 2.104l-.85.568a1.72 1.72 0 0 0 0 2.863l.85.567a1.99 1.99 0 0 1 .836 2.105l-.162.7a1.762 1.762 0 0 0 2.114 2.113l.7-.161a1.99 1.99 0 0 1 2.104.835l.568.852a1.72 1.72 0 0 0 2.863 0l.567-.852a1.99 1.99 0 0 1 2.105-.835l.7.161a1.762 1.762 0 0 0 2.113-2.113l-.161-.7a1.99 1.99 0 0 1 .835-2.104l.852-.568a1.72 1.72 0 0 0 0-2.863l-.852-.568a1.99 1.99 0 0 1-.835-2.104l.161-.7a1.762 1.762 0 0 0-2.113-2.114l-.7.162a1.99 1.99 0 0 1-2.104-.836l-.568-.85a1.72 1.72 0 0 0-2.863 0l-.568.85a1.99 1.99 0 0 1-2.104.836Z";

/** Inner circle (static). */
const HUB_D =
  "M12.642 9.905a2.738 2.738 0 1 1-5.475 0 2.738 2.738 0 0 1 5.475 0Z";

// Two teeth of the 4-fold-symmetric ring; negative = left/counterclockwise.
const TOOTH_TURN = -180;

// Beat durations (seconds). Each beat gets its own moment so the viewer
// reads shrink → spin → settle as three distinct steps, but kept brisk
// enough that the whole turn doesn't drag.
const SHRINK_DURATION = 0.25;
const SPIN_DURATION = 0.7;
const SETTLE_DURATION = 0.25;

// How small the ring gets before it starts turning. Deep enough that the
// shrink reads as its own beat even at sidebar size.
const DIP = 0.8;

// Ease-in-out cubic: no snappy launch, no hard brake — a lazy, deliberate turn.
const EASE_SMOOTH = [0.65, 0, 0.35, 1] as const;

const RING_SELECTOR = ".settings-ring";

/** Preview timeline beats (seconds). */
const ENTER_LENGTH = SHRINK_DURATION + SPIN_DURATION + SETTLE_DURATION; // 1.2
const LEAVE_AT = ENTER_LENGTH + 0.3; // 300ms dwell parked at -180°

/** The three sequential beats of one turn, laid onto an absolute timeline. */
function turnBeats(from: number, to: number, at: number): AnimationSequence {
  return [
    [
      RING_SELECTOR,
      { scale: [1, DIP] },
      { at, duration: SHRINK_DURATION, ease: "easeInOut" },
    ],
    [
      RING_SELECTOR,
      { rotate: [from, to] },
      {
        at: at + SHRINK_DURATION,
        duration: SPIN_DURATION,
        ease: [...EASE_SMOOTH],
      },
    ],
    [
      RING_SELECTOR,
      { scale: [DIP, 1] },
      {
        at: at + SHRINK_DURATION + SPIN_DURATION,
        duration: SETTLE_DURATION,
        ease: "easeInOut",
      },
    ],
  ];
}

const SEQUENCE: AnimationSequence = [
  // ENTER: shrink, spin two teeth left, settle.
  ...turnBeats(0, TOOTH_TURN, 0),
  // (dwell: parked at -180°, which renders identical to rest)
  // LEAVE: shrink, spin back right, settle.
  ...turnBeats(TOOTH_TURN, 0, LEAVE_AT),
];

function GearArt() {
  return (
    <>
      {/* Only the ring turns; fill-box center keeps it turning in place. */}
      <motion.path
        className="settings-ring"
        d={RING_D}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      <path d={HUB_D} />
    </>
  );
}

const SVG_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinejoin: "round",
  style: { overflow: "visible" },
} as const;

/**
 * Interactive settings gear: turns left while hovered, turns back right on
 * leave (own mouse handlers, like ClockIcon — not a one-shot timeline).
 */
export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const inFlight = useRef<ReturnType<typeof animate> | null>(null);

  const turnTo = (rotate: number) => {
    // Freeze the current pose so re-targeting mid-turn continues from it
    // instead of letting the old sequence's later beats fire underneath.
    inFlight.current?.stop();
    if (reduced) {
      // No theatrics: park the ring instantly (identical silhouette anyway).
      animate(RING_SELECTOR, { rotate, scale: 1 }, { duration: 0 });
      return;
    }
    // Same three beats as the preview, from wherever the ring is now:
    // shrink, spin to the target angle, settle back to full size.
    inFlight.current = animate([
      [
        RING_SELECTOR,
        { scale: DIP },
        { duration: SHRINK_DURATION, ease: "easeInOut" },
      ],
      [
        RING_SELECTOR,
        { rotate },
        { duration: SPIN_DURATION, ease: [...EASE_SMOOTH] },
      ],
      [
        RING_SELECTOR,
        { scale: 1 },
        { duration: SETTLE_DURATION, ease: "easeInOut" },
      ],
    ]);
  };

  return (
    <svg
      {...SVG_PROPS}
      ref={scope}
      {...props}
      onMouseEnter={() => turnTo(TOOTH_TURN)}
      onMouseLeave={() => turnTo(0)}
    >
      <GearArt />
    </svg>
  );
}

SettingsIcon.displayName = "SettingsIcon";

/**
 * One-shot preview of the same motion (enter → dwell → leave) for the
 * sidebar rows and the Scrub Lab. No mouse handlers of its own, so it never
 * fights the scrubber.
 */
export const SettingsPreviewIcon = forwardRef<
  IconHandle,
  SVGProps<SVGSVGElement>
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
    <svg {...SVG_PROPS} ref={scope} {...props}>
      <GearArt />
    </svg>
  );
});

SettingsPreviewIcon.displayName = "SettingsPreviewIcon";
