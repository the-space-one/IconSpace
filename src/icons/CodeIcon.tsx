import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  useReducedMotion,
  type AnimationSequence,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────
 * ANIMATION STORYBOARD — the brackets open
 *
 * One sentence: the angle brackets pull apart to make room
 * for the code, hold, and close back in.
 *
 * CLASS A (§2) — both chevrons keep their silhouette, so
 * this is two rigid x-translations. The slash between them
 * never moves: it is the anchor the brackets open away
 * from, and animating it too would just read as the whole
 * icon breathing.
 *
 *     0ms  rest — brackets closed around the slash
 *   190ms  right bracket out (+2.5), left out (-2.5)
 *   385ms  held open (the beat that says "space")
 *   620ms  closed again, pixel-identical (§0.2)
 *
 * THE LEFT BRACKET LEAVES 40ms AFTER THE RIGHT. Moving both
 * on the same frame is symmetric and reads mechanical
 * (§0.3); the stagger is far too small to see as a delay
 * but it is what stops the pair looking like one stretching
 * object. It repays itself on the way back in, where the
 * offset makes the close land as two soft taps.
 * ───────────────────────────────────────────── */

/** Lucide `code-xml`, unchanged. */
const SLASH_D = "m14.5 4-5 16";
const RIGHT_D = "m18 16 4-4-4-4";
const LEFT_D = "m6 8-4 4 4 4";

/** How far each bracket travels. 2.5 units on a 24 grid, inside §0.4. */
const OPEN = 2.5;

/** The stagger, in seconds — see the storyboard. */
const LAG = 0.04;

const DURATION = 0.62;

/**
 * Self-restoring keyframes (§5.1) with a hold in the middle. `times` gives the
 * open and the close roughly equal travel and spends the difference on the
 * hold, which is the only beat carrying meaning.
 */
const travel = (to: number) => ({ x: [0, to, to, 0] });
const TIMES = [0, 0.3, 0.62, 1];
const EASE = "easeInOut" as const;

const SEQUENCE: AnimationSequence = [
  [".code-right", travel(OPEN), { duration: DURATION, times: TIMES, ease: EASE }],
  // `at` is absolute here, not "<", so the lag is explicit rather than an
  // artefact of where the previous segment happened to end.
  [
    ".code-left",
    travel(-OPEN),
    { at: LAG, duration: DURATION, times: TIMES, ease: EASE },
  ],
];

export const CodeIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
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
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        // The brackets sit at the edges and travel outward past them.
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        <path d={SLASH_D} />
        <motion.path className="code-right" d={RIGHT_D} />
        <motion.path className="code-left" d={LEFT_D} />
      </svg>
    );
  },
);

CodeIcon.displayName = "CodeIcon";
