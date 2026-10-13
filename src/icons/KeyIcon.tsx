import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
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
 * ANIMATION STORYBOARD — 3D key spin around the shaft, then
 * a push into the lock
 *
 *    0ms  key rests face-on, plain flat glyph            (0°)
 * ~100ms  the bow's barrel swells out; the hole stays
 *         see-through, teeth start foreshortening       (→90°)
 * ~160ms  the through-hole squeezes shut — you can't
 *         see through a ring edge-on                    (~78°)
 * ~175ms  edge-on: one solid slab, teeth folded away     (90°)
 * ~350ms  the far side sweeps past — the teeth now
 *         point the OTHER way, as a real key's would    (180°)
 * ~525ms  edge-on again                                 (270°)
 *  700ms  key settles face-on — identical to rest       (360°)
 * ~880ms  spin done, the whole key SLIDES tip-first
 *         along its own shaft — it goes into the lock
 * 1180ms  it eases back home with a small recoil past
 *         rest, and lands exactly on the rest pose
 *
 * Solid-silhouette technique per docs/3D-ANIMATION.md — no CSS
 * 3D, no layer stacks, no crossfades. The 3D happens in math and
 * only the resulting 2D outline is drawn:
 *
 *   - axis: the SHAFT, running from the bow's centre (4.269,
 *     12.099) out to the tip (15.145, 0.75) at −46.219°. The
 *     bow is centred on it and both teeth are rooted on it, so
 *     the shaft only spins in place and anchors the motion.
 *   - bow volume: the r=3.588 stroke (outer 4.338 / inner
 *     2.838) extruded by 2·EXTRUDE, drawn per frame as ONE
 *     evenodd currentColor path — hull of the two face ellipses
 *     plus the vesica where the front and back openings overlap.
 *     The hole closes by geometry near edge-on.
 *   - shaft: an on-axis rod, so its extrusion is just its stroke
 *     widened to 1.5·|cosθ| + 2·EXTRUDE·|sinθ| — 1.5 at rest,
 *     exactly the slab's 2·EXTRUDE edge-on. Its inner endpoint
 *     retreats as the round cap grows so the cap edge keeps a
 *     constant reach and never nubs into the bow's opening.
 *   - teeth: rods PERPENDICULAR to the axis, so the offset
 *     between their two faces runs along their own length —
 *     the hull is the same rod with each end pushed out by the
 *     face offset, not a wider one. Their length foreshortens
 *     with cosθ and flips sign past 90°, which is what puts the
 *     teeth on the far side of the shaft through the back half
 *     of the turn. Edge-on they collapse flush into the shaft
 *     slab: a key seen down its own blade shows no teeth.
 *
 * Everything derives from ONE spin value plus ONE nudge value
 * through pure functions, so hover playback and the Scrub Lab
 * pose the same function of time, and rest is pixel-identical
 * to the flat glyph (§2.5). 360° == 0° keeps the loop invisible,
 * and the nudge returns to 0, so the key ends where it started.
 * ───────────────────────────────────────────────────────── */

/** Full turn around the shaft. */
const SPIN_DURATION = 0.7;
/** The push into the lock, and the eased return home. */
const PUSH_DURATION = 0.18;
const SETTLE_DURATION = 0.3;
/** How far the key travels tip-first, viewBox units. */
const NUDGE = 1.6;

/** Snap out fast, then coast (easeOutQuint). */
const PUSH_EASE = [0.22, 1, 0.36, 1] as const;
/** Come home with a small recoil just past rest, then settle. */
const SETTLE_EASE = [0.34, 1.25, 0.64, 1] as const;

/** Half-thickness of the key, viewBox units. Edge-on slab = 2× this
 *  (2.1 on the 17-grid ≈ the doc's "≈3 on a 24-grid" rule). */
const EXTRUDE = 1.05;

const STROKE = 1.5;
/** Round-cap radius — half the stroke, and constant through the turn. */
const CAP = STROKE / 2;

/** Bow centre and radius, least-squares fitted to the authored glyph. */
const CX = 4.2693;
const CY = 12.0986;
const R = 3.5876;

/** Bow edges: the r=3.588 centreline with strokeWidth 1.5. */
const R_OUT = R + CAP;
const R_IN = R - CAP;

/** Axis direction v (bow centre → tip); u = its screen perpendicular. */
const VX = 0.691898;
const VY = -0.721996;
const UX = -VY;
const UY = VX;

/** Angle that maps u onto the x-axis, for the rotate sandwich. */
const U_ANGLE_DEG = 43.781;

/** Shaft tip, as a distance along the axis from the bow centre. */
const TIP_S = 15.7183;

/** Teeth: where each is rooted on the axis, and how far out it reaches. */
const TEETH = [
  { s: 13.237, len: 3.2161 },
  { s: 8.5984, len: 2.2162 },
] as const;

/** Polyline samples per arc (chord error < 0.5px at 256px rendered). */
const ARC_SEGMENTS = 24;

const TAU = Math.PI * 2;

/** Axis coords → viewBox point: `along` runs down v, `across` down u. */
function pt(along: number, across: number): string {
  const x = CX + VX * along + UX * across;
  const y = CY + VY * along + UY * across;
  return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

/**
 * Silhouette of the extruded bow as an evenodd pair of outlines
 * (Search3DIcon's lensBodyPath with this key's axis and radii).
 *
 * Solid: hull of the outer ellipses (semi-major R_OUT along v, semi-minor
 * R_OUT·|cosθ| along u, centres ±a·u where a = EXTRUDE·|sinθ|). Ellipse
 * tangents at the ±v extremes point along u, so straight chords there close
 * the hull exactly.
 *
 * Hole: overlap of the two inner openings (same form, R_IN) — a vesica
 * bounded by the back opening's near arc and the front opening's far arc.
 * It exists only while R_IN·|cosθ| > a and closes into the solid slab near
 * edge-on, by geometry alone. No fade, ever.
 */
function bowBodyPath(p: number): string {
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

/**
 * The shaft, an on-axis rod: the hull of its two offset copies is the same
 * stroke widened, because the offset is perpendicular to the stroke. 1.5 at
 * rest (the plain shaft), exactly the slab's 2·EXTRUDE edge-on.
 *
 * The round cap's radius grows with the width, so the inner endpoint retreats
 * outward by the same amount — the cap edge stays parked at R_IN, flush with
 * the bow's opening, instead of poking into the see-through hole.
 */
function shaftAttrs(p: number) {
  const theta = TAU * p;
  const width =
    STROKE * Math.abs(Math.cos(theta)) +
    2 * EXTRUDE * Math.abs(Math.sin(theta));
  return {
    width: width.toFixed(3),
    d: `M${pt(R_IN + width / 2, 0)}L${pt(TIP_S, 0)}`,
  };
}

/**
 * The teeth, rods perpendicular to the axis. Their faces are offset along u —
 * which is their OWN direction — so the hull is the rod with both ends pushed
 * out by a, never a wider rod: stroke-width stays 1.5 all the way round.
 *
 * A tooth's outer boundary spans u ∈ [min(0,L·c) − CAP·|c| − a,
 * max(0,L·c) + CAP·|c| + a]; the drawn endpoints are that inset by the
 * constant CAP the round caps add back. At rest this is exactly [0, L], the
 * flat glyph's own tooth. Edge-on it is ±(EXTRUDE − CAP), whose caps reach
 * ±EXTRUDE — flush inside the shaft slab, so the teeth vanish into the blade
 * rather than sprouting nubs.
 */
function teethPath(p: number): string {
  const theta = TAU * p;
  const a = Math.abs(EXTRUDE * Math.sin(theta));
  const c = Math.cos(theta);
  const capReach = CAP * Math.abs(c);
  return TEETH.map(({ s, len }) => {
    const reach = len * c;
    const lo = Math.min(0, reach) - capReach - a + CAP;
    const hi = Math.max(0, reach) + capReach + a - CAP;
    return `M${pt(s, lo)}L${pt(s, hi)}`;
  }).join("");
}

/**
 * Where the front face sits: squash by cosθ toward the axis, then slide
 * EXTRUDE·sinθ along its perpendicular. rotate(U_ANGLE) maps that
 * perpendicular onto the x-axis so the translate/scale act there, and
 * rotate(−U_ANGLE) maps back; the translate sits outside the scale so the
 * slide itself is not squashed.
 *
 * This is a user-space transform ATTRIBUTE, not a CSS transform, and that is
 * deliberate. A CSS transform needs `transform-origin` to sit ON the rotation
 * axis or the squash drags the glyph sideways out of the silhouette — and the
 * origin cannot be trusted here. Motion normalises `transform-origin` to
 * `50% 50%`, which under `transform-box: view-box` is (8.5, 8.5): 0.565 units
 * off this key's axis, enough to tear the front face clean out of the body and
 * show background through the seam. Baking the centre into the matrix leaves
 * no origin to get wrong. Search3DIcon can use the CSS form only because its
 * fill-box centre (12,12) happens to land on its y = x axis.
 */
function glyphTransform(p: number): string {
  const theta = TAU * p;
  const slide = (EXTRUDE * Math.sin(theta)).toFixed(4);
  const squash = Math.cos(theta).toFixed(4);
  return (
    `translate(${CX} ${CY})rotate(${U_ANGLE_DEG})translate(${slide} 0)` +
    `scale(${squash} 1)rotate(${-U_ANGLE_DEG})translate(${-CX} ${-CY})`
  );
}

/** The push into the lock: the whole key travels tip-first along its shaft. */
function nudgeTransform(n: number): string {
  return `translate(${(NUDGE * VX * n).toFixed(4)} ${(NUDGE * VY * n).toFixed(4)})`;
}

function buildSequence(
  spin: MotionValue<number>,
  nudge: MotionValue<number>,
): AnimationSequence {
  return [
    [spin, [0, 1], { duration: SPIN_DURATION, ease: "easeInOut" }],
    [nudge, [0, 1], { duration: PUSH_DURATION, ease: [...PUSH_EASE] }],
    [nudge, [1, 0], { duration: SETTLE_DURATION, ease: [...SETTLE_EASE] }],
  ];
}

export const KeyIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const spin = useMotionValue(0);
  const nudge = useMotionValue(0);
  const bowRef = useRef<SVGPathElement>(null);
  const shaftRef = useRef<SVGPathElement>(null);
  const teethRef = useRef<SVGPathElement>(null);
  const glyphRef = useRef<SVGGElement>(null);
  const nudgeRef = useRef<SVGGElement>(null);

  // Every moving part goes through the same imperative attribute write, so the
  // front face can never land a frame out of step with the body it rides on.
  const glyphT = useTransform(spin, glyphTransform);
  useMotionValueEvent(glyphT, "change", (v) => {
    glyphRef.current?.setAttribute("transform", v);
  });

  const nudgeT = useTransform(nudge, nudgeTransform);
  useMotionValueEvent(nudgeT, "change", (v) => {
    nudgeRef.current?.setAttribute("transform", v);
  });

  const bowD = useTransform(spin, bowBodyPath);
  useMotionValueEvent(bowD, "change", (v) => {
    bowRef.current?.setAttribute("d", v);
  });

  const shaft = useTransform(spin, shaftAttrs);
  useMotionValueEvent(shaft, "change", ({ width, d }) => {
    const el = shaftRef.current;
    if (el) {
      el.setAttribute("stroke-width", width);
      el.setAttribute("d", d);
    }
  });

  const teethD = useTransform(spin, teethPath);
  useMotionValueEvent(teethD, "change", (v) => {
    teethRef.current?.setAttribute("d", v);
  });

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      spin.jump(0);
      nudge.jump(0);
      await animate(buildSequence(spin, nudge));
    },
    createScrubber() {
      spin.jump(0);
      nudge.jump(0);
      return makeScrubber(
        () => animate(buildSequence(spin, nudge)),
        () => {
          spin.jump(0);
          nudge.jump(0);
        },
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="17"
      height="17"
      viewBox="0 0 17 17"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      <g ref={nudgeRef} transform={nudgeTransform(0)}>
        {/* Extruded body: the bow's silhouette with a real see-through hole,
            plus the widened shaft and the swept teeth. Solid currentColor —
            never shaded. At rest it coincides exactly with the glyph's own
            footprint and hides under it. */}
        <g className="key-body">
          <path
            ref={bowRef}
            d={bowBodyPath(0)}
            fill="currentColor"
            fillRule="evenodd"
            stroke="none"
          />
          <path ref={shaftRef} d={shaftAttrs(0).d} strokeWidth={STROKE} />
          <path ref={teethRef} d={teethPath(0)} />
        </g>
        {/* Front face — the flat glyph itself, riding the projection. */}
        <g className="key-glyph" ref={glyphRef} transform={glyphTransform(0)}>
          <circle cx={CX} cy={CY} r={R} />
          <path d="M6.752 9.508 15.145 0.75M13.428 2.542 15.75 4.767M10.219 5.891 11.819 7.424" />
        </g>
      </g>
    </svg>
  );
});

KeyIcon.displayName = "KeyIcon";
