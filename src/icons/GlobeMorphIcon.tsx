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
 * ANIMATION STORYBOARD — the globe turns
 *
 * One sentence: the two meridians bow across the face as
 * the globe rotates, hold, and swing back.
 *
 * CLASS C / D-3 (§2) — the outline is a circle, which is
 * symmetric about every axis and so never changes; only the
 * meridians deform. They are asymmetric curves that have to
 * appear to travel around a sphere, which is the D-3 case:
 * two authored states that ENCODE THE PROJECTION rather
 * than a rotation the renderer could compute.
 *
 * WHY NOT scaleX (D-1)? That is the cheap trick for a shape
 * symmetric about the spin axis, and it is right for the
 * outline — but the outline is the one part already
 * invariant. Foreshortening the meridians with scaleX would
 * squash them toward the icon's centre instead of bowing
 * them across a curved surface, and they would visibly
 * detach from the rim they are supposed to be drawn on.
 *
 * BOTH MERIDIANS ARE PINNED AT THEIR POLES. Only the two
 * control points move between states, so the curves stay
 * welded to the rim and only their bulge travels — that is
 * what sells a surface turning underneath them rather than
 * two lines wobbling inside a ring.
 *
 *     0ms  rest — horizon bowed low, meridian bowed left
 *   325ms  both swung through to the far side
 *   590ms  held (the beat that reads as "turned")
 *   950ms  back to rest, pixel-identical (§0.2)
 *
 * Note the repo already has GlobeSpinIcon; that one spins a
 * full set of meridians with a composition hand-off (§5.3)
 * and loops. This is the two-state morph — a shorter, more
 * literal "it turned and came back".
 * ───────────────────────────────────────────── */

/** The rim. Never animates — a circle looks identical from every angle. */
const RIM_D =
  "M9.99984 18.3337C14.6022 18.3337 18.3332 14.6027 18.3332 10.0003C18.3332 5.39795 14.6022 1.66699 9.99984 1.66699C5.39746 1.66699 1.6665 5.39795 1.6665 10.0003C1.6665 14.6027 5.39746 18.3337 9.99984 18.3337Z";

/**
 * The two meridians, two states each.
 *
 * Endpoints are identical across each pair by construction — the source art
 * had them drifting by ~1e-4, which is invisible but means the poles crawl
 * during the morph. Pinning them makes the poles exact, so the only thing
 * interpolating is the pair of control points, i.e. the bulge.
 *
 * Command structure is `MC` in all four (validated): same letters, same
 * order, same anchor count, same start point — the §2 Class C contract.
 */
const HORIZON_REST =
  "M1.6665 10C5.98726 14.0224 13.72 13.6564 18.3332 10.2963";
const HORIZON_TURNED = "M1.6665 10C5 5 12 4.99959 18.3332 10.2963";

const MERIDIAN_REST =
  "M9.61404 1.66699C5.82454 5.41699 5.40344 14.167 9.99513 18.3337";
const MERIDIAN_TURNED =
  "M9.61404 1.66699C14.5 4.5 16 13 9.99513 18.3337";

/**
 * Self-restoring keyframes (§5.1): each track returns to its rest `d`, so the
 * icon at rest is the untouched glyph and replays cannot drift.
 *
 * Both meridians run on one timeline with no offset between them. They are
 * two lines on ONE turning surface — staggering them would say the sphere
 * twists, which is a different (and wrong) story.
 */
const DURATION = 0.95;
const TIMES = [0, 0.34, 0.62, 1];
const EASE = [0.22, 1, 0.36, 1] as const;

const SEQUENCE: AnimationSequence = [
  [
    ".globe-horizon",
    { d: [HORIZON_REST, HORIZON_TURNED, HORIZON_TURNED, HORIZON_REST] },
    { duration: DURATION, times: TIMES, ease: EASE },
  ],
  [
    ".globe-meridian",
    { d: [MERIDIAN_REST, MERIDIAN_TURNED, MERIDIAN_TURNED, MERIDIAN_REST] },
    { at: "<", duration: DURATION, times: TIMES, ease: EASE },
  ],
];

export const GlobeMorphIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
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
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        // The meridians stay inside the rim, but keep the escape hatch open so
        // this matches the rest of the set.
        style={{ overflow: "visible" }}
        ref={scope}
        {...props}
      >
        <path d={RIM_D} />
        <motion.path className="globe-horizon" d={HORIZON_REST} />
        <motion.path className="globe-meridian" d={MERIDIAN_REST} />
      </svg>
    );
  },
);

GlobeMorphIcon.displayName = "GlobeMorphIcon";
