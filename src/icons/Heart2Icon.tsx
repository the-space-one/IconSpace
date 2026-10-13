import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationSequence,
  type MotionValue,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — a real heartbeat: LUB-DUB, pause
 *
 * The set's other heart spins in 3D. This one just beats,
 * and the whole point is the RHYTHM — a heart is not a
 * pulse, it is two unequal thumps close together followed
 * by a long wait. Get that spacing wrong and it reads as a
 * throbbing blob; get it right and it reads as alive.
 *
 * ONE CYCLE (600ms ≈ 100bpm):
 *    0ms  ANTICIPATION. The heart dips 2.5% below rest.
 *         Physiologically this is diastole — the chamber
 *         filling before it fires — and in animation terms
 *         it is the wind-up that makes the thump land.
 *   60ms  LUB (S1). The big one: the mitral and tricuspid
 *         valves slamming shut. Snaps to +18% in 50ms, a
 *         hard ease-out, because muscle contracts far
 *         faster than it relaxes.
 *  110ms  peak of the lub
 *  227ms  the recoil — the release rings through ONE
 *         undershoot to 2% under rest rather than easing
 *         flatly home. That overshoot past the resting
 *         line is the "vibration": a body that stops dead
 *         reads as a slider, one that overshoots reads as
 *         tissue.
 *  240ms  DUB (S2). Aortic and pulmonic valves, and it is
 *         the QUIET one — 47% of the lub's amplitude and a
 *         faster 35ms attack, so it lands as a lighter,
 *         sharper tap. Equal beats read as a machine.
 *  405ms  settled
 *  405ms  DIASTOLE — dead still to 600ms. This pause is
 *  →600ms doing more work than either thump: it is the
 *         gap that separates the pairs, and without it the
 *         four beats of a two-cycle play would smear into
 *         an even rhythm.
 *
 * TWO CYCLES PER PLAY. One thump-pair is an event; two is
 * a heartbeat. The eye needs the pause to repeat before it
 * hears a rhythm rather than a blip.
 *
 * NOT A UNIFORM SCALE. Every beat is 6% wider than it is
 * tall (WIDEN / TALLEN), so the heart bulges as it squeezes
 * the way a muscle does instead of zooming like a photo.
 * It is a 2% difference — invisible as an effect, but it is
 * the difference between "beating" and "scaling".
 *
 * THE ENVELOPE IS A FUNCTION, NOT KEYFRAMES. A beat is a
 * shape (snap, ring, silence) repeated on a period, so it
 * is written as one — which means the rhythm is stated
 * once, both thumps share a definition, and CYCLES can
 * change without re-timing anything. Everything poses off
 * a single `progress` value, HeartIcon's rule, so hover
 * play and the Scrub Lab cannot drift apart and rest is
 * exactly 1.
 *
 * progress therefore runs LINEAR — the envelope carries
 * all of the timing itself, and easing the driver would
 * warp the rhythm it encodes.
 *
 * THE GLYPH IS COPIED, NOT IMPORTED, from HeartIcon: every
 * file in src/icons ships as a standalone copy-paste
 * bundle (src/lib/icon-export.ts) and only types/scrub/
 * easing travel with it, so an import from "./HeartIcon"
 * would be dropped and the paste would not compile. Keep
 * the two in step if the shape is ever redrawn.
 * ───────────────────────────────────────────────────────── */

const STROKE = 1.5;

/**
 * The heart outline, symmetric about its vertical centre line (x = 8.8616).
 * Byte-identical to HeartIcon's HEART_D — see the note above on the duplication.
 */
const HEART_D =
  "M0.8616 6.2217C1.6536 9.7854 6.4306 15.449 8.7903 17.9879" +
  "C8.8298 18.0304 8.8934 18.0304 8.9329 17.9879" +
  "C11.2926 15.449 16.0696 9.7854 16.8616 6.2217" +
  "C17.8515 1.767 11.9818 -1.8617 8.9532 3.4009" +
  "C8.9137 3.4695 8.8095 3.4695 8.77 3.4009" +
  "C5.7414 -1.8617 -0.1283 1.767 0.8616 6.2217Z";

/* ── The rhythm ───────────────────────────────────────────────────────────── */

/** One cardiac cycle, ms. 600 ≈ 100bpm — quicker than resting, which reads as
 *  alive rather than sluggish at icon size. */
const CYCLE = 600;
/** Cycles per play. Two is the minimum that establishes a rhythm. */
const CYCLES = 2;
const DURATION_MS = CYCLE * CYCLES;
/** Seconds, for Motion. */
const DURATION = DURATION_MS / 1000;

/** A thump: when it fires, how fast it snaps up, how long it rings down, and
 *  how far it throws the heart. Times are ms from the top of the cycle. */
type Thump = { at: number; attack: number; release: number; amp: number };

/** S1 — valves closing at the start of systole. The big, slightly slower one. */
const LUB: Thump = { at: 60, attack: 50, release: 175, amp: 0.18 };
/** S2 — end of systole. Lighter and sharper, and that inequality is most of
 *  what makes the pair read as a HEART rather than a metronome. */
const DUB: Thump = { at: 240, attack: 35, release: 130, amp: 0.085 };

/** The wind-up before the lub: how long it lasts and how far below rest it
 *  pulls. Ends exactly as the lub fires. */
const ANTICIPATION = { duration: LUB.at, amp: 0.025 };

/** The beat is wider than it is tall — a squeeze, not a zoom. */
const WIDEN = 1.06;
const TALLEN = 0.94;

/** Centre of the glyph's box in viewBox units: the axis of symmetry, and the
 *  profile spans y 0.047 → 18.77. Beating from here keeps it from drifting. */
const BEAT_ORIGIN = "8.8616px 9.41px";

/** Snaps off the mark and decelerates hard — muscle contracting. */
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

/**
 * One thump, normalised to a peak of 1.
 *
 * Attack is a hard ease-out; release is a damped cosine, which is what puts a
 * single undershoot in the tail — the beat crosses back under rest before it
 * settles, instead of easing flatly home. Both ends are exactly 0, so beats
 * can be summed and the envelope stays continuous no matter how they overlap.
 */
function thump(u: number, { attack, release }: Thump): number {
  if (u <= 0 || u >= attack + release) return 0;
  if (u < attack) return easeOutCubic(u / attack);
  const p = (u - attack) / release;
  // At p = 1 the cosine is 0, so this lands on 0 and meets the guard above.
  return Math.exp(-3.2 * p) * Math.cos(1.5 * Math.PI * p);
}

/**
 * Displacement from rest at `ms` into the animation: the wind-up plus both
 * thumps of whichever cycle we are in. 0 means the heart is at its resting
 * size, so scale is 1 + this.
 */
function beatAt(ms: number): number {
  // Modulo, so every cycle is the same beat and CYCLES is just a count. At the
  // final instant this wraps to 0, which is rest — the animation lands closed.
  const t = ms % CYCLE;

  // Half a sine dipping below the line: 0 at both ends, deepest in the middle.
  const anticipation =
    t < ANTICIPATION.duration
      ? -ANTICIPATION.amp * Math.sin((Math.PI * t) / ANTICIPATION.duration)
      : 0;

  return (
    anticipation +
    LUB.amp * thump(t - LUB.at, LUB) +
    DUB.amp * thump(t - DUB.at, DUB)
  );
}

/** Linear on purpose — see the storyboard. */
function buildSequence(progress: MotionValue<number>): AnimationSequence {
  return [[progress, [0, 1], { duration: DURATION, ease: "linear" }]];
}

export const Heart2Icon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  const progress = useMotionValue(0);

  const beat = useTransform(progress, (p) => beatAt(p * DURATION_MS));
  const scaleX = useTransform(beat, (b) => 1 + b * WIDEN);
  const scaleY = useTransform(beat, (b) => 1 + b * TALLEN);

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      progress.jump(0);
      await animate(buildSequence(progress));
    },
    createScrubber() {
      progress.jump(0);
      return makeScrubber(
        () => animate(buildSequence(progress)),
        // Sequence cancel restores DOM attributes, but the motion value keeps
        // its last scrubbed position; reset so the heart recomputes to rest.
        () => progress.jump(0),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="19"
      viewBox="0 0 18 19"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      // The beat throws the glyph ~19% past its box at the top of each lub.
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* transformOrigin lives in `initial` because Motion overrides a
          style-set origin on SVG with its own centred default, and view-box
          units keep it on the glyph's centre — same wiring as HomeDoorIcon's
          pop. */}
      <motion.g
        initial={{ transformOrigin: BEAT_ORIGIN }}
        style={{ scaleX, scaleY, transformBox: "view-box" }}
      >
        <path d={HEART_D} />
      </motion.g>
    </svg>
  );
});

Heart2Icon.displayName = "Heart2Icon";
