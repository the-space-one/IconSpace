// Builds public/hero/hedges.riv: the hero's background hedges, breathing.
//
//   node scripts/rig-hedges.mjs
//
// The hedges are `back.hedges` in src/components/shop-scene.tsx, which
// keep drawing them as plain SVG until the Rive file is up (and for reduced
// motion), so both come from the same path data. Each hedge is one scalloped
// outline split across a few paths. Rive keys every vertex, so a hedge swells
// from the ground up: the crown rises and spreads while the ends stay planted,
// which no transform on the whole path can do.
//
// There's no Rive editor in the loop. The file is written straight to the
// runtime's binary format (rive-app/rive-runtime, File::readObjects): a
// header, then objects as typeKey, (propertyKey, value)*, 0. Ids are indices
// into the artboard's object list, in stream order, artboard first.
//
// Needs svgpath (a devDependency) to normalise the path data.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import svgpath from "svgpath";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The band of the 1579×675 hero art the artboard covers: every hedge, with
// room above the crowns to rise into. hedges.tsx places its canvas on it.
const BAND = { y: 156, width: 1579, height: 168 };

// A breath is an inhale, a longer exhale, then a rest until the loop comes
// round. Each hedge starts its breath a little later than the last, and every
// one is at rest on the loop's first and last frame: the pose the SVG draws,
// so swapping the canvas in never jumps.
const FPS = 60;
const CYCLE = 6.4; // seconds
const INHALE = 2;
const EXHALE = 2.6;
// Sine-like, so a breath never stops dead at either end.
const EASE = [0.37, 0, 0.63, 1];
// At the top of a breath: how far the crown rises, as a fraction of the
// hedge's height, and how far the flanks spread, as a fraction of their
// distance from the hedge's middle. Both fade to nothing at the ground.
const RISE = 0.025;
const SPREAD = 0.012;

// Subpaths join a hedge by their centre x. `start` is when its breath
// begins, in seconds; the last one ends exactly as the loop does.
const HEDGES = [
  { name: "far-left", from: 0, to: 120, start: 1.8 },
  { name: "left", from: 330, to: 560, start: 0.9 },
  { name: "right", from: 970, to: 1579, start: 0 },
];

const COLOR = 0xffb8d4a8;

/* ── Path data ──────────────────────────────────────────── */

// The paths in `back.hedges`, in paint order.
function scenePaths() {
  const src = readFileSync(join(root, "src/components/shop-scene.tsx"), "utf8");
  const start = src.indexOf(`  hedges: (`, src.indexOf("const back = {"));
  const body = src.slice(start, src.indexOf("\n  ),", start));
  return [...body.matchAll(/<path fill="#b8d4a8" d="([^"]+)"/g)].map((match) => match[1]);
}

// Absolute cubic subpaths: { start, segments: [[c1x, c1y, c2x, c2y, x, y]] }.
function subpaths(d) {
  const out = [];
  let current;
  const open = (x, y) => out.push((current = { start: [x, y], segments: [] }));
  svgpath(d)
    .abs()
    .unarc()
    .unshort()
    .iterate(([command, ...a], _, x, y) => {
      if (command === "M") return void open(a[0], a[1]);
      if (command === "Z") return void open(...current.start);
      const line = (tx, ty) => [x, y, tx, ty, tx, ty];
      const segment =
        command === "C" ? a
        : command === "L" ? line(a[0], a[1])
        : command === "H" ? line(a[0], y)
        : command === "V" ? line(x, a[0])
        : command === "Q" ? [x + (2 / 3) * (a[0] - x), y + (2 / 3) * (a[1] - y), a[2] + (2 / 3) * (a[0] - a[2]), a[3] + (2 / 3) * (a[1] - a[3]), a[2], a[3]]
        : null;
      if (!segment) throw new Error(`Unhandled path command ${command}`);
      current.segments.push(segment);
    });
  return out.filter((sub) => sub.segments.length);
}

// Rive vertices: a point with in/out handles. The fill closes every subpath
// with a straight line, as SVG does, unless it already ends where it began.
function vertices({ start, segments }) {
  const list = [{ point: start, in: start, out: segments[0].slice(0, 2) }];
  segments.forEach((segment, index) => {
    const point = segment.slice(4, 6);
    const next = segments[index + 1];
    list.push({ point, in: segment.slice(2, 4), out: next ? next.slice(0, 2) : point });
  });
  const last = list.at(-1);
  if (Math.hypot(last.point[0] - start[0], last.point[1] - start[1]) < 1e-3) {
    list[0].in = last.in;
    list.pop();
  }
  return list;
}

/* ── Breathing ──────────────────────────────────────────── */

// One hedge's breath as keyframes: s is 0 at rest, 1 breathed in, and an
// eased key eases into the next one (the rest are held).
function timeline(start) {
  const frame = (seconds) => Math.round(seconds * FPS);
  const keys = [
    { frame: 0, s: 0 },
    { frame: frame(start), s: 0, eased: true },
    { frame: frame(start + INHALE), s: 1, eased: true },
    { frame: frame(start + INHALE + EXHALE), s: 0 },
    { frame: frame(CYCLE), s: 0 },
  ];
  if (keys[3].frame > keys[4].frame) throw new Error(`A breath starting at ${start}s overruns the loop`);
  // A breath that starts or ends with the loop shares its frame: keep the later key.
  return keys.filter((key, index) => key.frame !== keys[index + 1]?.frame);
}

/* ── Binary ─────────────────────────────────────────────── */

const bytes = [];
const write = {
  uint(value) {
    do {
      let byte = value & 0x7f;
      value = Math.floor(value / 128);
      if (value) byte |= 0x80;
      bytes.push(byte);
    } while (value);
  },
  float(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    bytes.push(...buffer);
  },
  color(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value);
    bytes.push(...buffer);
  },
  string(value) {
    const buffer = Buffer.from(value, "utf8");
    write.uint(buffer.length);
    bytes.push(...buffer);
  },
  bool(value) {
    bytes.push(value ? 1 : 0);
  },
};

// Type keys and property keys, from include/rive/generated in the runtime.
const TYPE = {
  artboard: 1, shape: 3, cubicDetachedVertex: 6, pointsPath: 16, solidColor: 18, fill: 20,
  backboard: 23, keyedObject: 25, keyedProperty: 26, cubicEaseInterpolator: 28,
  keyFrameDouble: 30, linearAnimation: 31, stateMachine: 53, stateMachineLayer: 57,
  animationState: 61, anyState: 62, entryState: 63, exitState: 64, stateTransition: 65,
};
const PROP = {
  name: [4, "string"], parentId: [5, "uint"], width: [7, "float"], height: [8, "float"],
  vertexX: [24, "float"], vertexY: [25, "float"], isClosed: [32, "bool"], colorValue: [37, "color"],
  objectId: [51, "uint"], propertyKey: [53, "uint"], animationName: [55, "string"],
  fps: [56, "uint"], duration: [57, "uint"], loopValue: [59, "uint"],
  x1: [63, "float"], y1: [64, "float"], x2: [65, "float"], y2: [66, "float"],
  frame: [67, "uint"], interpolationType: [68, "uint"], interpolatorId: [69, "uint"], value: [70, "float"],
  inRotation: [84, "float"], inDistance: [85, "float"], outRotation: [86, "float"], outDistance: [87, "float"],
  layerComponentName: [138, "string"], animationId: [149, "uint"], stateToId: [151, "uint"],
};

let slots = 0;
// Writes an object; returns its artboard index if it takes one.
function object(type, props = {}, { slot = false } = {}) {
  write.uint(TYPE[type]);
  for (const [name, value] of Object.entries(props)) {
    const [key, kind] = PROP[name];
    write.uint(key);
    write[kind](value);
  }
  write.uint(0);
  return slot ? ++slots : undefined;
}

/* ── File ───────────────────────────────────────────────── */

const groups = scenePaths().map((d) => subpaths(d).map((sub) => {
  const xs = sub.segments.map((segment) => segment[4]);
  const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
  const hedge = HEDGES.find((h) => centre >= h.from && centre <= h.to);
  if (!hedge) throw new Error(`No hedge for the subpath starting at ${sub.start}`);
  return { hedge, vertices: vertices(sub) };
}));
if (!groups.length) throw new Error("No hedge paths found in shop-scene.tsx");

for (const hedge of HEDGES) {
  const points = groups.flat().filter((sub) => sub.hedge === hedge).flatMap((sub) => sub.vertices.map((v) => v.point));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  Object.assign(hedge, {
    ground: Math.max(...ys),
    crown: Math.min(...ys),
    middle: (Math.min(...xs) + Math.max(...xs)) / 2,
    keys: timeline(hedge.start),
  });
}

// Where a vertex sits at the top of a breath, as an offset from rest.
function swell(hedge, [x, y]) {
  const height = hedge.ground - hedge.crown;
  const lift = (hedge.ground - y) / height;
  return [SPREAD * (x - hedge.middle) * lift, -RISE * height * lift];
}

const header = Buffer.from("RIVE", "ascii");
bytes.push(...header);
write.uint(7); // major version
write.uint(4); // minor version
write.uint(0); // file id
write.uint(0); // empty property table: every key here is one the runtime knows

object("backboard");
object("artboard", { name: "Hedges", width: BAND.width, height: BAND.height });

const animated = [];
const polar = (from, to) => {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  return [Math.atan2(dy, dx), Math.hypot(dx, dy)];
};
groups.forEach((subs, index) => {
  const shape = object("shape", { name: `hedge-${index}`, parentId: 0 }, { slot: true });
  const fill = object("fill", { parentId: shape }, { slot: true });
  object("solidColor", { parentId: fill, colorValue: COLOR }, { slot: true });
  for (const { hedge, vertices: list } of subs) {
    const path = object("pointsPath", { parentId: shape, isClosed: true }, { slot: true });
    for (const vertex of list) {
      const [inRotation, inDistance] = polar(vertex.point, vertex.in);
      const [outRotation, outDistance] = polar(vertex.point, vertex.out);
      const [x, y] = [vertex.point[0], vertex.point[1] - BAND.y];
      const id = object(
        "cubicDetachedVertex",
        { parentId: path, vertexX: x, vertexY: y, inRotation, inDistance, outRotation, outDistance },
        { slot: true },
      );
      animated.push({ id, hedge, rest: [x, y], offset: swell(hedge, vertex.point) });
    }
  }
});

const [x1, y1, x2, y2] = EASE;
const interpolator = object("cubicEaseInterpolator", { x1, y1, x2, y2 }, { slot: true });

object("linearAnimation", { animationName: "breathe", fps: FPS, duration: Math.round(CYCLE * FPS), loopValue: 1 });
let keyed = 0;
for (const { id, hedge, rest, offset } of animated) {
  // The ends sit on the ground and never move: no keys for them.
  const axes = [0, 1].filter((axis) => Math.abs(offset[axis]) > 0.005);
  if (!axes.length) continue;
  object("keyedObject", { objectId: id });
  for (const axis of axes) {
    object("keyedProperty", { propertyKey: PROP[axis ? "vertexY" : "vertexX"][0] });
    for (const key of hedge.keys) {
      object("keyFrameDouble", {
        frame: key.frame,
        interpolationType: key.eased ? 2 : 0,
        ...(key.eased && { interpolatorId: interpolator }),
        value: rest[axis] + offset[axis] * key.s,
      });
    }
  }
  keyed++;
}

// A state machine that only plays the breath, so the page can ask for it by
// name: the runtime's fallback to the first animation is deprecated.
object("stateMachine", { animationName: "breathing" });
object("stateMachineLayer", { layerComponentName: "breathe" });
object("entryState");
object("stateTransition", { stateToId: 3 });
object("anyState");
object("exitState");
object("animationState", { animationId: 0 });

writeFileSync(join(root, "public/hero/hedges.riv"), Buffer.from(bytes));
console.log(
  `public/hero/hedges.riv: ${groups.flat().length} subpaths, ${animated.length} vertices (${keyed} keyed), ` +
    `${(bytes.length / 1024).toFixed(1)} KB`,
);
