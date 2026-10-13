import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  motion,
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
 * ANIMATION STORYBOARD — hold the bookmark out while hovered;
 * let go and it snaps back and the book takes the hit
 *
 * HOVER IN   the ribbon is drawn 2.7 units further down on a
 *            TWEEN (220ms, expo-out) and PARKS there. The free
 *            bottom corners run a gentler curve than the spine,
 *            so they trail: the notch flattens while it is under
 *            tension, and the tail narrows 0.18 (taper).
 * DWELL      parked, pulled out, for as long as the pointer stays.
 * HOVER OUT  released. Both ends spring home and this is what the
 *            icon is for: the spine rings at bounce 0.50, the
 *            corners at 0.55 over a longer visualDuration, so the
 *            tail is still wobbling after the body has stopped.
 *             +85ms  the jolt fires, just under the 93ms where
 *                    the ribbon is back at its original length,
 *                    crossing it at full speed and still driving
 *                    up INTO the book — so this, not the pointer
 *                    leaving, is when the book gets hit. It is
 *                    knocked UPWARD 0.4, the direction the ribbon
 *                    is travelling: the quint attack has it there
 *                    within 30ms, so the kick reads as landing
 *                    WITH the bookmark, and it settles back by
 *                    365ms. The ribbon's top rides up with it (it
 *                    is clamped in the book) while its bottom
 *                    lags — so the ribbon stretches a touch on
 *                    the hit, which is the tug that moved the
 *                    book in the first place.
 *            +139ms  spine at peak retraction, 0.33 up inside
 *                    the book
 *            +161ms  corners at peak retraction, 0.55 up, still
 *                    ringing
 *            +545ms  settled, pixel-identical to rest (§0.2)
 *
 * INTERACTIVE, LIKE SettingsSliderIcon. The gesture is a STATE,
 * not a one-shot: BookmarkIcon owns its own mouse handlers so the
 * pulled pose holds for exactly as long as the pointer does.
 * BookmarkPreviewIcon replays the whole thing on a fixed timeline
 * (pull → 300ms dwell → release) for the sidebar rows and the
 * Scrub Lab, which need a seekable IconHandle and must never
 * fight the scrubber for the pose.
 *
 * INTERRUPTION IS FREE, because every pose is a motion value
 * rather than a keyframe track: retargeting animates from
 * wherever the value currently is, so leaving mid-pull springs
 * back from a half-pulled ribbon without a pop. The impact scales
 * with `spine` at the moment of release for the same reason — let
 * go of a barely-pulled ribbon and the book barely notices.
 *
 * MASS IS THE POINT OF THE IMPACT BEAT. The book reacts once and
 * stops; the ribbon rings three times. Same event, two masses —
 * that contrast is what sells the book as a heavy object with a
 * light thing attached to it. A book that rang as long as the
 * ribbon would read as paper.
 *
 * THE JOLT IS A TWEEN IN BOTH CHOREOGRAPHIES. Springs cannot go
 * in a sequence (see below), so a sprung jolt would need a
 * hand-synced twin like the ribbon's. An impact is short and
 * stiff — absorb, rebound, done — which a 4-keyframe tween draws
 * exactly, so one definition serves the hover AND the Scrub Lab
 * and the two can never drift.
 *
 * TWO VALUES FOR THE RIBBON, LEAD AND LAG. `spine` drives the
 * notch tip, `tail` the two free bottom corners. Every ribbon
 * point is a free end, but the corners are the extremities, so
 * they carry the most inertia — driving them off a softer, slower
 * spring is what turns a length change into cloth. The notch
 * depth is the GAP between the two, so it flexes for free:
 * shallower under tension on the way down, flared open mid-snap,
 * breathing as it settles. One value could not do that.
 *
 * The lag is bounded on purpose. Depth = 1.728 + 2.667·tail −
 * 2.019·spine, so a spine more than ~0.65 ahead of the tail
 * inverts the swallowtail into a downward point. Measured over
 * the whole run, the gap peaks at 0.24 and depth stays in
 * [1.08, 2.66] against a rest of 1.73 — the two pull eases and
 * the two springs' close visualDurations (0.30 / 0.36) are what
 * keep it there. A much softer tail would flare the V open to
 * twice its rest depth mid-snap.
 *
 * STRETCH, NOT SLIDE. The top edge is PINNED under the book's
 * front line: the book is holding it, so it cannot travel. Frame
 * 2 nudges that edge up 0.34, which would poke the ribbon out
 * OVER the book's edge — dropped. Only the bottom moves, which is
 * what a ribbon pulled from between pages actually does.
 *
 * TAPER IS THE SQUASH-AND-STRETCH. Top width is fixed (clamped in
 * the book), the bottom narrows 0.18 at full pull — so the ribbon
 * goes slightly trapezoidal under tension and, because the return
 * spring carries `tail` NEGATIVE past rest, flares back out wider
 * than rest at the overshoot. One value, both halves of the
 * principle, no extra track to keep in sync.
 *
 * PAPER FILL IS STRUCTURAL: the book's bottom line at y 21.5 runs
 * straight through the ribbon. The fill occludes it, and that is
 * the only thing making the bookmark read as being IN FRONT of
 * the book. Retheme via --icon-paper on dark surfaces.
 *
 * SPRINGS GO IN DISCRETE animate() CALLS, never in a sequence: a
 * sequence pre-resolves a timeline and a spring's duration is
 * derived, not declared. That is why the preview's twin is
 * keyframed — and its keyframes are not guessed, they are the
 * simulated springs' own zero crossings and extrema, at their
 * measured times. So the twin hits every landmark of the real
 * hover exactly and stays within ~0.16 between them; the residual
 * is one stock ease standing in for a damped sinusoid over a
 * segment where the ribbon covers its whole travel.
 *
 * Authored from two Figma states (frames/bookmark) but NOT parser
 * generated — a two-frame morph cannot spring. The rest pose here
 * reproduces frame 1 to within 0.0007 units; the geometry is
 * parametric, so every scrubbed millisecond is valid.
 * ───────────────────────────────────────────────────────── */

const n = (v: number) => Number(v.toFixed(3));

/** The book. It never changes shape — it only takes the hit. */
const BOOK =
  "M4 19.5V4.5C4 3.83696 4.26339 3.20107 4.73223 2.73223C5.20107 2.26339 5.83696 2 6.5 2H20V3M4 19.5C4 20.1667 4.5 21.5 6.5 21.5H20V3M4 19.5C4 17.9 5.67901 17.7678 6.5 17.7678H20V3";

/* ── Ribbon geometry, straight off the two Figma states ──────────────────── */
const CX = 10;
/** Half-width at the top, where the book holds it — never changes. */
const HALF = 2.222;
/** The flat top edge, tucked just under the book's front line (y 17.768). */
const TOP = 17.8889;
/** Rounded top corners, as drawn. */
const RX = 0.63492;
const RY = 0.69131;

/** Rest positions of the two bottom corners and the swallowtail's notch. */
const TAIL_Y = 24.1111;
const NOTCH_Y = 22.3827;
/** Travel at full pull — frame 2 minus frame 1, both measured. */
const TAIL_TRAVEL = 2.6667;
const NOTCH_TRAVEL = 2.0185;
/** How far the bottom narrows at full pull. Not in the frames — see storyboard. */
const TAPER = 0.18;

/**
 * The ribbon for one (spine, tail, kick) triple. Fixed command structure —
 * M L L L C C L C C L Z — so every scrub seek lands on valid geometry.
 *
 * `kick` shifts ONLY the top: the book holds that edge, so it goes wherever
 * the book goes, while the bottom's inertia keeps it where it was.
 *
 * Each top corner is a quarter arc split at 45° into two cubics, the way
 * Figma exported it (handles at 4/3·tan(π/16) ≈ 0.265 of the radius, the
 * joint at 1 − √2/2 across). At spine = tail = kick = 0 this reproduces frame
 * 1 exactly, control point for control point.
 */
function ribbonPath(spine: number, tail: number, kick: number): string {
  const bottom = TAIL_Y + TAIL_TRAVEL * tail;
  const notch = NOTCH_Y + NOTCH_TRAVEL * spine;
  // Only the bottom narrows: the top is clamped in the book.
  const hb = HALF - TAPER * tail;
  const xl = CX - HALF;
  const xr = CX + HALF;
  const top = TOP + kick;
  /** Where each corner meets its wall. */
  const yw = top + RY;

  return (
    `M${n(CX + hb)} ${n(bottom)}` +
    `L${CX} ${n(notch)}` +
    `L${n(CX - hb)} ${n(bottom)}` +
    `L${n(xl)} ${n(yw)}` +
    // left corner — up the wall, over the top
    `C${n(xl)} ${n(yw - 0.2651 * RY)} ${n(xl + 0.1053 * RX)} ${n(yw - 0.5196 * RY)} ${n(xl + 0.2929 * RX)} ${n(yw - 0.7071 * RY)}` +
    `C${n(xl + 0.4804 * RX)} ${n(yw - 0.8947 * RY)} ${n(xl + 0.7348 * RX)} ${n(top)} ${n(xl + RX)} ${n(top)}` +
    `L${n(xr - RX)} ${n(top)}` +
    // right corner — over the top, down the wall
    `C${n(xr - 0.7348 * RX)} ${n(top)} ${n(xr - 0.4804 * RX)} ${n(yw - 0.8947 * RY)} ${n(xr - 0.2929 * RX)} ${n(yw - 0.7071 * RY)}` +
    `C${n(xr - 0.1053 * RX)} ${n(yw - 0.5196 * RY)} ${n(xr)} ${n(yw - 0.2651 * RY)} ${n(xr)} ${n(yw)}` +
    `L${n(CX + hb)} ${n(bottom)}` +
    `Z`
  );
}

const REST_D = ribbonPath(0, 0, 0);

const PAPER = "var(--icon-paper, white)";

/* ── The pull (tween — shared by both choreographies) ────────────────────── */
const PULL_TIME = 0.22;
/** Spine: expo-out. Off the mark immediately, then settles into the pull. */
const PULL_EASE: Easing = [0.22, 1, 0.36, 1];
/** Corners: the same move on a gentler curve, so they trail the spine. A
 *  delay instead would open the gap fast enough to invert the notch. */
const TAIL_PULL_EASE: Easing = [0.33, 1, 0.68, 1];

/* ── The release (springs — the live hover) ──────────────────────────────── */
/**
 * NOTE ON visualDuration, because getting this wrong is what used to make the
 * book react late: it is NOT the time the value takes to reach its target. It
 * sets the spring's natural frequency (ω = 2π / 1.2·visualDuration), and the
 * first crossing of the target lands well inside it — at bounce 0.5, ~0.46× the
 * visualDuration. Every landmark below is measured off the real generator
 * (motion 12.42), not derived from visualDuration. Re-measure them if either
 * spring is retuned, because IMPACT_DELAY and the whole preview twin are keyed
 * to them.
 */
/** The body: fast, with real ring. Crosses rest at 0.093, peaks 0.163 past it
 *  at 0.139, back through rest at 0.231, done by 0.43. */
const SPINE_SPRING = {
  type: "spring",
  visualDuration: 0.2,
  bounce: 0.5,
} as const;
/** The free corners: softer, slower, wobblier — still moving after the body
 *  has stopped. Crosses at 0.105, peaks 0.205 past rest at 0.161, effectively
 *  done by 0.55s. Pushing bounce to 0.62 rings nearly twice as long for no more
 *  visible wobble, which is why it sits here.
 *
 *  Held at 1.2× the spine's visualDuration. That ratio, not either number on
 *  its own, is the lead-and-lag: retune one and the other has to follow or the
 *  swallowtail stops flexing. */
const TAIL_SPRING = {
  type: "spring",
  visualDuration: 0.24,
  bounce: 0.55,
} as const;

/* ── The impact (tween — shared by both choreographies) ──────────────────── */
/**
 * How far the book is knocked UP, viewBox units — negative because SVG y
 * grows downward. The ribbon slams into the book from below, so the book goes
 * with it; a downward dip would read as the book being pressed, which is the
 * opposite of what just happened. Read against TicketIcon's 0.45 recoil on a
 * 20-wide box: felt, not watched.
 */
const KICK = -0.4;
/**
 * TicketIcon's recoil, verbatim in shape: knocked out, settle back, no ring.
 * The attack is EASE_OUT_QUINT, which puts the book at ~90% of the kick
 * within 30ms — that is what makes the hit land WITH the ribbon's arrival
 * rather than visibly answering it — and the return is EASE_OUT_QUAD.
 */
const JOLT_KEYFRAMES = [0, 1, 0];
const JOLT_TIMES = [0, 0.35, 1];
const JOLT_DURATION = 0.28;
const EASE_OUT_QUINT: Easing = [0.23, 1, 0.32, 1];
const EASE_OUT_QUAD: Easing = [0.25, 0.46, 0.45, 0.94];
const JOLT_EASES: Easing[] = [EASE_OUT_QUINT, EASE_OUT_QUAD];
/**
 * The jolt is keyed to the RIBBON'S ARRIVAL, not to the pointer: it fires the
 * moment the ribbon is back at its original length and still driving upward.
 * That is SPINE_SPRING's first crossing of rest, measured at 0.093 — set a
 * touch under it so the quint attack (85% of the kick within 30ms) has the
 * book at the top of its kick exactly as the ribbon lands, with the ribbon
 * still travelling up toward its 0.139 peak.
 *
 * This used to be SPINE_SPRING.visualDuration, which reads as a visible lag:
 * by then the ribbon has already overshot, turned around, and come two thirds
 * of the way back, so the book answered a slam that had visibly finished. See
 * the note above SPINE_SPRING — visualDuration is not the time to reach the
 * target.
 *
 * Firing it on the release instead (delay 0) is wrong in the other direction,
 * even though it looks more responsive: the book would react to a ribbon that
 * has not touched it yet, and the kick would be over before the slam happened.
 */
const IMPACT_DELAY = 0.085;
/** Unwinding an in-flight jolt when the pointer comes back. */
const JOLT_CANCEL = { duration: 0.12, ease: "easeOut" } as const;

/* ── Preview twin (BookmarkPreviewIcon) — keyframes only ─────────────────── */
/** How long the preview holds the pulled pose, standing in for a hover. */
const DWELL = 0.3;
const RELEASE_AT = PULL_TIME + DWELL;
/**
 * The ribbon tracks are the SIMULATED springs' own landmarks — first zero
 * crossing, overshoot peak, second crossing — placed at their measured times
 * rather than eyeballed. The timeline ends on the tail's third and last
 * visible crossing of rest (0.428 after release), by which point the spine is
 * within 0.004 of it, so it lands on the rest pose without truncating
 * anything visible.
 */
const PREVIEW_TOTAL = 0.95;
/** Seconds → fraction of the preview timeline. */
const at = (seconds: number) => Number((seconds / PREVIEW_TOTAL).toFixed(4));

/** A ring alternates: peak → crossing accelerates, crossing → peak brakes. */
const RING_IN: Easing = "easeIn";
const RING_OUT: Easing = "easeOut";

const SPINE_KEYFRAMES = [0, 1, 1, 0, -0.163, 0, 0.027, 0];
const SPINE_TIMES = [
  0,
  PULL_TIME,
  RELEASE_AT,
  RELEASE_AT + 0.093,
  RELEASE_AT + 0.139,
  RELEASE_AT + 0.231,
  RELEASE_AT + 0.277,
  PREVIEW_TOTAL,
].map(at);
const SPINE_EASES: Easing[] = [
  PULL_EASE,
  "linear",
  RING_IN,
  RING_OUT,
  RING_IN,
  RING_OUT,
  RING_IN,
];

/** Carries one more wobble than the spine — its second crossing is at 0.266
 *  against the spine's 0.231, and its +0.042 rebound is still visible where the
 *  spine's +0.027 is not. That is the tail outlasting the body, which is the
 *  whole point of two springs. */
const TAIL_KEYFRAMES = [0, 1, 1, 0, -0.205, 0, 0.042, 0];
const TAIL_TIMES = [
  0,
  PULL_TIME,
  RELEASE_AT,
  RELEASE_AT + 0.105,
  RELEASE_AT + 0.161,
  RELEASE_AT + 0.266,
  RELEASE_AT + 0.322,
  PREVIEW_TOTAL,
].map(at);
const TAIL_EASES: Easing[] = [
  TAIL_PULL_EASE,
  "linear",
  RING_IN,
  RING_OUT,
  RING_IN,
  RING_OUT,
  RING_IN,
];

/** The same jolt as the live hover, padded with a lead-in and a tail hold so
 *  it sits on the preview timeline. Derived, so the two cannot drift. */
const JOLT_AT = RELEASE_AT + IMPACT_DELAY;
const PREVIEW_JOLT_KEYFRAMES = [0, ...JOLT_KEYFRAMES, 0];
const PREVIEW_JOLT_TIMES = [
  0,
  ...JOLT_TIMES.map((t) => at(JOLT_AT + t * JOLT_DURATION)),
  1,
];
const PREVIEW_JOLT_EASES: Easing[] = ["linear", ...JOLT_EASES, "linear"];

function buildPreviewSequence(
  spine: MotionValue<number>,
  tail: MotionValue<number>,
  jolt: MotionValue<number>,
): AnimationSequence {
  return [
    [
      spine,
      SPINE_KEYFRAMES,
      { duration: PREVIEW_TOTAL, times: SPINE_TIMES, ease: SPINE_EASES },
    ],
    [
      tail,
      TAIL_KEYFRAMES,
      { at: 0, duration: PREVIEW_TOTAL, times: TAIL_TIMES, ease: TAIL_EASES },
    ],
    [
      jolt,
      PREVIEW_JOLT_KEYFRAMES,
      {
        at: 0,
        duration: PREVIEW_TOTAL,
        times: PREVIEW_JOLT_TIMES,
        ease: PREVIEW_JOLT_EASES,
      },
    ],
  ];
}

/**
 * The three values every pose is computed from, plus the wiring that turns
 * them into geometry. Shared by both components so the interactive icon and
 * its preview twin draw from one definition.
 */
function useBookmarkPose() {
  const spine = useMotionValue(0);
  const tail = useMotionValue(0);
  const jolt = useMotionValue(0);
  const ribbonRef = useRef<SVGPathElement>(null);

  // One computed path from all three values, so the notch, the corners and
  // the book can never disagree about the pose they are drawn at.
  const ribbonD = useTransform(() =>
    ribbonPath(spine.get(), tail.get(), KICK * jolt.get()),
  );
  useMotionValueEvent(ribbonD, "change", (d) => {
    ribbonRef.current?.setAttribute("d", d);
  });

  // CSS transform lengths on an SVG element are local user units, so this is
  // a viewBox-space nudge (the same trick as TicketIcon's recoil).
  const bookY = useTransform(jolt, (j) => KICK * j);

  return { spine, tail, jolt, ribbonRef, bookY };
}

type Pose = ReturnType<typeof useBookmarkPose>;

function BookmarkArt({ ribbonRef, bookY }: Pick<Pose, "ribbonRef" | "bookY">) {
  return (
    <>
      <motion.g style={{ y: bookY }}>
        <path d={BOOK} />
      </motion.g>
      {/* d is driven imperatively from the spine / tail / jolt values. Rest
          value in JSX because makeScrubber pauses before the first paint. */}
      <path ref={ribbonRef} d={REST_D} fill={PAPER} />
    </>
  );
}

const SVG_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  // The ribbon rests 0.1 below the box and pulls 2.8 past it — the glyph is
  // drawn at the source's own scale rather than shrunk into a 24 box, so it
  // matches the rest of the set at every size.
  style: { overflow: "visible" },
} as const;

/**
 * Interactive bookmark: hovering pulls the ribbon out of the book and HOLDS
 * it there; leaving lets go, and it springs back with a wobble while the book
 * absorbs the hit.
 */
export function BookmarkIcon(props: SVGProps<SVGSVGElement>) {
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const { spine, tail, jolt, ribbonRef, bookY } = useBookmarkPose();

  const pull = () => {
    if (reduced) {
      spine.jump(1);
      tail.jump(1);
      jolt.jump(0);
      return;
    }
    // Targets, not keyframes: a re-hover mid-release picks up from wherever
    // the ribbon currently is instead of popping back to rest first.
    animate(spine, 1, { duration: PULL_TIME, ease: PULL_EASE });
    animate(tail, 1, { duration: PULL_TIME, ease: TAIL_PULL_EASE });
    // Unwind an impact that is still playing, so the book is level again.
    animate(jolt, 0, JOLT_CANCEL);
  };

  const release = () => {
    if (reduced) {
      spine.jump(0);
      tail.jump(0);
      jolt.jump(0);
      return;
    }
    // The book only gets hit as hard as the ribbon was actually pulled —
    // let go of a half-pulled ribbon and it barely registers.
    const impact = Math.max(0, Math.min(1, spine.get()));
    animate(spine, 0, SPINE_SPRING);
    animate(tail, 0, TAIL_SPRING);
    // Waits for the ribbon to actually get home before the book reacts —
    // a re-hover inside that window cancels it through JOLT_CANCEL.
    animate(
      jolt,
      JOLT_KEYFRAMES.map((k) => k * impact),
      {
        duration: JOLT_DURATION,
        times: JOLT_TIMES,
        ease: JOLT_EASES,
        delay: IMPACT_DELAY,
      },
    );
  };

  return (
    <svg
      {...SVG_PROPS}
      ref={scope}
      {...props}
      onMouseEnter={pull}
      onMouseLeave={release}
    >
      <BookmarkArt ribbonRef={ribbonRef} bookY={bookY} />
    </svg>
  );
}

BookmarkIcon.displayName = "BookmarkIcon";

/**
 * One-shot preview of the same motion (pull → dwell → release) for the
 * sidebar rows and the Scrub Lab. No mouse handlers of its own, so it never
 * fights the scrubber, and keyframed throughout so the timeline is seekable.
 */
export const BookmarkPreviewIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const { spine, tail, jolt, ribbonRef, bookY } = useBookmarkPose();

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (reduced) return;
      spine.jump(0);
      tail.jump(0);
      jolt.jump(0);
      await animate(buildPreviewSequence(spine, tail, jolt));
    },
    createScrubber() {
      spine.jump(0);
      tail.jump(0);
      jolt.jump(0);
      return makeScrubber(
        () => animate(buildPreviewSequence(spine, tail, jolt)),
        // Sequence cancel restores DOM attributes, but the motion values keep
        // their last scrubbed value; reset so the ribbon recomputes to rest.
        () => {
          spine.jump(0);
          tail.jump(0);
          jolt.jump(0);
        },
      );
    },
  }));

  return (
    <svg {...SVG_PROPS} ref={scope} {...props}>
      <BookmarkArt ribbonRef={ribbonRef} bookY={bookY} />
    </svg>
  );
});

BookmarkPreviewIcon.displayName = "BookmarkPreviewIcon";
