"use client";

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
 * ANIMATION STORYBOARD — house squashes as the door opens
 *                        (one-shot, hover)
 *
 *    0ms  house at REST (SVG1): crisp, straight-walled house +
 *         doorway, with a THIN 1px line tracing the door's left
 *         wall and top — sitting on the frame edge, so it just
 *         reads as a plain door.
 *  delay  after the pointer lands, a short beat (HOVER_DELAY)
 *         before anything moves.
 *   OUT   the WHOLE GLYPH morphs to SVG2: the house SQUASHES —
 *         walls splay wider at the base, bottom corners round —
 *         while the thin line swings off the frame edge into a
 *         diagonal (the swung-open door). The whole thing also
 *         springs UP in scale (~1.14). All springs, in parallel,
 *         so it reads as the house flexing as the door opens.
 *  hold   open + squashed, held for a beat
 *  BACK   everything springs back to SVG1 — landing
 *         pixel-identical to rest so replays and scrubbing are
 *         clean.
 *
 * WHY TWO FULL POSES. SVG1 and SVG2 are two drawn frames of the
 * same icon. Rather than keep the house static and fake a
 * reaction, the whole outline tweens between them — that's what
 * carries the squash. Both house paths were reduced to pure
 * M/C/L with the SAME command sequence (SVG1's wall `V`s and the
 * `H`s rewritten as explicit `L`s to match SVG2), so Motion can
 * interpolate `d` point-for-point.
 *
 * SVG2 is affine-mapped into SVG1's frame (uniform 0.9 scale,
 * floor-anchored, centre-aligned) so the two poses overlay: same
 * footing, same rough size, only the SHAPE differs. That keeps
 * the morph a squash-in-place, not a house that jumps or grows.
 *
 * WEIGHTS. House + frame are 1.5px (the svg default); the inner
 * door line is 1px (its own strokeWidth), matching the reference.
 *
 * SIZE. Glyph authored ~17×19; the viewBox is a 20-unit window
 * centred on it (min -1.5 -0.5) so it fills its tile at the same
 * visual size as the rest of the set (their glyphs fill a ~20u box).
 *
 * TWO CHOREOGRAPHIES (same split as PlayIcon):
 *   playAnimation()  → real springs — the hover feel
 *   createScrubber() → a keyframed twin, because makeScrubber
 *                      seeks by time and a spring's duration is
 *                      indeterminate. Kept in sync by hand.
 *
 * NO vectorEffect: non-scaling-stroke resolves width against the
 * viewport, not the viewBox, so the stroke would go hairline
 * wherever the icon draws large. Stroke stays proportional.
 * ───────────────────────────────────────────────────────── */

/* Two full glyph poses. House (1.5px) and inner door line (1px) each have a
   rest/open pair with matching M/C/L command sequences, so Motion tweens `d`. */

/** House REST — SVG1's outline + doorway + threshold, walls/H rewritten as L. */
const HOUSE_REST =
  "M5.25 18.292L2.25 18.292C1.42157 18.292 0.75 17.6204 0.75 16.792L0.75 7.50598C0.75 7.05429 0.953546 6.62664 1.30411 6.34181L7.773 1.08583C8.33803 0.626748 9.15113 0.639667 9.70129 1.11647L15.7324 6.34343C16.0611 6.62834 16.25 7.04194 16.25 7.47697L16.25 16.792C16.25 17.6204 15.5784 18.292 14.75 18.292L11.75 18.292M5.25 18.292L5.25 13.292C5.25 12.4636 5.92157 11.792 6.75 11.792L10.25 11.792C11.0784 11.792 11.75 12.4636 11.75 13.292L11.75 18.292M5.25 18.292L11.75 18.292";

/** House OPEN — SVG2's squashed outline (wider base, rounded corners), mapped
    into this frame. Same command sequence as HOUSE_REST. */
const HOUSE_OPEN =
  "M5.339 18.292L1.399 18.292C0.612 18.292 -0.008 17.621 0.053 16.836L0.794 7.399C0.823 7.03 1.002 6.689 1.29 6.456L7.961 1.049C8.469 0.637 9.199 0.648 9.694 1.076L15.909 6.449C16.184 6.687 16.352 7.025 16.374 7.388L16.952 16.86C16.999 17.636 16.382 18.292 15.604 18.292L11.839 18.292M5.339 18.292L5.339 13.158C5.339 12.413 5.943 11.808 6.689 11.808L10.489 11.808C11.235 11.808 11.839 12.413 11.839 13.158L11.839 18.292M5.339 18.292L11.839 18.292";

/** Line REST — traces the door's left wall + top (SVG1), on the frame edge. */
const LINE_REST =
  "M5.25 18.292L5.25 13.292C5.25 12.4636 5.92157 11.792 6.75 11.792L10.75 11.792";

/** Line OPEN — the swung-open door edge, a diagonal to the far top corner (SVG2). */
const LINE_OPEN =
  "M7.139 18.337L7.139 14.98C7.139 14.454 7.445 13.976 7.923 13.755L11.639 12.037";

/* ── Springs (playAnimation) — fast, with a touch of bounce so the squash
   settles rather than snapping dead. */
const SWING = { type: "spring", visualDuration: 0.2, bounce: 0.2 } as const;
/** The whole glyph springs UP in scale while open, and back as it closes.
    Uniform scale, so a big bounce reads as a cool pop without distortion. */
const POP = { type: "spring", visualDuration: 0.26, bounce: 0.46 } as const;
/** How far it swells at the open pose. */
const PEAK = 1.14;
/** Beat between the hover landing and the reaction. */
const HOVER_DELAY = 0.1;
/** Gap between reaching the open pose and springing back. Short — keeps it snappy. */
const HOLD = 0.07;

/* ── Scrub twin (createScrubber) — keyframes only ─────────────────────────── */
const SCRUB_TOTAL = 0.58;
/** rest → open reached → hold end → rest. Shared by every scrub track so the
    house, the line and the pop stay locked together. */
const SCRUB_TIMES = [0, 0.42, 0.58, 1];
type Bezier = [number, number, number, number];
const IN_OUT: Bezier = [0.645, 0.045, 0.355, 1];

const SEQUENCE_SCRUB: AnimationSequence = [
  [
    ".home-house",
    { d: [HOUSE_REST, HOUSE_OPEN, HOUSE_OPEN, HOUSE_REST] },
    { at: 0, duration: SCRUB_TOTAL, times: SCRUB_TIMES, ease: IN_OUT as Easing },
  ],
  [
    ".home-door",
    { d: [LINE_REST, LINE_OPEN, LINE_OPEN, LINE_REST] },
    { at: 0, duration: SCRUB_TOTAL, times: SCRUB_TIMES, ease: IN_OUT as Easing },
  ],
  [
    ".home-door-pop",
    { scale: [1, PEAK, PEAK, 1] },
    { at: 0, duration: SCRUB_TOTAL, times: SCRUB_TIMES, ease: "easeOut" },
  ],
];

export const HomeDoorIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();
    const shouldReduceMotion = useReducedMotion();

    useImperativeHandle(ref, () => ({
      async playAnimation() {
        // Rest pose (SVG1) already renders from JSX; nothing to restore.
        if (shouldReduceMotion) return;

        // OUT — after a beat post-hover, morph the house + line to SVG2 AND
        // spring the whole glyph up, all springs in parallel. The delay lives on
        // each so they stay in lockstep.
        animate(
          ".home-door-pop",
          { scale: PEAK },
          { ...POP, delay: HOVER_DELAY },
        );
        animate(
          ".home-house",
          { d: HOUSE_OPEN },
          { ...SWING, delay: HOVER_DELAY },
        );
        await animate(
          ".home-door",
          { d: LINE_OPEN },
          { ...SWING, delay: HOVER_DELAY },
        );

        // BACK — after a beat, everything springs back to the SVG1 rest pose.
        animate(".home-door-pop", { scale: 1 }, { ...POP, delay: HOLD });
        animate(".home-house", { d: HOUSE_REST }, { ...SWING, delay: HOLD });
        await animate(".home-door", { d: LINE_REST }, { ...SWING, delay: HOLD });
      },
      createScrubber() {
        return makeScrubber(() => animate(SEQUENCE_SCRUB));
      },
    }));

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="-1.5 -0.5 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        {/* The whole glyph springs up in scale while open. transformOrigin lives
            in `initial` (Motion overrides a style-set origin on SVG with its
            centered default), and view-box units make it viewBox-relative — the
            swell grows from the glyph centre. */}
        <motion.g
          className="home-door-pop"
          initial={{ scale: 1, transformOrigin: "8.5px 9.5px" }}
          style={{ transformBox: "view-box" }}
        >
          {/* House + doorway + threshold (1.5px) — morphs SVG1 ⇄ SVG2. Rest
              value in JSX because makeScrubber pauses before first paint, and an
              unresolved `d` flushes into the DOM as undefined. */}
          <motion.path className="home-house" d={HOUSE_REST} />
          {/* The thin inner door line (1px) — morphs the frame-edge trace ⇄ the
              swung-open diagonal. */}
          <motion.path className="home-door" strokeWidth={1} d={LINE_REST} />
        </motion.g>
      </svg>
    );
  },
);

HomeDoorIcon.displayName = "HomeDoorIcon";
