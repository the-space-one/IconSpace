import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  type AnimationSequence,
  type Easing,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — frame, then snap (one-shot)
 *
 *    0ms  viewfinder at rest, corners in tight   (frame 1)
 *  290ms  FRAME THE SHOT — the whole frame grows
 *         to 1.18× while the corners breathe OUT
 *         to widest (frame 2) and the dot recedes
 *         (scale 0.72): a lens hunting for focus
 *  380ms  hold at the peak — focus locked
 *  470ms  SNAP — the shutter clicks: corners clap
 *         in tight (frame 3), the frame recoils to
 *         1.04×, the dot pops to 1.35, and a soft
 *         exposure flash blips over the interior
 *  900ms  flash decays, everything settles at rest —
 *         final pose is frame 1 again, so replays
 *         and scrubbing land pixel-identical.
 *
 * Four parts on ONE clock (same duration/times/easing, per
 * the paired-elements rule): the frame group scales, the
 * brackets d-morph through the validated frame states, the
 * dot counter-animates via transform scale, and the flash
 * is an opacity blip timed to the snap beat.
 *
 * Bracket d strings generated from 3 frames by
 * scripts/parse-frames.mjs and validated (identical command
 * structure) — do not hand-edit them; re-export frames and
 * re-run the parser.
 * ───────────────────────────────────────────────────────── */

/** Center dot — identical in every frame; counter-animates via scale. */
const DOT_D =
  "M11.75 14.75C13.407 14.75 14.75 13.407 14.75 11.75 14.75 10.093 13.407 8.75 11.75 8.75 10.093 8.75 8.75 10.093 8.75 11.75 8.75 13.407 10.093 14.75 11.75 14.75";

/** The four corner brackets: rest / out / in (parser-validated morph). */
const BRACKET_STATES = [
  "M2.75 9.25L2.75 4.75C2.75 3.645 3.645 2.75 4.75 2.75L9.25 2.75M14.25 2.75L18.75 2.75C19.855 2.75 20.75 3.645 20.75 4.75L20.75 9.25M20.75 14.25L20.75 18.75C20.75 19.855 19.855 20.75 18.75 20.75L14.25 20.75M9.25 20.75L4.75 20.75C3.645 20.75 2.75 19.855 2.75 18.75L2.75 14.25",
  "M0.75 8.75L0.75 3.212C0.751 1.853 1.853 0.751 3.212 0.75L8.75 0.75M14.75 0.75L20.288 0.75C21.647 0.751 22.749 1.853 22.75 3.212L22.75 8.75M22.75 14.75L22.75 20.288C22.749 21.647 21.647 22.749 20.288 22.75L14.75 22.75M8.75 22.75L3.212 22.75C1.853 22.749 0.751 21.647 0.75 20.288L0.75 14.75",
  "M2.75 9.75L2.75 4.904C2.75 3.714 3.714 2.75 4.904 2.75L9.75 2.75M13.75 2.75L18.596 2.75C19.786 2.75 20.75 3.714 20.75 4.904L20.75 9.75M20.75 13.75L20.75 18.596C20.75 19.786 19.786 20.75 18.596 20.75L13.75 20.75M9.75 20.75L4.904 20.75C3.714 20.75 2.75 19.786 2.75 18.596L2.75 13.75",
];

// One shared clock for all parts: rest -> peak -> (hold) -> snap -> rest.
const DURATION = 0.9;
const TIMES = [0, 0.32, 0.42, 0.52, 1];
// Per-segment easing on that clock: easeInOut for the twist out, linear
// across the hold (values don't change), expo-out for the 90ms snap so it
// cracks, easeInOut for the long settle back to rest.
const EASES: Easing[] = ["easeInOut", "linear", [0.19, 1, 0.22, 1], "easeInOut"];

const SEQUENCE: AnimationSequence = [
  // The whole viewfinder grows during the focus hunt, holds, recoils at the
  // snap, then relaxes to 1.
  [
    ".focus-frame",
    { scale: [1, 1.18, 1.18, 1.04, 1] },
    { duration: DURATION, times: TIMES, ease: EASES },
  ],
  // Brackets morph rest -> out -> (hold) -> tight -> rest. The duplicated
  // peak state (0.32 -> 0.42) is the hold beat — focus locking on — and the
  // fast out -> tight step is the shutter clap. Ending on frame 1 keeps the
  // final pose pixel-identical to rest.
  [
    ".focus-brackets",
    {
      d: [
        BRACKET_STATES[0],
        BRACKET_STATES[1],
        BRACKET_STATES[1],
        BRACKET_STATES[2],
        BRACKET_STATES[0],
      ],
    },
    { at: 0, duration: DURATION, times: TIMES, ease: EASES },
  ],
  // The dot runs the OPPOSITE phase on the same clock: it recedes while the
  // brackets are widest (holding small through the peak), pops past rest at
  // the snap — the capture — and lands back at 1.
  [
    ".focus-dot",
    { scale: [1, 0.72, 0.72, 1.35, 1] },
    { at: 0, duration: DURATION, times: TIMES, ease: EASES },
  ],
  // Exposure flash: invisible until the snap beat, blips to 0.3 with the
  // shutter clap, decays over the settle.
  [
    ".focus-flash",
    { opacity: [0, 0, 0, 0.3, 0] },
    { at: 0, duration: DURATION, times: TIMES, ease: EASES },
  ],
];

export const FocusIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
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
        ref={scope}
        {...props}
      >
        {/* view-box keeps the pivot at the viewBox center (12,12) even while
            the bracket d-morph changes the group's bounding box mid-flight. */}
        <motion.g
          className="focus-frame"
          style={{ transformBox: "view-box", transformOrigin: "center" }}
        >
          <motion.path className="focus-brackets" d={BRACKET_STATES[0]} />
          <motion.circle
            className="focus-flash"
            cx={12}
            cy={12}
            r={7.5}
            fill="currentColor"
            stroke="none"
            opacity={0}
          />
          <motion.path
            className="focus-dot"
            d={DOT_D}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        </motion.g>
      </svg>
    );
  }
);

FocusIcon.displayName = "FocusIcon";
