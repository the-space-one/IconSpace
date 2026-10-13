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
 * ANIMATION STORYBOARD — a slash strikes across the mic,
 * knocks it off its foot, and carries on out of frame (hover)
 *
 * REST IS UNMUTED. The slash is not a state that toggles on
 * and stays — it is a STRIKE that passes THROUGH. It enters
 * bottom-left, crosses, holds for one beat at full length
 * (that beat is the "muted" read), then whips out top-right.
 * One continuous direction, so the last frame is an empty
 * diagonal — pixel-identical to rest (§0.2), no reversal and
 * no fade.
 *
 *     0ms  mic upright, no slash
 *  0-280ms SWEEP IN — the slash draws on from the bottom-left
 *          corner. The head is half way across at 85ms and
 *          crosses the mic itself between 60ms and 125ms.
 *  70-126ms KNOCK — the mic tips 6.5° clockwise about its
 *          RIGHT FOOT, hinged on the base, on an ease-out-
 *          quint. Struck, not spun.
 *   280ms  HOLD — the slash sits at full length for 98ms.
 *          The only still moment, and the only one that reads
 *          as "muted".
 *   378ms  SWEEP OUT — the tail follows the head off the
 *          top-right, accelerating away.
 *   420ms  the mic has settled back upright
 *   700ms  empty diagonal, mic at rest (§0.2)
 *
 * THE KNOCK IS THE ONLY THING ALLOWED TO BE INSTANT. First
 * pass ran the sweep on the same ease-out-quint as the hit,
 * and the slash was fully drawn by 98ms — which does not read
 * as a sweep at all, it reads as a line appearing. Worse, the
 * mic then tipped 130ms after the slash had already arrived
 * and stopped, so the cause looked like it followed the
 * effect. Travel needs an ease you can watch; only the impact
 * gets to be over before you see it.
 *
 * THE SLASH CUTS A GAP, IT DOES NOT SIT ON TOP. The mic is
 * masked by a white full-bleed rect minus a BLACK BAND that is
 * the same path as the slash, same dash treatment, just 3.3
 * wide against the line's 1.5. So the gap travels with the
 * line, and the mic is only ever cut where the line currently
 * IS — at rest it is uncut, mid-sweep only its lower-left half
 * is. Drawing the line over an intact mic instead reads as a
 * sticker laid on the glyph; the carved gap reads as depth.
 * (Technique borrowed from Discord's voice-bar Lottie, which
 * masks the same way — the geometry here is our own, and the
 * motion is a pass-through rather than their state toggle.)
 *
 * ONE VALUE DRIVES BOTH. The gap band and the visible line
 * share a class and one `strokeDashoffset` keyframe run, so
 * they cannot drift apart by a sub-pixel and leave the line
 * kissing the edge of its own gap.
 *
 * WHY DASH, NOT TRANSLATION. Sliding a finite band along its
 * own 45° axis is the obvious reading of the effect, but a
 * band parked outside the box is still painted under this
 * repo's `overflow: visible`, so it would need its own clip.
 * `pathLength={1}` + a dash pattern + an animated offset is
 * the same picture with nothing to clip. Class B in the
 * decision tree (§2).
 *
 * THE GAP IS "1 2", NOT "1 1", AND THAT IS NOT COSMETIC. The
 * obvious pattern is dash 1 / gap 1 swept from offset +1 to
 * -1, and it renders a DOT at both ends of the timeline —
 * i.e. at rest. Period 2 against a path of length 1 means a
 * fresh dash period begins exactly at the path's far end, and
 * a zero-length dash under `stroke-linecap: round` paints a
 * full-width dot rather than nothing. Period 3 ("1 2") pushes
 * the neighbouring periods clear: across the whole offset
 * range only ONE dash interval can ever touch the path, so
 * parking at ±1.02 leaves the path strictly inside the gap
 * with no boundary on either endpoint. Nothing is drawn, and
 * the round caps survive.
 *
 * IT TIPS, IT DOES NOT SPIN. The pivot is the base's RIGHT
 * foot, so the LEFT foot is what lifts — a mic knocked in the
 * direction the slash is travelling. Rotation about the centre
 * would read as the mic turning to look at something.
 *
 * 6.5° IS THE WHOLE DEFLECTION, and that is deliberate at this
 * size: the base is 6 units wide, so the far foot lifts 0.68
 * units. §0.4 territory.
 *
 * Rotation is isometric, so strokeWidth never changes.
 * ───────────────────────────────────────────────────────── */

const STROKE = 1.5;

/**
 * Mic capsule — a fully-rounded pill, rx = half its width.
 *
 * Sunk 1.2 lower than the obvious fit. Drawn at y 1.8 the pill clears the top
 * of the box by 1.05 and the whole glyph hangs off it, reading top-heavy with a
 * gap between the capsule and the cradle it is supposed to sit in. At 3.0 it
 * noses properly down into the cradle.
 *
 * HOW DEEP IT CAN GO IS SET BY THE CRADLE, not by taste. The capsule's lower
 * corners run at the cradle's inner wall, and that wall closes in fast: at the
 * original radius 4.5 the stroke edges touch at y 3.25 and are only 0.15 apart
 * at 3.0. Widening the cradle to 4.8 is what buys the drop — it reopens the
 * clearance to 0.49 at this depth. Measured stroke edge to stroke edge, not
 * path to path; the 1.5 stroke eats 0.75 from each side and is the whole
 * difference between "nested" and "welded".
 *
 * The whole capsule/cradle assembly sits 0.45 higher than it first did, to pay
 * for half of the longer stem — see STEM_D.
 */
const CAPSULE = { x: 6.75, y: 3.0, w: 4.5, h: 7.5, r: 2.25 } as const;

/**
 * The cradle: a semicircle under the capsule, r 4.8 about (9, 8.25), drawn as
 * two cubic quarters at the circle constant (0.5523 · 4.8 = 2.651). §2 bans
 * `A` in anything animatable, and the family keeps one drawing idiom
 * throughout even where the part happens to be static.
 *
 * The radius is 4.8 rather than 4.5 to clear the capsule at its new depth —
 * see the CAPSULE note. Its low point moves 12.75 → 13.05 with it.
 */
const CRADLE_D =
  "M4.2 8.25" +
  "C4.2 10.901 6.349 13.05 9 13.05" +
  "C11.651 13.05 13.8 10.901 13.8 8.25";

/**
 * Stem down from the cradle's low point, then the base it stands on.
 *
 * 2.6 long. The first pass ran 1.7 and the cradle read as sitting almost
 * directly on its own foot — no neck, so it stopped looking like a mic on a
 * stand. The extra 0.9 is paid for from both ends rather than all downward:
 * the capsule and cradle came up 0.45 (see CAPSULE) and the base went down
 * 0.45, so the glyph grows around its middle and stays optically centred in
 * the box instead of sinking toward the bottom edge.
 */
const STEM_D = "M9 13.05L9 15.65";
const BASE_D = "M6 15.65L12 15.65";

/**
 * The strike, corner to corner. Start point is the BOTTOM-LEFT: the drawn
 * portion under a "1 1" dasharray is always anchored at the path start, so
 * the entry end is fixed by the direction this is written in.
 */
const SLASH_D = "M2.6 15.4L15.4 2.6";

/**
 * Gap band width. 0.9 of clearance either side of the 1.5 line, so the round
 * cap of the gap also clears the round cap of the line.
 */
const GAP = STROKE + 2 * 0.9;

/** The hinge: the base's RIGHT foot, so the LEFT foot is the one that lifts. */
const PIVOT = "12px 15.65px";
const KNOCK_DEG = 6.5;

/**
 * Where the dash parks so nothing is drawn. Just past ±1 — see the storyboard
 * note on why the period is 3 and why exactly ±1 is not far enough.
 */
const PARK = 1.02;

const DURATION = 0.7;

/** The slash TRAVELLING. Soft push out of the corner, decelerating in — an
 *  ease you can actually watch cross the glyph. Head at half way by 30% of
 *  the beat, not 10%. */
const SWEEP_IN: Easing = [0.4, 0.65, 0.5, 1];
/** The slash LEAVING. Back-loaded, so it hangs a moment then whips out. */
const SWEEP_OUT: Easing = [0.45, 0, 0.75, 0.5];
/** The HIT. Ease-out-quint — over before you see it, which is the point. */
const KNOCK: Easing = [0.16, 1, 0.3, 1];
const SETTLE: Easing = [0.22, 1, 0.36, 1];

const SEQUENCE: AnimationSequence = [
  // Gap band and visible line share this class, so one run drives both.
  [
    ".mic-strike",
    { strokeDashoffset: [PARK, 0, 0, -PARK] },
    {
      duration: DURATION,
      times: [0, 0.4, 0.54, 1],
      ease: [SWEEP_IN, "linear", SWEEP_OUT] as Easing[],
    },
  ],
  // The knock, on its own clock: it fires as the slash reaches the mic, not
  // when the slash finishes. Per-layer clocks are the LockIcon / TicketIcon
  // pattern — sharing the slash's `times` would put the hit 150ms after the
  // thing that caused it had already stopped moving.
  [
    ".mic-body",
    { rotate: [0, 0, KNOCK_DEG, 0, 0] },
    {
      at: 0,
      duration: DURATION,
      times: [0, 0.1, 0.18, 0.6, 1],
      ease: ["linear", KNOCK, SETTLE, "linear"] as Easing[],
    },
  ],
];

export const MicIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  // Colons from useId() are legal in an id attribute but trip up enough
  // url(#…) / querySelector paths that it is not worth the argument.
  const maskId = `mic-cut-${useId().replace(/:/g, "")}`;

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
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      <defs>
        {/* White shows, black hides. The rect is oversized so the mic keeps
            its full ink even though the glyph itself never leaves the box. */}
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect x={-4} y={-4} width={26} height={26} fill="white" />
          <path
            className="mic-strike"
            d={SLASH_D}
            stroke="black"
            strokeWidth={GAP}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 2"
            strokeDashoffset={PARK}
          />
        </mask>
      </defs>

      {/* Capsule, cradle, stem and base take the hit as one object — tipping
          the capsule alone would slide it out of its own cradle.
          transformOrigin lives in `initial` because Motion overwrites a
          style-level origin with its 50%/50% SVG default; transformBox lives
          in `style`, and is what makes those pixels mean viewBox units.
          The rest angle is in `initial` too, so makeScrubber's pre-paint pause
          holds the mic UPRIGHT until the first seek. */}
      <g mask={`url(#${maskId})`}>
        <motion.g
          className="mic-body"
          initial={{ rotate: 0, transformOrigin: PIVOT }}
          style={{ transformBox: "view-box" }}
        >
          <rect
            x={CAPSULE.x}
            y={CAPSULE.y}
            width={CAPSULE.w}
            height={CAPSULE.h}
            rx={CAPSULE.r}
          />
          <path d={CRADLE_D} />
          <path d={STEM_D} />
          <path d={BASE_D} />
        </motion.g>
      </g>

      {/* Rides inside the gap it carved, so it reads as passing in front. */}
      <path
        className="mic-strike"
        d={SLASH_D}
        pathLength={1}
        strokeDasharray="1 2"
        strokeDashoffset={PARK}
      />
    </svg>
  );
});

MicIcon.displayName = "MicIcon";
