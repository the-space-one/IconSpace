/**
 * Combine-easing math: express a whole keyframe run as ONE global easing
 * curve, then place each intermediate keyframe at the time where that curve
 * naturally passes through its equal value step. This is the "retime" half
 * of the After Effects-style "Combine" operation.
 *
 * Pure cubic-bezier helpers — P0=(0,0), P3=(1,1), control points (x1,y1),
 * (x2,y2), same parameterization as CSS cubic-bezier() and Motion's array
 * easing.
 */

export type CombineEase = readonly [number, number, number, number] | "linear";

/**
 * The time fraction x at which the easing's value y reaches `v`.
 * Linear returns v unchanged. Bezier: bisection-solve Y(s) = v for the
 * curve parameter s (Y is monotonic for valid easings), then evaluate X(s).
 */
export function easeTimeFracAtValue(ease: CombineEase, v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  if (ease === "linear") return v;
  const [x1, y1, x2, y2] = ease;
  const bez = (s: number, c1: number, c2: number) =>
    3 * (1 - s) ** 2 * s * c1 + 3 * (1 - s) * s * s * c2 + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, y1, y2) < v) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const x = bez((lo + hi) / 2, x1, x2);
  return Math.min(1, Math.max(0, x));
}

/**
 * Stop positions (input range for useTransform) that make `segCount` equal
 * value steps land on one continuous easing curve: stop[i] is the time
 * fraction where the curve's value reaches i / segCount. Strictly ascending
 * for any monotonic easing.
 */
export function deriveStops(ease: CombineEase, segCount: number): number[] {
  const stops: number[] = [];
  for (let i = 0; i <= segCount; i++) {
    stops.push(easeTimeFracAtValue(ease, i / segCount));
  }
  return stops;
}

/**
 * Arc-length stop positions for a keyframe morph: place each keyframe at its
 * cumulative shape distance so that EQUAL time = EQUAL visual change. Without
 * this, keyframes that are close together in shape-space (a pose that barely
 * differs from its neighbour) dwell on screen while a distant pair rushes —
 * the morph looks like it stops on the frames.
 *
 * All keyframes here share an identical path-command structure, so the numeric
 * coordinates line up 1:1 across the `d` strings; the distance between two
 * frames is just the Euclidean norm of their coordinate differences. Returns a
 * strictly ascending range in [0, 1] to feed useTransform's input, so a
 * linearly-advancing progress value morphs the shape at constant speed.
 */
export function deriveDistanceStops(states: readonly string[]): number[] {
  const nums = states.map((s) =>
    (s.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number),
  );
  const dist: number[] = [];
  for (let i = 1; i < nums.length; i++) {
    let sumSq = 0;
    for (let j = 0; j < nums[i].length; j++) {
      const d = nums[i][j] - nums[i - 1][j];
      sumSq += d * d;
    }
    dist.push(Math.sqrt(sumSq));
  }
  const total = dist.reduce((a, b) => a + b, 0) || 1;
  const stops = [0];
  let acc = 0;
  for (const d of dist) {
    acc += d;
    stops.push(acc / total);
  }
  return stops;
}
