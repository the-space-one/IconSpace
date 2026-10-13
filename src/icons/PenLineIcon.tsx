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
 * ANIMATION STORYBOARD — the pen turns over and writes its
 * own underline (one-shot, hover)
 *
 * Built from four supplied frames. Measuring them is what
 * set every number below:
 *
 *   · the pen is ONE shape in all four — 20.6 units nib to
 *     end in frame 1, 20.8 in the rest — rotated exactly
 *     -70° between frame 1 and frames 2-4. So it is a
 *     rotation, not a second drawing, and the glyph is a
 *     FILLED path, which means the turn costs nothing: no
 *     stroke to distort, no scaling trap.
 *   · the line is 10.50 units long in ALL FOUR frames. It
 *     never grows — it TRANSLATES. The frames nail the pen
 *     down and slide the paper under it, which is just how
 *     they were exported; in a real icon the line is fixed
 *     and the pen travels. Everything below is that
 *     inversion.
 *   · measured against the fixed nib, frame 4 has it on the
 *     line's LEFT end (0.29u in, 0.20u above), frame 3 on
 *     the RIGHT end (11.47u in), and frame 2 lifted 2.89u
 *     clear past the end. So the supplied order is rest,
 *     then the stroke played BACKWARDS: 1 · 4 → 3 → 2.
 *
 * REST IS FRAME 1, EXACTLY — identity transform, full line.
 * The static icon is untouched, and the animation returns to
 * it pixel-for-pixel (§0.2).
 *
 * THE FOUR FRAMES ARE THE FOUR KEYFRAMES. Nothing here is
 * invented: each supplied pose is a measured entry in KEYS,
 * and the animation is the interpolation between them.
 *
 *      0ms  FRAME 1 — rest. Pen up-right at -51.5°, nib
 *           down-left, line to its right.
 *    210ms  FRAME 4 — the pen has turned -70° about its own
 *           nib and set down on the HEAD of the line
 *           (0.29u in). The stroke starts here.
 *    645ms  FRAME 3 — the nib has run the length of the line
 *           to 11.46u, still down on the paper.
 *    760ms  FRAME 2 — lifted clear: 12.46u along and 2.89u
 *           ABOVE the line, where the other two sat ~0.15u
 *           below it. That height difference is the only
 *           thing in the frames that says "pen up", and it
 *           is why this pose comes last rather than first.
 *    950ms  back to FRAME 1, pixel-identical (§0.2).
 *
 * SO THE SUPPLIED ORDER PLAYS THE STROKE BACKWARDS: read
 * along the line, frames 4 · 3 · 2 sit at 0.29u, 11.46u and
 * 12.46u. Played 1 → 4 → 3 → 2 → 1 the pen writes left to
 * right and lifts off at the end, which is the only reading
 * where the lifted frame lands where a hand would leave it.
 *
 * THE PEN WRITES THE LINE. The four frames each show it
 * whole — they are static poses, so they cannot say whether
 * it was being drawn — and the ink is the point of the
 * icon, so it grows under the nib: the drawn length is how
 * far the nib has passed the line's left end, one number
 * for both. The old line clears right→left while the pen is
 * still turning over, finishing exactly as the nib touches
 * down, and once the nib lifts the ink is held so it cannot
 * un-draw itself as the pen carries its x home.
 *
 * Rest is still frame 1 whole, so the static icon and the
 * final frame both match what was supplied.
 *
 * THE PEN TURNS ABOUT ITS NIB, not its centre. Rotating
 * about the middle would swing the tip through a 10-unit
 * arc and the pen would appear to stab at the paper; about
 * the nib, the tip stays put and only the barrel sweeps,
 * which is how a pen is actually turned in the hand.
 *
 * THE BOX IS SIZED TO THE GLYPH, NOT TO THE MOTION. Stood up
 * at -121.5° to write, the 20.6-unit barrel sweeps from x
 * -3.8 to 13.2 and reaches 5 units above the paper, so an
 * earlier pass opened the viewBox to 24×22 to contain the
 * whole turn. That was the wrong trade: rendered into a
 * square, an SVG scales by its LARGEST viewBox dimension, so
 * a 24-unit box drew at 5.33px per unit where its 18-19 unit
 * neighbours (Heart, Paper Plane, Mic) drew at 6.74 — the
 * pen came out a fifth smaller than everything beside it.
 *
 * The box is now 19 units, sized to the resting glyph the
 * way the rest of the set is, and the barrel is simply
 * allowed outside it mid-swing on overflow: visible. It is
 * off-box for about a third of the timeline and never at
 * rest, which is the right way round — an icon is judged at
 * rest and every tile here has padding to spare.
 * ───────────────────────────────────────────────────────── */

/**
 * The pen, exactly as supplied in frame 1 — a filled outline, no stroke of its
 * own. Every pose in this file is this path under a rotate/translate, so there
 * is only ever one drawing of the pen.
 */
const PEN_D =
  "M2.15325 11.3313L1.62292 10.801C1.53602 10.8879 1.4718 10.9948 1.43593 11.1124L2.15325 11.3313ZM11.437 2.04758L10.9066 1.51725V1.51725L11.437 2.04758ZM5.91796 15.096L6.13692 15.8133C6.25446 15.7775 6.36139 15.7132 6.44829 15.6263L5.91796 15.096ZM15.2017 2.04758L14.6714 2.57791V2.57791L15.2017 2.04758ZM16.4936 3.80328L17.2405 3.736V3.73599L16.4936 3.80328ZM16.4936 4.05659L17.2405 4.12387V4.12387L16.4936 4.05659ZM13.1927 0.755693L13.1254 0.00871718V0.00871724L13.1927 0.755693ZM13.446 0.755693L13.5133 0.00871724V0.00871718L13.446 0.755693ZM10.4416 3.0432C10.1487 2.75031 9.67381 2.75031 9.38092 3.0432C9.08802 3.33609 9.08802 3.81097 9.38092 4.10386L9.91125 3.57353L10.4416 3.0432ZM13.1456 7.86857C13.4385 8.16146 13.9134 8.16146 14.2063 7.86857C14.4992 7.57567 14.4992 7.1008 14.2063 6.80791L13.676 7.33824L13.1456 7.86857ZM11.7936 5.45588L11.2633 5.98621V5.98621L11.7936 5.45588ZM4.0356 13.2137L3.50527 13.744L3.50527 13.744L4.0356 13.2137ZM1.39769 16.4758L1.61664 17.1931L1.39769 16.4758ZM2.15325 11.3313L2.68358 11.8616L11.9673 2.57791L11.437 2.04758L10.9066 1.51725L1.62292 10.801L2.15325 11.3313ZM15.2017 5.81229L14.6714 5.28196L5.38763 14.5657L5.91796 15.096L6.44829 15.6263L15.732 6.34262L15.2017 5.81229ZM15.2017 2.04758L14.6714 2.57791C15.0998 3.00639 15.3731 3.28145 15.5524 3.50938C15.721 3.7239 15.7419 3.81881 15.7466 3.87056L16.4936 3.80328L17.2405 3.73599C17.1993 3.27802 16.9896 2.91041 16.7315 2.58217C16.4839 2.26735 16.1342 1.91942 15.732 1.51725L15.2017 2.04758ZM15.2017 5.81229L15.732 6.34262C16.1342 5.94045 16.4839 5.59252 16.7315 5.27769C16.9896 4.94946 17.1993 4.58185 17.2405 4.12387L16.4936 4.05659L15.7466 3.9893C15.7419 4.04105 15.721 4.13597 15.5524 4.35049C15.3731 4.57842 15.0998 4.85347 14.6714 5.28196L15.2017 5.81229ZM16.4936 3.80328L15.7466 3.87056C15.7502 3.91006 15.7502 3.94981 15.7466 3.98931L16.4936 4.05659L17.2405 4.12387C17.2522 3.99484 17.2522 3.86503 17.2405 3.736L16.4936 3.80328ZM11.437 2.04758L11.9673 2.57791C12.3958 2.14943 12.6708 1.87615 12.8988 1.69691C13.1133 1.52822 13.2082 1.50733 13.26 1.50267L13.1927 0.755693L13.1254 0.00871724C12.6674 0.0499705 12.2998 0.259696 11.9716 0.517809C11.6567 0.765376 11.3088 1.11509 10.9066 1.51725L11.437 2.04758ZM15.2017 2.04758L15.732 1.51725C15.3299 1.11508 14.9819 0.765376 14.6671 0.517809C14.3389 0.259696 13.9713 0.0499705 13.5133 0.00871724L13.446 0.755693L13.3787 1.50267C13.4305 1.50733 13.5254 1.52822 13.7399 1.69691C13.9678 1.87615 14.2429 2.14943 14.6714 2.57791L15.2017 2.04758ZM13.1927 0.755693L13.26 1.50267C13.2995 1.49911 13.3392 1.49911 13.3787 1.50267L13.446 0.755693L13.5133 0.00871718C13.3842 -0.00290573 13.2544 -0.00290573 13.1254 0.00871718L13.1927 0.755693ZM9.91125 3.57353L9.38092 4.10386L11.2633 5.98621L11.7936 5.45588L12.3239 4.92555L10.4416 3.0432L9.91125 3.57353ZM11.7936 5.45588L11.2633 5.98621L13.1456 7.86857L13.676 7.33824L14.2063 6.80791L12.3239 4.92555L11.7936 5.45588ZM2.15325 11.3313L1.62292 11.8616L3.50527 13.744L4.0356 13.2137L4.56593 12.6833L2.68358 10.801L2.15325 11.3313ZM4.0356 13.2137L3.50527 13.744L5.38763 15.6263L5.91796 15.096L6.44829 14.5657L4.56593 12.6833L4.0356 13.2137ZM1.39769 16.4758L1.61664 17.1931L6.13692 15.8133L5.91796 15.096L5.69901 14.3787L1.17873 15.7584L1.39769 16.4758ZM0.773498 15.8516L1.49083 16.0705L2.87058 11.5503L2.15325 11.3313L1.43593 11.1124L0.0561709 15.6326L0.773498 15.8516ZM1.39769 16.4758L1.17873 15.7584C1.3702 15.7 1.54927 15.8791 1.49083 16.0705L0.773498 15.8516L0.0561709 15.6326C-0.236038 16.5899 0.659323 17.4853 1.61664 17.1931L1.39769 16.4758Z";

/* ── Geometry, all measured off the supplied frames ───────────────────────── */

/** The nib, as the midpoint of the rounded ink tip's curve. Everything pivots
 *  and positions from here — it is the only part of a pen that touches paper. */
const NIB_X = 0.368;
const NIB_Y = 16.881;

/** The underline, verbatim from frame 1. It is 10.50 units in ALL FOUR frames,
 *  so it never grows and never erases — it is a fixed prop, and the pen is the
 *  only thing that moves. */
const LINE_X0 = 7.0083;
const LINE_X1 = 17.5083;
const LINE_Y = 16.75;
const LINE_LEN = LINE_X1 - LINE_X0;
const LINE_D = `M${LINE_X0} ${LINE_Y}H${LINE_X1}`;

/** Frame 1 → frames 2-4, measured: -51.5° to -121.5°. */
const WRITE_ANGLE = -70;

/**
 * THE FOUR SUPPLIED FRAMES, as poses of the pen over a fixed line.
 *
 * Each frame pins the pen and slides the line; inverting that — holding the
 * line at frame 1's coordinates and moving the pen by the same delta — gives
 * the nib positions below. They are measurements, not choices, which is why
 * they are ugly numbers.
 *
 * Read along the line from its left end, frames 4 · 3 · 2 sit at 0.29u,
 * 11.46u and 12.46u — so the stroke runs left to right and the supplied order
 * plays it backwards. Frame 2's nib is also 2.89u ABOVE the line where the
 * other two are ~0.15u below it: that is the pen lifted clear at the end.
 */
type Pose = { x: number; y: number; angle: number };

/** Frame 1 — rest. Identity, so the static icon is untouched. */
const REST: Pose = { x: NIB_X, y: NIB_Y, angle: 0 };
/** Frame 4 — nib down on the head of the line. The stroke starts here. */
const STROKE_START: Pose = { x: 7.3, y: 16.95, angle: WRITE_ANGLE };
/** Frame 3 — nib at the far end, still on the paper. */
const STROKE_END: Pose = { x: 18.47, y: 16.86, angle: WRITE_ANGLE };
/** Frame 2 — lifted clear, past the end. */
const LIFTED: Pose = { x: 19.47, y: 13.86, angle: WRITE_ANGLE };

/**
 * When each pose is reached. The stroke gets the longest leg because it is the
 * only one carrying meaning; the turn in and the return are transitions.
 */
const KEYS: Array<{ at: number; pose: Pose }> = [
  { at: 0, pose: REST },
  { at: 0.22, pose: STROKE_START },
  { at: 0.68, pose: STROKE_END },
  { at: 0.8, pose: LIFTED },
  { at: 1, pose: REST },
];

/** How far the barrel arcs over on the way in and out, so the pen swings above
 *  the paper instead of dragging across it. Small on purpose: the barrel is
 *  20.6 units and stands near-upright mid-turn, so every unit of arc throws its
 *  far end a unit further out of the box. */
const ARC = 1.2;

const DURATION = 0.95;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
/** The stroke itself: committed at the start, easing off at the end, the way a
 *  hand draws a straight line. */
const easeOutish = (t: number) => 1 - (1 - t) ** 2.2;

/**
 * The pen's transform for progress `p`, interpolated between whichever two of
 * the supplied poses `p` falls between.
 *
 * rotate() takes the nib as its origin, so the barrel swings while the tip
 * stays put — that is how a pen is turned in the hand. The translate that
 * follows is then just "put the nib here". At p = 0 and p = 1 both resolve to
 * the identity, so rest is frame 1 exactly.
 */
function poseAt(p: number): Pose {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].at) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = clamp01((p - a.at) / (b.at - a.at));

  // Only the stroke leg is a straight travel; the rest are swings.
  const isStroke = a.pose === STROKE_START && b.pose === STROKE_END;
  const e = isStroke ? easeOutish(t) : easeInOut(t);
  // Lift the pen over the paper on the way in and on the way home.
  const swings = a.pose === REST || b.pose === REST;
  const arc = swings ? Math.sin(Math.PI * t) * ARC : 0;

  return {
    angle: lerp(a.pose.angle, b.pose.angle, e),
    x: lerp(a.pose.x, b.pose.x, e),
    y: lerp(a.pose.y, b.pose.y, e) - arc,
  };
}

function penTransform(p: number): string {
  const { x, y, angle } = poseAt(p);
  return `translate(${(x - NIB_X).toFixed(3)} ${(y - NIB_Y).toFixed(3)}) rotate(${angle.toFixed(2)} ${NIB_X} ${NIB_Y})`;
}

/* ── The ink ──────────────────────────────────────────────────────────────── */

/** When the nib lands on the paper, and when it leaves — read off KEYS so the
 *  ink cannot drift out of step with the poses. */
const SET_DOWN_AT = KEYS[1].at;
const LIFT_OFF_AT = KEYS[2].at;

/**
 * How much line is still hidden. dasharray is one LINE_LEN dash, so offset d
 * leaves [0, LINE_LEN - d] visible — the line fills from its LEFT end, the way
 * the nib travels.
 *
 * THE INK IS READ OFF THE NIB, not off a track of its own. During the stroke
 * the drawn length is simply how far the nib has passed the line's left end,
 * so the two cannot disagree — a separate keyframe track would need
 * hand-syncing, and the one frame where it lags is the frame where the pen
 * visibly writes dry.
 *
 * Before the nib lands, the previous line clears — right to left, finishing
 * exactly as the pen touches down and picking up exactly where the nib formula
 * takes over, so there is no step. After the nib lifts, the line stays written;
 * without that guard it would un-draw itself as the pen carried its x back to
 * rest.
 */
const drawnAt = (x: number) => clamp01((x - LINE_X0) / LINE_LEN) * LINE_LEN;
/** The offset the nib formula yields the instant the pen touches down. */
const DASH_AT_SET_DOWN = LINE_LEN - drawnAt(STROKE_START.x);

function dashAt(p: number): number {
  if (p < SET_DOWN_AT)
    return lerp(0, DASH_AT_SET_DOWN, easeInOut(p / SET_DOWN_AT));
  if (p <= LIFT_OFF_AT) return LINE_LEN - drawnAt(poseAt(p).x);
  return 0;
}

function buildSequence(progress: MotionValue<number>): AnimationSequence {
  // Linear: every beat's shaping lives in the functions above, so easing the
  // driver as well would double-ease the whole timeline.
  return [[progress, [0, 1], { duration: DURATION, ease: "linear" }]];
}

export const PenLineIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const penRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGPathElement>(null);

  // No transform touches the line, so its 1.5 stroke stays a true 1.5 viewBox
  // units at every rendered size.
  const dash = useTransform(progress, dashAt);
  useMotionValueEvent(dash, "change", (d) =>
    lineRef.current?.setAttribute("stroke-dashoffset", d.toFixed(3)),
  );

  // Written to the SVG `transform` ATTRIBUTE, not to style.transform. The two
  // are different languages: the attribute takes `translate(x y)` unitless and
  // `rotate(deg cx cy)` with a centre, while CSS wants `translate(xpx, ypx)`
  // and a one-argument `rotate(Ndeg)`. Feeding attribute syntax to the CSS
  // property makes the whole declaration invalid, so the browser drops it and
  // nothing moves at all — which is exactly what happened here. Going through
  // the attribute also keeps the rotation centre on the nib for free, with no
  // transformBox/transformOrigin pair to get backwards.
  const penTf = useTransform(progress, penTransform);
  useMotionValueEvent(penTf, "change", (t) =>
    penRef.current?.setAttribute("transform", t),
  );

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
        // Sequence cancel restores DOM attributes, but the motion value keeps
        // its last scrubbed position; reset so both recompute to rest.
        () => progress.jump(0),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="19"
      height="19"
      viewBox="-0.75 -0.9 19 19"
      fill="none"
      // The barrel swings outside this box mid-turn — see the storyboard.
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* The underline, drawn behind the pen so the nib rides over its own ink
          rather than under it. Rest value in JSX because makeScrubber pauses
          before the first paint. */}
      <path
        ref={lineRef}
        d={LINE_D}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray={LINE_LEN}
        strokeDashoffset={0}
      />
      {/* The pen. A filled outline, so the turn is free — rotating it cannot
          distort a stroke it does not have. */}
      <path
        ref={penRef}
        d={PEN_D}
        fill="currentColor"
        transform={penTransform(0)}
      />
    </svg>
  );
});

PenLineIcon.displayName = "PenLineIcon";
