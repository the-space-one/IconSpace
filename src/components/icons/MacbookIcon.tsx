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

/* ─────────────────────────────────────────────
 * ANIMATION STORYBOARD — MacBook lid, 3D close + reopen
 *
 *    0ms  lid fully open (rest)
 *  425ms  lid tilted 46° TOWARD the viewer — the fully-closed peak
 *         (top edge dips to y≈6.3, a touch deeper than the user's
 *         snapshot pose per their follow-up), ease-in-out-cubic
 *         (the reference's closeEase)
 *  900ms  lid swings back up open, soft landing at rest
 *         (ease-out-quint — the reference's openEase)
 * ─────────────────────────────────────────────
 * Keyframes start and end at 0, so every replay lands pixel-identical
 * to the open rest pose.
 *
 * Per 3D-ANIMATION.md the 3D happens in MATH, not CSS: one `progress`
 * motion value rotates the lid plane about the hinge line and projects
 * every outline point through a perspective divide, recomputing the
 * lid's `d` each frame (the GlobeSpin/Search3D pattern). A plain scaleY
 * cannot do this — it keeps the lid full-width (window-blind flat);
 * the widening + downward sweep is what reads as a real close.
 */

/**
 * The source art is ONE filled path (lid + base merged). It is split at
 * the hinge (y = 10.9043) so the lid can fold independently; the two
 * halves share that edge, so at rest they render exactly like the
 * original. Each half keeps its inner cutout via fillRule="evenodd"
 * (screen hole + camera dot on the lid, deck hole on the base).
 */
const LID_D =
  "M16.2865 0C17.3911 0 18.2865 0.895431 18.2865 2V10.9043H1.2865V2C1.2865 0.895579 2.18213 0.000240011 3.2865 0H16.2865Z" +
  "M3.2865 1C2.73442 1.00024 2.2865 1.44786 2.2865 2V10.5H17.2865V2C17.2865 1.44772 16.8388 1 16.2865 1H3.2865Z" +
  "M9.7865 2C10.2007 2 10.5365 2.33579 10.5365 2.75C10.5365 3.16421 10.2007 3.5 9.7865 3.5C9.37249 3.49976 9.0365 3.16407 9.0365 2.75C9.0365 2.33593 9.37249 2.00024 9.7865 2Z";

const BASE_D =
  "M18.2865 10.9043L19.4281 13.7568C19.9536 15.0706 18.9856 16.5 17.5707 16.5H2.00232C0.587687 16.4997 -0.380403 15.0704 0.144897 13.7568L1.2865 10.9043H18.2865Z" +
  "M1.07361 14.1289C0.811271 14.7855 1.29524 15.4997 2.00232 15.5H17.5707C18.2781 15.5 18.7619 14.7857 18.4994 14.1289L17.4486 11.5H2.12439L1.07361 14.1289Z";

/** Hinge line the lid rotates about — the y where lid meets base. */
const HINGE_Y = 10.9043;
/** Vanishing axis: the lid's horizontal center (= the camera dot's cx). */
const CENTER_X = 9.7865;
/**
 * Camera distance in viewBox units. The lid closes TOWARD the viewer, so
 * nearer points scale UP (s > 1); 70 keeps the widening gentle (~1.11x
 * at the end pose) so the top edge grows without ballooning.
 */
const PERSPECTIVE_D = 70;
/**
 * Above-front viewpoint: how much depth-toward-the-viewer maps to a
 * DOWNWARD screen offset. The base wedge already encodes this view (its
 * deck projects 5.6 units down for a lid-height of depth), giving ~0.45.
 */
const VIEW_DROP = 0.45;
/**
 * Fully-closed peak tilt. 40.56° reproduced the user's approved SVG
 * snapshot exactly (flat top edge at y = 5.24); bumped to 46° on their
 * follow-up ("slightly more down") — the top edge dips ~1.1 units
 * lower (y ≈ 6.3) at the peak. The lid closes to here, then reopens.
 */
const LID_MAX_ANGLE_RAD = (46 * Math.PI) / 180;

/** Samples per cubic segment: chord error well under a device pixel. */
const CURVE_SAMPLES = 10;

type Point = readonly [number, number];

/**
 * Flatten an absolute M/L/H/V/C/Z path into point loops. Straight edges
 * keep only their endpoints (lines survive the projective map); cubics
 * (rounded corners, camera circle) are sampled. Runs once at module load;
 * throws on anything unexpected so a bad edit fails fast, not mid-frame.
 */
function samplePath(d: string): Point[][] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[+-]?\d+)?/g) ?? [];
  const loops: Point[][] = [];
  let loop: Point[] = [];
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    switch (cmd) {
      case "M":
        if (loop.length) loops.push(loop);
        loop = [];
        x = num();
        y = num();
        loop.push([x, y]);
        break;
      case "L":
        x = num();
        y = num();
        loop.push([x, y]);
        break;
      case "H":
        x = num();
        loop.push([x, y]);
        break;
      case "V":
        y = num();
        loop.push([x, y]);
        break;
      case "C": {
        const x1 = num();
        const y1 = num();
        const x2 = num();
        const y2 = num();
        const x3 = num();
        const y3 = num();
        for (let k = 1; k <= CURVE_SAMPLES; k++) {
          const t = k / CURVE_SAMPLES;
          const u = 1 - t;
          loop.push([
            u * u * u * x +
              3 * u * u * t * x1 +
              3 * u * t * t * x2 +
              t * t * t * x3,
            u * u * u * y +
              3 * u * u * t * y1 +
              3 * u * t * t * y2 +
              t * t * t * y3,
          ]);
        }
        x = x3;
        y = y3;
        break;
      }
      case "Z":
        break;
      default:
        throw new Error(`samplePath: unsupported token "${cmd}"`);
    }
  }
  if (loop.length) loops.push(loop);
  return loops;
}

/** Outer shell, screen cutout, camera dot — flattened once. */
const LID_LOOPS = samplePath(LID_D);

/**
 * Silhouette of the lid tilted TOWARD the viewer by `p` of the full angle:
 * each point's height above the hinge rotates out of the icon plane toward
 * the camera (z = h·sin a), so it scales UP with proximity (s > 1, the top
 * edge widens like the reference photo) and its screen position combines
 * the shrinking up-component with the viewpoint's downward depth drop.
 * Points ON the hinge have h = 0 and never move, welding the lid to the
 * base; at p = 0 the math is the identity, but we return the source string
 * for a byte-exact rest pose.
 */
function buildLidPath(p: number): string {
  if (p === 0) return LID_D;
  const a = LID_MAX_ANGLE_RAD * p;
  const sinA = Math.sin(a);
  const cosA = Math.cos(a);
  return LID_LOOPS.map((loop) => {
    const parts = loop.map(([x, y], idx) => {
      const h = HINGE_Y - y; // height above the hinge, >= 0
      const z = h * sinA; // depth toward the viewer
      const s = PERSPECTIVE_D / (PERSPECTIVE_D - z);
      const sx = CENTER_X + (x - CENTER_X) * s;
      const sy = HINGE_Y - (h * cosA - VIEW_DROP * z) * s;
      return `${idx === 0 ? "M" : "L"}${sx.toFixed(3)} ${sy.toFixed(3)}`;
    });
    return parts.join("") + "Z";
  }).join("");
}

const EASE_IN_OUT_CUBIC = [0.645, 0.045, 0.355, 1] as const;
const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

function buildSequence(progress: MotionValue<number>): AnimationSequence {
  return [
    [
      progress,
      [0, 1, 0],
      {
        duration: 0.9,
        times: [0, 0.47, 1],
        ease: [EASE_IN_OUT_CUBIC, EASE_OUT_QUINT],
      },
    ],
  ];
}

export const MacbookIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const progress = useMotionValue(0);
  const lidRef = useRef<SVGPathElement | null>(null);

  const lidD = useTransform(progress, buildLidPath);
  useMotionValueEvent(lidD, "change", (d) => {
    lidRef.current?.setAttribute("d", d);
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
        // Sequence cancel restores DOM attributes, but the motion value
        // keeps its last scrubbed value; reset so the lid recomputes
        // back to the rest pose.
        () => progress.jump(0),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={17}
      viewBox="0 0 20 17"
      fill="currentColor"
      // This is the set's only FILLED icon: its line weight is the width of the
      // filled band (1.0u), not a strokeWidth. A same-color 0.5 stroke on both
      // contours widens that band to 1.0 + 0.5 = 1.5u, so the laptop's line
      // matches the 1.5 centreline stroke of every other icon.
      stroke="currentColor"
      strokeWidth={0.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      <path d={BASE_D} fillRule="evenodd" />
      {/* Lid AFTER the base: closing, it swings in front of the deck, so
          it must paint on top. d is driven from the progress motion value. */}
      <path ref={lidRef} d={LID_D} fillRule="evenodd" />
    </svg>
  );
});

MacbookIcon.displayName = "MacbookIcon";
