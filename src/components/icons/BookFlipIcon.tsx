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
  type Transition,
} from "motion/react";
import { deriveStops, deriveDistanceStops, type CombineEase } from "./easing";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — book page flip (snappy tween timing)
 *
 *    0ms   page rests flat on the right stack        (frame 1)
 *  ~190ms  page peels up, gathering speed            (frames 2-3)
 *  ~275ms  page snaps over the spine — fastest beat  (frames 3-4)
 *  ~415ms  page brakes, floats down left             (frames 4-5)
 *   550ms  page lands flat on the left stack         (frame 6)
 *   550ms  hand-off: page melts into the left stack…
 *   650ms  …and the next page surfaces on the right  (frame 1)
 *   770ms  at rest, identical to the start — replays cleanly
 *
 * Unlike the other icons, the flip is NOT a keyframe sequence:
 * per-segment easing pulses at every frame boundary. Instead one
 * progress value runs 0→1 under a single bezier and useTransform
 * maps it onto the six frames at their rotation fractions, so
 * velocity is continuous across the whole turn.
 *
 * Two profiles share this timeline: BookFlipIcon runs a quick quart-bezier
 * tween over hand-authored stops; BookFlipSlowIcon runs dead linear —
 * progress runs linearly AND the frame stops are evenly spaced (derived from
 * a "linear" combine curve, see easing.ts), so every frame-to-frame segment
 * takes the same amount of time: constant speed, no per-segment easing. The
 * leaf also dims at the crest (CREST_SHADE) so the moving page reads as
 * distant while it is edge-on.
 *
 * Generated from 6 frames by scripts/parse-frames.mjs.
 * Path states are validated (identical command structure) — do not
 * hand-edit the d strings; re-export frames and re-run the parser.
 *
 * Paper fill defaults to white; retheme via --icon-paper if the icon
 * sits on a non-white surface.
 * ───────────────────────────────────────────────────────── */

// --ease-in-out-quart from the motion-craft library: steep middle
// (fast crest over the spine), long soft landing.
const FLIP_EASE = [0.77, 0, 0.175, 1] as const;

interface FlipProfile {
  flip: Transition; // drives the page turn (progress 0 → 1)
  melt: number; // page fades into the left stack (seconds)
  surface: number; // next page fades in on the right (seconds)
  // Combine easing: ONE global curve for the whole run. Frame stops are
  // derived from it (each frame lands where the curve reaches its equal
  // value step) instead of the hand-authored FLIP_STOPS. The easing lives
  // entirely in the stop positions, so `flip.ease` must stay linear.
  combineEase?: CombineEase;
  // Arc-length stops: place each frame at its cumulative shape distance so a
  // linear progress morphs at constant *visual* speed — no dwelling on frames
  // whose neighbours barely differ. Wins over combineEase; keep flip.ease linear.
  arcLength?: boolean;
}

// Library 1: a tween-driven snap, eased a touch slower than a pure flick so
// the peel and landing read clearly (still keeps the quart's fast crest).
const FAST_PROFILE: FlipProfile = {
  flip: { duration: 0.55, ease: [...FLIP_EASE] },
  melt: 0.1,
  surface: 0.12,
};

// Library 2: a truly continuous page turn. Progress runs 0 → 1 linearly and
// the frame stops are placed by ARC LENGTH (deriveDistanceStops) — each of the
// 6 frames sits at its cumulative shape distance, so every segment gets time in
// proportion to how much the shape actually changes. The near-identical poses
// as the page stands up / lays down no longer dwell, and the big cross-spine
// sweep no longer rushes: the page edge travels at constant visual speed, so
// nothing "stops on the points". flip.ease stays linear (the pacing lives
// entirely in the stops).
const LINEAR_PROFILE: FlipProfile = {
  flip: { duration: 0.45, ease: "linear" },
  melt: 0.1,
  surface: 0.12,
  arcLength: true,
};

// Depth cue: the leaf dims as it lifts and turns edge-on (min brightness at
// the crest, progress 0.5) and returns to full paper as it lands flat, so the
// moving page reads as farther from the viewer. 1 = full paper brightness.
const CREST_SHADE = 0.82;

// How far through the 180° turn each frame sits (rotation fraction).
// The 3→4 gap is deliberately narrow: combined with the quart bezier's
// peak velocity at progress 0.5, the crest passes in ~20ms.
// Only used when a profile has no combineEase — profiles with one derive
// their stops from the global curve instead (see deriveStops).
const FLIP_STOPS = [0, 0.22, 0.42, 0.58, 0.78, 1];

const PAGE_STATES = [
  "M18.75 3.751C14.25 3.181 10.75 6.251 10.75 6.251L10.75 20.751C10.75 20.751 13.25 17.751 19.75 18.251 20.299 18.19 20.75 17.75 20.75 17.198L20.744 5.626C20.744 4.798 20.069 3.918 18.75 3.751Z",
  "M17.256 1.764C12.579 2.58 10.75 6.251 10.75 6.251L10.75 20.751C10.75 20.751 12.637 16.873 17.75 16.304 18.299 16.243 18.75 15.803 18.75 15.251L18.75 3.139C18.75 2.311 18.072 1.622 17.256 1.764Z",
  "M16.256 0.77C11.579 1.586 10.75 6.252 10.75 6.252L10.75 20.752C10.75 20.752 11.637 15.879 16.75 15.31 17.299 15.249 17.75 14.809 17.75 14.257L17.75 2.145C17.75 1.317 17.072 0.628 16.256 0.77Z",
  "M5.245 0.77C9.921 1.586 10.75 6.252 10.75 6.252L10.75 20.752C10.75 20.752 9.863 15.879 4.75 15.31 4.201 15.249 3.75 14.809 3.75 14.257L3.75 2.145C3.75 1.317 4.428 0.628 5.245 0.77Z",
  "M4.25 1.751C8.927 2.567 10.75 6.251 10.75 6.251L10.75 20.751C10.75 20.751 8.869 16.86 3.755 16.291 3.206 16.23 2.756 15.79 2.756 15.239L2.756 3.126C2.756 2.298 3.434 1.609 4.25 1.751Z",
  "M2.75 3.752C7.25 3.181 10.75 6.252 10.75 6.252L10.75 20.752C10.75 20.752 8.25 17.752 1.75 18.252 1.201 18.191 0.75 17.75 0.75 17.199L0.755 5.626C0.755 4.798 1.431 3.919 2.75 3.752Z",
];

const PAGE = ".book-flip-page";

/**
 * The full timeline as ONE sequence (flip + hand-off), so playAnimation and
 * the Scrub Lab share the exact same animation. The flip drives the
 * `progress` motion value (sequences support motion-value segments); the
 * hand-off is the clone/recolor trick, adapted: flat-left overlays the
 * left cover, so fading there is near-invisible, and the reset to
 * flat-right happens while fully transparent.
 */
function buildSequence(
  progress: MotionValue<number>,
  profile: FlipProfile,
): AnimationSequence {
  return [
    [progress, [0, 1], profile.flip],
    [PAGE, { opacity: [1, 0] }, { duration: profile.melt, ease: "easeOut" }],
    // The page is invisible here; snap it back to flat-right through the
    // progress value, NOT a d write. Sequences merge same-target segments
    // into one keyframe animation, so this stays scrub-safe - a separate
    // paused d animation would pin d to its fill value at every scrubbed
    // time before it starts, stomping the progress-driven pose.
    [progress, [1, 0], { duration: 0.001 }],
    [PAGE, { opacity: [0, 1] }, { duration: profile.surface, ease: "easeOut" }],
  ];
}

const PAPER = "var(--icon-paper, white)";

function createBookFlipIcon(profile: FlipProfile, displayName: string) {
  // Arc-length profiles place each frame at its cumulative shape distance
  // (constant visual speed); combined profiles place each frame where the
  // global curve reaches its equal value step; others keep the hand-authored
  // stops. Resolved once — the profile is fixed for the component's lifetime.
  const stops = profile.arcLength
    ? deriveDistanceStops(PAGE_STATES)
    : profile.combineEase
      ? deriveStops(profile.combineEase, PAGE_STATES.length - 1)
      : FLIP_STOPS;

  const Component = forwardRef<IconHandle, SVGProps<SVGSVGElement>>(
    (props, ref) => {
      const [scope, animate] = useAnimate();
      const pageRef = useRef<SVGPathElement>(null);

      const progress = useMotionValue(0);
      const pageD = useTransform(progress, stops, PAGE_STATES);
      useMotionValueEvent(pageD, "change", (v) => {
        pageRef.current?.setAttribute("d", v);
      });

      // Brightness dips at the crest and returns to full paper at both ends.
      // Derived purely from progress, so it tracks playback and scrubbing
      // without adding a segment to the sequence.
      const pageShade = useTransform(
        progress,
        [0, 0.5, 1],
        [1, CREST_SHADE, 1],
      );
      const pageFilter = useTransform(pageShade, (b) => `brightness(${b})`);

      useImperativeHandle(ref, () => ({
        async playAnimation() {
          progress.jump(0);
          await animate(buildSequence(progress, profile));
        },
        createScrubber() {
          progress.jump(0);
          return makeScrubber(
            () => animate(buildSequence(progress, profile)),
            // The sequence's cancel() restores DOM attributes, but the motion
            // value keeps its last scrubbed value; reset it so the page's d
            // recomputes back to the rest pose.
            () => progress.jump(0),
          );
        },
      }));

      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0.75 2.25 20 20"
          fill="none"
          style={{ overflow: "visible" }}
          ref={scope}
          {...props}
        >
          <path
            d="M4.083 3.752C6.544 3.748 8.918 4.638 10.75 6.252L10.75 20.751C8.918 19.139 6.544 18.248 4.083 18.251 2.521 18.251 1.74 18.251 1.395 18.031 1.188 17.898 1.103 17.813 0.971 17.606 0.75 17.261 0.75 16.645 0.75 15.414L0.75 7.155C0.75 5.727 0.75 5.013 1.299 4.434 1.847 3.856 2.409 3.826 3.533 3.766 3.715 3.756 3.899 3.752 4.083 3.752Z"
            fill={PAPER}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M17.417 3.752C14.956 3.748 12.582 4.638 10.75 6.252L10.75 20.751C12.582 19.139 14.956 18.248 17.417 18.251 18.979 18.251 19.76 18.251 20.105 18.031 20.312 17.898 20.396 17.813 20.529 17.606 20.75 17.261 20.75 16.645 20.75 15.414L20.75 7.155C20.75 5.727 20.75 5.013 20.201 4.434 19.652 3.856 19.091 3.826 17.967 3.766 17.785 3.756 17.601 3.752 17.417 3.752Z"
            fill={PAPER}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <motion.path
            ref={pageRef}
            className="book-flip-page"
            d={PAGE_STATES[0]}
            fill={PAPER}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: pageFilter }}
          />
        </svg>
      );
    },
  );
  Component.displayName = displayName;
  return Component;
}

export const BookFlipIcon = createBookFlipIcon(FAST_PROFILE, "BookFlipIcon");

/** A steady, linear page turn — constant speed through the whole flip. */
export const BookFlipSlowIcon = createBookFlipIcon(
  LINEAR_PROFILE,
  "BookFlipSlowIcon",
);
