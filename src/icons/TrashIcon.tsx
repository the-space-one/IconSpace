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
 * ANIMATION STORYBOARD — the lid flips open, the bin shakes
 * out its contents, the lid drops shut (hover)
 *
 *      0ms  rest: closed bin, lid level
 *  0-160ms  OPEN — the lid (rail + handle) tips up 22° about
 *           its LEFT hinge on an easeOut. Fast, so the shake
 *           gets the stage.
 *  160-560ms HOLD OPEN while the CAN does a two-beat shimmy:
 *           +3.4°, -2.4°, +1° about the base centre, ~7Hz —
 *           a bin being shaken out, not a pendulum swinging.
 *           The two inner tick-lines ride the can, so the
 *           "contents" shake with it.
 *  560-680ms SNAP SHUT — the lid slams back to level in 120ms
 *           on LockIcon's bite curve [0.23, 1, 0.32, 1]: near
 *           all the travel in the first frames, then it just
 *           lands. Twice as slow going up as coming down, so
 *           the eye reads the shut as the event.
 *  680-900ms settled, closed — pixel-identical to rest (§0.2).
 *
 * TWO PARTS, TWO CLOCKS. The lid and the can are separate
 * groups on their own `times` (LockIcon / TicketIcon pattern):
 * the can must stay still until the lid is clear, shimmy only
 * while it is open, and be still again before it shuts — a
 * shared clock would smear the shake across the open and close.
 * The shake segment is fired at `at: 0.18` and ends at 0.56,
 * inside the lid's open-and-hold window (0.16 → 0.56).
 *
 * THE LID HINGES AT ITS LEFT END (4, 6), so the free right end
 * and the handle swing up and the bin mouth is uncovered — a
 * pedal-bin lid, not a sliding lift. The CAN turns about its
 * base centre (12, 22): a shimmy pivots at the feet, so the
 * mouth swings and the base stays planted.
 *
 * Class A per ICON-SYSTEM §2 — rotation only, both parts.
 * Rotation is isometric, so strokeWidth never changes and the
 * two halves keep the same weight as every other icon.
 * ───────────────────────────────────────────────────────── */

/** Lid = the rail across the top plus the handle tab above it. Rotates as
 *  one group about the hinge. */
const LID_RAIL_D = "M4 6H20";
const LID_HANDLE_D = "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2";
/** Can = the bucket body plus the two inner tick-lines (the "contents"). */
const CAN_BODY_D = "M18 6v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6";
const CAN_TICK_L_D = "M10 11v6";
const CAN_TICK_R_D = "M14 11v6";

/** Lid hinge: the rail's LEFT end, so the right end and handle lift clear. */
const LID_PIVOT = "4px 6px";
/** Can pivot: the base centre, so the shimmy swings the mouth, feet planted. */
const CAN_PIVOT = "12px 22px";

/** How far the lid tips open. */
const OPEN_DEG = 22;

const DURATION = 0.9;

/** Open fast, hold, SNAP shut, stay closed. */
const LID_ROTATE = [0, -OPEN_DEG, -OPEN_DEG, 0, 0];
const LID_TIMES = [0, 0.18, 0.62, 0.76, 1];
/** LockIcon's clipper bite for the shut — near-instant attack, soft arrival. */
const SNAP: Easing = [0.23, 1, 0.32, 1];
const LID_EASE: Easing[] = ["easeOut", "linear", SNAP, "linear"];

/** Two-beat shimmy, decaying, on the can's own clock (see storyboard). */
const SHAKE_AT = 0.18;
const SHAKE_DUR = 0.4;
const SHAKE_ROTATE = [0, 3.4, -2.4, 1, 0];
const SHAKE_TIMES = [0, 0.28, 0.56, 0.8, 1];
const SHAKE_EASE: Easing[] = ["easeInOut", "easeInOut", "easeInOut", "easeInOut"];

const SEQUENCE: AnimationSequence = [
  [
    ".trash-lid",
    { rotate: LID_ROTATE },
    { duration: DURATION, times: LID_TIMES, ease: LID_EASE },
  ],
  [
    ".trash-can",
    { rotate: SHAKE_ROTATE },
    { at: SHAKE_AT, duration: SHAKE_DUR, times: SHAKE_TIMES, ease: SHAKE_EASE },
  ],
];

export const TrashIcon = forwardRef<
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
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      // The lid swings above the box and the shimmy leans past its sides.
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* The can shimmies about its base; ticks ride inside it. transformOrigin
          lives in `initial` (Motion overrides a style origin with its 50%/50%
          SVG default), transformBox in `style` to make the pixels view-box
          units. Rest rotate is in `initial` so the scrubber's pre-paint pause
          holds the bin still until the first seek. */}
      <motion.g
        className="trash-can"
        initial={{ rotate: 0, transformOrigin: CAN_PIVOT }}
        style={{ transformBox: "view-box" }}
      >
        <path d={CAN_BODY_D} />
        <path d={CAN_TICK_L_D} />
        <path d={CAN_TICK_R_D} />
      </motion.g>
      {/* The lid tips open and slams shut about its left hinge. */}
      <motion.g
        className="trash-lid"
        initial={{ rotate: 0, transformOrigin: LID_PIVOT }}
        style={{ transformBox: "view-box" }}
      >
        <path d={LID_RAIL_D} />
        <path d={LID_HANDLE_D} />
      </motion.g>
    </svg>
  );
});

TrashIcon.displayName = "TrashIcon";
