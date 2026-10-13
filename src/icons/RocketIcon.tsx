import { forwardRef, useImperativeHandle, useRef, type SVGProps } from "react";
import {
  useAnimate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { makeScrubber } from "./scrub";
import type { IconHandle } from "./types";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — the rocket rolls as it climbs, its
 * exhaust redrawing behind it and a planet turning past the
 * window
 *
 *    0ms  rest: the supplied glyph, untouched      (frame 1)
 *  0-415ms EXHAUST REDRAWS — each streak's tail runs off its
 *          far end, then a new head draws back out from the
 *          ship. Three unevenly spaced delays, DEALT AT RANDOM
 *          per play, so the trail never redraws in the same
 *          order twice.
 *  0-1500ms BARREL ROLL — the ship turns a full 360° about its
 *          own long axis. Quint easing: long quiet wind-up,
 *          a snappy whip through mid-flight, long braking
 *          glide into the landing.
 *  0-1500ms the PLANET in the porthole turns 360°, and the whole
 *          ship wobbles about its tail and surges along its
 *          axis — two and three cycles, so it reads as thrust
 *          rather than a slide.
 * 1500ms  every track is back at its rest value, so the last
 *         frame IS the first and replays are seamless (§0.2).
 *
 * Three techniques from the shelf, composed:
 *
 * THE ROLL is Search3DIcon's trick — Class D-1 per ICON-SYSTEM
 * §2, foreshortening a body around an axis that is not a screen
 * axis. Where that icon spins a lens about its diagonal handle,
 * this spins a ship about its own centreline. The axis was
 * RECOVERED from the art rather than assumed: every structural
 * line in the supplied path lies on a ±45° diagonal, and the two
 * shoulder points where the fins meet the body — (9.49976,
 * 5.40764) and (13.4998, 9.40763) — span the body's width, so
 * the centreline is their perpendicular bisector, x + y =
 * 18.9074. The porthole's centre sits on it to within 0.0003,
 * which is the confirmation. Rolling about that line is one
 * transform: map the axis-perpendicular onto the x-axis with a
 * rotate, scaleX by cos θ, map back.
 *
 * The roll passes through edge-on twice, where a zero-thickness
 * body collapses onto its own axis. Search3D avoids that by
 * drawing a real extruded slab; a hull for a shape this
 * involved is not worth it, so the quint ease is doing the work
 * instead — it puts BOTH edge-on moments inside the fast middle
 * of the gesture, about 40ms each, so they read as a whip
 * rather than as the icon blinking out. It is also why the roll
 * has to be a full 360° and not a bank: with scaleX alone, +θ
 * and −θ look identical, so a there-and-back would read as a
 * squash. Only crossing zero swaps the fin to the other side,
 * and that crossing IS what makes it a roll.
 *
 * THE PORTHOLE is two more shelf techniques stacked.
 *
 * The RING is Search3DIcon's extrusion. Your 1.6 circle stroked at 0.8 is an
 * annulus from 1.2 to 2.0, and that is exactly the cross-section Search3D
 * extrudes: the silhouette is the convex hull of two outer face ellipses, and
 * the see-through hole is the vesica where the two inner openings overlap. Turn
 * it about the ship's axis and the barrel swells, the hole squeezes shut
 * because you cannot see through a ring edge-on, and at 90° it is one solid
 * slab. Drawn as ONE evenodd path in flat currentColor — no shades, nothing
 * translucent. At θ = 0 the two faces coincide and it collapses back to a plain
 * annulus, pixel-identical to the circle you drew, so rest is untouched.
 *
 * The LAND is EarthIcon's projection, and it is the same land: EarthIcon's own
 * coastlines, mapped onto a 1.4-radius planet at the window. Every point is
 * read as a point ON that sphere — y fixes the latitude, so it rides a circle
 * of radius ρ = √(R² − (CY−y)²), and x fixes the longitude, sin λ = (x−CX)/ρ —
 * then λ → λ + turn and x is recomputed. Occlusion is per segment, as there:
 * each cubic is split (de Casteljau, so the halves trace the original exactly)
 * until no piece spans more than MAX_HALF_SPAN of longitude, and each piece is
 * dropped on its own once its centre passes the limb, where it is edge-on and
 * tucked under the ring.
 *
 * Two of EarthIcon's continents, not all three: at this radius three is a mush
 * of squiggles rather than a planet. A far-side pair rides half a turn behind
 * so the window never empties — hidden at rest by construction, since a back
 * point's longitude lands in [90°, 270°].
 *
 * The land turns LINEARLY while the ship rolls on quint. A planet does rotate
 * at a constant rate, and sharing the roll's ease would put the land broadside
 * at exactly the two instants the ship is edge-on and the window shut. Linear
 * moves those peaks to p = 0.25 and 0.75, where the roll is 6° and 354°.
 *
 * The land sits INSIDE the rolled group and so foreshortens with the ship,
 * while the ring computes its own cos θ — the two agree because it is the same
 * angle. The ring is drawn last, so it covers any land past the opening for
 * free, which is why the land needs no clip path.
 *
 * THE EXHAUST is FallIcon's dash pass. Each streak sweeps out —
 * its tail running off the far end, so the old trail leaves the
 * way it came in rather than being switched off — and then a
 * new head draws back out from the ship. The supplied lines are
 * already authored ship-end-first, so path position 0 is the
 * end the draw starts from, which is the direction exhaust
 * should grow. The streaks do NOT ride the roll or the wobble:
 * they are the trail left in space, not part of the ship.
 *
 * EASING, per the animations.dev decision tree: the draw-on is
 * an element ENTERING → ease-out quart. The sweep-out is LINEAR,
 * the one curve that does not park the stroke near zero length
 * on its way out and leave a BEAD under the round caps. Both
 * are written as polynomials so shaping stays a pure function of
 * progress, with no bezier solver in the frame loop — and so
 * that every part of this icon can read the SAME progress value
 * and apply its own curve, which is what lets hover playback and
 * the Scrub Lab pose identically.
 * ───────────────────────────────────────────────────────── */

const DURATION = 1.5;

/** The supplied art's weights: body 1, porthole rim 0.8. */
const STROKE = 1;
const PORT_STROKE = 0.8;

/**
 * The ship's centreline, recovered from the art: x + y = 18.9074, running
 * up-right along (1, −1)/√2. Only its DIRECTION is needed for the roll — a
 * scale about any point of a line is the same transform — so the porthole's
 * centre serves as the pivot, being both exactly on the axis and a landmark.
 */
const AXIS_PERPENDICULAR_DEGREES = 45;

/** Porthole. Your 1.6 circle stroked at 0.8 is an annulus from 1.2 to 2.0. */
const PORT_CX = 13.5;
const PORT_CY = 5.40771;
const PORT_R_OUT = 2;
const PORT_R_IN = 1.2;

/** Half the window's depth. The edge-on slab is twice this. */
const PORT_EXTRUDE = 0.35;

/** Polyline samples per arc of the extruded ring. */
const ARC_SEGMENTS = 20;

/**
 * The planet past the window. Slightly wider than the opening, so a coastline
 * reaching its limb is already under the ring's fill rather than ending in mid
 * air — EarthIcon's composition hand-off, at 1/6 the size.
 */
const PLANET_R = 1.4;
const LAND_STROKE = 0.35;
const LAND_DEGREES = 360;

/** Longitude half-span above which a coastline cubic is split again. */
const MAX_HALF_SPAN = 8;
const MAX_SPLIT_DEPTH = 6;

/** A full turn. 360° is the identity, so the last frame is the first. */
const ROLL_DEGREES = 360;

/**
 * Sway and thrust. 2° about the tail swings the nose ~0.6 units and the surge
 * adds 0.35 along the axis — both inside §0.4's 0.5–3 band. The tail is the
 * pivot because a rocket's nose is what should wander; pivoting at the centre
 * reads as a seesaw.
 */
const WOBBLE_DEGREES = 2;
const WOBBLE_PIVOT_X = 6;
const WOBBLE_PIVOT_Y = 12.9;
const SURGE = 0.35;

/** Per-streak beats, in seconds — the whole redraw lands by ~415ms. */
const SWEEP = 0.13;
const DRAW = 0.15;

/** The three delays a streak can be dealt. Unevenly spaced on purpose: an even
 *  cascade reads as a mechanical sweep however you shuffle it. */
const DELAY_SLOTS = [0, 0.06, 0.135] as const;

/** A zero-ink guard: below this the dash carries no length at all and would
 *  render as a stray dot parked on the line. Short dashes ABOVE it still round
 *  into a bead under the caps, which is wanted — that bead is the exhaust
 *  re-igniting, and easeOutQuart grows it into a full streak in about 22ms. */
const INK_FLOOR = 0.015;

/** The ship, exactly as supplied. */
const BODY_D =
  "M3.99976 10.9077L1.38232 10.2064C1.00064 10.1041 0.882822 9.62038 1.17472 9.35405L5.35682 5.53828C5.44893 5.45423 5.56913 5.40764 5.69382 5.40764H9.49976M3.99976 10.9077L9.49976 5.40764M3.99976 10.9077L4.10837 10.9729L6.39146 12.3427C6.46254 12.3853 6.5219 12.445 6.56421 12.5163L7.95928 14.8672M7.95928 14.8672C7.98163 14.8896 8.01788 14.8896 8.04023 14.8672L13.4998 9.40763C13.4998 9.40763 15 7.90765 16 6.90761C17.4822 5.42532 18.1648 2.36654 18.3999 1.0421C18.457 0.720636 18.1872 0.450879 17.8658 0.507919C16.5413 0.742928 13.4823 1.42543 12 2.90771C11 3.90766 9.49976 5.40764 9.49976 5.40764M13.4998 9.40763L13.5 13.2176C13.5 13.34 13.4551 13.4582 13.3738 13.5497L9.64711 17.7451C9.38856 18.0362 8.91123 17.9332 8.79578 17.5614L7.95928 14.8672";

/** Exhaust, ship-end first — path position 0 is where each redraw begins. */
const STREAKS = [
  { key: "streak-near", d: "M3 12.9077L1.5 14.4077" },
  { key: "streak-mid", d: "M5 13.9077L0.5 18.4077" },
  { key: "streak-far", d: "M6 15.9077L3.5 18.4077" },
] as const;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const n = (v: number) => Number(v.toFixed(4));
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (lo: number, v: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Longitude folded onto one full turn, [-180°, 180°) — near face AND far. */
const wrapTurn = (deg: number) => (((deg % 360) + 540) % 360) - 180;

/**
 * How far round the planet the far-side coastlines are carried.
 *
 * NOT 180°. At exactly half a turn the two sets reach their limbs together, so
 * both go edge-on at the same instant and the window empties — measured, the
 * thinnest frame carried 0.61 units of coastline against 4.72 at rest. Offset
 * to 240° the sets take turns, and the thinnest frame carries 2.98. The far
 * side is still entirely hidden at rest, which is what keeps the resting window
 * to two continents instead of four.
 */
const LAND_FAR_PHASE = 240;

/** Entering → ease-out. Quart is the strong end of the blueprint's range. */
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

/** Quiet ends, snappy whip mid-turn — the curve GemIcon and GlobeSpinIcon
 *  turn on, written as a polynomial so no solver runs in the frame loop. */
const easeInOutQuint = (t: number) =>
  t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;

type Point = readonly [number, number];
type Cubic = readonly [Point, Point, Point, Point];

/** EarthIcon's own coastlines, mapped onto the planet at the window. Two of its
 *  three continents for the near face; two more, half a turn behind, so the
 *  window never empties. All pure `M` + `C`, like the shapes they came from. */
const EARTH_CENTRE: Point = [11.8069, 11.8068];
const EARTH_R = 9;
const NEAR_COASTS = [
  "M19.6782 14.9761C17.0427 13.8922 16.6717 11.5617 15.3625 12.499C14.6524 13.0073 14.0752 13.3444 13.9142 14.2027C13.7342 15.1623 15.2673 15.5752 14.8938 16.5028C14.3656 17.8147 15.8081 18.6496 16.5293 19.067",
  "M19.4922 7.55358C17.382 9.3307 13.2171 11.9379 13.4388 8.14962C13.623 5.00134 11.9367 5.10409 10.7857 5.52659C10.1508 5.75968 9.40743 5.72559 8.90922 5.26806C8.39758 4.7982 7.81673 4.24334 7.66239 4.01035",
] as const;
const FAR_COASTS = [
  "M4.00051 7.4999C5.69965 8.38187 8.70836 9.70389 8.70836 7.28978C8.70836 5.47427 10.4147 5.03722 10.5 3",
  "M3.99142 14.6853C6.62687 13.6014 6.19072 15.0627 7.5 16C8.21006 16.5083 11.4999 15.9999 7.14012 18.9999",
] as const;

/** Similarity map from EarthIcon's 9-radius sphere onto this 1.4-radius one. */
const intoWindow = ([x, y]: Point): Point => [
  PORT_CX + ((x - EARTH_CENTRE[0]) * PLANET_R) / EARTH_R,
  PORT_CY + ((y - EARTH_CENTRE[1]) * PLANET_R) / EARTH_R,
];

const radiusAt = (y: number) =>
  Math.sqrt(Math.max(1e-9, PLANET_R ** 2 - (PORT_CY - y) ** 2));
const longitudeAt = ([x, y]: Point) =>
  Math.asin(clamp(-1, (x - PORT_CX) / radiusAt(y), 1)) / DEG;

const halfSpan = (cubic: Cubic) => {
  const lons = cubic.map(longitudeAt);
  return (Math.max(...lons) - Math.min(...lons)) / 2;
};

/** de Casteljau split at t = 0.5. The two halves trace the original exactly. */
function splitCubic([p0, p1, p2, p3]: Cubic): [Cubic, Cubic] {
  const mid = (a: Point, b: Point): Point => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const a = mid(p0, p1);
  const b = mid(p1, p2);
  const c = mid(p2, p3);
  const d = mid(a, b);
  const e = mid(b, c);
  const f = mid(d, e);
  return [
    [p0, a, d, f],
    [f, e, c, p3],
  ];
}

interface LandPoint {
  y: number;
  rho: number;
  lon: number;
}
interface Segment {
  points: LandPoint[];
  centre: number;
}

/** Invert one coastline onto the planet and cut it into pieces narrow enough
 *  to occlude individually — the granularity is what keeps a shape from
 *  popping out mid-window instead of winking out under the ring. */
function toLand(d: string): Segment[] {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const points: Point[] = [];
  for (let i = 0; i < nums.length; i += 2)
    points.push(intoWindow([nums[i], nums[i + 1]]));

  const fine: Cubic[] = [];
  const split = (cubic: Cubic, depth: number) => {
    if (depth < MAX_SPLIT_DEPTH && halfSpan(cubic) > MAX_HALF_SPAN) {
      const [first, second] = splitCubic(cubic);
      split(first, depth + 1);
      split(second, depth + 1);
    } else {
      fine.push(cubic);
    }
  };
  for (let i = 1; i < points.length; i += 3)
    split([points[i - 1], points[i], points[i + 1], points[i + 2]], 0);

  return fine.map((cubic) => {
    const pts = cubic.map((q) => ({
      y: q[1],
      rho: radiusAt(q[1]),
      lon: longitudeAt(q),
    }));
    const lons = pts.map((q) => q.lon);
    return { points: pts, centre: (Math.min(...lons) + Math.max(...lons)) / 2 };
  });
}

/** Rebuild one coastline after `turn` degrees, emitting only the pieces still
 *  on the near face. Returns "" once the whole shape is round the back. */
function projectLand(land: Segment[], turn: number): string {
  let d = "";
  let previousEnd = "";
  for (const segment of land) {
    if (Math.abs(wrapTurn(segment.centre + turn)) >= 90) {
      previousEnd = "";
      continue;
    }
    const xy = segment.points.map((q) => {
      const lon = clamp(-90, wrapTurn(q.lon + turn), 90) * DEG;
      return `${n(PORT_CX + q.rho * Math.sin(lon))} ${n(q.y)}`;
    });
    if (xy[0] !== previousEnd) d += `M${xy[0]}`;
    d += `C${xy[1]} ${xy[2]} ${xy[3]}`;
    previousEnd = xy[3];
  }
  return d;
}

const LAND_LAYERS = [
  ...NEAR_COASTS.map((d, i) => ({ land: toLand(d), phase: 0, key: `near-${i}` })),
  ...FAR_COASTS.map((d, i) => ({
    land: toLand(d),
    phase: LAND_FAR_PHASE,
    key: `far-${i}`,
  })),
];

/** Ship axis (1, −1)/√2 and its screen perpendicular, for the extruded ring. */
const VX = Math.SQRT1_2;
const VY = -Math.SQRT1_2;
const UX = Math.SQRT1_2;
const UY = Math.SQRT1_2;
const ringPoint = (along: number, across: number) =>
  `${n(PORT_CX + VX * along + UX * across)} ${n(PORT_CY + VY * along + UY * across)}`;

/**
 * Silhouette of the extruded window as an evenodd pair of outlines — Search3D's
 * lens, on this axis and these radii.
 *
 * Solid: hull of the two outer face ellipses (semi-major PORT_R_OUT along the
 * axis, semi-minor PORT_R_OUT·|cos θ| across it, centres at ±a across, where
 * a = PORT_EXTRUDE·|sin θ|). The ellipse tangents at the axis extremes point
 * across, so straight chords there close the hull exactly.
 *
 * Hole: the overlap of the two inner openings — a vesica that shrinks as the
 * window turns and vanishes once PORT_R_IN·|cos θ| drops below a, closing into
 * the solid edge-on slab with no fade needed.
 *
 * At θ = 0 both faces coincide and this is a plain annulus, identical to the
 * circle in the supplied art.
 */
function ringPath(theta: number): string {
  const a = Math.abs(PORT_EXTRUDE * Math.sin(theta));
  const c = Math.abs(Math.cos(theta));

  const hull: string[] = [];
  const ryOut = PORT_R_OUT * c;
  const half = (sign: 1 | -1, start: number) => {
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = start + (Math.PI * i) / ARC_SEGMENTS;
      hull.push(
        ringPoint(PORT_R_OUT * Math.cos(t), sign * a + ryOut * Math.sin(t)),
      );
    }
  };
  half(1, 0);
  half(-1, Math.PI);
  let d = `M${hull.join("L")}Z`;

  const ryIn = PORT_R_IN * c;
  if (ryIn > a) {
    const sMax = PORT_R_IN * Math.sqrt(1 - (a / ryIn) ** 2);
    const hole: string[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      // Near arc of the back opening, tip to tip.
      const s = sMax * Math.cos((Math.PI * i) / ARC_SEGMENTS);
      const h = ryIn * Math.sqrt(Math.max(0, 1 - (s / PORT_R_IN) ** 2));
      hole.push(ringPoint(s, h - a));
    }
    for (let i = 1; i < ARC_SEGMENTS; i++) {
      // Far arc of the front opening, back to the start.
      const s = -sMax * Math.cos((Math.PI * i) / ARC_SEGMENTS);
      const h = ryIn * Math.sqrt(Math.max(0, 1 - (s / PORT_R_IN) ** 2));
      hole.push(ringPoint(s, a - h));
    }
    d += ` M${hole.join("L")}Z`;
  }
  return d;
}

/**
 * The barrel roll, as one SVG transform list. Read it
 * RIGHT TO LEFT, which is the order it applies to the geometry:
 *
 *   · move the roll pivot to the origin;
 *   · rotate by −45°, which carries the axis-PERPENDICULAR (1, 1)/√2 onto the
 *     x-axis and the axis itself onto y;
 *   · scale x by cos θ — squashing ACROSS the ship, never along it;
 *   · rotate by +45° and move home.
 *
 * The two rotates are easy to get backwards, and backwards is not a subtle
 * bug: it squashes the ship end-to-end instead, which at 180° mirrors nose
 * into tail. The test pins the real invariant — under a roll a point's
 * along-axis position is PRESERVED and its perpendicular offset scales by
 * cos θ, so anything on the centreline (the nose, the porthole) never moves.
 *
 * cos θ passes smoothly through zero rather than being floored, because that
 * crossing is what flips the fin to the other side and sells the roll.
 */
function rollAngle(p: number): number {
  return ROLL_DEGREES * easeInOutQuint(p) * DEG;
}

/** Sway about the tail and surge along the axis. Everything the ship carries
 *  rides this, including the window, which computes its own foreshortening. */
function hullTransform(p: number): string {
  const wobble = n(
    WOBBLE_DEGREES * (0.6 * Math.sin(2 * TAU * p) + 0.4 * Math.sin(3 * TAU * p)),
  );
  const surge = SURGE * Math.sin(TAU * p) * Math.SQRT1_2;
  return (
    `translate(${n(surge)} ${n(-surge)})` +
    `rotate(${wobble} ${WOBBLE_PIVOT_X} ${WOBBLE_PIVOT_Y})`
  );
}

/** The barrel roll alone. */
function rollTransform(p: number): string {
  return (
    `translate(${PORT_CX} ${PORT_CY})` +
    `rotate(${AXIS_PERPENDICULAR_DEGREES})` +
    `scale(${n(Math.cos(rollAngle(p)))} 1)` +
    `rotate(${-AXIS_PERPENDICULAR_DEGREES})` +
    `translate(${-PORT_CX} ${-PORT_CY})`
  );
}

/**
 * Dash geometry for one streak at master progress `p`.
 *
 * The visible span is [tail, head]. Sweeping runs the tail off the far end
 * while the head stays there; drawing runs a new head out from the ship while
 * the tail sits at 0. Both ends are at rest (0 and 1) outside the streak's own
 * window, so it is simply full length before and after its beat.
 *
 * Spacing stays 1, so the dash period is length+1 > 1 and only ONE dash can
 * ever land on the path — no stray repeat creeping in from either end.
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

/**
 * Shuffle the delay slots (Fisher–Yates) so the exhaust redraws in a different
 * order each play. Randomness is safe HERE and nowhere else in this file: it is
 * drawn once per play from an event handler — never during render, so server
 * and client markup cannot disagree, and never per frame, so within a play
 * every frame stays a pure function of progress. That is what keeps the Scrub
 * Lab honest, since `makeScrubber` deals one hand that holds for the session.
 */
function dealDelays(): number[] {
  const delays = [...DELAY_SLOTS];
  for (let i = delays.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [delays[i], delays[j]] = [delays[j], delays[i]];
  }
  return delays;
}

export const RocketIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate<SVGSVGElement>();
  const progress = useMotionValue(0);
  const shouldReduceMotion = useReducedMotion();
  const hullRef = useRef<SVGGElement>(null);
  const rollRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGPathElement>(null);
  const landRefs = useRef<(SVGPathElement | null)[]>([]);
  const streakRefs = useRef<(SVGPathElement | null)[]>([]);
  const delaysRef = useRef<number[]>([...DELAY_SLOTS]);

  useMotionValueEvent(progress, "change", (p) => {
    hullRef.current?.setAttribute("transform", hullTransform(p));
    rollRef.current?.setAttribute("transform", rollTransform(p));
    ringRef.current?.setAttribute("d", ringPath(rollAngle(p)));
    LAND_LAYERS.forEach(({ land, phase }, i) => {
      landRefs.current[i]?.setAttribute(
        "d",
        projectLand(land, phase + LAND_DEGREES * p),
      );
    });
    STREAKS.forEach((_, i) => {
      const el = streakRefs.current[i];
      if (!el) return;
      const { length, offset } = strokeDash(p, delaysRef.current[i]);
      if (length < INK_FLOOR) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = "";
      el.setAttribute("stroke-dasharray", `${length.toFixed(4)} 1`);
      el.setAttribute("stroke-dashoffset", `${(-offset).toFixed(4)}`);
    });
  });

  /** One play, on a freshly dealt hand. Linear: every curve in this icon lives
   *  in the pure functions above, so easing the tween would double-apply it. */
  const run = (p: MotionValue<number>) => {
    delaysRef.current = dealDelays();
    p.jump(0);
    return animate(p, 1, { duration: DURATION, ease: "linear" });
  };

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      await run(progress);
    },
    createScrubber() {
      return makeScrubber(
        () => run(progress),
        // Cancel restores what Motion wrote, but the motion value keeps its
        // last scrubbed value; reset so every track recomputes back to rest.
        () => progress.jump(0),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="19"
      height="19"
      viewBox="0 0 19 19"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      {/* Sway and surge carry everything the ship owns. */}
      <g ref={hullRef} transform={hullTransform(0)}>
        {/* Hull and the planet behind the glass share the barrel roll, so the
            land foreshortens with the window it is seen through. */}
        <g ref={rollRef} transform={rollTransform(0)}>
          <path d={BODY_D} />
          {LAND_LAYERS.map(({ land, phase, key }, i) => (
            <path
              key={key}
              ref={(el) => {
                landRefs.current[i] = el;
              }}
              d={projectLand(land, phase)}
              strokeWidth={LAND_STROKE}
              strokeLinecap="round"
            />
          ))}
        </g>
        {/* The window frame, extruded. Filled, not stroked, and drawn LAST so
            it covers any coastline past the opening — which is what saves the
            land from needing a clip path. At rest it is a plain annulus,
            identical to the circle in the supplied art. */}
        <path
          ref={ringRef}
          d={ringPath(0)}
          fill="currentColor"
          fillRule="evenodd"
          stroke="none"
        />
      </g>
      {/* Exhaust stays put — it is the trail left in space, not part of the
          ship. pathLength="1" normalises the dash units, so the numbers written
          per frame are plain fractions of each line. Rendered markup at rest is
          the untouched glyph: full strokes, no dash attributes until the first
          frame writes them. */}
      {STREAKS.map(({ key, d }, i) => (
        <path
          key={key}
          ref={(el) => {
            streakRefs.current[i] = el;
          }}
          d={d}
          pathLength="1"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
});

RocketIcon.displayName = "RocketIcon";
