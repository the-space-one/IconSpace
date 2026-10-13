import {
  forwardRef,
  useId,
  useImperativeHandle,
  useRef,
  type SVGProps,
} from "react";
import {
  useAnimate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type AnimationSequence,
  type Easing,
  type MotionValue,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — the eye glances left, glances right,
 * then blinks (hover)
 *
 *      0ms  eye open, pupil centred
 *  0-195ms  GLANCE LEFT — the pupil slides 1.9 units left
 *   195ms   holds there 150ms: a look is a move plus a DWELL.
 *           Without the dwell it reads as a twitch.
 *   345ms   GLANCE RIGHT — sweeps the full 3.8 across in
 *           240ms, the longest single move
 *   585ms   holds right 150ms
 *   735ms   returns to centre, then a beat of stillness
 *   945ms   BLINK ONE — shut in 90ms, open again over 120ms.
 *           Shut is faster than open: a lid drops under its
 *           own weight and lifts under muscle.
 *  1215ms   BLINK TWO, after only a 60ms gap and a touch
 *           quicker (80/105ms). One blink reads as a glitch;
 *           a close pair reads as alive.
 *  1550ms   back at rest, pixel-identical (§0.2)
 *
 * THE BLINK IS GEOMETRY, NOT A FADE. The eye outline is two
 * cubic lids spanning (1.5, 9) to (16.5, 9), joined by a
 * rounded corner at each point — one lid bulging up by
 * `topH`, one down by `botH`. One `open` value drives both:
 *
 *   topH = lerp(-0.8, 4.5, open)     botH = lerp(0.8, 4.5, open)
 *
 * At open = 1 they bulge symmetrically: the almond. At open =
 * 0 both land on the SAME control points, so the two arcs
 * coincide exactly, the shape has zero area, and what remains
 * is a single shallow curve — a closed eye. The lid does not
 * fade out, it closes.
 *
 * That same path is also a clipPath around the pupil, so the
 * pupil is CUT by the lid rather than hidden by an opacity
 * ramp: as the eye narrows, the iris is genuinely occluded
 * top and bottom, and at zero area it is gone entirely,
 * because there is no region left to draw it in. Nothing to
 * time, nothing to crossfade — ICON-SYSTEM §5.4's ephemeral
 * actor, done with geometry (the GithubIcon clip trick).
 *
 * The clip also does quiet work while the eye is OPEN: it
 * trims the pupil's stroke at the corners on a hard glance,
 * so the iris tucks under the lid instead of poking through
 * the outline.
 *
 * TWO CLOCKS. The gaze and the lid are independent — the eye
 * finishes looking around before it blinks — so they carry
 * their own `times` rather than being forced onto one
 * (LightningIcon / TicketIcon pattern).
 * ───────────────────────────────────────────────────────── */

const n = (v: number) => Number(v.toFixed(3));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Eye corners and centre. */
const CX = 9;
const CY = 9;
const LEFT = 1.5;
const RIGHT = 16.5;
/** Horizontal offset of the arcs' control points — the almond's fullness. */
const BULGE_X = (RIGHT - LEFT) * 0.25;
/** How far each arc bulges when fully open. */
const OPEN_H = 4.5;
/** Where the two arcs meet when shut: a shallow curve just below centre. */
const SHUT_H = 0.8;
/**
 * How far back along each lid the corner fillet starts. The lids meet in a
 * geometric cusp — `strokeLinejoin: round` only softens that by half a stroke,
 * which still reads as a spike — so each lid is cut back this far along its own
 * tangent and a short cubic bridges the gap.
 *
 * It has to be a TANGENT-CONTINUOUS fillet, not a corner arc. Grafting a
 * semicircle onto the ends (the obvious approach, and the first thing tried
 * here) leaves the lid arriving at ~55° while the arc leaves horizontally; that
 * kink renders as a visible bump sticking out past the corner. A fillet whose
 * controls pull toward the virtual corner leaves each lid along the direction
 * it was already travelling, so the join is invisible and the curve never exits
 * the corner it is rounding.
 *
 * It scales WITH `open`, which is what keeps the blink exact: at open = 0 the
 * inset is 0, the fillets collapse to points, and both lids still land on
 * identical control points.
 */
const FILLET = 0.7;
/** Control-point pull for the fillet — ~0.55 approximates a circular corner. */
const FILLET_K = 0.55;

const PUPIL_R = 2.5;
/** How far the pupil travels each way. */
const GAZE = 1.9;

/**
 * The eye outline: lid over, rounded corner, lid back, rounded corner. Always
 * M C C C C Z, so every scrub seek lands on valid geometry — and the same
 * string serves as both the drawn outline and the pupil's clip.
 *
 * The lids stop `r` short of each point and a half-circle cubic carries the
 * turn, still reaching exactly LEFT and RIGHT at its midpoint so the eye's
 * width is unchanged. A cubic whose ends share a y peaks at 1/4·end + 3/4·control, so
 * the control y is solved backwards from the height the lid should reach.
 */
function lidControlY(targetMid: number, inset: number): number {
  let yc = (targetMid - 0.25 * CY) / 0.75;
  for (let i = 0; i < 2; i++) {
    const dy = yc - CY;
    const len = Math.hypot(BULGE_X, dy) || 1;
    const endY = CY + (inset * dy) / len;
    yc = (targetMid - 0.25 * endY) / 0.75;
  }
  return yc;
}

function lensD(open: number): string {
  const inset = FILLET * open;
  const topMid = CY - lerp(-SHUT_H, OPEN_H, open);
  const botMid = CY + lerp(SHUT_H, OPEN_H, open);
  const ytc = lidControlY(topMid, inset);
  const ybc = lidControlY(botMid, inset);

  // How far back along each lid's OWN tangent the fillet starts. Cutting along
  // the direction the lid is already travelling is what keeps the join
  // invisible — cut any other way and the seam shows as a bump.
  const step = (yc: number): [number, number] => {
    const dy = yc - CY;
    const len = Math.hypot(BULGE_X, dy) || 1;
    return [(inset * BULGE_X) / len, (inset * dy) / len];
  };
  const [tdx, tdy] = step(ytc);
  const [bdx, bdy] = step(ybc);

  // Lid ends: top/bottom lid, at the left and right corners.
  const tl: [number, number] = [LEFT + tdx, CY + tdy];
  const tr: [number, number] = [RIGHT - tdx, CY + tdy];
  const br: [number, number] = [RIGHT - bdx, CY + bdy];
  const bl: [number, number] = [LEFT + bdx, CY + bdy];

  // Fillet controls pull toward the virtual corner the lids would have met at,
  // so the curve rounds INTO the corner and never past it.
  const pull = (p: [number, number], cornerX: number) =>
    `${n(lerp(p[0], cornerX, FILLET_K))} ${n(lerp(p[1], CY, FILLET_K))}`;

  return (
    `M${n(tl[0])} ${n(tl[1])}` +
    `C${n(LEFT + BULGE_X)} ${n(ytc)} ${n(RIGHT - BULGE_X)} ${n(ytc)} ${n(tr[0])} ${n(tr[1])}` +
    `C${pull(tr, RIGHT)} ${pull(br, RIGHT)} ${n(br[0])} ${n(br[1])}` +
    `C${n(RIGHT - BULGE_X)} ${n(ybc)} ${n(LEFT + BULGE_X)} ${n(ybc)} ${n(bl[0])} ${n(bl[1])}` +
    `C${pull(bl, LEFT)} ${pull(tl, LEFT)} ${n(tl[0])} ${n(tl[1])}Z`
  );
}

const REST_LENS = lensD(1);

const DURATION = 1.55;

/** Look, dwell, look, dwell, return. The dwells are what make it a glance.
 *  Fractions chosen to keep the glance at its original wall-clock timing after
 *  the second blink lengthened the whole gesture. */
const GAZE_KEYFRAMES = [0, -GAZE, -GAZE, GAZE, GAZE, 0, 0];
const GAZE_TIMES = [0, 0.126, 0.223, 0.377, 0.475, 0.581, 1];
const GAZE_EASES: Easing[] = [
  "easeInOut",
  "linear",
  "easeInOut",
  "linear",
  "easeInOut",
  "linear",
];

/**
 * TWO blinks, not one — a single blink reads as a glitch, a pair reads as
 * alive. Each shuts fast and opens slower, because a real lid drops under its
 * own weight and lifts under muscle. The second is a touch quicker than the
 * first (80/105ms against 90/120ms) with only a 60ms gap between them, which
 * is what makes it a double blink rather than two separate ones.
 */
const LID_KEYFRAMES = [1, 1, 0, 1, 1, 0, 1, 1];
const LID_TIMES = [0, 0.61, 0.668, 0.745, 0.784, 0.836, 0.903, 1];
const LID_EASES: Easing[] = [
  "linear",
  "easeIn",
  "easeOut",
  "linear",
  "easeIn",
  "easeOut",
  "linear",
];

function buildSequence(
  gaze: MotionValue<number>,
  open: MotionValue<number>,
): AnimationSequence {
  return [
    [
      gaze,
      GAZE_KEYFRAMES,
      { duration: DURATION, times: GAZE_TIMES, ease: GAZE_EASES },
    ],
    [
      open,
      LID_KEYFRAMES,
      { at: 0, duration: DURATION, times: LID_TIMES, ease: LID_EASES },
    ],
  ];
}

export const EyeIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const shouldReduceMotion = useReducedMotion();
  const gaze = useMotionValue(0);
  const open = useMotionValue(1);
  const outlineRef = useRef<SVGPathElement>(null);
  const clipRef = useRef<SVGPathElement>(null);
  const pupilRef = useRef<SVGCircleElement>(null);

  // Unique per instance — the icon renders in several places at once, and
  // duplicate ids would make every eye clip against the first one's lid.
  const clipId = `eye-lid-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

  const pose = useTransform(() => ({
    lens: lensD(open.get()),
    cx: n(CX + gaze.get()).toString(),
  }));
  useMotionValueEvent(pose, "change", ({ lens, cx }) => {
    outlineRef.current?.setAttribute("d", lens);
    clipRef.current?.setAttribute("d", lens);
    pupilRef.current?.setAttribute("cx", cx);
  });

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      gaze.jump(0);
      open.jump(1);
      await animate(buildSequence(gaze, open));
    },
    createScrubber() {
      gaze.jump(0);
      open.jump(1);
      return makeScrubber(
        () => animate(buildSequence(gaze, open)),
        // Sequence cancel restores DOM attributes, but the motion values keep
        // their last scrubbed value; reset so the eye recomputes to rest.
        () => {
          gaze.jump(0);
          open.jump(1);
        },
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      <defs>
        {/* Same `d` as the outline, updated in the same frame — this is what
            makes the lid occlude the pupil instead of fading it. */}
        <clipPath id={clipId}>
          <path ref={clipRef} d={REST_LENS} />
        </clipPath>
      </defs>
      <path ref={outlineRef} d={REST_LENS} />
      <g clipPath={`url(#${clipId})`}>
        <circle ref={pupilRef} cx={CX} cy={CY} r={PUPIL_R} />
      </g>
    </svg>
  );
});

EyeIcon.displayName = "EyeIcon";
