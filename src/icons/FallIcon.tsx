import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  motion,
  useAnimate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — the ball hangs in the air and the wake
 * behind it keeps redrawing itself, for as long as you hover
 *
 * ONE CYCLE, 1.5s:
 *      0ms  rest: ball home, all three streaks full length
 *   0-130ms SWEEP OUT — each streak's tail runs up the line and
 *           off its tip, so the old wake leaves the way it came
 *           in rather than being switched off
 * 130-280ms DRAW ON — the head runs back up from the lower
 *           (ball-side) end to the tip. This is the beat the
 *           whole icon is built around, so it gets the snappiest
 *           curve in the file.
 *           Each line starts on one of three unevenly spaced
 *           delays — 0, 60 and 135ms — DEALT AT RANDOM, so the
 *           wake never redraws in the same order twice. Last
 *           line lands by 415ms.
 * 415ms-end HOLD — and this beat is the longest one on purpose,
 *           roughly 72% of the cycle. The wake is the icon; if
 *           it spends most of its time mid-draw, what you see is
 *           a circle with something flickering next to it. The
 *           redraw should read as an occasional accent on a
 *           settled glyph, not as the glyph's normal state.
 *  0-1500ms the whole BODY drifts — ball and wake together, as
 *           one. The streaks are the air this ball disturbed, so
 *           they belong to it; leaving them pinned while it
 *           moved read as two unrelated objects sharing a box.
 *           It never travels anywhere either: it wanders inside
 *           a box under half a unit across and settles home
 *           last, the way the heavy thing in a composition
 *           should. Over 1.5s that is a slow float, which is the
 *           whole point — this is an idle, not a gesture.
 *
 * THEN IT GOES AGAIN, while the pointer is still on the icon.
 * The cycle ends at progress 1, which IS rest (§0.2) — so the
 * seam between repeats is invisible, and so is the moment it
 * stops. Every repeat is dealt a fresh hand: a new draw order
 * AND a reshaped wander, because a ball retracing one 650ms
 * figure over and over stops reading as drift and starts
 * reading as a GIF.
 *
 * Hover is checked BETWEEN cycles, never mid-cycle, which is why
 * leaving never snaps: the current repeat always plays out to
 * rest before the loop quits.
 *
 * EASING, per the animations.dev decision tree:
 *   · the draw-on is an element ENTERING → ease-out (quart:
 *     1−(1−t)⁴). Acceleration at the start is what makes it feel
 *     instant rather than merely quick.
 *   · the sweep-out is LINEAR, which that blueprint otherwise
 *     reserves for constant-speed motion — and this is one: a
 *     wipe. It is also the only curve that does not park the
 *     stroke near zero length on its way out. Measured, over the
 *     130ms sweep, at how long the stroke sits shorter than its
 *     own round caps: linear 10ms, ease-in-out 35ms, ease-out
 *     69ms. Anything that decelerates into the tip leaves a
 *     BEAD sitting there (see INK_FLOOR). Linear still starts at
 *     full speed, so it costs no responsiveness the way ease-in
 *     would.
 *   · the three lines share both curves and both durations
 *     exactly; only WHEN each starts is random. The blueprint's
 *     paired-elements rule is about things that move as one
 *     body, and holding duration steady is what keeps these
 *     three reading as one wake rather than three unrelated
 *     ticks — the scatter belongs in the delays, not the speeds.
 * The ease-out is written as a polynomial rather than the
 * equivalent cubic-bezier so the shaping stays a pure function of
 * progress, with no solver in the frame loop.
 *
 * THE DRIFT is the sum of two sines per axis, on different
 * frequencies, so the body wanders instead of sliding on a line.
 * Sines also hand you ease-in-out for free — zero velocity at
 * every extreme — which is exactly the curve an on-screen drift
 * wants, and no keyframes to keep in sync.
 *
 * WHERE THE RANDOMNESS LIVES. Exactly one place: the delay each
 * streak is dealt, drawn once per play in `dealDelays`. Given
 * that deal, every frame is still a pure function of one
 * progress value — which is what lets hover playback and the
 * Scrub Lab pose identically (BookFlipIcon's pattern). Rolling
 * per frame, or during render, would break both: the scrubber
 * could not seek a stable timeline, and the server and client
 * markup would disagree on hydration.
 * ───────────────────────────────────────────────────────── */

/**
 * One cycle. The transition inside it is fixed at ~415ms no matter what this
 * is set to (see SWEEP / DRAW / DELAY_SLOTS), so this number is really the
 * length of the HOLD — how long the wake sits there fully drawn before it
 * redraws. At 1.5s the wake is complete about 72% of the time and the redraw
 * reads as an occasional accent; at the 650ms this used to be, it was complete
 * barely a third of the time and the icon read as "briefly draws, then gone".
 * 1.5s is also the top of §0.5's 0.7–1.5s band for a loop, which is what this
 * now is.
 */
const DURATION = 1.5;

const TAU = Math.PI * 2;

const CX = 6;
const CY = 11.75;

/** Per-streak beats, in seconds. Under the 300ms the frequency principle
 *  allows for something a user meets this often — the redraw should land
 *  before they have finished registering the hover. */
const SWEEP = 0.13;
const DRAW = 0.15;

/** The three delays a streak can be dealt, in seconds. Unevenly spaced on
 *  purpose — an even cascade reads as a mechanical sweep however you shuffle
 *  it, because the gaps give the pattern away. */
const DELAY_SLOTS = [0, 0.06, 0.135] as const;

/** How far the ball is ever allowed from home, per axis — the bottom of
 *  §0.4's 0.5–3 unit band. This should read as hanging, not as thrown. */
const DRIFT_X = 0.45;
const DRIFT_Y = 0.5;

/** Entering → ease-out. Quart is the strong end of the blueprint's range. */
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Everything a single cycle needs that is not a function of time: which delay
 *  each streak drew, and the shape of this cycle's wander. */
type Deal = {
  delays: number[];
  wx: number;
  wy: number;
  sx: number;
  sy: number;
};

/** Pure sines, no phase offsets, integer frequencies: both axes are 0 at
 *  progress 0 AND at progress 1, whatever the deal — so every cycle starts and
 *  finishes home, and the hand-off between cycles needs no special case.
 *  Different fundamentals per axis keep x and y out of step, so the path is a
 *  wander rather than a diagonal slide, and the weights always sum to 1, so
 *  the amplitude can never exceed DRIFT_X / DRIFT_Y. */
const driftX = (p: number, d: Deal) => {
  const t = TAU * p;
  return DRIFT_X * d.sx * (d.wx * Math.sin(t) + (1 - d.wx) * Math.sin(3 * t));
};
const driftY = (p: number, d: Deal) => {
  const t = TAU * p;
  return DRIFT_Y * d.sy * (d.wy * Math.sin(2 * t) + (1 - d.wy) * Math.sin(t));
};

/** Below this visible fraction a dash is shorter than its own round caps, so
 *  it renders as a BEAD rather than a line — a zero-length dash under round
 *  caps IS the standard dotted-line trick. Hide it across the hand-off
 *  instead; there is no real ink to lose. */
const INK_FLOOR = 0.015;

/** Each streak is drawn ball-end FIRST, so path position 0 is the lower-left
 *  end the draw starts from and position 1 is the tip. Which delay each one
 *  gets is dealt fresh per play — see `dealDelays`. */
const STREAKS = [
  { cls: "streak-top", d: "M7.5 4.25L11 0.75" },
  { cls: "streak-mid", d: "M11.5 6.25L17 0.75" },
  { cls: "streak-low", d: "M13.5 9.75L17 6.25" },
] as const;

/** What the icon looks like before it has ever been played. Any deal would do
 *  — at progress 0 the drift is 0 and every streak is outside its window — but
 *  this keeps the resting values readable. */
const REST_DEAL: Deal = {
  delays: [...DELAY_SLOTS],
  wx: 0.72,
  wy: 0.6,
  sx: 1,
  sy: 1,
};

/**
 * Deal one cycle: shuffle the delay slots (Fisher–Yates) so the streaks fire
 * in a different order, and reshape the wander so the ball does not retrace
 * the same little path. Flipping the signs matters most — on a long hover the
 * ball otherwise repeats one 650ms figure and the whole thing reads as a GIF.
 *
 * Randomness is safe HERE and nowhere else in this file. It is drawn once per
 * CYCLE, from an event handler — never during render, so the server and client
 * markup cannot disagree, and never per frame, so within a cycle every frame
 * stays a pure function of progress. That is what keeps the Scrub Lab honest:
 * `makeScrubber` builds its animation once, dealing one cycle that then holds
 * for the whole scrub session.
 */
function dealCycle(): Deal {
  const delays = [...DELAY_SLOTS];
  for (let i = delays.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [delays[i], delays[j]] = [delays[j], delays[i]];
  }
  return {
    delays,
    wx: 0.55 + Math.random() * 0.3,
    wy: 0.5 + Math.random() * 0.3,
    sx: Math.random() < 0.5 ? -1 : 1,
    sy: Math.random() < 0.5 ? -1 : 1,
  };
}

/**
 * Dash geometry for one streak at master progress `p`.
 *
 * The visible span is [tail, head]. Sweeping runs the tail up to the tip while
 * the head stays there; drawing runs the head up from the start while the tail
 * sits at 0. Both ends are at rest (0 and 1) before and after the window, so
 * the streak is simply full length outside its own beat.
 *
 * Motion's own path props build `stroke-dasharray: "<length> <spacing>"` with
 * `stroke-dashoffset: -<offset>`; these are the same three numbers, written
 * directly because head and tail have to move independently. Spacing stays 1,
 * so the pattern period is length+1 > 1 and only ONE dash can ever land on the
 * path — no stray repeat creeping in from either end.
 */
function strokeDash(p: number, delay: number) {
  const local = p * DURATION - delay;
  let tail = 0;
  let head = 1;
  if (local < 0) {
    // not started: still the resting full-length stroke
  } else if (local < SWEEP) {
    tail = clamp01(local / SWEEP);
  } else {
    head = easeOutQuart(clamp01((local - SWEEP) / DRAW));
  }
  return { length: head - tail, offset: tail };
}

export const FallIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate<SVGSVGElement>();
  const shouldReduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const streakRefs = useRef<(SVGPathElement | null)[]>([]);
  const dealRef = useRef<Deal>(REST_DEAL);
  const runningRef = useRef(false);

  const x = useTransform(progress, (p) => driftX(p, dealRef.current));
  const y = useTransform(progress, (p) => driftY(p, dealRef.current));

  useMotionValueEvent(progress, "change", (p) => {
    STREAKS.forEach((_, i) => {
      const el = streakRefs.current[i];
      if (!el) return;
      const { length, offset } = strokeDash(p, dealRef.current.delays[i]);
      if (length < INK_FLOOR) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = "";
      el.setAttribute("stroke-dasharray", `${length.toFixed(4)} 1`);
      el.setAttribute("stroke-dashoffset", `${(-offset).toFixed(4)}`);
    });
  });

  /** One cycle, on a freshly dealt hand. Linear: every curve in this icon
   *  lives in the pure functions above, so easing the tween as well would
   *  double-apply it. */
  const runCycle = (p: MotionValue<number>) => {
    dealRef.current = dealCycle();
    p.jump(0);
    return animate(p, 1, { duration: DURATION, ease: "linear" });
  };

  /**
   * Is the pointer still on the icon? The row hands us hover-START and then
   * stops talking, so the only way to know when to quit is to ask the DOM.
   *
   * The media query is not belt-and-braces: on a touch screen `:hover` sticks
   * after a tap until you tap elsewhere, so without it a single tap would
   * spin this loop forever on a phone.
   */
  const stillHovered = () => {
    const el = scope.current;
    return (
      !!el &&
      el.isConnected &&
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      el.matches(":hover")
    );
  };

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion || runningRef.current) return;
      runningRef.current = true;
      try {
        // Keep cycling for as long as the pointer stays. Checking BETWEEN
        // cycles rather than interrupting one means the last cycle always
        // finishes at progress 1 — which is rest — so leaving never snaps.
        do {
          await runCycle(progress);
        } while (stillHovered());
      } catch {
        // Unmounted mid-cycle: the scoped animation is already cancelled and
        // React owns the markup from here.
      } finally {
        runningRef.current = false;
      }
    },
    createScrubber() {
      return makeScrubber(
        () => runCycle(progress),
        () => progress.jump(0),
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
      {/* Ball and wake drift as ONE body — the streaks are the air this ball
          disturbed, so they belong to it and travel with it. x/y are
          MotionValues, so the drift is written straight to the group's
          transform outside React's render cycle: no state, no re-render per
          frame, and one composited transform instead of four. */}
      <motion.g style={{ x, y }}>
        <circle className="ball" cx={CX} cy={CY} r="5.25" />
        {/* pathLength="1" normalises the dash units, so the numbers written
            above are plain fractions of each line whatever its actual length.
            Rendered markup at rest is the untouched glyph: full strokes, no
            dash attributes until the first frame writes them. */}
        {STREAKS.map(({ cls, d }, i) => (
          <path
            key={cls}
            className={cls}
            ref={(el) => {
              streakRefs.current[i] = el;
            }}
            d={d}
            pathLength="1"
          />
        ))}
      </motion.g>
    </svg>
  );
});

FallIcon.displayName = "FallIcon";
