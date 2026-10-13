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
 * ANIMATION STORYBOARD — the star is picked: it pops, twists,
 * and throws off a twinkle (hover)
 *
 *      0ms  star at rest, scale 1, level; no twinkle
 *  0-150ms  POP — a fast swell to 1.24 on an easeOut while the
 *           star twists +9° clockwise. A "favourite" wants a
 *           crisp snap, not a soft pulse — this is the beat the
 *           whole gesture is built around.
 *   150ms   at the top of the pop a TWINKLE blinks in off the
 *           star's upper-right arm: a tiny 4-point sparkle that
 *           scales 0.3→1.1 and flashes to full, then dissolves
 *           by ~430ms. It is an ephemeral actor (§5.4) — hidden
 *           at rest, it appears, glints, and is gone.
 *  150-380ms the star OVERSHOOTS home: undershoots to 0.95 and
 *           counter-twists to -3°, the elastic settle of
 *           something that was flicked.
 *  380-560ms eases the last of the wobble out, landing at scale
 *           1 and 0° — pixel-identical to rest (§0.2), so it
 *           loops and scrubs clean.
 *
 * TWO CLOCKS. The star's pop/twist and the twinkle's flash are
 * independent segments with their own timing (LightningIcon /
 * BellIcon pattern): the twinkle is fired at the pop's peak and
 * lives its own short life, rather than being forced onto the
 * settle's ease.
 *
 * Class A per ICON-SYSTEM §2 — transform only. The star scales
 * and rotates about its own centre (12, 12); the twinkle scales
 * about its own point. No path ever morphs, so the sharp arms
 * and the sparkle's needled flanks stay crisp at every frame.
 *
 * WHY NOT SPIN A FULL 90°. A 5-point star has no 90° symmetry,
 * so any full turn would have to land back at 0 the long way and
 * read as a spin, not a pop. The ±9°/−3° twist is a flick — it
 * gives the pop life without pretending the star rotates.
 * ───────────────────────────────────────────────────────── */

const n = (v: number) => Number(v.toFixed(3));

/** Lucide's rounded 5-point star, used as-is. Ink centre ≈ (12, 12).
 *  The `a` corner-rounds are fine here: this is Class A (transform only),
 *  §2's no-arc rule applies only to morph states. */
const STAR_D =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16" +
  "l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878" +
  "l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0" +
  "L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879" +
  "L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

/** The star's own centre — it pops and twists about this point. */
const STAR_PIVOT = "12px 12px";

/**
 * A small 4-point sparkle centred at (cx, cy) with arm reach `r`: four sharp
 * tips (N/E/S/W) with concave flanks whose control points pull in toward the
 * centre (fraction `k`), so the sides cave and the arms read as needles. One
 * closed path, filled — a glint, not an outline.
 */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.16;
  return (
    `M${cx} ${n(cy - r)}` +
    `C${n(cx + k)} ${n(cy - k)} ${n(cx + k)} ${n(cy - k)} ${n(cx + r)} ${cy}` +
    `C${n(cx + k)} ${n(cy + k)} ${n(cx + k)} ${n(cy + k)} ${cx} ${n(cy + r)}` +
    `C${n(cx - k)} ${n(cy + k)} ${n(cx - k)} ${n(cy + k)} ${n(cx - r)} ${cy}` +
    `C${n(cx - k)} ${n(cy - k)} ${n(cx - k)} ${n(cy - k)} ${cx} ${n(cy - r)}Z`
  );
}

/** Where the twinkle sits — just off the star's upper-right arm, in clear
 *  space — and how big it flashes. */
const TWINKLE_X = 19.5;
const TWINKLE_Y = 5;
const TWINKLE_R = 2.1;
const TWINKLE_PIVOT = `${TWINKLE_X}px ${TWINKLE_Y}px`;

const DURATION = 0.56;

/** Pop then elastic settle. Both arrays share these times/ease — the twist
 *  rides the same clock as the swell because they are one gesture. */
const POP_SCALE = [1, 1.24, 0.95, 1.03, 1];
const POP_ROTATE = [0, 9, -3, 1, 0];
const POP_TIMES = [0, 0.27, 0.6, 0.82, 1];
const POP_EASE: Easing[] = ["easeOut", "easeInOut", "easeInOut", "easeOut"];

/** The twinkle's own short life, fired at the pop's peak. */
const TWINKLE_AT = 0.14;
const TWINKLE_DUR = 0.3;
const TWINKLE_OPACITY = [0, 1, 0];
const TWINKLE_SCALE = [0.3, 1.1, 0.4];

const SEQUENCE: AnimationSequence = [
  [
    ".star-pop",
    { scale: POP_SCALE, rotate: POP_ROTATE },
    { duration: DURATION, times: POP_TIMES, ease: POP_EASE },
  ],
  [
    ".star-twinkle",
    { opacity: TWINKLE_OPACITY, scale: TWINKLE_SCALE },
    { at: TWINKLE_AT, duration: TWINKLE_DUR, ease: "easeOut" },
  ],
];

export const StarIcon = forwardRef<
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
      // The pop and the off-glyph twinkle both spill past the 24 box.
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* transformOrigin in `initial` (Motion overrides a style origin with
          its 50%/50% SVG default), transformBox in `style` to make those
          pixels view-box units. Rest scale/rotate are in `initial` too, so
          the scrubber's pre-paint pause holds a still star until the first
          seek. */}
      <motion.path
        className="star-pop"
        d={STAR_D}
        initial={{ scale: 1, rotate: 0, transformOrigin: STAR_PIVOT }}
        style={{ transformBox: "view-box" }}
      />
      {/* Ephemeral twinkle: filled glint, hidden at rest (opacity 0 / scale 0
          in `initial`), so the static glyph is just the star. */}
      <motion.path
        className="star-twinkle"
        d={sparkle(TWINKLE_X, TWINKLE_Y, TWINKLE_R)}
        fill="currentColor"
        stroke="none"
        initial={{ opacity: 0, scale: 0, transformOrigin: TWINKLE_PIVOT }}
        style={{ transformBox: "view-box" }}
      />
    </svg>
  );
});

StarIcon.displayName = "StarIcon";
