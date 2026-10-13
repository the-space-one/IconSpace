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
 * ANIMATION STORYBOARD — play ⇄ pause, spring spin (hover)
 *
 *    0ms  triangle at rest inside the ring
 *   OUT   the shape morphs play → pause while the whole plate
 *         takes a HALF-TURN spin (0 → 180°). Spring-driven, so
 *         the spin overshoots ~180° and settles back — the
 *         premium "snap into place". Ring gives a soft pop.
 *  hold   pause held for a beat
 *   BACK  morph pause → play as the plate COMPLETES the turn
 *         (180 → 360°), same spring character. Ends at 360°,
 *         which is visually 0° — rest and end are identical.
 *
 * WHY A HALF TURN LANDS CLEAN. Both the play triangle and the
 * pause bars are point-symmetric about (10.25, 9.75) — the
 * plate's centre. So a 180° rotation maps PAUSE exactly onto
 * itself, and 360° maps PLAY exactly onto itself. The spin is
 * concentric with the ring and never leaves the icon crooked
 * at either resting pose. (The transient at 90°/270° happens
 * mid-morph, so it's never a pose you dwell on.)
 *
 * TWO CHOREOGRAPHIES, ON PURPOSE.
 *   playAnimation()  → real springs (this is the premium feel
 *                      the hover is meant to have)
 *   createScrubber() → a KEYFRAMED twin, because makeScrubber
 *                      seeks by time and a spring's duration is
 *                      indeterminate. The scrub version mimics
 *                      the same beats with tweens so /scrub
 *                      still works. Keep the two in sync by
 *                      hand — they are meant to look alike, not
 *                      be byte-identical.
 *
 * Every path state is M-L-L-L-Z with 8 numbers — that
 * structural match is what lets Motion tween `d`. The right
 * half's apex is a DOUBLED point (13.1 9.75 twice); that
 * degenerate corner splits into the bar's two right corners.
 * ───────────────────────────────────────────────────────── */

const RING = { cx: 9.75, cy: 9.75, r: 9 };

/** Shared centre of both glyphs — the spin pivots here so 180° maps each
    resting pose onto itself. */
const PIVOT = "10.25px 9.75px";

/* Triangle spans x 7.4→13.1, y 7→12.5, split at x≈10.3. The halves overlap
   by 0.1 so antialiasing can't open a hairline seam at rest. */
const PLAY_L = "M7.4 7L10.35 8.42L10.35 11.08L7.4 12.5Z";
const PLAY_R = "M10.25 8.375L13.1 9.75L13.1 9.75L10.25 11.125Z";

/* Bars: 1.95 wide, 1.8 gap, same y-span as the triangle so the silhouette
   keeps its height across the morph. Point-symmetric about (10.25, 9.75). */
const PAUSE_L = "M7.4 7L9.35 7L9.35 12.5L7.4 12.5Z";
const PAUSE_R = "M11.15 7L13.1 7L13.1 12.5L11.15 12.5Z";

/* ── Springs (playAnimation) — Apple-style duration + bounce ──────────────
   The visible overshoot lives on the SPIN. The `d` morph keeps a low bounce
   so path coordinates don't overshoot into a distorted shape mid-tween. */
const SPIN = { type: "spring", visualDuration: 0.5, bounce: 0.34 } as const;
const MORPH = { type: "spring", visualDuration: 0.42, bounce: 0.12 } as const;
/** Gap between reaching pause and starting the fold back. */
const HOLD = 0.13;

/* ── Scrub twin (createScrubber) — keyframes only ────────────────────────── */
const SCRUB_TOTAL = 1.05;
/** rest → pause reached → hold end → rest. Shared by every scrub track so the
    morph, the spin and the pop stay locked together. */
const SCRUB_TIMES = [0, 0.34, 0.52, 1];
const IN_OUT: Bezier = [0.645, 0.045, 0.355, 1];
type Bezier = [number, number, number, number];

const SEQUENCE_SCRUB: AnimationSequence = [
  [
    ".play-half-l",
    { d: [PLAY_L, PAUSE_L, PAUSE_L, PLAY_L] },
    { at: 0, duration: SCRUB_TOTAL, times: SCRUB_TIMES, ease: IN_OUT as Easing },
  ],
  [
    ".play-half-r",
    { d: [PLAY_R, PAUSE_R, PAUSE_R, PLAY_R] },
    { at: 0, duration: SCRUB_TOTAL, times: SCRUB_TIMES, ease: IN_OUT as Easing },
  ],
  // The spin, keyframed: half turn out, hold, complete the turn back.
  [
    ".play-plate",
    { rotate: [0, 180, 180, 360] },
    { at: 0, duration: SCRUB_TOTAL, times: SCRUB_TIMES, ease: IN_OUT as Easing },
  ],
  // Ring pop on the outbound beat only.
  [
    ".play-ring",
    { scale: [1, 1.06, 1, 1] },
    { at: 0, duration: SCRUB_TOTAL, times: SCRUB_TIMES, ease: "easeOut" },
  ],
];

export const PlayIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();
    const shouldReduceMotion = useReducedMotion();

    useImperativeHandle(ref, () => ({
      async playAnimation() {
        // Rest pose already renders from JSX; nothing to restore.
        if (shouldReduceMotion) return;

        // OUT — morph to pause while the plate takes a spring half-turn.
        animate(".play-half-l", { d: PAUSE_L }, MORPH);
        animate(".play-half-r", { d: PAUSE_R }, MORPH);
        // Ring pop is a tween (keyframes + spring don't mix), fired alongside.
        animate(
          ".play-ring",
          { scale: [1, 1.06, 1] },
          { duration: 0.45, times: [0, 0.4, 1], ease: "easeOut" }
        );
        await animate(".play-plate", { rotate: 180 }, SPIN);

        // BACK — after a hold, morph home while the plate completes the turn.
        animate(".play-half-l", { d: PLAY_L }, { ...MORPH, delay: HOLD });
        animate(".play-half-r", { d: PLAY_R }, { ...MORPH, delay: HOLD });
        await animate(".play-plate", { rotate: 360 }, { ...SPIN, delay: HOLD });

        // 360° ≡ 0°: reset invisibly so the next hover starts from a clean 0.
        animate(".play-plate", { rotate: 0 }, { duration: 0 });
      },
      createScrubber() {
        return makeScrubber(() => animate(SEQUENCE_SCRUB));
      },
    }));

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        <motion.circle
          className="play-ring"
          cx={RING.cx}
          cy={RING.cy}
          r={RING.r}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        {/* The plate spins about the glyph centre (view-box coords, NOT the
            element's own box) so the rotation is concentric with the ring and
            180° lands each pose on itself. Rest values live in JSX: makeScrubber
            pauses before first paint, and an unresolved d/rotate flushes into
            the DOM as undefined. */}
        <motion.g
          className="play-plate"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={1}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ rotate: 0 }}
          style={{ transformBox: "view-box", transformOrigin: PIVOT }}
        >
          <motion.path className="play-half-l" d={PLAY_L} />
          <motion.path className="play-half-r" d={PLAY_R} />
        </motion.g>
      </svg>
    );
  }
);

PlayIcon.displayName = "PlayIcon";
