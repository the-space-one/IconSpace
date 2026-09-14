"use client";

import { forwardRef, useImperativeHandle, type SVGProps } from "react";
import { motion, useAnimate, type AnimationSequence } from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — continuous triple page tear
 *
 * Three stacked sheets tear off in an overlapping cascade:
 * each page starts sagging while the previous one is still
 * falling, so the whole thing reads as ONE continuous
 * motion (~1.05s), not three resets. Directions are
 * shuffled per play (at least one leftward + one rightward
 * tear) with random jitter on every fall.
 *
 * One sheet's timeline (fractions of its 490ms):
 *   0.00  hidden, rest-aligned over the body's lower half.
 *   0.08  masked appear: fades in while aligned — strokes
 *         coincide with the body, imperceptible. Body
 *         recoils with a 0.35-unit dip (perforation
 *         lets go — paired timing).
 *   0.30  SAG BEAT: one side drops ~3° (authored tear pose
 *         or its exact mirror). Ease-out-quad — soft
 *         enough to keep velocity flowing into the fall.
 *   0.72  STRAIGHT FALL: drops ~9 units straight down —
 *         rotation and x held from the sag. Ease-in-quad
 *         gravity acceleration.
 *   0.96  LATE VEER: almost at the end the page swerves —
 *         extra rotation + sideways drift (air catches
 *         it) while fading out. Linear: it is already
 *         at speed.
 *   1.00  invisible restore to rest.
 *
 * The next sheet's timeline starts 280ms after the
 * previous one (0.57 overlap), so page 2 is sagging while
 * page 1 is mid-fall. First-torn sheets render LAST in the
 * DOM, keeping the falling page on top of the stack.
 *
 * Sheets are FILLED with paper (var(--icon-paper)) so they
 * occlude the body's strokes while crossing them. The sheet
 * path is the user-authored mid-tear pose (identity ==
 * artwork); poses are rotate/x/y around the authored
 * top-left corner (2.758, 10.83) in view-box coordinates,
 * leftward poses reflected about the rest sheet's vertical
 * center line. Randomness is resolved once per play
 * (buildSequence), so a scrub session stays deterministic.
 * Transform + opacity only; reduced-motion is guarded at
 * the trigger (SidebarRow / Stage), as system-wide.
 * ───────────────────────────────────────────────────────── */

const PAGES = 3;
const SHEET_SECONDS = 0.49; // one sheet's full tear
const STAGGER = 0.28; // next sheet starts while previous falls
const DURATION = STAGGER * (PAGES - 1) + SHEET_SECONDS;

/** Beats inside one sheet's timeline:
 *  hidden → surfaced → sag → straight-fallen → veered/faded → home. */
const SHEET_BEATS = [0, 0.08, 0.3, 0.72, 0.96, 1];

const EASE_OUT_QUAD: [number, number, number, number] = [
  0.25, 0.46, 0.45, 0.94,
];
const EASE_IN_QUAD: [number, number, number, number] = [
  0.55, 0.085, 0.68, 0.53,
];

const SHEET_EASES: ([number, number, number, number] | "linear")[] = [
  "linear", // masked fade-in
  EASE_OUT_QUAD, // sag
  EASE_IN_QUAD, // straight gravity fall
  "linear", // late veer, already at speed
  "linear", // invisible restore
];

const PAPER = "var(--icon-paper, white)";

/** Inverse of the authored pose: top edge exactly on the divider. */
const REST = { rotate: -3.068, x: 1.414, y: -2.88 };

/** Sag pose + veer signs per direction. "right" = the authored artwork
 *  (identity sag); "left" = its exact mirror about the rest sheet's
 *  vertical axis. veerRotate/veerX are the direction of the end swerve. */
const DIRECTIONS = {
  right: {
    sag: { rotate: 0, x: 0, y: 0 },
    veerRotate: 1,
    veerX: -1,
  },
  left: {
    sag: { rotate: -6.136, x: 2.85, y: 0.8 },
    veerRotate: -1,
    veerX: 1,
  },
} as const;

type TearDirection = keyof typeof DIRECTIONS;

const STRAIGHT_DROP = 9; // straight-line fall distance
const VEER_DROP = 5; // additional drop during the swerve

/** Full calendar glyph — rect, divider and pegs, verbatim from the
 *  authored SVG. Complete on its own: this IS the fresh page revealed. */
const BODY_D =
  "M2.672 4.864c0-1.136.977-2.057 2.182-2.057H18.49c1.205 0 2.182.92 2.182 2.057v11.828c0 1.136-.977 2.058-2.182 2.058H4.854c-1.205 0-2.182-.922-2.182-2.058zm0 3.086h18M7.036 2.807V.75m9.272 2.057V.75";

/** Torn page, verbatim from the authored SVG — drawn in its mid-tear
 *  pose, so transform identity == the artwork. */
const SHEET_D =
  "M17.737 11.633 2.758 10.83a1.5 1.5 0 0 0-1.578 1.418l-.428 7.988a1.5 1.5 0 0 0 1.418 1.578l14.978.803a1.5 1.5 0 0 0 1.578-1.418l.428-7.988a1.5 1.5 0 0 0-1.417-1.578Z";

/* Body recoil: one quick dip per tear as its perforation lets go. */
const RECOIL_HALF = 0.021 / DURATION; // 21ms up, 21ms down
const BODY_Y: number[] = [0];
const BODY_TIMES: number[] = [0];
for (let page = 0; page < PAGES; page++) {
  const release = (page * STAGGER + SHEET_BEATS[1] * SHEET_SECONDS) / DURATION;
  BODY_Y.push(0, 0.35, 0);
  BODY_TIMES.push(release, release + RECOIL_HALF, release + 2 * RECOIL_HALF);
}
BODY_Y.push(0);
BODY_TIMES.push(1);

const jitter = (amount: number) => (Math.random() * 2 - 1) * amount;

/** One left, one right, plus a coin-flip third — shuffled, so every
 *  play tears in a fresh mix of directions. */
function pickDirections(): TearDirection[] {
  const dirs: TearDirection[] = [
    "left",
    "right",
    Math.random() < 0.5 ? "left" : "right",
  ];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  return dirs;
}

/** Resolve this play's randomness into one overlapping sequence. */
function buildSequence(): AnimationSequence {
  const sequence: AnimationSequence = [];

  pickDirections().forEach((dir, page) => {
    const { sag, veerRotate, veerX } = DIRECTIONS[dir];
    const drop = STRAIGHT_DROP + jitter(1.5);
    const fallen = { rotate: sag.rotate, x: sag.x, y: sag.y + drop };
    const veered = {
      rotate: sag.rotate + veerRotate * (7 + Math.random() * 4),
      x: sag.x + veerX * (2.5 + Math.random() * 1.5),
      y: sag.y + drop + VEER_DROP + jitter(1),
    };

    const poses = [
      { ...REST, opacity: 0 }, // hidden at rest
      { ...REST, opacity: 1 }, // surfaced, still aligned
      { ...sag, opacity: 1 }, // sag beat
      { ...fallen, opacity: 1 }, // straight-line drop
      { ...veered, opacity: 0 }, // late swerve, fading
      { ...REST, opacity: 0 }, // home, hidden
    ];

    sequence.push([
      `.cal2-sheet-${page}`,
      {
        rotate: poses.map((p) => p.rotate),
        x: poses.map((p) => p.x),
        y: poses.map((p) => p.y),
        opacity: poses.map((p) => p.opacity),
      },
      {
        duration: SHEET_SECONDS,
        times: SHEET_BEATS,
        ease: SHEET_EASES,
        at: page * STAGGER,
      },
    ]);
  });

  sequence.push([
    ".cal2-body",
    { y: BODY_Y },
    { duration: DURATION, times: BODY_TIMES, ease: "easeOut", at: 0 },
  ]);

  return sequence;
}

export const Calendar2Icon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      await animate(buildSequence());
    },
    // Powers the /scrub route: one random instance, deterministic to scrub.
    createScrubber() {
      return makeScrubber(() => animate(buildSequence()));
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="1.67 -0.25 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      <motion.path className="cal2-body" d={BODY_D} initial={{ y: 0 }} />
      {/* Three stacked sheets, rendered in reverse tear order so the page
          tearing first stays on top of the stack. Paper fill occludes the
          body's strokes as a sheet crosses them. transformOrigin lives in
          `initial` (a style origin gets overridden by Motion's 50%/50% SVG
          default); view-box makes the pixel coordinates viewBox-relative. */}
      {[PAGES - 1, PAGES - 2, PAGES - 3].map((page) => (
        <motion.path
          key={page}
          className={`cal2-sheet cal2-sheet-${page}`}
          d={SHEET_D}
          fill={PAPER}
          initial={{
            ...REST,
            opacity: 0,
            transformOrigin: "2.758px 10.83px",
          }}
          style={{ transformBox: "view-box" }}
        />
      ))}
    </svg>
  );
});

Calendar2Icon.displayName = "Calendar2Icon";
