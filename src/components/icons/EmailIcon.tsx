"use client";

import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import { motion, useAnimate, type AnimationSequence } from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────
 * ANIMATION STORYBOARD — envelope flap
 *
 *     0ms  flap closed (rest)              (S0)
 *   196ms  flap swings fully open upward   (S1, ease-in-out-cubic arc)
 *   420ms  flap held open (linear hold)    (S1, reads as "reading" the mail)
 *   588ms  flap falls back, slight sag     (S2, gentler ease-in-out-quad)
 *   700ms  flap settles closed             (S0, soft settle landing)
 * ───────────────────────────────────────────── */

const FLAP_CLOSED =
  "M 1.75 0.75 C 1.75 0.75 7.734 6.217 8.734 6.717 C 9.734 7.217 9.734 7.217 10.667 6.717 C 11.599 6.217 17.602 0.75 17.602 0.75";
const FLAP_OPEN =
  "M 1.75 0.75 C 1.75 0.75 7.795 -3.49 8.782 -4.017 C 9.858 -4.591 9.803 -4.62 10.714 -4.017 C 11.738 -3.339 17.602 0.75 17.602 0.75";
const FLAP_SETTLE =
  "M 1.75 0.75 C 1.75 0.75 7.732 6.207 8.73 6.711 C 9.893 7.299 9.732 7.162 10.662 6.711 C 11.767 6.176 17.602 0.75 17.602 0.75";

const BODY_D =
  "M 2.25 14.25 C 7.25 14.25 12.25 14.25 17.25 14.25 C 18.078 14.25 18.75 13.578 18.75 12.75 C 18.75 9.25 18.75 5.75 18.75 2.25 C 18.75 1.422 18.077 0.75 17.248 0.75 C 11.347 0.75 8.153 0.75 2.252 0.75 C 1.424 0.75 0.75 1.422 0.75 2.25 C 0.75 5.75 0.75 9.25 0.75 12.75 C 0.75 13.578 1.422 14.25 2.25 14.25 Z";

/**
 * Ends on S0 (not S2) so every replay lands pixel-identical to rest — S2 is
 * slightly asymmetric and would drift the pose across repeated hovers.
 *
 * Morphing is on-screen movement -> ease-in-out beziers, one per segment,
 * strongest first (motion-craft's named library): the opening swing carries
 * the most energy (cubic), the fall-back is gentler (quad), and the final
 * settle is the softest so the flap "lands" instead of stopping.
 */
const EASE_IN_OUT_CUBIC = [0.645, 0.045, 0.355, 1] as const;
const EASE_IN_OUT_QUAD = [0.455, 0.03, 0.515, 0.955] as const;
const EASE_SETTLE = [0.22, 1, 0.36, 1] as const;

// A second FLAP_OPEN keyframe holds the fully-open pose, so the flap pauses
// open before it closes instead of snapping straight back. The hold segment
// uses linear (the pose is identical, so the curve is invisible anyway) and the
// duration grows by the hold so the open swing and the close keep their speed.
const SEQUENCE: AnimationSequence = [
  [
    ".email-flap",
    { d: [FLAP_CLOSED, FLAP_OPEN, FLAP_OPEN, FLAP_SETTLE, FLAP_CLOSED] },
    {
      duration: 0.7,
      times: [0, 0.28, 0.6, 0.84, 1],
      ease: [EASE_IN_OUT_CUBIC, "linear", EASE_IN_OUT_QUAD, EASE_SETTLE],
    },
  ],
];

export const EmailIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();

    useImperativeHandle(ref, () => ({
      async playAnimation() {
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
        height={15}
        viewBox="0 0 20 15"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        <path d={BODY_D} />
        <motion.path className="email-flap" d={FLAP_CLOSED} />
      </svg>
    );
  },
);

EmailIcon.displayName = "EmailIcon";
