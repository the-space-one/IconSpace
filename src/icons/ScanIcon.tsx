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
 * ANIMATION STORYBOARD — the frame ratchets shut in three
 * notches, locks, then springs open (hover)
 *
 *    0ms  four corner brackets at rest, wide and softly
 *         rounded                                    (r = 4)
 *  115ms  CLICK 1 — the frame snaps inward and the corners
 *         lose most of their roundness             (r = 2.75)
 *  220ms  ...and HOLDS there. The hold is the notch.
 *  335ms  CLICK 2 — inward again, corners squarer   (r = 1.55)
 *  425ms  hold
 *  540ms  CLICK 3 — the last notch, corners now essentially
 *         sharp: a tight square viewfinder           (r = 0.4)
 *  665ms  LOCKED — the longest hold of the three. Stillness
 *         is what makes the release read as a release.
 * 1040ms  RELEASE — ONE continuous 375ms sweep home, easeInOut.
 *         Size and corner radius travel together the whole way:
 *         the frame is still growing while its corners are
 *         still rounding, and nothing is left to finish after
 *         it lands. No overshoot either — it never goes wider
 *         than rest, and ends pixel-identical to frame 0 (§0.2).
 *
 * THREE SNAPS, ONE RELEASE. Each notch is 115ms of quart-out
 * (it cracks) followed by a dead-still hold; the way home is a
 * single 375ms sweep. Mechanical going in, organic coming out —
 * that contrast is the whole gesture. Without the holds this is
 * a stutter; with them it is a ratchet.
 *
 * WHY THE PATH MORPHS INSTEAD OF THE FRAME SCALING. A CSS
 * `scale` would shrink the corner radius in lockstep with the
 * size (the shape would stay the same shape, just smaller) and
 * would thin the 1.5 stroke on the way. Here size and roundness
 * are INDEPENDENT parameters of a generated path, so the corners
 * can square off faster than the frame shrinks — r/h runs
 * 0.50 → 0.39 → 0.24 → 0.07 — and the stroke never changes
 * weight.
 *
 * ONE CLOCK, ONE PART. Everything lives in a single `d`
 * keyframe array — nothing to keep in sync, and every part of
 * the shape (extent, radius, arm gap) is affine in the notch
 * parameters, so Motion's numeric lerp between two states IS
 * the exact parametric in-between, not an approximation of it.
 * ───────────────────────────────────────────────────────── */

/** viewBox centre — the frame closes on this point from all four sides. */
const CENTER = 8.75;
/** Circle constant: control-handle length for a quarter-arc of radius r. */
const KAPPA = 0.5522847498307936;

/** Sign pairs for the four brackets: TL, TR, BR, BL. */
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

/**
 * One state of the frame:
 *   h   — half-extent, centre to edge (the size)
 *   r   — corner radius (the roundness)
 *   gap — half the opening at each edge midpoint (how far the arms reach)
 */
interface Notch {
  h: number;
  r: number;
  gap: number;
}

/**
 * Build the four corner brackets for one notch, as a single `d` with four
 * subpaths. Each bracket is drawn identically — move to the arm end, run to
 * the corner, one cubic quarter-arc, run back out along the other edge — so
 * every state emits the same command letters and the same 48 numbers. That is
 * the Class C morph contract (§2), guaranteed by construction rather than
 * checked by eye.
 *
 * At the rest notch this reproduces the source glyph coordinate for
 * coordinate (its `V`/`H` shorthand written out as `L`).
 */
function framePath({ h, r, gap }: Notch): string {
  return CORNERS.map(([sx, sy]) => {
    const x = (offset: number) => (CENTER + sx * offset).toFixed(3);
    const y = (offset: number) => (CENTER + sy * offset).toFixed(3);
    // Where the arc's control handles sit: KAPPA of the radius back from the
    // corner, along each edge.
    const bend = h - r * (1 - KAPPA);
    return (
      `M${x(h)} ${y(gap)}` +
      `L${x(h)} ${y(h - r)}` +
      `C${x(h)} ${y(bend)} ${x(bend)} ${y(h)} ${x(h - r)} ${y(h)}` +
      `L${x(gap)} ${y(h)}`
    );
  }).join("");
}

/**
 * The four poses. Size steps in slightly shrinking increments (0.85, 0.80,
 * 0.75) like a ratchet running out of travel, while the radius drops much
 * faster — squaring off is the dominant read. The arms lengthen a little into
 * each notch (gap tightens from 0.25·h to 0.205·h), so the brackets close on
 * the centre as well as shrink.
 */
const REST: Notch = { h: 8.0, r: 4.0, gap: 2.0 };
const NOTCH_1: Notch = { h: 7.15, r: 2.75, gap: 1.702 };
const NOTCH_2: Notch = { h: 6.35, r: 1.55, gap: 1.41 };
const NOTCH_3: Notch = { h: 5.6, r: 0.4, gap: 1.148 };

const REST_D = framePath(REST);

/** rest → click, hold, click, hold, click, LOCK, and straight home. The last
 *  state is REST itself, with no pose in between: that is what keeps size and
 *  radius on one interpolation the whole way back, instead of one finishing
 *  first and the other catching up afterwards. */
const STATES = [
  REST,
  NOTCH_1,
  NOTCH_1,
  NOTCH_2,
  NOTCH_2,
  NOTCH_3,
  NOTCH_3,
  REST,
].map(framePath);

const DURATION = 1.04;
/** Duplicated states are the holds; they shorten (105→90ms) as the ratchet
 *  tightens, then the lock beat runs longest (125ms) before the release. */
const TIMES = [0, 0.111, 0.212, 0.322, 0.409, 0.519, 0.639, 1];
/**
 * Quart-out on every notch: half the travel in the first frame, then four more
 * frames of visible deceleration. It still cracks, but it MOVES — an expo-out
 * this short (or a snappier ease) lands at 71% on frame one, which renders as a
 * hard cut, and three hard cuts in a row read as a glitch rather than a ratchet.
 * Linear across the holds (nothing changes).
 *
 * The release is easeInOut, not a quint-out: a snappy ease would spend most of
 * the 375ms already home, so the roundness would resolve in the first fifth of
 * the sweep and the rest would look static. easeInOut spreads the change across
 * the whole way back, which is what makes the corners read as opening up
 * gradually rather than all at once.
 */
const CLICK: Easing = [0.25, 1, 0.5, 1];
const EASES: Easing[] = [
  CLICK,
  "linear",
  CLICK,
  "linear",
  CLICK,
  "linear",
  "easeInOut",
];

const SEQUENCE: AnimationSequence = [
  [
    ".scan-frame",
    { d: STATES },
    { duration: DURATION, times: TIMES, ease: EASES },
  ],
];

export const ScanIcon = forwardRef<
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
      <motion.path className="scan-frame" d={REST_D} />
    </svg>
  );
});

ScanIcon.displayName = "ScanIcon";
