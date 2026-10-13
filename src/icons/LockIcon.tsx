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
 * ANIMATION STORYBOARD — the lock swings open, then snaps
 * shut and takes the hit (hover)
 *
 * REST IS CLOSED, and the snap is the LAST beat — the same
 * shape as TicketIcon, whose rest is the already-clipped
 * ticket: hover quietly UNDOES the state, beats, then slams it
 * back. The gesture ends on its loudest moment instead of
 * tidying up after it.
 *
 *     0ms  rest: locked (rotate 0°)
 *  0-256ms  OPEN — the shackle swings 30° up off its RIGHT
 *           hinge, ease-in-out. Unhurried: this is the load,
 *           not the event.
 *   256ms   LIFT — a further 4° over 96ms. The last inch of
 *           wind-up, the way the ticket's clipper lines up
 *           before it bites.
 *   352ms   SNAP — the shackle slams back to closed in 128ms
 *           on TicketIcon's own bite curve, ease-out-quint
 *           [0.23, 1, 0.32, 1]: almost all the travel in the
 *           first two frames, then it just arrives. This is
 *           the whole icon.
 *   480ms   IMPACT — the shackle has landed, and the WHOLE
 *           lock recoils 0.45 units down and settles, on its
 *           own slightly later clock. The ticket recoils
 *           sideways when it is bitten; this one takes the
 *           blow downward.
 *   800ms   settled, locked — pixel-identical to rest (§0.2)
 *
 * SNAP IS THE STAR, EVERYTHING ELSE SERVES IT. The 128ms bite
 * against the 256ms opening is the whole contrast — twice as
 * slow going up as coming down, so the eye reads the slam as
 * the event and the opening as the wind-up that paid for it.
 *
 * IT OPENS OFF THE RIGHT LEG. The hinge is the RIGHT foot, so
 * the LEFT leg is the one that lifts clear. Mirrored from the
 * first pass, which hinged left.
 *
 * THE RECOIL RUNS ON ITS OWN `times`, NOT THE SHACKLE'S.
 * Sharing one clock would ramp the jolt across the whole
 * snap — the body would start sinking while the shackle is
 * still in the air, which reads as the lock deflating rather
 * than being hit. It has to stay still until contact, so it
 * holds at 0 until 0.38 and peaks at 0.42, just after the
 * shackle lands. Per-layer clocks are the LightningIcon /
 * TicketIcon pattern.
 *
 * WHY THE WHOLE LOCK RECOILS, NOT THE BODY. The shackle's
 * legs sit inside the body; jolting the body alone would slide
 * it out from under them and open a gap at the hinge. The
 * recoil is on a group wrapping BOTH, so they take the hit as
 * one object.
 *
 * GEOMETRY — the OPEN pose is what got fitted to the grid, even
 * though rest is closed, because open is the taller of the two.
 * Rotating the shackle about a hinge swings the arc's peak
 * toward vertical, which RAISES it: at 30° the peak lands 0.9
 * units higher than when closed. Solving
 * 0.866·LEG + 1.366·R = 6.75 puts that raised peak exactly on
 * the 0.75 ink line, giving R 3.4 and legs 2.43. Size the
 * closed pose to the grid instead — the obvious way round —
 * and the shackle leaves the box every time it opens.
 *
 * Rotation is isometric, so strokeWidth never changes.
 * ───────────────────────────────────────────────────────── */

/** Body: rounded rect, sitting on the baseline. */
const BODY = { x: 2.25, y: 8.25, w: 13.5, h: 8.25, r: 1.5 } as const;

/**
 * Shackle, drawn CLOSED — which is also the rest pose, so `rotate: 0` is
 * genuinely locked and the static glyph needs no transform. Radius 3.4, legs
 * 2.43, arc as two cubic quarters at the circle constant (§2 bans `A` in
 * anything animatable). Structure M L C C L: leg, quarter, quarter, leg.
 */
const SHACKLE_D =
  "M5.6 8.25L5.6 5.819" +
  "C5.6 3.941 7.122 2.419 9 2.419" +
  "C10.878 2.419 12.4 3.941 12.4 5.819" +
  "L12.4 8.25";

/** The hinge: the RIGHT leg's foot, so the LEFT leg is the one that lifts. */
const PIVOT = "12.4px 8.25px";

/** How far it swings open, and the last inch of lift before the drop.
 *  Positive = clockwise, which raises the left leg off this hinge. */
const OPEN_DEG = 30;
const LIFT_DEG = 34;
/** How far the whole lock is driven down by the impact, viewBox units. */
const RECOIL_Y = 0.45;

const DURATION = 0.8;

/** TicketIcon's clipper bite — near-instant attack, then it just arrives. */
const SNAP: Easing = [0.23, 1, 0.32, 1];
const EASE_OUT_QUINT: Easing = [0.16, 1, 0.3, 1];
const EASE_SETTLE: Easing = [0.22, 1, 0.36, 1];

const SEQUENCE: AnimationSequence = [
  // The shackle: swing open, lift the last inch, SLAM shut, stay locked.
  [
    ".lock-shackle",
    { rotate: [0, OPEN_DEG, LIFT_DEG, 0, 0] },
    {
      duration: DURATION,
      times: [0, 0.32, 0.44, 0.6, 1],
      ease: ["easeInOut", "easeInOut", SNAP, "linear"] as Easing[],
    },
  ],
  // The recoil, on its own clock: dead still until contact, then a fast drop
  // and a settle. Peaks at 0.62 — just after the shackle lands at 0.60.
  [
    ".lock-recoil",
    { y: [0, 0, RECOIL_Y, 0, 0] },
    {
      at: 0,
      duration: DURATION,
      times: [0, 0.57, 0.62, 0.8, 1],
      ease: ["linear", EASE_OUT_QUINT, EASE_SETTLE, "linear"] as Easing[],
    },
  ],
];

export const LockIcon = forwardRef<
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
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* Body and shackle take the impact together — see the storyboard. */}
      <motion.g className="lock-recoil">
        <rect
          x={BODY.x}
          y={BODY.y}
          width={BODY.w}
          height={BODY.h}
          rx={BODY.r}
        />
        {/* transformOrigin lives in `initial`, because Motion overwrites a
            style-level origin with its 50%/50% SVG default; transformBox
            lives in `style`, and is what makes those pixels mean viewBox
            units. Backwards, and the shackle spins about its own bbox —
            which looks nearly right at rest and obviously broken mid-swing.
            The rest angle is in `initial` too, so makeScrubber's pre-paint
            pause holds the lock CLOSED until the first seek. */}
        <motion.g
          className="lock-shackle"
          initial={{ rotate: 0, transformOrigin: PIVOT }}
          style={{ transformBox: "view-box" }}
        >
          <path d={SHACKLE_D} />
        </motion.g>
      </motion.g>
    </svg>
  );
});

LockIcon.displayName = "LockIcon";
