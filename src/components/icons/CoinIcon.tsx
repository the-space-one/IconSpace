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
 * ANIMATION STORYBOARD — 3D coin spin around the dollar stem
 *
 *    0ms  coin rests face-on, plain flat glyph          (0°)
 * ~100ms  the rim's barrel swells; the face stays
 *         see-through around the $ (ring hole)          (→90°)
 * ~160ms  the through-hole squeezes shut — a coin
 *         edge-on is a solid slab                       (~80°)
 * ~175ms  edge-on: one solid slab, $ hidden inside      (90°)
 * ~350ms  the BACK face sweeps past with its own
 *         readable $ — coins are struck on both sides   (180°)
 * ~525ms  edge-on again                                 (270°)
 *  700ms  coin settles face-on, identical to rest       (360°)
 *
 * Solid-silhouette technique per docs/3D-ANIMATION.md — the
 * CSS-3D coin (front/back faces + side strip) is exactly the
 * approach that doc §1 rejects, so the 3D happens in math:
 *
 *   - axis: the VERTICAL line x = 9.75 — the circle center
 *     AND the $ stem lie on it, so the stem only spins in
 *     place, anchoring the motion (§2.1). u = x-axis, so no
 *     rotate() sandwich is needed around translateX/scaleX.
 *   - rim volume: the r=9 stroke (outer 9.75 / inner 8.25)
 *     extruded by 2·EXTRUDE, drawn per frame as ONE evenodd
 *     currentColor path — hull of the two face ellipses plus
 *     the vesica where the front and back openings overlap.
 *     The hole closes by geometry near edge-on: you cannot
 *     see through a coin's rim edge-on. No fades, no CSS 3D,
 *     no layer stacks, nothing to stripe or flicker.
 *   - TWO faces, like a real coin struck on both sides. The
 *     front glyph rides the front face (slide +E·sinθ,
 *     squash scaleX(cosθ)) and shows while cosθ ≥ 0; the
 *     back glyph rides the back face (slide −E·sinθ, squash
 *     scaleX(−cosθ) — pre-mirrored on the coin, so its
 *     projection reads a CORRECT $ while cosθ < 0). The
 *     hand-off happens exactly edge-on, where both faces
 *     are squashed to zero width flush against the solid
 *     slab's edges (same currentColor), so no seam and no
 *     inverted $ is ever visible. This is display gating at
 *     a geometrically degenerate instant, not an opacity
 *     crossfade — still deterministic per progress value.
 *
 * Everything derives from ONE progress value, so hover play
 * and the Scrub Lab pose the same pure function of time, and
 * rest is pixel-identical to the flat icon (§2.5).
 * ───────────────────────────────────────────────────────── */

const DURATION = 0.7;

/** Half-thickness of the coin, viewBox units. Edge-on slab = 2× this
 *  (2.5 on the 20-grid ≈ the doc's "≈3 on a 24-grid" rule). */
const EXTRUDE = 1.25;

/** Rim edges: r=9 circle with strokeWidth 1.5 ⇒ outer 9.75, inner 8.25. */
const R_OUT = 9.75;
const R_IN = 8.25;

/** Coin center; the $ stem (x=9.75) sits exactly on the vertical axis. */
const CX = 9.75;
const CY = 9.75;

/** Polyline samples per arc (chord error < 0.5px at 256px rendered). */
const ARC_SEGMENTS = 24;

const TAU = Math.PI * 2;

/** The flat icon: $ glyph + rim circle, exactly as provided. */
const GLYPH_D =
  "M9.75 13.75v-9.5m0 9.5h.182c1.28 0 2.318-.83 2.318-1.854 0-.702-.496-1.344-1.281-1.658L8.53 9.262c-.785-.314-1.281-.956-1.281-1.658v-.076c0-.982.995-1.778 2.222-1.778h.278c.925 0 1.733.402 2.165 1m-2.165 7c-.925 0-1.733-.402-2.166-1m2.166 1.5v1m9-5.5a9 9 0 1 1-18 0 9 9 0 0 1 18 0";

/** Axis coords → viewBox point: v = +y (along), u = +x (across). */
function pt(along: number, across: number): string {
  return `${(CX + across).toFixed(3)} ${(CY + along).toFixed(3)}`;
}

/**
 * Silhouette of the extruded rim as an evenodd pair of outlines
 * (Search3DIcon's lensBodyPath with a vertical axis).
 *
 * Solid: hull of the outer ellipses (semi-major R_OUT along y, semi-minor
 * R_OUT·|cosθ| along x, centers ±a·x̂ where a = EXTRUDE·|sinθ|). Ellipse
 * tangents at the ±y extremes point along x, so straight chords there
 * close the hull exactly.
 *
 * Hole: overlap of the two inner openings (same form, R_IN) — a vesica
 * bounded by the back opening's near arc and the front opening's far arc.
 * It exists only while R_IN·|cosθ| > a and closes into the solid slab
 * near edge-on, by geometry alone.
 */
function coinBodyPath(p: number): string {
  const theta = TAU * p;
  const a = Math.abs(EXTRUDE * Math.sin(theta));
  const cAbs = Math.abs(Math.cos(theta));

  const pts: string[] = [];
  const rxOut = R_OUT * cAbs;
  const sampleHullHalf = (centerSign: 1 | -1, tStart: number) => {
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = tStart + (Math.PI * i) / ARC_SEGMENTS;
      pts.push(pt(R_OUT * Math.cos(t), centerSign * a + rxOut * Math.sin(t)));
    }
  };
  sampleHullHalf(1, 0);
  sampleHullHalf(-1, Math.PI);
  let d = `M${pts.join("L")}Z`;

  const rxIn = R_IN * cAbs;
  if (rxIn > a) {
    const sMax = R_IN * Math.sqrt(1 - (a / rxIn) ** 2);
    const hole: string[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      // Near arc of the back opening, tip to tip.
      const s = sMax * Math.cos((Math.PI * i) / ARC_SEGMENTS);
      const h = rxIn * Math.sqrt(Math.max(0, 1 - (s / R_IN) ** 2));
      hole.push(pt(s, h - a));
    }
    for (let i = 1; i < ARC_SEGMENTS; i++) {
      // Far arc of the front opening, back to the start.
      const s = -sMax * Math.cos((Math.PI * i) / ARC_SEGMENTS);
      const h = rxIn * Math.sqrt(Math.max(0, 1 - (s / R_IN) ** 2));
      hole.push(pt(s, a - h));
    }
    d += ` M${hole.join("L")}Z`;
  }

  return d;
}

function buildSequence(progress: MotionValue<number>): AnimationSequence {
  return [[progress, [0, 1], { duration: DURATION, ease: "easeInOut" }]];
}

export const CoinIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const progress = useMotionValue(0);
  const bodyRef = useRef<SVGPathElement>(null);

  // Front face: squash by cosθ toward the axis, slide +EXTRUDE·sinθ along
  // its perpendicular (the x-axis — the axis is vertical, so no rotate
  // sandwich). translateX sits left of scaleX so the slide itself is not
  // squashed. fill-box center x = 9.75 lies on the axis (glyph bbox spans
  // 0.75 → 18.75), so the squash cannot drift sideways.
  const frontTransform = useTransform(progress, (p) => {
    const theta = TAU * p;
    const slide = (EXTRUDE * Math.sin(theta)).toFixed(4);
    const squash = Math.cos(theta).toFixed(4);
    return `translateX(${slide}px) scaleX(${squash})`;
  });
  // Back face: the coin's other side — offset the other way, pre-mirrored
  // (−cosθ) so its projection reads a correct $ while the back faces the
  // viewer. Shown only then; at the swap instant both faces are zero-width
  // lines hugging the slab's edges, so the hand-off cannot be seen.
  const backTransform = useTransform(progress, (p) => {
    const theta = TAU * p;
    const slide = (-EXTRUDE * Math.sin(theta)).toFixed(4);
    const squash = (-Math.cos(theta)).toFixed(4);
    return `translateX(${slide}px) scaleX(${squash})`;
  });

  // Face gating goes through refs, not a style MotionValue: Motion doesn't
  // flush non-animatable `display` strings to the DOM the way it does
  // transforms, so set it imperatively per progress change.
  const frontRef = useRef<SVGPathElement>(null);
  const backRef = useRef<SVGPathElement>(null);
  useMotionValueEvent(progress, "change", (p) => {
    const facingFront = Math.cos(TAU * p) >= 0;
    frontRef.current?.style.setProperty(
      "display",
      facingFront ? "inline" : "none",
    );
    backRef.current?.style.setProperty(
      "display",
      facingFront ? "none" : "inline",
    );
  });

  const bodyD = useTransform(progress, coinBodyPath);
  useMotionValueEvent(bodyD, "change", (v) => {
    bodyRef.current?.setAttribute("d", v);
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
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* Extruded rim: barrel silhouette with a real see-through hole.
          Solid currentColor — never shaded. At rest it coincides exactly
          with the rim stroke's own footprint and hides under it. */}
      <path
        ref={bodyRef}
        d={coinBodyPath(0)}
        fill="currentColor"
        fillRule="evenodd"
        stroke="none"
      />
      {/* Front face — the flat glyph itself, riding the projection. */}
      <motion.path
        ref={frontRef}
        d={GLYPH_D}
        style={{
          transform: frontTransform,
          transformOrigin: "50% 50%",
          transformBox: "fill-box",
        }}
      />
      {/* Back face — the coin's other side, its own readable $. Hidden at
          rest (display gated off progress); only one face ever shows. */}
      <motion.path
        ref={backRef}
        d={GLYPH_D}
        style={{
          display: "none",
          transform: backTransform,
          transformOrigin: "50% 50%",
          transformBox: "fill-box",
        }}
      />
    </svg>
  );
});

CoinIcon.displayName = "CoinIcon";
