"use client";

import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationSequence,
  type MotionValue,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — 3D search spin around the handle axis
 *
 *    0ms  glass rests face-on, plain Lucide glyph     (0°)
 * ~100ms  the rim's barrel swells out; the lens stays
 *         see-through (hole through the ring)         (→90°)
 * ~155ms  the through-hole squeezes shut — you can't
 *         see through a ring edge-on                  (~78°)
 * ~175ms  edge-on: one solid slab                     (90°)
 * ~350ms  rear sweeps past, mirrored, hole reopens    (180°)
 * ~525ms  edge-on again                               (270°)
 *  700ms  glass settles face-on — identical to rest   (360°)
 *
 * The glass is a RING (annulus, outer 8.75 / inner 7.25) extruded by
 * 2·EXTRUDE around the diagonal handle axis (y = x), projected
 * orthographically. Turned by θ, faces sit at ±EXTRUDE·sinθ along
 * the axis-perpendicular, squashed by cosθ.
 *
 * Drawn as ONE evenodd path in PURE currentColor — no shades, no
 * opacity, nothing translucent, per the icon system's duotone/
 * stroke color rules:
 *   - outer outline: convex hull of the two outer face ellipses
 *     (front half-ellipse, straight side-wall tangents, back
 *     half-ellipse) — the solid silhouette;
 *   - hole outline: the vesica where the front and back openings
 *     overlap — the region you can genuinely see through. It
 *     shrinks as the glass turns and vanishes when the inner
 *     half-height R_IN·|cosθ| drops below the face offset, closing
 *     into the solid edge-on slab with no fade needed.
 * Both outlines are recomputed per frame from one progress value
 * (BookFlipIcon's pattern), so playback and the Scrub Lab pose the
 * same pure function of time and rest is pixel-identical to the
 * Lucide glyph. The handle's extrusion is its stroke widened to
 * STROKE·|cosθ| + 2·EXTRUDE·|sinθ| (offset ⊥ handle ⇒ that IS its hull).
 * 360° == 0° keeps the loop invisible. No CSS 3D, no stacks, no
 * crossfades — nothing to stripe, flicker, or gray out.
 * ───────────────────────────────────────────────────────── */

const DURATION = 0.7;

/** Half-thickness of the glass, viewBox units. Edge-on slab = 2× this. */
const EXTRUDE = 1.5;

/**
 * Shelf-wide stroke weight. The rim geometry below is DERIVED from it, so
 * the extruded body keeps coinciding with the glyph's footprint at rest —
 * changing this number alone re-fits the whole icon.
 */
const STROKE = 1.5;

/** Rim edges: Lucide r=8 circle stroked at STROKE ⇒ outer 8.75, inner 7.25. */
const R_OUT = 8 + STROKE / 2;
const R_IN = 8 - STROKE / 2;

/** Lens center. Note (11,11) and the handle both lie on the y = x axis. */
const CX = 11;
const CY = 11;

/** Axis direction v = y=x diagonal; u = its screen perpendicular. */
const VX = Math.SQRT1_2;
const VY = Math.SQRT1_2;
const UX = Math.SQRT1_2;
const UY = -Math.SQRT1_2;

/** Polyline samples per arc (chord error < 0.5px at 256px rendered). */
const ARC_SEGMENTS = 24;

const TAU = Math.PI * 2;

function pt(along: number, across: number): string {
  const x = CX + VX * along + UX * across;
  const y = CY + VY * along + UY * across;
  return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

/**
 * Silhouette of the extruded ring as an evenodd pair of outlines.
 *
 * Solid: hull of the outer ellipses (semi-major R_OUT along v, semi-minor
 * R_OUT·|cosθ| along u, centers ±a·u where a = EXTRUDE·|sinθ|). Ellipse
 * tangents at the ±v extremes point along u, so straight chords there
 * close the hull exactly.
 *
 * Hole: overlap of the two inner openings (same form, R_IN). In axis
 * coords, opening boundaries are w = ±a ± h(s), h(s) = ry·√(1-(s/R_IN)²);
 * the overlap spans w ∈ [a-h, -a+h], which exists while h(s) > a — a
 * vesica bounded by the back opening's near arc and the front opening's
 * far arc, meeting on the axis at s* = R_IN·√(1-(a/ry)²).
 */
function lensBodyPath(p: number): string {
  const theta = TAU * p;
  const a = Math.abs(EXTRUDE * Math.sin(theta));
  const cAbs = Math.abs(Math.cos(theta));

  const pts: string[] = [];
  const ryOut = R_OUT * cAbs;
  const sampleHullHalf = (centerSign: 1 | -1, tStart: number) => {
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = tStart + (Math.PI * i) / ARC_SEGMENTS;
      pts.push(pt(R_OUT * Math.cos(t), centerSign * a + ryOut * Math.sin(t)));
    }
  };
  sampleHullHalf(1, 0);
  sampleHullHalf(-1, Math.PI);
  let d = `M${pts.join("L")}Z`;

  const ryIn = R_IN * cAbs;
  if (ryIn > a) {
    const sMax = R_IN * Math.sqrt(1 - (a / ryIn) ** 2);
    const hole: string[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      // Near arc of the back opening, tip to tip.
      const s = sMax * Math.cos((Math.PI * i) / ARC_SEGMENTS);
      const h = ryIn * Math.sqrt(Math.max(0, 1 - (s / R_IN) ** 2));
      hole.push(pt(s, h - a));
    }
    for (let i = 1; i < ARC_SEGMENTS; i++) {
      // Far arc of the front opening, back to the start.
      const s = -sMax * Math.cos((Math.PI * i) / ARC_SEGMENTS);
      const h = ryIn * Math.sqrt(Math.max(0, 1 - (s / R_IN) ** 2));
      hole.push(pt(s, a - h));
    }
    d += ` M${hole.join("L")}Z`;
  }

  return d;
}

function buildSequence(progress: MotionValue<number>): AnimationSequence {
  return [[progress, [0, 1], { duration: DURATION, ease: "easeInOut" }]];
}

export const Search3DIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const progress = useMotionValue(0);
  const bodyRef = useRef<SVGPathElement>(null);
  const bodyHandleRef = useRef<SVGPathElement>(null);

  // Front face: squash by cosθ toward the axis, slide +EXTRUDE·sinθ along
  // its perpendicular. rotate(-45) maps that perpendicular onto the x-axis
  // so translateX/scaleX act there; rotate(45) maps back. translateX sits
  // left of scaleX so the slide itself is not squashed.
  const frontTransform = useTransform(progress, (p) => {
    const theta = TAU * p;
    const slide = (EXTRUDE * Math.sin(theta)).toFixed(4);
    const squash = Math.cos(theta).toFixed(4);
    return `rotate(-45deg) translateX(${slide}px) scaleX(${squash}) rotate(45deg)`;
  });

  const bodyD = useTransform(progress, lensBodyPath);
  useMotionValueEvent(bodyD, "change", (v) => {
    bodyRef.current?.setAttribute("d", v);
  });

  // Handle side wall: in-plane width foreshortens with cosθ while the
  // extruded depth grows with sinθ. STROKE at rest (the plain handle
  // stroke), the slab's 2·EXTRUDE edge-on. The round cap's radius grows
  // with the width, so the inner endpoint retreats outward by the same
  // amount — the cap's inner edge stays flush under the rim instead of
  // poking into the see-through lens.
  const bodyHandleAttrs = useTransform(progress, (p) => {
    const theta = TAU * p;
    const w =
      STROKE * Math.abs(Math.cos(theta)) +
      2 * EXTRUDE * Math.abs(Math.sin(theta));
    // Rest geometry: inner endpoint (16.7,16.7) = 5.7·√2 from center, cap
    // radius STROKE/2 ⇒ the cap edge sits at 5.7·√2 − STROKE/2. Keep that
    // reach fixed.
    const k = 5.7 * Math.SQRT2 - STROKE / 2 + w / 2;
    const e = (CX + k * Math.SQRT1_2).toFixed(3);
    return { width: w.toFixed(3), d: `M${e} ${e}L21 21` };
  });
  useMotionValueEvent(bodyHandleAttrs, "change", ({ width, d }) => {
    const el = bodyHandleRef.current;
    if (el) {
      el.setAttribute("stroke-width", width);
      el.setAttribute("d", d);
    }
  });

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      progress.jump(0);
      await animate(buildSequence(progress));
    },
    createScrubber() {
      progress.jump(0);
      return makeScrubber(
        () => animate(buildSequence(progress)),
        () => progress.jump(0),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="2 2 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* Extruded body: ring silhouette with a real see-through hole, plus
          the widened handle stroke. Solid currentColor — never shaded.
          At rest it coincides exactly with the glyph's own footprint. */}
      <g className="search3d-body">
        <path
          ref={bodyRef}
          d={lensBodyPath(0)}
          fill="currentColor"
          fillRule="evenodd"
          stroke="none"
        />
        <path ref={bodyHandleRef} d="m21 21-4.3-4.3" strokeWidth={STROKE} />
      </g>
      {/* Front face — the Lucide glyph itself, riding the projection. */}
      <motion.g
        className="search3d-glyph"
        style={{
          transform: frontTransform,
          transformOrigin: "50% 50%",
          transformBox: "fill-box",
        }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </motion.g>
    </svg>
  );
});

Search3DIcon.displayName = "Search3DIcon";
