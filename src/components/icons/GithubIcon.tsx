"use client";

import { forwardRef, useId, useImperativeHandle, type SVGProps } from "react";
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
 * ANIMATION STORYBOARD — octocat reveal + ear bounce (hover)
 *
 *    0ms  the Octocat sits filled inside the circular badge.
 *   DIP   on hover the cat slides straight DOWN and out of the
 *         badge — a quick ease-in, so it disappears past the
 *         bottom rim (a circular clip does the occluding).
 *  hold   a short beat at the bottom (HOLD).
 *  RISE   the cat springs back UP into the badge and settles.
 *   EARS  as it lands, ONLY the two ears twitch in OPPOSITE
 *         directions — splay out, pinch in, and settle upright.
 *
 * MOVING ONLY THE EARS. The Octocat is a single filled path, so
 * the ears were CARVED OUT: BODY_D is the glyph with a rounded,
 * earless dome where the tufts were, and EAR_L_D / EAR_R_D are
 * the two tufts as separate pieces, each rooted DOWN into the
 * head. At rest, dome + tufts reproduce the original silhouette
 * exactly. The bounce is a skewX about a base line buried in the
 * head (EAR_PIVOT_Y) — a horizontal shear leaves the base glued
 * to the head (no lift ⇒ no gap) while the tips lean side to
 * side, and the earless dome underneath stays clean the whole
 * time. Same currentColor throughout, so the roots never show.
 *
 * TWO CHOREOGRAPHIES (same split as PlayIcon / HomeDoorIcon):
 *   playAnimation()  → real springs — the hover feel
 *   createScrubber() → a keyframed twin, because makeScrubber
 *                      seeks by time and a spring's duration is
 *                      indeterminate. Kept in sync by hand.
 * ───────────────────────────────────────────────────────── */

/** How far below rest the cat parks — the source Figma keyframe's rise. */
const DROP = 13;
/** Skew pivot (viewBox y): buried in the head, so tips lean but bases don't. */
const EAR_PIVOT_Y = 7;
/** Right ear: decaying out→in→out lean (skewX degrees), landing back at 0.
 *  The left ear mirrors it, so the pair splays out then pinches in. */
const SKEW_R = [0, 17, -12, 6, 0];
const SKEW_L = SKEW_R.map((v) => -v);

/* ── Springs / tween (playAnimation) ─────────────────────────────────────── */
/** Duck down: no bounce, just a fast slide out under the rim. */
const DIP = { type: "spring", visualDuration: 0.16, bounce: 0 } as const;
/** Rise back into the badge, overshooting a touch so it pops into place. */
const RISE = { type: "spring", visualDuration: 0.4, bounce: 0.3 } as const;
/** Beat at the bottom before springing back. */
const HOLD = 0.05;
/** The ear bounce, as a tween through each lean. */
const BOUNCE = {
  duration: 0.6,
  times: [0, 0.3, 0.56, 0.8, 1],
  ease: "easeInOut" as Easing,
};

/* ── Scrub twin (createScrubber) — keyframes only ─────────────────────────── */
const SCRUB_TOTAL = 0.96;
type Bezier = [number, number, number, number];
const EASE_IN: Bezier = [0.4, 0, 1, 1];
const EASE_OUT: Bezier = [0, 0, 0.2, 1];

const SEQUENCE_SCRUB: AnimationSequence = [
  [
    ".gh-cat",
    { y: [0, DROP, 0, 0] },
    {
      at: 0,
      duration: SCRUB_TOTAL,
      times: [0, 0.22, 0.52, 1],
      ease: [EASE_IN, EASE_OUT, EASE_OUT] as Easing[],
    },
  ],
  [
    ".gh-ear-r",
    // Hold upright through the dip/rise, then twitch out→in→out and settle.
    { skewX: [0, 0, 17, -12, 6, 0] },
    {
      at: 0,
      duration: SCRUB_TOTAL,
      times: [0, 0.52, 0.64, 0.78, 0.9, 1],
      ease: "easeInOut",
    },
  ],
  [
    ".gh-ear-l",
    // Mirror of the right ear — opposite direction.
    { skewX: [0, 0, -17, 12, -6, 0] },
    {
      at: 0,
      duration: SCRUB_TOTAL,
      times: [0, 0.52, 0.64, 0.78, 0.9, 1],
      ease: "easeInOut",
    },
  ],
];

/** Octocat body with the ear tufts removed and the head closed into a rounded,
 *  earless dome. Placed in viewBox space via translate(4.2 5). */
const BODY_D =
  "M3.89779 12.5827C3.89779 12.8044 3.40012 13.5739 3 13.5C4.6 14.3 7.33333 " +
  "13.8333 8.5 13.5C8.09988 13.5845 7.87903 12.8044 7.87903 12.5827C7.87903 " +
  "12.2977 7.88903 11.3898 7.88903 10.2603C7.88903 9.46856 7.63896 8.96185 " +
  "7.34887 8.69794C9.12942 8.48681 11 7.76897 11 4.52814C11 3.59917 10.6899 " +
  "2.84966 10.1797 2.2585C10.45 0.75 8.1 0.55 5.89842 0.55C3.7 0.55 1.35 0.75 " +
  "1.61709 2.2585C1.10693 2.84966 0.796832 3.60972 0.796832 4.52814C0.796832 " +
  "7.75842 2.65741 8.48681 4.43796 8.69794C4.20789 8.90907 3.99783 9.27855 " +
  "3.9278 9.82748C3.46766 10.0492 2.3173 10.4081 1.59708 9.13076C1.44703 8.8774 " +
  "0.996894 8.25457 0.366698 8.26513C-0.30351 8.27568 0.0966146 8.66627 0.376702 " +
  "8.82462C0.716807 9.02519 1.10693 9.7747 1.19696 10.0175C1.35701 10.4925 1.87717 " +
  "11.4004 3.88779 11.0098C3.88779 11.7171 3.89779 12.3821 3.89779 12.5827Z";

/* The two ear tufts, carved from the original path (exact tuft cubic on top),
   each closed with a root running down into the head so the skew has no seam. */
/** Left tuft. */
const EAR_L_D =
  "M3.89779 0.886157C2.36732 -0.201159 1.69711 0.0205269 1.69711 0.0205269" +
  "L1.69711 2.6L3.89779 2.6Z";
/** Right tuft. */
const EAR_R_D =
  "M10.0997 0.0205269C10.0997 0.0205269 9.42951 -0.211715 7.89904 0.886157" +
  "L7.89904 2.6L10.0997 2.6Z";

export const GithubIcon = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
  (props, ref) => {
    const [scope, animate] = useAnimate();
    const shouldReduceMotion = useReducedMotion();
    // Unique per instance (the icon renders in several places at once);
    // colons stripped because they break url(#...) references.
    const clipId = `gh-badge-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

    useImperativeHandle(ref, () => ({
      async playAnimation() {
        // Rest pose (cat inside the badge) already renders from JSX.
        if (shouldReduceMotion) return;

        // DIP — duck straight down and out under the rim.
        await animate(".gh-cat", { y: DROP }, DIP);
        // RISE — spring back up into the badge.
        await animate(".gh-cat", { y: 0 }, { ...RISE, delay: HOLD });
        // EARS — twitch in opposite directions (skew about a buried base line,
        // so only the tips move). Fired together so the pair stays in sync.
        animate(".gh-ear-l", { skewX: SKEW_L }, BOUNCE);
        await animate(".gh-ear-r", { skewX: SKEW_R }, BOUNCE);
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
        strokeLinecap="round"
        strokeLinejoin="round"
        ref={scope}
        {...props}
      >
        <defs>
          {/* Badge is inset 1px: an 18×18 circle (rx ≥ half ⇒ round). */}
          <clipPath id={clipId}>
            <rect x="1" y="1" width="18" height="18" rx="9" />
          </clipPath>
        </defs>
        {/* The clip is glued to the badge (static), so the dive under the rim
            is cleanly occluded. */}
        <g clipPath={`url(#${clipId})`}>
          {/* Earless body + ears dip and rise together. Rest value (y:0) in
              initial so makeScrubber's pre-paint pause holds the cat in place. */}
          <motion.g className="gh-cat" initial={{ y: 0 }}>
            <path
              d={BODY_D}
              transform="translate(4.2 5)"
              fill="currentColor"
              stroke="none"
            />
            {/* Each ear shears independently about the same buried base line —
                opposite directions, so the tips splay/pinch while the bases
                stay glued to the dome. transformOrigin in `initial` (Motion
                overrides a style-set origin on SVG); view-box makes
                EAR_PIVOT_Y viewBox-relative. (skewX ignores the x-origin, so a
                shared "10px" is fine for both.) */}
            <motion.g
              className="gh-ear-l"
              initial={{ skewX: 0, transformOrigin: `10px ${EAR_PIVOT_Y}px` }}
              style={{ transformBox: "view-box" }}
            >
              <path
                d={EAR_L_D}
                transform="translate(4.2 5)"
                fill="currentColor"
                stroke="none"
              />
            </motion.g>
            <motion.g
              className="gh-ear-r"
              initial={{ skewX: 0, transformOrigin: `10px ${EAR_PIVOT_Y}px` }}
              style={{ transformBox: "view-box" }}
            >
              <path
                d={EAR_R_D}
                transform="translate(4.2 5)"
                fill="currentColor"
                stroke="none"
              />
            </motion.g>
          </motion.g>
        </g>
        {/* Static badge ring, drawn on top at the set's 1.5px weight. */}
        <rect x="1" y="1" width="18" height="18" rx="9" fill="none" />
      </svg>
    );
  },
);

GithubIcon.displayName = "GithubIcon";
