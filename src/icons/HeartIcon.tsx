import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  motion,
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
 * ANIMATION STORYBOARD — 3D heart spin around the centre
 * vertical axis
 *
 *    0ms  heart rests face-on, plain flat glyph          (0°)
 * ~100ms  the outline's barrel swells sideways; the
 *         hollow inside stays see-through                (→90°)
 * ~145ms  the cleft between the lobes pinches shut — a
 *         notch that shallow cannot survive the turn    (~74°)
 * ~159ms  the hollow closes too: you cannot see through
 *         the rim of anything this near edge-on         (~82°)
 * ~175ms  edge-on: one solid slab, 2·EXTRUDE wide        (90°)
 * ~350ms  the rear sweeps past — a heart is symmetric
 *         about this axis, so the back reads as the
 *         same heart, no mirrored glyph needed          (180°)
 * ~525ms  edge-on again                                 (270°)
 *  700ms  settles face-on, identical to rest            (360°)
 *
 * OVER ALL OF IT, A BEAT: the glyph swells to 1.14 and
 * settles back, on HomeDoorIcon's POP spring (see
 * POP_CURVE). It peaks at ~185ms, right as the heart
 * turns edge-on, so the swell reads as the impulse that
 * threw it into the spin rather than a separate wobble;
 * it undershoots to 0.98 around 478ms and is home to
 * exactly 1 by 700ms, landing with the turn.
 *
 * Uniform scale, so it cannot fight the projection: the
 * squash below is scaleX only, and a uniform swell on top
 * changes the heart's SIZE without touching how far round
 * it reads as having turned.
 *
 * Solid-silhouette technique per docs/3D-ANIMATION.md, on
 * CoinIcon's VERTICAL axis (x = CX). The heart's face is a
 * RIBBON — a closed stroke with a hollow middle — so it has
 * the same "outer outline + through-hole" structure the coin
 * rim has. What it does NOT have is a circle's closed form:
 * there is no hull-of-two-ellipses and no vesica to solve, so
 * the two contours are baked as ROW PROFILES instead (see
 * below) and the per-frame silhouette is 1D morphology on
 * them:
 *
 *   solid = outer contour DILATED  by a  (union over depth)
 *   hole  = inner contour ERODED   by a  (what both the front
 *           and the back opening let you see through)
 *
 * Per row that is just [l−a, r+a] and [l+a, r−a] — the exact
 * same rule the coin's hull/vesica pair is a special case of.
 * Both close by geometry: the cleft when the notch is
 * narrower than 2a, the hole when the ribbon's opening is.
 * No fades, no CSS 3D, no layer stacks, no crossfades.
 *
 * ONE FACE, not two. §2.2's signed cosθ mirrors the glyph
 * past 90° on its own, and a heart mirrored about its own
 * vertical axis is the same heart — so unlike the coin's $
 * there is nothing to pre-mirror and no face to gate.
 *
 * Everything derives from ONE progress value, so hover play
 * and the Scrub Lab pose the same pure function of time, and
 * rest is pixel-identical to the flat icon (§2.5).
 * ───────────────────────────────────────────────────────── */

const DURATION = 0.7;

/** Half-thickness of the heart, viewBox units. Edge-on slab = 2× this
 *  (2.2 on this 19-grid ≈ the doc's "≈3 on a 24-grid" rule). */
const EXTRUDE = 1.1;

const STROKE = 1.5;

/** The rotation axis: the heart's own vertical centre line. */
const CX = 8.8616;

const TAU = Math.PI * 2;

/**
 * The glyph, symmetrised about x = CX. The drawing as supplied sat 0.31
 * units lower on its right shoulder than its left; every mirror pair is
 * averaged here (a ≤0.16-unit move, invisible at icon sizes) so that the
 * axis is a true axis of symmetry. Everything below — the mirrored halves
 * of the silhouette, the notch closing ON the axis, the back face reading
 * as the same heart — depends on that.
 */
const HEART_D =
  "M0.8616 6.2217C1.6536 9.7854 6.4306 15.449 8.7903 17.9879" +
  "C8.8298 18.0304 8.8934 18.0304 8.9329 17.9879" +
  "C11.2926 15.449 16.0696 9.7854 16.8616 6.2217" +
  "C17.8515 1.767 11.9818 -1.8617 8.9532 3.4009" +
  "C8.9137 3.4695 8.8095 3.4695 8.77 3.4009" +
  "C5.7414 -1.8617 -0.1283 1.767 0.8616 6.2217Z";

/**
 * Row profiles of the flat glyph's two contours, right half only (the left
 * half is the mirror). Each entry is [y, distance from the axis], ordered
 * top → bottom, adaptively sampled so the chord error stays under 0.01
 * units — derived from HEART_D by scripts/heart3d-profile.mjs, which scans
 * the stroke region row by row rather than offsetting the curve (naive
 * offsetting self-intersects at the cleft and at the point).
 *
 * FLANK = the outward-facing side, apex of a lobe → the point.
 * NOTCH = the cleft's wall, apex of a lobe → where the two walls meet.
 * Above the cleft every row is two intervals; below it, one.
 */
type Profile = ReadonlyArray<readonly [number, number]>;

const OUTER_FLANK: Profile = [
  [0.047, 3.925], [0.083, 4.492], [0.12, 4.726], [0.193, 5.056], [0.339, 5.517],
  [0.486, 5.866], [0.632, 6.154], [0.924, 6.623], [1.217, 7.002], [1.51, 7.318],
  [1.802, 7.589], [2.095, 7.823], [2.387, 8.025], [2.68, 8.2], [2.972, 8.351],
  [3.557, 8.589], [4.142, 8.748], [4.728, 8.838], [5.313, 8.86], [5.898, 8.817],
  [6.483, 8.709], [7.068, 8.545], [7.653, 8.336], [8.238, 8.089], [8.823, 7.81],
  [9.408, 7.504], [10.578, 6.822], [11.749, 6.062], [12.919, 5.238],
  [14.089, 4.36], [15.259, 3.432], [16.429, 2.458], [17.6, 1.438],
  [18.185, 0.91], [18.477, 0.64], [18.623, 0.475], [18.697, 0.344],
  [18.733, 0.246], [18.77, 0],
];

const OUTER_NOTCH: Profile = [
  [0.047, 3.925], [0.08, 3.386], [0.114, 3.165], [0.18, 2.854], [0.314, 2.421],
  [0.447, 2.095], [0.581, 1.825], [0.848, 1.384], [1.115, 1.025],
  [1.381, 0.719], [1.648, 0.451], [2.182, 0],
];

const INNER_FLANK: Profile = [
  [1.547, 3.925], [1.577, 4.343], [1.607, 4.516], [1.667, 4.76], [1.788, 5.101],
  [1.908, 5.359], [2.028, 5.573], [2.269, 5.919], [2.51, 6.196], [2.751, 6.426],
  [2.991, 6.62], [3.232, 6.785], [3.473, 6.924], [3.955, 7.138], [4.436, 7.277],
  [4.918, 7.349], [5.399, 7.357], [5.881, 7.303], [6.362, 7.191],
  [6.844, 7.037], [7.325, 6.85], [7.807, 6.636], [8.288, 6.4], [9.251, 5.87],
  [10.215, 5.278], [11.178, 4.635], [12.141, 3.949], [13.104, 3.225],
  [14.067, 2.467], [15.03, 1.676], [15.993, 0.854], [16.956, 0],
];

const INNER_NOTCH: Profile = [
  [1.547, 3.925], [1.588, 3.44], [1.63, 3.241], [1.713, 2.964], [1.879, 2.58],
  [2.045, 2.293], [2.211, 2.057], [2.543, 1.675], [2.875, 1.367],
  [3.207, 1.108], [3.538, 0.884], [3.87, 0.678], [4.036, 0.508],
  [4.119, 0.369], [4.161, 0.264], [4.202, 0],
];

/** Row where the inner contour's two notch walls meet; below it the hole is
 *  a single interval and the notch stops cutting into it. */
const INNER_CLEFT_Y = INNER_NOTCH[INNER_NOTCH.length - 1][0];

/** Linear read of a profile at an arbitrary row (profiles are y-monotone). */
function profileAt(prof: Profile, y: number): number {
  if (y <= prof[0][0]) return prof[0][1];
  const last = prof[prof.length - 1];
  if (y >= last[0]) return last[1];
  let lo = 0;
  let hi = prof.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (prof[mid][0] <= y) lo = mid;
    else hi = mid;
  }
  const [y0, x0] = prof[lo];
  const [y1, x1] = prof[hi];
  return y1 === y0 ? x1 : x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
}

/* ── The beat ─────────────────────────────────────────────────────────────
 * HomeDoorIcon's POP, borrowed whole: spring(visualDuration 0.26, bounce 0.46)
 * driven to PEAK. There the house pops as its door swings; here the heart
 * swells as it turns away and has settled by the time it lands face-on.
 *
 * BAKED, NOT ANIMATED. Everything in this icon is a pure function of
 * `progress` — that is what lets hover play and the Scrub Lab share one
 * definition. A live spring cannot join that sequence (its duration is
 * derived, not declared), so it would need its own animate() call plus a
 * hand-synced keyframe twin for scrubbing, and those two drift — it is what
 * made BookmarkIcon's book react a beat late. So the spring is sampled off
 * Motion's own generator by scripts/heart-pop-curve.mjs and read back as a
 * table, which keeps the pop seekable for free and rest exactly 1.
 *
 * Same shape as the silhouette profiles above and read the same way, so
 * profileAt does the work — it is just a linear read of a monotone table, and
 * progress is monotone. Here the pair is [progress, scale] rather than
 * [row, distance]. Linear reads land within 0.0013 of the real spring, 0.12%
 * of scale.
 */
const POP_CURVE: Profile = [
  [0.0, 1.0], [0.0186, 1.0044], [0.04, 1.0179], [0.0614, 1.0371], [0.1243, 1.1001],
  [0.1457, 1.118], [0.1671, 1.1327], [0.19, 1.1444], [0.2129, 1.1523], [0.2371, 1.157],
  [0.2643, 1.1587], [0.3157, 1.155], [0.4243, 1.1417], [0.4371, 1.1377], [0.4514, 1.1294],
  [0.4686, 1.1154], [0.5343, 1.0486], [0.5671, 1.0201], [0.6029, 0.9981], [0.64, 0.9854],
  [0.6657, 0.9817], [0.6957, 0.9813], [0.8657, 1.0001], [1.0, 1.0],
];

/** Centre of the glyph's box in viewBox units — CX is the axis by
 *  construction, and the profiles span y 0.047 → 18.77. The swell grows from
 *  here, so it cannot drift sideways off the spin axis. */
const POP_ORIGIN = `${CX}px 9.41px`;

const pt = (x: number, y: number) => `${x.toFixed(3)} ${y.toFixed(3)}`;

/**
 * Silhouette of the extruded heart as an evenodd pair of outlines.
 *
 * Solid: the outer contour swept ±a sideways. Traced up the right flank,
 * across the lobe apex (dilating a horizontal-tangent point inserts a 2a
 * bridge — that IS the apex cap), down the cleft's right wall, across the
 * cleft, and back up the mirror. Clamping the walls at the axis is what
 * closes the cleft: they cannot cross, they meet.
 *
 * Hole: the inner contour eroded by a — per row [l+a, r−a], the overlap of
 * the front and back openings. It is bounded by the flank on the outside
 * and by the cleft wall (or the axis, below the cleft) on the inside, and
 * exists only on rows where the first still clears the second. That test
 * is what erases the lobe caps first and the point last, and finally the
 * whole hole a few degrees before edge-on — you cannot see through the
 * heart's rim when it is turned that far.
 */
function heartBodyPath(p: number): string {
  const theta = TAU * p;
  const a = Math.abs(EXTRUDE * Math.sin(theta));
  const c = Math.abs(Math.cos(theta));

  const solid: string[] = [];
  for (let i = OUTER_FLANK.length - 1; i >= 0; i--) {
    const [y, x] = OUTER_FLANK[i];
    solid.push(pt(CX + x * c + a, y));
  }
  // The cleft, dilated: each wall moves a toward the axis, and where that
  // would carry them past each other they simply meet. The row they meet on
  // is interpolated in rather than clamped at whichever profile rows happen
  // to bracket it — clamping alone leaves the notch a sliver too deep, and
  // the rear of the glyph shows through the gap.
  const wall: Array<[number, number]> = [];
  for (const [y, x] of OUTER_NOTCH) {
    const w = x * c - a;
    if (w > 0) {
      wall.push([y, w]);
      continue;
    }
    const prev = wall[wall.length - 1];
    wall.push(
      prev ? [prev[0] + (prev[1] / (prev[1] - w)) * (y - prev[0]), 0] : [y, 0],
    );
    break;
  }
  for (const [y, w] of wall) solid.push(pt(CX + w, y));
  // The row the walls meet on sits ON the axis, so it is its own mirror.
  for (let i = wall.length - 2; i >= 0; i--) {
    solid.push(pt(CX - wall[i][1], wall[i][0]));
  }
  for (const [y, x] of OUTER_FLANK) solid.push(pt(CX - (x * c + a), y));
  const d = `M${solid.join("L")}Z`;

  const holeFar = (y: number) => profileAt(INNER_FLANK, y) * c - a;
  const holeNear = (y: number) =>
    y <= INNER_CLEFT_Y ? profileAt(INNER_NOTCH, y) * c + a : 0;
  const open = (y: number) => holeFar(y) - holeNear(y) > 0;

  let first = -1;
  for (let i = 0; i < INNER_FLANK.length; i++) {
    if (open(INNER_FLANK[i][0])) {
      first = i;
      break;
    }
  }
  if (first < 0) return d; // turned far enough that nothing shows through

  let last = INNER_FLANK.length - 1;
  while (last > first && !open(INNER_FLANK[last][0])) last--;

  // Where the two bounds cross: the row the hole opens on / closes on.
  const edge = (yOpen: number, yShut: number) => {
    for (let i = 0; i < 20; i++) {
      const mid = (yOpen + yShut) / 2;
      if (open(mid)) yOpen = mid;
      else yShut = mid;
    }
    return yOpen;
  };
  const yTop =
    first === 0
      ? INNER_FLANK[0][0]
      : edge(INNER_FLANK[first][0], INNER_FLANK[first - 1][0]);
  const yBot =
    last === INNER_FLANK.length - 1
      ? INNER_FLANK[last][0]
      : edge(INNER_FLANK[last][0], INNER_FLANK[last + 1][0]);

  const hole: string[] = [pt(CX + holeFar(yTop), yTop)];
  for (let i = first; i <= last; i++) {
    const y = INNER_FLANK[i][0];
    hole.push(pt(CX + holeFar(y), y));
  }
  hole.push(pt(CX + holeFar(yBot), yBot));
  for (let i = last; i >= first; i--) {
    const y = INNER_FLANK[i][0];
    hole.push(pt(CX - holeFar(y), y));
  }
  hole.push(pt(CX - holeFar(yTop), yTop));
  if (yTop < INNER_CLEFT_Y - 1e-6) {
    // The cleft still bites into the hole: down one wall, across, up the other.
    const walls = INNER_NOTCH.filter(([y]) => y > yTop);
    for (const [y] of walls) hole.push(pt(CX - holeNear(y), y));
    for (let i = walls.length - 1; i >= 0; i--) {
      const y = walls[i][0];
      hole.push(pt(CX + holeNear(y), y));
    }
  }
  return `${d} M${hole.join("L")}Z`;
}

function buildSequence(progress: MotionValue<number>): AnimationSequence {
  return [[progress, [0, 1], { duration: DURATION, ease: "easeInOut" }]];
}

export const HeartIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const bodyRef = useRef<SVGPathElement>(null);

  // Front face: squash by cosθ toward the axis, slide +EXTRUDE·sinθ along its
  // perpendicular (the x-axis — the axis is vertical, so no rotate sandwich).
  // translateX sits left of scaleX so the slide is not itself squashed. The
  // fill-box centre is x = CX by construction (the glyph is symmetrised about
  // the axis), so the squash cannot drift sideways.
  const frontTransform = useTransform(progress, (p) => {
    const theta = TAU * p;
    const slide = (EXTRUDE * Math.sin(theta)).toFixed(4);
    const squash = Math.cos(theta).toFixed(4);
    return `translateX(${slide}px) scaleX(${squash})`;
  });

  // The beat, read straight off the baked spring — same progress, so it can
  // never fall out of step with the turn.
  const popScale = useTransform(progress, (p) => profileAt(POP_CURVE, p));

  const bodyD = useTransform(progress, heartBodyPath);
  useMotionValueEvent(bodyD, "change", (v) => {
    bodyRef.current?.setAttribute("d", v);
  });

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
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
      width="18"
      height="19"
      viewBox="0 0 18 19"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      // The barrel swells a hair past the box at its widest turn.
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* The beat. Body and face swell together, so the pop scales the whole
          turning heart rather than sliding the face off its own silhouette.
          transformOrigin lives in `initial` because Motion overrides a
          style-set origin on SVG with its centred default, and view-box units
          keep it on the spin axis — same wiring as HomeDoorIcon's pop. */}
      <motion.g
        initial={{ transformOrigin: POP_ORIGIN }}
        style={{ scale: popScale, transformBox: "view-box" }}
      >
        {/* Extruded body: the outline's silhouette with a real see-through
            hole. Solid currentColor — never shaded. At rest it coincides with
            the glyph's own stroke footprint and hides under it. */}
        <path
          ref={bodyRef}
          d={heartBodyPath(0)}
          fill="currentColor"
          fillRule="evenodd"
          stroke="none"
        />
        {/* Front face — the flat glyph itself, riding the projection. */}
        <motion.path
          d={HEART_D}
          style={{
            transform: frontTransform,
            transformOrigin: "50% 50%",
            transformBox: "fill-box",
          }}
        />
      </motion.g>
    </svg>
  );
});

HeartIcon.displayName = "HeartIcon";
