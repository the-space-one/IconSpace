"use client";

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
 * ANIMATION STORYBOARD — a multi-turn spin, no tilt
 * (the meridians sweep west→east 360° — two 180° passes —
 * in one ease-in-out-quint gesture: long quiet wind-up, a
 * snappy multi-revolution whip through mid-flight, long
 * braking glide into the landing)
 *
 *    0ms  globe at rest: limb circle, two latitude chords,
 *         meridians at {-90°, -30°, +30°}          (frame 1)
 *  0-1500ms  meridians sweep 360°, never pausing  (frames 1-3)
 *  1500ms  360° is a multiple of the 60° meridian spacing, so
 *         the set maps onto itself → pixel-identical to rest,
 *         replays seamlessly
 *
 * Rebuilt from 7 user frames (frames/globe/) — NOT via the
 * frame parser: each frame is one filled path whose command
 * structure changes as meridians merge/split at the rim, so a
 * d-morph cannot represent a full spin (topology changes).
 * Instead, per ICON-SYSTEM §2 this is Class D-3:
 *
 * - SPIN (Class D-3): each meridian is a pole-to-pole half
 *   ellipse whose signed bulge is a = R·sin(longitude), the
 *   orthographic projection of a great circle. One `spin`
 *   motion value advances all longitudes by 360°; d strings
 *   are recomputed per frame (BookFlip/Search3D pattern), so
 *   playback and the Scrub Lab pose the same pure function of
 *   time. Wraps at ±90° are invisible: a meridian reaching
 *   the limb coincides exactly with the static limb circle,
 *   hides under its stroke, and re-emerges on the far side —
 *   ICON-SYSTEM loop strategy 3 (composition hand-off).
 * ───────────────────────────────────────────────────────── */

const DURATION = 1.5;

/** ease-in-out-quint: quieter ends, snappier whip mid-turn than quart. */
const EASE_IN_OUT_QUINT = [0.86, 0, 0.07, 1] as const;

const CX = 12;
const CY = 12;
const R = 10;

/** Cubic-Bézier circle constant: quarter-arc control-point offset. */
const KAPPA = 0.5523;

/**
 * Rest longitudes, uniformly 60° apart so any multiple-of-60° advance maps
 * the set onto itself. -90° sits exactly under the left limb at rest, so the
 * visible rest glyph is the limb + two meridians at ±30° (bulge ±R/2) —
 * matching the density of frame 1.
 */
const MERIDIAN_LONGITUDES = [-90, -30, 30];
/** Total sweep: two 180° passes, so the globe visibly turns ~2×. */
const SPIN_DEGREES = 360;

/** Latitude chords y = CY ± 3, clipped to the sphere: half-width √(R²-3²). */
const LAT_DY = 3;
const LAT_HALF = Math.sqrt(R * R - LAT_DY * LAT_DY);

/** Keep longitude in [-90°, 90°): the front-facing half of the sphere. */
function wrapLongitude(deg: number): number {
  return ((((deg + 90) % 180) + 180) % 180) - 90;
}

/**
 * Pole-to-pole meridian at `longitude`, as a half ellipse with signed
 * horizontal semi-axis a = R·sin(longitude). Always M C C — the command
 * structure never changes, so scrub seeks land on valid geometry.
 */
function meridianD(longitude: number): string {
  const a = R * Math.sin((longitude * Math.PI) / 180);
  const bulgeX = (CX + a).toFixed(3);
  const ctrlX = (CX + KAPPA * a).toFixed(3);
  const ctrlDY = (KAPPA * R).toFixed(3);
  const top = CY - R;
  const bottom = CY + R;
  return (
    `M${CX} ${top}` +
    `C${ctrlX} ${top} ${bulgeX} ${CY - Number(ctrlDY)} ${bulgeX} ${CY}` +
    `C${bulgeX} ${CY + Number(ctrlDY)} ${ctrlX} ${bottom} ${CX} ${bottom}`
  );
}

function buildSequence(spin: MotionValue<number>): AnimationSequence {
  return [[spin, [0, 1], { duration: DURATION, ease: [...EASE_IN_OUT_QUINT] }]];
}

export const GlobeSpinIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const spin = useMotionValue(0);
  const meridianRefs = useRef<(SVGPathElement | null)[]>([]);

  const meridianDs = useTransform(spin, (p) =>
    MERIDIAN_LONGITUDES.map((lon) =>
      meridianD(wrapLongitude(lon + SPIN_DEGREES * p)),
    ),
  );
  useMotionValueEvent(meridianDs, "change", (ds) => {
    ds.forEach((d, i) => meridianRefs.current[i]?.setAttribute("d", d));
  });

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      spin.jump(0);
      await animate(buildSequence(spin));
    },
    createScrubber() {
      spin.jump(0);
      return makeScrubber(
        () => animate(buildSequence(spin)),
        // Sequence cancel restores DOM attributes, but the motion value
        // keeps its last scrubbed value; reset so meridians recompute
        // back to the rest pose.
        () => spin.jump(0),
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
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      <circle cx={CX} cy={CY} r={R} />
      {/* Latitude circles project to fixed chords under a polar spin. */}
      <path
        d={`M${(CX - LAT_HALF).toFixed(3)} ${CY - LAT_DY}H${(CX + LAT_HALF).toFixed(3)}`}
      />
      <path
        d={`M${(CX - LAT_HALF).toFixed(3)} ${CY + LAT_DY}H${(CX + LAT_HALF).toFixed(3)}`}
      />
      {/* Meridians: d is driven imperatively from the spin motion value. */}
      {MERIDIAN_LONGITUDES.map((lon, i) => (
        <path
          key={lon}
          ref={(el) => {
            meridianRefs.current[i] = el;
          }}
          d={meridianD(lon)}
        />
      ))}
    </svg>
  );
});

GlobeSpinIcon.displayName = "GlobeSpinIcon";
