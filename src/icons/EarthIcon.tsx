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
 * ANIMATION STORYBOARD — one earth, drawn twice, turning
 * (the coastlines sweep west→east through a full 360° in one
 * ease-in-out-quint gesture: long quiet wind-up, a snappy whip
 * through mid-flight, long braking glide into the landing)
 *
 *    0ms  earth at rest: rim + the three near landmasses,
 *         pixel-identical to the supplied glyph      (frame 1)
 *  0-1500ms  every point rides its own latitude circle around
 *         the globe; the near face rolls off one limb as the
 *         far face rolls on from the other
 *  1500ms  360° is the identity rotation, so the composition
 *         is pixel-identical to rest and replays seamlessly
 *
 * GlobeSpinIcon's and GemIcon's technique — Class D-3 per
 * ICON-SYSTEM §2 — but applied to ARBITRARY AUTHORED ART
 * rather than to parametric geometry. Those two build their
 * moving parts from formulas; here the shapes are hand-drawn
 * squiggles, so the projection is INVERTED out of the artwork
 * first and then replayed forward.
 *
 * THE INVERSION. The rim is an exact circle (recovered from
 * the supplied path: centre 11.8069, 11.8068, r 9.000). Read
 * every authored point as a point ON that sphere under an
 * orthographic side view: its y fixes the latitude, so it
 * rides a latitude circle of radius ρ = √(R² − (CY−y)²), and
 * its x fixes the longitude, sin λ = (x − CX)/ρ. Spinning
 * about the polar axis then means one thing per point:
 *
 *     λ → λ + turn,   x = CX + ρ·sin λ,   y unchanged
 *
 * So the whole animation is one `spin` motion value and one
 * sine per point. Points near the poles have small ρ and
 * barely move; points on the equator sweep the full width.
 * That differential is what makes a flat squiggle read as
 * something wrapped around a ball instead of sliding across a
 * disc.
 *
 * TWO AUTHORED FACES. Both hemispheres are drawn art, not
 * derived: FRONT_PATHS is the resting glyph, BACK_PATHS is
 * the other side, drawn as seen from behind and carried half
 * a turn away (§5.2 clone hand-off). Because a back point's
 * longitude lands in [90°, 270°] by construction, the back is
 * automatically, provably invisible at rest — the resting
 * icon is exactly the supplied front art, with no placement
 * rule to get wrong.
 *
 * THE SEAM. The two drawings were authored so their coastlines
 * meet: each of the six ends that runs off an edge of the
 * front is continued by one running off the OPPOSITE edge of
 * the back (the back is seen from behind, so its west edge is
 * the front's east limb) — five of the six, matched to within
 * 0.31 units of latitude. Under this projection two curves can only join
 * across a limb if they meet exactly AT it, so both ends of
 * every pair are welded onto the limb — see weldSeams(). Skip
 * that and the leftover longitude between a front tip and its
 * back continuation reads as a hole through the middle of the
 * face half a turn later.
 *
 * OCCLUSION IS PER SEGMENT, WHICH IS THE WHOLE TRICK. Land
 * that has gone round the back must not draw through the
 * front — the topology problem that stops a plain d-morph
 * from expressing a spin at all. The fix is to make occlusion
 * fine-grained: each authored cubic is recursively split
 * (de Casteljau, so the halves trace the original EXACTLY)
 * until no piece spans more than MAX_HALF_SPAN of longitude,
 * and each piece is then dropped on its own the moment its
 * centre passes the limb. A piece that narrow is, at that
 * moment, compressed into the outer 0.08 units of the disc —
 * so it winks out underneath the rim's own 1.5-wide stroke.
 * ICON-SYSTEM loop strategy 3, composition hand-off, at the
 * granularity of a path segment rather than a whole shape.
 *
 * The pieces are re-emitted as SUBPATHS of one `d`, so all
 * this costs is a longer string — still one <path> per
 * landmass, and at rest a single unbroken subpath that traces
 * the supplied art to within 0.0006 units.
 *
 * WHY NOT JUST CLAMP TO THE LIMB. The first cut of this icon
 * held whole landmasses on screen and pinned their off-limb
 * points at λ = ±90°. Geometrically sound, visually wrong: a
 * wide shape rolling off the edge piled into a long arc lying
 * just inside the rim, and the sliver of background trapped
 * between that arc and the rim read as a slash cutting
 * through the ring. Splitting the shape removes the pile-up
 * at the source. A ±90° clamp is still applied per point, but
 * with segments this small it never moves anything more than
 * 0.08 units and exists only as a guard.
 *
 * NO AXIAL TILT, deliberately. The rim path's on-curve points
 * sit at 156.931°/66.931°/−23.068°/−113.068°, i.e. the art
 * was exported rotated by −23.068° — earth's axial tilt, and
 * invisible on a circle. Spinning about that tilted axis was
 * tried and rejected: re-projecting through it drives the
 * northern landmass's tail to ρ ≈ 1.9, which pins it to the
 * axis while its head sweeps the full 9 units and shears the
 * shape apart. A vertical axis keeps the smallest ρ at 4.5.
 * ───────────────────────────────────────────────────────── */

const DURATION = 1.5;

/** ease-in-out-quint: quieter ends, snappier whip mid-turn than quart. */
const EASE_IN_OUT_QUINT = [0.86, 0, 0.07, 1] as const;

/** The sphere, recovered from the supplied rim path. */
const CX = 11.8069;
const CY = 11.8068;
const R = 9;

/** Total sweep. 360° is the identity rotation, so rest == final frame. */
const SPIN_DEGREES = 360;

/** How far round the globe the back face is carried. */
const BACK_PHASE = 180;

/**
 * How close in latitude two ends must sit to count as one coastline crossing
 * the limb. The real pairs in this art match within 0.31 and the nearest false
 * pair is 3.79 away, so the threshold has an order of magnitude of slack either
 * side. Ends with no partner inside it are left exactly as drawn.
 */
const SEAM_LATITUDE_TOLERANCE = 1;

/**
 * Longitude half-span above which a cubic is split again. Small enough that a
 * segment is edge-on when it is dropped at the limb (8° leaves it inside the
 * outer 0.08 units of the disc, well under the rim's 0.75 stroke half-width),
 * large enough to keep the subdivision at ~40 segments per face.
 *
 * Near the poles the depth cap bites first and spans reach ~11°, which costs
 * nothing: a short latitude circle keeps EVERY longitude on it hugging the rim,
 * so a wide-span polar segment is still edge-on when it goes. Span is only a
 * proxy; the invariant that matters is how far a dropped segment sits from the
 * rim, and the geometry test measures that directly (worst case 0.08).
 */
const MAX_HALF_SPAN = 8;

/** Guard against runaway recursion if a curve is pathologically steep. */
const MAX_SPLIT_DEPTH = 6;

/**
 * The near face, exactly as supplied — this is the resting glyph. Each path is
 * `M` + a run of `C`s. Only x ever changes; y is latitude, and a polar spin
 * preserves it.
 */
const FRONT_PATHS = [
  "M19.4922 7.55358C17.382 9.3307 13.2171 11.9379 13.4388 8.14962C13.623 5.00134 11.9367 5.10409 10.7857 5.52659C10.1508 5.75968 9.40743 5.72559 8.90922 5.26806C8.39758 4.7982 7.81673 4.24334 7.66239 4.01035",
  "M4.0041 7.52162C4.46745 8.32615 5.48236 9.16283 6.41959 9.8192C7.31247 10.4445 7.37658 11.8137 6.84016 12.7627C6.6414 13.1143 6.51439 13.4866 6.54183 13.845C6.68325 15.692 9.78424 14.3467 10.8279 15.8771C12.0429 17.659 7.69102 17.3835 6.9533 19.3085",
  "M19.6782 14.9761C17.0427 13.8922 16.6717 11.5617 15.3625 12.499C14.6524 13.0073 14.0752 13.3444 13.9142 14.2027C13.7342 15.1623 15.2673 15.5752 14.8938 16.5028C14.3656 17.8147 15.8081 18.6496 16.5293 19.067",
] as const;

/**
 * The far face, drawn as seen from behind. Never visible at rest — every point
 * of it projects to a longitude in [90°, 270°], i.e. round the back.
 */
const BACK_PATHS = [
  "M4.00051 7.4999C5.69965 8.38187 8.70836 9.70389 8.70836 7.28978C8.70836 5.47427 10.4147 5.03722 10.5 3",
  "M19.6492 7.797C14.7795 7.51612 21.078 12.9696 18.1069 14.7344C17.7457 14.949 17.2923 14.8813 16.9275 14.6728L16.8856 14.6489C15.7642 14.0081 14.6028 14.9437 15.2033 16.0872C16.052 17.7036 17.0002 18.9999 17.0002 18.9999",
  "M3.99142 14.6853C6.62687 13.6014 6.19072 15.0627 7.5 16C8.21006 16.5083 11.4999 15.9999 7.14012 18.9999",
] as const;

type Point = readonly [number, number];
type Cubic = readonly [Point, Point, Point, Point];

const DEG = Math.PI / 180;
const n = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Longitude folded onto one full turn, [-180°, 180°) — front AND back. */
const wrapTurn = (deg: number) => (((deg % 360) + 540) % 360) - 180;

/** Radius of the latitude circle through `y`. Zero at the poles, R at the equator. */
const radiusAt = (y: number) => Math.sqrt(Math.max(1e-9, R * R - (CY - y) ** 2));

/** Longitude of an authored point, from its offset along its own latitude circle. */
const longitudeAt = ([x, y]: Point) =>
  Math.asin(clamp((x - CX) / radiusAt(y), -1, 1)) / DEG;

/**
 * Read a path as `M` plus pure cubics, so everything downstream can assume one
 * command shape. The art is nearly all cubics already, but the back face has a
 * straight `L`; a line rewritten as a cubic with its handles a third and two
 * thirds along traces the identical segment. Implicit command repetition is
 * handled too (a bare run of numbers after `C` is another cubic; after `M` it
 * is a line, per the SVG spec).
 */
function toCubicPath(d: string): Point[] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const points: Point[] = [];
  let cursor: Point = [0, 0];
  let i = 0;
  let command = "";
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
    if (command === "M") {
      cursor = [num(), num()];
      points.push(cursor);
      command = "L";
    } else if (command === "C") {
      const a: Point = [num(), num()];
      const b: Point = [num(), num()];
      const end: Point = [num(), num()];
      points.push(a, b, end);
      cursor = end;
    } else if (command === "L") {
      const end: Point = [num(), num()];
      const dx = end[0] - cursor[0];
      const dy = end[1] - cursor[1];
      points.push(
        [cursor[0] + dx / 3, cursor[1] + dy / 3],
        [cursor[0] + (2 * dx) / 3, cursor[1] + (2 * dy) / 3],
        end,
      );
      cursor = end;
    } else {
      break;
    }
  }
  return points;
}

function writePath(points: Point[]): string {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 3) {
    d += `C${points[i][0]} ${points[i][1]} ${points[i + 1][0]} ${points[i + 1][1]} ${points[i + 2][0]} ${points[i + 2][1]}`;
  }
  return d;
}

/** Which point of a path to move, and which handle travels with it. */
interface EndRef {
  path: number;
  end: number;
  handle: number;
}

function collectEnds(paths: readonly string[]) {
  return paths.flatMap((d, path) => {
    const p = toCubicPath(d);
    return [
      { ref: { path, end: 0, handle: 1 }, point: p[0] },
      {
        ref: { path, end: p.length - 1, handle: p.length - 2 },
        point: p[p.length - 1],
      },
    ];
  });
}

/** Move one endpoint to `target`, dragging its handle so the tangent survives. */
function moveEnd(points: Point[], ref: EndRef, target: Point) {
  const dx = target[0] - points[ref.end][0];
  const dy = target[1] - points[ref.end][1];
  points[ref.end] = target;
  points[ref.handle] = [points[ref.handle][0] + dx, points[ref.handle][1] + dy];
}

/**
 * Weld the two faces into one continuous set of coastlines.
 *
 * The faces were authored to meet: five of the six coastline ends pair across
 * the limbs, matched to within 0.31 units of latitude. Mind the mirror — the
 * back is drawn as seen from behind and rendered half a turn round, so a point
 * drawn WEST of centre continues the front's EAST limb. Two ends have no
 * partner (the front's north-west tip and the back's polar tip) and are left
 * exactly as drawn; they read as coastlines that simply stop.
 *
 * BOTH ends of a pair have to move. The front can only express longitudes in
 * [-90°, 90°] and the back only [90°, 270°], so the single longitude the two
 * can share is the limb itself. Welding only the back (the first attempt) left
 * the front tip stopping short, and the leftover ~21° of longitude between them
 * is invisible while it sits at the limb — about 0.5 units — but opens to some
 * 3 units of plain gap once the turn brings it round to the middle of the face.
 * So each pair is pulled onto the limb at the front end's latitude: the front
 * end moves straight out to the rim, the back end onto the mirrored point.
 *
 * That is the one place the resting glyph departs from the supplied art, and
 * it is the point of the exercise: the coastlines now run off the edge instead
 * of stopping just inside it. Displacements are reported by the geometry test.
 */
function weldSeams(): { front: string[]; back: string[] } {
  const front = FRONT_PATHS.map((d) =>
    toCubicPath(d).map((q): Point => [q[0], q[1]]),
  );
  const back = BACK_PATHS.map((d) =>
    toCubicPath(d).map((q): Point => [q[0], q[1]]),
  );
  const unpaired = collectEnds(BACK_PATHS);

  for (const f of collectEnds(FRONT_PATHS)) {
    const east = longitudeAt(f.point) > 0;
    let pick = -1;
    let closest = Infinity;
    unpaired.forEach((b, i) => {
      if (longitudeAt(b.point) < 0 !== east) return;
      const gap = Math.abs(b.point[1] - f.point[1]);
      if (gap < closest) {
        closest = gap;
        pick = i;
      }
    });
    // No partner within tolerance: a coastline that simply ends. Leave it.
    if (pick < 0 || closest > SEAM_LATITUDE_TOLERANCE) continue;
    const [b] = unpaired.splice(pick, 1);
    const y = f.point[1];
    const rho = radiusAt(y);
    moveEnd(front[f.ref.path], f.ref, [east ? CX + rho : CX - rho, y]);
    moveEnd(back[b.ref.path], b.ref, [east ? CX - rho : CX + rho, y]);
  }

  return { front: front.map(writePath), back: back.map(writePath) };
}

/** One point of the artwork, re-expressed on the sphere. */
interface LandPoint {
  y: number;
  /** Radius of this point's latitude circle. */
  rho: number;
  lon: number;
}

/** One cubic of the artwork, small enough to occlude as a unit. */
interface Segment {
  points: LandPoint[];
  /** Longitude midway between the segment's extremes. */
  centre: number;
}

/** Read an authored point as a point on the sphere. */
function toSpherePoint(p: Point): LandPoint {
  return { y: p[1], rho: radiusAt(p[1]), lon: longitudeAt(p) };
}

/** Longitude half-span of a cubic once projected onto the sphere. */
function halfSpan(cubic: Cubic): number {
  const lons = cubic.map((p) => longitudeAt(p));
  return (Math.max(...lons) - Math.min(...lons)) / 2;
}

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

/**
 * Invert the orthographic projection out of an authored path and cut it into
 * segments narrow enough to occlude individually. Every authored point sits
 * inside the rim (furthest is 8.935 of 9.0, and welded ends land exactly on
 * it), so the asin is never degenerate; the clamp is defensive only.
 */
function toLand(d: string): Segment[] {
  const points = toCubicPath(d);

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
  for (let i = 1; i < points.length; i += 3) {
    split([points[i - 1], points[i], points[i + 1], points[i + 2]], 0);
  }

  return fine.map((cubic) => {
    const pts = cubic.map(toSpherePoint);
    const lons = pts.map((p) => p.lon);
    return {
      points: pts,
      centre: (Math.min(...lons) + Math.max(...lons)) / 2,
    };
  });
}

/**
 * Rebuild one landmass after `turn` degrees of spin, emitting only the segments
 * still on the front face. Consecutive survivors share an endpoint exactly, so
 * they join into one subpath; a gap opens a new `M`, and because a segment only
 * ever drops while it is edge-on at the limb, every such break lands on the rim
 * and hides under its stroke. Returns "" once the whole shape is behind.
 */
function project(land: Segment[], turn: number): string {
  let d = "";
  let previousEnd = "";
  for (const segment of land) {
    if (Math.abs(wrapTurn(segment.centre + turn)) >= 90) {
      previousEnd = "";
      continue;
    }
    const xy = segment.points.map((p) => {
      const lon = clamp(wrapTurn(p.lon + turn), -90, 90) * DEG;
      return `${n(CX + p.rho * Math.sin(lon))} ${n(p.y)}`;
    });
    if (xy[0] !== previousEnd) d += `M${xy[0]}`;
    d += `C${xy[1]} ${xy[2]} ${xy[3]}`;
    previousEnd = xy[3];
  }
  return d;
}

/** The near face, then the far one half a turn behind it. */
const WELDED = weldSeams();
const LAYERS = [
  ...WELDED.front.map((d, i) => ({
    land: toLand(d),
    phase: 0,
    key: `front-${i}`,
  })),
  ...WELDED.back.map((d, i) => ({
    land: toLand(d),
    phase: BACK_PHASE,
    key: `back-${i}`,
  })),
];

function buildSequence(spin: MotionValue<number>): AnimationSequence {
  return [[spin, [0, 1], { duration: DURATION, ease: [...EASE_IN_OUT_QUINT] }]];
}

export const EarthIcon = forwardRef<
  IconHandle,
  Omit<SVGProps<SVGSVGElement>, "ref">
>((props, ref) => {
  const [scope, animate] = useAnimate();
  const spin = useMotionValue(0);
  const shouldReduceMotion = useReducedMotion();
  const landRefs = useRef<(SVGPathElement | null)[]>([]);

  const frames = useTransform(spin, (p) =>
    LAYERS.map(({ land, phase }) => project(land, phase + SPIN_DEGREES * p)),
  );
  useMotionValueEvent(frames, "change", (next) => {
    next.forEach((d, i) => landRefs.current[i]?.setAttribute("d", d));
  });

  useImperativeHandle(ref, () => ({
    async playAnimation() {
      // Guarded here as well as in the trigger row: the export gallery's
      // preview hover has no reduced-motion check of its own.
      if (shouldReduceMotion) return;
      spin.jump(0);
      await animate(buildSequence(spin));
    },
    createScrubber() {
      spin.jump(0);
      return makeScrubber(
        () => animate(buildSequence(spin)),
        // Sequence cancel restores DOM attributes, but the motion value keeps
        // its last scrubbed value; reset so the land recomputes back to rest.
        () => spin.jump(0),
      );
    },
  }));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      ref={scope}
      {...props}
    >
      <circle cx={CX} cy={CY} r={R} />
      {/* Land: d is driven imperatively from the spin value. The far face rests
          empty, so this renders as the supplied front glyph exactly. */}
      {LAYERS.map(({ land, phase, key }, i) => (
        <path
          key={key}
          ref={(el) => {
            landRefs.current[i] = el;
          }}
          d={project(land, phase)}
        />
      ))}
    </svg>
  );
});

EarthIcon.displayName = "EarthIcon";
