"use client";

import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  useReducedMotion,
  type AnimationSequence,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — real mixer: knobs drag their gaps
 *
 * Three horizontal rails, each split by a gap holding a
 * vertical knob. On hover every row is "adjusted" to a new
 * setting (frame 2): the knob travels and its gap travels
 * WITH it — each rail half grows or shrinks so its inner end
 * keeps hugging the knob while the outer end stays pinned to
 * the icon edge.
 *
 * Knob travel: top −5.09, middle +4.00, bottom −2.91.
 *
 * HOVER IN   a snappy triple-flick: each row snaps to its
 *            frame-2 setting, flicks back home, and snaps out
 *            again to PARK in frame 2 — three fast legs
 *            (220ms each, ease-out) so the knobs visibly move
 *            more than once, like someone fiddling with the
 *            mix. Knob translateX and both rail d-morphs run
 *            as one beat per row (paired elements share
 *            timing); rows staggered 0 / 100ms / 130ms. The
 *            icon does the animationsdev-hero micro-squash
 *            (1 → 0.97 → 1.02 → 1) as the flicks kick off.
 * HOVER OUT  one snappy 220ms slide home + squash.
 *
 * Interactive like SettingsIcon: own mouse handlers, and a
 * retarget stops the in-flight sequence so leaving mid-slide
 * reverses smoothly from wherever the knobs are.
 *
 * SettingsSliderPreviewIcon is the one-shot for /scrub and
 * sidebar rows: enter (0-790ms) → dwell (790-1090ms) → leave
 * (1090-1440ms).
 * ───────────────────────────────────────────────────────── */

/**
 * Per row: the knob's rest path + x travel, and each rail half's
 * [rest, hover] d pair. Inner endpoints track the knob; outer endpoints
 * (0.75 / ~18.75) never move, so a plain d-morph reads as the rail
 * growing/shrinking behind the sliding knob.
 */
const ROWS = [
  {
    knob: ".slider-knob-1",
    knobD: "M13.844 0.75v4.362",
    travel: -5.092,
    left: ".slider-rail-1l",
    leftD: ["M10.025 2.878H0.75", "M5.959 2.878H0.75"],
    right: ".slider-rail-1r",
    rightD: ["M14.116 2.878H18.754", "M9.308 2.878H18.754"],
    delay: 0,
  },
  {
    knob: ".slider-knob-2",
    knobD: "M6.751 7.566v4.363",
    travel: 4.001,
    left: ".slider-rail-2l",
    leftD: ["M6.478 9.748H1.023", "M10.289 9.748H1.023"],
    right: ".slider-rail-2r",
    rightD: ["M10.57 9.748H18.482", "M13.752 9.748H18.482"],
    delay: 0.1,
  },
  {
    knob: ".slider-knob-3",
    knobD: "M11.662 14.383v4.367",
    travel: -2.91,
    left: ".slider-rail-3l",
    leftD: ["M7.842 16.618H0.75", "M5.752 16.618H0.75"],
    right: ".slider-rail-3r",
    rightD: ["M11.934 16.617H18.754", "M9.137 16.617H18.754"],
    delay: 0.13,
  },
] as const;

// One fast leg of knob travel. Three legs make the enter's triple-flick
// (out → home → out); the leave is a single leg back.
const LEG_DURATION = 0.22;
const FLICK_LEGS = 3;
const FLICK_DURATION = LEG_DURATION * FLICK_LEGS; // 0.66
const FLICK_TIMES = [0, 1 / 3, 2 / 3, 1];

// animationsdev-hero's container squash, verbatim.
const SQUASH_SCALE = [1, 0.97, 1.02, 1];
const SQUASH_TIMES = [0, 0.25, 0.6, 1];
const SQUASH_DURATION = 0.4;

const BODY_SELECTOR = ".slider-body";

/** Preview timeline beats (seconds). */
const ENTER_LENGTH = 0.13 + FLICK_DURATION; // last row starts at 130ms
const LEAVE_AT = ENTER_LENGTH + 0.3; // 300ms dwell in the frame-2 pose

/** ENTER: squash + per row a staggered triple-flick (out, home, out). */
function flickBeats(at: number): AnimationSequence {
  return [
    [
      BODY_SELECTOR,
      { scale: [...SQUASH_SCALE] },
      {
        at,
        duration: SQUASH_DURATION,
        times: [...SQUASH_TIMES],
        ease: "easeOut",
      },
    ],
    ...ROWS.flatMap((row): AnimationSequence => {
      const timing = {
        at: at + row.delay,
        duration: FLICK_DURATION,
        times: [...FLICK_TIMES],
        ease: "easeOut" as const,
      };
      return [
        [row.knob, { x: [0, row.travel, 0, row.travel] }, { ...timing }],
        [
          row.left,
          { d: [row.leftD[0], row.leftD[1], row.leftD[0], row.leftD[1]] },
          { ...timing },
        ],
        [
          row.right,
          { d: [row.rightD[0], row.rightD[1], row.rightD[0], row.rightD[1]] },
          { ...timing },
        ],
      ];
    }),
  ];
}

/** LEAVE: squash + per row a single staggered snap back home. */
function homeBeats(at: number): AnimationSequence {
  return [
    [
      BODY_SELECTOR,
      { scale: [...SQUASH_SCALE] },
      {
        at,
        duration: SQUASH_DURATION,
        times: [...SQUASH_TIMES],
        ease: "easeOut",
      },
    ],
    ...ROWS.flatMap((row): AnimationSequence => {
      const timing = {
        at: at + row.delay,
        duration: LEG_DURATION,
        ease: "easeOut" as const,
      };
      return [
        [row.knob, { x: [row.travel, 0] }, { ...timing }],
        [row.left, { d: [row.leftD[1], row.leftD[0]] }, { ...timing }],
        [row.right, { d: [row.rightD[1], row.rightD[0]] }, { ...timing }],
      ];
    }),
  ];
}

const SEQUENCE: AnimationSequence = [
  // ENTER: triple-flick into the frame-2 setting, icon squashes.
  ...flickBeats(0),
  // (dwell: parked in the frame-2 pose)
  // LEAVE: single snap back home, icon squashes again.
  ...homeBeats(LEAVE_AT),
];

function SliderArt() {
  return (
    <motion.g
      className="slider-body"
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    >
      {ROWS.map((row) => (
        <g key={row.knob}>
          <motion.path className={row.left.slice(1)} d={row.leftD[0]} />
          <motion.path className={row.right.slice(1)} d={row.rightD[0]} />
          <motion.path className={row.knob.slice(1)} d={row.knobD} />
        </g>
      ))}
    </motion.g>
  );
}

const SVG_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: { overflow: "visible" },
} as const;

/**
 * Interactive settings sliders: hovering triple-flicks every row into its
 * frame-2 setting (gap traveling with the knob); leaving snaps them home.
 */
export function SettingsSliderIcon(props: SVGProps<SVGSVGElement>) {
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const inFlight = useRef<ReturnType<typeof animate> | null>(null);

  const slideTo = (out: boolean) => {
    // Freeze the current pose so re-targeting mid-slide continues from it.
    inFlight.current?.stop();
    const poseIdx = out ? 1 : 0;
    if (reduced) {
      for (const row of ROWS) {
        animate(row.knob, { x: out ? row.travel : 0 }, { duration: 0 });
        animate(row.left, { d: row.leftD[poseIdx] }, { duration: 0 });
        animate(row.right, { d: row.rightD[poseIdx] }, { duration: 0 });
      }
      return;
    }
    inFlight.current = animate([
      [
        BODY_SELECTOR,
        { scale: [...SQUASH_SCALE] },
        {
          at: 0,
          duration: SQUASH_DURATION,
          times: [...SQUASH_TIMES],
          ease: "easeOut",
        },
      ],
      ...ROWS.flatMap((row): AnimationSequence => {
        if (out) {
          // Triple-flick in. `null` first keyframes pick up the current
          // mid-slide values, so a quick re-hover never pops.
          const timing = {
            at: row.delay,
            duration: FLICK_DURATION,
            times: [...FLICK_TIMES],
            ease: "easeOut" as const,
          };
          return [
            [row.knob, { x: [null, row.travel, 0, row.travel] }, { ...timing }],
            [
              row.left,
              { d: [null, row.leftD[1], row.leftD[0], row.leftD[1]] },
              { ...timing },
            ],
            [
              row.right,
              { d: [null, row.rightD[1], row.rightD[0], row.rightD[1]] },
              { ...timing },
            ],
          ];
        }
        // Single snap home; single targets retarget from current values.
        const timing = {
          at: row.delay,
          duration: LEG_DURATION,
          ease: "easeOut" as const,
        };
        return [
          [row.knob, { x: 0 }, { ...timing }],
          [row.left, { d: row.leftD[0] }, { ...timing }],
          [row.right, { d: row.rightD[0] }, { ...timing }],
        ];
      }),
    ]);
  };

  return (
    <svg
      {...SVG_PROPS}
      ref={scope}
      {...props}
      onMouseEnter={() => slideTo(true)}
      onMouseLeave={() => slideTo(false)}
    >
      <SliderArt />
    </svg>
  );
}

SettingsSliderIcon.displayName = "SettingsSliderIcon";

/**
 * One-shot preview of the same motion (enter → dwell → leave) for the
 * sidebar rows and the Scrub Lab. No mouse handlers of its own, so it never
 * fights the scrubber.
 */
export const SettingsSliderPreviewIcon = forwardRef<
  IconHandle,
  SVGProps<SVGSVGElement>
>((props, ref) => {
  const [scope, animate] = useAnimate();

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      await animate(SEQUENCE);
    },
    // Powers the /scrub route: the same sequence, created paused + seekable.
    createScrubber() {
      return makeScrubber(() => animate(SEQUENCE));
    },
  }));

  return (
    <svg {...SVG_PROPS} ref={scope} {...props}>
      <SliderArt />
    </svg>
  );
});

SettingsSliderPreviewIcon.displayName = "SettingsSliderPreviewIcon";
