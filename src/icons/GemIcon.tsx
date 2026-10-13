import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  useAnimate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type AnimationSequence,
  type MotionValue,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — the gem turns on its own axis
 * (the facets sweep west→east 360° — two 180° passes — in
 * one ease-in-out-quint gesture: long quiet wind-up, a
 * snappy multi-revolution whip through mid-flight, long
 * braking glide into the landing)
 *
 *    0ms  gem at rest: silhouette, girdle line, facets at
 *         {-90°, -30°, +30°}                       (frame 1)
 *  0-1500ms  facets sweep 360°, never pausing
 *  1500ms  360° is a multiple of the 60° facet spacing, so
 *         the set maps onto itself → pixel-identical to
 *         rest, replays seamlessly
 *
 * GlobeSpinIcon's technique, on a different solid — Class D-3
 * per ICON-SYSTEM §2, built numerically rather than from a
 * d-morph, because facets merge into the silhouette at the
 * limb and a morph cannot change topology.
 *
 * WHY THE GLOBE'S MATH WORKS HERE. The gem is a solid of
 * REVOLUTION about its vertical axis: a top circle (radius
 * R_TOP), a girdle circle (R_GIRDLE) and an apex point. Under
 * an orthographic side view a point at radius ρ and longitude
 * θ projects to x = CX + ρ·sin θ with its y fixed, so a facet
 * line is just three points — top circle, girdle circle, apex
 * (ρ = 0, hence pinned) — and the whole spin is one sine.
 * Two consequences make the icon work:
 *
 *   - the SILHOUETTE is invariant. Spinning a solid of
 *     revolution about its own axis cannot change its outline,
 *     so the outer path and the girdle line are static, exactly
 *     like the globe's limb circle and latitude chords.
 *   - the HAND-OFF is exact. At θ = ±90° a facet's points are
 *     (CX ± R_TOP, Y_TOP) and (CX ± R_GIRDLE, Y_GIRDLE) — the
 *     silhouette's own bevel and lower edge. A facet reaching
 *     the limb coincides with the outline, hides under its
 *     stroke, and re-emerges on the far side. No fade, no
 *     clone: ICON-SYSTEM loop strategy 3, composition hand-off.
 *
 * Facet d strings are recomputed per frame from ONE `spin`
 * motion value (BookFlip/Search3D pattern), so hover playback
 * and the Scrub Lab pose the same pure function of time. The
 * command structure is always M L L, so every scrub seek lands
 * on valid geometry.
 *
 * Drawn from the supplied 44-grid glyph, rebuilt on an 18 grid
 * at strokeWidth 1.5 to match the rest of the set. The authored
 * facets were close to but not exactly a projection (their top
 * points sat ~1 unit wide of where the sine puts them); the
 * geometry here is the consistent version, which is what lets
 * the same function serve every frame of the turn.
 * ───────────────────────────────────────────────────────── */

const DURATION = 1.5;

/** ease-in-out-quint: quieter ends, snappier whip mid-turn than quart. */
const EASE_IN_OUT_QUINT = [0.86, 0, 0.07, 1] as const;

/** Axis of revolution, and the three heights the solid is defined at. */
const CX = 9;
const Y_TOP = 1.5;
const Y_GIRDLE = 6;
const Y_APEX = 16.5;

/** Radius of the top circle (the table) and of the girdle — the widest ring.
 *  Their ratio, 0.48, is the supplied glyph's proportion. */
const R_TOP = 3.6;
const R_GIRDLE = 7.5;

/**
 * Rest longitudes, uniformly 60° apart so any multiple-of-60° advance maps the
 * set onto itself. -90° sits exactly under the left bevel at rest, so the
 * visible rest glyph is the outline + girdle + two facets at ±30° — the
 * supplied frame 1 exactly.
 */
const FACET_LONGITUDES = [-90, -30, 30];
/** Total sweep: two 180° passes, so the gem visibly turns ~2×. */
const SPIN_DEGREES = 360;

const n = (v: number) => Number(v.toFixed(3));

/**
 * The silhouette: table edge, two bevels down to the girdle, two edges down to
 * the apex. Static — see the storyboard's invariance note. Round joins do the
 * corner rounding the authored glyph spelled out as cubics.
 */
const OUTLINE_D =
  `M${n(CX - R_TOP)} ${Y_TOP}` +
  `L${n(CX + R_TOP)} ${Y_TOP}` +
  `L${n(CX + R_GIRDLE)} ${Y_GIRDLE}` +
  `L${CX} ${Y_APEX}` +
  `L${n(CX - R_GIRDLE)} ${Y_GIRDLE}Z`;

/** The girdle, seen edge-on: a chord across the widest ring. */
const GIRDLE_D = `M${n(CX - R_GIRDLE)} ${Y_GIRDLE}H${n(CX + R_GIRDLE)}`;

/** Keep longitude in [-90°, 90°): the front-facing half. A facet on the back
 *  projects onto the same x as its front counterpart, so the two are one line. */
function wrapLongitude(deg: number): number {
  return ((((deg + 90) % 180) + 180) % 180) - 90;
}

/**
 * One facet at `longitude`: table point, girdle point, apex. Both moving
 * points ride the same sine, scaled by their own ring's radius — which is what
 * makes the facet foreshorten toward the edges instead of sliding rigidly.
 * Always M L L, so the command structure never changes.
 */
function facetD(longitude: number): string {
  const s = Math.sin((longitude * Math.PI) / 180);
  return (
    `M${n(CX + R_TOP * s)} ${Y_TOP}` +
    `L${n(CX + R_GIRDLE * s)} ${Y_GIRDLE}` +
    `L${CX} ${Y_APEX}`
  );
}

function buildSequence(spin: MotionValue<number>): AnimationSequence {
  return [[spin, [0, 1], { duration: DURATION, ease: [...EASE_IN_OUT_QUINT] }]];
}

export const GemIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const spin = useMotionValue(0);
  const shouldReduceMotion = useReducedMotion();
  const facetRefs = useRef<(SVGPathElement | null)[]>([]);

  const facetDs = useTransform(spin, (p) =>
    FACET_LONGITUDES.map((lon) =>
      facetD(wrapLongitude(lon + SPIN_DEGREES * p)),
    ),
  );
  useMotionValueEvent(facetDs, "change", (ds) => {
    ds.forEach((d, i) => facetRefs.current[i]?.setAttribute("d", d));
  });

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      spin.jump(0);
      await animate(buildSequence(spin));
    },
    createScrubber() {
      spin.jump(0);
      return makeScrubber(
        () => animate(buildSequence(spin)),
        // Sequence cancel restores DOM attributes, but the motion value keeps
        // its last scrubbed value; reset so facets recompute back to rest.
        () => spin.jump(0),
      );
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
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      <path d={OUTLINE_D} />
      <path d={GIRDLE_D} />
      {/* Facets: d is driven imperatively from the spin motion value. */}
      {FACET_LONGITUDES.map((lon, i) => (
        <path
          key={lon}
          ref={(el) => {
            facetRefs.current[i] = el;
          }}
          d={facetD(lon)}
        />
      ))}
    </svg>
  );
});

GemIcon.displayName = "GemIcon";
